import type { Scheduler } from '../net/loopbackTransport';

/** Deterministic manual clock for tests: timers fire only when `advance` passes them. */
export class ManualScheduler implements Scheduler {
  private time = 0;
  private order = 0;
  private timers: { at: number; order: number; callback: () => void }[] = [];

  now(): number {
    return this.time;
  }

  setTimeout(callback: () => void, delayMs: number): void {
    this.timers.push({ at: this.time + Math.max(0, delayMs), order: this.order++, callback });
  }

  /** Moves time forward by `ms`, firing due timers in time order. */
  advance(ms: number): void {
    const target = this.time + ms;
    for (;;) {
      this.timers.sort((x, y) => x.at - y.at || x.order - y.order);
      const next = this.timers[0];
      if (!next || next.at > target) break;
      this.timers.shift();
      this.time = next.at;
      next.callback();
    }
    this.time = target;
  }
}

/** Seeded PRNG (mulberry32) for reproducible loss and jitter. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
