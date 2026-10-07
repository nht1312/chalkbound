import { describe, expect, it } from 'vitest';
import { NETWORK } from '../config/network';
import type { InputCommand } from '../protocol/messages';
import { MatchSimulation } from './MatchSimulation';

const cmd = (seq: number): InputCommand => ({
  seq,
  tick: seq,
  moveX: 0,
  moveZ: 0,
  yaw: 0,
  pitch: 0,
  buttons: 0,
});

describe('MatchSimulation', () => {
  it('advances the tick on every step', () => {
    const sim = new MatchSimulation();
    sim.step();
    sim.step();
    expect(sim.tick).toBe(2);
  });

  it('applies at most maxInputsPerTick commands per tick, in seq order', () => {
    const sim = new MatchSimulation();
    sim.addPlayer(1);
    sim.submitInputs(1, [cmd(3), cmd(1), cmd(2), cmd(4), cmd(5)]);
    sim.step();
    expect(sim.lastProcessedSeq(1)).toBe(NETWORK.maxInputsPerTick);
    sim.step();
    sim.step();
    expect(sim.lastProcessedSeq(1)).toBe(5);
  });

  it('ignores resent and stale commands', () => {
    const sim = new MatchSimulation();
    sim.addPlayer(1);
    sim.submitInputs(1, [cmd(1), cmd(2)]);
    sim.step();
    sim.submitInputs(1, [cmd(1), cmd(2), cmd(3)]);
    sim.step();
    sim.step();
    expect(sim.lastProcessedSeq(1)).toBe(3);
  });

  it('drops the oldest commands when the queue overflows', () => {
    const sim = new MatchSimulation();
    sim.addPlayer(1);
    const flood = Array.from({ length: NETWORK.maxQueuedInputs + 10 }, (_, i) => cmd(i + 1));
    sim.submitInputs(1, flood);
    sim.step();
    expect(sim.lastProcessedSeq(1)).toBe(10 + NETWORK.maxInputsPerTick);
  });

  it('ignores input for unknown players', () => {
    const sim = new MatchSimulation();
    sim.submitInputs(99, [cmd(1)]);
    sim.step();
    expect(sim.lastProcessedSeq(99)).toBe(0);
  });
});
