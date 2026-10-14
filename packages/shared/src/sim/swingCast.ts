import type RAPIER from '@dimforge/rapier3d-compat';
import { COMBAT } from '../config/combat';
import { MOVEMENT } from '../config/movement';
import { vec3, type Vec3 } from '../math/vec';
import { HITTABLE_GROUPS, SWING_QUERY } from '../physics/collisionGroups';
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
 * Targets are passed in **already rewound** (plan decision 3). This module
 * never reads anybody's current position, which is what keeps lag
 * compensation honest: the only world it can see is the one it is given.
 *
 * Rewound players are represented by stand-in colliders created for the
 * duration of one cast. That is a few colliders per swing, perhaps twice a
 * second per player, in exchange for the level's geometry, drawn structures
 * and player capsules all being tested by one query with one notion of
 * "nearest" — rather than three hand-rolled intersection routines that have
 * to agree with Rapier and with each other.
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

/** A player as they were when the attacker swung — never as they are now. */
export interface RewoundPlayer {
  readonly id: number;
  /** Feet position at the rewound tick. */
  readonly feet: Vec3;
  readonly crouching: boolean;
}

export interface SwingSource {
  /** The attacker's eyes. */
  readonly origin: Vec3;
  /** Unit look vector; see `lookDirection`. */
  readonly direction: Vec3;
  /** Metres from the eye to the furthest surface the blade can touch. */
  readonly reach: number;
  /** The attacker's own capsule, so a swing never lands on the swinger. */
  readonly exclude?: RAPIER.Collider;
}

export interface SwingWorld {
  readonly rapier: Rapier;
  readonly world: PhysicsWorld;
  /**
   * Standing colliders a swing may hit, by collider handle: drawn structures
   * and the training dummy. Anything hit that is *not* in here is the room
   * itself — a wall takes the blow and nothing takes damage.
   */
  readonly colliderTargets: ReadonlyMap<number, SwingTarget>;
}

const IDENTITY_ROTATION = { x: 0, y: 0, z: 0, w: 1 };
const { capsule } = MOVEMENT;

/** Rapier capsules are sized by the half-height of the cylinder between the caps. */
const capsuleHalfHeight = (totalHeight: number): number => totalHeight / 2 - capsule.radius;

export function castSwing(
  swingWorld: SwingWorld,
  source: SwingSource,
  rewound: readonly RewoundPlayer[] = [],
): SwingHit | undefined {
  const { rapier, world, colliderTargets } = swingWorld;
  const standIns: RAPIER.Collider[] = [];
  const targets = new Map(colliderTargets);

  for (const player of rewound) {
    const height = player.crouching ? capsule.crouchingHeight : capsule.standingHeight;
    const collider = world.createCollider(
      rapier.ColliderDesc.capsule(capsuleHalfHeight(height), capsule.radius)
        .setTranslation(player.feet.x, player.feet.y + height / 2, player.feet.z)
        .setCollisionGroups(HITTABLE_GROUPS),
    );
    standIns.push(collider);
    targets.set(collider.handle, { kind: 'player', id: player.id });
  }

  try {
    // Register the stand-ins with the broad phase, or the very next query
    // cannot see them (the same reason `addDrawnCollider` steps).
    if (standIns.length > 0) world.step();

    // The sphere's own radius is taken off the sweep, so `reach` means the
    // distance to the furthest surface the blade touches rather than the
    // distance travelled by its centre.
    const sweep = Math.max(0, source.reach - COMBAT.arcRadius);
    const hit = world.castShape(
      source.origin,
      IDENTITY_ROTATION,
      source.direction,
      new rapier.Ball(COMBAT.arcRadius),
      0,
      sweep,
      true,
      undefined,
      SWING_QUERY,
      source.exclude,
    );
    if (!hit) return undefined;

    const target = targets.get(hit.collider.handle);
    // The room took it. A swing into a wall is a miss, not a hit on nothing:
    // it still costs stamina, and it still must not reach what is behind it.
    if (!target) return undefined;

    const point = contactPoint(hit);
    return {
      kind: target.kind,
      id: target.id,
      distance: Math.hypot(
        point.x - source.origin.x,
        point.y - source.origin.y,
        point.z - source.origin.z,
      ),
      point,
    };
  } finally {
    for (const collider of standIns) world.removeCollider(collider, false);
    if (standIns.length > 0) world.step();
  }
}

/**
 * Where the sphere touched, in world space.
 *
 * Rapier documents `witness1` as a local-space point on the first shape; for
 * a cast through `World.castShape` it arrives already in world space, which
 * a test pins down by casting the same swing from two different places.
 */
function contactPoint(hit: RAPIER.ColliderShapeCastHit): Vec3 {
  return vec3(hit.witness1.x, hit.witness1.y, hit.witness1.z);
}
