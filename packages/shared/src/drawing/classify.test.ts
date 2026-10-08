import { describe, expect, it } from 'vitest';
import { DRAWING } from '../config/drawing';
import type { BlueprintId, BlueprintTemplate } from './blueprint';
import { BLUEPRINTS } from './blueprints/registry';
import { SWORD } from './blueprints/sword';
import { classify } from './classify';
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

const read = (s: Sketch) => classify(normalizeSketch(s));

function trace(seed: number, ...waypoints: Point2[][]): Sketch {
  const rng = seededRandom(seed);
  return handSketch(waypoints.map((w) => handStroke(w, rng)));
}

const p = (x: number, y: number): Point2 => ({ x, y });

/** Moves and resizes a sketch without redrawing it. */
const transform = (sketch: Sketch, f: (q: Point2) => Point2): Sketch => ({
  ...sketch,
  strokes: sketch.strokes.map((stroke) => ({
    ...stroke,
    points: stroke.points.map((q) => ({ ...f(q), t: q.t })),
  })),
});

describe('classify: the hard discriminator filter', () => {
  it('recognizes a cleanly drawn sword', () => {
    const result = read(swordSketch(1));
    expect(result.kind).toBe('match');
    if (result.kind !== 'match') return;
    expect(result.blueprint.id).toBe('sword');
    expect(result.score).toBeGreaterThan(0.9);
  });

  it.each([
    ['a single line', [[p(0, -0.3), p(0, 0.3)]]],
    ['a circle', [ringWaypoints(0.25)]],
    ['a scribble', [scribbleWaypoints(7)]],
    [
      'two parallel lines, which never cross',
      [
        [p(-0.1, -0.3), p(-0.1, 0.3)],
        [p(0.1, -0.3), p(0.1, 0.3)],
      ],
    ],
    [
      'an L, two strokes that only touch',
      [
        [p(-0.2, 0.2), p(-0.2, -0.2)],
        [p(-0.2, -0.2), p(0.2, -0.2)],
      ],
    ],
    [
      'a rectangle, four strokes',
      [
        [p(-0.2, -0.3), p(0.2, -0.3)],
        [p(0.2, -0.3), p(0.2, 0.3)],
        [p(0.2, 0.3), p(-0.2, 0.3)],
        [p(-0.2, 0.3), p(-0.2, -0.3)],
      ],
    ],
  ] as const)('refuses %s rather than guessing', (_name, waypoints) => {
    const result = read(trace(3, ...waypoints.map((w) => [...w])));
    expect(result.kind).toBe('rejected');
  });

  it('refuses an empty sketch', () => {
    expect(classify(normalizeSketch({ strokes: [], durationMs: 0 })).kind).toBe('rejected');
  });

  it('names no candidate when nothing survives the filter', () => {
    const result = read(trace(3, [p(0, -0.3), p(0, 0.3)]));
    expect(result.kind === 'rejected' && result.bestCandidate).toBeUndefined();
  });
});

describe('classify: the soft score', () => {
  it('scores a clean sword above a sloppy one', () => {
    const clean = read(swordSketch(2));
    const sloppy = read(swordSketch(2, { guardAt: 0.45, guardRatio: 0.52 }, { wobble: 0.02 }));
    expect(clean.kind === 'match' && clean.score).toBeGreaterThan(
      sloppy.kind === 'match' ? sloppy.score : 1,
    );
  });

  it('is unmoved by where on the plane the sword was drawn, or how large', () => {
    // The same sketch moved and resized, rather than redrawn: a redrawn one
    // would carry a different amount of hand wobble and so score differently,
    // which is the hand's doing and not the classifier's.
    const drawn = swordSketch(4, { length: 0.3 });
    const moved = transform(drawn, (q) => ({ x: q.x * 2.2 - 0.15, y: q.y * 2.2 + 0.2 }));
    const scores = [read(drawn), read(moved)].map((r) => (r.kind === 'match' ? r.score : 0));
    expect(scores[0]).toBeCloseTo(scores[1] ?? NaN, 6);
  });

  it('still reads a sword drawn at a slight tilt', () => {
    expect(read(swordSketch(5, { tiltDeg: 12 })).kind).toBe('match');
  });

  it('refuses an X: two crossing strokes that are not a sword', () => {
    const x = trace(6, [p(-0.25, -0.25), p(0.25, 0.25)], [p(-0.25, 0.25), p(0.25, -0.25)]);
    const result = read(x);
    expect(result.kind).toBe('rejected');
    expect(result.kind === 'rejected' && result.reason).toBe('below-floor');
  });

  it('ranks every surviving candidate, best first', () => {
    const result = read(swordSketch(8));
    expect(result.ranked.map((c) => c.blueprintId)).toEqual(['sword']);
    expect(result.ranked[0]?.score).toBeGreaterThan(DRAWING.recognitionFloor);
  });
});

describe('classify: rejection (SPEC 6.2 stage 2)', () => {
  it('refuses anything below the recognition floor', () => {
    const result = read(
      trace(9, [p(-0.25, -0.25), p(0.25, 0.25)], [p(-0.25, 0.25), p(0.25, -0.25)]),
    );
    expect(result.kind === 'rejected' && result.reason).toBe('below-floor');
    expect(result.ranked[0]?.score).toBeLessThan(DRAWING.recognitionFloor);
  });

  /**
   * With one blueprint the margin can never bite, so it is proved here against
   * a deliberately confusable second one. This is the behaviour Phase 4 relies
   * on, and it must be working before wall and bridge exist.
   */
  describe('the ambiguity margin', () => {
    const DAGGER: BlueprintTemplate = {
      ...SWORD,
      id: 'dagger' as BlueprintId,
      reference: [
        [p(0, 0.5), p(0, -0.5)],
        [p(-0.19, -0.26), p(0.19, -0.26)],
      ],
    };
    const confusable = [SWORD, DAGGER];

    it('refuses a sketch the top two candidates both fit', () => {
      const result = classify(normalizeSketch(swordSketch(10)), confusable);
      expect(result.kind).toBe('rejected');
      expect(result.kind === 'rejected' && result.reason).toBe('ambiguous');
    });

    it('names the best candidate it refused to commit to', () => {
      const result = classify(normalizeSketch(swordSketch(10)), confusable);
      expect(result.kind === 'rejected' && result.bestCandidate).toBe('sword');
    });

    it('still ranks both candidates for the disagreement log', () => {
      const result = classify(normalizeSketch(swordSketch(10)), confusable);
      expect(result.ranked).toHaveLength(2);
      const [best, runnerUp] = result.ranked;
      expect((best?.score ?? 0) - (runnerUp?.score ?? 0)).toBeLessThan(DRAWING.ambiguityMargin);
    });

    it('commits when the runner-up is clearly worse', () => {
      const wideGuard: BlueprintTemplate = {
        ...DAGGER,
        reference: [
          [p(0, 0.5), p(0, -0.5)],
          [p(-0.45, 0.3), p(0.45, 0.3)],
        ],
      };
      const result = classify(normalizeSketch(swordSketch(10)), [SWORD, wideGuard]);
      expect(result.kind).toBe('match');
      expect(result.kind === 'match' && result.blueprint.id).toBe('sword');
    });
  });
});

describe('classify: the registry it is given', () => {
  it('uses the real registry by default', () => {
    expect(BLUEPRINTS).toContain(SWORD);
    expect(read(swordSketch(11)).kind).toBe('match');
  });

  it('recognizes nothing when the registry is empty', () => {
    const result = classify(normalizeSketch(swordSketch(12)), []);
    expect(result).toMatchObject({ kind: 'rejected', reason: 'below-floor', ranked: [] });
  });
});
