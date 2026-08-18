/* stall-test.js — prove the transport's recovery paths actually run.
 *
 *     npm run stall-test
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * On 2026-08-18 a synchronous `node-hid` write blocked the daemon's only
 * thread for tens of seconds at a time, and the panel sat on its vendor logo
 * while every health signal read green. The fix moved the transport to a worker
 * thread and added recovery: slow-push detection, reopen, a stall alarm, and a
 * worker respawn.
 *
 * All of which shipped as code that had never executed. A wedged USB endpoint
 * is not reproducible on request — the real one arrived once, unannounced,
 * after a cold boot — so "written but unverified" was the honest tier for every
 * one of those branches, and it was going to stay that way indefinitely.
 *
 * This script injects the fault instead of waiting for it. `Atomics.wait` on
 * the worker thread blocks synchronously and uninterruptibly, which is exactly
 * the shape of a stuck native call; a `setTimeout` would prove nothing because
 * it yields, and yielding is the entire thing that was missing.
 *
 * This is the same standing rule that produced `npm run idle-test`: behaviour
 * we cannot explain gets a committed diagnostic, not a note. A note does not
 * survive a firmware revision or a replacement unit.
 *
 * ── IT NEVER TOUCHES THE PANEL ───────────────────────────────────────────
 * Runs with PERIPHERAL_DRY_RUN=true, so the worker writes frames to a temp
 * directory instead of the device. It is safe to run with the daemon live.
 * (`npm test` still must not reach this file — the test script's scoped glob
 * covers only test/**, and this lives in src/.)
 */

import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

/* Set before importing the proxy: the thresholds are read at module load.
 * Compressed so the whole run takes seconds rather than minutes. */
process.env.PERIPHERAL_DRY_RUN = 'true';
process.env.PERIPHERAL_STALL_AFTER_MS ??= '2000';
process.env.PERIPHERAL_RESPAWN_AFTER_MS ??= '6000';
process.env.PERIPHERAL_OPEN_TIMEOUT_MS ??= '2000';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jpeg = Buffer.concat([Buffer.from([0xFF, 0xD8]), Buffer.alloc(2048, 0x20)]);

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

/**
 * Main-thread responsiveness, measured the same way the daemon's heartbeat
 * measures `loopLag`. This is THE number: the entire claim of the redesign is
 * that a blocked transport no longer blocks this thread.
 */
function startLagMeter() {
  let worst = 0, last = Date.now();
  const t = setInterval(() => {
    const now = Date.now();
    worst = Math.max(worst, now - last - 100);
    last = now;
  }, 100);
  return { stop: () => { clearInterval(t); return worst; } };
}

/* Peaks are read from the proxy, NOT sampled on a timer here.
 *
 * A timer-based sampler was tried first and could not see the slow push at all:
 * the worker reports a 4012ms push and then a 4ms push back-to-back, and both
 * messages land before any main-thread timer runs, so every sample read 4ms.
 * That is not a testing quirk — it is exactly why the proxy holds the peak
 * itself and why the heartbeat reports worstPush instead of lastPush. */

async function main() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'peripheral-stall-'));
  process.chdir(dir);   // DRY_RUN writes frames to ./frames
  console.log(`[stall-test] dry run, frames -> ${dir}\n`);

  const { PanelProxy } = await import('./panel-proxy.js');

  /* ── 1. A hung open must not hold the daemon hostage ──────────────────── */
  console.log('1. open() is bounded when the worker hangs during device open');
  {
    process.env.PERIPHERAL_DEBUG_OPEN_HANG_MS = '30000';
    const p = new PanelProxy();
    const t0 = Date.now();
    const ok = await p.open();
    const took = Date.now() - t0;
    check('open() returned instead of hanging', ok === false, `${took}ms, ok=${ok}`);
    check('returned near the 2000ms deadline', took >= 1800 && took < 5000, `${took}ms`);
    check('the reason is recorded', /did not open/.test(p.lastError?.message ?? ''),
          p.lastError?.message);
    await p.close();
    delete process.env.PERIPHERAL_DEBUG_OPEN_HANG_MS;
  }

  /* ── 2. A blocked worker is detected, and does NOT block the main thread ── */
  console.log('\n2. a wedged transport is detected while the main thread stays live');
  {
    process.env.PERIPHERAL_DEBUG_BLOCK_AFTER = '2';
    process.env.PERIPHERAL_DEBUG_BLOCK_MS = '4000';
    const p = new PanelProxy();
    check('opened', await p.open() === true);
    p.setFrame(jpeg);

    await sleep(1200);
    check('pushing normally before the fault', p.state === 'ok', `state=${p.state}`);

    const meter = startLagMeter();
    await sleep(4500);                       // worker is blocked for 4s in here
    const worstLag = meter.stop();

    check('main thread stayed responsive during the block',
          worstLag < 500, `worst loop lag ${worstLag}ms`);
    check('the stall was reported, not hidden', /STALLED/.test(p.state),
          `state=${p.state}`);

    // It must clear itself once the worker comes back — a transient wedge is a
    // hiccup, not a permanent condition.
    await sleep(2500);
    const peak = p.drainPeaks();
    check('recovered to ok after the block ended', p.state === 'ok', `state=${p.state}`);

    /* A push that outran the panel's ~3s forget window is counted as slow even
     * though the driver returned success — the distinction the old code could
     * not make, because a 4s write and a 40ms write logged identically. */
    check('the slow push was counted', peak.slowRun >= 1, `peak slowRun=${peak.slowRun}`);
    check('the 4s push survived into the heartbeat number', peak.pushMs >= 3000,
          `worstPush=${peak.pushMs}ms`);
    await p.close();
    delete process.env.PERIPHERAL_DEBUG_BLOCK_AFTER;
    delete process.env.PERIPHERAL_DEBUG_BLOCK_MS;
  }

  /* ── 3. Respawn after prolonged silence ───────────────────────────────── */
  console.log('\n3. a worker silent past the respawn deadline is replaced');
  {
    process.env.PERIPHERAL_DEBUG_BLOCK_AFTER = '2';
    process.env.PERIPHERAL_DEBUG_BLOCK_MS = '20000';
    const p = new PanelProxy();
    check('opened', await p.open() === true);
    p.setFrame(jpeg);

    const meter = startLagMeter();
    await sleep(12000);                      // past RESPAWN_AFTER_MS (6s)
    const worstLag = meter.stop();

    check('respawn fired', p.respawns >= 1, `respawns=${p.respawns}`);
    check('main thread stayed responsive throughout',
          worstLag < 500, `worst loop lag ${worstLag}ms`);

    /* The honest one. terminate() is not guaranteed to interrupt a thread stuck
     * in a native call, so what matters is that the REPLACEMENT works, not that
     * the corpse died promptly. */
    p.setFrame(jpeg);
    await sleep(3000);
    check('the replacement worker is pushing', p.state === 'ok', `state=${p.state}`);
    await p.close();
    delete process.env.PERIPHERAL_DEBUG_BLOCK_AFTER;
    delete process.env.PERIPHERAL_DEBUG_BLOCK_MS;
  }

  console.log(`\n[stall-test] ${failures === 0 ? 'all checks passed' : `${failures} FAILED`}`);
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error('[stall-test] fatal:', err); process.exit(1); });
