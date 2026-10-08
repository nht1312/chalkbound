import { describe, expect, it } from 'vitest';
import {
  angleDifference,
  canonicalAngle,
  closureRatio,
  dominantAngle,
  endpointDistance,
  endpointGap,
  polylineCrossing,
  straightness,
} from './geometry';
import type { Point2 } from './types';

const deg = (d: number): number => (d * Math.PI) / 180;
const toDeg = (r: number): number => (r * 180) / Math.PI;

/** `count` points along a straight segment, endpoints included. */
function line(from: Point2, to: Point2, count = 9): Point2[] {
  return Array.from({ length: count }, (_, i) => {
    const f = i / (count - 1);
    return { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f };
  });
}

/** `count` points around a circle, first point repeated last so it closes. */
function circle(radius = 1, count = 24): Point2[] {
  const points = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return { x: Math.cos(a) * radius, y: Math.sin(a) * radius };
  });
  return [...points, { x: radius, y: 0 }];
}

describe('canonicalAngle', () => {
  it.each([
    ['zero', 0, 0],
    ['vertical down folds to vertical', 90, -90],
    ['vertical up stays', -90, -90],
    ['obtuse folds back', 135, -45],
    ['a full turn is nothing', 180, 0],
    ['beyond a turn wraps', 200, 20],
    ['negative beyond a turn wraps', -200, -20],
  ])('%s: %i deg -> %i deg', (_name, input, expected) => {
    expect(toDeg(canonicalAngle(deg(input)))).toBeCloseTo(expected, 9);
  });

  it('is idempotent and never leaves the canonical range', () => {
    for (let d = -720; d <= 720; d += 7) {
      const once = canonicalAngle(deg(d));
      expect(once).toBeGreaterThanOrEqual(-Math.PI / 2);
      expect(once).toBeLessThan(Math.PI / 2);
      expect(canonicalAngle(once)).toBeCloseTo(once, 12);
    }
  });

  it('treats a non-finite angle as zero rather than propagating NaN', () => {
    expect(canonicalAngle(Number.NaN)).toBe(0);
    expect(canonicalAngle(Infinity)).toBe(0);
  });
});

describe('angleDifference', () => {
  it.each([
    ['identical', 0, 0, 0],
    ['small gap', 10, 25, 15],
    ['across the fold: lines 2 deg apart, not 178', -89, 89, 2],
    ['perpendicular is the maximum', 0, 90, 90],
    ['opposite directions are the same line', 30, 210, 0],
  ])('%s', (_name, a, b, expected) => {
    expect(toDeg(angleDifference(deg(a), deg(b)))).toBeCloseTo(expected, 9);
  });
});

describe('dominantAngle', () => {
  it.each([
    ['vertical', { x: 0, y: -1 }, { x: 0, y: 1 }, -90],
    ['horizontal', { x: -1, y: 0 }, { x: 1, y: 0 }, 0],
    ['rising diagonal', { x: -1, y: -1 }, { x: 1, y: 1 }, 45],
    ['falling diagonal', { x: -1, y: 1 }, { x: 1, y: -1 }, -45],
  ])('reads %s', (_name, from, to, expected) => {
    expect(toDeg(dominantAngle(line(from, to)))).toBeCloseTo(expected, 6);
  });

  it('does not depend on draw direction', () => {
    const points = line({ x: -1, y: -0.4 }, { x: 1, y: 0.4 });
    expect(dominantAngle(points)).toBeCloseTo(dominantAngle([...points].reverse()), 12);
  });

  it('follows the bulk of a stroke, not its endpoints', () => {
    // A long horizontal run with one stray point far above its end.
    const points = [...line({ x: 0, y: 0 }, { x: 1, y: 0 }, 20), { x: 1.02, y: 0.25 }];
    expect(Math.abs(toDeg(dominantAngle(points)))).toBeLessThan(15);
  });

  it('is zero for degenerate input', () => {
    expect(dominantAngle([])).toBe(0);
    expect(dominantAngle([{ x: 1, y: 2 }])).toBe(0);
    expect(
      dominantAngle([
        { x: 1, y: 2 },
        { x: 1, y: 2 },
      ]),
    ).toBe(0);
  });
});

describe('straightness', () => {
  it('is 1 for a straight line', () => {
    expect(straightness(line({ x: -1, y: 0 }, { x: 1, y: 0 }))).toBeCloseTo(1, 12);
  });

  it('is 0 for a closed loop and below 1 for a corner', () => {
    expect(straightness(circle())).toBeCloseTo(0, 12);
    // A right-angled corner: endpoints are sqrt(2) apart along a path of 2.
    const corner = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ];
    expect(straightness(corner)).toBeCloseTo(Math.SQRT2 / 2, 12);
  });

  it('calls a dot straight rather than dividing by zero', () => {
    expect(
      straightness([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ]),
    ).toBe(1);
  });
});

describe('closureRatio', () => {
  it('is near 0 for a closed loop and 1 for a line', () => {
    expect(closureRatio(circle())).toBeCloseTo(0, 12);
    expect(closureRatio(line({ x: 0, y: 0 }, { x: 1, y: 0 }))).toBeCloseTo(1, 12);
  });

  it('is scale-free: the same circle large or small reads the same', () => {
    expect(closureRatio(circle(0.05))).toBeCloseTo(closureRatio(circle(5)), 12);
  });

  it('calls a dot open, because a dot is degenerate rather than closed', () => {
    expect(closureRatio([{ x: 0, y: 0 }])).toBe(1);
  });
});

describe('endpointDistance and endpointGap', () => {
  it('measures a stroke across its own ends', () => {
    expect(endpointDistance(line({ x: 0, y: 0 }, { x: 3, y: 4 }))).toBeCloseTo(5, 12);
  });

  it('takes the closest of all four endpoint pairings, whatever the draw order', () => {
    const a = line({ x: 0, y: 0 }, { x: 1, y: 0 });
    const b = line({ x: 1.1, y: 0 }, { x: 2, y: 0 });
    expect(endpointGap(a, b)).toBeCloseTo(0.1, 12);
    expect(endpointGap(a, [...b].reverse())).toBeCloseTo(0.1, 12);
    expect(endpointGap([...a].reverse(), b)).toBeCloseTo(0.1, 12);
  });

  it('is Infinity when either stroke has no points', () => {
    expect(endpointGap([], line({ x: 0, y: 0 }, { x: 1, y: 0 }))).toBe(Infinity);
  });
});

describe('polylineCrossing', () => {
  const blade = (): Point2[] => line({ x: 0, y: -0.5 }, { x: 0, y: 0.5 }, 11);
  const guardAt = (y: number): Point2[] => line({ x: -0.2, y }, { x: 0.2, y }, 5);

  it('locates a crossing along both strokes', () => {
    const hit = polylineCrossing(blade(), guardAt(-0.3));
    expect(hit?.atA).toBeCloseTo(0.2, 9); // 0.2 up a 1.0 blade
    expect(hit?.atB).toBeCloseTo(0.5, 9); // halfway across the guard
  });

  it('measures from the low end, so draw direction cannot move the crossing', () => {
    const expected = polylineCrossing(blade(), guardAt(-0.3));
    for (const [a, b] of [
      [[...blade()].reverse(), guardAt(-0.3)],
      [blade(), [...guardAt(-0.3)].reverse()],
      [[...blade()].reverse(), [...guardAt(-0.3)].reverse()],
    ] as const) {
      const hit = polylineCrossing(a, b);
      expect(hit?.atA).toBeCloseTo(expected?.atA ?? NaN, 9);
      expect(hit?.atB).toBeCloseTo(expected?.atB ?? NaN, 9);
    }
  });

  it('distinguishes a guard low on the blade from one high on it', () => {
    expect(polylineCrossing(blade(), guardAt(-0.3))?.atA).toBeCloseTo(0.2, 9);
    expect(polylineCrossing(blade(), guardAt(0.3))?.atA).toBeCloseTo(0.8, 9);
  });

  it('returns null when the strokes miss, are parallel, or are degenerate', () => {
    expect(polylineCrossing(blade(), line({ x: 0.3, y: -0.2 }, { x: 0.9, y: -0.2 }))).toBeNull();
    expect(polylineCrossing(blade(), line({ x: 0.3, y: -0.5 }, { x: 0.3, y: 0.5 }))).toBeNull();
    expect(polylineCrossing(blade(), [{ x: 0, y: 0 }])).toBeNull();
    expect(polylineCrossing(blade(), [])).toBeNull();
  });

  it('reports the first crossing along A when a stroke crosses twice', () => {
    const zigzag = [
      { x: -0.2, y: -0.4 },
      { x: 0.2, y: -0.2 },
      { x: -0.2, y: 0 },
    ];
    expect(polylineCrossing(blade(), zigzag)?.atA).toBeCloseTo(0.2, 2);
  });
});
