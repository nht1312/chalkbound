import type { Point2 } from '@chalkbound/shared';

/**
 * The chalk scratch (SPEC §14, D-02).
 *
 * This sound does two jobs at once. It is the drawer's confirmation that the
 * stroke registered, and it is a broadcast to everyone nearby that someone is
 * standing still and cannot fight back. One sound serving the creation pillar
 * and the risk pillar, which is why it is in Phase 3 and not in Polish.
 *
 * The curve is deliberately simple and entirely [PLACEHOLDER]: it is tuned by
 * drawing, not by reasoning.
 */
export interface ScratchConfig {
  /** Below this cursor speed (plane m/s) the chalk is resting: silence. */
  readonly minSpeed: number;
  /** At and above this speed the scratch is at full volume. */
  readonly fullSpeed: number;
  readonly maxGain: number;
  /** Playback rate when barely moving, and at full speed. */
  readonly minRate: number;
  readonly maxRate: number;
  /** Time constant for gain and rate changes, seconds. */
  readonly smoothing: number;
}

export interface ScratchLevel {
  readonly gain: number;
  readonly rate: number;
}

/** Cursor speed in plane metres per second between two samples. */
export function cursorSpeed(previous: Point2, current: Point2, dt: number): number {
  if (!(dt > 0)) return 0;
  const distance = Math.hypot(current.x - previous.x, current.y - previous.y);
  return Number.isFinite(distance) ? distance / dt : 0;
}

/**
 * Where the scratch should sit for a given cursor speed. `touching` is the
 * stroke button: a cursor flying across the plane with the chalk lifted makes
 * no sound, because nothing is scraping.
 */
export function scratchFromSpeed(
  speed: number,
  touching: boolean,
  config: ScratchConfig,
): ScratchLevel {
  if (!Number.isFinite(speed) || !touching) {
    // The rate stays in range even in silence: a resting oscillator that
    // resumes from an out-of-range rate clicks.
    return { gain: 0, rate: config.minRate };
  }
  const span = config.fullSpeed - config.minSpeed;
  const t = span > 0 ? clamp01((speed - config.minSpeed) / span) : speed > 0 ? 1 : 0;
  return {
    gain: config.maxGain * t,
    // Pitch tracks the full speed range, not the audible part, so the chalk
    // already sounds like it is moving as the sound arrives.
    rate: config.minRate + (config.maxRate - config.minRate) * clamp01(speed / config.fullSpeed),
  };
}

/**
 * Exponential approach, frame-rate independent. Smoothing the gain matters:
 * stepping it per frame turns a scratch into a buzz.
 */
export function approachLevel(
  current: number,
  target: number,
  dt: number,
  smoothing: number,
): number {
  if (smoothing <= 0 || !(dt > 0)) return target;
  const keep = Math.exp(-dt / smoothing);
  return target + (current - target) * keep;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
