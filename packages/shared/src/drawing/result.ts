import { ECONOMY } from '../config/economy';
import type { BlueprintId, DrawingOutcome, Quality, RejectionReason } from './blueprint';
import { blueprintById } from './blueprints/registry';
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

/**
 * What one outcome costs (SPEC §6.6). Cost follows recognition, never
 * precedes it: until the sketch is classified there is no blueprint to price.
 *
 * Every branch costs something. Zero on a failure would make drawing a free
 * practice range and dissolve the scarcity the loop rests on, so a smudge
 * rounds *up* and the two refusals carry a flat fee.
 */
export function chalkCostOf(outcome: DrawingOutcome | DrawingResultOutcome): number {
  switch (outcome.kind) {
    case 'created':
      return blueprintCost(outcome.blueprintId);
    case 'smudged':
      return Math.ceil(blueprintCost(outcome.blueprintId) * ECONOMY.smudgedCostFraction);
    case 'unrecognized':
      return ECONOMY.unrecognizedCost;
    case 'unaffordable':
      return ECONOMY.unaffordableCost;
  }
}

/**
 * What the authority actually takes: the cost, capped at what the player
 * holds (plan decision 3). A failure can leave the meter at zero but never
 * below it, and there is no debt and no refund.
 */
export function chalkDebitFor(
  outcome: DrawingOutcome | DrawingResultOutcome,
  held: number,
): number {
  return Math.min(chalkCostOf(outcome), held);
}

function blueprintCost(id: BlueprintId): number {
  const blueprint = blueprintById(id);
  if (blueprint === undefined) throw new Error(`No blueprint registered for ${id}`);
  return blueprint.chalkCost;
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
