import { describe, expect, it } from 'vitest';
import { advanceFixedTimestep, FixedStepRunner, type FixedTimestepConfig } from './fixedTimestep';

const config: FixedTimestepConfig = { stepSeconds: 0.01, maxFrameDelta: 0.25, maxStepsPerFrame: 8 };

describe('advanceFixedTimestep', () => {
  it('runs no steps when less than one step has accumulated', () => {
    const r = advanceFixedTimestep(0, 0.004, config);
    expect(r.steps).toBe(0);
    expect(r.accumulator).toBeCloseTo(0.004);
    expect(r.alpha).toBeCloseTo(0.4);
  });

  it('runs whole steps and carries the remainder', () => {
    const r = advanceFixedTimestep(0.002, 0.025, config);
    expect(r.steps).toBe(2);
    expect(r.accumulator).toBeCloseTo(0.007);
  });

  it('clamps huge frame deltas and caps steps per frame', () => {
    const r = advanceFixedTimestep(0, 10, config);
    expect(r.steps).toBe(config.maxStepsPerFrame);
    expect(r.accumulator).toBe(0);
    expect(r.alpha).toBe(0);
  });

  it('ignores negative deltas', () => {
    const r = advanceFixedTimestep(0.005, -1, config);
    expect(r.steps).toBe(0);
    expect(r.accumulator).toBeCloseTo(0.005);
  });

  it('keeps alpha in [0, 1)', () => {
    let acc = 0;
    for (let i = 0; i < 1000; i++) {
      const r = advanceFixedTimestep(acc, 0.0167, config);
      expect(r.alpha).toBeGreaterThanOrEqual(0);
      expect(r.alpha).toBeLessThan(1);
      acc = r.accumulator;
    }
  });
});

describe('FixedStepRunner', () => {
  it('produces the correct step count under variable frame times', () => {
    let steps = 0;
    const runner = new FixedStepRunner(config, () => steps++);
    // 1 second of wildly varying frames (2 ms to 40 ms).
    const frames = [0.002, 0.04, 0.016, 0.033, 0.009, 0.017, 0.025, 0.008];
    let elapsed = 0;
    for (let i = 0; elapsed < 1; i++) {
      const dt = frames[i % frames.length] ?? 0.016;
      runner.advance(dt);
      elapsed += dt;
    }
    expect(Math.abs(steps - elapsed / config.stepSeconds)).toBeLessThanOrEqual(1);
  });
});
