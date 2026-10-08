#!/usr/bin/env node
// Phase 4 exit probe: in the running dev client, draw all three blueprints
// and check that what comes back is a *thing* and not just a verdict — the
// sword reaches the hand, the wall stops the player, and the bridge carries
// them over the trench they would otherwise fall into.
//
// The wall and the bridge are the ones that matter: they are collision-
// bearing geometry made by a player at runtime, which SPEC_AUDIT R-03 calls
// the most under-appreciated risk in the design. Run under latency and loss,
// because the gap between drawing something and the authority agreeing it
// exists is exactly where that risk lives.
//
//   pnpm dev                         # in another terminal
//   pnpm probe:creation [url]        # default: 150 ms one-way, 5% loss
import {
  aimAtChalkBox,
  createReport,
  openPage,
  PROMPT_TEXT,
  sleep,
  startPlaying,
} from './lib.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/?latency=150&loss=0.05';
/**
 * Every chalk box in the room. One box is 25 chalk and the three blueprints
 * cost 60 between them, so the probe has to empty the room before it can draw
 * them all — which is itself the scarcity the game is built on.
 */
/**
 * Each chalk box, with the spot to stand in to reach it. The desk box is
 * reached from the aisle beside it rather than from on top of it, which is
 * where the player would otherwise try to stand.
 */
const BOXES = [
  { id: 3, at: [1, -0.9] },
  { id: 1, at: [-1.2, -1.1] },
  { id: 2, at: [-4.5, 3.4] },
];
/** Clear of every desk row, so sideways moves never clip a corner. */
const CORRIDOR_Z = 3.2;
const TRENCH_EDGE_Z = -1.3;
/**
 * The room's desks stand in three columns at x = -2, 0 and 2, each 1.2 m
 * wide, leaving aisles too narrow to walk reliably with a 0.6 m capsule. West
 * of x = -2.6 the floor is clear for 2.4 m, so the probe does its walking
 * there rather than threading desks. The trench spans the full width, so it
 * can be crossed from anywhere.
 */
const WEST_LANE_X = -4;
/** Long enough for a reliable submission and its verdict at 150 ms one-way. */
const ROUND_TRIP_WAIT_MS = 1200;
/** Past the authority's 500 ms submission rate limit, with room to spare. */
const BETWEEN_SKETCHES_MS = 900;
const LEGS = 6;
const PROBE_PX = 80;

const report = createReport('Phase 4 probe');
let page;

try {
  page = await openPage(url);
  await startPlaying(page, report);

  const net = (field) => page.evaluate(`window.chalkbound.net.${field}`);
  const position = () => page.evaluate('window.chalkbound.predictor().state.position');
  /** Points the camera, which is also the direction the player walks. */
  const face = (yaw) => page.evaluate(`window.chalkbound.look.yaw = ${yaw}`);

  /**
   * Stops the run the moment the player leaves the floor. Without this, one
   * misstep into the trench turns into a dozen failures that all say the same
   * thing, and the one that mattered scrolls off the top.
   */
  const assertOnFoot = async (where) => {
    const at = await position();
    if (at.y < -1) {
      throw new Error(
        `the player fell out of the world during ${where} ` +
          `(y ${at.y.toFixed(1)}, z ${at.z.toFixed(1)})`,
      );
    }
    return at;
  };
  const solidCount = () => page.evaluate('window.chalkbound.drawn.solid().length');

  let pxPerMetre = 0;

  /**
   * Dispatches a sketch from inside the page. Each DevTools round trip costs
   * about a tenth of a second, and the blueprint timing constraint rejects a
   * sketch slower than six seconds — so driving one over the wire would fail
   * the drawing on the probe's own latency. See the Phase 3 probe.
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
      const at = () => window.chalkbound.drawMode.cursor;
      // Start from the middle of the plane every time. A stroke that begins
      // at the clamped edge begins where the clamp is, not where it was
      // asked for, which bends its first leg and shortens everything after.
      const halfPlanePx = 0.4 / metresPerPixel;
      for (let i = 0; i < 10; i++) { move(-400, 0); await frame(); }
      for (let i = 0; i < 10; i++) { move(halfPlanePx / 10, 0); await frame(); }
      await frame();
      /**
       * Open-loop on purpose. The cursor is the running sum of the deltas it
       * is sent, so a fixed delta per frame lands exactly where it was aimed
       * no matter how the frames are paced. Steering toward the target each
       * frame instead — reading where the cursor got to and correcting —
       * bends the line whenever SwiftShader drops one, which failed the
       * straightness constraint often enough to look like the game misreading
       * a sword. The cursor is read once per leg, to carry drift forward.
       */
      const goTo = async (tx, ty, steps) => {
        const from = at();
        const dx = (tx - from.x) / metresPerPixel / steps;
        const dy = -(ty - from.y) / metresPerPixel / steps;
        for (let i = 0; i < steps; i++) {
          move(dx, dy);
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
      return JSON.stringify(at());
    })()`);

  /**
   * Raises the chalk, draws `strokes`, lowers it, and reports the verdict.
   *
   * Redraws when the **client's own validator** says the strokes came out
   * wrong, because that means the probe failed to draw the shape, not that
   * the game failed to read it. A sketch the client reads as good is
   * submitted and its verdict stands however it turns out — retrying *that*
   * would be retrying the thing under test, and would hide exactly the bug
   * this probe exists to catch. Each refused attempt costs the flat 5 chalk,
   * which is what the room's spare 15 is for.
   */
  const sketch = async (strokes, stepsPerLeg = LEGS, label = '') => {
    let verdict;
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.mouse.button('mousePressed', 'right');
      await sleep(150);
      const raised = await page.evaluate('window.chalkbound.drawMode.active');
      if (!raised) report.fail(`the chalk never came up for the ${label}`);
      await drawInPage(strokes, stepsPerLeg);

      // What the client makes of it, before the authority is asked.
      const local = JSON.parse(
        await page.evaluate(`(() => {
          const s = window.chalkbound.drawMode.strokes;
          const first = s[0]?.points[0], last = s.at(-1)?.points.at(-1);
          return JSON.stringify({
            strokes: s.length,
            points: s.map((x) => x.points.length),
            outcome: window.chalkbound.drawing.validate({
              strokes: s, durationMs: last && first ? last.t - first.t : 0,
            }),
          });
        })()`),
      );
      const drewIt = local.outcome?.kind === 'created';

      await page.mouse.button('mouseReleased', 'right');
      await sleep(ROUND_TRIP_WAIT_MS);
      verdict = await page.evaluate('window.chalkbound.net.drawingResult');

      if (verdict?.outcome?.kind === 'created') return verdict;
      if (drewIt) {
        // The client read it as a blueprint and the authority did not. That
        // is a disagreement worth reporting, not an attempt worth repeating.
        report.check(false, `${label}: client and authority disagree`, JSON.stringify(local));
        return verdict;
      }
      report.check(true, `${label} redrawn: the probe's own strokes came out wrong`, JSON.stringify(local));
      await sleep(BETWEEN_SKETCHES_MS);
    }
    return verdict;
  };

  /** Holds a key for `ms` and reports where the player ended up. */
  const hold = async (key, ms) => {
    const from = await position();
    await page.key('keyDown', key);
    await sleep(ms);
    await page.key('keyUp', key);
    await sleep(300);
    const to = await position();
    return { distance: Math.hypot(to.x - from.x, to.z - from.z), from, to };
  };

  /**
   * Walks to (tx, tz) from inside the page.
   *
   * Driven over DevTools this was both slow and unreliable: a step and a
   * position read cost a round trip each, so crossing the room took minutes
   * and the frame loop ran on regardless between them. In-page it steers once
   * per animation frame against the position it can actually see — the same
   * reason the drawing moved in-page.
   *
   * It travels along the axes rather than straight at the target. The room is
   * a grid of desk blocks, and a diagonal walk clips their corners and wedges:
   * south to the clear corridor behind the desks, then across, then up the
   * aisle. Walking straight at things was the single largest source of
   * flakiness in this probe.
   */
  const walkTo = async (tx, tz) =>
    JSON.parse(
      await page.evaluate(`(async () => {
        const frame = () => new Promise((r) => requestAnimationFrame(r));
        const key = (type, code) =>
          document.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
        const at = () => window.chalkbound.predictor().state.position;

        // Facing -Z, so KeyW goes north, KeyS south, KeyD east, KeyA west.
        window.chalkbound.look.yaw = 0;
        const legs = [
          { done: (p) => p.z >= ${CORRIDOR_Z} - 0.3, key: () => 'KeyS' },
          { done: (p) => Math.abs(${tx} - p.x) < 0.25, key: (p) => (${tx} > p.x ? 'KeyD' : 'KeyA') },
          { done: (p) => Math.abs(${tz} - p.z) < 0.35, key: (p) => (${tz} < p.z ? 'KeyW' : 'KeyS') },
        ];

        let held;
        const release = () => { if (held) key('keyup', held); held = undefined; };
        for (const leg of legs) {
          let stuck = 0;
          let last = at();
          for (let i = 0; i < 1200; i++) {
            const p = at();
            if (p.y < -1) {
              release();
              return JSON.stringify({ ok: false, fell: true, at: p });
            }
            if (leg.done(p)) break;
            // A leg that is not moving is a leg against a wall. Give up on it
            // rather than holding the key for twenty seconds.
            if (Math.hypot(p.x - last.x, p.z - last.z) < 0.002) stuck++;
            else stuck = 0;
            if (stuck > 90) break;
            last = p;
            const want = leg.key(p);
            if (want !== held) {
              release();
              key('keydown', want);
              held = want;
            }
            await frame();
          }
          release();
          await frame();
        }
        return JSON.stringify({ ok: true, at: at() });
      })()`),
    );

  /**
   * Routes to a box's approach spot, then aims and takes it, retrying the
   * whole walk if it does not arrive.
   *
   * The retry is not politeness, and it is not papering over a game bug: the
   * frame rate under SwiftShader wanders, so a walk occasionally stalls short
   * of its target. The Phase 3 probe's walk helper retries for the same
   * reason. What is *not* retried is anything the authority decides.
   */
  const collect = async (boxId, [tx, tz]) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const walked = await walkTo(tx, tz);
      if (!walked.ok) continue;
      await aimAtChalkBox(page, boxId);
      if (!(await page.waitFor(PROMPT_TEXT, 1500, 50))) continue;
      const was = await net('chalk');
      await page.press('e');
      if (await page.waitFor(`window.chalkbound.net.chalk > ${was}`, 3000)) return true;
    }
    return false;
  };

  // 1. Chalk, and enough of it for all three blueprints: 60 between them, and
  //    25 to a box, so the room has to be emptied first.
  for (const box of BOXES) {
    const took = await collect(box.id, box.at);
    report.check(took, `took the chalk from box ${box.id}`, `chalk ${await net('chalk')}`);
  }
  await assertOnFoot('the chalk round');
  const stock = await net('chalk');
  report.check(stock >= 60, 'carrying enough chalk for all three blueprints', `chalk ${stock}`);

  // Calibrate the cursor from inside the page.
  //
  // Driving this over DevTools races the frame loop: each move is a separate
  // round trip, and reading the cursor between them catches it mid-flight.
  // The same 80 px measured that way came back as 833 px/m on one run and
  // 521 on the next, and every stroke afterwards was drawn at whichever
  // scale it happened to get. In-page there is no window to race in.
  await page.mouse.button('mousePressed', 'right');
  await sleep(150);
  const upForCalibration = await page.evaluate('window.chalkbound.drawMode.active');
  const stillLocked = await page.evaluate(
    'document.pointerLockElement === document.getElementById("game-canvas")',
  );
  report.check(
    upForCalibration && stillLocked,
    'the chalk comes up after all that walking, still in pointer lock',
    `active ${upForCalibration}, locked ${stillLocked}`,
  );

  const measured = JSON.parse(
    await page.evaluate(`(async () => {
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const move = (dx) =>
        document.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, bubbles: true }));
      const at = () => window.chalkbound.drawMode.cursor.x;
      // Hard into the left edge, so the start is a known position.
      for (let i = 0; i < 10; i++) { move(-400); await frame(); }
      await frame();
      const before = at();
      for (let i = 0; i < ${PROBE_PX / 10}; i++) { move(10); await frame(); }
      await frame();
      return JSON.stringify({ before, after: at() });
    })()`),
  );
  const travelled = measured.after - measured.before;
  await page.mouse.button('mouseReleased', 'right');
  await sleep(400);
  if (!(travelled > 1e-6)) {
    throw new Error(
      'the virtual cursor did not respond to synthetic mouse movement ' +
        `(draw mode ${upForCalibration ? 'was' : 'was NOT'} active, ` +
        `pointer lock ${stillLocked ? 'held' : 'LOST'}, ` +
        `cursor ${measured.before.toFixed(3)} then ${measured.after.toFixed(3)})`,
    );
  }
  pxPerMetre = PROBE_PX / travelled;
  report.check(
    travelled > 0.01 && travelled < 0.35,
    'the calibration move stayed inside the drawable area',
    `moved ${travelled.toFixed(4)} m for ${PROBE_PX} px; ${pxPerMetre.toFixed(1)} px/m`,
  );

  /**
   * Moves into the clear lane west of the desks, where there is room to put a
   * wall in front of someone and still have somewhere left to walk.
   */
  const takeTheWestLane = async () => {
    const walked = await walkTo(WEST_LANE_X, CORRIDOR_Z - 1);
    const at = walked.at ?? (await position());
    report.check(
      walked.ok && at.x < -3.1,
      'reached the clear lane down the west of the room',
      `x ${at.x.toFixed(2)}`,
    );
  };

  // 2. A sword, which must reach the hand rather than the world (SPEC §6.8).
  const swordVerdict = await sketch(
    [
      // Midpoints on the line, not decoration. The in-page draw steers
      // toward its target each frame, and SwiftShader's frame pacing wanders
      // enough that a single long leg bows out and fails Straightness. A
      // waypoint half way along pulls it back onto the line.
      [
        { x: 0, y: 0.25 },
        { x: 0, y: 0 },
        { x: 0, y: -0.25 },
      ],
      [
        { x: -0.0925, y: -0.125 },
        { x: 0, y: -0.125 },
        { x: 0.0925, y: -0.125 },
      ],
    ],
    LEGS,
    'sword',
  );
  report.check(
    swordVerdict?.outcome?.kind === 'created' && swordVerdict.outcome.blueprintId === 'sword',
    'a drawn sword is created',
    JSON.stringify(swordVerdict?.outcome),
  );
  const equipped = await net('equipped');
  report.check(
    equipped?.blueprintId === 'sword' && equipped.durability > 0,
    'the sword arrives in the hand, not in the world',
    JSON.stringify(equipped),
  );
  report.check((await solidCount()) === 0, 'a weapon leaves nothing standing in the world');

  // 3. A wall, which must stop the player who drew it. Drawn facing *south*,
  //    away from the trench, so it does not fence off the rest of the probe.
  await takeTheWestLane();
  await face(Math.PI);
  await sleep(BETWEEN_SKETCHES_MS);
  const wallVerdict = await sketch(
    [
      [
        { x: -0.15, y: -0.075 },
        { x: 0.15, y: -0.075 },
        { x: 0.15, y: 0.075 },
        { x: -0.15, y: 0.075 },
        { x: -0.15, y: -0.075 },
      ],
    ],
    6,
  );
  report.check(
    wallVerdict?.outcome?.kind === 'created' && wallVerdict.outcome.blueprintId === 'wall',
    'a drawn wall is created',
    JSON.stringify(wallVerdict?.outcome),
  );
  const standing = await solidCount();
  report.check(standing === 1, 'the wall is solid on this client too', `${standing} standing`);

  const intoWall = await hold('w', 1200);
  report.check(
    intoWall.distance < 2.2,
    'the wall stops the player who drew it',
    `travelled ${intoWall.distance.toFixed(2)} m`,
  );

  // 4. A bridge over the trench, which must carry the player across it.
  //    Turn back to the trench and walk to its lip.
  const toLip = await walkTo(WEST_LANE_X, TRENCH_EDGE_Z);
  const atEdge = toLip.at ?? (await position());
  report.check(
    toLip.ok && atEdge.z <= TRENCH_EDGE_Z + 0.6 && atEdge.y > -0.3,
    'reached the lip of the trench without falling in',
    `z ${atEdge.z.toFixed(2)}, y ${atEdge.y.toFixed(2)}`,
  );

  await sleep(BETWEEN_SKETCHES_MS);
  // Uneven legs on purpose. Two identical rails drawn in one even sweep are
  // the most machine-like thing in the game, and the anti-automation floor
  // refuses them — correctly. A hand does not hold one speed across two
  // matching lines, so the probe does not either.
  const bridgeVerdict = await sketch([
    [
      { x: -0.15, y: 0.03 },
      { x: -0.04, y: 0.031 },
      { x: 0.07, y: 0.029 },
      { x: 0.15, y: 0.03 },
    ],
    [
      { x: 0.15, y: -0.03 },
      { x: 0.02, y: -0.029 },
      { x: -0.08, y: -0.031 },
      { x: -0.15, y: -0.03 },
    ],
  ]);
  report.check(
    bridgeVerdict?.outcome?.kind === 'created' && bridgeVerdict.outcome.blueprintId === 'bridge',
    'a drawn bridge is created',
    JSON.stringify(bridgeVerdict?.outcome),
  );

  // The exit criterion itself: walk the span. Falling through at any point
  // leaves the player metres below, so where they end up is the whole test.
  const startedAt = await position();
  let lowest = startedAt.y;
  for (let i = 0; i < 30; i++) {
    await hold('w', 100);
    const at = await position();
    lowest = Math.min(lowest, at.y);
    if (at.z < -3.6) break;
  }
  const landed = await position();
  report.check(
    lowest > -0.5,
    'the bridge carries the player rather than dropping them',
    `lowest y ${lowest.toFixed(2)}`,
  );
  report.check(
    landed.z < -3.2 && landed.y > -0.5,
    'the player reaches the far side of the trench on their feet',
    `z ${startedAt.z.toFixed(2)} to ${landed.z.toFixed(2)}, y ${landed.y.toFixed(2)}`,
  );

  // 5. Nothing the client holds may be solid before the authority says so.
  const invariant = await page.evaluate(`(() => {
    const tick = window.chalkbound.net.serverTick;
    const early = window.chalkbound.drawn.solid().filter((o) => o.solidFromTick > tick);
    return JSON.stringify({ tick, standing: window.chalkbound.drawn.solid().length, early: early.length });
  })()`);
  report.check(
    JSON.parse(invariant).early === 0,
    'nothing is solid on the client before the tick it became solid (R-03)',
    invariant,
  );
} catch (error) {
  report.fail(`probe threw: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await page?.close();
}

report.finish();
