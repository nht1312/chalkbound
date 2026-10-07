import { PerspectiveCamera } from 'three';
import {
  createGreyboxRoom,
  createLoopbackPair,
  FixedStepRunner,
  initialPlayerState,
  quantizeInputCommand,
  SIMULATION_TIMESTEP,
} from '@chalkbound/shared';
import { CLIENT_CONFIG } from './config/client';
import { FppCamera } from './camera/FppCamera';
import { createDebugReadout } from './debug/debugReadout';
import { createStatsOverlay } from './debug/statsOverlay';
import { DEFAULT_BINDINGS } from './input/bindings';
import { buildInputCommand } from './input/commandBuilder';
import { InputState } from './input/InputState';
import { browserScheduler } from './net/browserScheduler';
import { linkConditionsFromUrl } from './net/linkConditionsFromUrl';
import { startLocalAuthority } from './net/localAuthority';
import { NetClient } from './net/NetClient';
import { loadPhysics, loadRapier, type ClientPhysics } from './physics/loadPhysics';
import { PlayerPredictor } from './player/PlayerPredictor';
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

  // Prediction needs the client's own physics world; start from the authority's
  // state if a snapshot has already arrived.
  let physics: ClientPhysics | undefined;
  let predictor: PlayerPredictor | undefined;
  loadPhysics(level).then(
    (loaded) => {
      physics = loaded;
      predictor = new PlayerPredictor(
        loaded.rapier,
        loaded.world,
        net.authoritativePlayer ?? initialPlayerState(level.spawn),
        CLIENT_CONFIG.prediction,
      );
    },
    (error: unknown) => console.error('Physics failed to load', error),
  );

  const input = new InputState(canvas, DEFAULT_BINDINGS);
  const look = new FppCamera({
    sensitivity: camCfg.mouseSensitivity,
    pitchLimit: camCfg.pitchLimit,
  });
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
      predictor: () => predictor,
    }),
  );

  const isDown = input.isDown.bind(input);
  let clientTick = 0;
  let reconciledSnapshots = 0;
  const simulation = new FixedStepRunner(SIMULATION_TIMESTEP, () => {
    clientTick++;
    // Quantize once: predict with exactly the command the authority will decode.
    const command = quantizeInputCommand(
      buildInputCommand(isDown, net.takeInputSeq(), clientTick, look.yaw, look.pitch),
    );
    predictor?.predict(command);
    net.sendInput(command);
  });

  let lastTime: number | undefined;
  renderer.setAnimationLoop((time) => {
    const frameDelta = lastTime === undefined ? 0 : (time - lastTime) / 1000;
    lastTime = time;

    // Look is applied per rendered frame for responsiveness; movement runs on the fixed tick.
    const { dx, dy } = input.consumeMouseDelta();
    look.applyMouseDelta(dx, dy);

    if (predictor && net.authoritativePlayer && net.snapshotCount !== reconciledSnapshots) {
      reconciledSnapshots = net.snapshotCount;
      predictor.reconcile(net.lastAckedSeq, net.authoritativePlayer);
    }
    const alpha = simulation.advance(frameDelta);
    net.update();

    const feet = predictor?.renderPosition(alpha) ?? level.spawn;
    const crouching = predictor?.state.crouching ?? false;
    camera.position.set(
      feet.x,
      feet.y + (crouching ? camCfg.crouchEyeHeight : camCfg.eyeHeight),
      feet.z,
    );
    predictor?.decayVisualOffset(frameDelta);
    look.applyTo(camera);
    renderer.render(scene, camera);
    stats.update(frameDelta);
  });

  // Exposed only in dev builds for console inspection.
  if (import.meta.env.DEV) {
    Object.assign(window, {
      chalkbound: { scene, camera, renderer, net, predictor: () => predictor },
    });
  }
}

bootstrap();
