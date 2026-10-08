import { describe, expect, it } from 'vitest';
import { approachLevel, cursorSpeed, scratchFromSpeed, type ScratchConfig } from './chalkScratch';

const config: ScratchConfig = {
  minSpeed: 0.02,
  fullSpeed: 0.6,
  maxGain: 0.35,
  minRate: 0.7,
  maxRate: 1.6,
  smoothing: 0.05,
};

describe('cursorSpeed', () => {
  it('measures plane metres per second between two samples', () => {
    expect(cursorSpeed({ x: 0, y: 0 }, { x: 0.1, y: 0 }, 0.1)).toBeCloseTo(1, 9);
    expect(cursorSpeed({ x: 0, y: 0 }, { x: 0.03, y: 0.04 }, 0.1)).toBeCloseTo(0.5, 9);
  });

  it('is zero for a cursor that did not move', () => {
    expect(cursorSpeed({ x: 0.2, y: -0.1 }, { x: 0.2, y: -0.1 }, 0.016)).toBe(0);
  });

  it('refuses to divide by a zero or negative frame time', () => {
    expect(cursorSpeed({ x: 0, y: 0 }, { x: 0.1, y: 0 }, 0)).toBe(0);
    expect(cursorSpeed({ x: 0, y: 0 }, { x: 0.1, y: 0 }, -0.016)).toBe(0);
  });
});

describe('scratchFromSpeed', () => {
  it('is silent while the chalk is off the plane, however fast the cursor moves', () => {
    expect(scratchFromSpeed(10, false, config).gain).toBe(0);
  });

  it('is silent while the chalk rests on the plane without moving', () => {
    expect(scratchFromSpeed(0, true, config).gain).toBe(0);
    expect(scratchFromSpeed(config.minSpeed, true, config).gain).toBe(0);
  });

  it('reaches full volume at the configured speed and holds there', () => {
    expect(scratchFromSpeed(config.fullSpeed, true, config).gain).toBeCloseTo(config.maxGain, 9);
    expect(scratchFromSpeed(config.fullSpeed * 10, true, config).gain).toBeCloseTo(
      config.maxGain,
      9,
    );
  });

  it('gets louder as the hand moves faster', () => {
    const slow = scratchFromSpeed(0.1, true, config).gain;
    const medium = scratchFromSpeed(0.3, true, config).gain;
    const fast = scratchFromSpeed(0.5, true, config).gain;
    expect(slow).toBeGreaterThan(0);
    expect(medium).toBeGreaterThan(slow);
    expect(fast).toBeGreaterThan(medium);
  });

  it('raises the pitch with speed, between the configured rates', () => {
    expect(scratchFromSpeed(0, true, config).rate).toBeCloseTo(config.minRate, 9);
    expect(scratchFromSpeed(config.fullSpeed, true, config).rate).toBeCloseTo(config.maxRate, 9);
    const middle = scratchFromSpeed(config.fullSpeed / 2, true, config).rate;
    expect(middle).toBeGreaterThan(config.minRate);
    expect(middle).toBeLessThan(config.maxRate);
  });

  it('keeps the rate in range even when silent, so resuming never clicks', () => {
    const resting = scratchFromSpeed(0, false, config);
    expect(resting.rate).toBeGreaterThanOrEqual(config.minRate);
    expect(resting.rate).toBeLessThanOrEqual(config.maxRate);
  });

  it('treats a nonsense speed as silence rather than passing NaN to the mixer', () => {
    expect(scratchFromSpeed(Number.NaN, true, config).gain).toBe(0);
    expect(scratchFromSpeed(Number.NaN, true, config).rate).toBe(config.minRate);
  });
});

describe('approachLevel', () => {
  it('moves toward the target without overshooting it', () => {
    const next = approachLevel(0, 1, 0.016, config.smoothing);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(1);
  });

  it('converges on the target', () => {
    let value = 0;
    for (let i = 0; i < 200; i++) value = approachLevel(value, 1, 0.016, config.smoothing);
    expect(value).toBeCloseTo(1, 4);
  });

  it('falls as readily as it rises', () => {
    expect(approachLevel(1, 0, 0.016, config.smoothing)).toBeLessThan(1);
  });

  it('jumps straight to the target when there is no smoothing', () => {
    expect(approachLevel(0, 1, 0.016, 0)).toBe(1);
  });
});
