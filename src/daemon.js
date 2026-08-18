/* daemon.js — the orchestrator.
 *
 *   sources -> state -> server (/api/state) -> renderer screenshots the page
 *   -> transport pushes the JPEG to the panel
 *
 * The cardinal rule (project_goals.md principle 3): NEVER render blank, and
 * NEVER STOP rendering. Every failure path keeps the last good thing it had.
 *
 * ── WHY THERE ARE TWO INDEPENDENT LOOPS ──────────────────────────────────
 * The panel reverts to its boot logo ~3s after the last frame it received
 * (measured — see hid.js IDLE_TIMEOUT_MS and `npm run idle-test`). Holding the
 * USB handle open does not help; only a new frame does.
 *
 * So the obvious shape — one timer that captures a screenshot and then pushes
 * it — is wrong, and was the TODO this file used to carry. It couples the panel
 * staying lit to the renderer being fast. A Chromium hiccup, a font reflow, a
 * GC pause, and the frame arrives late enough that the panel has already given
 * up and shown its vendor logo. The failure looks like flicker and is
 * maddening to diagnose after the fact.
 *
 * Instead:
 *
 *   PUSH LOOP    fixed 1 fps, ON ITS OWN THREAD. Ships whatever frame it
 *                currently has, always, without ever awaiting a render.
 *   RENDER LOOP  here, on the main thread. Replaces the current frame whenever
 *                it manages to capture one. If it stalls, the push loop keeps
 *                the panel alive with the previous frame.
 *
 * A stale frame on the glass is a countdown that is a few seconds behind. A
 * missed push is the vendor logo. Those are not close in cost.
 *
 * ── "NEVER BLOCKED BY ANYTHING" WAS FALSE UNTIL 2026-08-18 ───────────────
 * This comment used to claim the push loop could not be blocked. It could, and
 * on the morning of 2026-08-18 it was — for tens of seconds at a stretch —
 * because `node-hid`'s `write()` is synchronous and `push()` issues ~81 of them
 * in a row. Two setInterval timers on one thread are not two loops; they are
 * one loop taking turns, and a native call that never yields takes every turn.
 *
 * The measurement that settled it: `/api/state`, a cached object served by
 * `node:http`, took **36.6 seconds** to answer. Healthy it is 138ms.
 *
 * The transport therefore lives on a worker thread now (`hid-worker.js`), and
 * it owns the push CADENCE, not just the writes — otherwise a blocked main
 * thread would still stop the panel being fed and nothing would have changed.
 * This file hands frames over and never touches the device.
 *
 * The separation is only worth what its health reporting is worth, which is why
 * `PanelProxy` derives liveness from the worker's silence rather than from a
 * flag. During the failure this daemon cheerfully logged `panel=ok
 * renderer=down` while the truth was precisely inverted.
 */

import { start as startServer, setState } from './server.js';
import { Renderer } from './render.js';
import { KEEPALIVE_INTERVAL_MS } from './transport/hid.js';
import { PanelProxy } from './transport/panel-proxy.js';
import { ApiProvider, collect } from './sources/gcal.js';
import { StateCache } from './cache.js';

const SOURCE_INTERVAL_MS = 60_000;
const FPS = Number(process.env.PERIPHERAL_FPS ?? 1);
const RENDER_INTERVAL_MS = Math.max(250, Math.round(1000 / FPS));

/* Stale after roughly five missed refreshes — long enough to ride out a Wi-Fi
 * blip, short enough that you don't trust a genuinely dead feed. */
const STALE_AFTER_MS = 5 * SOURCE_INTERVAL_MS;

/** Rebuild the browser after this many consecutive capture failures. */
const RENDERER_REOPEN_AFTER = 5;

/** Last successfully-built state. Survives source failures. */
let lastGood = null;
let consecutiveFailures = 0;

const cache = new StateCache();
/** @type {import('./sources/gcal.js').CalendarProvider[]} */
let providers = [];

/** The frame the push loop ships. Never null once the first capture lands. */
let currentFrame = null;
let currentFrameAt = 0;

/* Re-entrancy guard. A tick that runs long must not stack another on top of
 * itself — that turns one slow frame into an unbounded queue of them.
 * The push loop has its own guard, on its own thread. */
let rendering = false;

let renderer = null;
let rendererOpen = false;
let paneUrl = null;
let lastReopenAttempt = 0;
let openFailures = 0;
/** How often to retry a renderer that will not open. */
const REOPEN_INTERVAL_MS = 30_000;
/** @type {PanelProxy} */
let panel = null;

/**
 * Build calendar providers from the environment.
 *
 *   PERIPHERAL_ACCOUNTS=work            comma-separated store keys
 *   PERIPHERAL_CALENDARS_WORK=          empty -> discover every visible calendar
 *   PERIPHERAL_CALENDARS_WORK=a@b.com=work,c@d.com=personal
 *   PERIPHERAL_CALENDARS_WORK=a@b.com   bare id -> labelled with the account
 *
 * Returns an empty array rather than throwing when there is no OAuth client
 * yet. That is the current state of the project and it is not an error: the
 * daemon must still come up, serve the pane, and push frames, because the
 * browser fallback and the transport are what work today.
 */
function buildProviders() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.warn('[daemon] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — '
      + 'no calendar source. The pane will show its mock agenda. See .env.example.');
    return [];
  }

  const accounts = (process.env.PERIPHERAL_ACCOUNTS ?? 'work')
    .split(',').map((s) => s.trim()).filter(Boolean);

  return accounts.map((account) => {
    const raw = process.env[`PERIPHERAL_CALENDARS_${account.toUpperCase()}`] ?? '';
    const calendars = {};
    for (const entry of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
      // Split on the LAST '=': calendar ids are email addresses and opaque
      // strings, neither of which contains '=', but the label never does either
      // and lastIndexOf is the safer read.
      const i = entry.lastIndexOf('=');
      if (i === -1) calendars[entry] = account;
      else calendars[entry.slice(0, i).trim()] = entry.slice(i + 1).trim();
    }
    const n = Object.keys(calendars).length;
    console.log(`[daemon] source: gcal:${account} — `
      + (n ? `${n} configured calendar(s)` : 'all visible calendars (discovered at first fetch)'));
    return new ApiProvider({ account, calendars });
  });
}

async function refreshState() {
  try {
    const state = await collect(providers);
    lastGood = state;
    consecutiveFailures = 0;
    setState(state);
    // Fire and forget — the cache must never be in the path of a render.
    void cache.save(state);
  } catch (err) {
    consecutiveFailures++;
    if (lastGood) {
      const age = Date.now() - new Date(lastGood.generatedAt).getTime();
      // `lastGood.stale ||` matters at boot: a state restored from disk is
      // already flagged stale and must stay flagged even while it is young,
      // because no fetch has confirmed it in this process. Age alone would
      // clear the badge on a two-minute-old cache and quietly assert that
      // yesterday's leftovers are live.
      setState({ ...lastGood, stale: lastGood.stale || age > STALE_AFTER_MS });
      console.warn(`[daemon] source failed (${consecutiveFailures}), serving last good`,
                   `(${Math.round(age / 1000)}s old):`, err.message);
    } else {
      // No state at all — leave /api/state on 503 so the pane shows mock data
      // rather than an empty agenda that looks like a genuinely free day.
      // Once a minute forever is noise when the cause is "no OAuth client yet",
      // which is a standing condition rather than an event.
      if (consecutiveFailures === 1 || consecutiveFailures % 10 === 0) {
        console.warn(`[daemon] no state yet (${consecutiveFailures}):`, err.message);
      }
    }
  }
}

/**
 * Open the renderer. Never throws — a browser that will not start is a reason
 * to keep trying, not a reason to take down a daemon whose transport is
 * working. Returns whether it is now open.
 */
async function openRenderer(url) {
  paneUrl = url;
  try {
    await renderer.open(url);
    rendererOpen = true;
    console.log(openFailures
      ? `[daemon] renderer ready (recovered after ${openFailures} failed attempt(s))`
      : '[daemon] renderer ready');
    openFailures = 0;
  } catch (err) {
    rendererOpen = false;
    openFailures++;
    // The first failure carries the remedy in full; after that a one-liner,
    // with the detail back every 20th (10 min). A permanently broken install
    // retries forever, and two paragraphs every 30s would bury the heartbeat
    // — which is the line you actually need when diagnosing this later.
    const first = err.message.split('\n')[0];
    if (openFailures === 1 || openFailures % 20 === 0) {
      console.error(`[daemon] renderer failed to open (${openFailures}): ${first}`);
      console.error('[daemon] retrying every 30s. If this persists, run '
        + '`npx playwright install chromium` with PLAYWRIGHT_BROWSERS_PATH set (see .env.example).');
    } else {
      console.error(`[daemon] renderer still not open (${openFailures})`);
    }
  }
  return rendererOpen;
}

/** Capture a frame. Never throws; a failed capture just leaves the old frame. */
async function renderTick() {
  if (rendering || !renderer) return;

  // Not open yet — retry on a slow cadence rather than every render tick, so a
  // missing Chromium doesn't spawn a launch attempt once a second forever.
  if (!rendererOpen) {
    if (Date.now() - lastReopenAttempt < REOPEN_INTERVAL_MS) return;
    lastReopenAttempt = Date.now();
    rendering = true;
    try { await openRenderer(paneUrl); } finally { rendering = false; }
    return;
  }

  rendering = true;
  try {
    const jpeg = await renderer.capture();
    if (jpeg) {
      currentFrame = jpeg;
      currentFrameAt = Date.now();
      // Hand it to the transport thread. Returns immediately; the worker
      // re-pushes this frame on its own cadence until a newer one arrives.
      panel?.setFrame(jpeg);
    } else if (renderer.consecutiveFailures >= RENDERER_REOPEN_AFTER) {
      console.warn(`[daemon] renderer failed ${renderer.consecutiveFailures}x — rebuilding`);
      try {
        await renderer.reopen();
      } catch (err) {
        // Drop back to the open-retry path rather than hammering reopen() from
        // inside the capture branch, which we only reach on a *successful* tick.
        rendererOpen = false;
        lastReopenAttempt = Date.now();
        console.error(`[daemon] renderer rebuild failed: ${err.message.split('\n')[0]}`);
      }
    }
  } finally {
    rendering = false;
  }
}

/* The push loop and its reconnect backoff used to live here. They are now on
 * the transport thread — see `hid-worker.js`. They were moved rather than
 * rewritten: the logic was correct, and the reconnect backoff in particular did
 * its job perfectly during the 2026-08-18 replug (two failed attempts at 2s and
 * 4s, then a clean reopen). What was wrong was the thread it ran on. */

async function main() {
  const { url } = await startServer();
  const paneUrl = `${url}/panes/agenda/`;
  console.log(`[daemon] pane:  ${paneUrl}`);

  providers = buildProviders();

  /* Restore before the first fetch, not after. At logon the network is often
   * still negotiating, so the first refresh is the one most likely to fail —
   * and that is precisely the moment the panel is being looked at. Without
   * this the first frame is an empty agenda, which reads as "free day". */
  const cached = await cache.load();
  if (cached) {
    lastGood = cached;
    setState(cached);
  }

  await refreshState();
  setInterval(refreshState, SOURCE_INTERVAL_MS);

  // Transport first: if the panel is absent we still want the browser fallback
  // running, so this is a warning rather than a fatal error.
  panel = new PanelProxy();
  if (!(await panel.open())) {
    console.warn(`[daemon] panel unavailable: ${panel.lastError?.message}`);
    console.warn('[daemon] continuing — the pane URL above is the fallback');
  }

  /* The renderer gets the same treatment as the panel: a failure to open is a
   * warning, not a fatal error, and the render loop keeps retrying.
   *
   * This used to `await renderer.open()` bare, and the consequence was worse
   * than a crash. The daemon has an open HTTP server and live intervals, so
   * setting `process.exitCode` does not end the process — Node has work left
   * and stays up. The result was a ZOMBIE: `[daemon] fatal` in the log, the
   * scheduled task reporting result 0, a live node.exe serving the pane, and
   * the panel on its vendor logo indefinitely with nothing retrying.
   *
   * Found by running the logon task rather than by reading the code, because
   * the trigger was an environment difference — the task has no `.env`, so
   * PLAYWRIGHT_BROWSERS_PATH was unset and Chromium was not where Playwright
   * looked. Exactly the class of thing that only shows up at logon. */
  renderer = new Renderer();
  await openRenderer(paneUrl);

  // Capture once before starting the push loop so the first push has something
  // real to ship, rather than leaving the panel on its logo for a whole tick.
  await renderTick();

  setInterval(renderTick, RENDER_INTERVAL_MS);

  console.log(`[daemon] running — render every ${RENDER_INTERVAL_MS}ms on this ` +
              `thread, push every ${KEEPALIVE_INTERVAL_MS}ms on the transport ` +
              `thread (genuinely independent)`);

  /* Heartbeat.
   *
   * `loopLag` is here because on 2026-08-18 every other number on this line
   * was reassuring while the daemon was wedged. It measures how late a 1000ms
   * timer actually fired, which is the one figure that cannot be faked by a
   * stale flag: if the main thread is blocked, the lag is the block. Anything
   * above a few tens of ms means this thread is not keeping up.
   *
   * `panel` now reports `STALLED <n>s` as a distinct state from `down`, because
   * the failure that ran unremarked for fifteen minutes was neither ok nor
   * down — it was a component that had stopped answering, which had no name. */
  let lagMark = Date.now();
  setInterval(() => { lagMark = Date.now(); }, 1000);

  setInterval(() => {
    const age = currentFrame ? Math.round((Date.now() - currentFrameAt) / 1000) : null;
    const lag = Math.max(0, Date.now() - lagMark - 1000);
    /* worstPush, not lastPush. A single sample misses the push that matters:
     * measured, the worker completed a 4012ms push and a 4ms push before this
     * thread got a turn, and `lastPushMs` read 4ms. Drained each interval so
     * the number always describes THIS window. */
    const { pushMs: worstPush, slowRun } = panel.drainPeaks();
    console.log(`[daemon] pushed=${panel.pushed} failed=${panel.failures} ` +
                `frameAge=${age === null ? 'none' : age + 's'} ` +
                `worstPush=${worstPush}ms loopLag=${lag}ms ` +
                `${slowRun ? `slowRun=${slowRun} ` : ''}` +
                `panel=${panel.state} ` +
                `renderer=${renderer.healthy ? 'ok' : 'down'}` +
                `${panel.respawns ? ` respawns=${panel.respawns}` : ''}`);
  }, 30_000);
}

let shuttingDown = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[daemon] ${sig} — shutting down`);
    // Close the browser explicitly; an orphaned Chromium survives the parent.
    try { await renderer?.close(); } catch { /* best effort */ }
    try { await panel?.close(); } catch { /* best effort */ }
    process.exit(0);
  });
}

main().catch(async (err) => {
  console.error('[daemon] fatal:', err);
  // `process.exitCode = 1` is NOT enough here, and quietly wasn't. By the time
  // main() can throw, the HTTP server is listening and intervals are armed, so
  // Node still has work and keeps running — leaving a process that has logged
  // "fatal", pushes nothing, and reports success to the scheduler. A daemon
  // that is dead must LOOK dead, so the task's restart-on-failure can fire and
  // so `npm run startup:status` tells the truth.
  try { await renderer?.close(); } catch { /* best effort */ }
  try { await panel?.close(); } catch { /* best effort */ }
  process.exit(1);
});
