import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
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
