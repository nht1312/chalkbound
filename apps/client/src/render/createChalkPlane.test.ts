import type { Stroke } from '@chalkbound/shared';
import { describe, expect, it } from 'vitest';
import { writeTrail } from './createChalkPlane';

const HALF_WIDTH = 0.01;
const VERTS_PER_SEGMENT = 6;

const stroke = (points: readonly (readonly [number, number])[]): Stroke => ({
  points: points.map(([x, y], i) => ({ x, y, t: i * 10 })),
  durationMs: (points.length - 1) * 10,
});

/** Reads back vertex `i` as [x, y, z]. */
const vertex = (out: Float32Array, i: number): number[] => [
  out[i * 3] ?? Number.NaN,
  out[i * 3 + 1] ?? Number.NaN,
  out[i * 3 + 2] ?? Number.NaN,
];

describe('writeTrail', () => {
  it('writes nothing for an empty trail', () => {
    expect(writeTrail(new Float32Array(600), [], HALF_WIDTH, 100)).toBe(0);
  });

  it('writes nothing for a stroke with a single point', () => {
    const written = writeTrail(new Float32Array(600), [stroke([[0, 0]])], HALF_WIDTH, 100);
    expect(written).toBe(0);
  });

  it('writes two triangles per segment', () => {
    const out = new Float32Array(600);
    const line = stroke([
      [0, 0],
      [0, 0.1],
      [0, 0.2],
    ]);
    expect(writeTrail(out, [line], HALF_WIDTH, 100)).toBe(2 * VERTS_PER_SEGMENT);
  });

  it('spreads the ribbon across the segment, not along it', () => {
    const out = new Float32Array(600);
    // A segment straight up: the ribbon must widen in x.
    writeTrail(
      out,
      [
        stroke([
          [0, 0],
          [0, 0.1],
        ]),
      ],
      HALF_WIDTH,
      100,
    );
    const xs = Array.from({ length: VERTS_PER_SEGMENT }, (_, i) => vertex(out, i)[0] ?? 0);
    expect(Math.min(...xs)).toBeCloseTo(-HALF_WIDTH, 6);
    expect(Math.max(...xs)).toBeCloseTo(HALF_WIDTH, 6);
  });

  it('widens across x for a horizontal segment too', () => {
    const out = new Float32Array(600);
    writeTrail(
      out,
      [
        stroke([
          [0, 0],
          [0.1, 0],
        ]),
      ],
      HALF_WIDTH,
      100,
    );
    const ys = Array.from({ length: VERTS_PER_SEGMENT }, (_, i) => vertex(out, i)[1] ?? 0);
    expect(Math.min(...ys)).toBeCloseTo(-HALF_WIDTH, 6);
    expect(Math.max(...ys)).toBeCloseTo(HALF_WIDTH, 6);
  });

  it('keeps every vertex on the plane', () => {
    const out = new Float32Array(600);
    const written = writeTrail(
      out,
      [
        stroke([
          [0, 0],
          [0.1, 0.1],
          [0.2, -0.1],
        ]),
      ],
      HALF_WIDTH,
      100,
    );
    for (let i = 0; i < written; i++) expect(vertex(out, i)[2]).toBe(0);
  });

  it('skips a zero-length segment rather than emitting a degenerate quad', () => {
    const out = new Float32Array(600);
    const written = writeTrail(
      out,
      [
        stroke([
          [0, 0],
          [0, 0],
          [0, 0.1],
        ]),
      ],
      HALF_WIDTH,
      100,
    );
    expect(written).toBe(VERTS_PER_SEGMENT);
  });

  it('draws every stroke of a sketch', () => {
    const out = new Float32Array(600);
    const written = writeTrail(
      out,
      [
        stroke([
          [0, -0.2],
          [0, 0.2],
        ]),
        stroke([
          [-0.1, 0],
          [0.1, 0],
        ]),
      ],
      HALF_WIDTH,
      100,
    );
    expect(written).toBe(2 * VERTS_PER_SEGMENT);
  });

  it('never writes past the buffer it was given', () => {
    const maxPoints = 4;
    const out = new Float32Array(maxPoints * VERTS_PER_SEGMENT * 3);
    const long = stroke(Array.from({ length: 50 }, (_, i): [number, number] => [i * 0.01, 0]));
    const written = writeTrail(out, [long, long], HALF_WIDTH, maxPoints);
    expect(written).toBeLessThanOrEqual(maxPoints * VERTS_PER_SEGMENT);
  });
});
