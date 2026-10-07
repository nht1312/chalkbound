import { describe, expect, it } from 'vitest';
import { createGreyboxRoom } from './greyboxRoom';

const U16_MAX = 0xffff;

describe('greybox room chalk boxes', () => {
  const level = createGreyboxRoom();
  const floor = level.boxes.find((b) => b.kind === 'floor');

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

  it('places every chalk box inside the room, above the floor', () => {
    if (!floor) throw new Error('no floor');
    for (const { position: p } of level.chalkBoxes) {
      expect(Math.abs(p.x)).toBeLessThan(floor.halfExtents.x);
      expect(Math.abs(p.z)).toBeLessThan(floor.halfExtents.z);
      expect(p.y).toBeGreaterThan(0);
    }
  });
});
