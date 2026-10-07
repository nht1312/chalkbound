#!/usr/bin/env node
// Phase 1 exit probe: drives the running dev client in headless Chrome with
// real input events and checks prediction, reconciliation and stamina.
//
//   pnpm dev                                   # in another terminal
//   node tools/probe/movement.mjs [url]        # default: 150 ms one-way, 5% loss
//
// CHROME_PATH overrides the Chrome executable. Exits non-zero if a check fails.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2] ?? 'http://localhost:5173/?latency=150&loss=0.05';
const chromePath =
  process.env.CHROME_PATH ??
  {
    win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  }[process.platform] ??
  'google-chrome';
const PORT = 9223;
/** A rendered backward step larger than this while walking forward is rubber-banding. */
const MAX_BACKWARD_STEP_M = 0.002;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), 'chalkbound-probe-'));
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-first-run',
    `--user-data-dir=${profile}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let failures = 0;
const check = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
};

try {
  let version;
  for (let i = 0; i < 40 && !version; i++) {
    version = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      .then((r) => r.json())
      .catch(() => undefined);
    if (!version) await sleep(250);
  }
  if (!version) throw new Error(`Chrome did not start (${chromePath})`);

  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  let sessionId;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails.exception?.description);
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const msgId = ++id;
      pending.set(msgId, resolve);
      ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  const evaluate = async (expression) =>
    (await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression })).result
      ?.result?.value;

  const KEYS = {
    w: { code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 },
    shift: { code: 'ShiftLeft', key: 'Shift', windowsVirtualKeyCode: 16 },
  };
  const key = (type, k) => send('Input.dispatchKeyEvent', { type, ...KEYS[k] });

  const { result: target } = await send('Target.createTarget', { url: 'about:blank' });
  sessionId = (await send('Target.attachToTarget', { targetId: target.targetId, flatten: true }))
    .result.sessionId;
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url });

  // Wait for prediction and the first authoritative snapshot.
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    await sleep(250);
    ready = await evaluate(
      '!!(window.chalkbound?.predictor?.() && window.chalkbound.net.authoritativePlayer)',
    );
  }
  check(ready, 'client starts: prediction and authority are running');
  if (!ready) throw new Error('client never became ready; is `pnpm dev` running?');

  // Click Resume with a real input event to acquire pointer lock.
  const button = await evaluate(
    `(() => { const r = document.querySelector('.pause-menu__resume').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
  );
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, ...button, button: 'left', clickCount: 1 });
  }
  await sleep(500);
  const locked = await evaluate(
    'document.pointerLockElement === document.getElementById("game-canvas")',
  );
  check(locked, 'pointer lock acquired from the pause menu');
  if (!locked) throw new Error('pointer lock not acquired');

  // Record the rendered camera z on every frame (yaw 0: forward is -Z, bob sways only X).
  await evaluate(`(() => {
    window.__probe = { z: [] };
    const tick = () => { window.__probe.z.push(window.chalkbound.camera.position.z); window.__probe.raf = requestAnimationFrame(tick); };
    tick();
  })()`);
  const state = () =>
    evaluate(`(() => {
      const p = window.chalkbound.predictor(); const s = window.chalkbound.net.authoritativePlayer;
      return { corrections: p.corrections, predictedZ: p.state.position.z, serverZ: s.position.z,
        sprinting: s.sprinting, stamina: s.stamina.value };
    })()`);

  // 1. Walk forward for 1.5 s (the room is 8 m deep; desks are clear along the aisle).
  const before = await state();
  await key('keyDown', 'w');
  await sleep(1500);
  await key('keyUp', 'w');
  await sleep(1000); // let the authority catch up
  const afterWalk = await state();
  const zs = await evaluate(
    '(() => { cancelAnimationFrame(window.__probe.raf); return window.__probe.z; })()',
  );

  let maxBackward = 0;
  for (let i = 1; i < zs.length; i++) maxBackward = Math.max(maxBackward, zs[i] - zs[i - 1]);
  const walked = before.serverZ - afterWalk.serverZ;
  check(walked > 1, 'the server moved the player forward', `${walked.toFixed(2)} m`);
  check(
    Math.abs(afterWalk.predictedZ - afterWalk.serverZ) < 0.001,
    'prediction and server agree at rest',
    `Δ ${Math.abs(afterWalk.predictedZ - afterWalk.serverZ).toExponential(1)} m`,
  );
  check(
    afterWalk.corrections === before.corrections,
    'no corrections while walking',
    `${afterWalk.corrections - before.corrections}`,
  );
  check(
    maxBackward <= MAX_BACKWARD_STEP_M,
    'no rubber-banding in the rendered camera',
    `max backward step ${(maxBackward * 1000).toFixed(2)} mm over ${zs.length} frames`,
  );

  // 2. Sprint into the far wall until stamina runs out: sprint must stop at zero.
  await key('keyDown', 'shift');
  await key('keyDown', 'w');
  let sawSprint = false;
  let last;
  for (let i = 0; i < 120; i++) {
    await sleep(100);
    last = await state();
    sawSprint ||= last.sprinting;
    if (sawSprint && last.stamina === 0) break;
  }
  await sleep(500);
  const exhausted = await state();
  await key('keyUp', 'w');
  await key('keyUp', 'shift');
  check(sawSprint, 'the server registers the sprint');
  check(
    exhausted.stamina === 0 && !exhausted.sprinting,
    'stamina gates sprint: sprint ends when stamina is empty',
    `stamina ${exhausted.stamina.toFixed(1)}, sprinting ${exhausted.sprinting}`,
  );
  check(exhausted.corrections === before.corrections, 'still no corrections after sprinting');

  check(errors.length === 0, 'no console errors or exceptions', errors.join(' | '));
  await send('Target.closeTarget', { targetId: target.targetId });
  ws.close();
} catch (error) {
  failures++;
  console.log(`FAIL  ${error.message}`);
} finally {
  chrome.kill();
  await sleep(300);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // Chrome may still hold files briefly; the OS temp dir cleans up eventually.
  }
}

console.log(
  failures === 0
    ? '\nPhase 1 probe: all checks passed'
    : `\nPhase 1 probe: ${failures} check(s) failed`,
);
process.exit(failures === 0 ? 0 : 1);
