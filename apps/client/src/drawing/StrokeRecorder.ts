import {
  DRAWING,
  type PlanePoint,
  type Point2,
  type Sketch,
  type Stroke,
} from '@chalkbound/shared';

/**
 * Captures what the player draws (plan T6).
 *
 * Two filters shape the result. A fixed sample rate keeps the per-point
 * timing regular whatever the frame rate is doing, which matters because the
 * validator reads speed variation between samples to tell a hand from a
 * script. A minimum-distance filter then drops samples that went nowhere, so
 * a player dwelling on one spot does not spend the stroke's point budget
 * standing still.
 *
 * Timestamps are relative to the start of the *sketch*, not of each stroke,
 * so the pause between strokes is preserved — it is part of how the drawing
 * was made.
 */
export interface StrokeRecorderConfig {
  /** Samples kept per second, at most. */
  readonly sampleRate: number;
  /** Plane metres a sample must travel from the last kept one to count. */
  readonly minDistance: number;
}

interface OpenStroke {
  readonly points: PlanePoint[];
}

export class StrokeRecorder {
  private readonly intervalMs: number;
  private readonly completed: Stroke[] = [];
  private open: OpenStroke | undefined;
  /** Timestamp the sketch's clock counts from; undefined until the first stroke. */
  private originMs: number | undefined;
  private nextSampleAt = 0;
  /** The last cursor position offered, kept or not, so the lift point is exact. */
  private lastOffered: Point2 | undefined;

  constructor(private readonly config: StrokeRecorderConfig) {
    this.intervalMs = 1000 / config.sampleRate;
  }

  get isRecording(): boolean {
    return this.open !== undefined;
  }

  /** Completed strokes plus the one in progress, for drawing the trail. */
  get strokes(): readonly Stroke[] {
    if (!this.open) return this.completed;
    return [...this.completed, toStroke(this.open.points)];
  }

  /** Starts a stroke at `point`. Ignored once the wire's stroke budget is spent. */
  beginStroke(point: Point2, timeMs: number): void {
    if (this.open || this.completed.length >= DRAWING.wire.maxStrokes) return;
    this.originMs ??= timeMs;
    this.open = { points: [this.stamp(point, timeMs)] };
    this.nextSampleAt = timeMs + this.intervalMs;
    this.lastOffered = point;
  }

  /** Offers the cursor's current position; kept only if both filters allow it. */
  sample(point: Point2, timeMs: number): void {
    const open = this.open;
    if (!open) return;
    this.lastOffered = point;
    if (timeMs < this.nextSampleAt) return;

    // Keep the cadence steady, but never work through a backlog after a stall:
    // a tab switch must not dump a burst of samples with impossible timing.
    const next = this.nextSampleAt + this.intervalMs;
    this.nextSampleAt = next < timeMs ? timeMs + this.intervalMs : next;

    if (open.points.length >= DRAWING.wire.maxPointsPerStroke) return;
    const last = open.points[open.points.length - 1];
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < this.config.minDistance) return;
    open.points.push(this.stamp(point, timeMs));
  }

  /**
   * Closes the stroke. The lift position is always kept, however small the
   * last move: where a stroke ends decides whether a crossguard crosses the
   * blade, so it is never the distance filter's to discard.
   */
  endStroke(timeMs: number): void {
    const open = this.open;
    if (!open) return;
    const last = open.points[open.points.length - 1];
    const lift = this.lastOffered;
    const moved =
      lift !== undefined && last !== undefined && (lift.x !== last.x || lift.y !== last.y);
    if (moved && open.points.length < DRAWING.wire.maxPointsPerStroke) {
      open.points.push(this.stamp(lift, timeMs));
    }
    this.close(open);
  }

  /** The finished sketch, closing any stroke still open. Undefined if empty. */
  finish(): Sketch | undefined {
    if (this.open) this.close(this.open);
    if (this.completed.length === 0) return undefined;
    const strokes = this.completed;
    const first = strokes[0]?.points[0];
    const last = strokes[strokes.length - 1]?.points.at(-1);
    return {
      strokes: [...strokes],
      durationMs: first && last ? last.t - first.t : 0,
    };
  }

  reset(): void {
    this.completed.length = 0;
    this.open = undefined;
    this.originMs = undefined;
    this.nextSampleAt = 0;
    this.lastOffered = undefined;
  }

  private close(open: OpenStroke): void {
    this.open = undefined;
    this.completed.push(toStroke(open.points));
  }

  private stamp(point: Point2, timeMs: number): PlanePoint {
    return { x: point.x, y: point.y, t: timeMs - (this.originMs ?? timeMs) };
  }
}

function toStroke(points: readonly PlanePoint[]): Stroke {
  const first = points[0];
  const last = points[points.length - 1];
  return { points: [...points], durationMs: first && last ? last.t - first.t : 0 };
}
