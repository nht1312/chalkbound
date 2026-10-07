import { describe, expect, it } from 'vitest';
import { linkConditionsFromUrl } from './linkConditionsFromUrl';

describe('linkConditionsFromUrl', () => {
  it('defaults to a perfect link', () => {
    expect(linkConditionsFromUrl('')).toEqual({ latencyMs: 0, jitterMs: 0, lossRate: 0 });
  });

  it('reads latency, jitter and loss', () => {
    expect(linkConditionsFromUrl('?latency=80&jitter=15&loss=0.05')).toEqual({
      latencyMs: 80,
      jitterMs: 15,
      lossRate: 0.05,
    });
  });

  it('clamps out-of-range values and ignores garbage', () => {
    expect(linkConditionsFromUrl('?latency=-5&jitter=abc&loss=3')).toEqual({
      latencyMs: 0,
      jitterMs: 0,
      lossRate: 1,
    });
  });
});
