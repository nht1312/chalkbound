import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { vec3 } from '../math/vec';
import type { DrawnStructure } from '../drawing/drawnObject';
import { DRAWN_GROUPS, PLAYER_MOVEMENT_QUERY } from './collisionGroups';
import { addDrawnCollider, removeDrawnCollider } from './drawnColliders';
import { createStaticWorld } from './staticWorld';

beforeAll(async () => {
  await RAPIER.init();
});

const structure = (yaw: number): DrawnStructure => ({
  kind: 'structure',
  id: 1,
  blueprintId: 'wall',
  asset: 'CB_DRAWN_Wall_A',
  quality: 'sound',
  accuracy: 0.8,
  transform: { position: vec3(2, 1.25, -3), yaw },
  halfExtents: vec3(1, 1.25, 0.1),
  solidFromTick: 5,
  drawnBy: 1,
  health: 60,
  maxHealth: 60,
});

describe('drawn colliders', () => {
  it('puts the collider where the structure says it is', () => {
    const world = createStaticWorld(RAPIER, []);
    const collider = addDrawnCollider(RAPIER, world, structure(0));
    const at = collider.translation();
    expect(at.x).toBeCloseTo(2, 6);
    expect(at.y).toBeCloseTo(1.25, 6);
    expect(at.z).toBeCloseTo(-3, 6);
    world.free();
  });

  it('turns it to the structure’s yaw', () => {
    const world = createStaticWorld(RAPIER, []);
    const collider = addDrawnCollider(RAPIER, world, structure(Math.PI / 2));
    const q = collider.rotation();
    expect(q.y).toBeCloseTo(Math.sin(Math.PI / 4), 6);
    expect(q.w).toBeCloseTo(Math.cos(Math.PI / 4), 6);
    world.free();
  });

  /**
   * The point of the exercise: a player's movement query must see drawn
   * geometry exactly as it sees the level. If it does not, the client
   * predicts straight through a wall the server knows about (R-03).
   */
  it('is visible to the same query that sees the level', () => {
    const world = createStaticWorld(RAPIER, []);
    const collider = addDrawnCollider(RAPIER, world, structure(0));
    const groups = collider.collisionGroups();
    expect(groups).toBe(DRAWN_GROUPS);
    // The player's filter half must include the drawn membership half.
    const membership = (DRAWN_GROUPS >>> 16) & 0xffff;
    expect(PLAYER_MOVEMENT_QUERY & membership).toBeGreaterThan(0);
    world.free();
  });

  it('takes the collider back out of the world again', () => {
    const world = createStaticWorld(RAPIER, []);
    const before = world.colliders.len();
    const collider = addDrawnCollider(RAPIER, world, structure(0));
    expect(world.colliders.len()).toBe(before + 1);
    removeDrawnCollider(world, collider);
    expect(world.colliders.len()).toBe(before);
    world.free();
  });
});
