import { DRAWING } from '../config/drawing';
import type { BlueprintId, BlueprintTemplate } from './blueprint';
import { BLUEPRINTS } from './blueprints/registry';
import { classifyAspect, extractDiscriminators, type Discriminators } from './discriminators';
import { angleDifference, meanTemplateDistance } from './geometry';
import { normalizeSketch } from './normalize';
import { ramp } from './constraints';
import type { NormalizedDrawing } from './types';

/**
 * Classification and ambiguity rejection (ARCHITECTURE §6.3, SPEC §6.2
 * stages 1 and 2). This stage answers "what did they draw?" and, crucially,
 * "are we sure?" — it never answers the first without the second.
 *
 * Handing a player the wrong object is far worse than handing them nothing: a
 * failed sketch is the player's fault and teaches them the shape, a misread
 * one is the game's fault and teaches them the game is unreliable. When in
 * doubt, this refuses.
 */

export interface CandidateScore {
  readonly blueprintId: BlueprintId;
  /** Soft score, 0..1. */
  readonly score: number;
}

export type Classification =
  | {
      readonly kind: 'match';
      readonly blueprint: BlueprintTemplate;
      readonly score: number;
      /** Every candidate that survived the hard filter, best first. */
      readonly ranked: readonly CandidateScore[];
    }
  | {
      readonly kind: 'rejected';
      readonly reason: 'below-floor' | 'ambiguous';
      readonly bestCandidate?: BlueprintId;
      readonly ranked: readonly CandidateScore[];
    };

export function classify(
  drawing: NormalizedDrawing,
  registry: readonly BlueprintTemplate[] = BLUEPRINTS,
): Classification {
  const measured = extractDiscriminators(drawing);

  // Stage 1a — the hard filter. A candidate that disagrees on stroke count,
  // crossing or closure is not a near miss; it is a different shape.
  const survivors = registry.filter((b) => passesHardFilter(measured, b.discriminators));

  // Stage 1b — the soft score over what is left.
  const ranked = survivors
    .map((blueprint) => ({
      blueprintId: blueprint.id,
      score: softScore(drawing, measured, blueprint),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const runnerUp = ranked[1];
  if (!best) return { kind: 'rejected', reason: 'below-floor', ranked };

  // Stage 2 — rejection. Both tests are independent and either one refuses.
  if (best.score < DRAWING.recognitionFloor) {
    return { kind: 'rejected', reason: 'below-floor', bestCandidate: best.blueprintId, ranked };
  }
  if (runnerUp && best.score - runnerUp.score < DRAWING.ambiguityMargin) {
    return { kind: 'rejected', reason: 'ambiguous', bestCandidate: best.blueprintId, ranked };
  }

  const blueprint = survivors.find((b) => b.id === best.blueprintId);
  if (!blueprint) return { kind: 'rejected', reason: 'below-floor', ranked };
  return { kind: 'match', blueprint, score: best.score, ranked };
}

function passesHardFilter(measured: Discriminators, declared: Discriminators): boolean {
  return (
    measured.strokeCount === declared.strokeCount &&
    measured.hasIntersection === declared.hasIntersection &&
    measured.hasClosure === declared.hasClosure
  );
}

/**
 * Weighted agreement on the whole shape, its proportions, and its orientation.
 * Cheap: the discriminators are already extracted, and the template comparison
 * runs over the 32 resampled points per stroke that normalization produced.
 */
function softScore(
  drawing: NormalizedDrawing,
  measured: Discriminators,
  blueprint: BlueprintTemplate,
): number {
  const { templateWeight, aspectWeight, angleWeight, maxTemplateDistance } = DRAWING.classify;

  const template = normalizeSketch({
    strokes: blueprint.reference.map((points) => ({
      points: points.map((p, i) => ({ x: p.x, y: p.y, t: i })),
      durationMs: 0,
    })),
    durationMs: 0,
  });
  const distance = meanTemplateDistance(
    drawing.strokes.map((s) => s.points),
    template.strokes.map((s) => s.points),
  );

  const shape = ramp(distance, 0, maxTemplateDistance);
  const aspect =
    measured.aspect === classifyAspect(drawing.aspect) &&
    measured.aspect === blueprint.discriminators.aspect
      ? 1
      : 0;
  return (
    templateWeight * shape +
    aspectWeight * aspect +
    angleWeight * angleAgreement(measured, blueprint)
  );
}

/** 1 when every stroke points the way the blueprint says, 0 at right angles to it. */
function angleAgreement(measured: Discriminators, blueprint: BlueprintTemplate): number {
  const declared = blueprint.discriminators.dominantAngles;
  if (declared.length === 0) return 1;
  let total = 0;
  for (let i = 0; i < declared.length; i++) {
    const want = declared[i];
    const got = measured.dominantAngles[i];
    if (want === undefined || got === undefined) continue;
    total += 1 - angleDifference(got, want) / (Math.PI / 2);
  }
  return total / declared.length;
}
