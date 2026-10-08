import { describe, expect, it } from 'vitest';
import { DRAWING } from '../config/drawing';
import { ECONOMY } from '../config/economy';
import type { BlueprintTemplate } from './blueprint';
import { SWORD } from './blueprints/sword';
import { strokeCount, type Constraint } from './constraints';
import {
  handSketch,
  handStroke,
  ringWaypoints,
  scribbleWaypoints,
  seededRandom,
  swordSketch,
} from './fixtures';
import { normalizeSketch } from './normalize';
import type { Point2, Sketch } from './types';
import { grade, qualityFor, validateSketch } from './validate';

const RICH = { heldChalk: ECONOMY.chalk.max };
const p = (x: number, y: number): Point2 => ({ x, y });

function trace(seed: number, ...waypoints: Point2[][]): Sketch {
  const rng = seededRandom(seed);
  return handSketch(waypoints.map((w) => handStroke(w, rng)));
}

describe('qualityFor (SPEC 6.5)', () => {
  it.each([
    ['barely passing', 0.6, 'crude'],
    ['just under sound', 0.749, 'crude'],
    ['exactly at the sound threshold', 0.75, 'sound'],
    ['mid sound', 0.84, 'sound'],
    ['exactly at the keen threshold', 0.9, 'sound'],
    ['above keen', 0.95, 'keen'],
    ['perfect', 1, 'keen'],
  ])('calls %s accuracy %p %s', (_name, accuracy, expected) => {
    expect(qualityFor(accuracy)).toBe(expected);
  });

  it('reads its boundaries from config', () => {
    expect(qualityFor(DRAWING.quality.sound)).toBe('sound');
    expect(qualityFor(DRAWING.quality.keen)).toBe('sound');
  });
});

describe('grade', () => {
  it('gives a cleanly drawn sword a near-perfect accuracy and passes it', () => {
    const result = grade(normalizeSketch(swordSketch(21)), SWORD);
    expect(result.passed).toBe(true);
    expect(result.accuracy).toBeGreaterThan(0.9);
    expect(result.failures).toEqual([]);
  });

  it('weights constraint scores rather than averaging them flat', () => {
    const half: Constraint = {
      kind: 'Half',
      weight: 1,
      evaluate: () => ({ score: 0.5, passed: true }),
    };
    const full: Constraint = {
      kind: 'Full',
      weight: 3,
      evaluate: () => ({ score: 1, passed: true }),
    };
    const blueprint: BlueprintTemplate = { ...SWORD, constraints: [half, full], minAccuracy: 0.5 };
    // (1*0.5 + 3*1) / 4
    expect(grade(normalizeSketch(swordSketch(22)), blueprint).accuracy).toBeCloseTo(0.875, 9);
  });

  it('reports every failed constraint with its code and its reason', () => {
    const upsideDown = swordSketch(23, { guardAt: 0.78 });
    const result = grade(normalizeSketch(upsideDown), SWORD);
    expect(result.passed).toBe(false);
    expect(result.failures.map((f) => f.code)).toContain('intersection-misplaced');
    for (const failure of result.failures) {
      expect(failure.kind).toBeTruthy();
      expect(failure.detail).toBeTruthy();
    }
  });

  it('fails a drawing that clears every constraint but not the accuracy threshold', () => {
    const fussy: BlueprintTemplate = { ...SWORD, minAccuracy: 0.999 };
    const result = grade(normalizeSketch(swordSketch(24, { guardAt: 0.33 })), fussy);
    expect(result.failures).toEqual([]); // nothing structural was wrong
    expect(result.accuracy).toBeLessThan(0.999);
    expect(result.passed).toBe(false); // but it still is not good enough
  });

  it('fails a drawing that clears the threshold but violates something structural', () => {
    // A guard that never crosses the blade: a good average must not rescue it.
    const detached: BlueprintTemplate = { ...SWORD, minAccuracy: 0.01 };
    const result = grade(normalizeSketch(swordSketch(25, { guardAt: 1.4 })), detached);
    expect(result.accuracy).toBeGreaterThan(0.01);
    expect(result.passed).toBe(false);
    expect(result.failures.map((f) => f.code)).toContain('no-intersection');
  });

  describe('gates', () => {
    const scored: Constraint = {
      kind: 'Scored',
      weight: 1,
      evaluate: () => ({ score: 0.5, passed: true }),
    };
    const gate: Constraint = {
      kind: 'Gate',
      weight: 1,
      gate: true,
      evaluate: () => ({ score: 1, passed: true }),
    };

    /**
     * A gate answers "is this a drawing at all?", not "how good is it?".
     * Averaging its guaranteed 1 into the accuracy would inflate every grade
     * toward the top band and quietly undo SPEC §6.5.
     */
    it('leaves a passing gate out of the accuracy it reports', () => {
      const withGate: BlueprintTemplate = {
        ...SWORD,
        constraints: [scored, gate],
        minAccuracy: 0.1,
      };
      const without: BlueprintTemplate = { ...SWORD, constraints: [scored], minAccuracy: 0.1 };
      const drawing = normalizeSketch(swordSketch(28));
      expect(grade(drawing, withGate).accuracy).toBeCloseTo(0.5, 9);
      expect(grade(drawing, withGate).accuracy).toBeCloseTo(grade(drawing, without).accuracy, 9);
    });

    it('still fails the whole grade when a gate fails', () => {
      const shut: Constraint = {
        ...gate,
        evaluate: () => ({ score: 0, passed: false, code: 'inhuman', detail: 'no' }),
      };
      const blueprint: BlueprintTemplate = {
        ...SWORD,
        constraints: [scored, shut],
        minAccuracy: 0.1,
      };
      const result = grade(normalizeSketch(swordSketch(29)), blueprint);
      expect(result.passed).toBe(false);
      expect(result.accuracy).toBeCloseTo(0.5, 9); // the gate did not drag it down either
      expect(result.failures.map((f) => f.code)).toEqual(['inhuman']);
    });

    it('treats timing and human-likeness as gates, and nothing else', () => {
      expect(SWORD.constraints.filter((c) => c.gate).map((c) => c.kind)).toEqual([
        'Timing',
        'HumanLikeness',
      ]);
    });
  });

  it('refuses a blueprint with no constraints rather than passing it for free', () => {
    const empty: BlueprintTemplate = { ...SWORD, constraints: [] };
    expect(grade(normalizeSketch(swordSketch(26)), empty)).toMatchObject({
      accuracy: 0,
      passed: false,
    });
  });

  it('ignores a zero-weight constraint instead of producing NaN', () => {
    const ignored: Constraint = { ...strokeCount(99), weight: 0 };
    const blueprint: BlueprintTemplate = { ...SWORD, constraints: [...SWORD.constraints, ignored] };
    const result = grade(normalizeSketch(swordSketch(27)), blueprint);
    expect(Number.isFinite(result.accuracy)).toBe(true);
    expect(result.accuracy).toBeCloseTo(grade(normalizeSketch(swordSketch(27)), SWORD).accuracy, 9);
  });
});

describe('validateSketch', () => {
  it('creates a sword from a clean sketch, and says how well it was drawn', () => {
    const outcome = validateSketch(swordSketch(31), RICH);
    expect(outcome.kind).toBe('created');
    if (outcome.kind !== 'created') return;
    expect(outcome.blueprintId).toBe('sword');
    expect(outcome.quality).toBe(qualityFor(outcome.accuracy));
  });

  it('smudges a sword drawn badly, naming what went wrong', () => {
    const outcome = validateSketch(swordSketch(32, { guardAt: 0.78 }), RICH);
    expect(outcome.kind).toBe('smudged');
    if (outcome.kind !== 'smudged') return;
    expect(outcome.blueprintId).toBe('sword');
    expect(outcome.failures.length).toBeGreaterThan(0);
  });

  it.each([
    ['a single line', [[p(0, -0.3), p(0, 0.3)]]],
    ['a circle', [ringWaypoints(0.25)]],
    ['a scribble', [scribbleWaypoints(33)]],
  ] as const)('refuses to read %s, rather than guessing at it', (_name, waypoints) => {
    const outcome = validateSketch(trace(34, ...waypoints.map((w) => [...w])), RICH);
    expect(outcome.kind).toBe('unrecognized');
    if (outcome.kind !== 'unrecognized') return;
    expect(outcome.reason).toBe('below-floor');
  });

  it('refuses an empty sketch', () => {
    expect(validateSketch({ strokes: [], durationMs: 0 }, RICH).kind).toBe('unrecognized');
  });

  describe('affordability', () => {
    it('refuses a sword the player cannot pay for, and says what it costs', () => {
      const outcome = validateSketch(swordSketch(35), { heldChalk: 5 });
      expect(outcome).toMatchObject({
        kind: 'unaffordable',
        blueprintId: 'sword',
        required: ECONOMY.blueprintCost.sword,
        held: 5,
      });
    });

    it('creates one when the player has exactly enough', () => {
      const outcome = validateSketch(swordSketch(36), {
        heldChalk: ECONOMY.blueprintCost.sword,
      });
      expect(outcome.kind).toBe('created');
    });

    /**
     * Grading runs first on purpose. A player who drew it badly should be told
     * that, because that is what teaches them the shape; being told only that
     * they are short of chalk would hide the real problem. The two cost the
     * same anyway (SPEC §6.6).
     */
    it('tells a broke player their drawing was bad before telling them they are broke', () => {
      const outcome = validateSketch(swordSketch(37, { guardAt: 0.78 }), { heldChalk: 0 });
      expect(outcome.kind).toBe('smudged');
    });

    it('does not consider affordability at all for an unreadable sketch', () => {
      const outcome = validateSketch(trace(38, ringWaypoints(0.25)), { heldChalk: 0 });
      expect(outcome.kind).toBe('unrecognized');
    });
  });

  it('honours a registry given to it, so the authority and the client share one path', () => {
    expect(validateSketch(swordSketch(39), { ...RICH, registry: [] }).kind).toBe('unrecognized');
  });

  it('is pure: validating the same sketch twice gives the same outcome', () => {
    const sketch = swordSketch(40);
    expect(validateSketch(sketch, RICH)).toEqual(validateSketch(sketch, RICH));
  });
});
