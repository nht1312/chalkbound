import { describe, expect, it } from 'vitest';
import { Button, type InputCommand } from '../protocol/messages';
import { applyDrawMode, isDrawing } from './drawMode';

const cmd = (partial: Partial<InputCommand> = {}): InputCommand => ({
  seq: 0,
  tick: 0,
  moveX: 0,
  moveZ: 0,
  yaw: 0,
  pitch: 0,
  buttons: 0,
  ...partial,
});

describe('isDrawing', () => {
  it('reads the Draw bit', () => {
    expect(isDrawing(Button.Draw)).toBe(true);
    expect(isDrawing(Button.Draw | Button.Sprint)).toBe(true);
    expect(isDrawing(Button.Sprint)).toBe(false);
    expect(isDrawing(0)).toBe(false);
  });
});

describe('applyDrawMode', () => {
  it('leaves a command alone when the chalk is down', () => {
    const command = cmd({ moveX: 1, moveZ: 1, buttons: Button.Sprint | Button.Jump });
    expect(applyDrawMode(command)).toBe(command);
  });

  it('stops the player moving while the chalk is up', () => {
    const drawn = applyDrawMode(cmd({ moveX: 1, moveZ: -1, buttons: Button.Draw }));
    expect(drawn.moveX).toBe(0);
    expect(drawn.moveZ).toBe(0);
  });

  it('suppresses sprint, jump and attack while the chalk is up', () => {
    const drawn = applyDrawMode(
      cmd({ buttons: Button.Draw | Button.Sprint | Button.Jump | Button.Attack }),
    );
    expect(drawn.buttons & Button.Sprint).toBe(0);
    expect(drawn.buttons & Button.Jump).toBe(0);
    expect(drawn.buttons & Button.Attack).toBe(0);
  });

  it('keeps crouch, interact and the Draw bit itself', () => {
    const drawn = applyDrawMode(cmd({ buttons: Button.Draw | Button.Crouch | Button.Interact }));
    expect(drawn.buttons & Button.Crouch).not.toBe(0);
    expect(drawn.buttons & Button.Interact).not.toBe(0);
    expect(drawn.buttons & Button.Draw).not.toBe(0);
  });

  it('leaves the look angles and bookkeeping untouched', () => {
    const command = cmd({ seq: 7, tick: 9, yaw: 1.2, pitch: -0.4, buttons: Button.Draw });
    const drawn = applyDrawMode(command);
    expect(drawn.seq).toBe(7);
    expect(drawn.tick).toBe(9);
    expect(drawn.yaw).toBe(1.2);
    expect(drawn.pitch).toBe(-0.4);
  });
});
