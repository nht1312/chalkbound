import { COMBAT } from '../config/combat';
import type { Vec3 } from '../math/vec';
import type { DummySpawn } from '../world/greyboxRoom';

/**
 * The training dummy of the vertical slice (ROADMAP Phase 5): something to
 * swing at while the only other things in the room are walls somebody drew.
 *
 * It has health and a position and nothing else. It does not move, think,
 * fight back, or foreshadow the Erased, who arrive in Phase 7 with their own
 * everything. It stands back up a few seconds after it falls (plan decision
 * 7) so the slice can be run again without restarting the match — that is a
 * convenience for testing, not a statement about death.
 */

export interface Dummy {
  readonly id: number;
  /** Feet position, fixed for the life of the match. */
  readonly position: Vec3;
  health: number;
  /** Seconds left before it stands back up. 0 while standing. */
  downFor: number;
}

/** Absorbs floating-point residue when the countdown runs in fixed steps. */
const DELAY_EPSILON = 1e-9;

export function createDummy(spawn: DummySpawn): Dummy {
  return { id: spawn.id, position: spawn.position, health: COMBAT.dummy.health, downFor: 0 };
}

export function isStanding(dummy: Dummy): boolean {
  return dummy.health > 0;
}

/**
 * Takes `amount` off a dummy. Nonsense is ignored exactly as it is for
 * players and structures — the three should refuse the same things in the
 * same way, because all three take their damage from the same swing.
 */
export function damageDummy(
  dummy: Dummy,
  amount: number,
): 'damaged' | 'felled' | 'already-down' {
  if (!isStanding(dummy)) return 'already-down';
  if (!Number.isFinite(amount) || amount <= 0) return 'damaged';
  dummy.health = Math.max(0, dummy.health - amount);
  if (isStanding(dummy)) return 'damaged';
  dummy.downFor = COMBAT.dummy.respawnDelaySeconds;
  return 'felled';
}

export interface DummyTick {
  /** It stood back up during this step. True exactly once per fall. */
  readonly stood: boolean;
}

export function tickDummy(dummy: Dummy, dt: number): DummyTick {
  if (isStanding(dummy) || !Number.isFinite(dt) || dt <= 0) return { stood: false };
  dummy.downFor -= dt;
  if (dummy.downFor > DELAY_EPSILON) return { stood: false };
  dummy.downFor = 0;
  dummy.health = COMBAT.dummy.health;
  return { stood: true };
}
