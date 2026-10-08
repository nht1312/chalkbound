import { describe, expect, it } from 'vitest';
import { DRAWING } from '../config/drawing';
import { ProtocolError } from '../protocol/bytes';
import type { BlueprintId } from './blueprint';
import { BLUEPRINTS } from './blueprints/registry';
import { CORPUS, swordSketch } from './fixtures';
import { toDrawingResultOutcome, type DrawingResult } from './result';
import type { PlanePoint, Sketch, Stroke } from './types';
import { validateSketch } from './validate';
import {
  blueprintFromWireId,
  blueprintWireId,
  decodeDrawingResult,
  decodeSketch,
  encodeDrawingResult,
  encodeSketch,
  quantizeSketch,
} from './wire';

const { coordStepM, coordLimitM, maxStrokes, maxPointsPerStroke } = DRAWING.wire;

/** A stroke from bare coordinates, sampled at a steady `dt`. */
function stroke(points: readonly (readonly [number, number])[], dt = 20, startMs = 0): Stroke {
  const timed: PlanePoint[] = points.map(([x, y], i) => ({ x, y, t: startMs + i * dt }));
  return { points: timed, durationMs: (points.length - 1) * dt };
}

function sketchOf(...strokes: Stroke[]): Sketch {
  const first = strokes[0]?.points[0];
  const last = strokes[strokes.length - 1]?.points.at(-1);
  return { strokes, durationMs: (last?.t ?? 0) - (first?.t ?? 0) };
}

const roundTrip = (sketch: Sketch): Sketch => decodeSketch(encodeSketch(sketch));

describe('quantizeSketch', () => {
  it('snaps coordinates to the wire grid', () => {
    const q = quantizeSketch(sketchOf(stroke([[0.00037, -0.00037]])));
    expect(q.strokes[0]?.points[0]?.x).toBeCloseTo(coordStepM, 12);
    expect(q.strokes[0]?.points[0]?.y).toBeCloseTo(-coordStepM, 12);
  });

  it('clamps coordinates to the drawable plane rather than rejecting them', () => {
    const q = quantizeSketch(sketchOf(stroke([[99, -99]])));
    expect(q.strokes[0]?.points[0]?.x).toBeCloseTo(coordLimitM, 12);
    expect(q.strokes[0]?.points[0]?.y).toBeCloseTo(-coordLimitM, 12);
  });

  it('rounds timing to whole milliseconds', () => {
    const raw = sketchOf({
      points: [
        { x: 0, y: 0, t: 0 },
        { x: 0.1, y: 0, t: 16.7 },
      ],
      durationMs: 16.7,
    });
    expect(quantizeSketch(raw).strokes[0]?.points[1]?.t).toBe(17);
  });

  it('derives every duration from the points, so both sides agree on it', () => {
    const raw: Sketch = {
      strokes: [
        {
          points: stroke(
            [
              [0, 0],
              [0, 0.2],
            ],
            25,
          ).points,
          durationMs: 9999,
        },
      ],
      durationMs: 9999,
    };
    const q = quantizeSketch(raw);
    expect(q.strokes[0]?.durationMs).toBe(25);
    expect(q.durationMs).toBe(25);
  });

  it('is idempotent: quantizing an already-quantized sketch changes nothing', () => {
    const once = quantizeSketch(swordSketch(102));
    expect(quantizeSketch(once)).toEqual(once);
  });
});

describe('sketch wire format', () => {
  it('decodes to exactly what the client validated', () => {
    for (const fixture of CORPUS) {
      expect(roundTrip(fixture.sketch), fixture.name).toEqual(quantizeSketch(fixture.sketch));
    }
  });

  it('preserves stroke and point counts', () => {
    for (const fixture of CORPUS) {
      const decoded = roundTrip(fixture.sketch);
      expect(decoded.strokes.length, fixture.name).toBe(fixture.sketch.strokes.length);
      expect(
        decoded.strokes.map((s) => s.points.length),
        fixture.name,
      ).toEqual(fixture.sketch.strokes.map((s) => s.points.length));
    }
  });

  it('keeps every coordinate within half a quantization step', () => {
    const tolerance = coordStepM / 2 + 1e-12;
    for (const fixture of CORPUS) {
      const decoded = roundTrip(fixture.sketch);
      fixture.sketch.strokes.forEach((s, i) => {
        s.points.forEach((p, j) => {
          const q = decoded.strokes[i]?.points[j];
          const label = `${fixture.name} ${i}:${j}`;
          expect(Math.abs((q?.x ?? 0) - p.x), `${label}.x`).toBeLessThanOrEqual(tolerance);
          expect(Math.abs((q?.y ?? 0) - p.y), `${label}.y`).toBeLessThanOrEqual(tolerance);
        });
      });
    }
  });

  it('fits a two-stroke sword in a single small packet', () => {
    const bytes = encodeSketch(swordSketch(102));
    expect(bytes.byteLength).toBeGreaterThanOrEqual(100);
    expect(bytes.byteLength).toBeLessThanOrEqual(150);
  });

  it('re-encodes decoded bytes identically', () => {
    const once = encodeSketch(swordSketch(102));
    expect(encodeSketch(decodeSketch(once))).toEqual(once);
  });

  it('handles a single-point stroke', () => {
    const one = sketchOf(stroke([[0.1, -0.2]]));
    expect(roundTrip(one)).toEqual(quantizeSketch(one));
  });
});

describe('wire limits', () => {
  const line = stroke([
    [0, 0],
    [0, 0.1],
  ]);

  it('rejects a sketch with no strokes', () => {
    expect(() => encodeSketch(sketchOf())).toThrow(ProtocolError);
  });

  it('rejects more strokes than the wire allows', () => {
    const atLimit = sketchOf(...Array.from({ length: maxStrokes }, () => line));
    const overLimit = sketchOf(...Array.from({ length: maxStrokes + 1 }, () => line));
    expect(() => encodeSketch(atLimit)).not.toThrow();
    expect(() => encodeSketch(overLimit)).toThrow(ProtocolError);
  });

  it('rejects an empty stroke', () => {
    expect(() => encodeSketch(sketchOf({ points: [], durationMs: 0 }))).toThrow(ProtocolError);
  });

  it('rejects more points in a stroke than the wire allows', () => {
    const points = Array.from({ length: maxPointsPerStroke + 1 }, (_, i): [number, number] => [
      i * 0.001,
      0,
    ]);
    expect(() => encodeSketch(sketchOf(stroke(points)))).toThrow(ProtocolError);
  });

  it('rejects timing that runs backwards inside a stroke', () => {
    const backwards = sketchOf({
      points: [
        { x: 0, y: 0, t: 100 },
        { x: 0.1, y: 0, t: 50 },
      ],
      durationMs: 0,
    });
    expect(() => encodeSketch(backwards)).toThrow(ProtocolError);
  });

  it('rejects a sketch that lasts longer than the wire allows', () => {
    const slow = sketchOf({
      points: [
        { x: 0, y: 0, t: 0 },
        { x: 0.1, y: 0, t: DRAWING.wire.maxDurationMs + 1 },
      ],
      durationMs: 0,
    });
    expect(() => encodeSketch(slow)).toThrow(ProtocolError);
  });

  it('rejects truncated bytes', () => {
    const bytes = encodeSketch(swordSketch(102));
    expect(() => decodeSketch(bytes.subarray(0, bytes.byteLength - 1))).toThrow(ProtocolError);
  });

  it('rejects trailing bytes', () => {
    const bytes = encodeSketch(swordSketch(102));
    const padded = new Uint8Array(bytes.byteLength + 1);
    padded.set(bytes);
    expect(() => decodeSketch(padded)).toThrow(ProtocolError);
  });

  it('rejects a declared stroke count beyond the limit', () => {
    const tampered = Uint8Array.from(encodeSketch(swordSketch(102)));
    tampered[0] = maxStrokes + 1;
    expect(() => decodeSketch(tampered)).toThrow(ProtocolError);
  });

  it('rejects a zero stroke count', () => {
    expect(() => decodeSketch(Uint8Array.of(0))).toThrow(ProtocolError);
  });

  it('decodes from a subarray view with a non-zero byte offset', () => {
    const bytes = encodeSketch(swordSketch(102));
    const offset = new Uint8Array(bytes.byteLength + 3);
    offset.set(bytes, 3);
    expect(decodeSketch(offset.subarray(3))).toEqual(quantizeSketch(swordSketch(102)));
  });
});

describe('validator parity', () => {
  it('reaches the same verdict on the client sketch and on the decoded bytes', () => {
    for (const fixture of CORPUS) {
      const local = validateSketch(fixture.sketch, { heldChalk: 100 });
      const remote = validateSketch(roundTrip(fixture.sketch), { heldChalk: 100 });
      expect(remote.kind, fixture.name).toBe(local.kind);
      if (local.kind === 'created' && remote.kind === 'created') {
        expect(remote.quality, fixture.name).toBe(local.quality);
        expect(remote.accuracy, fixture.name).toBeCloseTo(local.accuracy, 2);
      }
      if ('blueprintId' in local && 'blueprintId' in remote) {
        expect(remote.blueprintId, fixture.name).toBe(local.blueprintId);
      }
    }
  });
});

describe('blueprint wire ids', () => {
  it('round-trips every registered blueprint', () => {
    for (const blueprint of BLUEPRINTS) {
      expect(blueprintFromWireId(blueprintWireId(blueprint.id))).toBe(blueprint.id);
    }
  });

  it('reads 0 and unknown codes as no blueprint', () => {
    expect(blueprintFromWireId(0)).toBeUndefined();
    expect(blueprintFromWireId(250)).toBeUndefined();
  });

  it('never assigns 0, which means absent', () => {
    for (const blueprint of BLUEPRINTS) expect(blueprintWireId(blueprint.id)).toBeGreaterThan(0);
  });
});

describe('drawing result wire format', () => {
  const trip = (result: DrawingResult): DrawingResult =>
    decodeDrawingResult(encodeDrawingResult(result));

  it('round-trips a created result with its quality', () => {
    const result: DrawingResult = {
      outcome: { kind: 'created', blueprintId: 'sword', accuracy: 0.8125, quality: 'sound' },
      chalkDebited: 20,
    };
    expect(trip(result)).toEqual(result);
  });

  it('round-trips a smudged result with every failure code', () => {
    const result: DrawingResult = {
      outcome: {
        kind: 'smudged',
        blueprintId: 'sword',
        accuracy: 0.5,
        failures: ['no-intersection', 'not-straight', 'wrong-aspect'],
      },
      chalkDebited: 5,
    };
    expect(trip(result)).toEqual(result);
  });

  it('round-trips an unrecognized result with and without a best candidate', () => {
    const bare: DrawingResult = {
      outcome: { kind: 'unrecognized', reason: 'below-floor' },
      chalkDebited: 5,
    };
    const withCandidate: DrawingResult = {
      outcome: { kind: 'unrecognized', reason: 'ambiguous', bestCandidate: 'sword' },
      chalkDebited: 5,
    };
    expect(trip(bare)).toEqual(bare);
    expect(trip(withCandidate)).toEqual(withCandidate);
  });

  it('round-trips an unaffordable result', () => {
    const result: DrawingResult = {
      outcome: { kind: 'unaffordable', blueprintId: 'sword', required: 20, held: 3 },
      chalkDebited: 3,
    };
    expect(trip(result)).toEqual(result);
  });

  it('refuses a chalk debit the wire cannot carry', () => {
    const result: DrawingResult = {
      outcome: { kind: 'unrecognized', reason: 'below-floor' },
      chalkDebited: 300,
    };
    expect(() => encodeDrawingResult(result)).toThrow(ProtocolError);
  });

  it('rejects an unknown outcome tag', () => {
    expect(() => decodeDrawingResult(Uint8Array.of(99, 0))).toThrow(ProtocolError);
  });
});

describe('toDrawingResultOutcome', () => {
  it('keeps the failure codes and drops the server-side wording', () => {
    const smudged = toDrawingResultOutcome({
      kind: 'smudged',
      blueprintId: 'sword',
      accuracy: 0.4,
      failures: [
        { kind: 'Intersection(0,1)', code: 'no-intersection', detail: 'never crosses' },
        { kind: 'Straightness(0)', code: 'not-straight', detail: 'wobbly' },
      ],
    });
    expect(smudged).toEqual({
      kind: 'smudged',
      blueprintId: 'sword',
      accuracy: 0.4,
      failures: ['no-intersection', 'not-straight'],
    });
  });

  it('passes the other three outcomes through unchanged', () => {
    const created = {
      kind: 'created',
      blueprintId: 'sword' as BlueprintId,
      accuracy: 0.9,
      quality: 'keen',
    } as const;
    expect(toDrawingResultOutcome(created)).toEqual(created);
  });
});
