import { DRAWING, INTERACTION, MOVEMENT } from '@chalkbound/shared';

/** Client-only tuning values. Gameplay rules belong in @chalkbound/shared. */
export const CLIENT_CONFIG = {
  camera: {
    near: 0.05,
    far: 200,
    /** Default radians of rotation per pixel; the player can change it in the pause menu. */
    mouseSensitivity: 0.0022,
    /** Allowed sensitivity range for the setting. */
    sensitivityLimits: { min: 0.0005, max: 0.006 },
    /** Pitch clamp in radians (just under 90° to avoid gimbal flip). */
    pitchLimit: (89 * Math.PI) / 180,
  },
  /** Cosmetic camera motion (ARCHITECTURE §4.3). */
  feel: {
    /** Eye heights are shared: the authority measures interaction reach from the eyes. */
    standingEyeHeight: MOVEMENT.eyeHeight.standing,
    crouchingEyeHeight: MOVEMENT.eyeHeight.crouching,
    eyeHeightSmoothing: 0.08,
    baseFov: 75,
    sprintFovBoost: 8,
    fovSmoothing: 0.15,
    bob: {
      strideLength: 1.4,
      amplitudeY: 0.035,
      amplitudeX: 0.02,
      blendSmoothing: 0.1,
      minSpeed: 0.3,
      /** Full amplitude from walk speed upwards. */
      referenceSpeed: 2.8,
    },
  },
  /** First-person hands (Phase 1 T6). Positions are view space, metres. */
  hands: {
    lens: { fov: 60, near: 0.01, far: 10 },
    /** Feel check: the first arms (9 cm hands, 7 cm forearms) read as too big. */
    arm: {
      forearm: { width: 0.05, height: 0.05, length: 0.24 },
      hand: { width: 0.065, height: 0.035, length: 0.07 },
    },
    rig: {
      blendSmoothing: 0.12,
      minWalkSpeed: 0.3,
      breathing: { amplitude: 0.004, frequency: 0.25 },
      rest: {
        left: { x: -0.2, y: -0.22, z: -0.48 },
        right: { x: 0.2, y: -0.22, z: -0.48 },
      },
      poses: {
        idle: { offset: { x: 0, y: 0, z: 0 }, pitch: 0, sway: 0.006 },
        walk: { offset: { x: 0, y: -0.01, z: 0 }, pitch: 0, sway: 0.012 },
        // Arms drop and tilt down while running.
        sprint: { offset: { x: 0, y: -0.06, z: 0.04 }, pitch: -0.35, sway: 0.03 },
        // The chalk hand comes up to the plane; the other drops out of the way.
        // Almost no sway: a drawing hand is a steady one.
        draw: {
          offset: { x: 0, y: -0.02, z: 0.02 },
          rightOffset: { x: -0.12, y: 0.26, z: -0.18 },
          pitch: 0.25,
          sway: 0.002,
        },
      },
    },
  },
  /** Raising the chalk and drawing on the plane (Phase 3 T6). */
  drawing: {
    /**
     * Plane metres the cursor travels per pixel. Separate from look
     * sensitivity on purpose: the speed that aims well is not the speed that
     * draws well, and the plan budgets feel iterations on exactly this.
     */
    cursorSensitivity: 0.0012,
    cursorSensitivityLimits: { min: 0.0003, max: 0.004 },
    /** Half-width of the drawable square, from the shared plane size. */
    halfExtent: DRAWING.plane.sizeM / 2,
    /** How long the plane takes to arrive, and to leave. */
    fadeSeconds: 0.15,
    /** How long the verdict stays on screen after a submission. */
    bannerHoldSeconds: 2.5,
    recorder: {
      /** Samples per second. Above the tick rate: drawing is a drawn line, not a step. */
      sampleRate: 90,
      /** Plane metres between kept samples; below this the hand is dwelling, not drawing. */
      minDistance: 0.003,
    },
    plane: {
      /** Distance ahead in the viewmodel scene, from the shared plane distance. */
      distance: DRAWING.plane.distanceM,
      /** Drawn slightly larger than the drawable area, so the edge is visible. */
      margin: 0.06,
      /** Chalk trail width, metres. */
      trailWidth: 0.012,
      /** Size of one dust mote, metres. */
      dustSize: 0.005,
      /** Draw budget for dust; the field's own pool is the real limit. */
      maxDust: 256,
    },
    /**
     * The scratch loop (SPEC §14, D-02). All [PLACEHOLDER]: this is the
     * sound that tells the drawer the stroke registered *and* tells everyone
     * nearby they are standing still, so it is tuned by playing.
     */
    scratch: {
      minSpeed: 0.02,
      fullSpeed: 0.6,
      maxGain: 0.35,
      minRate: 0.7,
      maxRate: 1.6,
      smoothing: 0.05,
      voice: { centreHz: 2400, q: 1.6, lowpassHz: 7000, loopSeconds: 2 },
    },
    /** Chalk dust at the cursor. [PLACEHOLDER] */
    dust: {
      maxParticles: 256,
      emitRate: 110,
      fullSpeed: 0.6,
      lifeSeconds: 0.7,
      gravity: 0.35,
      scatter: 0.05,
    },
    /**
     * The resolve glow. The attack plus the hold must outlast a realistic
     * round trip, or the verdict lands after the sketch has gone dark
     * (SPEC_AUDIT R-03). [PLACEHOLDER]
     */
    glow: { attackSeconds: 0.08, holdSeconds: 0.22, decaySeconds: 0.35 },
  },
  /** Aiming at world objects for the interact prompt (Phase 2 T5). */
  targeting: {
    /** The authority's reach, so the prompt never offers what the server will refuse. */
    range: INTERACTION.range,
    /** Half-angle of the aim cone around the screen centre. */
    maxAngleRadians: (12 * Math.PI) / 180,
  },
  render: {
    maxPixelRatio: 2,
  },
  prediction: {
    /** Position difference (m) beyond which a prediction is corrected. */
    positionTolerance: 0.001,
    /** Velocity difference (m/s) beyond which a prediction is corrected. */
    velocityTolerance: 0.01,
    /** Stamina difference beyond which a prediction is corrected. */
    staminaTolerance: 0.01,
    /** Correction smoothing window, seconds (ARCHITECTURE §4.4: ~100 ms). */
    correctionSmoothingSeconds: 0.1,
    /** Corrections larger than this (m) snap rather than glide. */
    snapDistance: 2,
  },
  stats: {
    /** How often the overlay text refreshes, in seconds. */
    refreshInterval: 0.5,
  },
} as const;
