import { INTERACTION, MOVEMENT } from '@chalkbound/shared';

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
      },
    },
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
