import type RAPIER from '@dimforge/rapier3d-compat';
import { COMBAT } from '../config/combat';
import { MOVEMENT } from '../config/movement';
import { closestPointOnSegment, rayCapsuleDistance } from '../math/sweep';
import { vec3, type Vec3 } from '../math/vec';
import { SWING_QUERY } from '../physics/collisionGroups';
import type { PhysicsWorld, Rapier } from '../physics/staticWorld';

/**
 * Where a swing lands (ARCHITECTURE §5.4 step 4).
 *
 * The arc is modelled as a sphere swept from the attacker's eyes along their
 * look direction. A true swept arc would be prettier and would change nothing
 * a player could perceive at 2.2 m; what matters is that the hull is wide
 * enough to forgive aim the player cannot see exactly, and that a miss still
 * reads as a miss.
 *
 * **This never changes the physics world.** The room and the structures
 * standing in it are found with a read-only shape cast; capsule targets —
 * players and dummies — are tested in arithmetic (`math/sweep`). The first
 * draft gave each target a stand-in collider and stepped the world so the
 * broad phase could see it, which is the obvious implementation and a
 * prediction bug: `world.step()` alone shifts the character controller's next
 * result by a fraction of a millimetre, the client never steps for a swing it
 * did not resolve, and the two then disagree about where the player stands.
 * The prediction suite caught it; the comment is here so it is not rebuilt.
 *
 * Targets arrive **already rewound** (plan decision 3). This module cannot
 * read anybody's current position, which is what keeps lag compensation
 * honest: the only world it can see is the one it is given.
 */

export type SwingTargetKind = 'player' | 'structure' | 'dummy';

export interface SwingTarget {
  readonly kind: SwingTargetKind;
  readonly id: number;
}

export interface SwingHit extends SwingTarget {
  /** Metres from the attacker's eye to the contact point. */
  readonly distance: number;
  /** Where the blade met it, in world space. The impact VFX hangs off this. */
  readonly point: Vec3;
}

/** A standing capsule a swing may hit: a rewound player, or a dummy. */
export interface CapsuleTarget extends SwingTarget {
  /** Feet position — for a player, at the rewound tick. */
  readonly feet: Vec3;
  readonly height: number;
  readonly radius: number;
}

export interface SwingSource {
  /** The attacker's eyes. */
  readonly origin: Vec3;
  /** Unit look vector; see `lookDirection`. */
  readonly direction: Vec3;
  /** Metres from the eye to the furthest surface the blade can touch. */
  readonly reach: number;
}

export interface SwingWorld {
  readonly rapier: Rapier;
  readonly world: PhysicsWorld;
  /**
   * Drawn structures by collider handle. Anything the cast finds that is not
   * in here is the room itself — a wall takes the blow and nothing is damaged.
   */
  readonly structures: ReadonlyMap<number, number>;
}

const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 };

/** A rewound player as a capsule target. */
export function playerTarget(id: number, feet: Vec3, crouching: boolean): CapsuleTarget {
  const { capsule } = MOVEMENT;
  return {
    kind: 'player',
    id,
    feet,
    height: crouching ? capsule.crouchingHeight : capsule.standingHeight,
    radius: capsule.radius,
  };
}

/** A standing training dummy as a capsule target. */
export function dummyTarget(id: number, feet: Vec3): CapsuleTarget {
  return { kind: 'dummy', id, feet, height: COMBAT.dummy.height, radius: COMBAT.dummy.radius };
}

/**
 * The nearest thing the swing reaches, or nothing. One swing, one victim
 * (plan decision 5): the closest candidate takes the blow and the blade stops
 * there, which is both readable and the only way durability means anything.
 */
export function castSwing(
  swingWorld: SwingWorld,
  source: SwingSource,
  capsules: readonly CapsuleTarget[] = [],
): SwingHit | undefined {
  // The hull's own radius comes off the sweep, so `reach` is the distance to
  // the furthest surface the blade touches rather than the distance its
  // centre travels.
  const sweep = Math.max(0, source.reach - COMBAT.arcRadius);

  let best: SwingHit | undefined;
  let bestSweep = Number.POSITIVE_INFINITY;

  // The room and what players drew in it. Read-only: `castShape` asks the
  // world a question and changes nothing about it.
  const solid = swingWorld.world.castShape(
    source.origin,
    IDENTITY_ROTATION,
    source.direction,
    new swingWorld.rapier.Ball(COMBAT.arcRadius),
    0,
    sweep,
    true,
    undefined,
    SWING_QUERY,
  );
  if (solid) {
    bestSweep = solid.time_of_impact;
    const structureId = swingWorld.structures.get(solid.collider.handle);
    best =
      structureId === undefined
        ? undefined // the room took it, and it stops the blade going further
        : {
            kind: 'structure',
            id: structureId,
            distance: distanceFrom(source.origin, solid.witness1),
            point: vec3(solid.witness1.x, solid.witness1.y, solid.witness1.z),
          };
  }

  for (const capsule of capsules) {
    const a = vec3(capsule.feet.x, capsule.feet.y + capsule.radius, capsule.feet.z);
    const b = vec3(capsule.feet.x, capsule.feet.y + capsule.height - capsule.radius, capsule.feet.z);
    const travelled = rayCapsuleDistance(
      source.origin,
      source.direction,
      sweep,
      a,
      b,
      capsule.radius + COMBAT.arcRadius,
    );
    // `>=` keeps whatever was found first when two things are the same
    // distance away: a wall flush against a target shields it.
    if (travelled === undefined || travelled >= bestSweep) continue;
    bestSweep = travelled;
    const point = capsuleContact(source, travelled, a, b, capsule.radius);
    best = {
      kind: capsule.kind,
      id: capsule.id,
      distance: distanceFrom(source.origin, point),
      point,
    };
  }

  return best;
}

/** Where the hull touched the capsule: on its surface, facing the blade. */
function capsuleContact(
  source: SwingSource,
  travelled: number,
  a: Vec3,
  b: Vec3,
  radius: number,
): Vec3 {
  const hull = vec3(
    source.origin.x + source.direction.x * travelled,
    source.origin.y + source.direction.y * travelled,
    source.origin.z + source.direction.z * travelled,
  );
  const axis = closestPointOnSegment(hull, a, b);
  const dx = hull.x - axis.x;
  const dy = hull.y - axis.y;
  const dz = hull.z - axis.z;
  const length = Math.hypot(dx, dy, dz);
  if (length === 0) return hull;
  return vec3(
    axis.x + (dx / length) * radius,
    axis.y + (dy / length) * radius,
    axis.z + (dz / length) * radius,
  );
}

function distanceFrom(origin: Vec3, point: RAPIER.Vector | Vec3): number {
  return Math.hypot(point.x - origin.x, point.y - origin.y, point.z - origin.z);
}
