/**
 * The resolving sketch's glow (SPEC §14, D-02).
 *
 * The envelope starts when the sketch is submitted, not when the verdict
 * arrives, and that is the whole point: the hold is sized to cover the
 * authority round trip, so the player sees their drawing light up
 * immediately and the confirmation lands inside the glow rather than after
 * an awkward pause (SPEC_AUDIT R-03).
 */
export interface GlowConfig {
  /** Time to reach full brightness after submission, seconds. */
  readonly attackSeconds: number;
  /** Time held at full brightness — the window the round trip hides in. */
  readonly holdSeconds: number;
  readonly decaySeconds: number;
}

/** Brightness 0..1, `elapsed` seconds after the sketch was submitted. */
export function glowIntensity(elapsed: number, config: GlowConfig): number {
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 0;

  const { attackSeconds, holdSeconds, decaySeconds } = config;
  if (elapsed < attackSeconds) return attackSeconds > 0 ? elapsed / attackSeconds : 1;

  const held = elapsed - attackSeconds;
  if (held <= holdSeconds) return 1;

  const decayed = held - holdSeconds;
  if (decayed >= decaySeconds) return 0;
  return decaySeconds > 0 ? 1 - decayed / decaySeconds : 0;
}

/** How long the whole envelope lasts, for deciding when to drop the trail. */
export function glowDuration(config: GlowConfig): number {
  return config.attackSeconds + config.holdSeconds + config.decaySeconds;
}
