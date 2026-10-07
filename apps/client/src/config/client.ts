/** Client-only tuning values. Gameplay rules belong in @chalkbound/shared. */
export const CLIENT_CONFIG = {
  camera: {
    fovDegrees: 75,
    near: 0.05,
    far: 200,
    /** Standing eye height above the feet, in metres. */
    eyeHeight: 1.65,
    /** Crouching eye height above the feet (snaps for now; Phase 1 T5 lerps it). */
    crouchEyeHeight: 1.05,
    /** Radians of rotation per pixel of mouse movement. */
    mouseSensitivity: 0.0022,
    /** Pitch clamp in radians (just under 90° to avoid gimbal flip). */
    pitchLimit: (89 * Math.PI) / 180,
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
