/* layout.js — today's aquascape, as numbers.
 *
 * Roadmap, Sprint 9, "A new tank every day":
 *   - Seed = local date: the same day always produces the same tank, across
 *     restarts.
 *   - Layout varies within the style — arch shape, plant mix and colour
 *     balance, carpet extent, path curve, scatter — under composition rules
 *     that keep it reading as a deliberate aquascape (open centre path, tall
 *     at back and sides, low in front).
 *   - Rebuilt at 03:00 under night lighting.
 *
 * Pure: a date string in, a plain object out. paint.js turns this into
 * pixels; test/ checks the composition rules hold across a whole year.
 */

import { makeRng, hashString } from './rng.js';
import { SPECIES, SCHOOLING, CENTERPIECES, GRAZERS, MAX_ANIMALS } from './species.js';

export const W = 1280;
export const H = 480;

/** Pane-space landmarks shared by painting, fish and info. */
export const GEO = Object.freeze({
  hoodBottom: 24,      // light-bar fixture occupies 0..24
  surface: 58,         // water surface line
  substrateBack: 362,  // where the substrate meets the backdrop
  glassBottom: 474,    // bottom frame of the tank starts here
});

/** Tanks rebuild at 03:00, so 01:00 still belongs to yesterday's tank. */
export const REBUILD_HOUR = 3;

/** The date string that seeds the tank showing at `now` (local time). */
export function seedDate(now) {
  const d = new Date(now.getTime() - REBUILD_HOUR * 3_600_000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* Stem-plant colour families, deepening toward the tips (the reference
 * photo's red/orange/pink stems). Each is [base green, mid, tip]. */
export const STEM_PALETTES = {
  red:    ['#4f8a2c', '#a8452e', '#d8362a'],
  orange: ['#5a8f2e', '#c46a2a', '#f08a2c'],
  pink:   ['#5b8c34', '#b85a7a', '#ec7aa8'],
  green:  ['#3f7f2a', '#5fa83a', '#93cf4f'],
};

const MOODS = {
  red:    ['red', 'red', 'orange', 'green'],
  orange: ['orange', 'orange', 'red', 'green'],
  pink:   ['pink', 'pink', 'red', 'green'],
  mixed:  ['red', 'orange', 'pink', 'green'],
};

/**
 * @param {string} date  'YYYY-MM-DD' — normally seedDate(now)
 */
export function buildLayout(date) {
  const seed = hashString(`peripheral-tank:${date}`);
  const r = makeRng(seed);

  /* ── hardscape: the central driftwood arch ─────────────────────────────── */
  const ar = r.fork('arch');
  const leftBase = ar.range(0.29, 0.38) * W;
  const rightBase = ar.range(0.62, 0.71) * W;
  const apexX = ar.range(0.44, 0.56) * W;
  const arch = {
    leftBase,
    rightBase,
    apexX,
    apexY: ar.range(96, 150),
    /* Which limb crosses in front at the top — purely visual variety. */
    leftInFront: ar.chance(0.5),
    lean: ar.range(-0.15, 0.15),
    thickness: ar.range(21, 29),
    branches: ar.int(5, 9),
    sideRoots: ar.int(1, 3),
    /* An optional smaller piece of wood at one side, for asymmetry. */
    sidePiece: ar.chance(0.55) ? { side: ar.pick(['left', 'right']), size: ar.range(0.6, 1) } : null,
    mossDensity: ar.range(0.55, 1),
  };

  /* ── the sand path: open centre, always ─────────────────────────────────
   * Its back end sits between the arch bases, so the eye runs under the arch
   * into depth — the single composition rule that most separates an
   * aquascape from a planted box. */
  const pr = r.fork('path');
  const archMid = (leftBase + rightBase) / 2;
  const path = {
    frontX: W / 2 + pr.range(-40, 40),
    frontWidth: pr.range(540, 620),
    backX: archMid + pr.range(-30, 30),
    backWidth: pr.range(70, 120),
    curve: pr.range(-70, 70),
  };

  /* ── plants ─────────────────────────────────────────────────────────── */
  const pl = r.fork('plants');
  const moodName = pl.pick(Object.keys(MOODS));
  const families = MOODS[moodName];

  /* Tall stem clusters at the back corners — "tall at back and sides". Tops
   * reach high into the water column; nothing tall is ever placed in front. */
  const stemClusters = [];
  const corner = (x0, x1, side) => ({
    side,
    x0, x1,
    top: pl.range(72, 150),
    count: pl.int(14, 24),
    family: pl.pick(families),
    lean: side === 'left' ? pl.range(0.0, 0.25) : pl.range(-0.25, 0.0),
  });
  stemClusters.push(corner(pl.range(30, 70), pl.range(250, 330), 'left'));
  stemClusters.push(corner(pl.range(950, 1030), pl.range(1210, 1250), 'right'));
  /* A second, shorter species in front of each corner bush — layered depth. */
  if (pl.chance(0.8)) {
    stemClusters.push({ ...corner(pl.range(150, 220), pl.range(330, 400), 'left'),
      top: pl.range(190, 250), count: pl.int(8, 14), family: pl.pick(families) });
  }
  if (pl.chance(0.8)) {
    stemClusters.push({ ...corner(pl.range(880, 940), pl.range(1080, 1140), 'right'),
      top: pl.range(190, 250), count: pl.int(8, 14), family: pl.pick(families) });
  }
  /* Low background bushes visible through the arch, kept short so the arch
   * still reads against the bright backdrop. */
  const backBushes = {
    count: pl.int(4, 7),
    top: pl.range(250, 300),
  };

  const ferns = {
    /* Broad-leaf ferns tied to the wood bases. */
    clumps: [
      { x: leftBase + pl.range(-30, 10), count: pl.int(6, 10) },
      { x: rightBase + pl.range(-10, 30), count: pl.int(6, 10) },
      ...(pl.chance(0.5) ? [{ x: apexX + pl.range(-140, 140), count: pl.int(3, 5), high: true }] : []),
    ],
  };

  const carpet = {
    /* Fraction of the front substrate the bright carpet covers. */
    extent: pl.range(0.55, 0.95),
    hue: pl.range(-8, 8),
  };

  const grass = {
    left: pl.int(10, 22),
    right: pl.int(10, 22),
    height: pl.range(180, 300),
  };

  const scatter = {
    pebbles: pl.int(22, 40),
    gravelDarkness: pl.range(0.85, 1.1),
  };

  /* ── community ─────────────────────────────────────────────────────────
   * TWO shoals of different species (fish-behaviour-spec.md, Q2 — approved
   * 2026-10-08), optionally one centrepiece, optionally one grazer group.
   * Counts are capped so the total never exceeds MAX_ANIMALS.
   *
   * Each shoal keeps a ZONE, as in Ricky's reference clips: one mid-upper,
   * one lower, each over about two thirds of the width on opposite sides, so
   * they overlap in the middle. Nothing ever moves a zone — the population's
   * spread is meant to look the same at minute 1 and minute 5.
   *
   * Shoal sizes from spec Q1: the main shoal 14-16, the second 8-10. */
  const cr = r.fork('community');
  const schoolId = cr.pick(SCHOOLING);
  const school2Id = cr.pick(SCHOOLING.filter((id) => id !== schoolId));
  const upperLeft = cr.chance(0.5);
  const left = { x: [60, 900] }, right = { x: [380, 1220] };
  const school = { species: schoolId, count: cr.int(14, 16),
    zone: { ...(upperLeft ? left : right), y: [85, 235] } };
  const school2 = { species: school2Id, count: cr.int(8, 10),
    zone: { ...(upperLeft ? right : left), y: [190, 315] } };
  const centerpiece = cr.chance(0.7)
    ? (() => { const id = cr.pick(CENTERPIECES); return { species: id, count: cr.int(...SPECIES[id].count) }; })()
    : null;
  const grazer = cr.chance(0.8)
    ? (() => { const id = cr.pick(GRAZERS); return { species: id, count: cr.int(...SPECIES[id].count) }; })()
    : null;

  const groups = [school, school2, centerpiece, grazer].filter(Boolean);
  let total = groups.reduce((n, g) => n + g.count, 0);
  while (total > MAX_ANIMALS) { (school.count > school2.count ? school : school2).count--; total--; }

  return {
    date,
    seed,
    mood: moodName,
    arch,
    path,
    stemClusters,
    backBushes,
    ferns,
    carpet,
    grass,
    scatter,
    community: { school, school2, centerpiece, grazer },
  };
}
