import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { DRAWING } from '../config/drawing';
import { CREATION } from '../config/creation';
import { ECONOMY } from '../config/economy';
import { MOVEMENT } from '../config/movement';
import { NETWORK } from '../config/network';
import { FIXED_DT } from '../config/simulation';
import { CORPUS } from '../drawing/fixtures';
import { toDrawingResultOutcome, type DrawingResult } from '../drawing/result';
import type { Sketch } from '../drawing/types';
import { validateSketch } from '../drawing/validate';
import { quantizeSketch } from '../drawing/wire';
import { vec3 } from '../math/vec';
import type { InputCommand } from '../protocol/messages';
import type { LevelData } from '../world/greyboxRoom';
import { MatchSimulation, type DrawingSubmissionResult } from './MatchSimulation';

beforeAll(async () => {
  await RAPIER.init();
});

const TICKS_PER_SECOND = Math.round(1 / FIXED_DT);

const level: LevelData = {
  boxes: [{ id: 'floor', kind: 'floor', center: vec3(0, -0.5, 0), halfExtents: vec3(50, 0.5, 50) }],
  spawn: vec3(0, 0, 0),
  chalkBoxes: [],
};

const cmd = (seq: number, partial: Partial<InputCommand> = {}): InputCommand => ({
  seq,
  tick: seq,
  moveX: 0,
  moveZ: 0,
  yaw: 0,
  pitch: 0,
  buttons: 0,
  ...partial,
});

/** Commands seq `from`..`from + count - 1`. */
const commands = (from: number, count: number, partial: Partial<InputCommand> = {}) =>
  Array.from({ length: count }, (_, i) => cmd(from + i, partial));

function createSim(): MatchSimulation {
  return new MatchSimulation(RAPIER, level);
}

describe('MatchSimulation ticks and acknowledgement', () => {
  it('advances the tick on every step', () => {
    const sim = createSim();
    sim.step();
    sim.step();
    expect(sim.tick).toBe(2);
  });

  it('applies at most maxInputsPerTick commands per tick, in seq order', () => {
    const sim = createSim();
    sim.addPlayer(1);
    sim.submitInputs(1, [cmd(3), cmd(1), cmd(2), cmd(4), cmd(5)]);
    sim.step();
    expect(sim.lastProcessedSeq(1)).toBe(NETWORK.maxInputsPerTick);
    sim.step();
    sim.step();
    expect(sim.lastProcessedSeq(1)).toBe(5);
  });

  it('ignores resent and stale commands', () => {
    const sim = createSim();
    sim.addPlayer(1);
    sim.submitInputs(1, [cmd(1), cmd(2)]);
    sim.step();
    sim.submitInputs(1, [cmd(1), cmd(2), cmd(3)]);
    sim.step();
    sim.step();
    expect(sim.lastProcessedSeq(1)).toBe(3);
  });

  it('drops the oldest commands when the queue overflows', () => {
    const sim = createSim();
    sim.addPlayer(1);
    sim.submitInputs(1, commands(1, NETWORK.maxQueuedInputs + 10));
    sim.step();
    expect(sim.lastProcessedSeq(1)).toBe(10 + NETWORK.maxInputsPerTick);
  });

  it('ignores input for unknown players', () => {
    const sim = createSim();
    sim.submitInputs(99, [cmd(1)]);
    sim.step();
    expect(sim.lastProcessedSeq(99)).toBe(0);
    expect(sim.playerState(99)).toBeUndefined();
  });
});

describe('MatchSimulation authoritative movement', () => {
  it('spawns players at the level spawn point', () => {
    const sim = createSim();
    sim.addPlayer(1);
    const s = sim.playerState(1);
    expect(s?.position.x).toBe(level.spawn.x);
    expect(s?.position.z).toBe(level.spawn.z);
  });

  it('moves a player only by applying submitted commands', () => {
    const sim = createSim();
    sim.addPlayer(1);
    // Ticks without input do not move the player.
    for (let i = 0; i < 30; i++) sim.step();
    expect(sim.playerState(1)?.position.z).toBe(level.spawn.z);

    // One second of "walk forward" commands moves it forward (-Z at yaw 0).
    sim.submitInputs(1, commands(1, NETWORK.maxQueuedInputs, { moveZ: 1 }));
    for (let i = 0; i < TICKS_PER_SECOND; i++) sim.step();
    const z = sim.playerState(1)?.position.z ?? 0;
    expect(z).toBeLessThan(
      -MOVEMENT.walkSpeed * (NETWORK.maxQueuedInputs / TICKS_PER_SECOND) * 0.5,
    );
  });

  it('moves each player from its own commands only', () => {
    const sim = createSim();
    sim.addPlayer(1);
    sim.addPlayer(2);
    sim.submitInputs(1, commands(1, 20, { moveZ: 1 }));
    sim.submitInputs(2, commands(1, 20, { moveZ: 1, yaw: Math.PI }));
    for (let i = 0; i < 20; i++) sim.step();
    expect(sim.playerState(1)?.position.z).toBeLessThan(0);
    expect(sim.playerState(2)?.position.z).toBeGreaterThan(0);
  });

  it('does not let players sharing a spawn point push each other', () => {
    const sim = createSim();
    sim.addPlayer(1);
    sim.addPlayer(2);
    sim.submitInputs(1, commands(1, 20));
    sim.submitInputs(2, commands(1, 20));
    for (let i = 0; i < 20; i++) sim.step();
    expect(sim.playerState(1)?.position).toEqual(sim.playerState(2)?.position);
    expect(sim.playerState(1)?.position.x).toBeCloseTo(level.spawn.x, 6);
  });

  it('frees a removed player', () => {
    const sim = createSim();
    sim.addPlayer(1);
    sim.removePlayer(1);
    expect(sim.playerState(1)).toBeUndefined();
  });
});

describe('MatchSimulation chalk', () => {
  /** Boxes around a spawn at the origin: 1–4 within reach of the eyes, 9 out of reach. */
  const chalkLevel: LevelData = {
    ...level,
    chalkBoxes: [
      { id: 1, position: vec3(0, 1.2, -1) },
      { id: 2, position: vec3(1, 1.2, 0), amount: 30 },
      { id: 3, position: vec3(-1, 1.2, 0), amount: 30 },
      { id: 4, position: vec3(0, 1.2, 1), amount: 30 },
      { id: 9, position: vec3(0, 1.2, -5) },
    ],
  };
  const chalkSim = (): MatchSimulation => {
    const sim = new MatchSimulation(RAPIER, chalkLevel);
    sim.addPlayer(1);
    return sim;
  };

  it('starts every player with the starting chalk and every box full', () => {
    const sim = chalkSim();
    expect(sim.chalk(1)).toBe(ECONOMY.chalk.starting);
    expect(sim.chalkBoxRemaining(1)).toBe(ECONOMY.chalk.perBox);
    expect(sim.chalkBoxRemaining(2)).toBe(30);
  });

  it('transfers a box into the meter when the player is in range', () => {
    const sim = chalkSim();
    expect(sim.interact(1, 1)).toEqual({ outcome: 'picked-up', taken: ECONOMY.chalk.perBox });
    expect(sim.chalk(1)).toBe(ECONOMY.chalk.perBox);
    expect(sim.chalkBoxRemaining(1)).toBe(0);
  });

  it('rejects a box out of range and changes nothing', () => {
    const sim = chalkSim();
    expect(sim.interact(1, 9)).toEqual({ outcome: 'out-of-range', taken: 0 });
    expect(sim.chalk(1)).toBe(ECONOMY.chalk.starting);
    expect(sim.chalkBoxRemaining(9)).toBe(ECONOMY.chalk.perBox);
  });

  it('accepts a box that comes into range after walking to it', () => {
    const sim = chalkSim();
    sim.submitInputs(1, commands(1, 30, { moveZ: 1 })); // walk toward z = -5 for 0.5 s
    for (let i = 0; i < 30; i++) sim.step();
    expect(sim.interact(1, 9)).toEqual({ outcome: 'out-of-range', taken: 0 });
    sim.submitInputs(1, commands(31, 32, { moveZ: 1 }));
    for (let i = 0; i < 32; i++) sim.step();
    sim.submitInputs(1, commands(63, 32, { moveZ: 1 }));
    for (let i = 0; i < 32; i++) sim.step();
    expect(sim.interact(1, 9).outcome).toBe('picked-up');
  });

  it('clamps at the maximum and leaves the remainder in the box', () => {
    const sim = chalkSim();
    for (const id of [2, 3, 4]) sim.interact(1, id); // 90
    expect(sim.chalk(1)).toBe(90);
    expect(sim.interact(1, 1)).toEqual({ outcome: 'picked-up', taken: ECONOMY.chalk.max - 90 });
    expect(sim.chalk(1)).toBe(ECONOMY.chalk.max);
    expect(sim.chalkBoxRemaining(1)).toBe(ECONOMY.chalk.perBox - (ECONOMY.chalk.max - 90));
  });

  it('takes nothing when the meter is full, leaving the box untouched', () => {
    const sim = chalkSim();
    for (const id of [2, 3, 4, 1]) sim.interact(1, id);
    const remaining = sim.chalkBoxRemaining(1);
    expect(sim.interact(1, 1)).toEqual({ outcome: 'meter-full', taken: 0 });
    expect(sim.chalkBoxRemaining(1)).toBe(remaining);
  });

  it('gives nothing from an empty box', () => {
    const sim = chalkSim();
    sim.interact(1, 1);
    expect(sim.interact(1, 1)).toEqual({ outcome: 'empty', taken: 0 });
    expect(sim.chalk(1)).toBe(ECONOMY.chalk.perBox);
  });

  it('ignores unknown boxes and unknown players', () => {
    const sim = chalkSim();
    expect(sim.interact(1, 777)).toEqual({ outcome: 'unknown-target', taken: 0 });
    expect(sim.interact(42, 1)).toEqual({ outcome: 'unknown-player', taken: 0 });
    expect(sim.chalkBoxRemaining(1)).toBe(ECONOMY.chalk.perBox);
  });

  it('shares boxes between players: one player emptying a box leaves none for the other', () => {
    const sim = chalkSim();
    sim.addPlayer(2);
    sim.interact(1, 1);
    expect(sim.interact(2, 1).outcome).toBe('empty');
    expect(sim.chalk(2)).toBe(ECONOMY.chalk.starting);
  });

  it('changes chalk through interaction only: movement leaves it untouched', () => {
    const sim = chalkSim();
    sim.interact(1, 1);
    sim.submitInputs(1, commands(1, 32, { moveZ: 1, moveX: 1 }));
    for (let i = 0; i < 40; i++) sim.step();
    expect(sim.chalk(1)).toBe(ECONOMY.chalk.perBox);
  });
});

describe('MatchSimulation drawing submissions', () => {
  const sketchNamed = (name: string): Sketch => {
    const found = CORPUS.find((f) => f.name === name);
    if (!found) throw new Error(`No fixture named ${name}`);
    return found.sketch;
  };
  const SWORD_SKETCH = sketchNamed('sword-clean');
  const WALL_SKETCH = sketchNamed('wall-clean');
  const BRIDGE_SKETCH = sketchNamed('bridge-clean');
  const SMUDGE_SKETCH = sketchNamed('sword-shaky-blade');
  const SCRIBBLE_SKETCH = sketchNamed('scribble');

  const SMUDGE_COST = Math.ceil(ECONOMY.blueprintCost.sword * ECONOMY.smudgedCostFraction);
  const RATE_LIMIT_TICKS = Math.ceil((DRAWING.minSubmitIntervalMs / 1000) * TICKS_PER_SECOND);

  /** A player standing on a box holding exactly `chalk`, already picked up. */
  function drawSim(chalk: number): MatchSimulation {
    const sim = new MatchSimulation(RAPIER, {
      ...level,
      chalkBoxes: [{ id: 1, position: vec3(0, 1.2, -1), amount: Math.max(chalk, 1) }],
    });
    sim.addPlayer(1);
    if (chalk > 0) sim.interact(1, 1);
    return sim;
  }

  /** The resolved result, or a failure naming what was refused instead. */
  function resolve(submission: DrawingSubmissionResult): DrawingResult {
    if (submission.kind !== 'resolved') throw new Error(`Refused: ${submission.reason}`);
    return submission.result;
  }

  it('debits the full blueprint cost for a sword it created', () => {
    const sim = drawSim(ECONOMY.chalk.perBox);
    const result = resolve(sim.submitDrawing(1, SWORD_SKETCH));
    expect(result.outcome.kind).toBe('created');
    expect(result.chalkDebited).toBe(ECONOMY.blueprintCost.sword);
    expect(sim.chalk(1)).toBe(ECONOMY.chalk.perBox - ECONOMY.blueprintCost.sword);
  });

  it('debits a quarter of the blueprint for a smudge', () => {
    const sim = drawSim(ECONOMY.chalk.perBox);
    const result = resolve(sim.submitDrawing(1, SMUDGE_SKETCH));
    expect(result.outcome.kind).toBe('smudged');
    expect(result.chalkDebited).toBe(SMUDGE_COST);
    expect(sim.chalk(1)).toBe(ECONOMY.chalk.perBox - SMUDGE_COST);
  });

  it('debits the flat rate for a sketch it could not read', () => {
    const sim = drawSim(ECONOMY.chalk.perBox);
    const result = resolve(sim.submitDrawing(1, SCRIBBLE_SKETCH));
    expect(result.outcome.kind).toBe('unrecognized');
    expect(result.chalkDebited).toBe(ECONOMY.unrecognizedCost);
    expect(sim.chalk(1)).toBe(ECONOMY.chalk.perBox - ECONOMY.unrecognizedCost);
  });

  it('debits the flat rate for a good sword the player cannot pay for', () => {
    const held = ECONOMY.blueprintCost.sword - 1;
    const sim = drawSim(held);
    const result = resolve(sim.submitDrawing(1, SWORD_SKETCH));
    expect(result.outcome).toMatchObject({
      kind: 'unaffordable',
      required: ECONOMY.blueprintCost.sword,
      held,
    });
    expect(result.chalkDebited).toBe(ECONOMY.unaffordableCost);
    expect(sim.chalk(1)).toBe(held - ECONOMY.unaffordableCost);
  });

  /**
   * Until Phase 4 every blueprint cost the same, so a player who could afford
   * to draw could afford whatever they drew, and `unaffordable` was reachable
   * only by contriving the chalk. With three costs it is an ordinary thing to
   * walk into: the wall is the cheap option and the bridge the dear one, and
   * what the player can pay for now depends on what the sketch turns out to
   * be — which is the whole point of pricing after recognition (SPEC §6.6).
   */
  describe('one meter, three prices', () => {
    const between = ECONOMY.blueprintCost.wall + 3; // affords a wall, not a bridge

    it('builds the cheap blueprint from chalk that cannot reach the dear one', () => {
      const sim = drawSim(between);
      expect(resolve(sim.submitDrawing(1, WALL_SKETCH)).outcome.kind).toBe('created');
    });

    it('refuses the dear blueprint from the very same chalk', () => {
      const sim = drawSim(between);
      const result = resolve(sim.submitDrawing(1, BRIDGE_SKETCH));
      expect(result.outcome).toMatchObject({
        kind: 'unaffordable',
        blueprintId: 'bridge',
        required: ECONOMY.blueprintCost.bridge,
        held: between,
      });
      expect(result.chalkDebited).toBe(ECONOMY.unaffordableCost);
    });

    it('charges each blueprint its own cost when it does build', () => {
      for (const [sketch, id] of [
        [SWORD_SKETCH, 'sword'],
        [WALL_SKETCH, 'wall'],
        [BRIDGE_SKETCH, 'bridge'],
      ] as const) {
        const sim = drawSim(ECONOMY.chalk.max);
        const result = resolve(sim.submitDrawing(1, sketch));
        expect(result.outcome).toMatchObject({ kind: 'created', blueprintId: id });
        expect(result.chalkDebited).toBe(ECONOMY.blueprintCost[id]);
      }
    });
  });

  /**
   * Phase 4: a `created` outcome stops being only a debit. The authority
   * builds the object too, and where it goes depends on what it is — weapons
   * to the hands, structures to the world (SPEC §6.8, §7.4).
   */
  describe('building what was drawn', () => {
    it('builds nothing at all unless the sketch was created', () => {
      for (const sketch of [SMUDGE_SKETCH, SCRIBBLE_SKETCH]) {
        const sim = drawSim(ECONOMY.chalk.perBox);
        resolve(sim.submitDrawing(1, sketch));
        expect(sim.drawnObjects()).toEqual([]);
        expect(sim.equipped(1)).toBeUndefined();
      }
    });

    it('builds nothing from a blueprint the player cannot pay for', () => {
      const sim = drawSim(ECONOMY.blueprintCost.wall + 3);
      expect(resolve(sim.submitDrawing(1, BRIDGE_SKETCH)).outcome.kind).toBe('unaffordable');
      expect(sim.drawnObjects()).toEqual([]);
    });

    it('puts a drawn sword straight into the hands, not into the world', () => {
      const sim = drawSim(ECONOMY.chalk.perBox);
      resolve(sim.submitDrawing(1, SWORD_SKETCH));
      expect(sim.drawnObjects()).toEqual([]);
      const sword = sim.equipped(1);
      expect(sword?.blueprintId).toBe('sword');
      expect(sword?.durability).toBeGreaterThan(0);
    });

    it.each([['wall'], ['bridge']] as const)('puts a drawn %s into the world', (id) => {
      const sim = drawSim(ECONOMY.chalk.max);
      resolve(sim.submitDrawing(1, id === 'wall' ? WALL_SKETCH : BRIDGE_SKETCH));
      const [built] = sim.drawnObjects();
      expect(built?.blueprintId).toBe(id);
      expect(built?.kind).toBe('structure');
      expect(sim.equipped(1)).toBeUndefined();
    });

    it('stamps what it builds with the tick it became real (R-03)', () => {
      const sim = drawSim(ECONOMY.chalk.max);
      for (let i = 0; i < 7; i++) sim.step();
      resolve(sim.submitDrawing(1, WALL_SKETCH));
      expect(sim.drawnObjects()[0]?.solidFromTick).toBe(sim.tick);
    });

    it('gives every object its own id, so nothing can be confused for another', () => {
      const sim = drawSim(ECONOMY.chalk.max);
      const ids: number[] = [];
      for (const sketch of [WALL_SKETCH, BRIDGE_SKETCH, WALL_SKETCH]) {
        for (let i = 0; i < RATE_LIMIT_TICKS; i++) sim.step();
        const outcome = resolve(sim.submitDrawing(1, sketch)).outcome;
        if (outcome.kind === 'created') ids.push(sim.drawnObjects().at(-1)?.id ?? -1);
      }
      expect(new Set(ids).size).toBe(ids.length);
    });

    /**
     * SPEC §7.4: structures belong to the world and remain after the drawer
     * dies or extracts; weapons are carried and leave with their owner. This
     * is where the emergent play lives, so it is asserted rather than assumed.
     */
    it('leaves a structure standing after the player who drew it has gone', () => {
      const sim = drawSim(ECONOMY.chalk.max);
      resolve(sim.submitDrawing(1, WALL_SKETCH));
      sim.removePlayer(1);
      expect(sim.drawnObjects()).toHaveLength(1);
    });

    it('takes a weapon with the player who drew it', () => {
      const sim = drawSim(ECONOMY.chalk.max);
      resolve(sim.submitDrawing(1, SWORD_SKETCH));
      expect(sim.equipped(1)).toBeDefined();
      sim.removePlayer(1);
      expect(sim.equipped(1)).toBeUndefined();
    });

    /** One pair of hands, one sword (plan decision 5). */
    it('replaces a held sword with a newly drawn one', () => {
      const sim = drawSim(ECONOMY.chalk.max);
      resolve(sim.submitDrawing(1, SWORD_SKETCH));
      const first = sim.equipped(1);
      for (let i = 0; i < RATE_LIMIT_TICKS; i++) sim.step();
      resolve(sim.submitDrawing(1, SWORD_SKETCH));
      const second = sim.equipped(1);
      expect(second).toBeDefined();
      expect(second?.id).not.toBe(first?.id);
      // The replaced sword is destroyed, not dropped into the world.
      expect(sim.drawnObjects()).toEqual([]);
    });

    it('builds a structure ahead of the player, facing them', () => {
      const sim = drawSim(ECONOMY.chalk.max);
      const spawn = sim.playerState(1)?.position;
      resolve(sim.submitDrawing(1, WALL_SKETCH));
      const [wall] = sim.drawnObjects();
      if (wall?.kind !== 'structure' || !spawn) throw new Error('expected a wall');
      const away = Math.hypot(
        wall.transform.position.x - spawn.x,
        wall.transform.position.z - spawn.z,
      );
      expect(away).toBeGreaterThan(MOVEMENT.capsule.radius);
    });
  });

  /**
   * A drawn wall is only a wall if it stops people. This is the first point
   * at which player-made geometry enters the collision world, which SPEC_AUDIT
   * R-03 calls the most under-appreciated risk in the design.
   */
  describe('structures are solid', () => {
    /**
     * Walks the player forward for `ticks`, one command per tick as a real
     * client sends them. Submitting the whole run at once instead drains
     * against `maxInputsPerTick` and travels a fraction of the distance,
     * which would let a "the wall stopped me" test pass with no wall.
     */
    function walkForward(sim: MatchSimulation, ticks: number): number {
      const start = sim.playerState(1)?.position;
      for (let i = 0; i < ticks; i++) {
        sim.submitInputs(1, [cmd(i + 1, { moveZ: 1, yaw: 0 })]);
        sim.step();
      }
      const end = sim.playerState(1)?.position;
      if (!start || !end) throw new Error('no player');
      return Math.hypot(end.x - start.x, end.z - start.z);
    }

    it('lets the player walk freely when nothing has been drawn', () => {
      const sim = drawSim(ECONOMY.chalk.max);
      expect(walkForward(sim, 90)).toBeGreaterThan(2);
    });

    it('stops the player at a wall they drew in their own way', () => {
      const sim = drawSim(ECONOMY.chalk.max);
      resolve(sim.submitDrawing(1, WALL_SKETCH));
      // The wall stands gapM ahead; the player cannot reach past it.
      expect(walkForward(sim, 90)).toBeLessThan(CREATION.wall.gapM + 0.5);
    });

    it('lets them walk again once the wall is gone', () => {
      const sim = drawSim(ECONOMY.chalk.max);
      resolve(sim.submitDrawing(1, WALL_SKETCH));
      const [wall] = sim.drawnObjects();
      sim.removeDrawnObject(wall?.id ?? -1);
      expect(sim.drawnObjects()).toEqual([]);
      expect(walkForward(sim, 90)).toBeGreaterThan(2);
    });

    it('does not block the player with a bridge laid at their feet', () => {
      const sim = drawSim(ECONOMY.chalk.max);
      resolve(sim.submitDrawing(1, BRIDGE_SKETCH));
      // A deck is a floor, not a fence: walking onto it must not be walking
      // into it.
      expect(walkForward(sim, 90)).toBeGreaterThan(2);
    });

    it('forgets a structure that is removed, collider and all', () => {
      const sim = drawSim(ECONOMY.chalk.max);
      resolve(sim.submitDrawing(1, WALL_SKETCH));
      const [wall] = sim.drawnObjects();
      expect(sim.removeDrawnObject(wall?.id ?? -1)).toBe(true);
      expect(sim.removeDrawnObject(wall?.id ?? -1)).toBe(false);
    });
  });

  it('never takes more chalk than the player holds', () => {
    const sim = drawSim(2);
    const result = resolve(sim.submitDrawing(1, SCRIBBLE_SKETCH));
    expect(ECONOMY.unrecognizedCost).toBeGreaterThan(2);
    expect(result.chalkDebited).toBe(2);
    expect(sim.chalk(1)).toBe(0);
  });

  it('ignores a submission from a player holding nothing', () => {
    const sim = drawSim(0);
    expect(sim.submitDrawing(1, SWORD_SKETCH)).toEqual({ kind: 'refused', reason: 'no-chalk' });
    expect(sim.chalk(1)).toBe(0);
  });

  it('refuses a submission from a player who is not in the match', () => {
    const sim = drawSim(ECONOMY.chalk.perBox);
    expect(sim.submitDrawing(99, SWORD_SKETCH)).toEqual({
      kind: 'refused',
      reason: 'unknown-player',
    });
  });

  it('rate-limits a second submission inside the window, at no cost', () => {
    const sim = drawSim(ECONOMY.chalk.perBox);
    resolve(sim.submitDrawing(1, SCRIBBLE_SKETCH));
    const after = sim.chalk(1);
    expect(sim.submitDrawing(1, SCRIBBLE_SKETCH)).toEqual({
      kind: 'refused',
      reason: 'rate-limited',
    });
    expect(sim.chalk(1)).toBe(after);
  });

  it('accepts the next submission once the window has passed', () => {
    const sim = drawSim(ECONOMY.chalk.perBox);
    resolve(sim.submitDrawing(1, SCRIBBLE_SKETCH));
    for (let i = 0; i < RATE_LIMIT_TICKS; i++) sim.step();
    expect(resolve(sim.submitDrawing(1, SCRIBBLE_SKETCH)).outcome.kind).toBe('unrecognized');
  });

  it('does not let a refused submission push the window further out', () => {
    const sim = drawSim(ECONOMY.chalk.perBox);
    resolve(sim.submitDrawing(1, SCRIBBLE_SKETCH));
    for (let i = 0; i < RATE_LIMIT_TICKS - 1; i++) sim.step();
    expect(sim.submitDrawing(1, SCRIBBLE_SKETCH).kind).toBe('refused');
    sim.step();
    expect(sim.submitDrawing(1, SCRIBBLE_SKETCH).kind).toBe('resolved');
  });

  it('reaches the same outcome whatever the client claims it drew', () => {
    const honest = resolve(drawSim(ECONOMY.chalk.perBox).submitDrawing(1, SCRIBBLE_SKETCH));
    const lying = resolve(drawSim(ECONOMY.chalk.perBox).submitDrawing(1, SCRIBBLE_SKETCH, 'sword'));
    expect(lying).toEqual(honest);
  });

  it('still creates a sword when the client hints at nothing', () => {
    const sim = drawSim(ECONOMY.chalk.perBox);
    expect(resolve(sim.submitDrawing(1, SWORD_SKETCH)).outcome.kind).toBe('created');
  });

  it('counts a hint that disagrees with what it recognized', () => {
    const sim = drawSim(ECONOMY.chalk.perBox);
    sim.submitDrawing(1, SCRIBBLE_SKETCH, 'sword');
    expect(sim.hintDisagreements).toBe(1);
    expect(sim.lastHintDisagreement).toEqual({ hint: 'sword', recognized: undefined });
  });

  it('counts nothing when the hint agrees, or when there is no hint', () => {
    const agreeing = drawSim(ECONOMY.chalk.perBox);
    agreeing.submitDrawing(1, SWORD_SKETCH, 'sword');
    expect(agreeing.hintDisagreements).toBe(0);

    const silent = drawSim(ECONOMY.chalk.perBox);
    silent.submitDrawing(1, SCRIBBLE_SKETCH);
    expect(silent.hintDisagreements).toBe(0);
  });

  it('grades the quantized sketch, so it agrees with the client that sent it', () => {
    const sim = drawSim(ECONOMY.chalk.perBox);
    const result = resolve(sim.submitDrawing(1, SWORD_SKETCH));
    const local = validateSketch(quantizeSketch(SWORD_SKETCH), {
      heldChalk: ECONOMY.chalk.perBox,
    });
    expect(result.outcome).toEqual(toDrawingResultOutcome(local));
  });
});
