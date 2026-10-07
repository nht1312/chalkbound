import { describe, expect, it } from 'vitest';
import {
  handTransforms,
  initialHandRig,
  selectHandPose,
  updateHandRig,
  type HandRigConfig,
  type HandRigState,
  type MovementSample,
} from './handRig';

const config: HandRigConfig = {
  blendSmoothing: 0.12,
  minWalkSpeed: 0.3,
  breathing: { amplitude: 0.004, frequency: 0.25 },
  rest: { left: { x: -0.22, y: -0.24, z: -0.45 }, right: { x: 0.22, y: -0.24, z: -0.45 } },
  poses: {
    idle: { offset: { x: 0, y: 0, z: 0 }, pitch: 0, sway: 0.006 },
    walk: { offset: { x: 0, y: -0.01, z: 0 }, pitch: 0, sway: 0.012 },
    sprint: { offset: { x: 0, y: -0.06, z: 0.04 }, pitch: -0.35, sway: 0.03 },
  },
};

const DT = 1 / 60;
const still: MovementSample = { horizontalSpeed: 0, grounded: true, sprinting: false };
const walking: MovementSample = { ...still, horizontalSpeed: 2.8 };
const sprinting: MovementSample = { horizontalSpeed: 5.2, grounded: true, sprinting: true };

function run(state: HandRigState, sample: MovementSample, seconds: number): HandRigState {
  let s = state;
  for (let t = 0; t < seconds; t += DT) s = updateHandRig(s, sample, DT, config);
  return s;
}

const sum = (s: HandRigState): number => s.weights.idle + s.weights.walk + s.weights.sprint;

describe('selectHandPose', () => {
  it('picks idle, walk or sprint from movement', () => {
    expect(selectHandPose(still, config)).toBe('idle');
    expect(selectHandPose(walking, config)).toBe('walk');
    expect(selectHandPose(sprinting, config)).toBe('sprint');
  });

  it('holds idle in the air', () => {
    expect(selectHandPose({ ...sprinting, grounded: false }, config)).toBe('idle');
  });
});

describe('pose blending', () => {
  it('starts fully idle', () => {
    expect(initialHandRig().weights).toEqual({ idle: 1, walk: 0, sprint: 0 });
  });

  it('blends toward the new pose instead of snapping, keeping weights normalised', () => {
    let s = initialHandRig();
    s = updateHandRig(s, sprinting, DT, config);
    expect(s.weights.sprint).toBeGreaterThan(0);
    expect(s.weights.sprint).toBeLessThan(0.5);
    for (let i = 0; i < 120; i++) {
      s = updateHandRig(s, sprinting, DT, config);
      expect(sum(s)).toBeCloseTo(1, 9);
    }
    expect(s.weights.sprint).toBeCloseTo(1, 3);
  });
});

describe('handTransforms', () => {
  it('puts the hands at rest plus the idle offset when still', () => {
    const t = handTransforms(initialHandRig(), 0, config);
    expect(t.left).toEqual({ ...config.rest.left, pitch: 0 });
    expect(t.right).toEqual({ ...config.rest.right, pitch: 0 });
  });

  it('lowers and tilts the hands when sprinting', () => {
    const idle = handTransforms(initialHandRig(), 0, config);
    const sprint = handTransforms(run(initialHandRig(), sprinting, 2), 0, config);
    expect(sprint.right.y).toBeLessThan(idle.right.y - 0.03);
    expect(sprint.right.pitch).toBeLessThan(-0.3);
  });

  it('sways in sync with the stride, bounded by the pose amplitude', () => {
    const walkingRig = run(initialHandRig(), walking, 2);
    let maxSwayY = 0;
    for (let phase = 0; phase < Math.PI * 4; phase += 0.05) {
      const t = handTransforms(walkingRig, phase, config);
      const sway = Math.abs(t.right.y - (config.rest.right.y + config.poses.walk.offset.y));
      maxSwayY = Math.max(maxSwayY, sway);
    }
    expect(maxSwayY).toBeGreaterThan(config.poses.walk.sway * 0.8);
    expect(maxSwayY).toBeLessThanOrEqual(
      config.poses.walk.sway + config.breathing.amplitude + 1e-9,
    );
  });

  it('sways both hands sideways together, with the body', () => {
    const t = handTransforms(run(initialHandRig(), walking, 2), Math.PI / 2, config);
    const leftDx = t.left.x - config.rest.left.x;
    const rightDx = t.right.x - config.rest.right.x;
    expect(leftDx).toBeCloseTo(rightDx, 9); // both hands move the same way with the body
  });
});
