import { describe, expect, it } from 'vitest';
import { COMBAT } from '../config/combat';
import { FIXED_DT } from '../config/simulation';
import {
  advanceSwing,
  canStartSwing,
  IDLE_SWING,
  startSwing,
  SWING_SECONDS,
  swingProgress,
  type SwingState,
} from './swingState';

const WINDUP = COMBAT.swing.windupMs / 1000;
const ACTIVE = COMBAT.swing.activeMs / 1000;

/** Steps a swing at the simulation rate, reporting where the hit landed. */
function stepToActive(swing: SwingState, maxTicks = 100): { ticks: number; state: SwingState } {
  let state = swing;
  for (let ticks = 1; ticks <= maxTicks; ticks++) {
    const advance = advanceSwing(state, FIXED_DT);
    state = advance.swing;
    if (advance.becameActive) return { ticks, state };
  }
  throw new Error('swing never became active');
}

describe('swing state machine', () => {
  it('starts idle and idle swings may start', () => {
    expect(IDLE_SWING.phase).toBe('idle');
    expect(canStartSwing(IDLE_SWING)).toBe(true);
  });

  it('does not advance an idle swing', () => {
    const advance = advanceSwing(IDLE_SWING, 1);
    expect(advance.swing).toBe(IDLE_SWING);
    expect(advance.becameActive).toBe(false);
  });

  it('winds up before it is dangerous', () => {
    const swing = startSwing();
    expect(swing.phase).toBe('windup');
    const justBefore = advanceSwing(swing, WINDUP - 1e-6);
    expect(justBefore.swing.phase).toBe('windup');
    expect(justBefore.becameActive).toBe(false);
  });

  it('becomes active after exactly the windup', () => {
    const advance = advanceSwing(startSwing(), WINDUP);
    expect(advance.swing.phase).toBe('active');
    expect(advance.becameActive).toBe(true);
  });

  it('becomes active on the first tick past the windup at 60 Hz', () => {
    const { ticks } = stepToActive(startSwing());
    expect(ticks).toBe(Math.ceil(WINDUP / FIXED_DT));
  });

  it('reports becoming active exactly once', () => {
    let state = startSwing();
    let activations = 0;
    for (let i = 0; i < Math.ceil(SWING_SECONDS / FIXED_DT) + 5; i++) {
      const advance = advanceSwing(state, FIXED_DT);
      state = advance.swing;
      if (advance.becameActive) activations++;
    }
    expect(activations).toBe(1);
  });

  it('does not swallow the hit when a long frame skips the active window', () => {
    // A 300 ms hitch covers windup, active and part of recovery in one step.
    const advance = advanceSwing(startSwing(), 0.3);
    expect(advance.becameActive).toBe(true);
    expect(advance.swing.phase).toBe('recovery');
  });

  it('is dangerous for the active window and no longer', () => {
    const active = advanceSwing(startSwing(), WINDUP).swing;
    expect(advanceSwing(active, ACTIVE - 1e-6).swing.phase).toBe('active');
    expect(advanceSwing(active, ACTIVE).swing.phase).toBe('recovery');
  });

  it('cannot be restarted until recovery is over', () => {
    let state = startSwing();
    const ticks = Math.ceil(SWING_SECONDS / FIXED_DT);
    for (let i = 0; i < ticks - 1; i++) {
      state = advanceSwing(state, FIXED_DT).swing;
      expect(canStartSwing(state)).toBe(false);
    }
    state = advanceSwing(state, FIXED_DT).swing;
    expect(state.phase).toBe('idle');
    expect(canStartSwing(state)).toBe(true);
  });

  it('takes the same total time in ragged steps as in even ones', () => {
    let ragged = startSwing();
    let elapsed = 0;
    const deltas = [0.004, 0.051, 0.013, 0.1, 0.007, 0.2, 0.016, 0.09, 0.03];
    let index = 0;
    while (ragged.phase !== 'idle') {
      const dt = deltas[index++ % deltas.length] as number;
      elapsed += dt;
      ragged = advanceSwing(ragged, dt).swing;
    }
    expect(elapsed).toBeGreaterThanOrEqual(SWING_SECONDS);
    // Overshoot is bounded by the last step, not by an accumulated drift.
    expect(elapsed - SWING_SECONDS).toBeLessThan(0.2);
  });

  it('ignores a nonsense delta rather than corrupting the swing', () => {
    const swing = startSwing();
    for (const dt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(advanceSwing(swing, dt).swing).toBe(swing);
    }
  });

  it('reports progress across the whole swing for animation', () => {
    expect(swingProgress(IDLE_SWING)).toBe(0);
    expect(swingProgress(startSwing())).toBe(0);
    const active = advanceSwing(startSwing(), WINDUP).swing;
    expect(swingProgress(active)).toBeCloseTo(WINDUP / SWING_SECONDS, 6);
    const recovering = advanceSwing(active, ACTIVE).swing;
    expect(swingProgress(recovering)).toBeCloseTo((WINDUP + ACTIVE) / SWING_SECONDS, 6);
    expect(swingProgress({ phase: 'recovery', elapsed: 99 })).toBe(1);
  });
});
