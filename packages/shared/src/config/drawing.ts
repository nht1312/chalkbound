/**
 * Drawing recognition constants (ARCHITECTURE §6). Thresholds are tuned by
 * playing, and only ever toward MORE rejections: an honest "unrecognized"
 * costs the player 5 chalk and teaches the shape; a misread costs them the
 * fight and teaches them the game is unreliable (SPEC_AUDIT R-11).
 */
export const DRAWING = {
  /** Points per stroke after arc-length resampling. */
  resamplePoints: 32,

  /**
   * Inner fraction of a tolerance band that scores a full 1 before the score
   * ramps to 0 at the band's edges. [PLACEHOLDER]
   */
  bandPlateau: 0.5,

  /**
   * Bounding-box aspect (width / height) above this is 'wide' and below its
   * reciprocal is 'tall'; between them is 'square' (SPEC §6.3). [PLACEHOLDER]
   */
  squareAspectBand: 1.2,

  /**
   * A stroke counts as closed when the gap between its endpoints is under this
   * fraction of its own path length. Scale-free, so it reads the same for a
   * small circle and a large one. [PLACEHOLDER]
   */
  closureGapRatio: 0.25,

  /**
   * Anti-automation floors, deliberately lenient: wrongly calling a real
   * player a machine is far worse than letting a script through in a game with
   * no competitive economy yet. All [PLACEHOLDER], tuned by playing.
   */
  human: {
    /** Fastest believable cursor speed between samples, plane metres/second. */
    maxSpeed: 15,
    /** Floor on the coefficient of variation of inter-sample speed. */
    minSpeedVariation: 0.08,
    /** Below this many speed samples a sketch is not judged, and passes. */
    minSamples: 8,
  },
} as const;
