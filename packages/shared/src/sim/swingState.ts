import { COMBAT } from '../config/combat';

/**
 * The sword swing, as a state machine both sides run (SPEC §8, ROADMAP
 * Phase 5).
 *
 * It is deliberately pure: no world, no player, no physics, no damage. The
 * authority advances one of these to decide *when* a hit is tested; the
 * client advances an identical one to decide what the hands are doing. Both
 * read their timings from the same config, which is the only reason the
 * animation and the hit can be trusted to describe the same swing.
 *
 * The windup exists to be seen. SPEC §8 asks for combat that is read and
 * avoided rather than clicked faster, so the 120 ms before the blade turns
 * dangerous is a gameplay feature with a cost, not an animation detail.
 */

export type SwingPhase = 'idle' | 'windup' | 'active' | 'recovery';

export interface SwingState {
  readonly phase: SwingPhase;
  /** Seconds elapsed inside the current phase. */
  readonly elapsed: number;
}

export interface SwingAdvance {
  readonly swing: SwingState;
  /**
   * The blade turned dangerous during this step. True exactly once per swing,
   * even when a long step passes straight through the active window — a
   * dropped frame must not swallow a hit.
   */
  readonly becameActive: boolean;
}

const MS = 1000;

const PHASE_SECONDS: Record<Exclude<SwingPhase, 'idle'>, number> = {
  windup: COMBAT.swing.windupMs / MS,
  active: COMBAT.swing.activeMs / MS,
  recovery: COMBAT.swing.recoveryMs / MS,
};

const NEXT_PHASE: Record<Exclude<SwingPhase, 'idle'>, SwingPhase> = {
  windup: 'active',
  active: 'recovery',
  recovery: 'idle',
};

/** Seconds from the button press to being able to press it again. */
export const SWING_SECONDS =
  PHASE_SECONDS.windup + PHASE_SECONDS.active + PHASE_SECONDS.recovery;

export const IDLE_SWING: SwingState = { phase: 'idle', elapsed: 0 };

/**
 * Absorbs floating-point residue, so a swing whose phases divide evenly into
 * the tick rate ends on the tick the arithmetic says it should rather than
 * one later. The same trick, and the same reason, as `stamina.ts`.
 */
const PHASE_EPSILON = 1e-9;

/**
 * Whether a new swing may begin. Only the phase is consulted: whether the
 * player has the stamina, the hands, or the right to swing at all is the
 * authority's business and is checked where those things live.
 */
export function canStartSwing(swing: SwingState): boolean {
  return swing.phase === 'idle';
}

export function startSwing(): SwingState {
  return { phase: 'windup', elapsed: 0 };
}

/**
 * Advances a swing by `dt` seconds, carrying any overrun into the next phase
 * so a ragged frame cannot stretch a swing. An idle swing stays idle: nothing
 * here starts one.
 */
export function advanceSwing(swing: SwingState, dt: number): SwingAdvance {
  if (swing.phase === 'idle' || !Number.isFinite(dt) || dt <= 0) {
    return { swing, becameActive: false };
  }

  let phase: SwingPhase = swing.phase;
  let elapsed = swing.elapsed + dt;
  let becameActive = false;

  while (phase !== 'idle' && elapsed + PHASE_EPSILON >= PHASE_SECONDS[phase]) {
    elapsed -= PHASE_SECONDS[phase];
    phase = NEXT_PHASE[phase];
    if (phase === 'active') becameActive = true;
  }

  return {
    swing: phase === 'idle' ? IDLE_SWING : { phase, elapsed },
    becameActive,
  };
}

/**
 * How far through the whole swing, in [0, 1]. For animation only — the hit is
 * decided by {@link advanceSwing}, never by a curve read off this.
 */
export function swingProgress(swing: SwingState): number {
  if (swing.phase === 'idle') return 0;
  const before =
    swing.phase === 'windup'
      ? 0
      : swing.phase === 'active'
        ? PHASE_SECONDS.windup
        : PHASE_SECONDS.windup + PHASE_SECONDS.active;
  return Math.min(1, (before + swing.elapsed) / SWING_SECONDS);
}
