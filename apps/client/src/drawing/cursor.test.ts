import { describe, expect, it } from 'vitest';
import { CURSOR_ORIGIN, moveCursor, type CursorConfig } from './cursor';

const config: CursorConfig = { sensitivity: 0.001, halfExtent: 0.4 };

describe('moveCursor', () => {
  it('starts in the middle of the plane', () => {
    expect(CURSOR_ORIGIN).toEqual({ x: 0, y: 0 });
  });

  it('follows the mouse right and left', () => {
    expect(moveCursor(CURSOR_ORIGIN, 100, 0, config).x).toBeCloseTo(0.1, 9);
    expect(moveCursor(CURSOR_ORIGIN, -100, 0, config).x).toBeCloseTo(-0.1, 9);
  });

  it('goes up the plane when the mouse moves up', () => {
    // Mouse dy is positive downwards; the plane's +y is up.
    expect(moveCursor(CURSOR_ORIGIN, 0, -100, config).y).toBeCloseTo(0.1, 9);
    expect(moveCursor(CURSOR_ORIGIN, 0, 100, config).y).toBeCloseTo(-0.1, 9);
  });

  it('scales with sensitivity', () => {
    const fast = moveCursor(CURSOR_ORIGIN, 100, 0, { ...config, sensitivity: 0.002 });
    expect(fast.x).toBeCloseTo(0.2, 9);
  });

  it('moves from wherever the cursor already is', () => {
    const moved = moveCursor({ x: 0.1, y: -0.1 }, 50, 50, config);
    expect(moved.x).toBeCloseTo(0.15, 9);
    expect(moved.y).toBeCloseTo(-0.15, 9);
  });

  it('clamps to the edge of the drawable area instead of wrapping or sticking', () => {
    const far = moveCursor(CURSOR_ORIGIN, 10_000, -10_000, config);
    expect(far).toEqual({ x: 0.4, y: 0.4 });
    const back = moveCursor(far, -100, 0, config);
    expect(back.x).toBeCloseTo(0.3, 9);
  });

  it('clamps each axis on its own, so an edge does not freeze the other axis', () => {
    const edge = moveCursor(CURSOR_ORIGIN, 10_000, 0, config);
    expect(edge).toEqual({ x: 0.4, y: 0 });
    const slid = moveCursor(edge, 500, -100, config);
    expect(slid).toEqual({ x: 0.4, y: 0.1 });
  });

  it('ignores movement that is not a finite number', () => {
    expect(moveCursor({ x: 0.1, y: 0.1 }, Number.NaN, 0, config)).toEqual({ x: 0.1, y: 0.1 });
    expect(moveCursor({ x: 0.1, y: 0.1 }, 0, Number.POSITIVE_INFINITY, config)).toEqual({
      x: 0.1,
      y: 0.1,
    });
  });
});
