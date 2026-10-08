import { DRAWING } from '../config/drawing';
import { clamp } from '../math/quantize';
import { checkedInt, ProtocolError, Reader, Writer } from '../protocol/bytes';
import type { BlueprintId, Quality, RejectionReason } from './blueprint';
import type { FailureCode } from './constraints';
import type { DrawingResult, DrawingResultOutcome } from './result';
import type { PlanePoint, Sketch, Stroke } from './types';

/**
 * The drawing wire format (plan T4).
 *
 * A sketch is the one upstream message large enough to be worth packing
 * carefully: a sword is around 44 samples and would cost over a kilobyte as
 * JSON. Here each stroke stores its first point absolutely as two int16s and
 * every later point as a delta, so a sample that moved a couple of
 * millimetres costs one byte per axis. Timing is varint-delta for the same
 * reason. A two-stroke sword lands at roughly 140 bytes.
 *
 * {@link quantizeSketch} exists so the two sides never disagree: the client
 * grades the *quantized* sketch, which is byte-for-byte what the authority
 * will decode, rather than the raw samples it captured.
 */

const WIRE = DRAWING.wire;
/** Largest absolute quantized coordinate; comfortably inside int16. */
const COORD_MAX = Math.round(WIRE.coordLimitM / WIRE.coordStepM);
const U8_MAX = 0xff;

// ------------------------------------------------------------- enum tables
//
// Every table is keyed by the union it encodes, so adding a blueprint, a
// quality or a failure code is a type error until it has a wire value. Values
// are part of the wire format: never reuse or renumber one.

/** 0 is reserved for "no blueprint", so a code is always above zero. */
const BLUEPRINT_CODES: Record<BlueprintId, number> = { sword: 1, wall: 2, bridge: 3 };
const QUALITY_CODES: Record<Quality, number> = { crude: 1, sound: 2, keen: 3 };
const REASON_CODES: Record<RejectionReason, number> = { 'below-floor': 1, ambiguous: 2 };
const FAILURE_CODES: Record<FailureCode, number> = {
  'stroke-count': 1,
  'missing-stroke': 2,
  'not-straight': 3,
  'wrong-direction': 4,
  'wrong-relative-length': 5,
  'no-intersection': 6,
  'intersection-misplaced': 7,
  'endpoints-apart': 8,
  'not-closed': 9,
  'wrong-aspect': 10,
  'off-template': 11,
  'bad-timing': 12,
  inhuman: 13,
};
const OUTCOME_CODES: Record<DrawingResultOutcome['kind'], number> = {
  created: 1,
  smudged: 2,
  unrecognized: 3,
  unaffordable: 4,
};

function invert<K extends string>(codes: Record<K, number>): ReadonlyMap<number, K> {
  return new Map((Object.entries(codes) as [K, number][]).map(([key, code]) => [code, key]));
}

const BLUEPRINTS_BY_CODE = invert(BLUEPRINT_CODES);
const QUALITY_BY_CODE = invert(QUALITY_CODES);
const REASON_BY_CODE = invert(REASON_CODES);
const FAILURE_BY_CODE = invert(FAILURE_CODES);
const OUTCOME_BY_CODE = invert(OUTCOME_CODES);

export function blueprintWireId(id: BlueprintId): number {
  return BLUEPRINT_CODES[id];
}

/** Undefined for 0 ("absent") and for any code this build does not know. */
export function blueprintFromWireId(code: number): BlueprintId | undefined {
  return BLUEPRINTS_BY_CODE.get(code);
}

function lookup<K extends string>(by: ReadonlyMap<number, K>, code: number, what: string): K {
  const value = by.get(code);
  if (value === undefined) throw new ProtocolError(`Unknown ${what} code ${code}`);
  return value;
}

// ----------------------------------------------------------------- sketches

function quantizeCoord(metres: number): number {
  if (!Number.isFinite(metres)) throw new ProtocolError(`Coordinate ${metres} is not finite`);
  const q = Math.round(clamp(metres, -WIRE.coordLimitM, WIRE.coordLimitM) / WIRE.coordStepM);
  // Math.round(-0.2) is -0, which would survive into the quantized sketch but
  // not through the wire, and -0 is not equal to 0 under a deep comparison.
  return q === 0 ? 0 : q;
}

const dequantizeCoord = (quantized: number): number => quantized * WIRE.coordStepM;

function quantizeTime(ms: number): number {
  if (!Number.isFinite(ms)) throw new ProtocolError(`Timestamp ${ms} is not finite`);
  const t = Math.round(ms);
  return t === 0 ? 0 : t;
}

/** Last timestamp minus first, or 0 for a stroke too short to have a span. */
function span(points: readonly PlanePoint[]): number {
  const first = points[0];
  const last = points[points.length - 1];
  return first === undefined || last === undefined ? 0 : last.t - first.t;
}

function sketchSpan(strokes: readonly Stroke[]): number {
  const filled = strokes.filter((stroke) => stroke.points.length > 0);
  const first = filled[0]?.points[0];
  const last = filled[filled.length - 1]?.points.at(-1);
  return first === undefined || last === undefined ? 0 : last.t - first.t;
}

/**
 * The sketch exactly as the receiver will decode it: coordinates snapped to
 * the wire grid and clamped to the plane, timing rounded to whole
 * milliseconds, and every duration recomputed from the points so it cannot
 * contradict them. Idempotent.
 *
 * Throws only on values that are not finite; everything else is projected.
 */
export function quantizeSketch(sketch: Sketch): Sketch {
  const strokes = sketch.strokes.map((stroke): Stroke => {
    const points = stroke.points.map((point): PlanePoint => ({
      x: dequantizeCoord(quantizeCoord(point.x)),
      y: dequantizeCoord(quantizeCoord(point.y)),
      t: quantizeTime(point.t),
    }));
    return { points, durationMs: span(points) };
  });
  return { strokes, durationMs: sketchSpan(strokes) };
}

export function writeSketch(writer: Writer, sketch: Sketch): void {
  const { strokes } = sketch;
  if (strokes.length === 0 || strokes.length > WIRE.maxStrokes) {
    throw new ProtocolError(`Stroke count ${strokes.length} out of range`);
  }
  writer.u8(strokes.length);

  for (const stroke of strokes) {
    const count = stroke.points.length;
    if (count === 0 || count > WIRE.maxPointsPerStroke) {
      throw new ProtocolError(`Point count ${count} out of range`);
    }
    writer.u8(count - 1);

    let previousX = 0;
    let previousY = 0;
    let previousT = 0;
    stroke.points.forEach((point, index) => {
      const x = quantizeCoord(point.x);
      const y = quantizeCoord(point.y);
      const t = quantizeTime(point.t);
      if (t < 0 || t > WIRE.maxDurationMs) {
        throw new ProtocolError(`Timestamp ${t}ms out of range`);
      }
      if (index === 0) {
        writer.varint(t).i16(x).i16(y);
      } else {
        if (t < previousT) throw new ProtocolError('Stroke timing runs backwards');
        writer
          .varint(t - previousT)
          .svarint(x - previousX)
          .svarint(y - previousY);
      }
      previousX = x;
      previousY = y;
      previousT = t;
    });
  }
}

export function readSketch(reader: Reader): Sketch {
  const strokeCount = reader.u8();
  if (strokeCount === 0 || strokeCount > WIRE.maxStrokes) {
    throw new ProtocolError(`Stroke count ${strokeCount} out of range`);
  }

  const strokes: Stroke[] = [];
  for (let s = 0; s < strokeCount; s++) {
    const count = reader.u8() + 1;
    const points: PlanePoint[] = [];
    let x = 0;
    let y = 0;
    let t = 0;
    for (let i = 0; i < count; i++) {
      if (i === 0) {
        t = reader.varint();
        x = reader.i16();
        y = reader.i16();
      } else {
        t += reader.varint();
        x += reader.svarint();
        y += reader.svarint();
      }
      if (Math.abs(x) > COORD_MAX || Math.abs(y) > COORD_MAX) {
        throw new ProtocolError(`Coordinate (${x}, ${y}) is off the chalk plane`);
      }
      if (t > WIRE.maxDurationMs) throw new ProtocolError(`Timestamp ${t}ms out of range`);
      points.push({ x: dequantizeCoord(x), y: dequantizeCoord(y), t });
    }
    strokes.push({ points, durationMs: span(points) });
  }
  return { strokes, durationMs: sketchSpan(strokes) };
}

/** Standalone sketch bytes, for tests, tooling and the fixture-capture hook. */
export function encodeSketch(sketch: Sketch): Uint8Array {
  const writer = new Writer(192);
  writeSketch(writer, sketch);
  return writer.bytes;
}

export function decodeSketch(data: Uint8Array): Sketch {
  const reader = new Reader(data);
  const sketch = readSketch(reader);
  reader.end();
  return sketch;
}

// ------------------------------------------------------------------ results

/**
 * Accuracy travels as float32: around seven significant digits, which is far
 * more than the UI shows, and the message is sent at most once per drawing.
 */
export function writeDrawingResult(writer: Writer, result: DrawingResult): void {
  const { outcome } = result;
  writer
    .u8(OUTCOME_CODES[outcome.kind])
    .u8(checkedInt(result.chalkDebited, U8_MAX, 'chalkDebited'));

  switch (outcome.kind) {
    case 'created':
      writer
        .u8(blueprintWireId(outcome.blueprintId))
        .f32(outcome.accuracy)
        .u8(QUALITY_CODES[outcome.quality]);
      return;
    case 'smudged': {
      const { failures } = outcome;
      writer
        .u8(blueprintWireId(outcome.blueprintId))
        .f32(outcome.accuracy)
        .u8(checkedInt(failures.length, U8_MAX, 'failure count'));
      for (const code of failures) writer.u8(FAILURE_CODES[code]);
      return;
    }
    case 'unrecognized':
      writer
        .u8(REASON_CODES[outcome.reason])
        .u8(outcome.bestCandidate === undefined ? 0 : blueprintWireId(outcome.bestCandidate));
      return;
    case 'unaffordable':
      writer
        .u8(blueprintWireId(outcome.blueprintId))
        .u8(checkedInt(outcome.required, U8_MAX, 'required'))
        .u8(checkedInt(outcome.held, U8_MAX, 'held'));
      return;
  }
}

export function readDrawingResult(reader: Reader): DrawingResult {
  const kind = lookup(OUTCOME_BY_CODE, reader.u8(), 'drawing outcome');
  const chalkDebited = reader.u8();

  switch (kind) {
    case 'created':
      return {
        outcome: {
          kind,
          blueprintId: lookup(BLUEPRINTS_BY_CODE, reader.u8(), 'blueprint'),
          accuracy: reader.f32(),
          quality: lookup(QUALITY_BY_CODE, reader.u8(), 'quality'),
        },
        chalkDebited,
      };
    case 'smudged': {
      const blueprintId = lookup(BLUEPRINTS_BY_CODE, reader.u8(), 'blueprint');
      const accuracy = reader.f32();
      const failures: FailureCode[] = [];
      for (let i = reader.u8(); i > 0; i--) {
        failures.push(lookup(FAILURE_BY_CODE, reader.u8(), 'failure'));
      }
      return { outcome: { kind, blueprintId, accuracy, failures }, chalkDebited };
    }
    case 'unrecognized': {
      const reason = lookup(REASON_BY_CODE, reader.u8(), 'rejection reason');
      const candidate = reader.u8();
      // `exactOptionalPropertyTypes`: absent is a missing key, not `undefined`.
      const outcome: DrawingResultOutcome =
        candidate === 0
          ? { kind, reason }
          : { kind, reason, bestCandidate: lookup(BLUEPRINTS_BY_CODE, candidate, 'blueprint') };
      return { outcome, chalkDebited };
    }
    case 'unaffordable':
      return {
        outcome: {
          kind,
          blueprintId: lookup(BLUEPRINTS_BY_CODE, reader.u8(), 'blueprint'),
          required: reader.u8(),
          held: reader.u8(),
        },
        chalkDebited,
      };
  }
}

export function encodeDrawingResult(result: DrawingResult): Uint8Array {
  const writer = new Writer(16);
  writeDrawingResult(writer, result);
  return writer.bytes;
}

export function decodeDrawingResult(data: Uint8Array): DrawingResult {
  const reader = new Reader(data);
  const result = readDrawingResult(reader);
  reader.end();
  return result;
}
