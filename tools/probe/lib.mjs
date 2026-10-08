// Shared plumbing for the headless probes: launch Chrome, drive one page over
// the DevTools protocol with real input events, and report PASS/FAIL checks.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9223;
const KEYS = {
  w: { code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 },
  e: { code: 'KeyE', key: 'e', windowsVirtualKeyCode: 69 },
  shift: { code: 'ShiftLeft', key: 'Shift', windowsVirtualKeyCode: 16 },
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chromePath() {
  return (
    process.env.CHROME_PATH ??
    {
      win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    }[process.platform] ??
    'google-chrome'
  );
}

/** Collects PASS/FAIL lines; `finish()` prints a summary and exits non-zero on failure. */
export function createReport(name) {
  let failures = 0;
  return {
    check(ok, label, detail) {
      if (!ok) failures++;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
      return ok;
    },
    fail(message) {
      failures++;
      console.log(`FAIL  ${message}`);
    },
    finish() {
      console.log(
        failures === 0 ? `\n${name}: all checks passed` : `\n${name}: ${failures} check(s) failed`,
      );
      process.exit(failures === 0 ? 0 : 1);
    },
  };
}

/**
 * Launches headless Chrome, opens `url`, and returns helpers for that page.
 * Always call `close()` (it also kills Chrome and removes the temp profile).
 */
export async function openPage(url) {
  const profile = mkdtempSync(join(tmpdir(), 'chalkbound-probe-'));
  const chrome = spawn(
    chromePath(),
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
  const shutdown = async () => {
    chrome.kill();
    await sleep(300);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // Chrome may still hold files briefly; the OS temp dir cleans up eventually.
    }
  };

  let version;
  for (let i = 0; i < 40 && !version; i++) {
    version = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      .then((r) => r.json())
      .catch(() => undefined);
    if (!version) await sleep(250);
  }
  if (!version) {
    await shutdown();
    throw new Error(`Chrome did not start (${chromePath()})`);
  }

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

  const page = {
    errors,
    /** Evaluates `expression` in the page and returns its JSON-serialisable value. */
    async evaluate(expression) {
      const response = await send('Runtime.evaluate', {
        returnByValue: true,
        awaitPromise: true,
        expression,
      });
      return response.result?.result?.value;
    },
    /** Real keyboard events: keyDown / keyUp for a key in KEYS. */
    key: (type, k) => send('Input.dispatchKeyEvent', { type, ...KEYS[k] }),
    async press(k) {
      await page.key('keyDown', k);
      await sleep(50);
      await page.key('keyUp', k);
    },
    async clickAt(x, y) {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
      }
    },
    /**
     * Mouse input for a pointer-locked page. Chrome derives movementX/Y from
     * the change in the synthetic position, so the probe keeps its own
     * virtual pointer and moves it in steps.
     */
    mouse: {
      x: 640,
      y: 360,
      button: (type, button) =>
        send('Input.dispatchMouseEvent', {
          type,
          x: page.mouse.x,
          y: page.mouse.y,
          button,
          clickCount: 1,
          buttons: type === 'mousePressed' ? (button === 'right' ? 2 : 1) : 0,
        }),
      async moveBy(dx, dy, buttons = 0) {
        page.mouse.x += dx;
        page.mouse.y += dy;
        await send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: page.mouse.x,
          y: page.mouse.y,
          button: 'none',
          buttons,
        });
      },
    },
    /** Polls `expression` until truthy or the timeout passes; returns the last value. */
    async waitFor(expression, timeoutMs = 10000, intervalMs = 100) {
      const deadline = Date.now() + timeoutMs;
      let value;
      do {
        value = await page.evaluate(expression);
        if (value) return value;
        await sleep(intervalMs);
      } while (Date.now() < deadline);
      return value;
    },
    async close() {
      try {
        await send('Target.closeTarget', { targetId: target.targetId });
        ws.close();
      } finally {
        await shutdown();
      }
    },
  };
  return page;
}

/**
 * Points the client's own look angles at a chalk box. Mouse deltas are
 * unreliable headless, and the authority re-checks reach regardless, so
 * aiming this way tests the same thing with less noise.
 */
export async function aimAtChalkBox(page, boxId) {
  await page.evaluate(`(() => {
    const { look, level, predictor } = window.chalkbound;
    const p = predictor().state.position;
    const box = level.chalkBoxes.find((b) => b.id === ${boxId}).position;
    const dx = box.x - p.x, dy = box.y - (p.y + 1.65), dz = box.z - p.z;
    look.yaw = Math.atan2(-dx, -dz);
    look.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  })()`);
}

/** The interact prompt's text, or '' while it is hidden. */
export const PROMPT_TEXT =
  "(() => { const el = document.querySelector('.interact-prompt'); return el.hidden ? '' : el.textContent; })()";

/**
 * Walks forward to `boxId` and aims at it, retrying until the prompt appears.
 *
 * The retry is not politeness: under SwiftShader the frame rate wanders, so
 * how far one keyDown carries the player varies between runs. Polling for
 * the prompt — which the authority's own reach check drives — is the
 * reliable signal that we have arrived, rather than guessing at a z.
 */
export async function walkToChalkBox(page, boxId, stopZ, report) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.key('keyDown', 'w');
    await page.waitFor(
      `window.chalkbound.predictor().state.position.z <= ${stopZ}`,
      attempt === 0 ? 8000 : 1500,
      25,
    );
    await page.key('keyUp', 'w');
    await sleep(400);
    await aimAtChalkBox(page, boxId);
    const shown = await page.waitFor(PROMPT_TEXT, 2000, 50);
    if (shown) {
      report?.check(true, 'walked into reach of the chalk box', `"${shown}"`);
      return shown;
    }
  }
  report?.check(false, 'walked into reach of the chalk box', 'the prompt never appeared');
  return '';
}

/** Waits for prediction and the first snapshot, then clicks Resume to take pointer lock. */
export async function startPlaying(page, report) {
  const ready = await page.waitFor(
    '!!(window.chalkbound?.predictor?.() && window.chalkbound.net.authoritativePlayer)',
  );
  report.check(ready, 'client starts: prediction and authority are running');
  if (!ready) throw new Error('client never became ready; is `pnpm dev` running?');

  const button = await page.evaluate(
    `(() => { const r = document.querySelector('.pause-menu__resume').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
  );
  await page.clickAt(button.x, button.y);
  const locked = await page.waitFor(
    'document.pointerLockElement === document.getElementById("game-canvas")',
    2000,
  );
  report.check(locked, 'pointer lock acquired from the pause menu');
  if (!locked) throw new Error('pointer lock not acquired');
}
