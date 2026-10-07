import { describe, expect, it } from 'vitest';
import { Button } from '@chalkbound/shared';
import type { Action } from './bindings';
import { buildInputCommand } from './commandBuilder';

const holding =
  (...actions: Action[]) =>
  (action: Action): boolean =>
    actions.includes(action);

describe('buildInputCommand', () => {
  it('maps movement keys to axes', () => {
    const c = buildInputCommand(holding('MoveForward', 'MoveLeft'), 1, 10, 0, 0);
    expect(c.moveZ).toBe(1);
    expect(c.moveX).toBe(-1);
  });

  it('cancels opposing keys', () => {
    const c = buildInputCommand(holding('MoveForward', 'MoveBackward'), 1, 10, 0, 0);
    expect(c.moveZ).toBe(0);
  });

  it('packs held buttons into the bitfield and passes look angles through', () => {
    const c = buildInputCommand(holding('Sprint', 'Draw'), 7, 42, 1.5, -0.25);
    expect(c.buttons).toBe(Button.Sprint | Button.Draw);
    expect(c).toMatchObject({ seq: 7, tick: 42, yaw: 1.5, pitch: -0.25 });
  });
});
