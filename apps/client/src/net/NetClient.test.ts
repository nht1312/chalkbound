import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  createGreyboxRoom,
  createLoopbackPair,
  ECONOMY,
  encodeServerMessage,
  initialPlayerState,
  FIXED_DT,
  MatchSimulation,
  SimulationHost,
  TICKS_PER_SNAPSHOT,
  vec3,
  type InputCommand,
  type LevelData,
  type Sketch,
} from '@chalkbound/shared';
import { CORPUS } from '@chalkbound/shared/testing/drawing';
import { ManualScheduler, seededRandom } from '@chalkbound/shared/testing';
import { NetClient } from './NetClient';

const TICK_MS = FIXED_DT * 1000;

beforeAll(async () => {
  await RAPIER.init();
});

function setup(latencyMs: number, lossRate = 0) {
  const scheduler = new ManualScheduler();
  const [clientEnd, serverEnd] = createLoopbackPair({
    conditions: { latencyMs, jitterMs: 0, lossRate },
    scheduler,
    random: seededRandom(5),
  });
  const host = new SimulationHost(new MatchSimulation(RAPIER, createGreyboxRoom()));
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

  it('exposes the authoritative player state, moved by the sent commands', () => {
    const { net, tick } = setup(20);
    expect(net.authoritativePlayer).toBeUndefined();
    for (let i = 0; i < 60; i++) tick();
    const start = createGreyboxRoom().spawn;
    expect(net.authoritativePlayer?.position.z).toBeLessThan(start.z - 1);
    expect(net.authoritativePlayer?.grounded).toBe(true);
  });

  it('still gets every command applied under 20% packet loss thanks to resends', () => {
    const { net, tick } = setup(30, 0.2);
    for (let i = 0; i < 300; i++) tick();
    // Each batch repeats the newest unacked commands, so a lost packet's commands
    // arrive with the next one and acknowledgement keeps pace with sending.
    expect(net.lastAckedSeq).toBeGreaterThan(280);
  });
});

describe('NetClient chalk and interaction', () => {
  it('sends interact intents and exposes the authoritative chalk and boxes', () => {
    const scheduler = new ManualScheduler();
    const [clientEnd, serverEnd] = createLoopbackPair({ scheduler });
    const level = createGreyboxRoom();
    const sim = new MatchSimulation(RAPIER, {
      ...level,
      chalkBoxes: [{ id: 5, position: { ...level.spawn, y: 1.2 } }],
    });
    const host = new SimulationHost(sim);
    host.connect(serverEnd);
    const net = new NetClient(clientEnd, scheduler);
    expect(net.chalk).toBeUndefined();

    net.sendInteract(5);
    for (let i = 0; i < 4; i++) {
      scheduler.advance(TICK_MS);
      host.step();
    }
    scheduler.advance(0);
    expect(net.chalk).toBe(25);
    expect(net.chalkBoxes.get(5)).toBe(0);
  });

  it('ignores a snapshot older than one already applied', () => {
    const scheduler = new ManualScheduler();
    const [clientEnd, serverEnd] = createLoopbackPair({ scheduler });
    const net = new NetClient(clientEnd, scheduler);
    const player = initialPlayerState({ x: 0, y: 0, z: 0 });
    const snapshot = (serverTick: number, chalk: number) =>
      encodeServerMessage({
        type: 'snapshot',
        serverTick,
        lastProcessedSeq: 0, // idle player: every snapshot carries the same seq
        player,
        chalk,
        chalkBoxes: [],
      });

    serverEnd.send(snapshot(20, 50), 'unreliable');
    serverEnd.send(snapshot(10, 25), 'unreliable'); // late, reordered
    scheduler.advance(0);
    expect(net.chalk).toBe(50);
    expect(net.serverTick).toBe(20);
  });
});

describe('NetClient drawing submissions', () => {
  const sketchNamed = (name: string): Sketch => {
    const found = CORPUS.find((f) => f.name === name);
    if (!found) throw new Error(`No fixture named ${name}`);
    return found.sketch;
  };

  /** A player standing on a full chalk box, with nothing else in the room. */
  function drawingSetup() {
    const scheduler = new ManualScheduler();
    const [clientEnd, serverEnd] = createLoopbackPair({ scheduler });
    const level: LevelData = {
      boxes: [
        { id: 'floor', kind: 'floor', center: vec3(0, -0.5, 0), halfExtents: vec3(50, 0.5, 50) },
      ],
      spawn: vec3(0, 0, 0),
      chalkBoxes: [{ id: 1, position: vec3(0, 1.2, -1) }],
    };
    const host = new SimulationHost(new MatchSimulation(RAPIER, level));
    host.connect(serverEnd);
    const net = new NetClient(clientEnd, scheduler);
    const settle = (): void => {
      scheduler.advance(0);
      for (let i = 0; i < TICKS_PER_SNAPSHOT; i++) host.step();
      scheduler.advance(0);
    };
    return { net, settle };
  }

  it('sends a sketch and surfaces the authoritative verdict', () => {
    const { net, settle } = drawingSetup();
    net.sendInteract(1);
    settle();
    expect(net.chalk).toBe(ECONOMY.chalk.perBox);

    net.sendDrawing(sketchNamed('sword-clean'));
    settle();
    expect(net.drawingResult?.outcome.kind).toBe('created');
    expect(net.drawingResult?.chalkDebited).toBe(ECONOMY.blueprintCost.sword);
    expect(net.chalk).toBe(ECONOMY.chalk.perBox - ECONOMY.blueprintCost.sword);
  });

  it('counts verdicts, so the UI can tell a new one from the one on screen', () => {
    const { net, settle } = drawingSetup();
    expect(net.drawingResultCount).toBe(0);
    net.sendInteract(1);
    settle();

    net.sendDrawing(sketchNamed('scribble'));
    settle();
    expect(net.drawingResultCount).toBe(1);
  });

  it('hears nothing back when the authority refuses to answer', () => {
    const { net, settle } = drawingSetup();
    // No chalk picked up: the authority ignores the submission entirely.
    net.sendDrawing(sketchNamed('sword-clean'));
    settle();
    expect(net.drawingResult).toBeUndefined();
    expect(net.drawingResultCount).toBe(0);
  });

  it('passes the hint along without letting it change the verdict', () => {
    const { net, settle } = drawingSetup();
    net.sendInteract(1);
    settle();

    net.sendDrawing(sketchNamed('scribble'), 'sword');
    settle();
    expect(net.drawingResult?.outcome.kind).toBe('unrecognized');
  });
});
