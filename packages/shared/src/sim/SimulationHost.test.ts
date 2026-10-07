import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_DT, TICKS_PER_SNAPSHOT } from '../config/simulation';
import { createLoopbackPair } from '../net/loopbackTransport';
import { decodeServerMessage, encodeClientMessage } from '../protocol/codec';
import type { ServerMessage } from '../protocol/messages';
import { ManualScheduler, seededRandom } from '../testing/ManualScheduler';
import { vec3 } from '../math/vec';
import type { LevelData } from '../world/greyboxRoom';
import { MatchSimulation } from './MatchSimulation';
import { SimulationHost } from './SimulationHost';

const TICK_MS = FIXED_DT * 1000;

const level: LevelData = {
  boxes: [{ id: 'floor', kind: 'floor', center: vec3(0, -0.5, 0), halfExtents: vec3(50, 0.5, 50) }],
  spawn: vec3(0, 0, 0),
  chalkBoxes: [],
};

beforeAll(async () => {
  await RAPIER.init();
});

function setup(latencyMs: number, lossRate = 0) {
  const scheduler = new ManualScheduler();
  const [client, server] = createLoopbackPair({
    conditions: { latencyMs, jitterMs: 0, lossRate },
    scheduler,
    random: seededRandom(11),
  });
  const host = new SimulationHost(new MatchSimulation(RAPIER, level));
  host.connect(server);
  const inbox: ServerMessage[] = [];
  client.onMessage((data) => inbox.push(decodeServerMessage(data)));

  /** Runs the authority for `ticks` ticks of simulated time. */
  const run = (ticks: number): void => {
    for (let i = 0; i < ticks; i++) {
      scheduler.advance(TICK_MS);
      host.step();
    }
  };
  return { scheduler, client, host, inbox, run };
}

describe('SimulationHost over LoopbackTransport', () => {
  it('answers a ping after one round trip of injected latency', () => {
    const { scheduler, client, inbox } = setup(40);
    client.send(encodeClientMessage({ type: 'ping', id: 1, clientTime: 0 }), 'unreliable');
    scheduler.advance(79);
    expect(inbox.filter((m) => m.type === 'pong')).toHaveLength(0);
    scheduler.advance(1);
    expect(inbox.filter((m) => m.type === 'pong')).toEqual([
      { type: 'pong', id: 1, clientTime: 0, serverTick: 0 },
    ]);
  });

  it('broadcasts snapshots at the snapshot rate', () => {
    const { run, inbox, scheduler } = setup(0);
    run(TICKS_PER_SNAPSHOT * 5);
    scheduler.advance(0);
    const ticks = inbox.filter((m) => m.type === 'snapshot').map((m) => m.serverTick);
    expect(ticks).toEqual([1, 2, 3, 4, 5].map((n) => n * TICKS_PER_SNAPSHOT));
  });

  it('acknowledges inputs in snapshots', () => {
    const { client, run, inbox } = setup(10);
    const command = { tick: 0, moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: 0 };
    client.send(
      encodeClientMessage({
        type: 'inputBatch',
        commands: [1, 2, 3].map((seq) => ({ ...command, seq })),
      }),
      'unreliable',
    );
    run(TICKS_PER_SNAPSHOT * 4);
    const last = inbox.filter((m) => m.type === 'snapshot').at(-1);
    expect(last).toMatchObject({ lastProcessedSeq: 3 });
  });

  it('sends the receiving player its authoritative state, moved by its inputs', () => {
    const { client, run, inbox } = setup(10);
    const walk = { tick: 0, moveX: 0, moveZ: 1, yaw: 0, pitch: 0, buttons: 0 };
    client.send(
      encodeClientMessage({
        type: 'inputBatch',
        commands: [1, 2, 3, 4, 5, 6, 7, 8].map((seq) => ({ ...walk, seq })),
      }),
      'unreliable',
    );
    run(TICKS_PER_SNAPSHOT * 6);
    const last = inbox.filter((m) => m.type === 'snapshot').at(-1);
    if (last?.type !== 'snapshot') throw new Error('no snapshot');
    expect(last.lastProcessedSeq).toBe(8);
    expect(last.player.position.z).toBeLessThan(0);
    expect(last.player.grounded).toBe(true);
  });

  it('drops malformed messages without throwing', () => {
    const { client, host, scheduler } = setup(0);
    client.send(new Uint8Array([255, 1, 2]), 'reliable');
    scheduler.advance(0);
    expect(host.protocolErrors).toBe(1);
  });
});
