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
  | { readonly type: 'ping'; readonly id: number; readonly clientTime: number };

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
    };
