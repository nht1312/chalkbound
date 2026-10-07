import type RAPIER from '@dimforge/rapier3d-compat';
import { PHYSICS } from '../config/physics';
import type { StaticBox } from '../world/greyboxRoom';

/** The initialised Rapier module. Callers own loading (`await RAPIER.init()`). */
export type Rapier = typeof RAPIER;
export type PhysicsWorld = RAPIER.World;

/**
 * Builds a Rapier world containing one fixed cuboid collider per level box.
 * Used identically by client prediction and the server world of record.
 */
export function createStaticWorld(rapier: Rapier, boxes: readonly StaticBox[]): PhysicsWorld {
  const world = new rapier.World(PHYSICS.gravity);
  for (const box of boxes) {
    const { center: c, halfExtents: h } = box;
    world.createCollider(rapier.ColliderDesc.cuboid(h.x, h.y, h.z).setTranslation(c.x, c.y, c.z));
  }
  // One step registers the colliders with the broad phase so ray/shape casts see them.
  world.step();
  return world;
}
