import {
  createStaticWorld,
  type LevelData,
  type PhysicsWorld,
  type Rapier,
} from '@chalkbound/shared';

export interface ClientPhysics {
  readonly rapier: Rapier;
  readonly world: PhysicsWorld;
  /** Time from request to a ready world, in ms. */
  readonly loadMs: number;
}

/**
 * Lazy-loads Rapier after first paint (SPEC_AUDIT R-06) and builds the static
 * level colliders. The dynamic import keeps the ~2 MB WASM module out of the
 * initial bundle.
 */
export async function loadPhysics(level: LevelData): Promise<ClientPhysics> {
  const start = performance.now();
  const { default: rapier } = await import('@dimforge/rapier3d-compat');
  await rapier.init();
  const world = createStaticWorld(rapier, level.boxes);
  return { rapier, world, loadMs: performance.now() - start };
}

/** Distance from `origin` straight down to the nearest collider, if any. */
export function groundDistance(
  physics: ClientPhysics,
  origin: { x: number; y: number; z: number },
  maxDistance: number,
): number | undefined {
  const ray = new physics.rapier.Ray(origin, { x: 0, y: -1, z: 0 });
  return physics.world.castRay(ray, maxDistance, true)?.timeOfImpact;
}
