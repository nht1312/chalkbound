import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../config/economy';
import { addChalk } from './chalk';

const { max } = ECONOMY.chalk;

describe('addChalk', () => {
  it('adds the full amount when it fits', () => {
    expect(addChalk(0, 25)).toEqual({ chalk: 25, taken: 25 });
  });

  it('clamps at the maximum and reports only what was taken', () => {
    expect(addChalk(90, 25)).toEqual({ chalk: max, taken: max - 90 });
  });

  it('takes nothing when the meter is already full', () => {
    expect(addChalk(max, 25)).toEqual({ chalk: max, taken: 0 });
  });

  it('accepts adding zero', () => {
    expect(addChalk(40, 0)).toEqual({ chalk: 40, taken: 0 });
  });

  it('rejects negative and non-integer amounts (chalk only changes by whole units)', () => {
    expect(() => addChalk(10, -5)).toThrow(RangeError);
    expect(() => addChalk(10, 2.5)).toThrow(RangeError);
    expect(() => addChalk(10, Number.NaN)).toThrow(RangeError);
  });

  it('rejects a current value outside the meter', () => {
    expect(() => addChalk(max + 1, 1)).toThrow(RangeError);
    expect(() => addChalk(-1, 1)).toThrow(RangeError);
  });
});

describe('ECONOMY', () => {
  it('starts players with no chalk (SPEC §5) and a box holds 25', () => {
    expect(ECONOMY.chalk.starting).toBe(0);
    expect(ECONOMY.chalk.perBox).toBe(25);
  });
});
