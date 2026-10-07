import type { Vec3 } from '@chalkbound/shared';

export interface TargetCandidate {
  readonly id: number;
  readonly position: Vec3;
  /** Authoritative amount left; undefined before the first snapshot (assume available). */
  readonly remaining: number | undefined;
}

export interface TargetingConfig {
  /** Same reach the authority enforces, m. */
  readonly range: number;
  /** Half-angle of the aim cone, radians. */
  readonly maxAngleRadians: number;
}

/** Unit look vector for the FppCamera convention: yaw 0 faces -Z, positive pitch looks up. */
export function lookDirection(yaw: number, pitch: number): Vec3 {
  const cosPitch = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cosPitch, y: Math.sin(pitch), z: -Math.cos(yaw) * cosPitch };
}

/**
 * The object the player is aiming at: within reach of the eyes, inside the
 * aim cone, not empty, and closest to the centre of view. Purely a client
 * hint for the prompt; the authority re-checks reach when the intent arrives.
 */
export function selectInteractTarget(
  eye: Vec3,
  forward: Vec3,
  candidates: readonly TargetCandidate[],
  config: TargetingConfig,
): number | undefined {
  const minCos = Math.cos(config.maxAngleRadians);
  let best: number | undefined;
  let bestCos = minCos;
  for (const candidate of candidates) {
    if (candidate.remaining === 0) continue;
    const dx = candidate.position.x - eye.x;
    const dy = candidate.position.y - eye.y;
    const dz = candidate.position.z - eye.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance > config.range || distance === 0) continue;
    const cos = (dx * forward.x + dy * forward.y + dz * forward.z) / distance;
    if (cos >= bestCos) {
      bestCos = cos;
      best = candidate.id;
    }
  }
  return best;
}
