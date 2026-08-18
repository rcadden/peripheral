/* panel-proxy.test.js — the stall detector.
 *
 * Every case here is the morning of 2026-08-18, not a hypothetical. That day
 * the daemon reported `panel=ok renderer=down` for roughly fifteen minutes
 * while the truth was precisely inverted: the HID transport had blocked the
 * process inside a synchronous native write, and Chromium was healthy the whole
 * time. Nothing in the codebase could represent "this component has stopped
 * answering", so nothing did.
 *
 * These tests exist so that gap cannot reopen quietly. They touch no hardware,
 * spawn no worker, and take no wall-clock time — `now` is passed in.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { stallState, describeState } from '../src/transport/panel-proxy.js';

const S = 1000;

/* A realistic epoch base. Do NOT use 0 as a timestamp here: `stallState` treats
 * a falsy `lastStatusAt` AND `startedAt` as "this proxy was never opened" and
 * reports zero silence, which is correct in production (Date.now() is never 0)
 * and silently turns 0-based tests green for the wrong reason. Four of these
 * tests were written that way first and three of them failed loudly; the fourth
 * PASSED while asserting nothing, which is the more dangerous outcome. */
const T0 = 1_700_000_000_000;

/* ── stallState ──────────────────────────────────────────────────────────── */

test('a worker reporting every second is not stalled', () => {
  const { silentFor, stalled, shouldRespawn } = stallState({
    lastStatusAt: T0, startedAt: T0 - 10 * S, now: T0 + S,
  });
  assert.equal(silentFor, 1000);
  assert.equal(stalled, false);
  assert.equal(shouldRespawn, false);
});

test('a single slow frame is a hiccup, not a stall', () => {
  // 2s of silence against a 3s threshold. The panel's forget window is ~3s, so
  // this is the case where one late frame must NOT trigger a teardown.
  const { silentFor, stalled } = stallState({
    lastStatusAt: T0, startedAt: T0, now: T0 + 2 * S,
  });
  assert.equal(silentFor, 2000);
  assert.equal(stalled, false);
});

test('silence past three push intervals is a stall', () => {
  const { stalled, shouldRespawn } = stallState({
    lastStatusAt: T0, startedAt: T0, now: T0 + 4 * S,
  });
  assert.equal(stalled, true);
  assert.equal(shouldRespawn, false);
});

test('the real failure — 36s of silence — reads as stalled', () => {
  // Measured: /api/state took 36.6s to answer while the loop was blocked.
  const { silentFor, stalled } = stallState({
    lastStatusAt: T0, startedAt: T0, now: T0 + 36_600,
  });
  assert.equal(silentFor, 36_600);
  assert.equal(stalled, true);
});

test('silence past a minute escalates to respawn', () => {
  const { stalled, shouldRespawn } = stallState({
    lastStatusAt: T0, startedAt: T0, now: T0 + 61 * S,
  });
  assert.equal(stalled, true);
  assert.equal(shouldRespawn, true);
});

test('a worker that has never reported is measured from spawn, not from zero', () => {
  // The boot case. Without the startedAt fallback a fresh worker reads as
  // infinitely silent and trips the alarm immediately — which is how a stall
  // detector earns a reputation for crying wolf and gets ignored.
  const { silentFor, stalled } = stallState({
    lastStatusAt: 0, startedAt: T0, now: T0 + 500,
  });
  assert.equal(silentFor, 500);
  assert.equal(stalled, false);
});

test('a proxy that was never opened reports no silence at all', () => {
  // Both timestamps unset. This is the sentinel that made four of these tests
  // lie when they used 0 as a clock base — worth pinning deliberately rather
  // than leaving as an accident of falsiness.
  const { silentFor, stalled } = stallState({
    lastStatusAt: 0, startedAt: 0, now: T0,
  });
  assert.equal(silentFor, 0);
  assert.equal(stalled, false);
});

test('a clock that goes backwards yields 0, never a negative silence', () => {
  const { silentFor, stalled } = stallState({
    lastStatusAt: T0 + 5000, startedAt: T0, now: T0 + 4000,
  });
  assert.equal(silentFor, 0);
  assert.equal(stalled, false);
});

test('recovery clears the stall the moment a status arrives', () => {
  const stalledNow = stallState({
    lastStatusAt: T0, startedAt: T0, now: T0 + 40 * S,
  });
  assert.equal(stalledNow.stalled, true);
  // The replug: the worker completes a push and reports at T0+40s.
  const after = stallState({
    lastStatusAt: T0 + 40 * S, startedAt: T0, now: T0 + 40_500,
  });
  assert.equal(after.stalled, false);
});

/* ── main-thread lag ─────────────────────────────────────────────────────
 * These cover a false positive this detector produced on its FIRST real run:
 * it logged `TRANSPORT STALLED — no push completed for 3s` while the worker was
 * pushing perfectly, because the main thread was busy launching Chromium and
 * had not drained the worker's messages. Silence measured by a blocked observer
 * is evidence about the observer.
 */

test('THE FALSE POSITIVE — silence during a blocked main thread is not a stall', () => {
  // Chromium launch: main thread gone for ~5s, worker pushing throughout.
  const { silentFor, attributable, stalled } = stallState({
    lastStatusAt: T0, startedAt: T0, now: T0 + 5 * S, mainLagMs: 5 * S,
  });
  assert.equal(silentFor, 5 * S);       // wall clock says 5s of quiet
  assert.equal(attributable, 0);        // none of it is the worker's doing
  assert.equal(stalled, false);
});

test('a blocked main thread does not mask a genuinely stalled worker', () => {
  // The important half: lag must not become an excuse that hides real stalls.
  // Main blocked 2s, but the worker has been silent 40s. Still a stall.
  const { attributable, stalled } = stallState({
    lastStatusAt: T0, startedAt: T0, now: T0 + 40 * S, mainLagMs: 2 * S,
  });
  assert.equal(attributable, 38 * S);
  assert.equal(stalled, true);
});

test('lag is subtracted from respawn escalation too, not just the alarm', () => {
  const { shouldRespawn } = stallState({
    lastStatusAt: T0, startedAt: T0, now: T0 + 65 * S, mainLagMs: 30 * S,
  });
  assert.equal(shouldRespawn, false);
});

test('a negative or absent lag reading is treated as zero', () => {
  const noLag = stallState({ lastStatusAt: T0, startedAt: T0, now: T0 + 4 * S });
  assert.equal(noLag.stalled, true);
  const negative = stallState({
    lastStatusAt: T0, startedAt: T0, now: T0 + 4 * S, mainLagMs: -9999,
  });
  assert.equal(negative.stalled, true);
});

/* ── describeState ───────────────────────────────────────────────────────── */

test('an open, responsive panel reads ok', () => {
  assert.equal(describeState({
    closed: false, hasWorker: true, healthy: true, silentFor: 500, stalled: false,
  }), 'ok');
});

test('a panel that failed to open reads down', () => {
  assert.equal(describeState({
    closed: false, hasWorker: true, healthy: false, silentFor: 500, stalled: false,
  }), 'down');
});

test('THE REGRESSION — a stalled transport must never read ok', () => {
  // This is the exact line the daemon printed on 2026-08-18: the device had
  // last been observed healthy, so `healthy` was true, and the heartbeat
  // reported `panel=ok` while nothing was being pushed at all. A claim about
  // the CHANNEL outranks the device's last known state.
  const state = describeState({
    closed: false, hasWorker: true, healthy: true, silentFor: 36_600, stalled: true,
  });
  assert.notEqual(state, 'ok');
  assert.match(state, /^STALLED/);
});

test('a stall reports how long it has been silent, in seconds', () => {
  assert.equal(describeState({
    closed: false, hasWorker: true, healthy: true, silentFor: 12_400, stalled: true,
  }), 'STALLED 12s');
});

test('no worker reads closed, whatever the last status claimed', () => {
  assert.equal(describeState({
    closed: false, hasWorker: false, healthy: true, silentFor: 0, stalled: false,
  }), 'closed');
  assert.equal(describeState({
    closed: true, hasWorker: true, healthy: true, silentFor: 0, stalled: false,
  }), 'closed');
});
