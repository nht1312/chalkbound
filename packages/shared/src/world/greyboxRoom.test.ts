import { describe, expect, it } from 'vitest';
import { createGreyboxRoom, FLOOR_GAP } from './greyboxRoom';

import { CREATION } from '../config/creation';
import { MOVEMENT } from '../config/movement';

const U16_MAX = 0xffff;

describe('greybox room chalk boxes', () => {
  const level = createGreyboxRoom();
  const floors = level.boxes.filter((b) => b.kind === 'floor');
  /** True when (x, z) has floor under it. */
  const overFloor = (x: number, z: number): boolean =>
    floors.some(
      (f) =>
        Math.abs(x - f.center.x) <= f.halfExtents.x && Math.abs(z - f.center.z) <= f.halfExtents.z,
    );

  it('has chalk boxes with unique ids that fit the u16 wire format', () => {
    const ids = level.chalkBoxes.map((b) => b.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThanOrEqual(1);
      expect(id).toBeLessThanOrEqual(U16_MAX);
    }
  });

  it('places every chalk box inside the room, above a floor and not the void', () => {
    expect(floors.length).toBeGreaterThan(0);
    for (const { position: p } of level.chalkBoxes) {
      expect(overFloor(p.x, p.z), `chalk box at ${p.x}, ${p.z} is over the gap`).toBe(true);
      expect(p.y).toBeGreaterThan(0);
    }
  });
});

/**
 * A bridge needs something to bridge (ROADMAP Phase 4). The room's floor is
 * split in two by a trench running its full width, which is the only piece of
 * the greybox that exists purely so a blueprint has a job.
 */
describe('the floor gap', () => {
  const level = createGreyboxRoom();
  const floors = level.boxes.filter((b) => b.kind === 'floor');
  const overFloor = (z: number): boolean =>
    floors.some((f) => Math.abs(z - f.center.z) <= f.halfExtents.z);

  it('splits the floor into two slabs with a void between them', () => {
    expect(floors).toHaveLength(2);
  });

  it('has nothing to stand on between its edges', () => {
    expect(overFloor(FLOOR_GAP.fromZ - 0.01)).toBe(true);
    expect(overFloor((FLOOR_GAP.fromZ + FLOOR_GAP.toZ) / 2)).toBe(false);
    expect(overFloor(FLOOR_GAP.toZ + 0.01)).toBe(true);
  });

  it('is narrow enough for one bridge to span, with room to spare', () => {
    const width = FLOOR_GAP.toZ - FLOOR_GAP.fromZ;
    expect(width).toBeGreaterThan(0);
    expect(width).toBeLessThan(CREATION.bridge.span);
  });

  it('leaves the far side wide enough to stand on', () => {
    const far = floors.find((f) => f.center.z < FLOOR_GAP.fromZ);
    expect(far?.halfExtents.z ?? 0).toBeGreaterThan(MOVEMENT.capsule.radius);
  });

  it('spawns the player on the near side, not in the void', () => {
    expect(overFloor(level.spawn.z)).toBe(true);
    expect(level.spawn.z).toBeGreaterThan(FLOOR_GAP.toZ);
  });

  it('keeps the gap clear of the desks, so the trench is the only hazard', () => {
    for (const desk of level.boxes.filter((b) => b.kind === 'desk')) {
      const near = desk.center.z - desk.halfExtents.z;
      const far = desk.center.z + desk.halfExtents.z;
      const overlaps = near < FLOOR_GAP.toZ && far > FLOOR_GAP.fromZ;
      expect(overlaps, `${desk.id} hangs over the gap`).toBe(false);
    }
  });
});
