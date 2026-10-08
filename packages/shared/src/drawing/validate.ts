import { DRAWING } from '../config/drawing';
import type { BlueprintTemplate, DrawingOutcome, Quality } from './blueprint';
import { classify } from './classify';
import type { ConstraintFailure } from './constraints';
import { normalizeSketch } from './normalize';
import type { NormalizedDrawing, Sketch } from './types';

/**
 * Grading and the four-case outcome (ARCHITECTURE §6.1, SPEC §6.2 stage 3).
 *
 * Pure, and shared by both sides: the client runs it on its own sketch for
 * instant feedback, the authority runs it again on the decoded bytes and its
 * answer is the only one that counts.
 */

export interface Grade {
  /** Weighted mean of the constraint scores, 0..1. */
  readonly accuracy: number;
  /** Every constraint passed **and** accuracy cleared the blueprint's threshold. */
  readonly passed: boolean;
  readonly failures: readonly ConstraintFailure[];
}

/**
 * Runs a blueprint's full constraint set. Both gates matter: a drawing cannot
 * pass by scoring well on average while violating something structural, such
 * as a crossguard that never crosses the blade.
 */
export function grade(drawing: NormalizedDrawing, blueprint: BlueprintTemplate): Grade {
  const failures: ConstraintFailure[] = [];
  let weighted = 0;
  let totalWeight = 0;
  let allPassed = true;

  for (const constraint of blueprint.constraints) {
    const result = constraint.evaluate(drawing);
    // Gates must pass, but they do not score: see `Constraint.gate`.
    if (!constraint.gate) {
      weighted += result.score * constraint.weight;
      totalWeight += constraint.weight;
    }
    if (!result.passed) {
      allPassed = false;
      failures.push({
        kind: constraint.kind,
        code: result.code ?? 'off-template',
        detail: result.detail ?? 'That is not the right shape',
      });
    }
  }

  // A blueprint with nothing to *score* cannot vouch for a drawing, so it does
  // not: refusing is the safe direction.
  if (totalWeight === 0) return { accuracy: 0, passed: false, failures };

  const accuracy = weighted / totalWeight;
  return { accuracy, passed: allPassed && accuracy >= blueprint.minAccuracy, failures };
}

/** Accuracy to visible quality (SPEC §6.5). Accuracy never changes *what* was made. */
export function qualityFor(accuracy: number): Quality {
  if (accuracy > DRAWING.quality.keen) return 'keen';
  if (accuracy >= DRAWING.quality.sound) return 'sound';
  return 'crude';
}

export interface ValidateOptions {
  /** The player's authoritative chalk at the moment of submission. */
  readonly heldChalk: number;
  readonly registry?: readonly BlueprintTemplate[];
}

/**
 * The whole pipeline: normalize, classify, reject, grade, then price it.
 *
 * Affordability is checked **last**, after grading, so a player who drew the
 * shape badly is told that rather than told they are short of chalk — the
 * first teaches them the shape and the second hides the real problem. Both
 * cost the same (SPEC §6.6), so nothing is lost by saying the useful thing.
 */
export function validateSketch(sketch: Sketch, options: ValidateOptions): DrawingOutcome {
  const drawing = normalizeSketch(sketch);
  const classification = options.registry ? classify(drawing, options.registry) : classify(drawing);

  if (classification.kind === 'rejected') {
    const { reason, bestCandidate } = classification;
    return bestCandidate === undefined
      ? { kind: 'unrecognized', reason }
      : { kind: 'unrecognized', reason, bestCandidate };
  }

  const blueprint = classification.blueprint;
  const result = grade(drawing, blueprint);
  if (!result.passed) {
    return {
      kind: 'smudged',
      blueprintId: blueprint.id,
      accuracy: result.accuracy,
      failures: result.failures,
    };
  }

  if (options.heldChalk < blueprint.chalkCost) {
    return {
      kind: 'unaffordable',
      blueprintId: blueprint.id,
      required: blueprint.chalkCost,
      held: options.heldChalk,
    };
  }

  return {
    kind: 'created',
    blueprintId: blueprint.id,
    accuracy: result.accuracy,
    quality: qualityFor(result.accuracy),
  };
}
