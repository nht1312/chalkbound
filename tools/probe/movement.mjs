#!/usr/bin/env node
// Phase 1 exit probe: drives the running dev client in headless Chrome with
// real input events and checks prediction, reconciliation and stamina.
//
//   pnpm dev                                   # in another terminal
//   pnpm probe:movement [url]                  # default: 150 ms one-way, 5% loss
//
// CHROME_PATH overrides the Chrome executable. Exits non-zero if a check fails.
import { createReport, openPage, sleep, startPlaying } from './lib.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/?latency=150&loss=0.05';
/** A rendered backward step larger than this while walking forward is rubber-banding. */
const MAX_BACKWARD_STEP_M = 0.002;

const report = createReport('Phase 1 probe');
let page;
try {
  page = await openPage(url);
  await startPlaying(page, report);

  // Record the rendered camera z on every frame (yaw 0: forward is -Z, bob sways only X).
  await page.evaluate(`(() => {
    window.__probe = { z: [] };
    const tick = () => { window.__probe.z.push(window.chalkbound.camera.position.z); window.__probe.raf = requestAnimationFrame(tick); };
    tick();
  })()`);
  const state = () =>
    page.evaluate(`(() => {
      const p = window.chalkbound.predictor(); const s = window.chalkbound.net.authoritativePlayer;
      return { corrections: p.corrections, predictedZ: p.state.position.z, serverZ: s.position.z,
        sprinting: s.sprinting, stamina: s.stamina.value };
    })()`);

  // 1. Walk forward for 1.5 s (the room is 8 m deep; desks are clear along the aisle).
  const before = await state();
  await page.key('keyDown', 'w');
  await sleep(1500);
  await page.key('keyUp', 'w');
  await sleep(1000); // let the authority catch up
  const afterWalk = await state();
  const zs = await page.evaluate(
    '(() => { cancelAnimationFrame(window.__probe.raf); return window.__probe.z; })()',
  );

  let maxBackward = 0;
  for (let i = 1; i < zs.length; i++) maxBackward = Math.max(maxBackward, zs[i] - zs[i - 1]);
  const walked = before.serverZ - afterWalk.serverZ;
  report.check(walked > 1, 'the server moved the player forward', `${walked.toFixed(2)} m`);
  report.check(
    Math.abs(afterWalk.predictedZ - afterWalk.serverZ) < 0.001,
    'prediction and server agree at rest',
    `Δ ${Math.abs(afterWalk.predictedZ - afterWalk.serverZ).toExponential(1)} m`,
  );
  report.check(
    afterWalk.corrections === before.corrections,
    'no corrections while walking',
    `${afterWalk.corrections - before.corrections}`,
  );
  report.check(
    maxBackward <= MAX_BACKWARD_STEP_M,
    'no rubber-banding in the rendered camera',
    `max backward step ${(maxBackward * 1000).toFixed(2)} mm over ${zs.length} frames`,
  );

  // 2. Sprint into the far wall until stamina runs out: sprint must stop at zero.
  await page.key('keyDown', 'shift');
  await page.key('keyDown', 'w');
  let sawSprint = false;
  for (let i = 0; i < 120; i++) {
    await sleep(100);
    const s = await state();
    sawSprint ||= s.sprinting;
    if (sawSprint && s.stamina === 0) break;
  }
  await sleep(500);
  const exhausted = await state();
  await page.key('keyUp', 'w');
  await page.key('keyUp', 'shift');
  report.check(sawSprint, 'the server registers the sprint');
  report.check(
    exhausted.stamina === 0 && !exhausted.sprinting,
    'stamina gates sprint: sprint ends when stamina is empty',
    `stamina ${exhausted.stamina.toFixed(1)}, sprinting ${exhausted.sprinting}`,
  );
  report.check(
    exhausted.corrections === before.corrections,
    'still no corrections after sprinting',
  );

  report.check(
    page.errors.length === 0,
    'no console errors or exceptions',
    page.errors.join(' | '),
  );
} catch (error) {
  report.fail(error.message);
} finally {
  await page?.close();
}
report.finish();
