/* idle-test.js — does the panel revert to its logo when we stop pushing?
 *
 *   npm run idle-test
 *
 * WHY THIS EXISTS
 * The panel reverts to its built-in boot logo a few seconds after `npm run send`
 * exits. Two candidate causes, and they imply different daemon designs:
 *
 *   A) inactivity timeout  — the firmware gives up on a pushed frame after N
 *      seconds without a new one. The daemon must then push FOREVER, even when
 *      nothing on screen has changed.
 *   B) handle close        — the firmware drops the pushed frame when the USB
 *      handle is released. Holding the device open would then be enough, and
 *      the frame rate could be as low as we like.
 *
 * ── RESULT, 2026-08-17, on the actual unit ───────────────────────────────
 * ANSWER: (A) inactivity timeout, ~3 seconds. The handle is irrelevant.
 *
 *   PHASE A  reverted at ~3s with the handle still open
 *   PHASE B  steady for the full 15s at 1 fps, no flicker
 *   PHASE C  reverted ~2s after the final frame, NOT on the close itself
 *
 * Phase C is the one that settles it: if releasing the handle were the trigger,
 * the image would have dropped instantly instead of riding out the same ~3s.
 *
 * Times are stopwatch-measured, +/- a second or two. Re-run this after a
 * firmware change or on a replacement unit rather than trusting the number.
 *
 * This separates them:
 *   PHASE A  one frame, then the handle stays OPEN with nothing sent
 *   PHASE B  1 fps, to check that a slow keepalive is sufficient
 *   PHASE C  release the handle and watch
 *
 * Requires a human watching the glass. Run it, watch, report.
 */

import { readFile } from 'node:fs/promises';
import { PanelTransport } from './hid.js';

const LEAD_IN_S = 10;
const PHASE_A_S = 30;
const PHASE_B_S = 15;
const PHASE_C_S = 12;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rule = (s) => console.log(`\n${'='.repeat(64)}\n${s}\n${'='.repeat(64)}`);

const jpeg = await readFile(new URL('../../docs/first-light.jpg', import.meta.url));

const panel = new PanelTransport();
if (!(await panel.open())) {
  console.error(`open failed: ${panel.lastError?.message}`);
  process.exit(1);
}

rule('LOOK AT THE PANEL NOW');
console.log('Three phases. What matters is WHEN the image gives way to the logo.\n');
for (let s = LEAD_IN_S; s > 0; s--) {
  process.stdout.write(`\r  starting in ${s}s...   `);
  await sleep(1000);
}
console.log('\r  GO                    ');

// ── PHASE A ────────────────────────────────────────────────────────────────
rule(`PHASE A — one frame, then ${PHASE_A_S}s of SILENCE (handle stays open)`);
await panel.push(jpeg);
console.log('frame sent. Counting seconds since it landed:\n');
for (let s = 1; s <= PHASE_A_S; s++) {
  await sleep(1000);
  // One line per second so the elapsed time is recoverable afterwards.
  console.log(`  t+${String(s).padStart(2)}s   nothing sent, handle open`);
}
console.log('\nPHASE A over. Zero frames sent for the whole window.');
console.log('>>> Did it revert? At roughly which t+ value?');

// ── PHASE B ────────────────────────────────────────────────────────────────
rule(`PHASE B — pushing at 1 fps for ${PHASE_B_S}s`);
console.log('Watch for a steady image vs. flicker between image and logo.\n');
let failures = 0;
for (let s = 1; s <= PHASE_B_S; s++) {
  const ok = await panel.push(jpeg);
  if (!ok) failures++;
  console.log(`  frame ${String(s).padStart(2)}/${PHASE_B_S}  ${ok ? 'ok' : 'FAILED'}`);
  await sleep(1000);
}
console.log(`\nPHASE B over. ${PHASE_B_S - failures}/${PHASE_B_S} accepted.`);
console.log('>>> Did it stay up continuously, or flicker?');

// ── PHASE C ────────────────────────────────────────────────────────────────
rule('PHASE C — releasing the USB handle');
console.log('The last frame was sent ~1s ago. Closing the handle NOW.\n');
await panel.close();
console.log('handle closed.');
for (let s = 1; s <= PHASE_C_S; s++) {
  await sleep(1000);
  console.log(`  t+${String(s).padStart(2)}s   handle closed`);
}
console.log('\n>>> Did it revert the instant the handle closed, or later?');

rule('SUMMARY OF WHAT TO REPORT');
console.log('  1. PHASE A — reverted? at roughly which second?');
console.log('  2. PHASE B — steady, or flickering?');
console.log('  3. PHASE C — reverted immediately on close, or on a delay?');
console.log('\nA revert in A but not B  => inactivity timeout; daemon must never stop.');
console.log('No revert in A, only in C => handle-close; frame rate can be anything.');
