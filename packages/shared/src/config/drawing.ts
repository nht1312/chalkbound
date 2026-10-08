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
   * The best candidate must clear this to be recognized at all (SPEC §6.2
   * stage 2). [PLACEHOLDER] — tune by playing, upward.
   */
  recognitionFloor: 0.5,

  /**
   * ...and must beat the runner-up by this much, or the sketch is refused as
   * ambiguous rather than guessed at. [PLACEHOLDER]
   */
  ambiguityMargin: 0.15,

  /**
   * Weights of the classifier's soft score (ARCHITECTURE §6.3). They sum to 1,
   * which a test asserts. Template agreement dominates because it is the only
   * one of the three that sees the whole shape. [PLACEHOLDER]
   */
  classify: {
    templateWeight: 0.6,
    aspectWeight: 0.15,
    angleWeight: 0.25,
    /** Mean per-point distance, in normalized units, at which agreement is 0. */
    maxTemplateDistance: 0.35,
  },

  /**
   * Accuracy bands for a created object (SPEC §6.5): crude below `sound`,
   * sound up to and including `keen`, keen above it. [PLACEHOLDER]
   */
  quality: {
    sound: 0.75,
    keen: 0.9,
  },

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
   * Shortest gap the authority accepts between one player's submissions
   * (plan decision 5). An anti-flood measure, not a gameplay rule: drawing,
   * lowering the chalk and raising it again takes far longer than this.
   * [PLACEHOLDER]
   */
  minSubmitIntervalMs: 500,

  /**
   * Wire limits and precision for a submitted sketch (plan T4, decision 5).
   * The limits are a cap on what one player can make the authority decode,
   * not a gameplay rule: a legitimate blueprint is nowhere near any of them.
   */
  wire: {
    /** Most strokes one submission may carry. [PLACEHOLDER] */
    maxStrokes: 8,
    /** Most samples one stroke may carry. [PLACEHOLDER] */
    maxPointsPerStroke: 256,
    /**
     * Plane coordinates travel as int16 multiples of this, in metres. Half a
     * step is 0.25 mm on a plane 800 mm across — far below the tolerance of
     * any constraint, and small enough that consecutive samples usually fit
     * in a single delta byte. [PLACEHOLDER]
     */
    coordStepM: 0.0005,
    /**
     * Coordinates are clamped this far from the plane centre before
     * quantizing. The drawable area is 0.8 m square (plan decision 8); the
     * margin keeps a cursor sitting exactly on the edge from rounding out.
     */
    coordLimitM: 0.5,
    /** Longest sketch the wire carries, in milliseconds. [PLACEHOLDER] */
    maxDurationMs: 60_000,
  },

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
