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

let rapierLoading: Promise<Rapier> | undefined;

/**
 * Lazy-loads and initialises Rapier once (SPEC_AUDIT R-06). The dynamic
 * import keeps the WASM module out of the initial bundle.
 */
export function loadRapier(): Promise<Rapier> {
  rapierLoading ??= import('@dimforge/rapier3d-compat').then(async ({ default: rapier }) => {
    await rapier.init();
    return rapier;
  });
  return rapierLoading;
}

/** Loads Rapier and builds the client's own static level colliders. */
export async function loadPhysics(level: LevelData): Promise<ClientPhysics> {
  const start = performance.now();
  const rapier = await loadRapier();
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
