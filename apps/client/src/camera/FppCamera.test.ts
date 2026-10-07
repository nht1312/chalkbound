import { describe, expect, it } from 'vitest';
import { Object3D, Vector3 } from 'three';
import { FppCamera, wrapAngle } from './FppCamera';

const config = { sensitivity: 0.01, pitchLimit: 1.5 };

function forwardOf(cam: FppCamera): Vector3 {
  const obj = new Object3D();
  cam.applyTo(obj);
  return new Vector3(0, 0, -1).applyQuaternion(obj.quaternion);
}

describe('FppCamera', () => {
  it('clamps pitch to the configured limit', () => {
    const cam = new FppCamera(config);
    cam.applyMouseDelta(0, -10_000);
    expect(cam.pitch).toBe(config.pitchLimit);
    cam.applyMouseDelta(0, 10_000);
    expect(cam.pitch).toBe(-config.pitchLimit);
  });

  it('keeps yaw wrapped into [-PI, PI)', () => {
    const cam = new FppCamera(config);
    for (let i = 0; i < 100; i++) cam.applyMouseDelta(137, 0);
    expect(cam.yaw).toBeGreaterThanOrEqual(-Math.PI);
    expect(cam.yaw).toBeLessThan(Math.PI);
  });

  it('turns right when the mouse moves right', () => {
    const cam = new FppCamera(config);
    cam.applyMouseDelta(Math.PI / 2 / config.sensitivity, 0);
    const forward = forwardOf(cam);
    expect(forward.x).toBeCloseTo(1);
    expect(forward.z).toBeCloseTo(0);
  });

  it('applies a sensitivity change to subsequent movement', () => {
    const cam = new FppCamera(config);
    cam.setSensitivity(config.sensitivity * 2);
    cam.applyMouseDelta(10, 0);
    expect(cam.yaw).toBeCloseTo(-10 * config.sensitivity * 2);
  });

  it('looks up when the mouse moves up', () => {
    const cam = new FppCamera(config);
    cam.applyMouseDelta(0, -50);
    expect(forwardOf(cam).y).toBeGreaterThan(0);
  });
});

describe('wrapAngle', () => {
  it('wraps values outside [-PI, PI)', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(-Math.PI);
    expect(wrapAngle(-3 * Math.PI)).toBeCloseTo(-Math.PI);
    expect(wrapAngle(0.5)).toBeCloseTo(0.5);
  });
});
