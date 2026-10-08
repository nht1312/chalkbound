import type { BlueprintId, Quality } from '../drawing/blueprint';
import type { DrawingResult } from '../drawing/result';
import type { Sketch } from '../drawing/types';
import type { Vec3 } from '../math/vec';
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
      /** Every structure standing in the world (plan decision 2). */
      readonly drawnObjects: readonly DrawnObjectState[];
      /** What the receiving player is holding, if anything. */
      readonly equipped: EquippedWeaponState | undefined;
    }
  /** The authoritative verdict on one submitted sketch, sent reliably. */
  | { readonly type: 'drawingResult'; readonly result: DrawingResult };

export interface ChalkBoxState {
  readonly id: number;
  readonly remaining: number;
}

/**
 * The weapon in the receiving player's hands (SPEC §6.8). Only ever their
 * own: what anyone else is carrying is Phase 8's problem, and sending it
 * early would be sending information the player cannot yet see.
 */
export interface EquippedWeaponState {
  readonly blueprintId: BlueprintId;
  readonly quality: Quality;
  readonly durability: number;
  readonly maxDurability: number;
}

/**
 * A structure as the client needs to see it. Deliberately smaller than the
 * authority's `DrawnStructure`: size comes from the blueprint and the drawer
 * is nobody's business, since a structure belongs to the world (SPEC §7.4).
 * What cannot be derived is where it stands, how well it was drawn, what is
 * left of it, and the tick it became solid.
 */
export interface DrawnObjectState {
  readonly id: number;
  readonly blueprintId: BlueprintId;
  readonly quality: Quality;
  readonly position: Vec3;
  readonly yaw: number;
  /**
   * The tick it became collidable. A client may only collide with it from
   * this tick onward, which is what keeps prediction and authority agreeing
   * about the collision world (SPEC_AUDIT R-03).
   */
  readonly solidFromTick: number;
  readonly health: number;
}
