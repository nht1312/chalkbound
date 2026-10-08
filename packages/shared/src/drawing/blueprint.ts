import type { Constraint, ConstraintFailure } from './constraints';
import type { Discriminators } from './discriminators';
import type { Point2 } from './types';

/** Everything the game knows how to draw. Wall and bridge join in Phase 4. */
export type BlueprintId = 'sword';

/** How well it was drawn, which the created object wears visibly (SPEC §6.5). */
export type Quality = 'crude' | 'sound' | 'keen';

/** What a recognized blueprint turns into. Resolved by the Phase 4 spawn registry. */
export interface SpawnDescriptor {
  readonly kind: 'weapon' | 'structure';
  /** Asset name per CLAUDE.md §13. */
  readonly asset: string;
  readonly scaleFromAccuracy: boolean;
}

/**
 * A blueprint is data, not code (prompt §7, ARCHITECTURE §6.6). Adding one
 * means adding a file like `blueprints/sword.ts`, registering a spawn handler,
 * and passing the distinctness test. No validator code changes.
 */
export interface BlueprintTemplate {
  readonly id: BlueprintId;
  readonly chalkCost: number;
  /** Grading pass threshold, 0..1. */
  readonly minAccuracy: number;
  /**
   * The ideal shape, stroke by stroke, **in the order the Codex teaches**.
   * Drives the classifier's template distance and the Codex diagram (T9).
   * Units are arbitrary: it is normalized before use, like any sketch.
   */
  readonly reference: readonly (readonly Point2[])[];
  /** Cheap features for the classifier's hard filter (ARCHITECTURE §6.3). */
  readonly discriminators: Discriminators;
  /** The full set run during grading (ARCHITECTURE §6.4). */
  readonly constraints: readonly Constraint[];
  readonly spawn: SpawnDescriptor;
}

/**
 * The four genuinely different results of inference, each with its own chalk
 * cost (SPEC §6.6) and its own thing to say to the player (SPEC §15). A
 * boolean plus fields would lose the distinction the whole design rests on:
 * between a sketch drawn badly and a sketch that could not be read.
 */
export type DrawingOutcome =
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
      readonly failures: readonly ConstraintFailure[];
    }
  | {
      readonly kind: 'unrecognized';
      readonly bestCandidate?: BlueprintId;
      readonly reason: 'below-floor' | 'ambiguous';
    }
  | {
      readonly kind: 'unaffordable';
      readonly blueprintId: BlueprintId;
      readonly required: number;
      readonly held: number;
    };
