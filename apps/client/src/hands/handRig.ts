import type { Vec3 } from '@chalkbound/shared';

export type HandPoseName = 'idle' | 'walk' | 'sprint' | 'draw';

export interface HandPose {
  /** Offset from the rest position, view space (metres). */
  readonly offset: Vec3;
  /**
   * Extra offset for the right hand only. The chalk is held in one hand, so
   * the draw pose has to move one arm much further than the other.
   */
  readonly rightOffset?: Vec3;
  /** Forearm pitch, radians (negative tilts the hands down). */
  readonly pitch: number;
  /** Peak stride sway, metres. */
  readonly sway: number;
}

export interface HandRigConfig {
  /** Time constant of pose transitions, seconds. */
  readonly blendSmoothing: number;
  /** Below this horizontal speed (m/s) the hands are idle. */
  readonly minWalkSpeed: number;
  readonly breathing: { readonly amplitude: number; readonly frequency: number };
  /** Hand positions in view space with no pose applied. */
  readonly rest: { readonly left: Vec3; readonly right: Vec3 };
  readonly poses: Readonly<Record<HandPoseName, HandPose>>;
}

export interface MovementSample {
  readonly horizontalSpeed: number;
  readonly grounded: boolean;
  readonly sprinting: boolean;
  /** The chalk is up. Overrides whatever the feet are doing. */
  readonly drawing?: boolean;
}

export interface HandRigState {
  /** Blend weight per pose; always sums to 1. */
  readonly weights: Readonly<Record<HandPoseName, number>>;
  /** Seconds elapsed, for idle breathing. */
  readonly time: number;
}

export interface HandTransform extends Vec3 {
  readonly pitch: number;
}

const POSE_NAMES: readonly HandPoseName[] = ['idle', 'walk', 'sprint', 'draw'];

export function initialHandRig(): HandRigState {
  return { weights: { idle: 1, walk: 0, sprint: 0, draw: 0 }, time: 0 };
}

export function selectHandPose(movement: MovementSample, config: HandRigConfig): HandPoseName {
  // Drawing wins outright: the authority has already stopped the player, so
  // the feet cannot be telling the truth about anything else.
  if (movement.drawing === true) return 'draw';
  if (!movement.grounded) return 'idle';
  if (movement.sprinting) return 'sprint';
  return movement.horizontalSpeed > config.minWalkSpeed ? 'walk' : 'idle';
}

/** Moves the pose weights toward the pose the movement calls for. */
export function updateHandRig(
  state: HandRigState,
  movement: MovementSample,
  dt: number,
  config: HandRigConfig,
): HandRigState {
  const target = selectHandPose(movement, config);
  const keep = Math.exp(-dt / config.blendSmoothing);
  const raw = Object.fromEntries(
    POSE_NAMES.map((name) => {
      const goal = name === target ? 1 : 0;
      return [name, goal + (state.weights[name] - goal) * keep];
    }),
  ) as Record<HandPoseName, number>;
  const total = raw.idle + raw.walk + raw.sprint + raw.draw;
  return {
    weights: {
      idle: raw.idle / total,
      walk: raw.walk / total,
      sprint: raw.sprint / total,
      draw: raw.draw / total,
    },
    time: state.time + dt,
  };
}

/**
 * Both hands' view-space transforms: rest position plus the blended pose,
 * a stride sway on the same cycle as the camera bob, and slight breathing.
 */
export function handTransforms(
  state: HandRigState,
  bobPhase: number,
  config: HandRigConfig,
): { left: HandTransform; right: HandTransform } {
  let ox = 0;
  let oy = 0;
  let oz = 0;
  let pitch = 0;
  let sway = 0;
  let rx = 0;
  let ry = 0;
  let rz = 0;
  for (const name of POSE_NAMES) {
    const w = state.weights[name];
    const pose = config.poses[name];
    ox += pose.offset.x * w;
    oy += pose.offset.y * w;
    oz += pose.offset.z * w;
    pitch += pose.pitch * w;
    sway += pose.sway * w;
    const right = pose.rightOffset;
    if (right) {
      rx += right.x * w;
      ry += right.y * w;
      rz += right.z * w;
    }
  }

  const breath =
    Math.sin(2 * Math.PI * config.breathing.frequency * state.time) * config.breathing.amplitude;
  const dx = ox + Math.sin(bobPhase) * sway;
  const dy = oy - Math.abs(Math.sin(bobPhase)) * sway + breath;

  const place = (rest: Vec3, extra: Vec3): HandTransform => ({
    x: rest.x + dx + extra.x,
    y: rest.y + dy + extra.y,
    z: rest.z + oz + extra.z,
    pitch,
  });
  const none = { x: 0, y: 0, z: 0 };
  return {
    left: place(config.rest.left, none),
    right: place(config.rest.right, { x: rx, y: ry, z: rz }),
  };
}
