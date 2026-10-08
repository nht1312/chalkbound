import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { ECONOMY } from '../config/economy';
import { DRAWING } from '../config/drawing';
import { FIXED_DT, SIMULATION, TICKS_PER_SNAPSHOT } from '../config/simulation';
import { CORPUS } from '../drawing/fixtures';
import type { Sketch } from '../drawing/types';
import { createLoopbackPair } from '../net/loopbackTransport';
import { decodeServerMessage, encodeClientMessage } from '../protocol/codec';
import type { ServerMessage } from '../protocol/messages';
import { ManualScheduler, seededRandom } from '../testing/ManualScheduler';
import { vec3 } from '../math/vec';
import type { LevelData } from '../world/greyboxRoom';
import { MatchSimulation } from './MatchSimulation';
import { SimulationHost } from './SimulationHost';

const TICK_MS = FIXED_DT * 1000;
/** The authority's shortest gap between one player's submissions. */
const SUBMIT_INTERVAL_TICKS = Math.ceil((DRAWING.minSubmitIntervalMs / 1000) * SIMULATION.tickRate);

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

  it('applies an interact intent and reports the new chalk and box state', () => {
    const scheduler = new ManualScheduler();
    const [client, server] = createLoopbackPair({ scheduler });
    const nearBox: LevelData = {
      ...level,
      chalkBoxes: [
        { id: 7, position: vec3(0, 1.2, -1) },
        { id: 8, position: vec3(0, 1.2, -9) },
      ],
    };
    const host = new SimulationHost(new MatchSimulation(RAPIER, nearBox));
    host.connect(server);
    const inbox: ServerMessage[] = [];
    client.onMessage((data) => inbox.push(decodeServerMessage(data)));

    client.send(encodeClientMessage({ type: 'interact', targetId: 7 }), 'reliable');
    client.send(encodeClientMessage({ type: 'interact', targetId: 8 }), 'reliable'); // too far
    scheduler.advance(0);
    for (let i = 0; i < TICKS_PER_SNAPSHOT; i++) host.step();
    scheduler.advance(0);

    const last = inbox.filter((m) => m.type === 'snapshot').at(-1);
    expect(last).toMatchObject({
      chalk: 25,
      chalkBoxes: [
        { id: 7, remaining: 0 },
        { id: 8, remaining: 25 },
      ],
    });
  });

  /** A chalk box in reach of the spawn, so a player can afford to draw. */
  function drawingSetup(lossRate: number) {
    const scheduler = new ManualScheduler();
    const [client, server] = createLoopbackPair({
      conditions: { latencyMs: 0, jitterMs: 0, lossRate },
      scheduler,
      random: seededRandom(5),
    });
    const withBox: LevelData = { ...level, chalkBoxes: [{ id: 7, position: vec3(0, 1.2, -1) }] };
    const host = new SimulationHost(new MatchSimulation(RAPIER, withBox));
    host.connect(server);
    const inbox: ServerMessage[] = [];
    client.onMessage((data) => inbox.push(decodeServerMessage(data)));

    client.send(encodeClientMessage({ type: 'interact', targetId: 7 }), 'reliable');
    scheduler.advance(0);
    return { scheduler, client, host, inbox };
  }

  const swordSketch = (): Sketch => {
    const found = CORPUS.find((f) => f.name === 'sword-clean');
    if (!found) throw new Error('No sword-clean fixture');
    return found.sketch;
  };

  it('answers a drawing submission with the authoritative result', () => {
    const { scheduler, client, inbox } = drawingSetup(0);
    client.send(encodeClientMessage({ type: 'drawing', sketch: swordSketch() }), 'reliable');
    scheduler.advance(0);

    expect(inbox.filter((m) => m.type === 'drawingResult')).toEqual([
      {
        type: 'drawingResult',
        result: {
          outcome: {
            kind: 'created',
            blueprintId: 'sword',
            accuracy: expect.any(Number),
            quality: 'keen',
          },
          chalkDebited: ECONOMY.blueprintCost.sword,
        },
      },
    ]);
  });

  it('reports the debit in the next snapshot', () => {
    const { scheduler, client, inbox, host } = drawingSetup(0);
    client.send(encodeClientMessage({ type: 'drawing', sketch: swordSketch() }), 'reliable');
    scheduler.advance(0);
    for (let i = 0; i < TICKS_PER_SNAPSHOT; i++) host.step();
    scheduler.advance(0);

    expect(inbox.filter((m) => m.type === 'snapshot').at(-1)).toMatchObject({
      chalk: ECONOMY.chalk.perBox - ECONOMY.blueprintCost.sword,
    });
  });

  it('sends the result reliably, so a lossy link still delivers it', () => {
    const { scheduler, client, inbox, host } = drawingSetup(1);
    client.send(encodeClientMessage({ type: 'drawing', sketch: swordSketch() }), 'reliable');
    scheduler.advance(0);
    for (let i = 0; i < TICKS_PER_SNAPSHOT; i++) host.step();
    scheduler.advance(0);

    expect(inbox.filter((m) => m.type === 'snapshot')).toHaveLength(0);
    expect(inbox.filter((m) => m.type === 'drawingResult')).toHaveLength(1);
  });

  it('says nothing to a player who submits with an empty meter', () => {
    const scheduler = new ManualScheduler();
    const [client, server] = createLoopbackPair({ scheduler });
    const host = new SimulationHost(new MatchSimulation(RAPIER, level));
    host.connect(server);
    const inbox: ServerMessage[] = [];
    client.onMessage((data) => inbox.push(decodeServerMessage(data)));

    client.send(encodeClientMessage({ type: 'drawing', sketch: swordSketch() }), 'reliable');
    scheduler.advance(0);
    expect(inbox.filter((m) => m.type === 'drawingResult')).toHaveLength(0);
  });

  it('drops malformed messages without throwing', () => {
    const { client, host, scheduler } = setup(0);
    client.send(new Uint8Array([255, 1, 2]), 'reliable');
    scheduler.advance(0);
    expect(host.protocolErrors).toBe(1);
  });
});

/**
 * The R-03 invariant (plan decision 3).
 *
 * `ARCHITECTURE.md` §5.5 describes a tick-indexed collider set: a client
 * replaying predicted commands includes a drawn object's collider only for
 * ticks at or after its `solidFromTick`. Under this snapshot design that
 * machinery has nothing left to do, because a snapshot describes the world at
 * `serverTick` and replay always restarts from a snapshot — so every object a
 * client knows about is *already* solid for every tick it will replay.
 *
 * That is a property of the design rather than a guarantee of the code, so it
 * is asserted here rather than built. If this ever fails, the mechanism
 * §5.5 describes is the fix, and these tests are what will say so.
 */
describe('drawn objects and the collision world (R-03)', () => {
  function drawingHost(latencyMs: number, lossRate = 0) {
    const scheduler = new ManualScheduler();
    const [client, server] = createLoopbackPair({
      conditions: { latencyMs, jitterMs: 0, lossRate },
      scheduler,
      random: seededRandom(29),
    });
    const sim = new MatchSimulation(RAPIER, {
      ...level,
      chalkBoxes: [{ id: 1, position: vec3(0, 0.05, 0), amount: ECONOMY.chalk.max }],
    });
    const host = new SimulationHost(sim);
    const id = host.connect(server);
    sim.interact(id, 1);
    const inbox: ServerMessage[] = [];
    client.onMessage((data) => inbox.push(decodeServerMessage(data)));
    const run = (ticks: number): void => {
      for (let i = 0; i < ticks; i++) {
        scheduler.advance(TICK_MS);
        host.step();
      }
    };
    return { sim, client, inbox, run, id };
  }

  const sketchNamed = (name: string): Sketch => {
    const found = CORPUS.find((f) => f.name === name);
    if (!found) throw new Error(`No fixture named ${name}`);
    return found.sketch;
  };

  /** Every snapshot the client received, in order. */
  const snapshots = (inbox: readonly ServerMessage[]) =>
    inbox.filter((m): m is Extract<ServerMessage, { type: 'snapshot' }> => m.type === 'snapshot');

  it('never sends a structure that is not yet solid at the snapshot it rides in', () => {
    const { sim, inbox, run, id } = drawingHost(150);
    run(TICKS_PER_SNAPSHOT * 2);
    sim.submitDrawing(id, sketchNamed('wall-clean'));
    run(TICKS_PER_SNAPSHOT * 6);

    const seen = snapshots(inbox);
    expect(seen.length).toBeGreaterThan(2);
    let carried = 0;
    for (const snapshot of seen) {
      for (const object of snapshot.drawnObjects) {
        carried++;
        expect(
          object.solidFromTick,
          `object ${object.id} rode a snapshot at tick ${snapshot.serverTick} before it was solid`,
        ).toBeLessThanOrEqual(snapshot.serverTick);
      }
    }
    // The invariant is worthless if nothing was ever carried.
    expect(carried).toBeGreaterThan(0);
  });

  it('holds while several structures appear at different ticks, under loss', () => {
    const { sim, inbox, run, id } = drawingHost(150, 0.1);
    for (const name of ['wall-clean', 'bridge-clean', 'wall-pristine']) {
      // Past the authority's own submission rate limit, so all three land.
      run(SUBMIT_INTERVAL_TICKS + 2);
      sim.submitDrawing(id, sketchNamed(name));
    }
    run(TICKS_PER_SNAPSHOT * 4);

    for (const snapshot of snapshots(inbox)) {
      for (const object of snapshot.drawnObjects) {
        expect(object.solidFromTick).toBeLessThanOrEqual(snapshot.serverTick);
      }
    }
    expect(sim.drawnObjects().length).toBe(3);
  });

  it('shows a structure only from the snapshot after it was drawn, never before', () => {
    const { sim, inbox, run, id } = drawingHost(0);
    run(TICKS_PER_SNAPSHOT * 2);
    sim.submitDrawing(id, sketchNamed('wall-clean'));
    const drawnAt = sim.tick;
    run(TICKS_PER_SNAPSHOT * 4);

    for (const snapshot of snapshots(inbox)) {
      const carries = snapshot.drawnObjects.length > 0;
      // Strictly after: the snapshot on the submission's own tick was already
      // on its way out before the sketch was handed in.
      expect(carries, `snapshot at ${snapshot.serverTick}`).toBe(snapshot.serverTick > drawnAt);
    }
  });

  it('keeps carrying a structure for as long as it stands', () => {
    const { sim, inbox, run, id } = drawingHost(0);
    sim.submitDrawing(id, sketchNamed('wall-clean'));
    run(TICKS_PER_SNAPSHOT * 4);
    const before = snapshots(inbox).at(-1);
    expect(before?.drawnObjects).toHaveLength(1);

    sim.removeDrawnObject(sim.drawnObjects()[0]?.id ?? -1);
    run(TICKS_PER_SNAPSHOT * 2);
    expect(snapshots(inbox).at(-1)?.drawnObjects).toHaveLength(0);
  });
});
