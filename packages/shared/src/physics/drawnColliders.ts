import type RAPIER from '@dimforge/rapier3d-compat';
import type { DrawnTransform } from '../drawing/placement';
import type { Vec3 } from '../math/vec';
import { DRAWN_GROUPS } from './collisionGroups';
import type { PhysicsWorld, Rapier } from './staticWorld';

/**
 * Colliders for structures players drew (SPEC_AUDIT R-03).
 *
 * These are created and destroyed while the match runs, unlike the level's,
 * which exist for its whole life. Both sides call this same function, so a
 * wall is the same box in the same place in the client's prediction world and
 * the server's world of record — which is the only reason prediction can
 * survive geometry appearing underneath it.
 *
 * It takes only a transform and a size, rather than the authority's whole
 * `DrawnStructure`, because that is all a collider is: the client's view of a
 * structure carries neither health nor an author and has no business
 * inventing them to call this.
 */

/** The least a collider needs to know about a structure. */
export interface CollidableStructure {
  readonly transform: DrawnTransform;
  readonly halfExtents: Vec3;
}

/** Yaw about Y as a quaternion. A box is symmetric, so the sign of z is moot. */
function rotationFromYaw(yaw: number): RAPIER.Rotation {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

export function addDrawnCollider(
  rapier: Rapier,
  world: PhysicsWorld,
  structure: CollidableStructure,
): RAPIER.Collider {
  const { position, yaw } = structure.transform;
  const h = structure.halfExtents;
  const collider = world.createCollider(
    rapier.ColliderDesc.cuboid(h.x, h.y, h.z)
      .setTranslation(position.x, position.y, position.z)
      .setRotation(rotationFromYaw(yaw))
      .setCollisionGroups(DRAWN_GROUPS),
  );
  // Register it with the broad phase, so the very next movement query sees
  // it. Without this a player can walk through a wall for one tick.
  world.step();
  return collider;
}

export function removeDrawnCollider(world: PhysicsWorld, collider: RAPIER.Collider): void {
  world.removeCollider(collider, false);
  world.step();
}
