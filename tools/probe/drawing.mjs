#!/usr/bin/env node
// Phase 3 exit probe: in the running dev client, pick up chalk, draw a sword
// through draw mode, and check the authority creates it and takes 20 chalk —
// then that a scribble is refused rather than guessed at. Pointer lock is
// checked at every step, because losing it is the one thing drawing must
// never do (SPEC_AUDIT RD-08).
//
//   pnpm dev                        # in another terminal
//   pnpm probe:drawing [url]        # default: 150 ms one-way, 5% loss
import { createReport, openPage, sleep, startPlaying, walkToChalkBox } from './lib.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/?latency=150&loss=0.05';
/** Box 3 sits on the floor at the end of the spawn aisle, short of the trench. */
const NEAR_BOX = 3;
/** Stop before the floor gap: past this the aisle runs out (FLOOR_GAP.toZ). */
const STOP_Z = -1.0;
/** Long enough for a reliable submission and its verdict at 150 ms one-way. */
const ROUND_TRIP_WAIT_MS = 1200;
/**
 * Mouse moves per stroke. Deliberately few: every one is a CDP round trip,
 * and the blueprint's timing constraint rejects a sketch that took longer
 * than six seconds. Enough to sample a line, few enough to draw it at
 * something like human speed.
 */
const LEGS = 6;
const FRAME_MS = 16;

const report = createReport('Phase 3 probe');
let page;
let lockLost = false;

try {
  page = await openPage(url);
  await startPlaying(page, report);

  const net = (field) => page.evaluate(`window.chalkbound.net.${field}`);
  const cursor = () => page.evaluate('window.chalkbound.drawMode.cursor');
  const locked = () =>
    page.evaluate('document.pointerLockElement === document.getElementById("game-canvas")');

  /** Every step of the draw must stay locked; one check that never resets. */
  const assertLocked = async (where) => {
    if (!(await locked())) {
      lockLost = true;
      report.fail(`pointer lock released during ${where}`);
    }
  };

  // Pixels per plane metre, measured from the client rather than read from
  // its config: it checks the mapping at the same time as calibrating.
  let pxPerMetre = 0;

  /** Waits until the client has consumed the movement already dispatched. */
  const settle = async () => {
    let previous = await cursor();
    for (let i = 0; i < 20; i++) {
      await sleep(FRAME_MS);
      const now = await cursor();
      if (now.x === previous.x && now.y === previous.y) return now;
      previous = now;
    }
    return previous;
  };

  /**
   * Draws strokes by dispatching mouse events **from inside the page**.
   *
   * Each DevTools round trip costs around a tenth of a second here, so
   * driving a whole sketch over the wire takes tens of seconds — and the
   * blueprint's timing constraint rejects anything slower than six, so the
   * probe would fail the drawing on its own latency rather than on the
   * game's behaviour. Dispatching in-page runs one step per animation
   * frame, which is both the speed a hand draws at and the rate the recorder
   * samples. The events still go through the real document listeners,
   * `InputState`, `DrawMode` and the recorder; only the transport differs.
   *
   * `strokes` are lists of plane-space points, in metres.
   */
  const drawInPage = (strokes, stepsPerLeg) =>
    page.evaluate(`(async () => {
      const metresPerPixel = ${1 / pxPerMetre};
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const move = (dxPx, dyPx) =>
        document.dispatchEvent(
          new MouseEvent('mousemove', { movementX: dxPx, movementY: dyPx, bubbles: true }),
        );
      const button = (type, b) =>
        document.dispatchEvent(new MouseEvent(type, { button: b, bubbles: true }));
      const cursor = () => window.chalkbound.drawMode.cursor;

      /** Closed-loop, but free: reading the cursor in-page costs nothing. */
      const goTo = async (tx, ty, steps) => {
        for (let i = 0; i < steps; i++) {
          const at = cursor();
          const left = steps - i;
          move(((tx - at.x) / left) / metresPerPixel, -((ty - at.y) / left) / metresPerPixel);
          await frame();
        }
      };

      for (const stroke of ${JSON.stringify(strokes)}) {
        const [first, ...rest] = stroke;
        await goTo(first.x, first.y, 3);
        button('mousedown', 0);
        await frame();
        for (const point of rest) await goTo(point.x, point.y, ${stepsPerLeg});
        button('mouseup', 0);
        await frame();
      }
      return JSON.stringify(cursor());
    })()`);

  // 1. Chalk first: there is no drawing without it.
  await walkToChalkBox(page, NEAR_BOX, STOP_Z, report);
  await page.press('e');
  const picked = await page.waitFor('window.chalkbound.net.chalk === 25', 3000);
  report.check(picked, 'picked up chalk to draw with', `chalk ${await net('chalk')}`);
  await assertLocked('the chalk pickup');

  // 2. Raise the chalk. Draw mode needs chalk and a fresh press.
  await page.mouse.button('mousePressed', 'right');
  await sleep(100);
  const raised = await page.evaluate('window.chalkbound.drawMode.active');
  report.check(raised, 'holding the draw button raises the chalk');
  await assertLocked('entering draw mode');

  const before = await cursor();
  const PROBE_PX = 80;
  await page.mouse.moveBy(PROBE_PX, 0, 2);
  const after = await settle();
  const travelled = after.x - before.x;
  report.check(travelled > 1e-6, 'mouse movement drives the chalk cursor', JSON.stringify(after));
  if (!(travelled > 1e-6)) {
    throw new Error(
      'the virtual cursor did not respond to synthetic mouse movement; ' +
        'this probe cannot drive drawing in this Chrome build',
    );
  }
  pxPerMetre = PROBE_PX / travelled;

  // 3. Draw a sword: blade tip to hilt, then the guard across its lower third.
  const end = JSON.parse(
    await drawInPage(
      [
        [
          { x: 0, y: 0.25 },
          { x: 0, y: -0.25 },
        ],
        [
          { x: -0.0925, y: -0.125 },
          { x: 0.0925, y: -0.125 },
        ],
      ],
      LEGS,
    ),
  );
  report.check(
    Math.abs(end.x - 0.0925) < 0.02 && Math.abs(end.y + 0.125) < 0.02,
    'the strokes land where a sword has them',
    JSON.stringify(end),
  );
  await assertLocked('drawing the sword');

  // Ask the client's own validator before submitting, so a refusal below
  // reports the geometric reason rather than just the verdict.
  const local = await page.evaluate(`(() => {
    const strokes = window.chalkbound.drawMode.strokes;
    const first = strokes[0]?.points[0], last = strokes.at(-1)?.points.at(-1);
    const sketch = { strokes, durationMs: last && first ? last.t - first.t : 0 };
    return JSON.stringify({
      strokes: strokes.length,
      points: strokes.map((s) => s.points.length),
      durationMs: sketch.durationMs,
      outcome: window.chalkbound.drawing.validate(sketch),
    });
  })()`);
  report.check(true, 'client-side reading of the sketch', local);
  const drawnIn = JSON.parse(local).durationMs;
  report.check(
    drawnIn < 6000,
    'the probe drew it at something like human speed',
    `${Math.round(drawnIn)} ms`,
  );

  // 4. Lower the chalk: the sketch is quantized, sent, and judged.
  await page.mouse.button('mouseReleased', 'right');
  await sleep(ROUND_TRIP_WAIT_MS);
  await assertLocked('the submission');

  const verdict = await page.evaluate('window.chalkbound.net.drawingResult');
  report.check(
    verdict?.outcome?.kind === 'created' && verdict.outcome.blueprintId === 'sword',
    'a drawn sword is recognized by the authority',
    JSON.stringify(verdict?.outcome),
  );
  report.check(verdict?.chalkDebited === 20, 'creating a sword costs 20 chalk');
  report.check(
    (await net('chalk')) === 5,
    'the meter shows the debit',
    `chalk ${await net('chalk')}`,
  );
  const banner = await page.evaluate(
    `document.querySelector('.drawing-banner__title')?.textContent`,
  );
  report.check(
    banner === 'SWORD — Keen' || banner?.startsWith('SWORD'),
    'the banner names it',
    banner,
  );

  // 5. A scribble must be refused, never guessed at (criterion 5).
  await sleep(600); // clear the authority's rate limit
  await page.mouse.button('mousePressed', 'right');
  await sleep(100);
  await drawInPage(
    [
      [
        { x: -0.05, y: 0.05 },
        { x: 0.12, y: 0.16 },
        { x: -0.14, y: 0.02 },
        { x: 0.1, y: -0.14 },
        { x: -0.09, y: -0.05 },
      ],
    ],
    2,
  );
  await page.mouse.button('mouseReleased', 'right');
  await sleep(ROUND_TRIP_WAIT_MS);
  await assertLocked('the scribble');

  const refusal = await page.evaluate('window.chalkbound.net.drawingResult');
  report.check(
    refusal?.outcome?.kind !== 'created',
    'a scribble is never turned into a blueprint',
    JSON.stringify(refusal?.outcome),
  );
  report.check(
    refusal?.outcome?.kind === 'unrecognized' && refusal.chalkDebited === 5,
    'an unreadable sketch costs the flat 5 chalk',
    JSON.stringify(refusal),
  );

  report.check(!lockLost, 'pointer lock held for the whole loop');
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
