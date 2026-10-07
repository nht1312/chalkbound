import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { ECONOMY } from '../config/economy';
import { MOVEMENT } from '../config/movement';
import { NETWORK } from '../config/network';
import { FIXED_DT } from '../config/simulation';
import { vec3 } from '../math/vec';
import type { InputCommand } from '../protocol/messages';
import type { LevelData } from '../world/greyboxRoom';
import { MatchSimulation } from './MatchSimulation';

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
