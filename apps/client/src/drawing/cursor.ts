import type { Point2 } from '@chalkbound/shared';

/**
 * The virtual cursor on the chalk plane (SPEC_AUDIT RD-08).
 *
 * Drawing needs an absolute position on a surface, but the game never leaves
 * pointer lock — releasing it mid-match would hand the player's next click to
 * the browser. So the same raw deltas that normally turn the camera move a
 * cursor instead, and the camera holds still.
 */
export interface CursorConfig {
  /** Plane metres travelled per pixel of mouse movement. */
  readonly sensitivity: number;
  /** Half-width of the drawable square, metres. */
  readonly halfExtent: number;
}

/** Every stroke starts from the middle of the plane. */
export const CURSOR_ORIGIN: Point2 = { x: 0, y: 0 };

/**
 * Applies one mouse delta. Each axis clamps on its own, so running into an
 * edge still lets the cursor slide along it rather than sticking in a corner.
 */
export function moveCursor(cursor: Point2, dx: number, dy: number, config: CursorConfig): Point2 {
  const { sensitivity, halfExtent } = config;
  return {
    x: clamp(cursor.x + offset(dx) * sensitivity, halfExtent),
    // Mouse dy counts downwards; the plane's +y is up.
    y: clamp(cursor.y - offset(dy) * sensitivity, halfExtent),
  };
}

/** A non-finite delta is a browser or device glitch; it must not poison the cursor. */
const offset = (delta: number): number => (Number.isFinite(delta) ? delta : 0);

const clamp = (value: number, limit: number): number => Math.min(limit, Math.max(-limit, value));
