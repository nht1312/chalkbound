import { describe, expect, it } from 'vitest';
import { describeChalkMeter } from './chalkMeter';

describe('describeChalkMeter', () => {
  it('shows the authoritative value against the maximum', () => {
    expect(describeChalkMeter(25, 100)).toEqual({ text: 'Chalk 25 / 100', fraction: 0.25 });
  });

  it('shows an unknown value until the first snapshot arrives', () => {
    expect(describeChalkMeter(undefined, 100)).toEqual({ text: 'Chalk — / 100', fraction: 0 });
  });

  it('clamps the bar to [0, 1]', () => {
    expect(describeChalkMeter(250, 100).fraction).toBe(1);
  });
});
