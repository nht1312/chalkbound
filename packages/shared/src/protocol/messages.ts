import type { BlueprintId } from '../drawing/blueprint';
import type { DrawingResult } from '../drawing/result';
import type { Sketch } from '../drawing/types';
import type { PlayerState } from '../sim/stepPlayer';

/**
 * Wire message types. Upstream messages are intent; downstream messages are
 * fact (ARCHITECTURE §7). Phase 0 carries only what the loop plumbing needs.
 */

/** Bitfield of held buttons in an {@link InputCommand}. */
export const Button = {
  Jump: 1 << 0,
  Sprint: 1 << 1,
  Crouch: 1 << 2,
  Attack: 1 << 3,
  Interact: 1 << 4,
  Draw: 1 << 5,
} as const;

/**
 * One simulation tick of player intent. Values are the *dequantized* form:
 * after a codec round-trip both sides hold identical numbers.
 */
export interface InputCommand {
  /** Monotonic per-client sequence number, used for acknowledgement. */
  readonly seq: number;
  /** Client tick this command was produced on. */
  readonly tick: number;
  /** Strafe axis in [-1, 1] (right positive). */
  readonly moveX: number;
  /** Forward axis in [-1, 1] (forward positive). */
  readonly moveZ: number;
  /** Look yaw in radians, [-PI, PI). */
  readonly yaw: number;
  /** Look pitch in radians. */
  readonly pitch: number;
  /** {@link Button} bitfield. */
  readonly buttons: number;
}

export type ClientMessage =
  | { readonly type: 'inputBatch'; readonly commands: readonly InputCommand[] }
  | { readonly type: 'ping'; readonly id: number; readonly clientTime: number }
  /** "I want to use this." The authority decides whether it is in reach and what happens. */
  | { readonly type: 'interact'; readonly targetId: number }
  /** "Here is what I drew." Only the strokes carry weight; see {@link DrawingSubmission}. */
  | DrawingSubmission;

/**
 * A finished sketch, sent once when the player lowers the chalk.
 *
 * The strokes are the whole message as far as the outcome is concerned. The
 * authority normalizes, classifies and grades them itself and never consults
 * `hint` — it only counts how often the hint disagreed, which is the cheapest
 * signal that client and server recognition have drifted apart (plan T5).
 */
export interface DrawingSubmission {
  readonly type: 'drawing';
  readonly sketch: Sketch;
  /** Diagnostic only: what the client's own validator made of the sketch. */
  readonly hint?: BlueprintId;
}

export type ServerMessage =
  | {
      readonly type: 'pong';
      readonly id: number;
      readonly clientTime: number;
      readonly serverTick: number;
    }
  | {
      readonly type: 'snapshot';
      readonly serverTick: number;
      /** Highest input seq the server has applied for the receiving client. */
      readonly lastProcessedSeq: number;
      /** The receiving player's authoritative state after `lastProcessedSeq`. */
      readonly player: PlayerState;
      /** The receiving player's authoritative chalk meter. */
      readonly chalk: number;
      /** Every chalk box and what it still holds. */
      readonly chalkBoxes: readonly ChalkBoxState[];
    }
  /** The authoritative verdict on one submitted sketch, sent reliably. */
  | { readonly type: 'drawingResult'; readonly result: DrawingResult };

export interface ChalkBoxState {
  readonly id: number;
  readonly remaining: number;
}
