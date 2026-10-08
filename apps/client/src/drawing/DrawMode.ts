import type { Point2, Sketch, Stroke } from '@chalkbound/shared';
import { CURSOR_ORIGIN, moveCursor, type CursorConfig } from './cursor';
import { StrokeRecorder, type StrokeRecorderConfig } from './StrokeRecorder';

/**
 * Raising and lowering the chalk (plan T6, decision 1).
 *
 * Hold the draw button to raise the chalk; while it is up, the stroke button
 * presses and lifts the chalk against the plane. Releasing the draw button
 * submits. Losing pointer lock cancels, and cancelling costs nothing.
 *
 * The controller takes a plain frame of booleans and numbers and owns no DOM
 * handle at all. That is deliberate: it is structurally incapable of
 * releasing pointer lock, which is the one thing drawing must never do
 * (SPEC_AUDIT RD-08). Leaving the lock would hand the player's next click to
 * the browser in the middle of a fight.
 */
export interface DrawModeConfig {
  readonly cursor: CursorConfig;
  readonly recorder: StrokeRecorderConfig;
  /** Seconds for the chalk plane to fade in, and to fade back out. */
  readonly fadeSeconds: number;
}

export interface DrawModeFrame {
  /** The draw button (RMB by default) is held. */
  readonly drawHeld: boolean;
  /** The stroke button (LMB) is held: chalk against the plane. */
  readonly strokeHeld: boolean;
  readonly pointerLocked: boolean;
  /** The player's authoritative chalk. */
  readonly chalk: number;
  readonly mouseDx: number;
  readonly mouseDy: number;
  /** Monotonic clock, milliseconds. */
  readonly timeMs: number;
  /** Frame time, seconds. */
  readonly dt: number;
}

export type DrawModeEvent =
  | { readonly kind: 'submitted'; readonly sketch: Sketch }
  /** Nothing was drawn, or the lock went away. Either way, no chalk is spent. */
  | { readonly kind: 'cancelled'; readonly reason: 'empty' | 'lock-lost' };

export class DrawMode {
  private recorder: StrokeRecorder;
  private cursorPosition: Point2 = CURSOR_ORIGIN;
  private cursorConfig: CursorConfig;
  private isActive = false;
  private opacity = 0;
  private drawWasHeld = false;
  private strokeWasHeld = false;

  constructor(private readonly config: DrawModeConfig) {
    this.cursorConfig = config.cursor;
    this.recorder = new StrokeRecorder(config.recorder);
  }

  get active(): boolean {
    return this.isActive;
  }

  get cursor(): Point2 {
    return this.cursorPosition;
  }

  /** 0 when the plane is hidden, 1 when fully faded in. */
  get planeOpacity(): number {
    return this.opacity;
  }

  /** Completed strokes plus the one in progress, for the trail. */
  get strokes(): readonly Stroke[] {
    return this.recorder.strokes;
  }

  /** Changes the cursor's travel per pixel (player setting). */
  setCursorSensitivity(sensitivity: number): void {
    this.cursorConfig = { ...this.cursorConfig, sensitivity };
  }

  /**
   * Advances one frame. Returns an event on the frame the chalk comes down.
   * The caller should route the mouse delta here *instead of* to the camera
   * whenever {@link active} is true after this call.
   */
  update(frame: DrawModeFrame): DrawModeEvent | undefined {
    const pressed = frame.drawHeld && !this.drawWasHeld;
    this.drawWasHeld = frame.drawHeld;

    let event: DrawModeEvent | undefined;
    if (this.isActive) {
      event = frame.pointerLocked ? this.continue(frame) : this.cancel('lock-lost');
    } else if (pressed && frame.pointerLocked && frame.chalk > 0) {
      // A fresh press only. Holding the button through a refusal — no chalk,
      // or no pointer lock — must not raise the chalk the moment that changes.
      this.enter();
      this.track(frame);
    }

    this.fade(frame.dt);
    return event;
  }

  private enter(): void {
    this.isActive = true;
    this.cursorPosition = CURSOR_ORIGIN;
    this.strokeWasHeld = false;
    this.recorder = new StrokeRecorder(this.config.recorder);
  }

  /** One frame with the chalk up: move the cursor, then work the stroke button. */
  private continue(frame: DrawModeFrame): DrawModeEvent | undefined {
    if (frame.drawHeld) {
      this.track(frame);
      return undefined;
    }

    this.isActive = false;
    if (this.strokeWasHeld) this.recorder.endStroke(frame.timeMs);
    this.strokeWasHeld = false;
    const sketch = this.recorder.finish();
    return sketch ? { kind: 'submitted', sketch } : this.cancel('empty');
  }

  private track(frame: DrawModeFrame): void {
    this.cursorPosition = moveCursor(
      this.cursorPosition,
      frame.mouseDx,
      frame.mouseDy,
      this.cursorConfig,
    );

    if (frame.strokeHeld && !this.strokeWasHeld) {
      this.recorder.beginStroke(this.cursorPosition, frame.timeMs);
    } else if (frame.strokeHeld) {
      this.recorder.sample(this.cursorPosition, frame.timeMs);
    } else if (this.strokeWasHeld) {
      this.recorder.endStroke(frame.timeMs);
    }
    this.strokeWasHeld = frame.strokeHeld;
  }

  private cancel(reason: 'empty' | 'lock-lost'): DrawModeEvent {
    this.isActive = false;
    this.strokeWasHeld = false;
    this.recorder.reset();
    return { kind: 'cancelled', reason };
  }

  /** Linear, so "150 ms" is exactly how long the plane takes to arrive. */
  private fade(dt: number): void {
    const step = this.config.fadeSeconds > 0 ? dt / this.config.fadeSeconds : 1;
    const target = this.isActive ? 1 : 0;
    this.opacity =
      target > this.opacity
        ? Math.min(target, this.opacity + step)
        : Math.max(target, this.opacity - step);
  }
}
