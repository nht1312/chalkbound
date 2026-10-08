import RAPIER from '@dimforge/rapier3d-compat';
import {
  ECONOMY,
  MatchSimulation,
  vec3,
  type LevelData,
  type Point2,
  type Sketch,
} from '@chalkbound/shared';
import { scribbleWaypoints, swordWaypoints } from '@chalkbound/shared/testing/drawing';
import { beforeAll, describe, expect, it } from 'vitest';
import { CLIENT_CONFIG } from '../config/client';
import { DrawMode, type DrawModeConfig, type DrawModeEvent } from './DrawMode';

/**
 * Phase 3 exit check (plan T10): the whole client drawing path, driven at
 * 60 Hz with mouse deltas, submitted to a real authority.
 *
 * This is the loop the phase exists to prove — raise the chalk, draw, get a
 * verdict, pay for it — with nothing stubbed between the mouse and the
 * debit except the browser itself. It covers vertical-slice criteria 3, 5
 * and 9; criterion 2 (pointer lock) needs a real browser and lives in
 * `tools/probe/drawing.mjs`.
 */

beforeAll(async () => {
  await RAPIER.init();
});

const drawCfg = CLIENT_CONFIG.drawing;
const config: DrawModeConfig = {
  cursor: { sensitivity: drawCfg.cursorSensitivity, halfExtent: drawCfg.halfExtent },
  recorder: drawCfg.recorder,
  fadeSeconds: drawCfg.fadeSeconds,
};

const FPS = 60;
const FRAME_MS = 1000 / FPS;
const DT = 1 / FPS;

const level: LevelData = {
  boxes: [{ id: 'floor', kind: 'floor', center: vec3(0, -0.5, 0), halfExtents: vec3(50, 0.5, 50) }],
  spawn: vec3(0, 0, 0),
  chalkBoxes: [{ id: 1, position: vec3(0, 1.2, -1) }],
};

/**
 * A hand on the mouse. Drives `DrawMode` one 60 Hz frame at a time and
 * converts target plane positions into the pixel deltas that would reach
 * them, which is exactly what the real frame loop feeds it.
 */
class Hand {
  readonly mode = new DrawMode(config);
  private timeMs = 0;
  private event: DrawModeEvent | undefined;

  private frame(partial: {
    drawHeld: boolean;
    strokeHeld?: boolean;
    dx?: number;
    dy?: number;
  }): void {
    const result = this.mode.update({
      drawHeld: partial.drawHeld,
      strokeHeld: partial.strokeHeld ?? false,
      pointerLocked: true,
      chalk: 25,
      mouseDx: partial.dx ?? 0,
      mouseDy: partial.dy ?? 0,
      timeMs: this.timeMs,
      dt: DT,
    });
    if (result) this.event = result;
    this.timeMs += FRAME_MS;
  }

  raise(): this {
    this.frame({ drawHeld: true });
    return this;
  }

  /** Glides the cursor to `target` over `frames`, with the chalk up or down. */
  glide(target: Point2, frames: number, strokeHeld: boolean): this {
    const from = this.mode.cursor;
    const stepX = (target.x - from.x) / frames / config.cursor.sensitivity;
    // Plane +y is up, mouse dy counts down.
    const stepY = -(target.y - from.y) / frames / config.cursor.sensitivity;
    for (let i = 0; i < frames; i++) {
      this.frame({ drawHeld: true, strokeHeld, dx: stepX, dy: stepY });
    }
    return this;
  }

  /** One stroke: press at the first waypoint, trace the rest, lift. */
  stroke(waypoints: readonly Point2[], framesPerLeg = 12): this {
    const [first, ...rest] = waypoints;
    if (!first) throw new Error('a stroke needs a waypoint');
    this.glide(first, 6, false);
    this.frame({ drawHeld: true, strokeHeld: true });
    for (const point of rest) this.glide(point, framesPerLeg, true);
    this.frame({ drawHeld: true, strokeHeld: false });
    return this;
  }

  /** Releases the draw button and returns whatever the mode reported. */
  lower(): DrawModeEvent | undefined {
    this.event = undefined;
    this.frame({ drawHeld: false });
    return this.event;
  }
}

/** Draws the given strokes as a player would and returns the submitted sketch. */
function draw(strokes: readonly (readonly Point2[])[], framesPerLeg = 12): Sketch {
  const hand = new Hand().raise();
  for (const stroke of strokes) hand.stroke(stroke, framesPerLeg);
  const event = hand.lower();
  if (event?.kind !== 'submitted') throw new Error(`expected a submission, got ${event?.kind}`);
  return event.sketch;
}

/** A player standing on a full chalk box, with it already picked up. */
function authority(): MatchSimulation {
  const sim = new MatchSimulation(RAPIER, level);
  sim.addPlayer(1);
  sim.interact(1, 1);
  return sim;
}

/** Submits a sketch and returns the authority's verdict. */
function submit(sim: MatchSimulation, sketch: Sketch) {
  const result = sim.submitDrawing(1, sketch);
  if (result.kind !== 'resolved') throw new Error(`refused: ${result.reason}`);
  return result.result;
}

describe('Phase 3 exit: drawing a sword end to end', () => {
  it('creates a sword and takes its chalk', () => {
    const sim = authority();
    const verdict = submit(sim, draw(swordWaypoints()));

    expect(verdict.outcome.kind).toBe('created');
    if (verdict.outcome.kind !== 'created') throw new Error('expected a creation');
    expect(verdict.outcome.blueprintId).toBe('sword');
    expect(verdict.chalkDebited).toBe(ECONOMY.blueprintCost.sword);
    expect(sim.chalk(1)).toBe(ECONOMY.chalk.perBox - ECONOMY.blueprintCost.sword);
  });

  it('agrees with the client about what was drawn, so the hint never disagrees', () => {
    const sim = authority();
    sim.submitDrawing(1, draw(swordWaypoints()), 'sword');
    expect(sim.hintDisagreements).toBe(0);
  });

  it('creates a sword drawn small, large, or off-centre', () => {
    for (const shape of [{ length: 0.25 }, { length: 0.6 }, { centre: { x: 0.08, y: -0.05 } }]) {
      const verdict = submit(authority(), draw(swordWaypoints(shape)));
      expect(verdict.outcome.kind, JSON.stringify(shape)).toBe('created');
    }
  });
});

describe('Phase 3 exit: criterion 5 — refusing rather than guessing', () => {
  const nonSwords: readonly [string, readonly (readonly Point2[])[]][] = [
    [
      'single stroke',
      [
        [
          { x: 0, y: 0.25 },
          { x: 0, y: -0.25 },
        ],
      ],
    ],
    ['scribble', [scribbleWaypoints(5, 10, 0.06)]],
    ['second scribble', [scribbleWaypoints(21, 12, 0.05)]],
    [
      'parallel lines',
      [
        [
          { x: -0.08, y: 0.22 },
          { x: -0.08, y: -0.22 },
        ],
        [
          { x: 0.08, y: 0.22 },
          { x: 0.08, y: -0.22 },
        ],
      ],
    ],
    [
      'an X',
      [
        [
          { x: -0.2, y: 0.2 },
          { x: 0.2, y: -0.2 },
        ],
        [
          { x: -0.2, y: -0.2 },
          { x: 0.2, y: 0.2 },
        ],
      ],
    ],
    [
      'a box',
      [
        [
          { x: -0.15, y: 0.2 },
          { x: 0.15, y: 0.2 },
          { x: 0.15, y: -0.2 },
          { x: -0.15, y: -0.2 },
          { x: -0.15, y: 0.2 },
        ],
      ],
    ],
  ];

  it.each(nonSwords)('refuses %s rather than guessing a blueprint', (_name, strokes) => {
    const verdict = submit(authority(), draw(strokes));
    // Never a creation: a wrong guess costs the player the fight (R-11).
    expect(verdict.outcome.kind).not.toBe('created');
    expect(['unrecognized', 'smudged']).toContain(verdict.outcome.kind);
  });

  it('charges the flat rate for something it could not read', () => {
    const verdict = submit(authority(), draw([scribbleWaypoints(5, 10, 0.06)]));
    expect(verdict.outcome.kind).toBe('unrecognized');
    expect(verdict.chalkDebited).toBe(ECONOMY.unrecognizedCost);
  });
});

describe('Phase 3 exit: criterion 3 — stroke capture at 60 FPS', () => {
  it('keeps a sample for every frame of a moving stroke', () => {
    const hand = new Hand().raise();
    const frames = 24;
    hand.stroke(
      [
        { x: 0, y: 0.25 },
        { x: 0, y: -0.25 },
      ],
      frames,
    );
    const stroke = hand.mode.strokes[0];
    // One at the press plus one per frame of travel: nothing dropped.
    expect(stroke?.points.length).toBe(frames + 1);
  });

  it('samples evenly, so the timing the validator reads is regular', () => {
    const hand = new Hand().raise();
    hand.stroke(
      [
        { x: 0, y: 0.25 },
        { x: 0, y: -0.25 },
      ],
      24,
    );
    const points = hand.mode.strokes[0]?.points ?? [];
    const gaps = points.slice(1).map((p, i) => p.t - (points[i]?.t ?? 0));
    expect(Math.min(...gaps)).toBeGreaterThan(0);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
  });

  it('tracks the cursor exactly, so there is nothing to lag behind', () => {
    const hand = new Hand().raise();
    hand.glide({ x: 0.2, y: -0.15 }, 20, false);
    expect(hand.mode.cursor.x).toBeCloseTo(0.2, 6);
    expect(hand.mode.cursor.y).toBeCloseTo(-0.15, 6);
  });
});

describe('Phase 3 exit: the loop costs what it should', () => {
  it('runs sword then scribble, leaving the meter empty', () => {
    const sim = authority();
    expect(sim.chalk(1)).toBe(25);

    submit(sim, draw(swordWaypoints()));
    expect(sim.chalk(1)).toBe(5);

    // Past the rate limit, so the second submission is accepted.
    for (let i = 0; i < 40; i++) sim.step();
    const second = submit(sim, draw([scribbleWaypoints(5, 10, 0.06)]));
    expect(second.outcome.kind).toBe('unrecognized');
    expect(sim.chalk(1)).toBe(0);
  });

  it('stops answering once the meter is empty', () => {
    const sim = authority();
    submit(sim, draw(swordWaypoints()));
    for (let i = 0; i < 40; i++) sim.step();
    submit(sim, draw([scribbleWaypoints(5, 10, 0.06)]));
    for (let i = 0; i < 40; i++) sim.step();

    expect(sim.chalk(1)).toBe(0);
    expect(sim.submitDrawing(1, draw(swordWaypoints()))).toEqual({
      kind: 'refused',
      reason: 'no-chalk',
    });
  });
});
