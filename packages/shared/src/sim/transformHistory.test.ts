import { describe, expect, it } from 'vitest';
import { COMBAT } from '../config/combat';
import { vec3 } from '../math/vec';
import {
  HISTORY_TICKS,
  MAX_REWIND_TICKS,
  rewindTick,
  TransformHistory,
} from './transformHistory';

/** A player walking in a straight line: x equals the tick, so poses are legible. */
function walkedHistory(ticks: number): TransformHistory {
  const history = new TransformHistory();
  for (let tick = 0; tick < ticks; tick++) {
    history.record(tick, vec3(tick, 0, 0), tick % 2 === 1);
  }
  return history;
}

describe('transform history', () => {
  it('keeps one second of ticks and no more', () => {
    expect(HISTORY_TICKS).toBe(60);
    expect(MAX_REWIND_TICKS).toBe(12);
    expect(COMBAT.lagCompensation.maxRewindMs).toBeLessThan(COMBAT.lagCompensation.historyMs);
  });

  it('knows nothing before anything is recorded', () => {
    const history = new TransformHistory();
    expect(history.at(0)).toBeUndefined();
    expect(history.rewind(0, 0)).toBeUndefined();
  });

  it('returns the pose recorded at a tick', () => {
    const history = walkedHistory(30);
    expect(history.at(10)?.position.x).toBe(10);
    expect(history.at(10)?.crouching).toBe(false);
    expect(history.at(11)?.crouching).toBe(true);
  });

  it('answers the present when asked about the future', () => {
    const history = walkedHistory(30);
    expect(history.at(999)?.tick).toBe(29);
  });

  it('answers the oldest pose it still has, rather than nothing', () => {
    const history = walkedHistory(HISTORY_TICKS * 3);
    const oldest = history.oldest;
    expect(oldest).toBe(HISTORY_TICKS * 3 - HISTORY_TICKS);
    expect(history.at(0)?.tick).toBe(oldest);
    expect(history.at(oldest)?.position.x).toBe(oldest);
  });

  it('overwrites rather than growing', () => {
    const history = walkedHistory(HISTORY_TICKS * 10);
    expect(history.newest).toBe(HISTORY_TICKS * 10 - 1);
    expect(history.oldest).toBe(HISTORY_TICKS * 9);
    // The pose a full buffer ago is gone, and asking for it gives the oldest.
    expect(history.at(HISTORY_TICKS * 8)?.tick).toBe(HISTORY_TICKS * 9);
  });

  it('forgets everything when cleared', () => {
    const history = walkedHistory(30);
    history.clear();
    expect(history.at(10)).toBeUndefined();
  });
});

describe('bounded rewind', () => {
  const NOW = 500;

  it('rewinds to the tick the attacker had acknowledged', () => {
    const history = walkedHistory(NOW + 1);
    expect(history.rewind(NOW, NOW - 6)?.position.x).toBe(NOW - 6);
  });

  it('does not rewind at all for an attacker who is up to date', () => {
    const history = walkedHistory(NOW + 1);
    expect(history.rewind(NOW, NOW)?.position.x).toBe(NOW);
  });

  it('clamps a claim beyond the limit to the limit, never further', () => {
    const history = walkedHistory(NOW + 1);
    const clamped = history.rewind(NOW, NOW - MAX_REWIND_TICKS * 10);
    expect(clamped?.tick).toBe(NOW - MAX_REWIND_TICKS);
  });

  it('gives a client claiming the future no rewind', () => {
    const history = walkedHistory(NOW + 1);
    expect(history.rewind(NOW, NOW + 1000)?.tick).toBe(NOW);
    expect(rewindTick(NOW, NOW + 1000)).toBe(NOW);
  });

  it('ignores a nonsense claim rather than reaching anywhere', () => {
    for (const claim of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(rewindTick(NOW, claim)).toBe(NOW);
    }
  });

  it('is exactly the rewind clamp wide, in ticks', () => {
    expect(rewindTick(NOW, NOW - MAX_REWIND_TICKS)).toBe(NOW - MAX_REWIND_TICKS);
    expect(rewindTick(NOW, NOW - MAX_REWIND_TICKS - 1)).toBe(NOW - MAX_REWIND_TICKS);
  });
});
