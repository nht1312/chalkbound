import { FIXED_DT, SIMULATION } from '../config/simulation';

export interface FixedTimestepConfig {
  readonly stepSeconds: number;
  readonly maxFrameDelta: number;
  readonly maxStepsPerFrame: number;
}

export interface FixedTimestepResult {
  /** Number of fixed simulation steps to run this frame. */
  readonly steps: number;
  /** Interpolation factor in [0, 1) between the previous and current simulation state. */
  readonly alpha: number;
  /** Leftover accumulated time to carry into the next frame. */
  readonly accumulator: number;
}

/** The project's standard fixed step, from shared config. */
export const SIMULATION_TIMESTEP: FixedTimestepConfig = {
  stepSeconds: FIXED_DT,
  maxFrameDelta: SIMULATION.maxFrameDelta,
  maxStepsPerFrame: SIMULATION.maxStepsPerFrame,
};

/**
 * Pure fixed-timestep accumulator. Given the carried-over accumulator and the
 * real frame delta, returns how many fixed steps to simulate and the render
 * interpolation factor.
 */
export function advanceFixedTimestep(
  accumulator: number,
  frameDelta: number,
  config: FixedTimestepConfig,
): FixedTimestepResult {
  const clampedDelta = Math.min(Math.max(frameDelta, 0), config.maxFrameDelta);
  let acc = accumulator + clampedDelta;
  let steps = Math.floor(acc / config.stepSeconds);

  if (steps > config.maxStepsPerFrame) {
    steps = config.maxStepsPerFrame;
    // Drop the backlog we can't catch up on rather than accumulating it forever.
    acc = 0;
  } else {
    acc -= steps * config.stepSeconds;
  }

  return { steps, alpha: acc / config.stepSeconds, accumulator: acc };
}

/** Stateful wrapper: feed it real elapsed time, it calls `step` a whole number of times. */
export class FixedStepRunner {
  private accumulator = 0;

  constructor(
    private readonly config: FixedTimestepConfig,
    private readonly step: () => void,
  ) {}

  /** Advances by `frameDelta` seconds and returns the render interpolation alpha. */
  advance(frameDelta: number): number {
    const result = advanceFixedTimestep(this.accumulator, frameDelta, this.config);
    this.accumulator = result.accumulator;
    for (let i = 0; i < result.steps; i++) this.step();
    return result.alpha;
  }
}
