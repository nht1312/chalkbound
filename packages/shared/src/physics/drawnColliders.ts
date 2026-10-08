import type RAPIER from '@dimforge/rapier3d-compat';
import type { DrawnStructure } from '../drawing/drawnObject';
import { DRAWN_GROUPS } from './collisionGroups';
import type { PhysicsWorld, Rapier } from './staticWorld';

/**
 * Colliders for structures players drew (SPEC_AUDIT R-03).
 *
 * These are created and destroyed while the match runs, unlike the level's,
 * which exist for its whole life. Both sides build them from the same
 * `DrawnStructure`, so a wall is the same shape in the same place on the
 * client's prediction world and the server's world of record — which is the
 * only reason prediction can survive geometry appearing underneath it.
 */

/** Yaw about Y as a quaternion. A box is symmetric, so the sign of z is moot. */
function rotationFromYaw(yaw: number): RAPIER.Rotation {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

export function addDrawnCollider(
  rapier: Rapier,
  world: PhysicsWorld,
  structure: DrawnStructure,
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
