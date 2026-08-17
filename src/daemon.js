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

/** The frame the push loop ships. Never null once the first capture lands. */
let currentFrame = null;
let currentFrameAt = 0;

/* Re-entrancy guards. A tick that runs long must not stack another on top of
 * itself — that turns one slow frame into an unbounded queue of them. */
let rendering = false;
let pushing = false;
let reconnecting = false;

let renderer = null;
let panel = null;
let pushed = 0;
let pushFailures = 0;

async function refreshState() {
  try {
    // TODO: const providers = buildProviders(); const state = await collect(providers);
    throw new Error('no calendar provider configured yet (see CLAUDE.md § work calendar)');
  } catch (err) {
    consecutiveFailures++;
    if (lastGood) {
      const age = Date.now() - new Date(lastGood.generatedAt).getTime();
      setState({ ...lastGood, stale: age > STALE_AFTER_MS });
      console.warn(`[daemon] source failed (${consecutiveFailures}), serving last good`,
                   `(${Math.round(age / 1000)}s old):`, err.message);
    } else {
      // No state at all — leave /api/state on 503 so the pane shows mock data
      // rather than an empty agenda that looks like a genuinely free day.
      console.warn('[daemon] no state yet:', err.message);
    }
  }
}

/** Capture a frame. Never throws; a failed capture just leaves the old frame. */
async function renderTick() {
  if (rendering || !renderer) return;
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
        console.error(`[daemon] renderer rebuild failed: ${err.message}`);
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

  await refreshState();
  setInterval(refreshState, SOURCE_INTERVAL_MS);

  // Transport first: if the panel is absent we still want the browser fallback
  // running, so this is a warning rather than a fatal error.
  panel = new PanelTransport();
  if (!(await panel.open())) {
    console.warn(`[daemon] panel unavailable: ${panel.lastError?.message}`);
    console.warn('[daemon] continuing — the pane URL above is the fallback');
  }

  renderer = new Renderer();
  await renderer.open(paneUrl);
  console.log('[daemon] renderer ready');

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

main().catch((err) => {
  console.error('[daemon] fatal:', err);
  process.exitCode = 1;
});
