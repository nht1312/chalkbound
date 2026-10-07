import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { createGreyboxRoom } from '../world/greyboxRoom';
import { createStaticWorld } from './staticWorld';

const EYE_HEIGHT = 1.65;
const MAX_RAY = 100;

beforeAll(async () => {
  await RAPIER.init();
});

function castFrom(
  world: RAPIER.World,
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
): number | undefined {
  return world.castRay(new RAPIER.Ray(origin, dir), MAX_RAY, true)?.timeOfImpact;
}

describe('createStaticWorld with the greybox room', () => {
  const level = createGreyboxRoom();

  it('creates one collider per level box', () => {
    const world = createStaticWorld(RAPIER, level.boxes);
    expect(world.colliders.len()).toBe(level.boxes.length);
    world.free();
  });

  it('puts the floor top at y = 0 under the spawn point', () => {
    const world = createStaticWorld(RAPIER, level.boxes);
    const eye = { x: level.spawn.x, y: EYE_HEIGHT, z: level.spawn.z };
    expect(castFrom(world, eye, { x: 0, y: -1, z: 0 })).toBeCloseTo(EYE_HEIGHT, 3);
    world.free();
  });

  it('encloses the spawn point: a ray in every horizontal direction hits a wall', () => {
    const world = createStaticWorld(RAPIER, level.boxes);
    const eye = { x: level.spawn.x, y: EYE_HEIGHT, z: level.spawn.z };
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      expect(castFrom(world, eye, { x: Math.cos(a), y: 0, z: Math.sin(a) })).toBeDefined();
    }
    world.free();
  });
});
