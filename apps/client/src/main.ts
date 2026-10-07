import { PerspectiveCamera, Vector3 } from 'three';
import {
  createGreyboxRoom,
  createLoopbackPair,
  FIXED_DT,
  FixedStepRunner,
  SIMULATION_TIMESTEP,
} from '@chalkbound/shared';
import { CLIENT_CONFIG } from './config/client';
import { FppCamera } from './camera/FppCamera';
import { createDebugReadout } from './debug/debugReadout';
import { DebugMover } from './debug/debugMover';
import { createStatsOverlay } from './debug/statsOverlay';
import { DEFAULT_BINDINGS } from './input/bindings';
import { buildInputCommand } from './input/commandBuilder';
import { InputState } from './input/InputState';
import { browserScheduler } from './net/browserScheduler';
import { linkConditionsFromUrl } from './net/linkConditionsFromUrl';
import { startLocalAuthority } from './net/localAuthority';
import { NetClient } from './net/NetClient';
import { loadPhysics, loadRapier, type ClientPhysics } from './physics/loadPhysics';
import { createRenderer } from './render/createRenderer';
import { createTestScene } from './render/createTestScene';
import { createClickToPlay } from './ui/clickToPlay';
import './style.css';

function bootstrap(): void {
  const root = document.getElementById('app');
  const canvas = document.getElementById('game-canvas');
  if (!root || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Missing #app or #game-canvas in index.html');
  }

  const level = createGreyboxRoom();
  const { camera: camCfg } = CLIENT_CONFIG;
  const camera = new PerspectiveCamera(camCfg.fovDegrees, 1, camCfg.near, camCfg.far);
  const { renderer } = createRenderer(canvas, camera, CLIENT_CONFIG.render);
  const scene = createTestScene(level);

  // Authority behind a loopback link (ARCHITECTURE D-01); Phase 8 swaps in a socket.
  const link = linkConditionsFromUrl(window.location.search);
  const [clientEnd, serverEnd] = createLoopbackPair({
    conditions: link,
    scheduler: browserScheduler,
  });
  const net = new NetClient(clientEnd, browserScheduler);
  // The authority needs physics too; until it starts, sent inputs are simply lost.
  loadRapier().then(
    (rapier) => startLocalAuthority(serverEnd, rapier, level),
    (error: unknown) => console.error('Local authority failed to start', error),
  );

  let physics: ClientPhysics | undefined;
  loadPhysics(level).then(
    (loaded) => (physics = loaded),
    (error: unknown) => console.error('Physics failed to load', error),
  );

  const input = new InputState(canvas, DEFAULT_BINDINGS);
  const look = new FppCamera({
    sensitivity: camCfg.mouseSensitivity,
    pitchLimit: camCfg.pitchLimit,
  });
  const spawn = new Vector3(level.spawn.x, level.spawn.y + camCfg.eyeHeight, level.spawn.z);
  const mover = new DebugMover(CLIENT_CONFIG.debugMover, spawn);
  createClickToPlay(root, input);

  const stats = createStatsOverlay(
    root,
    CLIENT_CONFIG.stats.refreshInterval,
    createDebugReadout({
      renderer,
      net,
      link,
      cameraPosition: camera.position,
      physics: () => physics,
    }),
  );

  const isDown = input.isDown.bind(input);
  let clientTick = 0;
  const simulation = new FixedStepRunner(SIMULATION_TIMESTEP, () => {
    clientTick++;
    net.sendInput(buildInputCommand(isDown, net.takeInputSeq(), clientTick, look.yaw, look.pitch));
    mover.step(FIXED_DT, isDown, look.yaw, look.pitch);
  });

  let lastTime: number | undefined;
  renderer.setAnimationLoop((time) => {
    const frameDelta = lastTime === undefined ? 0 : (time - lastTime) / 1000;
    lastTime = time;

    // Look is applied per rendered frame for responsiveness; movement runs on the fixed tick.
    const { dx, dy } = input.consumeMouseDelta();
    look.applyMouseDelta(dx, dy);

    const alpha = simulation.advance(frameDelta);
    net.update();

    mover.interpolate(alpha, camera.position);
    look.applyTo(camera);
    renderer.render(scene, camera);
    stats.update(frameDelta);
  });

  // Exposed only in dev builds for console inspection.
  if (import.meta.env.DEV) {
    Object.assign(window, { chalkbound: { scene, camera, renderer, net } });
  }
}

bootstrap();
