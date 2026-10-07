import { ECONOMY } from '../config/economy';

/**
 * Adds chalk to a player's meter, clamped at the maximum. Returns the new
 * value and how much was actually taken, so a source (a chalk box) can keep
 * whatever did not fit.
 *
 * Amounts come from authoritative data, never from a client, so an invalid
 * value is a bug and throws rather than being silently corrected.
 */
export function addChalk(current: number, amount: number): { chalk: number; taken: number } {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new RangeError(`Chalk amount must be a non-negative integer, got ${amount}`);
  }
  if (!Number.isInteger(current) || current < 0 || current > ECONOMY.chalk.max) {
    throw new RangeError(`Chalk meter out of range: ${current}`);
  }
  const taken = Math.min(amount, ECONOMY.chalk.max - current);
  return { chalk: current + taken, taken };
}
