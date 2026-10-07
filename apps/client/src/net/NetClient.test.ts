import { describe, expect, it } from 'vitest';
import {
  createLoopbackPair,
  FIXED_DT,
  MatchSimulation,
  SimulationHost,
  type InputCommand,
} from '@chalkbound/shared';
import { ManualScheduler, seededRandom } from '@chalkbound/shared/testing';
import { NetClient } from './NetClient';

const TICK_MS = FIXED_DT * 1000;

function setup(latencyMs: number, lossRate = 0) {
  const scheduler = new ManualScheduler();
  const [clientEnd, serverEnd] = createLoopbackPair({
    conditions: { latencyMs, jitterMs: 0, lossRate },
    scheduler,
    random: seededRandom(5),
  });
  const host = new SimulationHost(new MatchSimulation());
  host.connect(serverEnd);
  const net = new NetClient(clientEnd, scheduler);

  /** One 60 Hz tick on both sides: the client sends a command, the authority steps. */
  const tick = (): void => {
    const command: InputCommand = {
      seq: net.takeInputSeq(),
      tick: 0,
      moveX: 0,
      moveZ: 1,
      yaw: 0,
      pitch: 0,
      buttons: 0,
    };
    net.sendInput(command);
    net.update();
    scheduler.advance(TICK_MS);
    host.step();
  };
  return { net, tick };
}

describe('NetClient over loopback', () => {
  it('measures RTT close to twice the injected one-way latency', () => {
    const { net, tick } = setup(50);
    for (let i = 0; i < 60; i++) tick();
    expect(net.rttMs).toBeDefined();
    expect(net.rttMs).toBeGreaterThanOrEqual(100);
    expect(net.rttMs).toBeLessThan(100 + TICK_MS);
  });

  it('tracks server ticks and keeps the unacked buffer bounded by latency', () => {
    const { net, tick } = setup(50);
    for (let i = 0; i < 120; i++) tick();
    expect(net.serverTick).toBeGreaterThan(100);
    expect(net.lastAckedSeq).toBeGreaterThan(100);
    // ~100 ms RTT plus snapshot cadence ≈ 9 ticks in flight; never unbounded.
    expect(net.unackedCount).toBeLessThan(16);
  });

  it('still gets every command applied under 20% packet loss thanks to resends', () => {
    const { net, tick } = setup(30, 0.2);
    for (let i = 0; i < 300; i++) tick();
    // Each batch repeats the newest unacked commands, so a lost packet's commands
    // arrive with the next one and acknowledgement keeps pace with sending.
    expect(net.lastAckedSeq).toBeGreaterThan(280);
  });
});
