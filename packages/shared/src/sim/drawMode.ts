import { Button, type InputCommand } from '../protocol/messages';

/**
 * What raising the chalk costs you (plan T6).
 *
 * Drawing is deliberately a commitment: both hands are busy, so you stand
 * still and you cannot swing. That is the risk half of the loop — a player
 * mid-sketch is a player who cannot fight or run — and it has to be one rule
 * in one place, because the client predicts with it and the authority decides
 * with it. Two copies that disagree would show up as rubber-banding every
 * time anyone drew anything.
 */

/** Buttons the chalk hand cannot press. Crouch and Interact still work. */
const SUPPRESSED = Button.Jump | Button.Sprint | Button.Attack;

export function isDrawing(buttons: number): boolean {
  return (buttons & Button.Draw) !== 0;
}

/**
 * The command as the simulation actually reads it. Look angles pass through
 * untouched: the client freezes the camera itself while drawing, and the
 * authority has no business overriding where a player is looking.
 *
 * Returns the command unchanged when the chalk is down, so the common path
 * allocates nothing.
 */
export function applyDrawMode(command: InputCommand): InputCommand {
  if (!isDrawing(command.buttons)) return command;
  return { ...command, moveX: 0, moveZ: 0, buttons: command.buttons & ~SUPPRESSED };
}
