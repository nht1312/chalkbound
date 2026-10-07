import { describe, expect, it } from 'vitest';
import { DRAWING } from '../config/drawing';
import { normalizeSketch, resampleStroke } from './normalize';
import type { PlanePoint, Sketch, Stroke } from './types';

const N = DRAWING.resamplePoints;

/** A stroke through the given (x, y) points, 10 ms apart. */
function stroke(...xy: [number, number][]): Stroke {
  const points: PlanePoint[] = xy.map(([x, y], i) => ({ x, y, t: i * 10 }));
  return { points, durationMs: (xy.length - 1) * 10 };
}
const sketch = (...strokes: Stroke[]): Sketch => ({ strokes, durationMs: 900 });

/** A sword: tall blade, short guard crossing its lower third (plane metres). */
const sword = sketch(
  stroke([0, 0.3], [0, 0.1], [0, -0.1], [0, -0.3]),
  stroke([-0.08, -0.15], [0.08, -0.15]),
);

const transform = (s: Sketch, f: (p: PlanePoint) => PlanePoint): Sketch => ({
  ...s,
  strokes: s.strokes.map((st) => ({ ...st, points: st.points.map(f) })),
});

function expectSameShape(a: Sketch, b: Sketch): void {
  const na = normalizeSketch(a);
  const nb = normalizeSketch(b);
  na.strokes.forEach((st, i) =>
    st.points.forEach((p, j) => {
      const q = nb.strokes[i]?.points[j];
      expect(p.x).toBeCloseTo(q?.x ?? NaN, 9);
      expect(p.y).toBeCloseTo(q?.y ?? NaN, 9);
    }),
  );
}

describe('resampleStroke', () => {
  it('produces exactly N points, evenly spaced, keeping both endpoints', () => {
    // Unevenly sampled: a long first segment, then many tiny ones.
    const pts = resampleStroke(stroke([0, 0], [1, 0], [1.01, 0], [1.02, 0], [1.03, 0]).points, N);
    expect(pts).toHaveLength(N);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts.at(-1)?.x).toBeCloseTo(1.03, 9);
    const spacing = 1.03 / (N - 1);
    for (let i = 1; i < N; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      expect(Math.hypot((b?.x ?? 0) - (a?.x ?? 0), (b?.y ?? 0) - (a?.y ?? 0))).toBeCloseTo(
        spacing,
        9,
      );
    }
  });

  it('follows corners: equal spacing along the path, not across it', () => {
    const pts = resampleStroke(stroke([0, 0], [1, 0], [1, 1]).points, 5);
    expect(pts.map((p) => [Number(p.x.toFixed(9)), Number(p.y.toFixed(9))])).toEqual([
      [0, 0],
      [0.5, 0],
      [1, 0],
      [1, 0.5],
      [1, 1],
    ]);
  });

  it('turns a single point or a zero-length stroke into N copies of that point', () => {
    expect(resampleStroke(stroke([2, 3]).points, N)).toEqual(Array(N).fill({ x: 2, y: 3 }));
    expect(resampleStroke(stroke([2, 3], [2, 3]).points, N)).toEqual(Array(N).fill({ x: 2, y: 3 }));
  });
});

describe('normalizeSketch', () => {
  it('centres the whole drawing and scales its longer axis to span 1', () => {
    const n = normalizeSketch(sword);
    expect(n.height).toBeCloseTo(1, 9);
    expect(n.width).toBeCloseTo(0.16 / 0.6, 9);
    const all = n.strokes.flatMap((s) => s.points);
    expect(Math.min(...all.map((p) => p.y))).toBeCloseTo(-0.5, 9);
    expect(Math.max(...all.map((p) => p.y))).toBeCloseTo(0.5, 9);
    expect(Math.min(...all.map((p) => p.x)) + Math.max(...all.map((p) => p.x))).toBeCloseTo(0, 9);
  });

  it('uses one bounding box for all strokes, preserving their relative placement', () => {
    const guard = normalizeSketch(sword).strokes[1];
    // Guard at y = -0.15 in a blade spanning [-0.3, 0.3]: a quarter of the way up.
    expect(guard?.points[0]?.y).toBeCloseTo(-0.25, 9);
  });

  it('is translation-invariant', () => {
    expectSameShape(
      sword,
      transform(sword, (p) => ({ ...p, x: p.x + 5, y: p.y - 2 })),
    );
  });

  it('is scale-invariant', () => {
    expectSameShape(
      sword,
      transform(sword, (p) => ({ ...p, x: p.x * 3.5, y: p.y * 3.5 })),
    );
  });

  it('is rotation-sensitive: a sideways sword is a different drawing', () => {
    const sideways = normalizeSketch(transform(sword, (p) => ({ ...p, x: p.y, y: -p.x })));
    const upright = normalizeSketch(sword);
    expect(upright.aspect).toBeLessThan(1); // tall
    expect(sideways.aspect).toBeGreaterThan(1); // wide
  });

  it('reports aspect as width / height and keeps stroke lengths in normalized units', () => {
    const n = normalizeSketch(sword);
    expect(n.aspect).toBeCloseTo(n.width / n.height, 9);
    expect(n.strokes[0]?.length).toBeCloseTo(1, 9); // the blade spans the full height
    expect(n.strokes[1]?.length).toBeCloseTo(0.16 / 0.6, 9);
  });

  it('carries durations through unchanged', () => {
    const n = normalizeSketch(sword);
    expect(n.durationMs).toBe(900);
    expect(n.strokes[0]?.durationMs).toBe(30);
  });

  it('keeps a degenerate drawing (all points coincide) finite instead of dividing by zero', () => {
    const n = normalizeSketch(sketch(stroke([1, 1]), stroke([1, 1], [1, 1])));
    for (const p of n.strokes.flatMap((s) => s.points)) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
    expect(n.width).toBe(0);
    expect(n.height).toBe(0);
    expect(Number.isFinite(n.aspect)).toBe(true);
  });

  it('handles a perfectly horizontal line (zero height) with a finite, wide aspect', () => {
    const n = normalizeSketch(sketch(stroke([0, 0], [1, 0])));
    expect(n.width).toBeCloseTo(1, 9);
    expect(n.height).toBe(0);
    expect(Number.isFinite(n.aspect)).toBe(true);
    expect(n.aspect).toBeGreaterThan(10);
  });
});
