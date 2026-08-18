/* panel-proxy.js — the main thread's handle on the transport worker.
 *
 * Presents roughly the surface `PanelTransport` had, so `daemon.js` reads the
 * same, but nothing here ever touches node-hid. The device lives on the worker
 * thread (see hid-worker.js for why).
 *
 * ── THIS FILE'S REAL JOB IS HONEST HEALTH ────────────────────────────────
 * On 2026-08-18 the daemon spent fifteen minutes reporting
 *
 *     panel=ok renderer=down
 *
 * while the truth was the exact inverse: the panel's transport had wedged the
 * process and Chromium was fine. Both flags were reporting the last thing they
 * had been told rather than anything currently true, and there was no signal
 * anywhere for "this component has stopped responding" — the one condition that
 * actually obtained.
 *
 * So health here is derived from SILENCE, not from a flag. The worker posts a
 * status after every push attempt; if those stop arriving, the transport is
 * stalled, and we can say so — which we could not before, because the thread
 * that would have noticed was the thread that was blocked.
 *
 * This is the standing rule in CLAUDE.md ("a dead daemon must LOOK dead") one
 * layer down: a stalled component must look stalled, and must not be
 * indistinguishable from a working one.
 */

import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { KEEPALIVE_INTERVAL_MS } from './hid.js';

const WORKER_URL = new URL('./hid-worker.js', import.meta.url);

/**
 * No status message for this long means the worker thread is not coming back
 * around its own loop — it is blocked inside a native write. Three push
 * intervals: long enough that a single slow frame is not an alarm, short enough
 * that it fires well before a human notices the panel sitting on its logo.
 */
const STALL_AFTER_MS = Number(
  process.env.PERIPHERAL_STALL_AFTER_MS ?? KEEPALIVE_INTERVAL_MS * 3);

/**
 * A worker silent this long is not stalled, it is gone. Respawning is a last
 * resort and is logged loudly.
 *
 * HONEST CAVEAT: `worker.terminate()` is not guaranteed to interrupt a native
 * call that never returns, so this can leave an orphaned thread blocked in the
 * driver. It is still worth attempting — a fresh worker that reopens the device
 * is the only in-process recovery available, and the alternative is a panel
 * that stays dark until someone replugs it.
 */
const RESPAWN_AFTER_MS = Number(process.env.PERIPHERAL_RESPAWN_AFTER_MS ?? 60_000);

/**
 * How long `open()` waits before letting the daemon get on with its life.
 * Generous against a normal open (enumeration plus a 1s handshake read) and
 * still far short of a user noticing the panel is dark.
 */
const OPEN_TIMEOUT_MS = Number(process.env.PERIPHERAL_OPEN_TIMEOUT_MS ?? 10_000);

/* ── The stall decision, as pure functions ────────────────────────────────
 * Extracted for the same reason `focus.js` was: logic that `test/` cannot reach
 * is logic that gets to be wrong twice before anyone notices. This is the part
 * that was missing entirely on 2026-08-18 — there was no code anywhere that
 * could conclude "this component has stopped answering" — so it is exactly the
 * part that must be covered rather than eyeballed.
 *
 * No clock of its own: `now` is always passed in, which is what makes the real
 * timings reproducible as tests instead of sleeps.
 */

/**
 * How long the transport has been silent, and what that means.
 *
 * `startedAt` is the fallback for a worker that has never reported at all —
 * without it, a freshly spawned worker would read as infinitely silent and trip
 * the alarm at boot, which is the classic way a stall detector gets switched
 * off for crying wolf.
 *
 * ── WHY `mainLagMs` EXISTS ───────────────────────────────────────────────
 * The first version of this function did not have it, and it cried wolf on its
 * very first real run: `TRANSPORT STALLED — no push completed for 3s`, logged
 * while the worker was pushing perfectly, because the MAIN thread was busy
 * launching Chromium and had not drained the worker's messages yet.
 *
 * Worker status messages are processed on the main thread's event loop. When
 * that loop is blocked, they queue. So elapsed time since the last message we
 * *handled* conflates two very different things:
 *
 *     the worker stopped sending          <- a real stall
 *     we stopped listening                <- not the worker's fault at all
 *
 * Time during which this thread was not running cannot be held against the
 * worker, so it is subtracted. `mainLagMs` is how late our own watchdog timer
 * fired, which is a direct measure of how long we were not listening.
 *
 * This is the same trap that made the original incident so hard to read — five
 * `page.screenshot` timeouts got a healthy Chromium torn down, because a
 * timeout measured on a blocked loop is evidence about the waiter, not the
 * awaited. It is worth noting that the detector written *in response* to that
 * incident reproduced the bug on its first run. The class is easy to re-enter.
 *
 * @param {{lastStatusAt: number, startedAt: number, now: number,
 *          mainLagMs?: number, stallAfterMs?: number, respawnAfterMs?: number}} o
 */
export function stallState({
  lastStatusAt, startedAt, now, mainLagMs = 0,
  stallAfterMs = STALL_AFTER_MS, respawnAfterMs = RESPAWN_AFTER_MS,
}) {
  const since = lastStatusAt || startedAt;
  const silentFor = since ? Math.max(0, now - since) : 0;
  /* Silence we can actually attribute to the worker: wall-clock silence minus
   * the stretch we spent not listening. */
  const attributable = Math.max(0, silentFor - Math.max(0, mainLagMs));
  return {
    silentFor,
    attributable,
    stalled: attributable > stallAfterMs,
    shouldRespawn: attributable > respawnAfterMs,
  };
}

/**
 * The heartbeat's one-word verdict.
 *
 * The three states below used to collapse into two, and the missing one was the
 * one actually happening: on 2026-08-18 the daemon logged `panel=ok` for fifteen
 * minutes while the transport was wedged, because `healthy` reported the last
 * thing the device had been observed to be rather than anything current.
 * "Stalled" is a claim about the CHANNEL, not the device, and it outranks
 * whatever the device last said about itself.
 *
 * @param {{closed: boolean, hasWorker: boolean, healthy: boolean, silentFor: number,
 *          stalled: boolean}} o
 */
export function describeState({ closed, hasWorker, healthy, silentFor, stalled }) {
  if (closed || !hasWorker) return 'closed';
  if (stalled) return `STALLED ${Math.round(silentFor / 1000)}s`;
  return healthy ? 'ok' : 'down';
}

export class PanelProxy {
  #worker = null;
  #seq = 0;
  #lastStatusAt = 0;
  #startedAt = 0;
  #respawns = 0;
  #closed = false;

  /** Mirror of the worker's last report. Never assumed current — see #stalled. */
  #status = {
    pushed: 0, failures: 0, healthy: false,
    lastPushMs: 0, slowRun: 0, hasFrame: false, frameSeq: 0,
  };

  #info = null;
  #lastError = null;
  #onReady = null;
  #watchdog = null;
  #stallAnnounced = false;
  #peakPushMs = 0;
  #peakSlowRun = 0;
  /** When the watchdog last fired, for measuring how late the next one is. */
  #lastWatchdogAt = 0;
  /** How long this thread was demonstrably not listening. See stallState(). */
  #mainLagMs = 0;

  get info() { return this.#info; }
  get lastError() { return this.#lastError; }
  get pushed() { return this.#status.pushed; }
  get failures() { return this.#status.failures; }
  get lastPushMs() { return this.#status.lastPushMs; }
  get respawns() { return this.#respawns; }
  /** Consecutive pushes that outran the panel's forget window. */
  get slowRun() { return this.#status.slowRun ?? 0; }

  /* ── Peaks, held since the last reset ────────────────────────────────────
   * `lastPushMs` is a single sample and is worse than useless for the failure
   * this whole file exists for. Measured: the worker completed a 4012ms push
   * and reported it, then completed a 4ms push and reported that too — both
   * before any main-thread timer got a turn. A poller reading `lastPushMs`
   * saw 4ms. The one push that mattered was invisible.
   *
   * So the peak is recorded as messages ARRIVE, which is the only place that
   * sees every report, and the heartbeat drains it each interval. A slow push
   * can now never be swallowed by a faster one landing behind it. */
  get peakPushMs() { return this.#peakPushMs; }
  get peakSlowRun() { return this.#peakSlowRun; }

  /** Read-and-clear, for the heartbeat: reports the worst push in its window. */
  drainPeaks() {
    const peaks = { pushMs: this.#peakPushMs, slowRun: this.#peakSlowRun };
    this.#peakPushMs = 0;
    this.#peakSlowRun = 0;
    return peaks;
  }

  /** The live stall reading. One place, so the getters cannot disagree. */
  #stall(now = Date.now()) {
    return stallState({
      lastStatusAt: this.#lastStatusAt, startedAt: this.#startedAt, now,
      mainLagMs: this.#mainLagMs,
    });
  }

  /** ms since the worker last completed a push cycle. */
  get silentFor() { return this.#stall().silentFor; }

  /**
   * True when the worker has gone quiet past the stall threshold. This is the
   * signal that did not exist before and is the reason the failure ran for
   * fifteen minutes unremarked.
   */
  get stalled() {
    if (this.#closed || !this.#worker) return false;
    return this.#stall().stalled;
  }

  /** Healthy means the device is open AND the thread is still turning over. */
  get healthy() { return this.#status.healthy && !this.stalled; }

  /** One word for the heartbeat. See describeState(). */
  get state() {
    return describeState({
      closed: this.#closed,
      hasWorker: this.#worker !== null,
      healthy: this.#status.healthy,
      silentFor: this.silentFor,
      stalled: this.stalled,
    });
  }

  /**
   * Spawn the worker and wait for its first open attempt to resolve.
   *
   * Bounded, and that matters more than it looks. Device enumeration and the
   * handshake both happen on the worker thread and both can block: `HID.devices()`
   * walks the USB tree, and `readTimeout()` is a synchronous read. If either
   * hangs, an unbounded await here would stop `main()` before it ever reaches
   * the renderer — the transport taking down the daemon, which is the precise
   * failure this whole redesign exists to prevent.
   *
   * A timeout is not a failure: the worker keeps trying on its own backoff, and
   * a later `ready` still flips the state to healthy. We simply stop waiting.
   *
   * @returns {Promise<boolean>} whether the panel opened before the deadline
   */
  open() {
    this.#spawn();
    return new Promise((resolve) => {
      this.#onReady = resolve;
      const t = setTimeout(() => {
        if (!this.#onReady) return;
        this.#lastError = new Error(
          `transport did not open within ${OPEN_TIMEOUT_MS}ms — continuing without it`);
        this.#settle(false);
      }, OPEN_TIMEOUT_MS);
      t.unref?.();
    });
  }

  #spawn() {
    this.#startedAt = Date.now();
    this.#lastStatusAt = 0;

    this.#worker = new Worker(fileURLToPath(WORKER_URL), {
      workerData: { intervalMs: KEEPALIVE_INTERVAL_MS },
    });

    this.#worker.on('message', (msg) => this.#onMessage(msg));

    this.#worker.on('error', (err) => {
      this.#lastError = err;
      this.#status.healthy = false;
      console.error(`[panel] worker error: ${err.message}`);
      this.#settle(false);
    });

    this.#worker.on('exit', (code) => {
      this.#status.healthy = false;
      if (!this.#closed) {
        console.error(`[panel] worker exited unexpectedly (code ${code})`);
        this.#settle(false);
      }
    });

    // Unref'd: a wedged transport must never be the reason the process cannot
    // exit. The daemon's own intervals keep it alive.
    this.#lastWatchdogAt = this.#startedAt;
    this.#mainLagMs = 0;
    this.#watchdog = setInterval(() => this.#checkStall(), KEEPALIVE_INTERVAL_MS);
    this.#watchdog.unref?.();
  }

  #checkStall() {
    const now = Date.now();
    /* How late this timer fired is how long the main thread was blocked, and
     * therefore how much of the worker's apparent silence is our own fault. */
    this.#mainLagMs = Math.max(0, now - this.#lastWatchdogAt - KEEPALIVE_INTERVAL_MS);
    this.#lastWatchdogAt = now;

    if (this.#closed || !this.#worker) return;
    const { silentFor, stalled, shouldRespawn } = this.#stall(now);

    if (stalled && !this.#stallAnnounced) {
      this.#stallAnnounced = true;
      console.error(
        `[panel] TRANSPORT STALLED — no push completed for ` +
        `${Math.round(silentFor / 1000)}s. The worker thread is blocked ` +
        `inside a native HID write; the panel is on its vendor logo.`);
    }

    if (shouldRespawn) {
      console.error(
        `[panel] worker silent ${Math.round(this.silentFor / 1000)}s — respawning. ` +
        `If this repeats, the USB-C cable is the first thing to replace.`);
      this.#respawns++;
      const dead = this.#worker;
      this.#worker = null;
      clearInterval(this.#watchdog);
      dead.terminate().catch(() => { /* may not interrupt a blocked native call */ });
      this.#stallAnnounced = false;
      this.#spawn();
    }
  }

  #onMessage(msg) {
    switch (msg?.type) {
      case 'status':
        this.#status = msg;
        this.#lastStatusAt = msg.ts;
        // Before anything can overwrite it — see the note on peakPushMs.
        this.#peakPushMs = Math.max(this.#peakPushMs, msg.lastPushMs ?? 0);
        this.#peakSlowRun = Math.max(this.#peakSlowRun, msg.slowRun ?? 0);
        if (this.#stallAnnounced) {
          this.#stallAnnounced = false;
          console.log('[panel] transport recovered — pushes completing again');
        }
        break;
      case 'ready':
        this.#info = msg.info;
        this.#lastError = null;
        this.#status.healthy = true;
        this.#lastStatusAt = Date.now();
        this.#settle(true);
        break;
      case 'open-failed':
        this.#lastError = new Error(msg.message);
        this.#status.healthy = false;
        this.#lastStatusAt = Date.now();
        this.#settle(false);
        break;
      case 'log': {
        const fn = msg.level === 'error' ? console.error
          : msg.level === 'warn' ? console.warn : console.log;
        fn(`[hid] ${msg.message}`);
        break;
      }
      default:
        break;
    }
  }

  #settle(ok) {
    if (this.#onReady) { const r = this.#onReady; this.#onReady = null; r(ok); }
  }

  /**
   * Hand the worker a new frame. Returns immediately — this must never be in
   * the path of anything, which is the entire point of the redesign.
   *
   * The buffer is COPIED rather than transferred: the renderer may hold and
   * reuse its own frame, and a transfer would detach it mid-flight.
   *
   * @param {Buffer} jpeg
   */
  setFrame(jpeg) {
    if (!this.#worker || this.#closed || !jpeg) return;
    const copy = new Uint8Array(jpeg.byteLength);
    copy.set(jpeg);
    this.#worker.postMessage({ type: 'frame', jpeg: copy, seq: ++this.#seq },
                             [copy.buffer]);
  }

  async close() {
    this.#closed = true;
    clearInterval(this.#watchdog);
    if (!this.#worker) return;
    const w = this.#worker;
    this.#worker = null;
    w.postMessage({ type: 'close' });
    // Do not wait indefinitely on a thread that may be blocked in the driver.
    await Promise.race([
      new Promise((r) => w.once('exit', r)),
      new Promise((r) => setTimeout(r, 2000)),
    ]);
    await w.terminate().catch(() => {});
  }
}
