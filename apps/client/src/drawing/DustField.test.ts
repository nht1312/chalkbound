import { describe, expect, it } from 'vitest';
import { DustField, type DustConfig } from './DustField';

const config: DustConfig = {
  maxParticles: 64,
  emitRate: 90,
  fullSpeed: 0.6,
  lifeSeconds: 0.5,
  gravity: 0.35,
  scatter: 0.05,
};

const CURSOR = { x: 0.1, y: 0.2 };
/** Deterministic "random": always the midpoint, so scatter cancels out. */
const centred = (): number => 0.5;

const field = (): DustField => new DustField(config);

describe('DustField emission rate', () => {
  it('emits nothing while the chalk is off the plane', () => {
    const dust = field();
    expect(dust.update(CURSOR, config.fullSpeed, false, 1, centred)).toBe(0);
    expect(dust.aliveCount).toBe(0);
  });

  it('emits nothing from a cursor that is not moving', () => {
    expect(field().update(CURSOR, 0, true, 1, centred)).toBe(0);
  });

  it('emits at the configured rate at full speed', () => {
    const dust = field();
    // A tenth of a second at 90/s is 9 particles.
    expect(dust.update(CURSOR, config.fullSpeed, true, 0.1, centred)).toBe(9);
  });

  it('scales emission with cursor speed', () => {
    const half = field().update(CURSOR, config.fullSpeed / 2, true, 0.2, centred);
    const full = field().update(CURSOR, config.fullSpeed, true, 0.2, centred);
    expect(half).toBe(9);
    expect(full).toBe(18);
  });

  it('does not emit faster than the rate above full speed', () => {
    expect(field().update(CURSOR, config.fullSpeed * 20, true, 0.1, centred)).toBe(9);
  });

  it('carries the fraction across frames instead of rounding it away', () => {
    const dust = field();
    // 1/60 s at 90/s is 1.5 particles: 1, then 2, never a steady 1.
    const counts = Array.from({ length: 4 }, () =>
      dust.update(CURSOR, config.fullSpeed, true, 1 / 60, centred),
    );
    expect(counts.reduce((a, b) => a + b, 0)).toBe(6);
    expect(counts).not.toEqual([1, 1, 1, 1]);
  });

  it('forgets the carried fraction when the chalk lifts', () => {
    const dust = field();
    dust.update(CURSOR, config.fullSpeed, true, 1 / 90 / 2, centred); // half a particle
    dust.update(CURSOR, config.fullSpeed, false, 0.5, centred);
    // The stored half must not make the next stroke emit early.
    expect(dust.update(CURSOR, config.fullSpeed, true, 1 / 90 / 2, centred)).toBe(0);
  });

  it('never exceeds its pool', () => {
    const dust = field();
    dust.update(CURSOR, config.fullSpeed, true, 10, centred);
    expect(dust.aliveCount).toBeLessThanOrEqual(config.maxParticles);
  });
});

describe('DustField particles', () => {
  it('starts each particle at the cursor', () => {
    const dust = field();
    dust.update(CURSOR, config.fullSpeed, true, 0.1, centred);
    const first = dust.particles[0];
    expect(first?.x).toBeCloseTo(CURSOR.x, 9);
    expect(first?.y).toBeCloseTo(CURSOR.y, 9);
  });

  it('scatters particles off the cursor rather than stacking them', () => {
    const dust = field();
    let seed = 0;
    const varied = (): number => {
      seed += 0.37;
      return seed % 1;
    };
    dust.update(CURSOR, config.fullSpeed, true, 0.2, varied);
    // The scatter is in velocity: they all leave the tip, then spread.
    const vxs = dust.particles.slice(0, dust.aliveCount).map((p) => p.vx);
    expect(Math.max(...vxs) - Math.min(...vxs)).toBeGreaterThan(0);

    dust.update(CURSOR, 0, false, 0.05, centred);
    const xs = dust.particles.slice(0, dust.aliveCount).map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0);
  });

  it('pulls the dust downward, because it is falling chalk', () => {
    const dust = field();
    dust.update(CURSOR, config.fullSpeed, true, 0.05, centred);
    const startY = dust.particles[0]?.y ?? 0;
    for (let i = 0; i < 5; i++) dust.update(CURSOR, 0, false, 0.02, centred);
    expect(dust.particles[0]?.y ?? 0).toBeLessThan(startY);
  });

  it('retires a particle once its life is spent', () => {
    const dust = field();
    dust.update(CURSOR, config.fullSpeed, true, 0.05, centred);
    expect(dust.aliveCount).toBeGreaterThan(0);
    dust.update(CURSOR, 0, false, config.lifeSeconds + 0.01, centred);
    expect(dust.aliveCount).toBe(0);
  });

  it('keeps the living particles contiguous, so the renderer can draw a range', () => {
    const dust = field();
    const batchA = dust.update(CURSOR, config.fullSpeed, true, 0.1, centred);
    dust.update(CURSOR, 0, false, config.lifeSeconds * 0.3, centred);
    const batchB = dust.update(CURSOR, config.fullSpeed, true, 0.1, centred);
    expect(dust.aliveCount).toBe(batchA + batchB);

    // Enough time for the older batch to expire and the younger to survive:
    // the survivors must end up packed at the front.
    dust.update(CURSOR, 0, false, config.lifeSeconds * 0.75, centred);
    expect(dust.aliveCount).toBe(batchB);
    for (let i = 0; i < dust.aliveCount; i++) {
      expect(dust.particles[i]?.age ?? Number.POSITIVE_INFINITY).toBeLessThan(config.lifeSeconds);
    }
  });

  it('fades a particle out over its life', () => {
    const dust = field();
    dust.update(CURSOR, config.fullSpeed, true, 0.05, centred);
    const fresh = dust.particles[0]?.alpha ?? 0;
    dust.update(CURSOR, 0, false, config.lifeSeconds * 0.5, centred);
    const older = dust.particles[0]?.alpha ?? 0;
    expect(fresh).toBeGreaterThan(0);
    expect(older).toBeLessThan(fresh);
  });

  it('clears everything on demand, so a cancelled drawing leaves no dust', () => {
    const dust = field();
    dust.update(CURSOR, config.fullSpeed, true, 0.2, centred);
    dust.clear();
    expect(dust.aliveCount).toBe(0);
  });
});
