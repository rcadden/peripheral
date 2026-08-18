/* hid-worker.js — the push loop, on its own thread.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────
 * `daemon.js` documents two independent loops: a push loop that "can never be
 * blocked by anything" and a render loop that may stall freely. That was true
 * of the JavaScript and false of the process, because of one detail:
 *
 *     node-hid's device.write() is SYNCHRONOUS.
 *
 * `PanelTransport.push()` issues ~81 of them in a bare `for` loop. Nothing in
 * there yields, so while a frame is going out the thread belongs to the driver.
 * When the USB endpoint stops draining — which it did on the morning of
 * 2026-08-18, after a cold boot — each write blocks in the kernel and the whole
 * batch pins the process for tens of seconds.
 *
 * What that looked like, measured rather than inferred:
 *
 *   /api/state (a cached object, node:http)   36.6 s      healthy: 138 ms
 *   push rate                                 ~1 / 30 s   target:  30 / 30 s
 *   process CPU                               near-idle   (blocked, not busy)
 *
 * At one frame per 30s against a ~3s forget window, the panel showed its vendor
 * logo about 90% of the time. Everything else on the thread went down with it:
 * the HTTP server, the calendar refresh, and — most misleadingly — Playwright's
 * screenshot timeouts, which fired on the blocked loop and got a perfectly
 * healthy Chromium torn down for a fault that was never its own.
 *
 * Two timers do not make two loops. Concurrency in Node comes from yielding,
 * and a synchronous native call yields nothing. So the transport moves here,
 * where a blocking write costs one thread instead of the process.
 *
 * ── WHAT THIS THREAD OWNS ────────────────────────────────────────────────
 * The push cadence itself, not just the writes. The main thread sends a frame
 * only when the renderer produces a NEW one (~1/s); this thread re-pushes
 * whatever it last received, forever, on its own timer.
 *
 * That is deliberate and it is the whole point. If the push interval lived on
 * the main thread, a blocked main thread would still stop the panel being fed —
 * we would have moved the writes and kept the coupling. The panel must stay lit
 * while the rest of the daemon is wedged, or this change bought nothing.
 *
 * ── WHAT IT DOES NOT SOLVE ───────────────────────────────────────────────
 * A write blocked in the driver still blocks THIS thread, and `worker.terminate()`
 * is not guaranteed to interrupt a native call that never returns. What changes
 * is that the condition becomes observable and survivable: the main thread stays
 * responsive, notices the silence, and can say so out loud. Recovery from a
 * truly wedged endpoint may still need a replug. See the failure log in
 * CHANGELOG.md.
 */

import { parentPort, workerData } from 'node:worker_threads';
import { PanelTransport, KEEPALIVE_INTERVAL_MS, IDLE_TIMEOUT_MS } from './hid.js';

/**
 * A push slower than this means the endpoint is not draining properly. It is
 * deliberately the panel's own forget window: a push that takes longer than the
 * time the panel will wait has already failed at its job, whatever the driver
 * eventually reports back.
 */
const SLOW_PUSH_MS = IDLE_TIMEOUT_MS;

/**
 * Consecutive slow pushes before the device is dropped and reopened. Reopening
 * is what cleared comparable states in the old main-thread code, and it costs a
 * frame or two. One slow push is a hiccup; three is a condition.
 */
const SLOW_PUSH_LIMIT = Number(process.env.PERIPHERAL_SLOW_PUSH_LIMIT ?? 3);

/* ── Fault injection, for `npm run stall-test` ────────────────────────────
 * Off unless the env vars are set, and they never are in normal operation.
 *
 * This exists because the recovery paths in this file — slow-push detection,
 * reopen, and the proxy's stall alarm and respawn — cannot be exercised on
 * demand any other way. A wedged USB endpoint is not something you can
 * reproduce by asking; the real one arrived once, unannounced, after a cold
 * boot. Without this, every recovery branch would ship as code that had never
 * executed, which is the "written but unverified" tier this project keeps
 * having to admit to.
 *
 * `Atomics.wait` is the right primitive: it blocks the thread synchronously
 * and uninterruptibly, which is precisely what node-hid's write() does when
 * the driver stops draining. A setTimeout would prove nothing — it yields.
 */
const DEBUG_BLOCK_AFTER = Number(process.env.PERIPHERAL_DEBUG_BLOCK_AFTER ?? 0);
const DEBUG_BLOCK_MS = Number(process.env.PERIPHERAL_DEBUG_BLOCK_MS ?? 0);
const DEBUG_OPEN_HANG_MS = Number(process.env.PERIPHERAL_DEBUG_OPEN_HANG_MS ?? 0);

/** Block this thread for real — the same shape as a stuck native call. */
function blockThread(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const panel = new PanelTransport();

/** The most recent frame from the renderer. Pushed repeatedly until replaced. */
let frame = null;
let frameSeq = 0;

let pushed = 0;
let failures = 0;
let slowRun = 0;
let pushing = false;
let reconnecting = false;
let stopped = false;
let lastPushMs = 0;

const post = (msg) => parentPort.postMessage(msg);
const log = (level, message) => post({ type: 'log', level, message });

/**
 * Report to the main thread. Sent after every push attempt, not on a timer of
 * its own — the main thread measures the GAPS between these to detect a stall,
 * so a status message must mean "this thread just completed a push", never
 * "this thread is scheduled to be alive".
 */
function reportStatus() {
  post({
    type: 'status',
    pushed,
    failures,
    healthy: panel.healthy,
    lastPushMs,
    slowRun,
    hasFrame: frame !== null,
    frameSeq,
    ts: Date.now(),
  });
}

async function openPanel() {
  if (DEBUG_OPEN_HANG_MS) blockThread(DEBUG_OPEN_HANG_MS);
  const ok = await panel.open();
  if (ok) {
    post({ type: 'ready', info: panel.info ?? null });
  } else {
    post({ type: 'open-failed', message: panel.lastError?.message ?? 'unknown' });
  }
  return ok;
}

/**
 * Drop and reopen the device on a backoff. Not awaited by the push loop: an
 * absent panel can take seconds to fail to open, and the push timer must keep
 * firing so recovery is immediate once the device returns.
 */
function scheduleReconnect() {
  if (reconnecting || stopped) return;
  reconnecting = true;
  (async () => {
    await panel.close();
    await new Promise((r) => setTimeout(r, panel.backoffMs));
    if (stopped) { reconnecting = false; return; }
    if (await panel.open()) {
      slowRun = 0;
      log('info', 'panel reconnected');
      post({ type: 'ready', info: panel.info ?? null });
    } else {
      panel.noteReconnectFailure();
      log('warn', `panel reconnect failed, next try in ${panel.backoffMs}ms`);
    }
    reconnecting = false;
  })();
}

async function pushTick() {
  if (stopped || pushing || !frame) return;
  if (!panel.healthy) { scheduleReconnect(); return; }

  pushing = true;
  const started = Date.now();
  try {
    const ok = await panel.push(frame);
    /* Fault injection: stall INSIDE the push, exactly where a real one happens.
     * One-shot (`===`, not `>=`) so a transient hiccup and a sustained wedge
     * are separately expressible — duration is what distinguishes them, and a
     * fault that repeats forever cannot show that recovery works. */
    if (DEBUG_BLOCK_MS && pushed + 1 === DEBUG_BLOCK_AFTER) blockThread(DEBUG_BLOCK_MS);
    lastPushMs = Date.now() - started;

    if (ok) {
      pushed++;
      /* A push that outran the panel's forget window did not do its job even
       * though the driver returned success. Track it as its own condition —
       * this is the exact signal that was invisible before, when a slow write
       * and a fast one were indistinguishable in the log. */
      if (lastPushMs >= SLOW_PUSH_MS) {
        slowRun++;
        log('warn',
          `push took ${lastPushMs}ms (>= ${SLOW_PUSH_MS}ms forget window) ` +
          `— endpoint not draining, ${slowRun}/${SLOW_PUSH_LIMIT}`);
        if (slowRun >= SLOW_PUSH_LIMIT) {
          log('error', 'endpoint stalled repeatedly — dropping the handle and reopening');
          slowRun = 0;
          scheduleReconnect();
        }
      } else {
        slowRun = 0;
      }
    } else {
      failures++;
      scheduleReconnect();
    }
  } catch (err) {
    // push() is documented never to throw; if that ever changes, a dead push
    // loop must not be the way we find out.
    failures++;
    lastPushMs = Date.now() - started;
    log('error', `push threw (should be impossible): ${err.message}`);
    scheduleReconnect();
  } finally {
    pushing = false;
    reportStatus();
  }
}

parentPort.on('message', (msg) => {
  if (msg?.type === 'frame') {
    // Structured clone hands us a Uint8Array; the wire code wants a Buffer.
    // Buffer.from(view.buffer, ...) wraps without copying again.
    frame = Buffer.from(msg.jpeg.buffer, msg.jpeg.byteOffset, msg.jpeg.byteLength);
    frameSeq = msg.seq;
  } else if (msg?.type === 'close') {
    stopped = true;
    void panel.close().then(() => post({ type: 'closed' }));
  }
});

const interval = Number(workerData?.intervalMs ?? KEEPALIVE_INTERVAL_MS);

await openPanel();
setInterval(pushTick, interval);

/* A heartbeat for the case the push loop has nothing to do. Without it, "no
 * frame yet" and "thread wedged" would look identical from the main thread —
 * silence in both cases — and the stall detector would cry wolf at boot. */
setInterval(() => { if (!pushing) reportStatus(); }, interval * 2);
