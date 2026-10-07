import { describe, expect, it } from 'vitest';
import {
  bobOffset,
  initialCameraFeel,
  updateCameraFeel,
  type CameraFeelConfig,
  type CameraFeelState,
  type MovementSample,
} from './cameraFeel';

const config: CameraFeelConfig = {
  standingEyeHeight: 1.65,
  crouchingEyeHeight: 1.05,
  eyeHeightSmoothing: 0.08,
  baseFov: 75,
  sprintFovBoost: 8,
  fovSmoothing: 0.15,
  bob: {
    strideLength: 1.4,
    amplitudeY: 0.035,
    amplitudeX: 0.02,
    blendSmoothing: 0.1,
    minSpeed: 0.3,
    referenceSpeed: 2.8,
  },
};

const DT = 1 / 60;
const standingStill: MovementSample = {
  horizontalSpeed: 0,
  grounded: true,
  crouching: false,
  sprinting: false,
};
const walking: MovementSample = { ...standingStill, horizontalSpeed: 2.8 };

function run(state: CameraFeelState, sample: MovementSample, seconds: number): CameraFeelState {
  let s = state;
  for (let t = 0; t < seconds; t += DT) s = updateCameraFeel(s, sample, DT, config);
  return s;
}

describe('eye height', () => {
  it('starts at standing height', () => {
    expect(initialCameraFeel(config).eyeHeight).toBe(config.standingEyeHeight);
  });

  it('lowers smoothly to crouch height without overshooting', () => {
    let s = initialCameraFeel(config);
    const crouch = { ...standingStill, crouching: true };
    s = updateCameraFeel(s, crouch, DT, config);
    expect(s.eyeHeight).toBeLessThan(config.standingEyeHeight);
    expect(s.eyeHeight).toBeGreaterThan(config.crouchingEyeHeight + 0.4); // not a snap
    for (let i = 0; i < 60; i++) {
      s = updateCameraFeel(s, crouch, DT, config);
      expect(s.eyeHeight).toBeGreaterThanOrEqual(config.crouchingEyeHeight);
    }
    expect(s.eyeHeight).toBeCloseTo(config.crouchingEyeHeight, 3);
  });

  it('rises back when standing', () => {
    const crouched = run(initialCameraFeel(config), { ...standingStill, crouching: true }, 1);
    expect(run(crouched, standingStill, 1).eyeHeight).toBeCloseTo(config.standingEyeHeight, 3);
  });
});

describe('sprint FOV', () => {
  it('widens toward base + boost while sprinting and returns afterwards', () => {
    const sprinting = run(initialCameraFeel(config), { ...walking, sprinting: true }, 1.5);
    expect(sprinting.fov).toBeCloseTo(config.baseFov + config.sprintFovBoost, 1);
    expect(run(sprinting, walking, 1.5).fov).toBeCloseTo(config.baseFov, 1);
  });

  it('never exceeds base + boost', () => {
    let s = initialCameraFeel(config);
    for (let i = 0; i < 300; i++) {
      s = updateCameraFeel(s, { ...walking, sprinting: true }, DT, config);
      expect(s.fov).toBeLessThanOrEqual(config.baseFov + config.sprintFovBoost + 1e-9);
    }
  });
});

describe('view bob', () => {
  it('is zero when standing still', () => {
    const s = run(initialCameraFeel(config), standingStill, 1);
    expect(bobOffset(s, config)).toEqual({ x: 0, y: 0 });
  });

  it('is zero in the air even when moving', () => {
    const s = run(initialCameraFeel(config), { ...walking, grounded: false }, 1);
    const b = bobOffset(s, config);
    expect(Math.abs(b.x) + Math.abs(b.y)).toBeLessThan(1e-6);
  });

  it('advances one full cycle per stride length travelled', () => {
    const start = run(initialCameraFeel(config), walking, 1);
    const seconds = config.bob.strideLength / walking.horizontalSpeed;
    let s = start;
    const steps = Math.round(seconds / DT);
    for (let i = 0; i < steps; i++) s = updateCameraFeel(s, walking, DT, config);
    expect(s.bobPhase - start.bobPhase).toBeCloseTo(2 * Math.PI, 1);
  });

  it('stays within its amplitude while walking', () => {
    let s = initialCameraFeel(config);
    let maxY = 0;
    for (let i = 0; i < 300; i++) {
      s = updateCameraFeel(s, walking, DT, config);
      const b = bobOffset(s, config);
      maxY = Math.max(maxY, Math.abs(b.y));
      expect(Math.abs(b.x)).toBeLessThanOrEqual(config.bob.amplitudeX + 1e-9);
      expect(Math.abs(b.y)).toBeLessThanOrEqual(config.bob.amplitudeY + 1e-9);
    }
    expect(maxY).toBeGreaterThan(config.bob.amplitudeY * 0.9); // it actually bobs
  });

  it('fades out rather than stopping abruptly', () => {
    const moving = run(initialCameraFeel(config), walking, 1);
    expect(updateCameraFeel(moving, standingStill, DT, config).bobAmount).toBeGreaterThan(0.5);
  });
});
