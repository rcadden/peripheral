/* The push-cadence rule (Sprint 9). The agenda's behaviour must be exactly
 * what the fixed 1s timer did before; the tank's must never exceed the hard
 * ceiling, whatever it is asked for. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { pushDue, clampGap, MIN_GAP_FLOOR_MS } from '../src/transport/cadence.js';

const base = { hasFrame: true, frameSeq: 5, lastPushedSeq: 4, keepaliveMs: 1000 };

test('no frame, no push — ever', () => {
  assert.equal(pushDue({ ...base, hasFrame: false, now: 10_000, lastPushAt: 0 }), false);
});

test('the very first frame goes out immediately', () => {
  assert.equal(pushDue({ ...base, now: 10_000, lastPushAt: 0, minGapMs: 1000 }), true);
});

test('agenda cadence: a new frame waits for the 1s keepalive, as the old timer did', () => {
  assert.equal(pushDue({ ...base, now: 10_400, lastPushAt: 10_000, minGapMs: 1000 }), false);
  assert.equal(pushDue({ ...base, now: 11_000, lastPushAt: 10_000, minGapMs: 1000 }), true);
});

test('keepalive re-pushes the SAME frame after 1s — the panel forgets in ~3s', () => {
  const same = { ...base, frameSeq: 4, lastPushedSeq: 4 };
  assert.equal(pushDue({ ...same, now: 10_999, lastPushAt: 10_000, minGapMs: 250 }), false);
  assert.equal(pushDue({ ...same, now: 11_000, lastPushAt: 10_000, minGapMs: 250 }), true);
});

test('tank cadence: a new frame goes out after 250ms, an unchanged one does not', () => {
  assert.equal(pushDue({ ...base, now: 10_250, lastPushAt: 10_000, minGapMs: 250 }), true);
  assert.equal(pushDue({ ...base, now: 10_200, lastPushAt: 10_000, minGapMs: 250 }), false);
  assert.equal(pushDue({ ...base, frameSeq: 4, now: 10_250, lastPushAt: 10_000, minGapMs: 250 }), false);
});

test('a request faster than the ceiling is clamped, not obeyed', () => {
  assert.equal(clampGap(10), MIN_GAP_FLOOR_MS);
  assert.equal(pushDue({ ...base, now: 10_100, lastPushAt: 10_000, minGapMs: 10 }),
               100 >= MIN_GAP_FLOOR_MS);
});

test('junk and absent gaps fall back to the agenda 1 fps, never to "as fast as possible"', () => {
  for (const v of [undefined, null, '', 'fast', NaN, -5, 0]) {
    assert.equal(clampGap(v), 1000, `clampGap(${String(v)})`);
  }
});

test('a gap longer than the keepalive is capped at the keepalive', () => {
  assert.equal(clampGap(5000), 1000);
});
