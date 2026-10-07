export interface CameraFeelConfig {
  readonly standingEyeHeight: number;
  readonly crouchingEyeHeight: number;
  /** Time constant of the crouch/stand eye-height transition, seconds. */
  readonly eyeHeightSmoothing: number;
  /** Vertical FOV in degrees. */
  readonly baseFov: number;
  /** Extra FOV while sprinting, degrees. */
  readonly sprintFovBoost: number;
  /** Time constant of FOV changes, seconds. */
  readonly fovSmoothing: number;
  readonly bob: {
    /** Distance travelled per full bob cycle (two footsteps), metres. */
    readonly strideLength: number;
    /** Peak vertical offset, metres. */
    readonly amplitudeY: number;
    /** Peak sideways sway, metres. */
    readonly amplitudeX: number;
    /** Time constant for bob fading in and out, seconds. */
    readonly blendSmoothing: number;
    /** Below this horizontal speed (m/s) the bob fades out. */
    readonly minSpeed: number;
    /** Speed (m/s) at which the bob reaches full amplitude. */
    readonly referenceSpeed: number;
  };
}

/** What the camera needs to know about the player's movement this frame. */
export interface MovementSample {
  readonly horizontalSpeed: number;
  readonly grounded: boolean;
  readonly crouching: boolean;
  readonly sprinting: boolean;
}

export interface CameraFeelState {
  /** Eye height above the feet, metres. */
  readonly eyeHeight: number;
  /** Current vertical FOV, degrees. */
  readonly fov: number;
  /** Bob cycle position, radians; advances with distance travelled. */
  readonly bobPhase: number;
  /** Bob strength in [0, 1], blended so it fades rather than cuts. */
  readonly bobAmount: number;
}

/** Bob strength below which it is treated as off. */
const BOB_EPSILON = 1e-3;

export function initialCameraFeel(config: CameraFeelConfig): CameraFeelState {
  return { eyeHeight: config.standingEyeHeight, fov: config.baseFov, bobPhase: 0, bobAmount: 0 };
}

/**
 * Advances the purely cosmetic camera effects by one rendered frame. Nothing
 * here feeds back into movement or the network.
 */
export function updateCameraFeel(
  state: CameraFeelState,
  movement: MovementSample,
  dt: number,
  config: CameraFeelConfig,
): CameraFeelState {
  const { bob } = config;
  const targetEye = movement.crouching ? config.crouchingEyeHeight : config.standingEyeHeight;
  const targetFov = config.baseFov + (movement.sprinting ? config.sprintFovBoost : 0);

  const walking = movement.grounded && movement.horizontalSpeed > bob.minSpeed;
  const speedScale = Math.min(1, movement.horizontalSpeed / bob.referenceSpeed);
  let bobAmount = approach(state.bobAmount, walking ? speedScale : 0, dt, bob.blendSmoothing);
  if (bobAmount < BOB_EPSILON) bobAmount = 0;

  return {
    eyeHeight: approach(state.eyeHeight, targetEye, dt, config.eyeHeightSmoothing),
    fov: approach(state.fov, targetFov, dt, config.fovSmoothing),
    bobPhase: state.bobPhase + ((movement.horizontalSpeed * dt) / bob.strideLength) * 2 * Math.PI,
    bobAmount,
  };
}

/**
 * Camera offset from the bob: `y` dips twice per cycle (once per footstep),
 * `x` sways once per cycle along the camera's right axis.
 */
export function bobOffset(
  state: CameraFeelState,
  config: CameraFeelConfig,
): { x: number; y: number } {
  if (state.bobAmount === 0) return { x: 0, y: 0 };
  return {
    x: Math.sin(state.bobPhase) * config.bob.amplitudeX * state.bobAmount,
    y: -Math.abs(Math.sin(state.bobPhase)) * config.bob.amplitudeY * state.bobAmount,
  };
}

/** Frame-rate-independent exponential approach toward `target`; never overshoots. */
function approach(current: number, target: number, dt: number, timeConstant: number): number {
  return target + (current - target) * Math.exp(-dt / timeConstant);
}
