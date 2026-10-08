import type { BlueprintId, DrawingOutcome, Quality, RejectionReason } from './blueprint';
import type { FailureCode } from './constraints';

/**
 * What the authority tells the client about a submitted sketch (plan T4).
 *
 * This is {@link DrawingOutcome} narrowed to what is worth sending. A failed
 * constraint travels as its stable {@link FailureCode} and nothing else: the
 * `kind` identifies an internal constraint instance and the `detail` is
 * English. Player-facing wording is the client's job (plan T7), so the
 * authority never ships copy and the two cannot drift.
 */
export type DrawingResultOutcome =
  | {
      readonly kind: 'created';
      readonly blueprintId: BlueprintId;
      readonly accuracy: number;
      readonly quality: Quality;
    }
  | {
      readonly kind: 'smudged';
      readonly blueprintId: BlueprintId;
      readonly accuracy: number;
      readonly failures: readonly FailureCode[];
    }
  | {
      readonly kind: 'unrecognized';
      readonly bestCandidate?: BlueprintId;
      readonly reason: RejectionReason;
    }
  | {
      readonly kind: 'unaffordable';
      readonly blueprintId: BlueprintId;
      readonly required: number;
      readonly held: number;
    };

export interface DrawingResult {
  readonly outcome: DrawingResultOutcome;
  /**
   * Chalk the authority actually took (SPEC §6.6). Capped at what the player
   * held, so it can be less than the outcome's nominal cost and chalk never
   * goes negative (plan decision 3). There is no refund path.
   */
  readonly chalkDebited: number;
}

/** Narrows a validator outcome to the form that travels. */
export function toDrawingResultOutcome(outcome: DrawingOutcome): DrawingResultOutcome {
  if (outcome.kind !== 'smudged') return outcome;
  return {
    kind: 'smudged',
    blueprintId: outcome.blueprintId,
    accuracy: outcome.accuracy,
    failures: outcome.failures.map((failure) => failure.code),
  };
}
