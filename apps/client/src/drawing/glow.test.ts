import { describe, expect, it } from 'vitest';
import { glowDuration, glowIntensity, type GlowConfig } from './glow';

const config: GlowConfig = { attackSeconds: 0.08, holdSeconds: 0.22, decaySeconds: 0.35 };

describe('glowIntensity', () => {
  it('is dark before the sketch is submitted', () => {
    expect(glowIntensity(-1, config)).toBe(0);
  });

  it('brightens over the attack', () => {
    expect(glowIntensity(0, config)).toBe(0);
    expect(glowIntensity(config.attackSeconds / 2, config)).toBeCloseTo(0.5, 6);
    expect(glowIntensity(config.attackSeconds, config)).toBe(1);
  });

  it('holds at full brightness while the verdict is in flight', () => {
    // The hold is what covers the authority round trip (SPEC_AUDIT R-03).
    expect(glowIntensity(config.attackSeconds + 0.01, config)).toBe(1);
    expect(glowIntensity(config.attackSeconds + config.holdSeconds, config)).toBe(1);
  });

  it('fades out over the decay', () => {
    const { attackSeconds: a, holdSeconds: h, decaySeconds: d } = config;
    expect(glowIntensity(a + h + d / 2, config)).toBeCloseTo(0.5, 6);
    expect(glowIntensity(a + h + d, config)).toBe(0);
  });

  it('stays dark afterwards', () => {
    expect(glowIntensity(glowDuration(config) + 1, config)).toBe(0);
  });

  it('never leaves the 0..1 range', () => {
    for (let t = -0.5; t < glowDuration(config) + 0.5; t += 0.005) {
      const value = glowIntensity(t, config);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('is dark for a nonsense elapsed time rather than NaN', () => {
    expect(glowIntensity(Number.NaN, config)).toBe(0);
  });

  it('holds long enough to cover a realistic round trip', () => {
    // A verdict at 150 ms RTT must still land while the sketch is lit.
    expect((config.attackSeconds + config.holdSeconds) * 1000).toBeGreaterThanOrEqual(150);
  });
});

describe('glowDuration', () => {
  it('is the whole envelope', () => {
    expect(glowDuration(config)).toBeCloseTo(
      config.attackSeconds + config.holdSeconds + config.decaySeconds,
      9,
    );
  });
});
