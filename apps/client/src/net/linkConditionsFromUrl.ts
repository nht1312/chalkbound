import { PERFECT_LINK, type LinkConditions } from '@chalkbound/shared';

/**
 * Reads simulated link conditions from the page URL, for testing feel under
 * lag: `?latency=80&jitter=15&loss=0.05` (one-way ms, ± ms, fraction).
 * Missing or invalid values fall back to a perfect link.
 */
export function linkConditionsFromUrl(search: string): LinkConditions {
  const params = new URLSearchParams(search);
  const read = (key: string, fallback: number, max: number): number => {
    const raw = params.get(key);
    if (raw === null) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : fallback;
  };
  return {
    latencyMs: read('latency', PERFECT_LINK.latencyMs, 2000),
    jitterMs: read('jitter', PERFECT_LINK.jitterMs, 1000),
    lossRate: read('loss', PERFECT_LINK.lossRate, 1),
  };
}
