/**
 * Stamina constants. Max, regen rate and regen delay are from SPEC.md §17;
 * the sprint and jump costs are **[PLACEHOLDER]**.
 */
export const STAMINA = {
  max: 100,
  /** Points regenerated per second once the delay has elapsed. */
  regenPerSecond: 15,
  /** Seconds after the last spend before regeneration starts. */
  regenDelaySeconds: 1,
  /** Points drained per second while sprinting [PLACEHOLDER]. */
  sprintDrainPerSecond: 12,
  /** Points spent per jump; a jump needs at least this much [PLACEHOLDER]. */
  jumpCost: 10,
  /**
   * Stamina needed to *start* a sprint. Once sprinting, it continues until
   * empty; this gap stops sprint flickering on and off at zero [PLACEHOLDER].
   */
  sprintStartMinimum: 15,
} as const;
