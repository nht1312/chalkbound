/** Wire-level limits and cadences shared by both sides. */
export const NETWORK = {
  /**
   * Most input commands carried in one batch. Each send repeats the newest
   * unacknowledged commands so a lost packet costs nothing.
   */
  maxInputBatch: 8,
  /** Commands the server queues per player before dropping the oldest. */
  maxQueuedInputs: 32,
  /** Commands the server consumes per player per tick (1 + catch-up). */
  maxInputsPerTick: 2,
  /** Client ping cadence for round-trip measurement, in milliseconds. */
  pingIntervalMs: 1000,
  /** Weight of a new RTT sample in the smoothed RTT. */
  rttSmoothing: 0.2,
} as const;
