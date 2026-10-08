/* fps-test.js — the Sprint 9 gate: how fast can this panel actually be fed?
 *
 *   npm run startup:uninstall     # the daemon must NOT hold the panel
 *   npm run fps-test              # steps 2, 4, 5, 10, 15 fps, 20s each
 *   npm run fps-test -- 4 10      # or just the rates you name
 *   npm run startup:install       # put the daemon back
 *
 * WHY THIS EXISTS
 * The fish tank animates, and Ricky chose 4 fps (2026-10-08) against the
 * panel's reliability record — before anyone had measured what the transport
 * can sustain. This measures it: for each rate it pushes a synthetic animated
 * sequence (a sweeping bar over noise, sized like a real tank frame, so the
 * byte count is honest) and records push durations, the rate actually
 * achieved, failures, and pushes slow enough to have missed their slot.
 *
 * WHAT IT CANNOT TELL YOU
 * Whether sustaining a rate shortens the panel's life. That is not measurable
 * in 20 seconds and is the risk Ricky chose to take; this script only says
 * what is possible. It also cannot see the glass: "accepted is not
 * displayed" (CLAUDE.md, 2026-08-17). Watch the panel during each step and
 * note whether the bar sweeps smoothly, stutters, or the panel flickers to
 * its logo — the numbers are half the answer.
 *
 * It talks to PanelTransport directly, NOT through the daemon's worker, so
 * the transport's 4 fps ceiling (cadence.js MAX_FPS) does not apply here.
 * That is the point: this is the one sanctioned way to ask the hardware for
 * more, and it only runs when a human types the command. Same rule as
 * idle-test and stall-test — it drives the real panel, so it is never
 * reachable from `npm test` (and refuses to run under `node --test`).
 *
 * Under load (the roadmap's second gate item): run it once idle, then again
 * during a Teams call with a build running, and compare.
 */

import { readFile } from 'node:fs/promises';
import { PanelTransport } from './hid.js';

if (process.env.NODE_TEST_CONTEXT) {
  console.error('fps-test drives the real panel and must never run under node --test.');
  process.exit(1);
}

const args = process.argv.slice(2);
const RATES = args.map(Number).filter((n) => Number.isFinite(n) && n > 0 && n <= 30);
const STEPS = RATES.length ? RATES : [2, 4, 5, 10, 15];
const STEP_S = Number(process.env.PERIPHERAL_FPS_TEST_SECONDS ?? 20);
const FRAMES = 24;
const LEAD_IN_S = 10;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rule = (s) => console.log(`\n${'='.repeat(64)}\n${s}\n${'='.repeat(64)}`);
const pct = (arr, p) => arr.length ? [...arr].sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0;

/**
 * A short animated loop. Noise keeps the JPEGs near a real tank frame's size
 * (~80-130KB) — a flat synthetic frame compresses to a few KB and would make
 * the transport look far faster than it is.
 */
async function makeFrames() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.warn('sharp is not installed — falling back to one static frame. Throughput is still');
    console.warn('measured honestly, but there will be no motion to judge on the glass.');
    const still = await readFile(new URL('../../docs/first-light.jpg', import.meta.url));
    return Array.from({ length: FRAMES }, () => still);
  }
  const W = 1280, H = 480;
  const frames = [];
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let f = 0; f < FRAMES; f++) {
    const raw = Buffer.alloc(W * H * 3);
    const barX = Math.round((f / FRAMES) * (W - 120));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3;
        const n = rnd() * 22;
        const inBar = x >= barX && x < barX + 120;
        raw[i] = inBar ? 240 : 20 + n * 0.6 + (y / H) * 40;
        raw[i + 1] = inBar ? 200 : 60 + n + (x / W) * 30;
        raw[i + 2] = inBar ? 60 : 70 + n * 0.8;
      }
    }
    frames.push(await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 92 }).toBuffer());
  }
  return frames;
}

const frames = await makeFrames();
const avgKB = Math.round(frames.reduce((n, f) => n + f.length, 0) / frames.length / 1024);
console.log(`${frames.length} frames, ~${avgKB}KB each (a real tank frame is ~80-130KB; erring heavy is the conservative direction).`);

const panel = new PanelTransport();
if (!(await panel.open())) {
  console.error(`open failed: ${panel.lastError?.message}`);
  console.error('Is the daemon still running? `npm run startup:uninstall` first. Is the panel plugged in?');
  process.exit(1);
}

rule('LOOK AT THE PANEL NOW');
console.log(`Steps: ${STEPS.join(', ')} fps, ${STEP_S}s each. A yellow bar should sweep left to right.`);
console.log('For each step, note: smooth / stuttering / flickering to the logo.\n');
for (let s = LEAD_IN_S; s > 0; s--) {
  process.stdout.write(`\r  starting in ${s}s...   `);
  await sleep(1000);
}
console.log('\r  GO                    ');

const results = [];
let fi = 0;
for (const fps of STEPS) {
  rule(`STEP — ${fps} fps for ${STEP_S}s`);
  const interval = 1000 / fps;
  const durations = [];
  let failures = 0, missed = 0;
  const start = Date.now();
  let next = start;
  while (Date.now() - start < STEP_S * 1000) {
    const t0 = Date.now();
    const ok = await panel.push(frames[fi++ % frames.length]);
    const d = Date.now() - t0;
    durations.push(d);
    if (!ok) {
      failures++;
      console.log('  push FAILED — reopening');
      await panel.close();
      await sleep(1000);
      await panel.open();
    }
    next += interval;
    const wait = next - Date.now();
    if (wait > 0) await sleep(wait);
    else { missed++; next = Date.now(); }
  }
  const elapsed = (Date.now() - start) / 1000;
  const r = {
    fps,
    achieved: durations.length / elapsed,
    avg: durations.reduce((a, b) => a + b, 0) / durations.length,
    p95: pct(durations, 0.95),
    worst: Math.max(...durations),
    failures,
    missed,
  };
  results.push(r);
  console.log(`  achieved ${r.achieved.toFixed(2)} fps · push avg ${r.avg.toFixed(1)}ms, ` +
              `p95 ${r.p95}ms, worst ${r.worst}ms · ${failures} failed · ${missed} late`);
  console.log('  >>> What did the glass do?');
  // A breather at 1 fps between steps, so a struggling step does not bleed
  // into the next one's numbers.
  for (let k = 0; k < 3; k++) { await panel.push(frames[0]); await sleep(1000); }
}

await panel.close();

rule('SUMMARY — paste this into CHANGELOG.md with what you saw');
console.log(`date: ${new Date().toISOString()}   frame size ~${avgKB}KB   step ${STEP_S}s`);
console.log('target | achieved | push avg | p95 | worst | failed | late | glass (fill in)');
for (const r of results) {
  console.log(`${String(r.fps).padStart(6)} | ${r.achieved.toFixed(2).padStart(8)} | ` +
    `${r.avg.toFixed(1).padStart(7)}ms | ${String(r.p95).padStart(3)}ms | ` +
    `${String(r.worst).padStart(4)}ms | ${String(r.failures).padStart(6)} | ${String(r.missed).padStart(4)} |`);
}
console.log('\nA step is sustainable when achieved ~= target, failed = 0, late ~= 0, worst stays well');
console.log('under the 3s forget window — AND the glass looked right. Then `npm run startup:install`.');
