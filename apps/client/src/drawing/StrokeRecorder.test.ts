import { DRAWING, encodeSketch } from '@chalkbound/shared';
import { describe, expect, it } from 'vitest';
import { StrokeRecorder, type StrokeRecorderConfig } from './StrokeRecorder';

const config: StrokeRecorderConfig = { sampleRate: 100, minDistance: 0.01 };
/** One sample interval at the configured rate. */
const STEP = 1000 / config.sampleRate;

const recorder = (): StrokeRecorder => new StrokeRecorder(config);

/** Feeds a straight run of samples, one per interval, `step` metres apart. */
function drawLine(r: StrokeRecorder, count: number, step = 0.05, startMs = 0): number {
  let t = startMs;
  r.beginStroke({ x: 0, y: 0 }, t);
  for (let i = 1; i < count; i++) {
    t += STEP;
    r.sample({ x: i * step, y: 0 }, t);
  }
  r.endStroke(t);
  return t;
}

describe('StrokeRecorder sampling', () => {
  it('keeps the first point of a stroke without waiting', () => {
    const r = recorder();
    r.beginStroke({ x: 0.1, y: -0.2 }, 500);
    expect(r.strokes[0]?.points).toEqual([{ x: 0.1, y: -0.2, t: 0 }]);
  });

  it('ignores samples that arrive faster than the sample rate', () => {
    const r = recorder();
    r.beginStroke({ x: 0, y: 0 }, 0);
    r.sample({ x: 0.1, y: 0 }, STEP / 4);
    r.sample({ x: 0.2, y: 0 }, STEP / 2);
    expect(r.strokes[0]?.points).toHaveLength(1);
    r.sample({ x: 0.3, y: 0 }, STEP);
    expect(r.strokes[0]?.points).toHaveLength(2);
  });

  it('drops samples that barely moved, however long the player dwells', () => {
    const r = recorder();
    r.beginStroke({ x: 0, y: 0 }, 0);
    for (let i = 1; i <= 10; i++) r.sample({ x: 0.0001 * i, y: 0 }, i * STEP);
    expect(r.strokes[0]?.points).toHaveLength(1);
  });

  it('keeps a sample once it has travelled the minimum distance', () => {
    const r = recorder();
    r.beginStroke({ x: 0, y: 0 }, 0);
    r.sample({ x: config.minDistance / 2, y: 0 }, STEP);
    expect(r.strokes[0]?.points).toHaveLength(1);
    r.sample({ x: config.minDistance, y: 0 }, 2 * STEP);
    expect(r.strokes[0]?.points).toHaveLength(2);
  });

  it('measures distance in both axes', () => {
    const r = recorder();
    r.beginStroke({ x: 0, y: 0 }, 0);
    const diagonal = config.minDistance / Math.SQRT2 + 1e-6;
    r.sample({ x: diagonal, y: diagonal }, STEP);
    expect(r.strokes[0]?.points).toHaveLength(2);
  });

  it('does not run a backlog of samples after a stall', () => {
    const r = recorder();
    r.beginStroke({ x: 0, y: 0 }, 0);
    r.sample({ x: 0.1, y: 0 }, 1000);
    r.sample({ x: 0.2, y: 0 }, 1000 + STEP / 4);
    expect(r.strokes[0]?.points).toHaveLength(2);
  });
});

describe('StrokeRecorder strokes', () => {
  it('keeps the point where the player lifted, however small the last move', () => {
    const r = recorder();
    r.beginStroke({ x: 0, y: 0 }, 0);
    r.sample({ x: 0.2, y: 0 }, STEP);
    r.endStroke(2 * STEP);
    const last = r.strokes[0]?.points.at(-1);
    expect(last).toMatchObject({ x: 0.2, y: 0 });
    expect(r.strokes[0]?.points).toHaveLength(2);
  });

  it('closes the stroke at the last sampled position, not a duplicate', () => {
    const r = recorder();
    r.beginStroke({ x: 0, y: 0 }, 0);
    r.sample({ x: 0.005, y: 0 }, STEP); // inside the distance filter
    r.endStroke(2 * STEP);
    expect(r.strokes[0]?.points).toEqual([
      { x: 0, y: 0, t: 0 },
      { x: 0.005, y: 0, t: 2 * STEP },
    ]);
  });

  it('times every point from the start of the sketch, not of its stroke', () => {
    const r = recorder();
    r.beginStroke({ x: 0, y: 0 }, 1000);
    r.endStroke(1000);
    r.beginStroke({ x: 0.1, y: 0 }, 1500);
    r.endStroke(1500);
    expect(r.strokes[0]?.points[0]?.t).toBe(0);
    expect(r.strokes[1]?.points[0]?.t).toBe(500);
  });

  it('reports whether a stroke is open', () => {
    const r = recorder();
    expect(r.isRecording).toBe(false);
    r.beginStroke({ x: 0, y: 0 }, 0);
    expect(r.isRecording).toBe(true);
    r.endStroke(STEP);
    expect(r.isRecording).toBe(false);
  });

  it('shows the open stroke in the trail while it is being drawn', () => {
    const r = recorder();
    r.beginStroke({ x: 0, y: 0 }, 0);
    r.sample({ x: 0.2, y: 0 }, STEP);
    expect(r.strokes).toHaveLength(1);
    expect(r.strokes[0]?.points).toHaveLength(2);
  });
});

describe('StrokeRecorder limits', () => {
  it('stops adding points at the wire limit', () => {
    const r = recorder();
    const over = DRAWING.wire.maxPointsPerStroke + 50;
    let t = 0;
    r.beginStroke({ x: 0, y: 0 }, t);
    for (let i = 1; i < over; i++) {
      t += STEP;
      r.sample({ x: i * 0.02, y: 0 }, t);
    }
    r.endStroke(t);
    expect(r.strokes[0]?.points.length).toBe(DRAWING.wire.maxPointsPerStroke);
  });

  it('refuses to open more strokes than the wire carries', () => {
    const r = recorder();
    for (let i = 0; i < DRAWING.wire.maxStrokes + 3; i++) {
      r.beginStroke({ x: i * 0.01, y: 0 }, i * STEP);
      r.endStroke(i * STEP);
    }
    expect(r.strokes).toHaveLength(DRAWING.wire.maxStrokes);
    expect(r.isRecording).toBe(false);
  });
});

describe('StrokeRecorder finish', () => {
  it('returns nothing when the player drew nothing', () => {
    expect(recorder().finish()).toBeUndefined();
  });

  it('closes a stroke still open when the chalk comes down', () => {
    const r = recorder();
    r.beginStroke({ x: 0, y: 0 }, 0);
    r.sample({ x: 0.2, y: 0 }, STEP);
    const sketch = r.finish();
    expect(r.isRecording).toBe(false);
    expect(sketch?.strokes).toHaveLength(1);
  });

  it('derives each duration from the points it holds', () => {
    const r = recorder();
    drawLine(r, 5);
    r.beginStroke({ x: 0, y: 0.2 }, 10 * STEP);
    r.sample({ x: 0.1, y: 0.2 }, 12 * STEP);
    r.endStroke(12 * STEP);
    const sketch = r.finish();
    expect(sketch?.strokes[0]?.durationMs).toBe(4 * STEP);
    expect(sketch?.strokes[1]?.durationMs).toBe(2 * STEP);
    expect(sketch?.durationMs).toBe(12 * STEP);
  });

  it('produces a sketch the wire accepts', () => {
    const r = recorder();
    drawLine(r, 6);
    r.beginStroke({ x: 0.1, y: 0.1 }, 20 * STEP);
    r.sample({ x: 0.2, y: 0.1 }, 21 * STEP);
    r.endStroke(21 * STEP);
    const sketch = r.finish();
    if (!sketch) throw new Error('expected a sketch');
    expect(() => encodeSketch(sketch)).not.toThrow();
    expect(sketch.strokes).toHaveLength(2);
  });

  it('starts clean after a reset, including its timebase', () => {
    const r = recorder();
    drawLine(r, 4, 0.05, 5000);
    r.reset();
    expect(r.strokes).toHaveLength(0);
    expect(r.finish()).toBeUndefined();

    r.beginStroke({ x: 0, y: 0 }, 9000);
    expect(r.strokes[0]?.points[0]?.t).toBe(0);
  });
});
