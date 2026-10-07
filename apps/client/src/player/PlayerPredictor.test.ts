import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  Button,
  createGreyboxRoom,
  createLoopbackPair,
  createStaticWorld,
  FIXED_DT,
  initialPlayerState,
  MatchSimulation,
  quantizeInputCommand,
  SimulationHost,
  type InputCommand,
  type PlayerState,
} from '@chalkbound/shared';
import { ManualScheduler, seededRandom } from '@chalkbound/shared/testing';
import { NetClient } from '../net/NetClient';
import { PlayerPredictor, statesMatch, type PredictionConfig } from './PlayerPredictor';

beforeAll(async () => {
  await RAPIER.init();
});

const TICK_MS = FIXED_DT * 1000;
const config: PredictionConfig = {
  positionTolerance: 0.001,
  velocityTolerance: 0.01,
  staminaTolerance: 0.01,
  correctionSmoothingSeconds: 0.1,
  snapDistance: 2,
};

/** A varied, deliberately non-round input script: walk, turn, strafe, sprint, jump, crouch. */
function scripted(i: number): Omit<InputCommand, 'seq' | 'tick'> {
  return {
    moveZ: i % 150 < 120 ? 1 : 0,
    moveX: i % 70 < 15 ? -1 : i % 70 > 60 ? 1 : 0,
    yaw: Math.sin(i * 0.0137) * 2.3,
    pitch: Math.cos(i * 0.021) * 0.4,
    buttons:
      (i % 90 === 30 ? Button.Jump : 0) |
      (i % 200 > 100 && i % 200 < 160 ? Button.Sprint : 0) |
      (i % 300 > 250 ? Button.Crouch : 0),
  };
}

/**
 * Client and authority over a loopback link, one 60 Hz tick at a time. The
 * client predicts each command locally and reconciles on every new snapshot.
 */
function setup(latencyMs: number, lossRate: number, initial?: PlayerState) {
  const level = createGreyboxRoom();
  const scheduler = new ManualScheduler();
  const [clientEnd, serverEnd] = createLoopbackPair({
    conditions: { latencyMs, jitterMs: 0, lossRate },
    scheduler,
    random: seededRandom(42),
  });
  const host = new SimulationHost(new MatchSimulation(RAPIER, level));
  host.connect(serverEnd);
  const net = new NetClient(clientEnd, scheduler);
  const predictor = new PlayerPredictor(
    RAPIER,
    createStaticWorld(RAPIER, level.boxes),
    initial ?? initialPlayerState(level.spawn),
    config,
  );

  let tickNumber = 0;
  let seenSnapshots = 0;
  const tick = (input: Omit<InputCommand, 'seq' | 'tick'>): void => {
    tickNumber++;
    const command = quantizeInputCommand({ ...input, seq: net.takeInputSeq(), tick: tickNumber });
    predictor.predict(command);
    net.sendInput(command);
    net.update();
    scheduler.advance(TICK_MS);
    host.step();
    if (net.snapshotCount !== seenSnapshots && net.authoritativePlayer) {
      seenSnapshots = net.snapshotCount;
      predictor.reconcile(net.lastAckedSeq, net.authoritativePlayer);
    }
  };
  const idle = { moveX: 0, moveZ: 0, yaw: 0, pitch: 0, buttons: 0 };
  return { net, predictor, tick, idle, level };
}

/**
 * After idling, the prediction is still ~2 RTTs of idle commands ahead of the
 * newest ack, so stamina legitimately differs; the resting position must not.
 */
function expectSamePosition(predicted: PlayerState, authoritative: PlayerState): void {
  const p = predicted.position;
  const a = authoritative.position;
  expect(Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z)).toBeLessThan(config.positionTolerance);
}

describe('PlayerPredictor over loopback (150 ms one-way, 5% loss)', () => {
  it('never corrects when the client predicts the same commands the authority applies', () => {
    const { net, predictor, tick, idle } = setup(150, 0.05);
    for (let i = 0; i < 900; i++) tick(scripted(i));
    for (let i = 0; i < 120; i++) tick(idle); // let every command be acknowledged

    expect(net.lastAckedSeq).toBeGreaterThan(1000);
    expect(predictor.corrections).toBe(0);
    expectSamePosition(predictor.state, net.authoritativePlayer!);
  });

  it('actually moved through the room, so the test exercises collisions', () => {
    const { predictor, tick, level } = setup(150, 0.05);
    for (let i = 0; i < 900; i++) tick(scripted(i));
    const p = predictor.state.position;
    expect(Math.hypot(p.x - level.spawn.x, p.z - level.spawn.z)).toBeGreaterThan(1);
  });

  it('converges after a misprediction and then stops correcting', () => {
    const level = createGreyboxRoom();
    const wrong = initialPlayerState({ ...level.spawn, x: level.spawn.x + 0.4 });
    const { net, predictor, tick, idle } = setup(150, 0.05, wrong);

    for (let i = 0; i < 300; i++) tick(scripted(i));
    const correctionsAfterConverging = predictor.corrections;
    expect(correctionsAfterConverging).toBeGreaterThanOrEqual(1);

    for (let i = 300; i < 900; i++) tick(scripted(i));
    for (let i = 0; i < 120; i++) tick(idle);
    expect(predictor.corrections).toBe(correctionsAfterConverging);
    expectSamePosition(predictor.state, net.authoritativePlayer!);
  });
});

describe('PlayerPredictor visual smoothing', () => {
  it('hides a correction behind a visual offset that decays to zero', () => {
    const level = createGreyboxRoom();
    const wrong = initialPlayerState({ ...level.spawn, x: level.spawn.x + 0.4 });
    const { predictor, tick, idle } = setup(0, 0, wrong);

    let before = predictor.renderPosition(1);
    while (predictor.corrections === 0) {
      before = predictor.renderPosition(1);
      tick(idle);
    }
    // At the instant of correction the rendered position does not jump.
    const at = predictor.renderPosition(1);
    expect(Math.abs(at.x - before.x)).toBeLessThan(0.01);

    // After the smoothing window it has settled on the corrected state.
    for (let i = 0; i < 30; i++) predictor.decayVisualOffset(FIXED_DT);
    expect(Math.abs(predictor.renderPosition(1).x - predictor.state.position.x)).toBeLessThan(
      0.001,
    );
  });

  it('snaps instead of smoothing corrections larger than the snap distance', () => {
    const level = createGreyboxRoom();
    const far = initialPlayerState({ ...level.spawn, z: level.spawn.z - 5 });
    const { predictor, tick, idle } = setup(0, 0, far);
    while (predictor.corrections === 0) tick(idle);
    expect(predictor.renderPosition(1).z).toBeCloseTo(predictor.state.position.z, 6);
  });
});

describe('statesMatch', () => {
  const base = initialPlayerState({ x: 0, y: 0, z: 0 });

  it('tolerates float32 rounding', () => {
    const rounded: PlayerState = {
      ...base,
      position: { x: Math.fround(1.23456789), y: base.position.y, z: 0 },
    };
    const exact: PlayerState = { ...base, position: { x: 1.23456789, y: base.position.y, z: 0 } };
    expect(statesMatch(rounded, exact, config)).toBe(true);
  });

  it('detects position, velocity, flag and stamina differences', () => {
    const moved = { ...base, position: { ...base.position, x: 0.01 } };
    const faster = { ...base, velocity: { x: 0.1, y: 0, z: 0 } };
    const crouched = { ...base, crouching: true };
    const tired = { ...base, stamina: { value: 50, regenDelay: 0 } };
    for (const other of [moved, faster, crouched, tired]) {
      expect(statesMatch(base, other, config)).toBe(false);
    }
  });
});
