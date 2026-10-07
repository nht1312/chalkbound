import { Vector3 } from 'three';
import type { Action } from '../input/bindings';

export interface DebugMoverConfig {
  readonly speed: number;
  readonly sprintMultiplier: number;
}

/**
 * Temporary noclip movement for Phase 0 so the scene can be inspected.
 * Runs on the fixed simulation tick and keeps the previous position for
 * render interpolation. Replaced by the real player controller in Phase 1.
 */
export class DebugMover {
  readonly previous = new Vector3();
  readonly current = new Vector3();
  private readonly move = new Vector3();
  private readonly forward = new Vector3();
  private readonly right = new Vector3();
  private static readonly UP = new Vector3(0, 1, 0);

  constructor(
    private readonly config: DebugMoverConfig,
    start: Vector3,
  ) {
    this.previous.copy(start);
    this.current.copy(start);
  }

  /** Advances one fixed step. Forward follows the full look direction (yaw + pitch). */
  step(dt: number, isDown: (action: Action) => boolean, yaw: number, pitch: number): void {
    this.previous.copy(this.current);

    const cosPitch = Math.cos(pitch);
    this.forward.set(-Math.sin(yaw) * cosPitch, Math.sin(pitch), -Math.cos(yaw) * cosPitch);
    this.right.set(Math.cos(yaw), 0, -Math.sin(yaw));

    this.move.set(0, 0, 0);
    if (isDown('MoveForward')) this.move.add(this.forward);
    if (isDown('MoveBackward')) this.move.sub(this.forward);
    if (isDown('MoveRight')) this.move.add(this.right);
    if (isDown('MoveLeft')) this.move.sub(this.right);
    if (isDown('Jump')) this.move.add(DebugMover.UP);
    if (isDown('Crouch')) this.move.sub(DebugMover.UP);
    if (this.move.lengthSq() === 0) return;

    const speed = this.config.speed * (isDown('Sprint') ? this.config.sprintMultiplier : 1);
    this.current.addScaledVector(this.move.normalize(), speed * dt);
  }

  /** Writes the interpolated render position into `out`. */
  interpolate(alpha: number, out: Vector3): Vector3 {
    return out.lerpVectors(this.previous, this.current, alpha);
  }
}
