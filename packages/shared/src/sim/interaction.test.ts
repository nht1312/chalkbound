import { describe, expect, it } from 'vitest';
import { INTERACTION } from '../config/interaction';
import { MOVEMENT } from '../config/movement';
import { vec3 } from '../math/vec';
import { eyePosition, withinInteractRange } from './interaction';
import { initialPlayerState, type PlayerState } from './stepPlayer';

const standing = initialPlayerState(vec3(0, 0, 0));
const crouched: PlayerState = { ...standing, crouching: true };

describe('eyePosition', () => {
  it('sits at the standing or crouching eye height above the feet', () => {
    expect(eyePosition(standing).y).toBeCloseTo(standing.position.y + MOVEMENT.eyeHeight.standing);
    expect(eyePosition(crouched).y).toBeCloseTo(standing.position.y + MOVEMENT.eyeHeight.crouching);
  });
});

describe('withinInteractRange', () => {
  const eye = eyePosition(standing);

  it('accepts a target at exactly the interact range from the eyes', () => {
    expect(withinInteractRange(standing, vec3(eye.x, eye.y, eye.z - INTERACTION.range))).toBe(true);
  });

  it('rejects a target just beyond the range', () => {
    expect(
      withinInteractRange(standing, vec3(eye.x, eye.y, eye.z - INTERACTION.range - 0.01)),
    ).toBe(false);
  });

  it('measures in 3D: a box on the floor counts its vertical distance too', () => {
    // 1.9 m horizontally, but ~1.6 m below the eyes: ~2.5 m away.
    expect(withinInteractRange(standing, vec3(0, 0.05, -1.9))).toBe(false);
  });

  it('crouching brings the eyes closer to floor-level targets', () => {
    const floorBox = vec3(0, 0.05, -1.5);
    expect(withinInteractRange(standing, floorBox)).toBe(false);
    expect(withinInteractRange(crouched, floorBox)).toBe(true);
  });
});
