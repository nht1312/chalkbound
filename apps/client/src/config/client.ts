/** Client-only tuning values. Gameplay rules belong in @chalkbound/shared. */
export const CLIENT_CONFIG = {
  camera: {
    fovDegrees: 75,
    near: 0.05,
    far: 200,
    /** Eye height above the floor in metres. */
    eyeHeight: 1.65,
    /** Radians of rotation per pixel of mouse movement. */
    mouseSensitivity: 0.0022,
    /** Pitch clamp in radians (just under 90° to avoid gimbal flip). */
    pitchLimit: (89 * Math.PI) / 180,
  },
  render: {
    maxPixelRatio: 2,
  },
  debugMover: {
    /** Noclip speed in metres per second. */
    speed: 4,
    sprintMultiplier: 2.5,
  },
  stats: {
    /** How often the overlay text refreshes, in seconds. */
    refreshInterval: 0.5,
  },
} as const;
