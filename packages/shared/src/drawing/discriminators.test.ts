import { describe, expect, it } from 'vitest';
import { classifyAspect, discriminatorDistance, extractDiscriminators } from './discriminators';
import { normalizeSketch } from './normalize';
import type { PlanePoint, Sketch, Stroke } from './types';

const toDeg = (r: number): number => (r * 180) / Math.PI;

function stroke(points: readonly (readonly [number, number])[]): Stroke {
  const sampled: PlanePoint[] = points.map(([x, y], i) => ({ x, y, t: i * 16 }));
  return { points: sampled, durationMs: (points.length - 1) * 16 };
}

function segment(
  from: readonly [number, number],
  to: readonly [number, number],
  count = 12,
): [number, number][] {
  return Array.from({ length: count }, (_, i) => {
    const f = i / (count - 1);
    return [from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f];
  });
}

function ring(radius: number, count = 24): [number, number][] {
  const points: [number, number][] = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return [Math.cos(a) * radius, Math.sin(a) * radius];
  });
  return [...points, [radius, 0]];
}

const sketch = (...strokes: Stroke[]): Sketch => ({ strokes, durationMs: 900 });
const read = (s: Sketch) => extractDiscriminators(normalizeSketch(s));

/** The sword: a tall blade with a short guard crossing it low (plane metres). */
const SWORD = sketch(
  stroke(segment([0, -0.3], [0, 0.3])),
  stroke(segment([-0.09, -0.18], [0.09, -0.18])),
);

describe('classifyAspect', () => {
  it.each([
    ['a tall box', 0.4, 'tall'],
    ['just inside tall', 0.8, 'tall'],
    ['a square box', 1, 'square'],
    ['just inside square', 1.1, 'square'],
    ['a wide box', 3, 'wide'],
    ['a flat line, where height is zero', Infinity, 'wide'],
  ])('calls %s %s', (_name, aspect, expected) => {
    expect(classifyAspect(aspect)).toBe(expected);
  });
});

describe('extractDiscriminators', () => {
  it('reads a sword: two strokes, crossing, open, tall, vertical then horizontal', () => {
    const d = read(SWORD);
    expect(d.strokeCount).toBe(2);
    expect(d.hasIntersection).toBe(true);
    expect(d.hasClosure).toBe(false);
    expect(d.aspect).toBe('tall');
    expect(toDeg(d.dominantAngles[0] ?? NaN)).toBeCloseTo(-90, 4);
    expect(toDeg(d.dominantAngles[1] ?? NaN)).toBeCloseTo(0, 4);
  });

  it('reads a circle: one closed stroke, square, no crossing', () => {
    const d = read(sketch(stroke(ring(0.25))));
    expect(d).toMatchObject({
      strokeCount: 1,
      hasIntersection: false,
      hasClosure: true,
      aspect: 'square',
    });
  });

  it('reads a single line: open, no crossing', () => {
    const d = read(sketch(stroke(segment([0, -0.3], [0, 0.3]))));
    expect(d).toMatchObject({ strokeCount: 1, hasIntersection: false, hasClosure: false });
  });

  it('does not call two parallel strokes an intersection', () => {
    const d = read(
      sketch(stroke(segment([-0.1, -0.3], [-0.1, 0.3])), stroke(segment([0.1, -0.3], [0.1, 0.3]))),
    );
    expect(d.hasIntersection).toBe(false);
  });

  it('counts a crossing between strokes but not a stroke crossing itself', () => {
    // A single stroke looping over itself: self-intersection is not a crossing.
    const loop = stroke([
      ...segment([-0.2, 0], [0.2, 0], 6),
      ...segment([0.2, 0], [0, 0.2], 6),
      ...segment([0, 0.2], [0, -0.2], 6),
    ]);
    expect(read(sketch(loop)).hasIntersection).toBe(false);
  });

  it('survives an empty sketch without throwing', () => {
    expect(read(sketch())).toMatchObject({
      strokeCount: 0,
      hasIntersection: false,
      hasClosure: false,
      dominantAngles: [],
    });
  });

  it('is invariant to where and how large the sketch was drawn', () => {
    // The same sword, moved across the plane and drawn at a third the size.
    const moved = sketch(
      stroke(segment([0.2, 0.1], [0.2, 0.3])),
      stroke(segment([0.17, 0.14], [0.23, 0.14])),
    );
    const a = read(SWORD);
    const b = read(moved);
    expect(b).toMatchObject({
      strokeCount: a.strokeCount,
      hasIntersection: a.hasIntersection,
      hasClosure: a.hasClosure,
      aspect: a.aspect,
    });
    b.dominantAngles.forEach((angle, i) =>
      expect(angle).toBeCloseTo(a.dominantAngles[i] ?? NaN, 9),
    );
  });
});

describe('discriminatorDistance', () => {
  const sword = read(SWORD);
  const circle = read(sketch(stroke(ring(0.25))));
  const line = read(sketch(stroke(segment([0, -0.3], [0, 0.3]))));

  it('is 0 against itself', () => {
    expect(discriminatorDistance(sword, sword)).toBe(0);
  });

  it('separates shapes SPEC 6.3 requires to be distinct', () => {
    // Sword vs circle: stroke count, intersection, closure and aspect all differ.
    expect(discriminatorDistance(sword, circle)).toBeGreaterThanOrEqual(2);
    expect(discriminatorDistance(sword, line)).toBeGreaterThanOrEqual(2);
    expect(discriminatorDistance(circle, line)).toBeGreaterThanOrEqual(2);
  });

  it('is symmetric', () => {
    expect(discriminatorDistance(circle, sword)).toBe(discriminatorDistance(sword, circle));
  });

  it('counts orientation when a shared stroke turns by more than 30 degrees', () => {
    const upright = read(sketch(stroke(segment([0, -0.3], [0, 0.3]))));
    const tilted = read(sketch(stroke(segment([-0.2, -0.2], [0.2, 0.2]))));
    // Same stroke count, no crossing, no closure; aspect and orientation differ.
    expect(discriminatorDistance(upright, tilted)).toBe(2);
  });

  it('does not count orientation for a stroke merely drawn the other way round', () => {
    const down = read(sketch(stroke(segment([0, 0.3], [0, -0.3]))));
    const up = read(sketch(stroke(segment([0, -0.3], [0, 0.3]))));
    expect(discriminatorDistance(down, up)).toBe(0);
  });
});
