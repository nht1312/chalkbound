import { describe, expect, it } from 'vitest';
import { STAMINA } from '../config/stamina';
import { canJump, canSprint, FULL_STAMINA, updateStamina, type StaminaState } from './stamina';

const DT = 1 / 60;
const IDLE = { sprinting: false, jumped: false };
const SPRINT = { sprinting: true, jumped: false };
const JUMP = { sprinting: false, jumped: true };

function tick(state: StaminaState, use: typeof IDLE, ticks: number): StaminaState {
  let s = state;
  for (let i = 0; i < ticks; i++) s = updateStamina(s, use, DT);
  return s;
}

describe('updateStamina', () => {
  it('starts full', () => {
    expect(FULL_STAMINA.value).toBe(STAMINA.max);
  });

  it('drains at the sprint rate per second', () => {
    const s = tick(FULL_STAMINA, SPRINT, 60);
    expect(s.value).toBeCloseTo(STAMINA.max - STAMINA.sprintDrainPerSecond, 6);
  });

  it('spends the jump cost once per jump', () => {
    expect(updateStamina(FULL_STAMINA, JUMP, DT).value).toBe(STAMINA.max - STAMINA.jumpCost);
  });

  it('never goes below zero', () => {
    expect(tick(FULL_STAMINA, SPRINT, 60 * 60).value).toBe(0);
  });

  it('does not regenerate during the delay after spending', () => {
    const spent = updateStamina(FULL_STAMINA, JUMP, DT);
    const justBefore = tick(spent, IDLE, Math.round(STAMINA.regenDelaySeconds / DT) - 1);
    expect(justBefore.value).toBe(spent.value);
  });

  it('regenerates at the regen rate once the delay has passed', () => {
    const empty = tick(FULL_STAMINA, SPRINT, 60 * 60);
    const delayTicks = Math.round(STAMINA.regenDelaySeconds / DT);
    const afterDelay = tick(empty, IDLE, delayTicks);
    const oneSecondLater = tick(afterDelay, IDLE, 60);
    expect(oneSecondLater.value - afterDelay.value).toBeCloseTo(STAMINA.regenPerSecond, 6);
  });

  it('restarts the delay on every spend', () => {
    let s = updateStamina(FULL_STAMINA, JUMP, DT);
    s = tick(s, IDLE, 50);
    s = updateStamina(s, JUMP, DT); // spending again before regen resets the delay
    const value = s.value;
    expect(tick(s, IDLE, 50).value).toBe(value);
  });

  it('caps regeneration at max', () => {
    const spent = updateStamina(FULL_STAMINA, JUMP, DT);
    expect(tick(spent, IDLE, 60 * 10).value).toBe(STAMINA.max);
  });
});

describe('gating', () => {
  const at = (value: number): StaminaState => ({ value, regenDelay: 0 });

  it('jumping needs at least the jump cost', () => {
    expect(canJump(at(STAMINA.jumpCost))).toBe(true);
    expect(canJump(at(STAMINA.jumpCost - 0.01))).toBe(false);
  });

  it('starting a sprint needs the start minimum; continuing needs any stamina', () => {
    expect(canSprint(at(STAMINA.sprintStartMinimum), false)).toBe(true);
    expect(canSprint(at(STAMINA.sprintStartMinimum - 0.01), false)).toBe(false);
    expect(canSprint(at(0.01), true)).toBe(true);
    expect(canSprint(at(0), true)).toBe(false);
  });
});
