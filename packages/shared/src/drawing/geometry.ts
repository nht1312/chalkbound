import { pathLength } from './normalize';
import type { Point2 } from './types';

/**
 * Geometric measures shared by the discriminators (ARCHITECTURE §6.3) and the
 * constraint library (§6.4). Everything here is pure and undirected: a stroke
 * drawn top-down and the same stroke drawn bottom-up measure identically,
 * because draw direction is not part of a shape (plan decision 7).
 */

/** Folds an angle into [-pi/2, pi/2), the canonical range for an undirected line. */
export function canonicalAngle(radians: number): number {
  if (!Number.isFinite(radians)) return 0;
  let a = radians % Math.PI;
  if (a >= Math.PI / 2) a -= Math.PI;
  if (a < -Math.PI / 2) a += Math.PI;
  return a;
}

/** Smallest angle between two undirected lines, in [0, pi/2]. */
export function angleDifference(a: number, b: number): number {
  return Math.abs(canonicalAngle(a - b));
}

/**
 * Principal axis of a point cloud, in [-pi/2, pi/2). Uses second moments
 * rather than the endpoint chord, so a wobbly stroke still reports the
 * orientation a player would read off it. Vertical is -pi/2, horizontal is 0.
 */
export function dominantAngle(points: readonly Point2[]): number {
  const n = points.length;
  if (n < 2) return 0;

  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= n;
  cy /= n;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  if (sxx + syy === 0) return 0; // every point coincident
  return canonicalAngle(0.5 * Math.atan2(2 * sxy, sxx - syy));
}

/** Endpoint distance over path length: 1 for a perfect line, 0 for a closed loop. */
export function straightness(points: readonly Point2[]): number {
  const total = pathLength(points);
  if (total === 0) return 1; // a dot bends nowhere
  return Math.min(1, endpointDistance(points) / total);
}

/** Endpoint gap over path length: 0 for a perfectly closed loop, 1 for a line. */
export function closureRatio(points: readonly Point2[]): number {
  const total = pathLength(points);
  if (total === 0) return 1; // a dot is degenerate, not closed
  return Math.min(1, endpointDistance(points) / total);
}

/** Distance between a stroke's own first and last point. */
export function endpointDistance(points: readonly Point2[]): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return 0;
  return Math.hypot(last.x - first.x, last.y - first.y);
}

/**
 * Closest approach between an endpoint of `a` and an endpoint of `b`. All four
 * pairings are considered, so "these two strokes meet" does not depend on
 * which end of either the player started from.
 */
export function endpointGap(a: readonly Point2[], b: readonly Point2[]): number {
  const ends = (p: readonly Point2[]): Point2[] => {
    const first = p[0];
    const last = p[p.length - 1];
    return first && last ? [first, last] : [];
  };
  let best = Infinity;
  for (const p of ends(a)) {
    for (const q of ends(b)) {
      best = Math.min(best, Math.hypot(q.x - p.x, q.y - p.y));
    }
  }
  return best;
}

export interface Crossing {
  /** Where the crossing sits along A, 0..1 by arc length from A's low end. */
  readonly atA: number;
  /** Where it sits along B, on the same convention. */
  readonly atB: number;
}

/**
 * First crossing of two polylines, or null if they never cross.
 *
 * Positions are measured from each stroke's **low end** — the endpoint with the
 * smaller y, ties broken by smaller x — not from the point the player drew
 * first. So on a vertical blade, 0 is the hilt and 1 is the tip whichever way
 * it was drawn, and a band like [0.1, 0.4] means "crosses low on the blade".
 */
export function polylineCrossing(a: readonly Point2[], b: readonly Point2[]): Crossing | null {
  const cumA = cumulativeLengths(a);
  const cumB = cumulativeLengths(b);
  const totalA = cumA[cumA.length - 1] ?? 0;
  const totalB = cumB[cumB.length - 1] ?? 0;
  if (totalA === 0 || totalB === 0) return null;

  let best: Crossing | null = null;
  for (let i = 1; i < a.length; i++) {
    const a0 = a[i - 1];
    const a1 = a[i];
    if (!a0 || !a1) continue;
    for (let j = 1; j < b.length; j++) {
      const b0 = b[j - 1];
      const b1 = b[j];
      if (!b0 || !b1) continue;
      const hit = segmentIntersection(a0, a1, b0, b1);
      if (!hit) continue;

      const startA = cumA[i - 1] ?? 0;
      const startB = cumB[j - 1] ?? 0;
      const crossing: Crossing = {
        atA: fromLowEnd(a, (startA + hit.t * ((cumA[i] ?? 0) - startA)) / totalA),
        atB: fromLowEnd(b, (startB + hit.u * ((cumB[j] ?? 0) - startB)) / totalB),
      };
      if (!best || crossing.atA < best.atA) best = crossing;
    }
  }
  return best;
}

/** True when the polyline was drawn from its high end toward its low end. */
function isDrawnDownward(points: readonly Point2[]): boolean {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return false;
  return last.y === first.y ? last.x < first.x : last.y < first.y;
}

function fromLowEnd(points: readonly Point2[], raw: number): number {
  return isDrawnDownward(points) ? 1 - raw : raw;
}

function cumulativeLengths(points: readonly Point2[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const previous = out[i - 1] ?? 0;
    out.push(a && b ? previous + Math.hypot(b.x - a.x, b.y - a.y) : previous);
  }
  return out;
}

/** Parametric positions of a segment crossing, or null if they miss or are parallel. */
function segmentIntersection(
  p1: Point2,
  p2: Point2,
  p3: Point2,
  p4: Point2,
): { t: number; u: number } | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const denominator = d1x * d2y - d1y * d2x;
  if (denominator === 0) return null; // parallel, or a zero-length segment

  const ox = p3.x - p1.x;
  const oy = p3.y - p1.y;
  const t = (ox * d2y - oy * d2x) / denominator;
  const u = (ox * d1y - oy * d1x) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}
