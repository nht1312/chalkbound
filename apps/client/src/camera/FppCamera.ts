import type { Object3D } from 'three';

export interface LookConfig {
  readonly sensitivity: number;
  readonly pitchLimit: number;
}

const TWO_PI = Math.PI * 2;

/** First-person yaw/pitch look state. Yaw 0 faces -Z (three.js forward). */
export class FppCamera {
  yaw = 0;
  pitch = 0;

  constructor(private readonly config: LookConfig) {}

  /** Applies a mouse delta in pixels. Moving the mouse right/up turns right/up. */
  applyMouseDelta(dx: number, dy: number): void {
    this.yaw = wrapAngle(this.yaw - dx * this.config.sensitivity);
    const limit = this.config.pitchLimit;
    this.pitch = Math.min(limit, Math.max(-limit, this.pitch - dy * this.config.sensitivity));
  }

  applyTo(target: Object3D): void {
    target.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}

/** Wraps an angle into [-PI, PI). */
export function wrapAngle(angle: number): number {
  return ((((angle + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
}
