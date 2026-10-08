import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../config/economy';
import type { DrawingOutcome } from './blueprint';
import { SWORD } from './blueprints/sword';
import { chalkCostOf, chalkDebitFor } from './result';

const created: DrawingOutcome = {
  kind: 'created',
  blueprintId: 'sword',
  accuracy: 0.9,
  quality: 'keen',
};
const smudged: DrawingOutcome = {
  kind: 'smudged',
  blueprintId: 'sword',
  accuracy: 0.4,
  failures: [],
};
const unrecognized: DrawingOutcome = { kind: 'unrecognized', reason: 'below-floor' };
const unaffordable: DrawingOutcome = {
  kind: 'unaffordable',
  blueprintId: 'sword',
  required: SWORD.chalkCost,
  held: 3,
};

describe('chalkCostOf', () => {
  it('charges the full blueprint cost for a created object', () => {
    expect(chalkCostOf(created)).toBe(SWORD.chalkCost);
  });

  it('charges a quarter of the blueprint, rounded up, for a smudge', () => {
    const quarter = SWORD.chalkCost * ECONOMY.smudgedCostFraction;
    expect(chalkCostOf(smudged)).toBe(Math.ceil(quarter));
    expect(chalkCostOf(smudged)).toBeLessThan(chalkCostOf(created));
  });

  it('rounds a smudge up, so it is never free', () => {
    expect(chalkCostOf({ ...smudged, blueprintId: 'sword' })).toBeGreaterThan(0);
  });

  it('charges the flat rate when it could not read the sketch', () => {
    expect(chalkCostOf(unrecognized)).toBe(ECONOMY.unrecognizedCost);
  });

  it('charges the flat rate when the player cannot afford what they drew', () => {
    expect(chalkCostOf(unaffordable)).toBe(ECONOMY.unaffordableCost);
  });

  it('reads a narrowed result outcome the same way as a full one', () => {
    expect(
      chalkCostOf({ kind: 'smudged', blueprintId: 'sword', accuracy: 0.4, failures: [] }),
    ).toBe(chalkCostOf(smudged));
  });
});

describe('chalkDebitFor', () => {
  it('takes the whole cost when the player can cover it', () => {
    expect(chalkDebitFor(created, 100)).toBe(SWORD.chalkCost);
  });

  it('takes only what is held, so the meter never goes negative', () => {
    expect(chalkDebitFor(unrecognized, 3)).toBe(3);
    expect(chalkDebitFor(created, 1)).toBe(1);
  });

  it('takes nothing from an empty meter', () => {
    expect(chalkDebitFor(unrecognized, 0)).toBe(0);
  });
});
