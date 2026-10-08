/* cadence.js — when the transport thread should push, as a pure function.
 *
 * Until Sprint 9 the worker pushed on one fixed 1000ms timer, re-sending
 * whatever frame it last had. That is still exactly right for the agenda: its
 * content changes once a second at most, and the push exists mainly to keep
 * the panel from reverting to its logo (~3s forget window, see hid.js).
 *
 * The fish tank animates. At 1 fps it is a slideshow, so while the tank is on
 * screen the worker must ship each NEW frame promptly — up to the tank's
 * configured rate (4 fps by default, Ricky 2026-10-08) — while still
 * re-pushing on the 1s keepalive if the renderer falls behind.
 *
 * The rule, which reproduces the old behaviour exactly when minGapMs equals
 * the keepalive interval:
 *
 *   push if a frame exists AND
 *     (a NEW frame is waiting and minGapMs has passed since the last push)
 *     OR (keepaliveMs has passed since the last push, new frame or not)
 *
 * Pure and clock-free, like stallState() in panel-proxy.js, so the timings are
 * tests rather than sleeps.
 */

import { KEEPALIVE_INTERVAL_MS } from './hid.js';

/**
 * Hard ceiling on the push rate, whatever any caller asks for.
 *
 * "1 fps default. This panel has a reliability record; do not hammer it"
 * (hid.js) is relaxed for the tank by an explicit decision, not abandoned:
 * 4 fps is the most the render loop produces (RENDER floor 250ms in daemon.js),
 * and the transport refuses to go faster even if a bug asks it to. Raising it
 * is a deliberate act — PERIPHERAL_MAX_FPS — for running the Sprint 9 spike
 * (`npm run fps-test`) on the real unit, never a settings-UI value.
 */
/* Raised 4 -> 10, 2026-10-08, after measuring: `npm run fps-test` on the real
 * unit held 6, 8 and 10 fps exactly (0 failed, 0 late, worst push 83-94ms)
 * and started dropping slots at 12. Ricky watched each step: "10 and 12
 * definitely look the smoothest". 10 is the highest rate the panel sustained
 * cleanly. The lifespan cost of 2.5x the writes is unmeasurable and his call. */
export const MAX_FPS = Math.max(1, Number(process.env.PERIPHERAL_MAX_FPS ?? 10) || 10);

/** The shortest gap between two pushes the transport will ever allow. */
export const MIN_GAP_FLOOR_MS = Math.round(1000 / MAX_FPS);

/**
 * Clamp a requested minimum gap into [MIN_GAP_FLOOR_MS, keepalive]. A gap
 * longer than the keepalive is meaningless (the keepalive fires first) and a
 * non-number falls back to the agenda's 1 fps behaviour rather than to "as
 * fast as possible".
 *
 * @param {unknown} ms
 */
export function clampGap(ms, keepaliveMs = KEEPALIVE_INTERVAL_MS) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return keepaliveMs;
  return Math.min(keepaliveMs, Math.max(MIN_GAP_FLOOR_MS, Math.round(n)));
}

/**
 * Is a push due right now?
 *
 * @param {{now: number, lastPushAt: number, hasFrame: boolean,
 *          frameSeq: number, lastPushedSeq: number,
 *          minGapMs?: number, keepaliveMs?: number}} o
 */
export function pushDue({
  now, lastPushAt, hasFrame, frameSeq, lastPushedSeq,
  minGapMs = KEEPALIVE_INTERVAL_MS, keepaliveMs = KEEPALIVE_INTERVAL_MS,
}) {
  if (!hasFrame) return false;
  const since = lastPushAt ? now - lastPushAt : Infinity;
  if (since >= keepaliveMs) return true;
  return frameSeq !== lastPushedSeq && since >= clampGap(minGapMs, keepaliveMs);
}
