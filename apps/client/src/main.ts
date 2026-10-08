import type RAPIER from '@dimforge/rapier3d-compat';
import { PerspectiveCamera } from 'three';
import {
  addDrawnCollider,
  createGreyboxRoom,
  createLoopbackPair,
  ECONOMY,
  eyePosition,
  FixedStepRunner,
  chalkDebitFor,
  DRAWING,
  BLUEPRINTS,
  initialPlayerState,
  quantizeInputCommand,
  quantizeSketch,
  removeDrawnCollider,
  SIMULATION_TIMESTEP,
  toDrawingResultOutcome,
  validateSketch,
  type Sketch,
} from '@chalkbound/shared';
import { CLIENT_CONFIG } from './config/client';
import { DrawnObjects } from './drawing/DrawnObjects';
import { createHeldWeapon } from './hands/heldWeapon';
import { createDrawnObjectsView } from './render/createDrawnObjects';
import { bobOffset, initialCameraFeel, updateCameraFeel } from './camera/cameraFeel';
import { FppCamera } from './camera/FppCamera';
import { createViewmodel } from './hands/createViewmodel';
import { handTransforms, initialHandRig, updateHandRig } from './hands/handRig';
import { cursorSpeed, scratchFromSpeed, approachLevel } from './audio/chalkScratch';
import { createScratchVoice } from './audio/createScratchVoice';
import { DrawMode } from './drawing/DrawMode';
import { DustField } from './drawing/DustField';
import { glowDuration, glowIntensity } from './drawing/glow';
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
import { createChalkPlane } from './render/createChalkPlane';
import { createRenderer } from './render/createRenderer';
import { createTestScene } from './render/createTestScene';
import { createChalkMeter } from './ui/chalkMeter';
import { createInteractPrompt } from './ui/interactPrompt';
import { createCodex } from './ui/codex';
import { createDrawingBanner, describeDrawingResult } from './ui/drawingBanner';
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
  // The sketch becoming a weapon in your hands is the signature moment
  // (SPEC §6.8), so the right hand follows the authority's equipped state.
  const heldWeapon = createHeldWeapon(viewmodel.rightHand);
  let handRig = initialHandRig();
  const { renderer } = createRenderer(canvas, [camera, viewmodel.camera], CLIENT_CONFIG.render);
  const scene = createTestScene(level);
  const chalkBoxes = createChalkBoxes(scene, level.chalkBoxes);
  const drawnObjectsView = createDrawnObjectsView(scene);

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
  /**
   * Player-made geometry. The ghost fills the round trip between releasing
   * the stroke and the authority's verdict; only a confirmed structure gets a
   * collider in the prediction world, so this client never predicts movement
   * against geometry the authority has not agreed to (SPEC_AUDIT R-03).
   */
  const drawn = new DrawnObjects();
  const drawnColliders = new Map<number, RAPIER.Collider>();
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
  const drawCfg = CLIENT_CONFIG.drawing;
  const settingsStore = browserSettingsStore();
  const settingsLimits = {
    mouseSensitivity: camCfg.sensitivityLimits,
    cursorSensitivity: drawCfg.cursorSensitivityLimits,
  };
  const settings = loadSettings(
    settingsStore,
    {
      mouseSensitivity: camCfg.mouseSensitivity,
      cursorSensitivity: drawCfg.cursorSensitivity,
    },
    settingsLimits,
  );
  const look = new FppCamera({
    sensitivity: settings.mouseSensitivity,
    pitchLimit: camCfg.pitchLimit,
  });
  const drawMode = new DrawMode({
    cursor: { sensitivity: settings.cursorSensitivity, halfExtent: drawCfg.halfExtent },
    recorder: drawCfg.recorder,
    fadeSeconds: drawCfg.fadeSeconds,
  });
  const chalkPlane = createChalkPlane(
    viewmodel.scene,
    { ...drawCfg.plane, halfExtent: drawCfg.halfExtent },
    DRAWING.wire.maxStrokes * DRAWING.wire.maxPointsPerStroke,
  );
  // The drawing feedback channel (D-02): scratch, dust and glow are the
  // mechanic's confirmation that a stroke registered, not decoration.
  const dust = new DustField(drawCfg.dust);
  const scratchVoice = createScratchVoice(drawCfg.scratch.voice);
  let scratchGain = 0;
  let scratchRate: number = drawCfg.scratch.minRate;
  let lastCursor = drawMode.cursor;
  /** Seconds since the last submission, or undefined when nothing is resolving. */
  let resolving: number | undefined;
  createPauseMenu(root, input, {
    settings,
    limits: settingsLimits,
    onSettingsChange(next) {
      look.setSensitivity(next.mouseSensitivity);
      drawMode.setCursorSensitivity(next.cursorSensitivity);
      saveSettings(settingsStore, next);
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
  const drawingBanner = createDrawingBanner(root, drawCfg.bannerHoldSeconds);
  let shownDrawingResults = 0;
  // Held Tab, so the shapes are glanceable mid-match (SPEC §6.4).
  const codex = createCodex(root, BLUEPRINTS, CLIENT_CONFIG.codex);
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
    // While the chalk is up the same deltas drive the cursor, and the camera
    // holds still. Pointer lock is never released either way (RD-08).
    const drawEvent = drawMode.update({
      drawHeld: input.isDown('Draw'),
      strokeHeld: input.isDown('Attack'),
      pointerLocked: input.pointerLocked,
      // Unknown until the first snapshot, and unknown must not mean "allowed":
      // raising the chalk before the authority has spoken would show a plane
      // the player may have no chalk for.
      chalk: net.chalk ?? 0,
      mouseDx: dx,
      mouseDy: dy,
      timeMs: time,
      dt: frameDelta,
    });
    if (!drawMode.active) look.applyMouseDelta(dx, dy);

    // Scratch and dust both follow how fast the chalk is actually moving.
    const speed = drawMode.active ? cursorSpeed(lastCursor, drawMode.cursor, frameDelta) : 0;
    lastCursor = drawMode.cursor;
    const touching = drawMode.active && input.isDown('Attack');
    const scratch = scratchFromSpeed(speed, touching, drawCfg.scratch);
    scratchGain = approachLevel(scratchGain, scratch.gain, frameDelta, drawCfg.scratch.smoothing);
    scratchRate = approachLevel(scratchRate, scratch.rate, frameDelta, drawCfg.scratch.smoothing);
    scratchVoice.set({ gain: scratchGain, rate: scratchRate });
    dust.update(drawMode.cursor, speed, touching, frameDelta);

    if (drawEvent?.kind === 'cancelled') {
      dust.clear();
      resolving = undefined;
    }
    if (drawEvent?.kind === 'submitted') {
      resolving = 0;
      // Validate the same quantized strokes the authority will decode, so the
      // instant feedback and the verdict that follows agree. The authority
      // decides; this only removes a round trip from seeing the answer.
      const held = net.chalk ?? 0;
      const local = validateSketch(quantizeSketch(drawEvent.sketch), { heldChalk: held });
      const hint = 'blueprintId' in local ? local.blueprintId : undefined;
      net.sendDrawing(drawEvent.sketch, hint);
      // Show what we think we drew, without making it solid.
      if (hint && local.kind === 'created') {
        drawn.predict(hint, predictor?.state.position ?? level.spawn, look.yaw);
      }
      drawingBanner.show(
        describeDrawingResult({
          outcome: toDrawingResultOutcome(local),
          chalkDebited: chalkDebitFor(local, held),
        }),
      );
    }
    if (net.drawingResult && net.drawingResultCount !== shownDrawingResults) {
      shownDrawingResults = net.drawingResultCount;
      drawingBanner.show(describeDrawingResult(net.drawingResult));
      // A verdict that built nothing leaves a ghost with nothing to become.
      if (net.drawingResult.outcome.kind !== 'created') drawn.abandonPending();
    }
    drawingBanner.update(frameDelta);
    codex.update(input.isDown('Codex'), net.chalk);

    if (predictor && net.authoritativePlayer && net.snapshotCount !== reconciledSnapshots) {
      reconciledSnapshots = net.snapshotCount;
      // Bring the collision world up to date *before* replaying predicted
      // commands against it, or the replay runs against the previous world.
      if (physics) {
        const delta = drawn.reconcile(net.drawnObjects, net.serverTick);
        for (const object of delta.added) {
          drawnColliders.set(object.id, addDrawnCollider(physics.rapier, physics.world, object));
        }
        for (const id of delta.removed) {
          const collider = drawnColliders.get(id);
          if (collider) removeDrawnCollider(physics.world, collider);
          drawnColliders.delete(id);
        }
      }
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
      drawing: drawMode.active,
    };
    feel = updateCameraFeel(feel, movement, frameDelta, feelCfg);
    handRig = updateHandRig(handRig, movement, frameDelta, CLIENT_CONFIG.hands.rig);
    heldWeapon.update(net.equipped);
    drawnObjectsView.update(drawn.solid(), drawn.ghosts());
    drawnObjectsView.advance(frameDelta);
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
    const target =
      player && !drawMode.active
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
    if (resolving !== undefined) {
      resolving += frameDelta;
      if (resolving > glowDuration(drawCfg.glow)) resolving = undefined;
    }
    chalkPlane.update({
      opacity: drawMode.planeOpacity,
      strokes: drawMode.strokes,
      cursor: drawMode.cursor,
      dust: dust.particles,
      dustCount: dust.aliveCount,
      glow: resolving === undefined ? 0 : glowIntensity(resolving, drawCfg.glow),
    });
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
      chalkbound: {
        scene,
        camera,
        renderer,
        net,
        look,
        level,
        drawMode,
        // Lets a probe ask the shared validator why a sketch failed, and
        // lets a real sketch be saved as a fixture (plan decision 4).
        drawing: {
          quantize: quantizeSketch,
          validate: (sketch: Sketch, heldChalk = ECONOMY.chalk.max) =>
            validateSketch(quantizeSketch(sketch), { heldChalk }),
        },
        predictor: () => predictor,
      },
    });
  }
}

bootstrap();
