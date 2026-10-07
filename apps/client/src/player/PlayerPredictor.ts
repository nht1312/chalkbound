import {
  createPlayerBody,
  FIXED_DT,
  stepPlayer,
  type InputCommand,
  type PhysicsWorld,
  type PlayerBody,
  type PlayerState,
  type Rapier,
  type Vec3,
} from '@chalkbound/shared';

export interface PredictionConfig {
  /** Position difference (m) beyond which a prediction counts as wrong. */
  readonly positionTolerance: number;
  /** Velocity difference (m/s) beyond which a prediction counts as wrong. */
  readonly velocityTolerance: number;
  /** Stamina difference beyond which a prediction counts as wrong. */
  readonly staminaTolerance: number;
  /** Time over which a correction's visual offset fades out, in seconds. */
  readonly correctionSmoothingSeconds: number;
  /** Corrections larger than this (m) snap instead of smoothing. */
  readonly snapDistance: number;
}

interface PredictedStep {
  readonly seq: number;
  readonly command: InputCommand;
  /** Predicted state after applying `command`. Rewritten on replay. */
  state: PlayerState;
}

/** Visual offset below this length (m) is cleared. */
const OFFSET_EPSILON = 1e-4;

/**
 * Client-side prediction for the local player (ARCHITECTURE §4.4). Runs the
 * shared `stepPlayer()` on the client's own physics world, records the
 * predicted state per command, and on each authoritative snapshot either
 * confirms the prediction or rewinds to the server state and replays the
 * unacknowledged commands. Corrections are hidden behind a decaying visual
 * offset so the camera never jumps.
 */
export class PlayerPredictor {
  /** Predicted state after the newest command. */
  state: PlayerState;
  /** Predicted state one step earlier, for render interpolation. */
  private previous: PlayerState;
  /** Number of mispredictions corrected so far. */
  corrections = 0;

  private readonly body: PlayerBody;
  private readonly history: PredictedStep[] = [];
  private lastReconciledSeq = 0;
  private offset = { x: 0, y: 0, z: 0 };

  constructor(
    rapier: Rapier,
    private readonly world: PhysicsWorld,
    initial: PlayerState,
    private readonly config: PredictionConfig,
  ) {
    this.body = createPlayerBody(rapier, world);
    this.state = initial;
    this.previous = initial;
  }

  /** Commands predicted but not yet confirmed by the authority. */
  get pendingCount(): number {
    return this.history.length;
  }

  /** Applies one (already quantized) command locally. */
  predict(command: InputCommand): void {
    this.previous = this.state;
    this.state = stepPlayer(this.state, command, this.body, this.world, FIXED_DT);
    this.history.push({ seq: command.seq, command, state: this.state });
  }

  /** Checks the prediction for `ackSeq` against the authority and corrects if needed. */
  reconcile(ackSeq: number, authoritative: PlayerState): void {
    if (ackSeq <= this.lastReconciledSeq) return;
    this.lastReconciledSeq = ackSeq;

    let predictedAtAck: PlayerState | undefined;
    while (this.history.length > 0 && (this.history[0]?.seq ?? Infinity) <= ackSeq) {
      const step = this.history.shift();
      if (step?.seq === ackSeq) predictedAtAck = step.state;
    }
    if (predictedAtAck && statesMatch(predictedAtAck, authoritative, this.config)) return;

    // Misprediction (or no record of that seq): rewind to the authority and replay.
    let replayed = authoritative;
    for (const step of this.history) {
      replayed = stepPlayer(replayed, step.command, this.body, this.world, FIXED_DT);
      step.state = replayed;
    }

    const shift = subtract(replayed.position, this.state.position);
    this.corrections++;
    this.state = replayed;
    // Move the interpolation start by the same amount so the lerp does not jump...
    this.previous = { ...this.previous, position: add(this.previous.position, shift) };
    // ...and absorb the jump into the visual offset, unless it is too large to hide.
    if (Math.hypot(shift.x, shift.y, shift.z) > this.config.snapDistance) {
      this.offset = { x: 0, y: 0, z: 0 };
    } else {
      this.offset = subtract(this.offset, shift);
    }
  }

  /** Fades the visual offset; call once per rendered frame. */
  decayVisualOffset(frameDelta: number): void {
    // Exponential decay reaching ~5% of the offset after the smoothing window.
    const factor = Math.exp((-3 * frameDelta) / this.config.correctionSmoothingSeconds);
    this.offset = {
      x: this.offset.x * factor,
      y: this.offset.y * factor,
      z: this.offset.z * factor,
    };
    if (Math.hypot(this.offset.x, this.offset.y, this.offset.z) < OFFSET_EPSILON) {
      this.offset = { x: 0, y: 0, z: 0 };
    }
  }

  /** Feet position to render: interpolated between steps, plus the visual offset. */
  renderPosition(alpha: number): Vec3 {
    const a = this.previous.position;
    const b = this.state.position;
    return {
      x: a.x + (b.x - a.x) * alpha + this.offset.x,
      y: a.y + (b.y - a.y) * alpha + this.offset.y,
      z: a.z + (b.z - a.z) * alpha + this.offset.z,
    };
  }
}

/** True when two player states agree closely enough that no correction is needed. */
export function statesMatch(a: PlayerState, b: PlayerState, config: PredictionConfig): boolean {
  return (
    distance(a.position, b.position) <= config.positionTolerance &&
    distance(a.velocity, b.velocity) <= config.velocityTolerance &&
    Math.abs(a.stamina.value - b.stamina.value) <= config.staminaTolerance &&
    a.grounded === b.grounded &&
    a.crouching === b.crouching &&
    a.jumpHeld === b.jumpHeld &&
    a.sprinting === b.sprinting
  );
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
