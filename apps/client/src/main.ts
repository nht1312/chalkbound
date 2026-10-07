import { PerspectiveCamera } from 'three';
import {
  createGreyboxRoom,
  createLoopbackPair,
  ECONOMY,
  eyePosition,
  FixedStepRunner,
  initialPlayerState,
  quantizeInputCommand,
  SIMULATION_TIMESTEP,
} from '@chalkbound/shared';
import { CLIENT_CONFIG } from './config/client';
import { bobOffset, initialCameraFeel, updateCameraFeel } from './camera/cameraFeel';
import { FppCamera } from './camera/FppCamera';
import { createViewmodel } from './hands/createViewmodel';
import { handTransforms, initialHandRig, updateHandRig } from './hands/handRig';
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
import { lookDirection, selectInteractTarget } from './interaction/targeting';
import { createChalkBoxes } from './render/createChalkBoxes';
import { createRenderer } from './render/createRenderer';
import { createTestScene } from './render/createTestScene';
import { createChalkMeter } from './ui/chalkMeter';
import { createInteractPrompt } from './ui/interactPrompt';
import { createPauseMenu } from './ui/pauseMenu';
import { browserSettingsStore, loadSettings, saveSettings } from './ui/settings';
import './style.css';

function bootstrap(): void {
  const root = document.getElementById('app');
  const canvas = document.getElementById('game-canvas');
  if (!root || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Missing #app or #game-canvas in index.html');
  }

  const level = createGreyboxRoom();
  const { camera: camCfg } = CLIENT_CONFIG;
  const feelCfg = CLIENT_CONFIG.feel;
  const camera = new PerspectiveCamera(feelCfg.baseFov, 1, camCfg.near, camCfg.far);
  let feel = initialCameraFeel(feelCfg);
  const viewmodel = createViewmodel(CLIENT_CONFIG.hands.lens, CLIENT_CONFIG.hands.arm);
  let handRig = initialHandRig();
  const { renderer } = createRenderer(canvas, [camera, viewmodel.camera], CLIENT_CONFIG.render);
  const scene = createTestScene(level);
  const chalkBoxes = createChalkBoxes(scene, level.chalkBoxes);

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
  const settingsStore = browserSettingsStore();
  const settings = loadSettings(
    settingsStore,
    { mouseSensitivity: camCfg.mouseSensitivity },
    camCfg.sensitivityLimits,
  );
  const look = new FppCamera({
    sensitivity: settings.mouseSensitivity,
    pitchLimit: camCfg.pitchLimit,
  });
  createPauseMenu(root, input, {
    sensitivity: settings.mouseSensitivity,
    limits: camCfg.sensitivityLimits,
    onSensitivityChange(mouseSensitivity) {
      look.setSensitivity(mouseSensitivity);
      saveSettings(settingsStore, { mouseSensitivity });
    },
  });

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

  const chalkMeter = createChalkMeter(root, ECONOMY.chalk.max);
  const prompt = createInteractPrompt(root);
  let interactWasDown = false;

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
    const player = predictor?.state;
    const movement = {
      horizontalSpeed: player ? Math.hypot(player.velocity.x, player.velocity.z) : 0,
      grounded: player?.grounded ?? true,
      crouching: player?.crouching ?? false,
      sprinting: player?.sprinting ?? false,
    };
    feel = updateCameraFeel(feel, movement, frameDelta, feelCfg);
    handRig = updateHandRig(handRig, movement, frameDelta, CLIENT_CONFIG.hands.rig);
    viewmodel.apply(handTransforms(handRig, feel.bobPhase, CLIENT_CONFIG.hands.rig));
    const bob = bobOffset(feel, feelCfg);
    // Sway along the camera's right axis (yaw only).
    camera.position.set(
      feet.x + Math.cos(look.yaw) * bob.x,
      feet.y + feel.eyeHeight + bob.y,
      feet.z - Math.sin(look.yaw) * bob.x,
    );
    if (camera.fov !== feel.fov) {
      camera.fov = feel.fov;
      camera.updateProjectionMatrix();
    }
    predictor?.decayVisualOffset(frameDelta);
    look.applyTo(camera);

    // Chalk: everything shown comes from the newest snapshot; E only sends an intent.
    chalkBoxes.update(net.chalkBoxes);
    chalkMeter.update(net.chalk);
    const target = player
      ? selectInteractTarget(
          eyePosition(player),
          lookDirection(look.yaw, look.pitch),
          level.chalkBoxes.map((b) => ({ ...b, remaining: net.chalkBoxes.get(b.id) })),
          CLIENT_CONFIG.targeting,
        )
      : undefined;
    chalkBoxes.setTargeted(target);
    const meterFull = net.chalk === ECONOMY.chalk.max;
    prompt.show(target === undefined ? undefined : meterFull ? 'Chalk full' : 'E  Pick up chalk');
    const interactDown = input.isDown('Interact');
    if (interactDown && !interactWasDown && target !== undefined && !meterFull) {
      net.sendInteract(target);
    }
    interactWasDown = interactDown;
    // World, then hands over a cleared depth buffer so they never clip into walls.
    renderer.info.reset();
    renderer.clear();
    renderer.render(scene, camera);
    renderer.clearDepth();
    renderer.render(viewmodel.scene, viewmodel.camera);
    stats.update(frameDelta);
  });

  // Exposed only in dev builds for console inspection.
  if (import.meta.env.DEV) {
    Object.assign(window, {
      chalkbound: { scene, camera, renderer, net, look, level, predictor: () => predictor },
    });
  }
}

bootstrap();
