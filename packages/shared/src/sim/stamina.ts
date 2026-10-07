import { STAMINA } from '../config/stamina';

export interface StaminaState {
  readonly value: number;
  /** Seconds until regeneration resumes; 0 means regenerating. */
  readonly regenDelay: number;
}

/** What the player spent stamina on this step. */
export interface StaminaUse {
  readonly sprinting: boolean;
  readonly jumped: boolean;
}

export const FULL_STAMINA: StaminaState = { value: STAMINA.max, regenDelay: 0 };

/** Absorbs floating-point residue when the delay counts down in fixed steps. */
const DELAY_EPSILON = 1e-9;

export function canJump(stamina: StaminaState): boolean {
  return stamina.value >= STAMINA.jumpCost;
}

/** A sprint needs the start minimum to begin, then continues until empty. */
export function canSprint(stamina: StaminaState, alreadySprinting: boolean): boolean {
  return alreadySprinting ? stamina.value > 0 : stamina.value >= STAMINA.sprintStartMinimum;
}

/** Advances stamina by one step: spend, or count down the delay, or regenerate. */
export function updateStamina(stamina: StaminaState, use: StaminaUse, dt: number): StaminaState {
  const spent =
    (use.sprinting ? STAMINA.sprintDrainPerSecond * dt : 0) + (use.jumped ? STAMINA.jumpCost : 0);
  if (spent > 0) {
    return { value: Math.max(0, stamina.value - spent), regenDelay: STAMINA.regenDelaySeconds };
  }
  if (stamina.regenDelay > 0) {
    const regenDelay = stamina.regenDelay - dt;
    return { value: stamina.value, regenDelay: regenDelay > DELAY_EPSILON ? regenDelay : 0 };
  }
  return {
    value: Math.min(STAMINA.max, stamina.value + STAMINA.regenPerSecond * dt),
    regenDelay: 0,
  };
}
