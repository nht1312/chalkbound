import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { Action } from '../input/bindings';
import { DebugMover } from './debugMover';

const config = { speed: 2, sprintMultiplier: 3 };
const holding =
  (...actions: Action[]) =>
  (action: Action): boolean =>
    actions.includes(action);

describe('DebugMover', () => {
  it('moves forward along -Z at yaw 0', () => {
    const mover = new DebugMover(config, new Vector3());
    mover.step(0.5, holding('MoveForward'), 0, 0);
    expect(mover.current.z).toBeCloseTo(-1);
    expect(mover.current.x).toBeCloseTo(0);
  });

  it('does not exceed speed when moving diagonally', () => {
    const mover = new DebugMover(config, new Vector3());
    mover.step(1, holding('MoveForward', 'MoveRight'), 0, 0);
    expect(mover.current.length()).toBeCloseTo(config.speed);
  });

  it('applies the sprint multiplier', () => {
    const mover = new DebugMover(config, new Vector3());
    mover.step(1, holding('MoveRight', 'Sprint'), 0, 0);
    expect(mover.current.x).toBeCloseTo(config.speed * config.sprintMultiplier);
  });

  it('interpolates between the previous and current step', () => {
    const mover = new DebugMover(config, new Vector3());
    mover.step(1, holding('MoveRight'), 0, 0);
    expect(mover.interpolate(0.5, new Vector3()).x).toBeCloseTo(config.speed / 2);
  });
});
