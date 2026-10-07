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
    /** Eye height above the feet, metres. Capsule is 1.8 m standing, 1.2 m crouched. */
    standingEyeHeight: 1.65,
    crouchingEyeHeight: 1.05,
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
    rig: {
      blendSmoothing: 0.12,
      minWalkSpeed: 0.3,
      breathing: { amplitude: 0.004, frequency: 0.25 },
      rest: {
        left: { x: -0.22, y: -0.24, z: -0.45 },
        right: { x: 0.22, y: -0.24, z: -0.45 },
      },
      poses: {
        idle: { offset: { x: 0, y: 0, z: 0 }, pitch: 0, sway: 0.006 },
        walk: { offset: { x: 0, y: -0.01, z: 0 }, pitch: 0, sway: 0.012 },
        // Arms drop and tilt down while running.
        sprint: { offset: { x: 0, y: -0.06, z: 0.04 }, pitch: -0.35, sway: 0.03 },
      },
    },
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
