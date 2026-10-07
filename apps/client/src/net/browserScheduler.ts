import type { Scheduler } from '@chalkbound/shared';

export const browserScheduler: Scheduler = {
  now: () => performance.now(),
  setTimeout: (callback, delayMs) => void window.setTimeout(callback, delayMs),
};
