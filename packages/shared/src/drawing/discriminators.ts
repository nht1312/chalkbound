import { DRAWING } from '../config/drawing';
import { angleDifference, closureRatio, dominantAngle, polylineCrossing } from './geometry';
import type { NormalizedDrawing } from './types';

export type AspectClass = 'tall' | 'square' | 'wide';

/**
 * Cheap order-of-magnitude features, computed once per sketch and shared by
 * every candidate comparison (ARCHITECTURE §6.3). They correspond exactly to
 * the distinctness rules in SPEC §6.3, which is what keeps the design document
 * and the code describing the same thing.
 */
export interface Discriminators {
  readonly strokeCount: number;
  /** Any stroke crosses any OTHER stroke. Self-intersection does not count. */
  readonly hasIntersection: boolean;
  /** Any stroke returns to its own start. */
  readonly hasClosure: boolean;
  readonly aspect: AspectClass;
  /** Principal axis per stroke, radians in [-pi/2, pi/2), in stroke order. */
  readonly dominantAngles: readonly number[];
}

export function extractDiscriminators(drawing: NormalizedDrawing): Discriminators {
  const strokes = drawing.strokes;
  return {
    strokeCount: strokes.length,
    hasIntersection: anyPairCrosses(drawing),
    hasClosure: strokes.some((s) => closureRatio(s.points) < DRAWING.closureGapRatio),
    aspect: classifyAspect(drawing.aspect),
    dominantAngles: strokes.map((s) => dominantAngle(s.points)),
  };
}

export function classifyAspect(aspect: number): AspectClass {
  const band = DRAWING.squareAspectBand;
  if (!Number.isFinite(aspect) || aspect > band) return 'wide';
  if (aspect < 1 / band) return 'tall';
  return 'square';
}

function anyPairCrosses(drawing: NormalizedDrawing): boolean {
  const strokes = drawing.strokes;
  for (let i = 0; i < strokes.length; i++) {
    for (let j = i + 1; j < strokes.length; j++) {
      const a = strokes[i];
      const b = strokes[j];
      if (a && b && polylineCrossing(a.points, b.points)) return true;
    }
  }
  return false;
}

/**
 * How many of the five discriminators two shapes differ on. SPEC §6.3 requires
 * at least two for any pair of blueprints; the distinctness test in T3 uses
 * this over the registry.
 */
export function discriminatorDistance(a: Discriminators, b: Discriminators): number {
  let differences = 0;
  if (a.strokeCount !== b.strokeCount) differences++;
  if (a.hasIntersection !== b.hasIntersection) differences++;
  if (a.hasClosure !== b.hasClosure) differences++;
  if (a.aspect !== b.aspect) differences++;
  if (anglesDiffer(a.dominantAngles, b.dominantAngles)) differences++;
  return differences;
}

/** Orientation counts as different when any shared stroke index differs by > 30 degrees. */
function anglesDiffer(a: readonly number[], b: readonly number[]): boolean {
  const tolerance = (30 * Math.PI) / 180;
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined || y === undefined) continue;
    if (angleDifference(x, y) > tolerance) return true;
  }
  return false;
}
