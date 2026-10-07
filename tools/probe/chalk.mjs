#!/usr/bin/env node
// Phase 2 exit probe: in the running dev client, walk to a chalk box, press E,
// and check that chalk rises on the server and the HUD — and that a forged
// interaction or a tampered client value changes nothing.
//
//   pnpm dev                       # in another terminal
//   pnpm probe:chalk [url]         # default: 150 ms one-way, 5% loss
import { createReport, openPage, sleep, startPlaying } from './lib.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/?latency=150&loss=0.05';
/** Box 3 sits on the floor below the blackboard, at the end of the spawn aisle. */
const NEAR_BOX = 3;
/** Box 1 sits on the front-left desk, well out of reach from the blackboard. */
const FAR_BOX = 1;
/** Stop walking once the predicted feet pass this z (the box is at z ≈ -3.7). */
const STOP_Z = -2.9;
/** Long enough for a reliable message and the next snapshot at 150 ms one-way. */
const ROUND_TRIP_WAIT_MS = 1200;

const report = createReport('Phase 2 probe');
let page;
try {
  page = await openPage(url);
  await startPlaying(page, report);

  const net = (field) => page.evaluate(`window.chalkbound.net.${field}`);
  const boxRemaining = (id) => page.evaluate(`window.chalkbound.net.chalkBoxes.get(${id})`);
  const hud = () => page.evaluate(`document.querySelector('.chalk-meter__label')?.textContent`);
  const promptText = () =>
    page.evaluate(
      `(() => { const el = document.querySelector('.interact-prompt'); return el.hidden ? '' : el.textContent; })()`,
    );

  report.check((await net('chalk')) === 0, 'players start with no chalk (server)');

  // 1. Walk up the aisle toward the blackboard.
  await page.key('keyDown', 'w');
  await page.waitFor(`window.chalkbound.predictor().state.position.z <= ${STOP_Z}`, 6000, 25);
  await page.key('keyUp', 'w');
  await sleep(500);

  // 2. Aim at the box: point the client's own look angles at it (mouse deltas
  // are unreliable headless). The server re-checks reach regardless.
  await page.evaluate(`(() => {
    const { look, level, predictor } = window.chalkbound;
    const p = predictor().state.position;
    const box = level.chalkBoxes.find((b) => b.id === ${NEAR_BOX}).position;
    const dx = box.x - p.x, dy = box.y - (p.y + 1.65), dz = box.z - p.z;
    look.yaw = Math.atan2(-dx, -dz);
    look.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  })()`);
  await sleep(300);
  const shown = await promptText();
  report.check(shown.includes('Pick up chalk'), 'aiming at the box shows the prompt', `"${shown}"`);

  // 3. Press E: one intent; the authority validates and the snapshot reports the result.
  await page.press('e');
  const picked = await page.waitFor('window.chalkbound.net.chalk === 25', 3000);
  report.check(picked, 'pressing E raises chalk on the server', `chalk ${await net('chalk')}`);
  await sleep(100);
  report.check((await hud()) === 'Chalk 25 / 100', 'the HUD shows the server value', await hud());
  report.check((await boxRemaining(NEAR_BOX)) === 0, 'the box is emptied on the server');
  report.check(
    (await page.evaluate(
      `window.chalkbound.scene.getObjectByName('chalk-box-${NEAR_BOX}').visible`,
    )) === false,
    'the empty box disappears',
  );

  // 4. A forged interact for a box far out of reach, and a repeat on the empty box.
  await page.evaluate(`window.chalkbound.net.sendInteract(${FAR_BOX})`);
  await page.evaluate(`window.chalkbound.net.sendInteract(${NEAR_BOX})`);
  await sleep(ROUND_TRIP_WAIT_MS);
  report.check((await net('chalk')) === 25, 'forged and repeated interactions give nothing');
  report.check((await boxRemaining(FAR_BOX)) === 25, 'the far box is untouched');

  // 5. Tamper with the client's copy of chalk: the next snapshot restores the truth.
  await page.evaluate('window.chalkbound.net.chalk = 99');
  await sleep(ROUND_TRIP_WAIT_MS);
  report.check((await net('chalk')) === 25, 'a tampered client value is overwritten by the server');
  report.check((await hud()) === 'Chalk 25 / 100', 'the HUD follows the server, not the tamper');

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
