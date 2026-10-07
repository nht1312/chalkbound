import { Button, type InputCommand } from '@chalkbound/shared';
import type { Action } from './bindings';

const BUTTON_ACTIONS: readonly [Action, number][] = [
  ['Jump', Button.Jump],
  ['Sprint', Button.Sprint],
  ['Crouch', Button.Crouch],
  ['Attack', Button.Attack],
  ['Interact', Button.Interact],
  ['Draw', Button.Draw],
];

/**
 * Samples held actions and look angles into one tick of intent. Raw mouse
 * deltas are never sent — only the resulting angles (CLAUDE.md §15).
 */
export function buildInputCommand(
  isDown: (action: Action) => boolean,
  seq: number,
  tick: number,
  yaw: number,
  pitch: number,
): InputCommand {
  const axis = (positive: Action, negative: Action): number =>
    (isDown(positive) ? 1 : 0) - (isDown(negative) ? 1 : 0);

  let buttons = 0;
  for (const [action, bit] of BUTTON_ACTIONS) {
    if (isDown(action)) buttons |= bit;
  }

  return {
    seq,
    tick,
    moveX: axis('MoveRight', 'MoveLeft'),
    moveZ: axis('MoveForward', 'MoveBackward'),
    yaw,
    pitch,
    buttons,
  };
}
