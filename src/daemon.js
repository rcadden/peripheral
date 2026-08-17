/* daemon.js — the orchestrator.
 *
 * Loop:
 *   sources -> state -> server (/api/state) -> renderer screenshots the page
 *   -> transport pushes the JPEG to the panel
 *
 * Currently wires up only what exists: the server. Calendar, renderer and
 * transport are stubs, so `npm start` today gives you a working localhost pane
 * on mock data and an honest report of what's missing.
 *
 * The cardinal rule (see directives/project_goals.md, principle 3): NEVER
 * render blank. Every failure path keeps the last good state and flags stale.
 */

import { start as startServer, setState } from './server.js';

const SOURCE_INTERVAL_MS = 60_000;
const FPS = Number(process.env.PERIPHERAL_FPS ?? 1);

/** Last successfully-built state. Survives source failures. */
let lastGood = null;
let consecutiveFailures = 0;

/* Stale after roughly five missed refreshes — long enough to ride out a Wi-Fi
 * blip, short enough that you don't trust a genuinely dead feed. */
const STALE_AFTER_MS = 5 * SOURCE_INTERVAL_MS;

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

async function main() {
  const { url } = await startServer();
  console.log(`[daemon] pane:  ${url}/panes/agenda/`);

  await refreshState();
  setInterval(refreshState, SOURCE_INTERVAL_MS);

  // TODO: renderer + transport once hardware is here.
  //   const renderer = new Renderer(); await renderer.open(`${url}/panes/agenda/`);
  //   const panel = new PanelTransport(); await panel.open();
  //   setInterval(async () => {
  //     const jpeg = await renderer.capture();
  //     await panel.push(jpeg);   // returns false on a failed write; do not throw
  //   }, 1000 / FPS);
  console.log(`[daemon] renderer + transport not implemented — panel push disabled (would be ${FPS} fps)`);
  console.log('[daemon] open the URL above in a browser; it falls back to mock events');
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n[daemon] ${sig} — shutting down`);
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[daemon] fatal:', err);
  process.exitCode = 1;
});
