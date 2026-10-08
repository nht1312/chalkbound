import { describe, expect, it } from 'vitest';
import { DRAWING } from '../config/drawing';
import {
  aspectRatio,
  bandScore,
  closure,
  direction,
  endpointProximity,
  humanLikeness,
  intersection,
  logBandScore,
  ramp,
  relativeLength,
  straightness,
  strokeCount,
  templateDistance,
  timing,
  type Constraint,
} from './constraints';
import { normalizeSketch } from './normalize';
import type { NormalizedDrawing, PlanePoint, Point2, Sketch, Stroke } from './types';

type XY = readonly [number, number];

/** Inter-sample gaps of a real hand: uneven, so `humanLikeness` is satisfied. */
const HUMAN_DT = [12, 20, 16, 28, 14, 22];

function stroke(points: readonly XY[]): Stroke {
  let t = 0;
  const sampled: PlanePoint[] = points.map(([x, y], i) => {
    if (i > 0) t += HUMAN_DT[(i - 1) % HUMAN_DT.length] ?? 16;
    return { x, y, t };
  });
  return { points: sampled, durationMs: t };
}

/** A machine's stroke: perfectly even timing. */
function evenStroke(points: readonly XY[], dt = 16): Stroke {
  const sampled: PlanePoint[] = points.map(([x, y], i) => ({ x, y, t: i * dt }));
  return { points: sampled, durationMs: (points.length - 1) * dt };
}

function segment(from: XY, to: XY, count = 12): XY[] {
  return Array.from({ length: count }, (_, i) => {
    const f = i / (count - 1);
    return [from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f];
  });
}

/** A line of unit length through the origin at `deg` from horizontal. */
function atAngle(deg: number, count = 12): XY[] {
  const a = (deg * Math.PI) / 180;
  const [dx, dy] = [Math.cos(a) / 2, Math.sin(a) / 2];
  return segment([-dx, -dy], [dx, dy], count);
}

/** A symmetric V whose straightness is `target`: endpoint span over path length. */
function vWithStraightness(target: number): XY[] {
  const drop = Math.sqrt(1 / (target * target) - 1);
  return [...segment([-1, 0], [0, -drop], 8), ...segment([0, -drop], [1, 0], 8)];
}

function ring(radius: number, count = 24): XY[] {
  const points: XY[] = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return [Math.cos(a) * radius, Math.sin(a) * radius];
  });
  return [...points, [radius, 0]];
}

const sketch = (strokes: Stroke[], durationMs = 900): Sketch => ({ strokes, durationMs });
const draw = (...strokes: Stroke[]): NormalizedDrawing => normalizeSketch(sketch(strokes));

const BLADE = segment([0, -0.3], [0, 0.3]);
const guardAt = (y: number): XY[] => segment([-0.09, y], [0.09, y], 6);
/** The reference sword, drawn cleanly. */
const sword = (): NormalizedDrawing => draw(stroke(BLADE), stroke(guardAt(-0.18)));

describe('scoring helpers', () => {
  describe('ramp', () => {
    it.each([
      ['at the ideal', 0, 1],
      ['inside the ideal', -5, 1],
      ['a quarter along', 0.25, 0.75],
      ['halfway', 0.5, 0.5],
      ['at the limit, which is exclusive', 1, 0],
      ['past the limit', 2, 0],
      ['not a number', Number.NaN, 0],
    ])('%s', (_name, value, expected) => {
      expect(ramp(value, 0, 1)).toBeCloseTo(expected, 9);
    });

    it('is a hard gate when there is no room to ramp', () => {
      expect(ramp(0.5, 0.5, 0.5)).toBe(1);
      expect(ramp(0.51, 0.5, 0.5)).toBe(0);
    });
  });

  describe('bandScore', () => {
    it.each([
      ['at the centre', 0.4, 1],
      ['inside the plateau', 0.45, 1],
      ['between plateau and edge', 0.5, 2 / 3],
      ['on the lower edge, which is exclusive', 0.25, 0],
      ['on the upper edge, which is exclusive', 0.55, 0],
      ['outside', 0.1, 0],
    ])('%s', (_name, value, expected) => {
      expect(bandScore(value, 0.25, 0.55)).toBeCloseTo(expected, 9);
    });

    it('honours the configured plateau width', () => {
      expect(DRAWING.bandPlateau).toBe(0.5);
      expect(bandScore(0.4, 0.25, 0.55, 1)).toBe(1); // a band with no ramp at all
      expect(bandScore(0.26, 0.25, 0.55, 1)).toBe(1);
    });
  });

  describe('logBandScore', () => {
    it('puts a full score at the geometric centre, not the arithmetic one', () => {
      expect(logBandScore(Math.sqrt(0.25 * 0.55), 0.25, 0.55)).toBeCloseTo(1, 9);
    });

    it('is symmetric under reciprocals', () => {
      expect(logBandScore(2, 0.5, 4)).toBeCloseTo(logBandScore(1, 0.25, 2), 9);
    });

    it('rejects non-positive input instead of returning NaN', () => {
      expect(logBandScore(0, 0.25, 0.55)).toBe(0);
      expect(logBandScore(-1, 0.25, 0.55)).toBe(0);
      expect(logBandScore(Infinity, 0.25, 0.55)).toBe(0);
    });
  });
});

describe('strokeCount', () => {
  const one = stroke(BLADE);
  it.each([
    ['exactly right', draw(one, one), 2, 2, 1, undefined],
    ['inside a range', draw(one, one), 1, 3, 1, undefined],
    ['too few', draw(one), 2, 2, 0, 'stroke-count'],
    ['too many', draw(one, one, one), 2, 2, 0, 'stroke-count'],
    ['none at all', draw(), 1, 2, 0, 'stroke-count'],
  ])('%s', (_name, drawing, min, max, score, code) => {
    const result = strokeCount(min, max).evaluate(drawing);
    expect(result.score).toBe(score);
    expect(result.code).toBe(code);
  });

  it('names what it wanted and what it got', () => {
    expect(strokeCount(2).evaluate(draw(stroke(BLADE))).detail).toBe('Expected 2 strokes, got 1');
  });
});

describe('straightness', () => {
  it.each([
    ['a clean line', 1, 1],
    ['slightly bowed, halfway to the limit', 0.95, 0.5],
    ['at the limit', 0.9, 0],
    ['a deep curve', 0.7, 0],
  ])('%s scores %p', (_name, actual, expected) => {
    const points = actual === 1 ? segment([-1, 0], [1, 0]) : vWithStraightness(actual);
    expect(straightness(0, 0.9).evaluate(draw(stroke(points))).score).toBeCloseTo(expected, 1);
  });

  it('fails a curve with a code and a reason', () => {
    const result = straightness(0, 0.9).evaluate(draw(stroke(ring(1))));
    expect(result).toMatchObject({ passed: false, code: 'not-straight' });
    expect(result.detail).toBe('Stroke 1 is too curved');
  });

  it('reports a missing stroke rather than silently passing', () => {
    expect(straightness(1, 0.9).evaluate(draw(stroke(BLADE)))).toMatchObject({
      passed: false,
      code: 'missing-stroke',
      detail: 'Stroke 2 is missing',
    });
  });
});

describe('direction', () => {
  const vertical = direction(0, -90, 25);
  it.each([
    ['dead on', -90, 1],
    ['the same line, measured the other way', 90, 1],
    ['halfway through tolerance', -77.5, 0.5],
    ['just inside tolerance', -66, 0.04],
    ['at the tolerance', -65, 0],
    ['horizontal', 0, 0],
  ])('%s', (_name, deg, expected) => {
    expect(vertical.evaluate(draw(stroke(atAngle(deg)))).score).toBeCloseTo(expected, 2);
  });

  it('ignores draw direction', () => {
    const forward = draw(stroke(atAngle(-80)));
    const backward = draw(stroke([...atAngle(-80)].reverse()));
    expect(vertical.evaluate(forward).score).toBeCloseTo(vertical.evaluate(backward).score, 9);
  });

  it('says how far off the stroke was', () => {
    expect(vertical.evaluate(draw(stroke(atAngle(0)))).detail).toBe(
      'Stroke 1 is 90° off its angle',
    );
  });
});

describe('relativeLength', () => {
  /** Stroke 0 of `ratio` times the length of stroke 1. */
  const pair = (ratio: number): NormalizedDrawing =>
    draw(
      stroke(segment([-ratio / 2, 0.2], [ratio / 2, 0.2])),
      stroke(segment([-0.5, 0], [0.5, 0])),
    );

  const guard = relativeLength(0, 1, [0.25, 0.55]);
  it.each([
    ['at the geometric centre', Math.sqrt(0.25 * 0.55), 1],
    ['inside the plateau', 0.4, 1],
    // Scored in log space, so the ramp is not linear in the ratio itself.
    ['near the upper edge', 0.5, 0.4835],
    ['on the edge', 0.55, 0],
    ['far too long', 0.9, 0],
    ['far too short', 0.05, 0],
  ])('%s', (_name, ratio, expected) => {
    expect(guard.evaluate(pair(ratio)).score).toBeCloseTo(expected, 4);
  });

  it('quotes the ratio it measured against the one it wanted', () => {
    expect(guard.evaluate(pair(0.9)).detail).toBe('Stroke 1 is 90% of stroke 2, not 25%–55%');
  });

  it('refuses to divide by a stroke with no length', () => {
    const dot = stroke([
      [0, 0],
      [0, 0],
    ]);
    expect(relativeLength(0, 1, [0.25, 0.55]).evaluate(draw(stroke(BLADE), dot))).toMatchObject({
      passed: false,
      code: 'wrong-relative-length',
      detail: 'Stroke 2 has no length',
    });
  });
});

describe('intersection', () => {
  it('passes any crossing when no position band is given', () => {
    expect(intersection(0, 1).evaluate(sword())).toMatchObject({ score: 1, passed: true });
  });

  it('fails when the strokes never cross', () => {
    const apart = draw(stroke(BLADE), stroke(segment([0.2, -0.18], [0.4, -0.18])));
    expect(intersection(0, 1).evaluate(apart)).toMatchObject({
      passed: false,
      code: 'no-intersection',
      detail: 'Stroke 2 never crosses stroke 1',
    });
  });

  const low = intersection(0, 1, { at: [0.1, 0.4] });
  it.each([
    ['low on the blade, as a sword', -0.18, 1],
    ['a little high, inside the band', -0.09, 2 / 3],
    ['at the band edge', 0, 0],
    ['high on the blade, an upside-down sword', 0.18, 0],
  ])('%s', (_name, guardY, expected) => {
    const drawing = draw(stroke(BLADE), stroke(guardAt(guardY)));
    expect(low.evaluate(drawing).score).toBeCloseTo(expected, 6);
  });

  it('judges the position from the blade, not from where the player started', () => {
    const forward = draw(stroke(BLADE), stroke(guardAt(-0.18)));
    const reversed = draw(stroke([...BLADE].reverse()), stroke([...guardAt(-0.18)].reverse()));
    expect(low.evaluate(reversed).score).toBeCloseTo(low.evaluate(forward).score, 9);
  });

  it('explains a misplaced crossing', () => {
    expect(low.evaluate(draw(stroke(BLADE), stroke(guardAt(0.18)))).detail).toBe(
      'Stroke 2 crosses stroke 1 in the wrong place',
    );
  });
});

describe('endpointProximity', () => {
  /**
   * Two horizontal strokes separated by `gap`, always spanning exactly 1 unit
   * end to end — so normalization is the identity and `gap` is also the gap in
   * normalized units.
   */
  const withGap = (gap: number): NormalizedDrawing =>
    draw(stroke(segment([-0.5, 0], [-0.1, 0])), stroke(segment([-0.1 + gap, 0], [0.5, 0])));

  it.each([
    ['touching', 0, 1],
    ['a small gap', 0.05, 0.5],
    ['at the limit', 0.1, 0],
    ['clearly apart', 0.3, 0],
  ])('%s', (_name, gap, expected) => {
    expect(endpointProximity(0, 1, 0.1).evaluate(withGap(gap)).score).toBeCloseTo(expected, 9);
  });

  it('reports strokes that never meet', () => {
    expect(endpointProximity(0, 1, 0.05).evaluate(withGap(0.3))).toMatchObject({
      passed: false,
      code: 'endpoints-apart',
      detail: 'Strokes 1 and 2 never meet',
    });
  });
});

describe('closure', () => {
  it('passes a closed ring and fails an open line', () => {
    expect(closure(0).evaluate(draw(stroke(ring(0.3))))).toMatchObject({ score: 1, passed: true });
    expect(closure(0).evaluate(draw(stroke(BLADE)))).toMatchObject({
      passed: false,
      code: 'not-closed',
      detail: 'Stroke 1 never closes',
    });
  });

  it('scores a ring left ajar between the two', () => {
    const ajar = ring(0.3).slice(0, -3); // stop short of the start
    const score = closure(0).evaluate(draw(stroke(ajar))).score;
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('reads the same for a large ring and a small one', () => {
    expect(closure(0).evaluate(draw(stroke(ring(0.05)))).score).toBeCloseTo(
      closure(0).evaluate(draw(stroke(ring(0.35)))).score,
      9,
    );
  });
});

describe('aspectRatio', () => {
  /** A box `w` by `h`, drawn as two opposite sides. */
  const box = (w: number, h: number): NormalizedDrawing =>
    draw(
      stroke(segment([-w / 2, -h / 2], [-w / 2, h / 2])),
      stroke(segment([w / 2, -h / 2], [w / 2, h / 2])),
    );

  const tall = aspectRatio([0.2, 0.8]);
  it.each([
    ['at the geometric centre', 0.4, 1],
    ['inside the plateau', 0.35, 1],
    ['on the edge', 0.8, 0],
    ['too wide', 1.5, 0],
    ['too narrow', 0.05, 0],
  ])('%s', (_name, ratio, expected) => {
    expect(tall.evaluate(box(ratio, 1)).score).toBeCloseTo(expected, 6);
  });

  it('says which way the shape is wrong', () => {
    expect(tall.evaluate(box(1.5, 1)).detail).toBe('The shape is too wide');
    expect(tall.evaluate(box(0.05, 1)).detail).toBe('The shape is too narrow');
  });
});

describe('templateDistance', () => {
  const reference: Point2[][] = [
    BLADE.map(([x, y]) => ({ x, y })),
    guardAt(-0.18).map(([x, y]) => ({ x, y })),
  ];
  const match = templateDistance(reference, 0.15);

  it('scores a perfect copy 1, wherever and however large it was drawn', () => {
    expect(match.evaluate(sword()).score).toBeCloseTo(1, 6);
    const bigger = draw(
      stroke(BLADE.map(([x, y]): XY => [x * 2 + 0.1, y * 2 + 0.1])),
      stroke(guardAt(-0.18).map(([x, y]): XY => [x * 2 + 0.1, y * 2 + 0.1])),
    );
    expect(match.evaluate(bigger).score).toBeCloseTo(1, 6);
  });

  it('does not care which end of a stroke the player started from', () => {
    const reversed = draw(stroke([...BLADE].reverse()), stroke([...guardAt(-0.18)].reverse()));
    expect(match.evaluate(reversed).score).toBeCloseTo(1, 6);
  });

  it('scores a sword with a misplaced guard below a clean one, but above zero', () => {
    const off = draw(stroke(BLADE), stroke(guardAt(-0.05)));
    const score = match.evaluate(off).score;
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(match.evaluate(sword()).score);
  });

  it('rejects a different shape', () => {
    const cross = draw(stroke(segment([-0.3, 0], [0.3, 0])), stroke(segment([0, -0.3], [0, 0.3])));
    expect(match.evaluate(cross)).toMatchObject({
      passed: false,
      code: 'off-template',
      detail: 'That is not the right shape',
    });
  });

  it('rejects the wrong number of strokes', () => {
    expect(match.evaluate(draw(stroke(BLADE)))).toMatchObject({
      passed: false,
      code: 'missing-stroke',
      detail: 'The drawing has the wrong number of strokes',
    });
  });
});

describe('timing', () => {
  const window = timing({ minMs: 250, maxMs: 6000 });
  const after = (ms: number): NormalizedDrawing => normalizeSketch(sketch([stroke(BLADE)], ms));

  it.each([
    ['a quick sketch', 400, 1],
    ['a brisk draw', 1200, 1],
    ['a careful one', 4500, 1],
    ['too fast', 100, 0],
    ['exactly at the floor', 250, 0],
    ['too slow', 9000, 0],
  ])('%s', (_name, ms, expected) => {
    expect(window.evaluate(after(ms)).score).toBeCloseTo(expected, 6);
  });

  it('is a gate, not a grade: drawing carefully must not cost accuracy', () => {
    const scores = [300, 800, 1500, 3000, 5500].map((ms) => window.evaluate(after(ms)).score);
    expect(scores).toEqual([1, 1, 1, 1, 1]);
  });

  it('distinguishes rushing from dawdling', () => {
    expect(window.evaluate(after(100))).toMatchObject({
      code: 'bad-timing',
      detail: 'That was drawn too fast',
    });
    expect(window.evaluate(after(9000)).detail).toBe('That took too long');
  });
});

describe('humanLikeness', () => {
  const human = humanLikeness();

  it('passes a hand-drawn sword without touching its accuracy', () => {
    expect(human.evaluate(sword())).toEqual({ score: 1, passed: true });
  });

  it('fails a cursor that moved at a machine-exact speed', () => {
    expect(human.evaluate(draw(evenStroke(BLADE)))).toMatchObject({
      passed: false,
      code: 'inhuman',
      detail: 'The cursor moved too evenly',
    });
  });

  it('fails a cursor that teleported', () => {
    const jump = stroke([...segment([0, -0.3], [0, 0], 10), [0.5, 0.5]]);
    expect(human.evaluate(draw(jump))).toMatchObject({
      passed: false,
      detail: 'The cursor moved impossibly fast',
    });
  });

  it('fails a stroke whose clock does not move forward', () => {
    const frozen: Stroke = {
      points: BLADE.map(([x, y]) => ({ x, y, t: 0 })),
      durationMs: 0,
    };
    expect(human.evaluate(draw(frozen))).toMatchObject({
      passed: false,
      detail: 'Stroke timing does not move forward',
    });
  });

  it('fails a cursor that never moved at all', () => {
    const still = stroke(Array.from({ length: 12 }, (): XY => [0, 0]));
    expect(human.evaluate(draw(still))).toMatchObject({
      passed: false,
      detail: 'The cursor never moved',
    });
  });

  it('does not judge a stroke too short to judge', () => {
    const tiny = evenStroke(segment([0, 0], [0.1, 0], 4));
    expect(tiny.points.length - 1).toBeLessThan(DRAWING.human.minSamples);
    expect(human.evaluate(draw(tiny))).toEqual({ score: 1, passed: true });
  });
});

describe('every constraint', () => {
  const all: Constraint[] = [
    strokeCount(2),
    straightness(0, 0.9),
    direction(0, -90, 25),
    relativeLength(1, 0, [0.25, 0.55]),
    intersection(0, 1, { at: [0.1, 0.4] }),
    endpointProximity(0, 1, 0.1),
    closure(0),
    aspectRatio([0.2, 0.8]),
    templateDistance([BLADE.map(([x, y]) => ({ x, y }))], 0.15),
    timing({ minMs: 250, maxMs: 6000 }),
    humanLikeness(),
  ];

  const cases: NormalizedDrawing[] = [
    sword(),
    draw(),
    draw(stroke(BLADE)),
    draw(stroke(ring(0.3))),
    draw(stroke(BLADE), stroke(guardAt(0.18)), stroke(guardAt(-0.25))),
    draw(evenStroke(segment([0, 0], [0, 0], 12))),
  ];

  it('covers the library in ARCHITECTURE 6.4', () => {
    expect(all.map((c) => c.kind.replace(/\(.*\)$/, ''))).toEqual([
      'StrokeCount',
      'Straightness',
      'Direction',
      'RelativeLength',
      'Intersection',
      'EndpointProximity',
      'Closure',
      'AspectRatio',
      'TemplateDistance',
      'Timing',
      'HumanLikeness',
    ]);
  });

  it('scores in 0..1, passes exactly when the score is above zero, and never throws', () => {
    for (const constraint of all) {
      for (const drawing of cases) {
        const result = constraint.evaluate(drawing);
        expect(Number.isFinite(result.score)).toBe(true);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
        expect(result.passed).toBe(result.score > 0);
      }
    }
  });

  it('explains itself with a stable code exactly when it fails', () => {
    for (const constraint of all) {
      for (const drawing of cases) {
        const result = constraint.evaluate(drawing);
        if (result.passed) {
          expect(result.code).toBeUndefined();
          expect(result.detail).toBeUndefined();
        } else {
          expect(result.code).toBeTruthy();
          expect(result.detail).toBeTruthy();
        }
      }
    }
  });

  it('defaults to weight 1 and carries a weight the blueprint can override', () => {
    expect(all.every((c) => c.weight === 1)).toBe(true);
    expect(strokeCount(2, 2, 3).weight).toBe(3);
    expect(humanLikeness(0.5).weight).toBe(0.5);
  });
});
