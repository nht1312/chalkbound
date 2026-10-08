import { describe, expect, it } from 'vitest';
import { DrawMode, type DrawModeConfig, type DrawModeFrame } from './DrawMode';

const config: DrawModeConfig = {
  cursor: { sensitivity: 0.001, halfExtent: 0.4 },
  recorder: { sampleRate: 100, minDistance: 0.01 },
  fadeSeconds: 0.15,
};

const FRAME_MS = 20;

/** A frame with the chalk in hand, the pointer locked and nothing pressed. */
function frame(partial: Partial<DrawModeFrame> = {}): DrawModeFrame {
  return {
    drawHeld: false,
    strokeHeld: false,
    pointerLocked: true,
    chalk: 25,
    mouseDx: 0,
    mouseDy: 0,
    timeMs: 0,
    dt: FRAME_MS / 1000,
    ...partial,
  };
}

/** Drives a sequence of frames, advancing the clock, and returns the events. */
function run(mode: DrawMode, frames: readonly Partial<DrawModeFrame>[]) {
  const events = [];
  let timeMs = 0;
  for (const partial of frames) {
    const event = mode.update(frame({ ...partial, timeMs }));
    if (event) events.push(event);
    timeMs += FRAME_MS;
  }
  return events;
}

describe('DrawMode entry', () => {
  it('stays down when the player has no chalk', () => {
    const mode = new DrawMode(config);
    run(mode, [{ drawHeld: true, chalk: 0 }]);
    expect(mode.active).toBe(false);
  });

  it('raises the chalk when the button goes down with chalk in hand', () => {
    const mode = new DrawMode(config);
    run(mode, [{ drawHeld: true }]);
    expect(mode.active).toBe(true);
  });

  it('stays down while the pointer is not locked', () => {
    const mode = new DrawMode(config);
    run(mode, [{ drawHeld: true, pointerLocked: false }]);
    expect(mode.active).toBe(false);
  });

  it('needs a fresh press: holding through a refusal does not sneak in', () => {
    const mode = new DrawMode(config);
    // Held down the whole time; the chalk only arrives on the second frame.
    run(mode, [
      { drawHeld: true, chalk: 0 },
      { drawHeld: true, chalk: 25 },
    ]);
    expect(mode.active).toBe(false);
  });

  it('raises once the player releases and presses again', () => {
    const mode = new DrawMode(config);
    run(mode, [
      { drawHeld: true, chalk: 0 },
      { drawHeld: false, chalk: 25 },
      { drawHeld: true, chalk: 25 },
    ]);
    expect(mode.active).toBe(true);
  });

  it('starts every session with the cursor in the middle of the plane', () => {
    const mode = new DrawMode(config);
    run(mode, [{ drawHeld: true }, { drawHeld: true, mouseDx: 100 }]);
    expect(mode.cursor.x).toBeCloseTo(0.1, 9);

    run(mode, [{ drawHeld: false }, { drawHeld: true }]);
    expect(mode.cursor).toEqual({ x: 0, y: 0 });
  });
});

describe('DrawMode cursor', () => {
  it('turns mouse movement into cursor movement while the chalk is up', () => {
    const mode = new DrawMode(config);
    run(mode, [{ drawHeld: true }, { drawHeld: true, mouseDx: 50, mouseDy: -50 }]);
    expect(mode.cursor.x).toBeCloseTo(0.05, 9);
    expect(mode.cursor.y).toBeCloseTo(0.05, 9);
  });

  it('ignores mouse movement while the chalk is down', () => {
    const mode = new DrawMode(config);
    run(mode, [{ mouseDx: 500, mouseDy: 500 }]);
    expect(mode.cursor).toEqual({ x: 0, y: 0 });
  });

  it('keeps the cursor on the drawable area', () => {
    const mode = new DrawMode(config);
    run(mode, [{ drawHeld: true }, { drawHeld: true, mouseDx: 100_000 }]);
    expect(mode.cursor.x).toBe(config.cursor.halfExtent);
  });
});

describe('DrawMode strokes', () => {
  it('records a stroke between press and release of the draw button', () => {
    const mode = new DrawMode(config);
    run(mode, [
      { drawHeld: true },
      { drawHeld: true, strokeHeld: true },
      { drawHeld: true, strokeHeld: true, mouseDy: -100 },
      { drawHeld: true, strokeHeld: true, mouseDy: -100 },
      { drawHeld: true, strokeHeld: false },
    ]);
    expect(mode.strokes).toHaveLength(1);
    expect(mode.strokes[0]?.points.length).toBeGreaterThanOrEqual(2);
  });

  it('shows the stroke in progress, so the player can see what they are drawing', () => {
    const mode = new DrawMode(config);
    run(mode, [
      { drawHeld: true },
      { drawHeld: true, strokeHeld: true },
      { drawHeld: true, strokeHeld: true, mouseDy: -100 },
    ]);
    expect(mode.strokes).toHaveLength(1);
  });

  it('keeps separate strokes apart', () => {
    const mode = new DrawMode(config);
    run(mode, [
      { drawHeld: true },
      { drawHeld: true, strokeHeld: true },
      { drawHeld: true, strokeHeld: true, mouseDy: -100 },
      { drawHeld: true, strokeHeld: false },
      { drawHeld: true, mouseDx: 60 },
      { drawHeld: true, strokeHeld: true },
      { drawHeld: true, strokeHeld: true, mouseDx: 50 },
      { drawHeld: true, strokeHeld: false },
    ]);
    expect(mode.strokes).toHaveLength(2);
  });
});

describe('DrawMode exit', () => {
  const drawSomething: Partial<DrawModeFrame>[] = [
    { drawHeld: true },
    { drawHeld: true, strokeHeld: true },
    { drawHeld: true, strokeHeld: true, mouseDy: -100 },
    { drawHeld: true, strokeHeld: true, mouseDy: -100 },
  ];

  it('submits the sketch when the chalk comes down', () => {
    const mode = new DrawMode(config);
    const events = run(mode, [...drawSomething, { drawHeld: false }]);
    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('submitted');
    if (events[0]?.kind !== 'submitted') throw new Error('expected a submission');
    expect(events[0].sketch.strokes).toHaveLength(1);
    expect(mode.active).toBe(false);
  });

  it('closes a stroke the player never finished', () => {
    const mode = new DrawMode(config);
    // Draw button released while the stroke button is still down.
    const events = run(mode, [...drawSomething, { drawHeld: false, strokeHeld: true }]);
    if (events[0]?.kind !== 'submitted') throw new Error('expected a submission');
    expect(events[0].sketch.strokes).toHaveLength(1);
  });

  it('costs nothing when the player raised the chalk and drew nothing', () => {
    const mode = new DrawMode(config);
    const events = run(mode, [{ drawHeld: true }, { drawHeld: true }, { drawHeld: false }]);
    expect(events).toEqual([{ kind: 'cancelled', reason: 'empty' }]);
  });

  it('cancels mid-stroke when the pointer lock goes away', () => {
    const mode = new DrawMode(config);
    const events = run(mode, [...drawSomething, { drawHeld: true, pointerLocked: false }]);
    expect(events).toEqual([{ kind: 'cancelled', reason: 'lock-lost' }]);
    expect(mode.active).toBe(false);
    expect(mode.strokes).toHaveLength(0);
  });

  it('does not resume by itself when the lock comes back', () => {
    const mode = new DrawMode(config);
    run(mode, [
      ...drawSomething,
      { drawHeld: true, pointerLocked: false },
      { drawHeld: true, pointerLocked: true },
      { drawHeld: true, pointerLocked: true },
    ]);
    expect(mode.active).toBe(false);
  });

  it('forgets the old strokes when the chalk goes up again', () => {
    const mode = new DrawMode(config);
    run(mode, [...drawSomething, { drawHeld: false }, { drawHeld: true }]);
    expect(mode.strokes).toHaveLength(0);
  });
});

describe('DrawMode plane fade', () => {
  it('starts hidden', () => {
    expect(new DrawMode(config).planeOpacity).toBe(0);
  });

  it('fades in over the configured time and stops at full', () => {
    const mode = new DrawMode(config);
    run(mode, [{ drawHeld: true }]);
    expect(mode.planeOpacity).toBeCloseTo(FRAME_MS / 1000 / config.fadeSeconds, 6);

    run(
      mode,
      Array.from({ length: 20 }, () => ({ drawHeld: true })),
    );
    expect(mode.planeOpacity).toBe(1);
  });

  it('fades back out once the chalk is down', () => {
    const mode = new DrawMode(config);
    run(
      mode,
      Array.from({ length: 20 }, () => ({ drawHeld: true })),
    );
    expect(mode.planeOpacity).toBe(1);

    run(mode, [{ drawHeld: false }]);
    expect(mode.planeOpacity).toBeLessThan(1);
    run(
      mode,
      Array.from({ length: 20 }, () => ({ drawHeld: false })),
    );
    expect(mode.planeOpacity).toBe(0);
  });
});
