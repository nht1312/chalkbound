/** A sampled cursor position on the chalk plane: metres from its centre, +y up. */
export interface PlanePoint {
  readonly x: number;
  readonly y: number;
  /** Milliseconds since the stroke started. */
  readonly t: number;
}

export interface Stroke {
  readonly points: readonly PlanePoint[];
  readonly durationMs: number;
}

/**
 * What the player drew. Deliberately carries no blueprint: under inference
 * the sketch does not declare its intent (ARCHITECTURE §6.1).
 */
export interface Sketch {
  readonly strokes: readonly Stroke[];
  /** From the first point of the first stroke to the last point of the last. */
  readonly durationMs: number;
}

export interface Point2 {
  readonly x: number;
  readonly y: number;
}

export interface NormalizedStroke {
  /** Exactly DRAWING.resamplePoints points, evenly spaced along the stroke. */
  readonly points: readonly Point2[];
  /** Path length in normalized units. */
  readonly length: number;
  readonly durationMs: number;
}

/**
 * A sketch in normalized space: centred on its whole-drawing bounding box and
 * scaled so the longer axis spans 1. Orientation is preserved.
 */
export interface NormalizedDrawing {
  readonly strokes: readonly NormalizedStroke[];
  /** Bounding-box size in normalized units (the larger is 1 unless degenerate). */
  readonly width: number;
  readonly height: number;
  /** width / height, finite even for perfectly flat drawings. */
  readonly aspect: number;
  readonly durationMs: number;
  /** The original sketch, for constraints that need raw timing and speed. */
  readonly source: Sketch;
}
