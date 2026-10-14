import { COMBAT } from '../config/combat';

/**
 * A player's health, and the countdown that follows it running out (SPEC §8,
 * plan decision 8).
 *
 * Health lives here rather than in `PlayerState` on purpose. `PlayerState` is
 * the movement state a client replays during reconciliation; health in it
 * would mean the client predicting its own health, which is precisely what
 * SPEC_AUDIT R-02 forbids. This is authority-only data that reaches the
 * client as a fact in a snapshot, exactly as chalk does.
 *
 * There is no regeneration (SPEC §8). Damage taken stays taken, which is what
 * makes walking away from a fight a real decision.
 */

export interface HealthState {
  readonly value: number;
  /** Seconds left before standing back up. 0 while alive. */
  readonly respawnIn: number;
}

export const FULL_HEALTH: HealthState = { value: COMBAT.player.maxHealth, respawnIn: 0 };

/** Absorbs floating-point residue when the countdown runs in fixed steps. */
const DELAY_EPSILON = 1e-9;

export function isAlive(health: HealthState): boolean {
  return health.value > 0;
}

/**
 * Takes `amount` off a player.
 *
 * Damage originates in a client's claimed swing, by way of the authority, so
 * anything meaningless — negative, zero, NaN — is ignored rather than trusted
 * or thrown over. This mirrors `damage()` for structures deliberately: the
 * two should refuse the same nonsense in the same way.
 *
 * Hitting someone already down does nothing. A corpse is not a target, and
 * without this a swing could reset a respawn countdown indefinitely.
 */
export function applyDamage(health: HealthState, amount: number): HealthState {
  if (!isAlive(health)) return health;
  if (!Number.isFinite(amount) || amount <= 0) return health;
  const value = Math.max(0, health.value - amount);
  if (value > 0) return { value, respawnIn: 0 };
  return { value: 0, respawnIn: COMBAT.player.respawnDelaySeconds };
}

export interface RespawnTick {
  readonly health: HealthState;
  /** The countdown finished during this step. True exactly once per death. */
  readonly respawned: boolean;
}

/** Counts a dead player's respawn down by one step; the living are untouched. */
export function tickRespawn(health: HealthState, dt: number): RespawnTick {
  if (isAlive(health) || !Number.isFinite(dt) || dt <= 0) {
    return { health, respawned: false };
  }
  const remaining = health.respawnIn - dt;
  if (remaining > DELAY_EPSILON) {
    return { health: { value: 0, respawnIn: remaining }, respawned: false };
  }
  return { health: FULL_HEALTH, respawned: true };
}
