import { DRAWING } from '../config/drawing';
import {
  angleDifference,
  closureRatio,
  dominantAngle,
  endpointGap,
  polylineCrossing,
  straightness as measureStraightness,
} from './geometry';
import { normalizeSketch } from './normalize';
import type { NormalizedDrawing, NormalizedStroke, PlanePoint, Point2, Sketch } from './types';

/**
 * The constraint library (ARCHITECTURE §6.4). A constraint scores exactly one
 * geometric property and explains itself when it fails. This is the extension
 * point: a new blueprint combines existing constraints, and only a genuinely
 * new kind of shape adds one.
 *
 * `accuracy` is the weighted mean of constraint scores; `passed` additionally
 * requires every flag true, so a drawing cannot pass on a good average while
 * violating something structural — a crossguard that never crosses the blade.
 */

/** Stable identifiers, safe to map to player-facing copy and to log. */
export type FailureCode =
  | 'stroke-count'
  | 'missing-stroke'
  | 'not-straight'
  | 'wrong-direction'
  | 'wrong-relative-length'
  | 'no-intersection'
  | 'intersection-misplaced'
  | 'endpoints-apart'
  | 'not-closed'
  | 'wrong-aspect'
  | 'off-template'
  | 'bad-timing'
  | 'inhuman';

export interface ConstraintResult {
  /** 0..1. */
  readonly score: number;
  /** Structural gate: true exactly when `score` is above zero. */
  readonly passed: boolean;
  /** Present iff `passed` is false. */
  readonly code?: FailureCode;
  /** Present iff `passed` is false: why, in terms the UI can rephrase. */
  readonly detail?: string;
}

export interface Constraint {
  readonly kind: string;
  readonly weight: number;
  evaluate(drawing: NormalizedDrawing): ConstraintResult;
}

/** A failed constraint, carried on a `smudged` outcome (ARCHITECTURE §6.1). */
export interface ConstraintFailure {
  readonly kind: string;
  readonly code: FailureCode;
  readonly detail: string;
}

// ---------------------------------------------------------------- scoring

/** 1 at or below `good`, ramping linearly to 0 at `zero`, and 0 at or beyond it. */
export function ramp(value: number, good: number, zero: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= good) return 1;
  if (value >= zero || zero <= good) return 0;
  return (zero - value) / (zero - good);
}

/**
 * Scores a value against a tolerance band: 1 across the band's inner
 * `plateau` fraction, ramping to 0 at the edges, and 0 outside. The edges are
 * exclusive, so landing exactly on one fails.
 */
export function bandScore(
  value: number,
  min: number,
  max: number,
  plateau: number = DRAWING.bandPlateau,
): number {
  if (!Number.isFinite(value) || value <= min || value >= max) return 0;
  const half = (max - min) / 2;
  return ramp(Math.abs(value - (min + half)), half * plateau, half);
}

/** `bandScore` in log space, so a ratio band is symmetric about its geometric centre. */
export function logBandScore(value: number, min: number, max: number): number {
  if (!(value > 0) || !(min > 0) || !(max > 0)) return 0;
  return bandScore(Math.log(value), Math.log(min), Math.log(max));
}

const pass = (score: number): ConstraintResult => ({ score, passed: true });

const fail = (code: FailureCode, detail: string): ConstraintResult => ({
  score: 0,
  passed: false,
  code,
  detail,
});

/** Turns a score into a result: above zero passes, zero fails with an explanation. */
function graded(score: number, code: FailureCode, detail: () => string): ConstraintResult {
  return score > 0 ? pass(score) : fail(code, detail());
}

const degrees = (radians: number): string => `${Math.round((radians * 180) / Math.PI)}°`;

const percent = (value: number): string => `${Math.round(value * 100)}%`;

function strokeAt(drawing: NormalizedDrawing, index: number): NormalizedStroke | undefined {
  return drawing.strokes[index];
}

const missing = (index: number): ConstraintResult =>
  fail('missing-stroke', `Stroke ${index + 1} is missing`);

// ------------------------------------------------------------ constraints

/** Number of strokes, inclusive of both bounds. A hard gate: 1 or 0, never partial. */
export function strokeCount(min: number, max: number = min, weight = 1): Constraint {
  return {
    kind: 'StrokeCount',
    weight,
    evaluate: (d) => {
      const n = d.strokes.length;
      if (n >= min && n <= max) return pass(1);
      const wanted = min === max ? `${min}` : `${min}–${max}`;
      return fail('stroke-count', `Expected ${wanted} strokes, got ${n}`);
    },
  };
}

/** Stroke `index` is a line: endpoint distance over path length at or above `min`. */
export function straightness(index: number, min: number, weight = 1): Constraint {
  return {
    kind: `Straightness(${index})`,
    weight,
    evaluate: (d) => {
      const stroke = strokeAt(d, index);
      if (!stroke) return missing(index);
      const value = measureStraightness(stroke.points);
      return graded(
        ramp(1 - value, 0, 1 - min),
        'not-straight',
        () => `Stroke ${index + 1} is too curved`,
      );
    },
  };
}

/** Principal axis of stroke `index` within `toleranceDeg` of `targetDeg`. Undirected. */
export function direction(
  index: number,
  targetDeg: number,
  toleranceDeg: number,
  weight = 1,
): Constraint {
  const target = (targetDeg * Math.PI) / 180;
  const tolerance = (toleranceDeg * Math.PI) / 180;
  return {
    kind: `Direction(${index})`,
    weight,
    evaluate: (d) => {
      const stroke = strokeAt(d, index);
      if (!stroke) return missing(index);
      const off = angleDifference(dominantAngle(stroke.points), target);
      return graded(
        ramp(off, 0, tolerance),
        'wrong-direction',
        () => `Stroke ${index + 1} is ${degrees(off)} off its angle`,
      );
    },
  };
}

/** Path length of stroke `a` over stroke `b`, inside `[min, max]`. */
export function relativeLength(
  a: number,
  b: number,
  [min, max]: readonly [number, number],
  weight = 1,
): Constraint {
  return {
    kind: `RelativeLength(${a},${b})`,
    weight,
    evaluate: (d) => {
      const first = strokeAt(d, a);
      const second = strokeAt(d, b);
      if (!first) return missing(a);
      if (!second) return missing(b);
      if (second.length === 0) {
        return fail('wrong-relative-length', `Stroke ${b + 1} has no length`);
      }
      const ratio = first.length / second.length;
      return graded(
        logBandScore(ratio, min, max),
        'wrong-relative-length',
        () =>
          `Stroke ${a + 1} is ${percent(ratio)} of stroke ${b + 1}, not ` +
          `${percent(min)}–${percent(max)}`,
      );
    },
  };
}

export interface IntersectionOptions {
  /** Where along stroke `a` the crossing must land, from its low end. See `polylineCrossing`. */
  readonly at?: readonly [number, number];
}

/** Stroke `a` crosses stroke `b`, optionally within a position band along `a`. */
export function intersection(
  a: number,
  b: number,
  options: IntersectionOptions = {},
  weight = 1,
): Constraint {
  const at = options.at;
  return {
    kind: `Intersection(${a},${b})`,
    weight,
    evaluate: (d) => {
      const first = strokeAt(d, a);
      const second = strokeAt(d, b);
      if (!first) return missing(a);
      if (!second) return missing(b);

      const crossing = polylineCrossing(first.points, second.points);
      if (!crossing) {
        return fail('no-intersection', `Stroke ${b + 1} never crosses stroke ${a + 1}`);
      }
      if (!at) return pass(1);
      return graded(
        bandScore(crossing.atA, at[0], at[1]),
        'intersection-misplaced',
        () => `Stroke ${b + 1} crosses stroke ${a + 1} in the wrong place`,
      );
    },
  };
}

/** Some endpoint of stroke `a` lies within `maxGap` normalized units of some endpoint of `b`. */
export function endpointProximity(a: number, b: number, maxGap: number, weight = 1): Constraint {
  return {
    kind: `EndpointProximity(${a},${b})`,
    weight,
    evaluate: (d) => {
      const first = strokeAt(d, a);
      const second = strokeAt(d, b);
      if (!first) return missing(a);
      if (!second) return missing(b);
      return graded(
        ramp(endpointGap(first.points, second.points), 0, maxGap),
        'endpoints-apart',
        () => `Strokes ${a + 1} and ${b + 1} never meet`,
      );
    },
  };
}

/** Stroke `index` returns to its own start: endpoint gap under `maxGapRatio` of its length. */
export function closure(
  index: number,
  maxGapRatio: number = DRAWING.closureGapRatio,
  weight = 1,
): Constraint {
  return {
    kind: `Closure(${index})`,
    weight,
    evaluate: (d) => {
      const stroke = strokeAt(d, index);
      if (!stroke) return missing(index);
      return graded(
        ramp(closureRatio(stroke.points), 0, maxGapRatio),
        'not-closed',
        () => `Stroke ${index + 1} never closes`,
      );
    },
  };
}

/** Whole-drawing bounding box width / height, inside `[min, max]`. */
export function aspectRatio([min, max]: readonly [number, number], weight = 1): Constraint {
  return {
    kind: 'AspectRatio',
    weight,
    evaluate: (d) =>
      graded(logBandScore(d.aspect, min, max), 'wrong-aspect', () =>
        d.aspect > max ? 'The shape is too wide' : 'The shape is too narrow',
      ),
  };
}

/**
 * Mean per-point distance to a reference path, after normalization — the
 * useful half of `$1` (ARCHITECTURE §6.5). The reference is given as raw
 * polylines in any units and normalized once here, so blueprint data stays
 * readable. Each stroke is matched in whichever direction fits better, so
 * draw direction does not matter.
 */
export function templateDistance(
  reference: readonly (readonly Point2[])[],
  maxMeanDistance: number,
  weight = 1,
): Constraint {
  const template = normalizeSketch(sketchFrom(reference));
  return {
    kind: 'TemplateDistance',
    weight,
    evaluate: (d) => {
      if (d.strokes.length !== template.strokes.length) {
        return fail('missing-stroke', 'The drawing has the wrong number of strokes');
      }
      let total = 0;
      let count = 0;
      for (let i = 0; i < template.strokes.length; i++) {
        const drawn = d.strokes[i]?.points;
        const want = template.strokes[i]?.points;
        if (!drawn || !want) continue;
        total += Math.min(meanDistance(drawn, want), meanDistance(drawn, [...want].reverse()));
        count++;
      }
      const unmatched = (): string => 'That is not the right shape';
      if (count === 0) return fail('off-template', unmatched());
      return graded(ramp(total / count, 0, maxMeanDistance), 'off-template', unmatched);
    },
  };
}

export interface TimingRange {
  readonly minMs: number;
  readonly maxMs: number;
}

/** Total sketch duration inside `[minMs, maxMs]`. */
export function timing({ minMs, maxMs }: TimingRange, weight = 1): Constraint {
  return {
    kind: 'Timing',
    weight,
    evaluate: (d) =>
      graded(bandScore(d.durationMs, minMs, maxMs), 'bad-timing', () =>
        d.durationMs <= minMs ? 'That was drawn too fast' : 'That took too long',
      ),
  };
}

/**
 * Anti-automation gate, scored 1 or 0 rather than graded: a steady hand is not
 * a defect, so this must never pull a good drawing's accuracy down. A script
 * gives itself away by teleporting the cursor or by moving at a machine-exact
 * speed, not by drawing well.
 */
export function humanLikeness(weight = 1): Constraint {
  return {
    kind: 'HumanLikeness',
    weight,
    evaluate: (d) => {
      const samples = sampleSpeeds(d.source);
      if (samples === null) return fail('inhuman', 'Stroke timing does not move forward');
      if (samples.length < DRAWING.human.minSamples) return pass(1); // too short to judge

      if (Math.max(...samples) > DRAWING.human.maxSpeed) {
        return fail('inhuman', 'The cursor moved impossibly fast');
      }
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      if (mean === 0) return fail('inhuman', 'The cursor never moved');

      const variance = samples.reduce((a, s) => a + (s - mean) ** 2, 0) / samples.length;
      if (Math.sqrt(variance) / mean < DRAWING.human.minSpeedVariation) {
        return fail('inhuman', 'The cursor moved too evenly');
      }
      return pass(1);
    },
  };
}

/** Inter-sample speeds in plane metres/second, or null if a stroke's time does not advance. */
function sampleSpeeds(sketch: Sketch): number[] | null {
  const out: number[] = [];
  for (const stroke of sketch.strokes) {
    for (let i = 1; i < stroke.points.length; i++) {
      const a = stroke.points[i - 1];
      const b = stroke.points[i];
      if (!a || !b) continue;
      const dt = (b.t - a.t) / 1000;
      if (dt <= 0) return null;
      out.push(Math.hypot(b.x - a.x, b.y - a.y) / dt);
    }
  }
  return out;
}

function meanDistance(a: readonly Point2[], b: readonly Point2[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return Infinity;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const p = a[i];
    const q = b[i];
    if (p && q) total += Math.hypot(q.x - p.x, q.y - p.y);
  }
  return total / n;
}

function sketchFrom(reference: readonly (readonly Point2[])[]): Sketch {
  const strokes = reference.map((points) => ({
    points: points.map((p, i): PlanePoint => ({ x: p.x, y: p.y, t: i })),
    durationMs: Math.max(0, points.length - 1),
  }));
  return { strokes, durationMs: 0 };
}
