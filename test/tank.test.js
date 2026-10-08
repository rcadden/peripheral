/* tank.test.js — the fish tank's pure parts (Sprint 9): the daily layout and
 * its composition rules, the sun, the slate stone's wording, and the fish.
 * Nothing here touches a canvas or WebGL; that is verified by rendering
 * (see CHANGELOG) and, finally, by eyes on the glass. */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLayout, seedDate, W, GEO } from '../web/panes/tank/layout.js';
import { SPECIES, MAX_ANIMALS } from '../web/panes/tank/species.js';
import { sunAltitude, lighting, DEFAULT_LOCATION } from '../web/panes/tank/sky.js';
import { stoneText, fmtCountdown } from '../web/panes/tank/info.js';
import { createPopulation, step, MAX_BEAT_HZ } from '../web/panes/tank/fish.js';

const { lat, lon } = DEFAULT_LOCATION;

/* ── a new tank every day ────────────────────────────────────────────────── */

test('the same date always builds the same tank — across restarts', () => {
  assert.deepEqual(buildLayout('2026-10-08'), buildLayout('2026-10-08'));
});

test('different dates build different tanks', () => {
  const a = buildLayout('2026-10-08'), b = buildLayout('2026-10-09');
  assert.notDeepEqual(a.arch, b.arch);
});

test('the tank rolls over at 03:00, not midnight', () => {
  assert.equal(seedDate(new Date(2026, 9, 9, 1, 30)), '2026-10-08');
  assert.equal(seedDate(new Date(2026, 9, 9, 2, 59)), '2026-10-08');
  assert.equal(seedDate(new Date(2026, 9, 9, 3, 0)), '2026-10-09');
});

/* The composition rules, checked across a whole year of tanks rather than
 * one lucky seed. */
const year = Array.from({ length: 365 }, (_, i) => {
  const d = new Date(2026, 0, 1 + i);
  return buildLayout(seedDate(new Date(d.getTime() + 12 * 3_600_000)));
});

test('rule: an open centre path that runs back under the arch', () => {
  for (const L of year) {
    assert.ok(L.path.backX > L.arch.leftBase && L.path.backX < L.arch.rightBase, L.date);
    assert.ok(Math.abs(L.path.frontX - W / 2) < 60, L.date);
  }
});

test('rule: tall at the back corners, nothing tall in front', () => {
  for (const L of year) {
    const [left, right] = L.stemClusters;
    assert.equal(left.side, 'left'); assert.equal(right.side, 'right');
    assert.ok(left.x1 < W * 0.3 && right.x0 > W * 0.7, L.date);
    for (const c of L.stemClusters) {
      // Stems live at the sides, never across the open centre.
      assert.ok(c.x1 < L.arch.leftBase + 80 || c.x0 > L.arch.rightBase - 80, L.date);
    }
    assert.ok(L.backBushes.top > GEO.surface + 150, 'background bushes stay low');
  }
});

test('community: one schooling species, at most one centrepiece and one grazer group, capped', () => {
  for (const L of year) {
    const { school, centerpiece, grazer } = L.community;
    assert.equal(SPECIES[school.species].role, 'school');
    if (centerpiece) assert.equal(SPECIES[centerpiece.species].role, 'centerpiece');
    if (grazer) assert.equal(SPECIES[grazer.species].role, 'grazer');
    const total = school.count + (centerpiece?.count ?? 0) + (grazer?.count ?? 0);
    assert.ok(total <= MAX_ANIMALS, `${L.date}: ${total}`);
    assert.ok(school.count >= 5, `${L.date}: a school of ${school.count} is not a school`);
  }
});

test('a year of tanks uses every schooling species — variety is real', () => {
  const seen = new Set(year.map((L) => L.community.school.species));
  assert.equal(seen.size, 6);
});

/* ── the sun ────────────────────────────────────────────────────────────── */

test('sun: high at noon, below the horizon at midnight (Asheville, October)', () => {
  // 2026-10-08 12:00 EDT = 16:00 UTC; midnight EDT = 04:00 UTC.
  const noon = sunAltitude(new Date(Date.UTC(2026, 9, 8, 17, 15)), lat, lon);
  const midnight = sunAltitude(new Date(Date.UTC(2026, 9, 8, 4, 0)), lat, lon);
  assert.ok(noon > 40 && noon < 55, `noon altitude ${noon}`);
  assert.ok(midnight < -30, `midnight altitude ${midnight}`);
});

test('sun: crosses the horizon near the real sunset (~7:10 PM EDT on Oct 8)', () => {
  const before = sunAltitude(new Date(Date.UTC(2026, 9, 8, 22, 50)), lat, lon); // 6:50 PM
  const after = sunAltitude(new Date(Date.UTC(2026, 9, 8, 23, 30)), lat, lon);  // 7:30 PM
  assert.ok(before > 0 && after < 0, `${before} -> ${after}`);
});

test('light: moonlight blue at night, dimmer but never black', () => {
  const night = lighting({ altitude: -30 });
  assert.equal(night.phase, 'night');
  assert.ok(night.color[2] > night.color[0], 'blue-dominant');
  assert.ok(night.intensity > 0.25 && night.intensity < 0.5);
});

test('light: overcast is dimmer, cooler, and kills the caustics; rain brings drops', () => {
  const clear = lighting({ altitude: 45, condition: 'clear' });
  const cloudy = lighting({ altitude: 45, condition: 'cloudy' });
  const rain = lighting({ altitude: 45, condition: 'rain' });
  assert.ok(cloudy.intensity < clear.intensity);
  assert.ok(cloudy.caustics < clear.caustics / 2);
  assert.equal(clear.drops, 'none');
  assert.equal(rain.drops, 'rain');
  assert.equal(lighting({ altitude: 45, condition: 'snow' }).drops, 'snow');
});

/* ── the slate stone ────────────────────────────────────────────────────── */

const at = (h, m = 0, day = 8) => new Date(2026, 9, day, h, m);
const ev = (id, sh, sm, eh, em, day = 8) => ({
  id, title: id, calendar: 'work', allDay: false,
  start: at(sh, sm, day).toISOString(), end: at(eh, em, day).toISOString(),
});

test('stone words match the agenda\'s countdown wording', () => {
  assert.equal(fmtCountdown(42 * 60_000), 'IN 42 MIN');
  assert.equal(fmtCountdown(72 * 60_000), 'IN 1 HR 12 MIN');
  assert.equal(fmtCountdown(120 * 60_000), 'IN 2 HR');
});

test('stone: next meeting today, with its time', () => {
  const t = stoneText(at(9, 0), { events: [ev('Design review', 9, 42, 10, 30)] });
  assert.equal(t.headline, 'IN 42 MIN');
  assert.equal(t.detail, '9:42 AM  Design review');
  assert.equal(t.glow, 0);
});

test('stone: glows from T-20, fully by T-5', () => {
  const events = [ev('x', 10, 0, 10, 30)];
  assert.equal(stoneText(at(9, 30), { events }).glow, 0);
  assert.ok(stoneText(at(9, 45), { events }).glow > 0.3);
  assert.equal(stoneText(at(9, 55), { events }).glow, 1);
});

test('stone: tomorrow\'s first event after the last of today', () => {
  const t = stoneText(at(18, 0), { events: [], tomorrow: [ev('Standup', 9, 0, 9, 15, 9)] });
  assert.equal(t.headline, 'TOMORROW 9:00 AM');
  assert.equal(t.detail, 'Standup');
});

test('stone: nothing at all reads as all clear', () => {
  assert.equal(stoneText(at(18, 0), { events: [], tomorrow: [] }).headline, 'ALL CLEAR');
});

/* ── the fish ───────────────────────────────────────────────────────────── */

test('fish stay in the tank and in their water band over ten simulated minutes', () => {
  for (const date of ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-12']) {
    const pop = createPopulation(buildLayout(date), { perches: [{ x: 500, y: 200 }, { x: 800, y: 220 }] });
    for (let i = 0; i < 20 * 600; i++) step(pop, 0.05);
    for (const a of pop.agents) {
      assert.ok(a.x > 20 && a.x < W - 20, `${date} ${a.sp.id} x=${a.x}`);
      if (a.sp.style !== 'cling') {
        assert.ok(a.y > a.sp.band[0] - 15 && a.y < a.sp.band[1] + 15, `${date} ${a.sp.id} y=${a.y}`);
      }
      assert.ok(Number.isFinite(a.phase) && Number.isFinite(a.face), `${date} ${a.sp.id} finite`);
    }
  }
});

test('the school stays a school — not scattered across the tank', () => {
  const pop = createPopulation(buildLayout('2026-10-08'));
  for (let i = 0; i < 20 * 300; i++) step(pop, 0.05);
  const school = pop.agents.filter((a) => a.sp.style === 'school');
  const xs = school.map((a) => a.x);
  assert.ok(Math.max(...xs) - Math.min(...xs) < 700, `spread ${Math.max(...xs) - Math.min(...xs)}`);
});

test('tail beats stay under the 4 fps Nyquist limit (2 Hz)', () => {
  assert.ok(MAX_BEAT_HZ < 2);
});
