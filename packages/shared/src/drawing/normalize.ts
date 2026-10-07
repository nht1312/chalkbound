import { DRAWING } from '../config/drawing';
import type { NormalizedDrawing, NormalizedStroke, Point2, Sketch } from './types';

/** Extents below this (plane metres) count as zero: a dot, or a perfectly flat line. */
const MIN_EXTENT = 1e-3;

/**
 * Resamples a polyline to exactly `count` points evenly spaced by arc length,
 * keeping both endpoints. A single point or zero-length path becomes `count`
 * copies of its first point.
 */
export function resampleStroke(points: readonly Point2[], count: number): Point2[] {
  const first = points[0] ?? { x: 0, y: 0 };
  const total = pathLength(points);
  if (points.length < 2 || total === 0) {
    return Array.from({ length: count }, () => ({ x: first.x, y: first.y }));
  }

  const step = total / (count - 1);
  const out: Point2[] = [{ x: first.x, y: first.y }];
  let carried = 0; // distance already walked along the current segment
  let prev = first;
  for (let i = 1; i < points.length && out.length < count - 1; i++) {
    const next = points[i] ?? prev;
    let segment = Math.hypot(next.x - prev.x, next.y - prev.y);
    let start = prev;
    while (carried + segment >= step && out.length < count - 1) {
      const f = (step - carried) / segment;
      const p = { x: start.x + (next.x - start.x) * f, y: start.y + (next.y - start.y) * f };
      out.push(p);
      segment -= step - carried;
      start = p;
      carried = 0;
    }
    carried += segment;
    prev = next;
  }
  const last = points[points.length - 1] ?? first;
  out.push({ x: last.x, y: last.y }); // exact endpoint, immune to rounding drift
  return out;
}

/**
 * Normalizes a sketch (ARCHITECTURE §6.2): resample every stroke, then centre
 * the whole drawing's bounding box on the origin and scale it uniformly so its
 * longer axis spans 1. Position- and scale-invariant, deliberately NOT
 * rotation-invariant: a vertical blade and a horizontal one differ.
 */
export function normalizeSketch(sketch: Sketch): NormalizedDrawing {
  const resampled = sketch.strokes.map((s) => resampleStroke(s.points, DRAWING.resamplePoints));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of resampled.flat()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) minX = minY = maxX = maxY = 0; // no points at all

  const rawWidth = maxX - minX;
  const rawHeight = maxY - minY;
  const longest = Math.max(rawWidth, rawHeight);
  const scale = longest < MIN_EXTENT ? 0 : 1 / longest;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const strokes: NormalizedStroke[] = resampled.map((points, i) => {
    const scaled = points.map((p) => ({ x: (p.x - cx) * scale, y: (p.y - cy) * scale }));
    return {
      points: scaled,
      length: pathLength(scaled),
      durationMs: sketch.strokes[i]?.durationMs ?? 0,
    };
  });

  const width = rawWidth * scale;
  const height = rawHeight * scale;
  return {
    strokes,
    width,
    height,
    aspect: rawWidth / Math.max(rawHeight, MIN_EXTENT),
    durationMs: sketch.durationMs,
    source: sketch,
  };
}

export function pathLength(points: readonly Point2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}
