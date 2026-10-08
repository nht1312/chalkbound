import type { Constraint, ConstraintFailure } from './constraints';
import type { Discriminators } from './discriminators';
import type { Point2 } from './types';

/** Everything the game knows how to draw (SPEC §7, the MVP set). */
export type BlueprintId = 'sword' | 'wall' | 'bridge';

/** How well it was drawn, which the created object wears visibly (SPEC §6.5). */
export type Quality = 'crude' | 'sound' | 'keen';

/**
 * Why a sketch was refused outright rather than graded (SPEC §6.2 stage 2):
 * nothing scored well enough, or two blueprints scored too close to separate.
 */
export type RejectionReason = 'below-floor' | 'ambiguous';

/**
 * What a recognized blueprint turns into. `kind` chooses the construction in
 * the spawn registry, and that switch is exhaustive — a new kind is a compile
 * error rather than a sketch that quietly builds nothing.
 *
 * Phase 3 also carried a `scaleFromAccuracy` flag here, pending this registry.
 * Phase 4 resolved it and removed it: quality scales an object's *stats*,
 * uniformly, for every blueprint (plan decision 6). It never scales
 * dimensions, and it keys off the quality band rather than raw accuracy, so
 * the flag was both unused and misnamed.
 */
export interface SpawnDescriptor {
  readonly kind: 'weapon' | 'structure';
  /** Asset name per CLAUDE.md §13. */
  readonly asset: string;
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
      readonly reason: RejectionReason;
    }
  | {
      readonly kind: 'unaffordable';
      readonly blueprintId: BlueprintId;
      readonly required: number;
      readonly held: number;
    };
