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
 *   PUSH LOOP    fixed 1 fps. Ships whatever frame it currently has, always,
 *                without ever awaiting a render. Never blocked by anything.
 *   RENDER LOOP  independent. Replaces the current frame whenever it manages
 *                to capture one. If it stalls, the push loop keeps the panel
 *                alive with the previous frame.
 *
 * A stale frame on the glass is a countdown that is a few seconds behind. A
 * missed push is the vendor logo. Those are not close in cost.
 */

import { start as startServer, setState } from './server.js';
import { Renderer } from './render.js';
import { PanelTransport, KEEPALIVE_INTERVAL_MS } from './transport/hid.js';
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

/* Re-entrancy guards. A tick that runs long must not stack another on top of
 * itself — that turns one slow frame into an unbounded queue of them. */
let rendering = false;
let pushing = false;
let reconnecting = false;

let renderer = null;
let rendererOpen = false;
let paneUrl = null;
let lastReopenAttempt = 0;
let openFailures = 0;
/** How often to retry a renderer that will not open. */
const REOPEN_INTERVAL_MS = 30_000;
let panel = null;
let pushed = 0;
let pushFailures = 0;

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

/**
 * Ship the current frame. This is the loop that must never be blocked, so it
 * does no work beyond the write itself — reconnects are fired off, not awaited.
 */
async function pushTick() {
  if (pushing || !panel || !currentFrame) return;
  pushing = true;
  try {
    const ok = await panel.push(currentFrame);
    if (ok) {
      pushed++;
    } else {
      pushFailures++;
      scheduleReconnect();
    }
  } finally {
    pushing = false;
  }
}

/**
 * Reopen the panel after a failed write. Deliberately not awaited by pushTick:
 * a panel that has physically vanished can take seconds to fail to open, and
 * blocking the push loop on that guarantees the logo on the way back.
 */
function scheduleReconnect() {
  if (reconnecting) return;
  reconnecting = true;
  (async () => {
    await panel.close();
    await new Promise((r) => setTimeout(r, panel.backoffMs));
    const ok = await panel.open();
    if (ok) {
      console.log('[daemon] panel reconnected');
    } else {
      panel.noteReconnectFailure();
      console.warn(`[daemon] panel reconnect failed, next try in ${panel.backoffMs}ms`);
    }
    reconnecting = false;
  })();
}

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
  panel = new PanelTransport();
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
  setInterval(pushTick, KEEPALIVE_INTERVAL_MS);

  console.log(`[daemon] running — render every ${RENDER_INTERVAL_MS}ms, ` +
              `push every ${KEEPALIVE_INTERVAL_MS}ms (independent)`);

  // Heartbeat. Frame age is the number that matters: if it climbs, the renderer
  // is stuck and the panel is showing something increasingly out of date.
  setInterval(() => {
    const age = currentFrame ? Math.round((Date.now() - currentFrameAt) / 1000) : null;
    console.log(`[daemon] pushed=${pushed} failed=${pushFailures} ` +
                `frameAge=${age === null ? 'none' : age + 's'} ` +
                `panel=${panel.healthy ? 'ok' : 'down'} ` +
                `renderer=${renderer.healthy ? 'ok' : 'down'}`);
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
