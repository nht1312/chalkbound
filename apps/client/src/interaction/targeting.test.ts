import { describe, expect, it } from 'vitest';
import { lookDirection, selectInteractTarget, type TargetCandidate } from './targeting';

const eye = { x: 0, y: 1.67, z: 0 };
const forward = lookDirection(0, 0); // yaw 0 faces -Z
const config = { range: 2, maxAngleRadians: (12 * Math.PI) / 180 };
const box = (id: number, x: number, y: number, z: number, remaining?: number): TargetCandidate => ({
  id,
  position: { x, y, z },
  remaining,
});

describe('lookDirection', () => {
  it('matches the camera convention: yaw 0 is -Z, positive pitch looks up', () => {
    expect(forward.z).toBeCloseTo(-1);
    expect(lookDirection(0, Math.PI / 4).y).toBeGreaterThan(0);
    expect(lookDirection(-Math.PI / 2, 0).x).toBeCloseTo(1);
  });
});

describe('selectInteractTarget', () => {
  it('picks a box straight ahead within reach', () => {
    expect(selectInteractTarget(eye, forward, [box(1, 0, 1.67, -1.5)], config)).toBe(1);
  });

  it('ignores a box beyond reach', () => {
    expect(selectInteractTarget(eye, forward, [box(1, 0, 1.67, -2.5)], config)).toBeUndefined();
  });

  it('ignores a box outside the aim cone', () => {
    expect(selectInteractTarget(eye, forward, [box(1, 1, 1.67, -1)], config)).toBeUndefined();
  });

  it('ignores empty boxes but treats unknown amounts as available', () => {
    expect(selectInteractTarget(eye, forward, [box(1, 0, 1.67, -1.5, 0)], config)).toBeUndefined();
    expect(selectInteractTarget(eye, forward, [box(1, 0, 1.67, -1.5, undefined)], config)).toBe(1);
  });

  it('prefers the box closest to the centre of view', () => {
    const offCentre = box(1, 0.2, 1.67, -1.5);
    const centred = box(2, 0.02, 1.67, -1.8);
    expect(selectInteractTarget(eye, forward, [offCentre, centred], config)).toBe(2);
  });

  it('finds a box on the floor when looking down at it', () => {
    const floorBox = box(3, 0, 0.05, -1);
    const lookingDown = lookDirection(0, Math.atan2(0.05 - eye.y, 1));
    expect(selectInteractTarget(eye, forward, [floorBox], config)).toBeUndefined();
    expect(selectInteractTarget(eye, lookingDown, [floorBox], config)).toBe(3);
  });
});
