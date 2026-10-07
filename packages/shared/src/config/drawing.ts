/**
 * Drawing recognition constants (ARCHITECTURE §6). Thresholds are tuned by
 * playing, and only ever toward MORE rejections: an honest "unrecognized"
 * costs the player 5 chalk and teaches the shape; a misread costs them the
 * fight and teaches them the game is unreliable (SPEC_AUDIT R-11).
 */
export const DRAWING = {
  /** Points per stroke after arc-length resampling. */
  resamplePoints: 32,
} as const;
