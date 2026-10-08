/* tank.js — the fish tank pane (Sprint 9).
 *
 * During free time the daemon puts this page on the glass instead of the
 * agenda (see mode.js for when). Like every pane it is also just a URL: open
 * /panes/tank/ in any browser and it animates natively — the one structural
 * decision (CLAUDE.md) holds, the daemon screenshots exactly this page.
 *
 * Data: /api/state, polled once a minute — the same endpoint and the same
 * mock fallback contract as the agenda. Everything shown lives inside the
 * scene: next meeting on the slate stone, clock and outdoor temperature on
 * the thermometer, the sky in the light, the weather on the surface.
 *
 * ── HOW FRAMES REACH THE GLASS ───────────────────────────────────────────
 * With ?fps=N (the daemon passes it), the page does not run a 60 Hz
 * requestAnimationFrame loop — that would burn a CPU core in headless Chromium
 * to draw frames nobody captures. Instead render.js calls
 * window.__beforeCapture() right before each screenshot, so exactly one frame
 * is drawn per frame pushed, sampled at the real wall-clock time. A slow
 * fallback timer keeps the page alive if nothing is capturing.
 */

import { TankScene } from './scene.js';
import { buildLayout, seedDate } from './layout.js';
import { sunAltitude, lighting, DEFAULT_LOCATION } from './sky.js';
import { stoneText } from './info.js';

const POLL_MS = 60_000;
const FADE_S = 3;

const params = new URLSearchParams(location.search);
const FPS = Math.min(30, Math.max(0, Number(params.get('fps')) || 0));
const PREVIEW_HOUR = params.has('hour') ? Number(params.get('hour')) : null;
const PREVIEW_WEATHER = params.get('weather');
const PREVIEW_SEED = params.get('seed');

let state = null;
let usingMock = false;

/* ── mock, for a browser with no daemon behind it ──────────────────────── */

function mockState() {
  const now = new Date();
  const at = (minFromNow, durMin) => {
    const s = new Date(now.getTime() + minFromNow * 60_000);
    s.setSeconds(0, 0);
    return { start: s.toISOString(), end: new Date(s.getTime() + durMin * 60_000).toISOString() };
  };
  const tmr = new Date(now); tmr.setDate(tmr.getDate() + 1); tmr.setHours(9, 0, 0, 0);
  return {
    generatedAt: now.toISOString(),
    stale: false,
    events: [
      { id: 'm1', title: 'Design review — Q4 roadmap', calendar: 'work', allDay: false, ...at(42, 30) },
      { id: 'm2', title: '1:1 with Nick', calendar: 'work', allDay: false, ...at(180, 30) },
    ],
    tomorrow: [
      { id: 't1', title: 'Standup', calendar: 'work', allDay: false,
        start: tmr.toISOString(), end: new Date(tmr.getTime() + 15 * 60_000).toISOString() },
    ],
    weather: { tempF: 68, condition: 'clear', stale: false },
  };
}

async function loadState() {
  try {
    const res = await fetch('/api/state', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state = await res.json();
    usingMock = false;
  } catch {
    if (!state || usingMock) {
      state = mockState();
      usingMock = true;
    } else {
      state.stale = true; // the daemon went away mid-session
    }
  }
}

/* ── light and information ─────────────────────────────────────────────── */

function lightNow(now) {
  const loc = state?.location ?? DEFAULT_LOCATION;
  let when = now;
  if (PREVIEW_HOUR !== null && Number.isFinite(PREVIEW_HOUR)) {
    when = new Date(now);
    when.setHours(Math.floor(PREVIEW_HOUR), Math.round((PREVIEW_HOUR % 1) * 60), 0, 0);
  }
  const condition = PREVIEW_WEATHER || state?.weather?.condition || 'clear';
  return lighting({ altitude: sunAltitude(when, loc.lat, loc.lon), condition });
}

let tank = null;
let lastInfoKey = '';

function refreshInfo(now, force = false) {
  const text = stoneText(now, state);
  const weather = state?.weather;
  const stale = Boolean(state?.stale || weather?.stale);
  const key = `${now.getHours()}:${now.getMinutes()}|${text.headline}|${text.detail}|${text.glow.toFixed(2)}|${weather?.tempF}|${stale}`;
  const light = lightNow(now);
  tank.setLight(light);
  if (!force && key === lastInfoKey) return;
  lastInfoKey = key;
  // The LCDs dim a little at night so they are not the brightest thing in the
  // room, but never below legibility.
  const lcd = light.phase === 'night' ? 0.82 : 1;
  tank.setStoneText(text, text.glow, lcd);
  tank.setThermo({ now, tempF: weather?.tempF ?? null, stale }, lcd);
}

/* ── lifecycle ─────────────────────────────────────────────────────────── */

const t0 = performance.now() / 1000;
let last = t0;
let currentDate = null;
/** 03:00 rebuild: fade out, swap, fade in. null when not rebuilding. */
let rebuild = null;

function build(date) {
  const started = performance.now();
  tank.build(buildLayout(date));
  currentDate = date;
  refreshInfo(new Date(), true);
  const L = tank.layout;
  console.log(`[tank] built ${date} in ${Math.round(performance.now() - started)}ms — ` +
    `${L.mood} plants, ${L.community.school.count} ${L.community.school.species}` +
    `, ${L.community.school2.count} ${L.community.school2.species}` +
    `${L.community.centerpiece ? `, ${L.community.centerpiece.count} ${L.community.centerpiece.species}` : ''}` +
    `${L.community.grazer ? `, ${L.community.grazer.count} ${L.community.grazer.species}` : ''}`);
}

function draw() {
  const t = performance.now() / 1000;
  const dt = Math.max(0, t - last);
  last = t;

  if (rebuild) {
    const age = t - rebuild.start;
    if (rebuild.phase === 'out') {
      tank.setFade(Math.min(1, age / FADE_S));
      if (age >= FADE_S) { build(rebuild.date); rebuild = { phase: 'in', start: t, date: rebuild.date }; }
    } else {
      tank.setFade(Math.max(0, 1 - age / FADE_S));
      if (age >= FADE_S) { tank.setFade(0); rebuild = null; }
    }
  }
  tank.frame(t - t0, dt);
}

function everySecond() {
  const now = new Date();
  refreshInfo(now);
  const want = PREVIEW_SEED || seedDate(now);
  if (!rebuild && want !== currentDate) {
    console.log(`[tank] new day — rebuilding for ${want}`);
    rebuild = { phase: 'out', start: performance.now() / 1000, date: want };
  }
}

async function main() {
  try {
    tank = new TankScene(document.getElementById('tank'));
  } catch (err) {
    console.error(`[tank] WebGL unavailable: ${err.message}`);
    document.getElementById('fallback').hidden = false;
    // Tells render.js this pane cannot do its job, so the daemon keeps the
    // agenda on the glass instead of pushing this message to it.
    window.__paneFailed = `WebGL unavailable: ${err.message}`;
    window.__paneReady = true;
    return;
  }
  console.log(`[tank] webgl renderer: ${tank.rendererInfo()}`);

  await loadState();
  build(PREVIEW_SEED || seedDate(new Date()));
  draw();
  window.__tank = tank; // for poking at in devtools
  window.__paneReady = true;

  setInterval(loadState, POLL_MS);
  setInterval(everySecond, 1000);

  if (FPS) {
    let lastCaptureAt = 0;
    window.__beforeCapture = () => { lastCaptureAt = performance.now(); draw(); return true; };
    setInterval(() => { if (performance.now() - lastCaptureAt > 1500 / FPS) draw(); }, 1000 / FPS);
  } else {
    const loop = () => { draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
}

main();
