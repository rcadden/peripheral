/* species.js — code-defined fish and shrimp presets.
 *
 * Roadmap, Sprint 9: "code-defined species presets (body spline, fins,
 * pattern functions, size, swim style, depth band, behaviours), picked as a
 * plausible community". This file is the data half; paint.js draws each one
 * from its `id`, and fish.js moves it according to `style`.
 *
 * Units: `length` is the on-screen nose-to-tail length in px at the front of
 * the tank (depth 0). The tank is ~90cm of aquarium across 1280px, so a 3cm
 * neon tetra is ~40px — then everything is drawn 30% larger than true
 * scale, because a true-scale tetra is a red speck from three feet (seen in
 * the first render, 2026-10-08). `band` is the vertical water band in pane px (0 = top
 * of the pane), and `speed` is cruising px/s.
 *
 * ── MOTION IS DESIGNED FOR 4 FPS ─────────────────────────────────────────
 * Ricky chose 4 fps (2026-10-08) against the panel's reliability record. At
 * that rate anything faster than ~2 Hz aliases into nonsense, so tail beats
 * sit well under 1.5 Hz and cruising speeds are slow: a neon at 30 px/s moves
 * 7-8 px per frame, which still reads as swimming rather than teleporting.
 */

/** @typedef {'school'|'cruise'|'bottom'|'cling'|'shrimp'} SwimStyle */

export const SPECIES = {
  /* ── schooling species (exactly one per tank) ─────────────────────────── */
  neon:      { id: 'neon',      name: 'Neon tetra',        role: 'school', style: 'school',
               length: 49, depth: 0.30, band: [130, 330], speed: [14, 30], count: [11, 15], beatHz: 1.1 },
  cardinal:  { id: 'cardinal',  name: 'Cardinal tetra',    role: 'school', style: 'school',
               length: 55, depth: 0.30, band: [130, 330], speed: [14, 30], count: [10, 14], beatHz: 1.0 },
  ember:     { id: 'ember',     name: 'Ember tetra',       role: 'school', style: 'school',
               length: 36, depth: 0.32, band: [120, 320], speed: [12, 26], count: [13, 18], beatHz: 1.2 },
  rummynose: { id: 'rummynose', name: 'Rummy-nose tetra',  role: 'school', style: 'school',
               length: 60, depth: 0.27, band: [140, 330], speed: [16, 32], count: [9, 12], beatHz: 1.0 },
  harlequin: { id: 'harlequin', name: 'Harlequin rasbora', role: 'school', style: 'school',
               length: 57, depth: 0.33, band: [120, 300], speed: [14, 28], count: [9, 13], beatHz: 1.0 },
  chili:     { id: 'chili',     name: 'Chili rasbora',     role: 'school', style: 'school',
               length: 29, depth: 0.30, band: [140, 320], speed: [10, 22], count: [15, 20], beatHz: 1.3 },

  /* ── centrepiece (optional, one species) ──────────────────────────────── */
  honey:     { id: 'honey',     name: 'Honey gourami',     role: 'centerpiece', style: 'cruise',
               length: 81, depth: 0.48, band: [100, 280], speed: [7, 14], count: [1, 2], beatHz: 0.7 },
  dwarf:     { id: 'dwarf',     name: 'Dwarf gourami',     role: 'centerpiece', style: 'cruise',
               length: 94, depth: 0.50, band: [100, 280], speed: [7, 13], count: [1, 1], beatHz: 0.7 },
  pearl:     { id: 'pearl',     name: 'Pearl gourami',     role: 'centerpiece', style: 'cruise',
               length: 120, depth: 0.46, band: [100, 270], speed: [6, 12], count: [1, 2], beatHz: 0.6 },

  /* ── grazers (optional, one group) ────────────────────────────────────── */
  corydoras: { id: 'corydoras', name: 'Panda corydoras',   role: 'grazer', style: 'bottom',
               length: 52, depth: 0.55, band: [346, 368], speed: [8, 18], count: [4, 6], beatHz: 1.0 },
  otocinclus:{ id: 'otocinclus',name: 'Otocinclus',        role: 'grazer', style: 'cling',
               length: 39, depth: 0.25, band: [150, 370], speed: [3, 8], count: [2, 3], beatHz: 1.2 },
  amano:     { id: 'amano',     name: 'Amano shrimp',      role: 'grazer', style: 'shrimp',
               length: 44, depth: 0.45, band: [338, 368], speed: [3, 8], count: [3, 5], beatHz: 0.8 },
  cherry:    { id: 'cherry',    name: 'Cherry shrimp',     role: 'grazer', style: 'shrimp',
               length: 29, depth: 0.45, band: [340, 368], speed: [2, 6], count: [6, 9], beatHz: 0.8 },
};

export const SCHOOLING = ['neon', 'cardinal', 'ember', 'rummynose', 'harlequin', 'chili'];
export const CENTERPIECES = ['honey', 'dwarf', 'pearl'];
export const GRAZERS = ['corydoras', 'otocinclus', 'amano', 'cherry'];

/**
 * Most animals the tank will run. The roadmap says "count capped by the
 * measured frame budget"; that measurement can only happen on Ricky's machine,
 * so this is a conservative cap that a software-GL fallback can still carry
 * at 4 fps (measured in this repo's headless SwiftShader, see CHANGELOG).
 */
export const MAX_ANIMALS = 30;
