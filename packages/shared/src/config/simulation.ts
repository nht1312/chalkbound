/** Simulation timing shared by client prediction and the authoritative server. */
export const SIMULATION = {
  /** Fixed simulation ticks per second (ARCHITECTURE §1.3). */
  tickRate: 60,
  /** Authoritative snapshots per second sent to each client. */
  snapshotRate: 30,
  /**
   * Largest frame delta (seconds) fed into the accumulator. Prevents a
   * "spiral of death" after a tab switch or a long GC pause.
   */
  maxFrameDelta: 0.25,
  /** Hard cap on simulation steps run in a single advance. */
  maxStepsPerFrame: 8,
} as const;

export const FIXED_DT = 1 / SIMULATION.tickRate;

/** Simulation ticks between two snapshot broadcasts. */
export const TICKS_PER_SNAPSHOT = SIMULATION.tickRate / SIMULATION.snapshotRate;
