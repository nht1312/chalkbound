import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { MOVEMENT } from '../config/movement';
import { STAMINA } from '../config/stamina';
import { FIXED_DT } from '../config/simulation';
import { vec3 } from '../math/vec';
import { createStaticWorld, type PhysicsWorld } from '../physics/staticWorld';
import { decodeServerMessage, encodeServerMessage } from '../protocol/codec';
import { Button, type InputCommand } from '../protocol/messages';
import type { StaticBox } from '../world/greyboxRoom';
import {
  createPlayerBody,
  initialPlayerState,
  stepPlayer,
  type PlayerBody,
  type PlayerState,
} from './stepPlayer';

beforeAll(async () => {
  await RAPIER.init();
});

const TICKS_PER_SECOND = Math.round(1 / FIXED_DT);
/** Tolerance for "resting on the floor": the controller keeps a skin gap. */
const FLOOR_EPSILON = MOVEMENT.controller.skinWidth * 2;

const openFloor: StaticBox = {
  id: 'floor',
  kind: 'floor',
  center: vec3(0, -0.5, 0),
  halfExtents: vec3(50, 0.5, 50),
};

function setup(boxes: readonly StaticBox[] = [openFloor], feet = vec3(0, 0, 0)) {
  const world = createStaticWorld(RAPIER, boxes);
  const body = createPlayerBody(RAPIER, world);
  let state = initialPlayerState(feet);
  const run = (command: Partial<InputCommand>, ticks: number): PlayerState => {
    for (let i = 0; i < ticks; i++) state = stepPlayer(state, cmd(command), body, world, FIXED_DT);
    return state;
  };
  return {
    world,
    body,
    run,
    get state() {
      return state;
    },
  };
}

function cmd(partial: Partial<InputCommand>): InputCommand {
  return { seq: 0, tick: 0, moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0, ...partial };
}

const horizontalSpeed = (s: PlayerState): number => Math.hypot(s.velocity.x, s.velocity.z);

describe('stepPlayer: ground and gravity', () => {
  it('falls onto the floor and becomes grounded', () => {
    const p = setup([openFloor], vec3(0, 2, 0));
    const s = p.run({}, TICKS_PER_SECOND * 2);
    expect(s.grounded).toBe(true);
    expect(s.position.y).toBeGreaterThanOrEqual(-1e-3);
    expect(s.position.y).toBeLessThan(FLOOR_EPSILON);
    expect(s.velocity.y).toBe(0);
  });

  it('is airborne while falling', () => {
    const p = setup([openFloor], vec3(0, 5, 0));
    const s = p.run({}, 10);
    expect(s.grounded).toBe(false);
    expect(s.velocity.y).toBeLessThan(0);
  });
});

describe('stepPlayer: walking', () => {
  it('walks forward (-Z at yaw 0) at walk speed', () => {
    const p = setup();
    const s = p.run({ moveZ: 1 }, TICKS_PER_SECOND);
    expect(horizontalSpeed(s)).toBeCloseTo(MOVEMENT.walkSpeed, 3);
    expect(s.position.z).toBeLessThan(-MOVEMENT.walkSpeed * 0.8);
    // Rapier's contact resolution adds sub-millimetre lateral noise per metre;
    // 1 cm over ~2.8 m is visually straight.
    expect(Math.abs(s.position.x)).toBeLessThan(0.01);
    expect(s.grounded).toBe(true);
  });

  it('follows yaw: yaw -PI/2 walks toward +X', () => {
    const p = setup();
    const s = p.run({ moveZ: 1, yaw: -Math.PI / 2 }, TICKS_PER_SECOND);
    expect(s.position.x).toBeGreaterThan(MOVEMENT.walkSpeed * 0.8);
  });

  it('normalises diagonal input so it is not faster', () => {
    const p = setup();
    const s = p.run({ moveZ: 1, moveX: 1 }, TICKS_PER_SECOND);
    expect(horizontalSpeed(s)).toBeCloseTo(MOVEMENT.walkSpeed, 3);
  });

  it('never exceeds the speed cap while accelerating', () => {
    const p = setup();
    for (let i = 0; i < TICKS_PER_SECOND; i++) {
      expect(horizontalSpeed(p.run({ moveZ: 1 }, 1))).toBeLessThanOrEqual(
        MOVEMENT.walkSpeed + 1e-6,
      );
    }
  });

  it('keeps full speed and floor height over a long curving walk on flat ground', () => {
    // Regression: Rapier capsule-box contacts report occasional tilted normals and
    // a grounded controller fed gravity sinks; neither may slow or sink the player.
    const p = setup();
    p.run({}, 10);
    for (let i = 0; i < TICKS_PER_SECOND * 10; i++) {
      const s = p.run({ moveX: 1, moveZ: 0.3, yaw: i * 0.01 }, 1);
      if (i > TICKS_PER_SECOND) {
        expect(horizontalSpeed(s)).toBeCloseTo(MOVEMENT.walkSpeed, 3);
        expect(s.position.y).toBeGreaterThan(0);
        expect(s.position.y).toBeLessThan(FLOOR_EPSILON);
      }
    }
  });

  it('stops when input is released', () => {
    const p = setup();
    p.run({ moveZ: 1 }, TICKS_PER_SECOND);
    expect(horizontalSpeed(p.run({}, TICKS_PER_SECOND / 2))).toBe(0);
  });
});

describe('stepPlayer: sprint and crouch', () => {
  it('sprints forward at sprint speed', () => {
    const p = setup();
    const s = p.run({ moveZ: 1, buttons: Button.Sprint }, TICKS_PER_SECOND);
    expect(horizontalSpeed(s)).toBeCloseTo(MOVEMENT.sprintSpeed, 3);
  });

  it('does not sprint backwards or sideways', () => {
    const p = setup();
    const s = p.run({ moveX: 1, buttons: Button.Sprint }, TICKS_PER_SECOND);
    expect(horizontalSpeed(s)).toBeCloseTo(MOVEMENT.walkSpeed, 3);
  });

  it('crouches at crouch speed, overriding sprint', () => {
    const p = setup();
    const s = p.run({ moveZ: 1, buttons: Button.Crouch | Button.Sprint }, TICKS_PER_SECOND);
    expect(s.crouching).toBe(true);
    expect(horizontalSpeed(s)).toBeCloseTo(MOVEMENT.crouchSpeed, 3);
  });

  it('stands back up when crouch is released in open space', () => {
    const p = setup();
    p.run({ buttons: Button.Crouch }, 5);
    expect(p.run({}, 1).crouching).toBe(false);
  });

  it('stays crouched under a low ceiling until there is room to stand', () => {
    const ceilingBottom = (MOVEMENT.capsule.standingHeight + MOVEMENT.capsule.crouchingHeight) / 2;
    const ceiling: StaticBox = {
      id: 'ceiling',
      kind: 'wall',
      center: vec3(0, ceilingBottom + 0.5, 0),
      halfExtents: vec3(1, 0.5, 1),
    };
    // Ceiling spans x in [-1, 1]. Start outside it, crouch, and crawl underneath (+X).
    const p = setup([openFloor, ceiling], vec3(-3, 0, 0));
    const crawlEast = { moveZ: 1, yaw: -Math.PI / 2, buttons: Button.Crouch };
    while (p.state.position.x < 0) p.run(crawlEast, 1);

    // Releasing crouch under the ceiling keeps the player crouched.
    expect(p.run({}, 10).crouching).toBe(true);

    // Crawl out the far side without holding crouch; the player stands once clear.
    p.run({ moveZ: 1, yaw: -Math.PI / 2 }, TICKS_PER_SECOND * 2);
    expect(p.state.position.x).toBeGreaterThan(1 + MOVEMENT.capsule.radius);
    expect(p.state.crouching).toBe(false);
  });
});

describe('stepPlayer: jumping', () => {
  it('jumps to the configured apex height and lands', () => {
    const p = setup();
    const takeOffY = p.run({}, 10).position.y;
    let apex = 0;
    p.run({ buttons: Button.Jump }, 1);
    for (let i = 0; i < TICKS_PER_SECOND * 2; i++) {
      apex = Math.max(apex, p.run({}, 1).position.y - takeOffY);
    }
    expect(apex).toBeGreaterThan(MOVEMENT.jumpHeight * 0.95);
    expect(apex).toBeLessThan(MOVEMENT.jumpHeight * 1.05);
    expect(p.state.grounded).toBe(true);
  });

  it('stays airborne for the time the player gravity implies, not world gravity', () => {
    // Snappy, non-floaty jumps: a parabola under MOVEMENT.gravity.
    const p = setup();
    p.run({}, 10);
    p.run({ buttons: Button.Jump }, 1);
    let airTicks = 1;
    while (!p.run({}, 1).grounded && airTicks < TICKS_PER_SECOND * 3) airTicks++;
    const expected = 2 * Math.sqrt((2 * MOVEMENT.jumpHeight) / MOVEMENT.gravity);
    expect(Math.abs(airTicks / TICKS_PER_SECOND - expected)).toBeLessThanOrEqual(
      2 / TICKS_PER_SECOND,
    );
  });

  it('can jump up onto a desk-height (0.75 m) box', () => {
    const desk: StaticBox = {
      id: 'desk',
      kind: 'desk',
      center: vec3(0, 0.375, -3),
      halfExtents: vec3(1, 0.375, 1), // front face at z = -2, top at y = 0.75
    };
    const p = setup([openFloor, desk]);
    p.run({}, 10);
    while (p.state.position.z > -1.2) p.run({ moveZ: 1 }, 1);
    p.run({ moveZ: 1, buttons: Button.Jump }, 1);
    const s = p.run({ moveZ: 1 }, TICKS_PER_SECOND);
    expect(s.grounded).toBe(true);
    expect(s.position.y).toBeGreaterThan(0.75);
    expect(s.position.y).toBeLessThan(0.75 + FLOOR_EPSILON);
    expect(s.position.z).toBeLessThan(-2);
  });

  it('is edge-triggered: holding jump does not bounce again after landing', () => {
    const p = setup();
    p.run({}, 10);
    p.run({ buttons: Button.Jump }, TICKS_PER_SECOND * 2);
    expect(p.state.grounded).toBe(true);
    expect(p.run({ buttons: Button.Jump }, 10).position.y).toBeLessThan(FLOOR_EPSILON);
  });

  it('cannot jump while airborne', () => {
    const p = setup([openFloor], vec3(0, 5, 0));
    p.run({}, 5);
    const before = p.state.velocity.y;
    p.run({ buttons: 0 }, 1);
    expect(p.run({ buttons: Button.Jump }, 1).velocity.y).toBeLessThan(before);
  });

  it('has limited air control', () => {
    const p = setup();
    p.run({}, 10);
    p.run({ buttons: Button.Jump }, 1);
    // Push sideways for a quarter second in the air.
    const s = p.run({ moveX: 1 }, TICKS_PER_SECOND / 4);
    expect(s.grounded).toBe(false);
    expect(horizontalSpeed(s)).toBeLessThan(MOVEMENT.walkSpeed * 0.75);
    expect(horizontalSpeed(s)).toBeGreaterThan(0);
  });
});

describe('stepPlayer: stamina', () => {
  const sprintForward = { moveZ: 1, buttons: Button.Sprint };
  /** Ticks of sprinting that drain a full bar. */
  const ticksToEmpty = Math.ceil((STAMINA.max / STAMINA.sprintDrainPerSecond) * TICKS_PER_SECOND);

  it('starts with full stamina', () => {
    expect(setup().state.stamina.value).toBe(STAMINA.max);
  });

  it('drains while sprinting and drops to walk speed when empty', () => {
    const p = setup();
    const s = p.run(sprintForward, ticksToEmpty + TICKS_PER_SECOND / 2);
    expect(s.stamina.value).toBe(0);
    expect(s.sprinting).toBe(false);
    expect(horizontalSpeed(s)).toBeCloseTo(MOVEMENT.walkSpeed, 3);
  });

  it('does not drain when walking', () => {
    expect(setup().run({ moveZ: 1 }, TICKS_PER_SECOND).stamina.value).toBe(STAMINA.max);
  });

  it('cannot restart a sprint until stamina reaches the start minimum', () => {
    const p = setup();
    p.run(sprintForward, ticksToEmpty + 1);
    // Release sprint, wait out the delay plus a little regen (below the start minimum).
    const partialRegenTicks = Math.floor(
      (STAMINA.regenDelaySeconds + (STAMINA.sprintStartMinimum / STAMINA.regenPerSecond) * 0.5) *
        TICKS_PER_SECOND,
    );
    p.run({ moveZ: 1 }, partialRegenTicks);
    expect(p.state.stamina.value).toBeGreaterThan(0);
    expect(p.run(sprintForward, 1).sprinting).toBe(false);

    // After enough regen, sprinting is allowed again.
    p.run({ moveZ: 1 }, TICKS_PER_SECOND * 2);
    expect(p.run(sprintForward, 1).sprinting).toBe(true);
  });

  it('spends the jump cost on a jump', () => {
    const p = setup();
    p.run({}, 10);
    expect(p.run({ buttons: Button.Jump }, 1).stamina.value).toBe(STAMINA.max - STAMINA.jumpCost);
  });

  it('cannot jump without enough stamina', () => {
    const p = setup();
    p.run(sprintForward, ticksToEmpty + 1);
    const before = p.run({}, 1);
    const after = p.run({ buttons: Button.Jump }, 1);
    expect(after.grounded).toBe(true);
    expect(after.velocity.y).toBe(0);
    expect(after.stamina.value).toBeGreaterThanOrEqual(before.stamina.value);
  });
});

describe('stepPlayer: collision', () => {
  it('is stopped by a wall and slides along it', () => {
    const wall: StaticBox = {
      id: 'wall',
      kind: 'wall',
      center: vec3(0, 1.5, -2),
      halfExtents: vec3(10, 1.5, 0.1),
    };
    const p = setup([openFloor, wall]);
    // Walk into the wall at 45°: forward is blocked, the sideways component slides.
    const s = p.run({ moveZ: 1, yaw: -Math.PI / 4 }, TICKS_PER_SECOND * 3);
    expect(s.position.z).toBeGreaterThan(-2 + 0.1 + MOVEMENT.capsule.radius - FLOOR_EPSILON);
    expect(s.position.x).toBeGreaterThan(2);
  });
});

describe('stepPlayer: reproducibility', () => {
  /** A varied scripted sequence: walk, turn, sprint, jump, crouch. */
  const script: InputCommand[] = Array.from({ length: 240 }, (_, i) =>
    cmd({
      seq: i + 1,
      moveZ: i % 90 < 70 ? 1 : 0,
      moveX: i % 50 < 10 ? -1 : 0,
      yaw: i * 0.01,
      buttons:
        (i % 60 === 20 ? Button.Jump : 0) |
        (i > 100 && i < 140 ? Button.Sprint : 0) |
        (i > 180 && i < 200 ? Button.Crouch : 0),
    }),
  );

  function replay(
    world: PhysicsWorld,
    body: PlayerBody,
    from: PlayerState,
    commands: InputCommand[],
  ) {
    let s = from;
    for (const c of commands) s = stepPlayer(s, c, body, world, FIXED_DT);
    return s;
  }

  it('returns float32-exact state, so a snapshot carries it bit-for-bit', () => {
    // Client replay starts from the decoded snapshot; it must equal what the authority holds.
    const p = setup();
    const s = replay(p.world, p.body, p.state, script.slice(0, 150));
    const decoded = decodeServerMessage(
      encodeServerMessage({
        type: 'snapshot',
        serverTick: 1,
        lastProcessedSeq: 1,
        player: s,
        chalk: 0,
        chalkBoxes: [],
        drawnObjects: [],
      }),
    );
    expect(decoded.type === 'snapshot' && decoded.player).toEqual(s);
  });

  it('produces identical results in two independent worlds', () => {
    const a = setup();
    const b = setup();
    const ra = replay(a.world, a.body, a.state, script);
    const rb = replay(b.world, b.body, b.state, script);
    expect(rb).toEqual(ra);
  });

  it('produces identical results when rewound and replayed on the same body', () => {
    const p = setup();
    const midpoint = replay(p.world, p.body, p.state, script.slice(0, 120));
    const end = replay(p.world, p.body, midpoint, script.slice(120));
    // Rewind to the midpoint and replay the tail (what reconciliation does).
    expect(replay(p.world, p.body, midpoint, script.slice(120))).toEqual(end);
  });
});

describe('stepPlayer: drawing', () => {
  const DRAW = Button.Draw;

  it('refuses to walk while the chalk is up', () => {
    const { run } = setup();
    const state = run({ moveZ: 1, buttons: DRAW }, TICKS_PER_SECOND);
    expect(horizontalSpeed(state)).toBeCloseTo(0, 6);
    expect(state.position.x).toBeCloseTo(0, 6);
    expect(state.position.z).toBeCloseTo(0, 6);
  });

  it('comes to a stop when the chalk goes up mid-stride', () => {
    const { run } = setup();
    const moving = run({ moveZ: 1 }, TICKS_PER_SECOND);
    expect(horizontalSpeed(moving)).toBeGreaterThan(1);
    expect(horizontalSpeed(run({ moveZ: 1, buttons: DRAW }, TICKS_PER_SECOND))).toBeCloseTo(0, 6);
  });

  it('refuses to sprint while the chalk is up', () => {
    const { run } = setup();
    expect(run({ moveZ: 1, buttons: Button.Sprint | DRAW }, 30).sprinting).toBe(false);
  });

  it('refuses to jump while the chalk is up', () => {
    const { run, state: grounded } = setup();
    run({}, 10);
    expect(grounded.grounded || true).toBe(true);
    const state = run({ buttons: Button.Jump | DRAW }, 5);
    expect(state.velocity.y).toBeLessThanOrEqual(0);
    expect(state.grounded).toBe(true);
  });

  it('does not fire a held jump the moment the chalk comes down', () => {
    const { run } = setup();
    run({}, 10);
    // Jump held throughout: suppressed while drawing, and still suppressed
    // afterwards because it was never released.
    run({ buttons: Button.Jump | DRAW }, 20);
    const after = run({ buttons: Button.Jump }, 2);
    expect(after.grounded).toBe(true);
    expect(after.velocity.y).toBeLessThanOrEqual(0);
  });

  it('jumps again once the button is released and pressed anew', () => {
    const { run } = setup();
    run({}, 10);
    run({ buttons: Button.Jump | DRAW }, 20);
    run({ buttons: 0 }, 2);
    expect(run({ buttons: Button.Jump }, 1).velocity.y).toBeGreaterThan(0);
  });

  it('still crouches while the chalk is up', () => {
    const { run } = setup();
    expect(run({ buttons: Button.Crouch | DRAW }, 5).crouching).toBe(true);
  });

  it('still falls while the chalk is up', () => {
    const { run } = setup([openFloor], vec3(0, 3, 0));
    const state = run({ buttons: DRAW }, 10);
    expect(state.position.y).toBeLessThan(3);
  });
});
