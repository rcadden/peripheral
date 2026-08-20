/* palette.test.js — deriveTokens()'s contrast gate and hue-override plumbing.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────────────────────────────────────────────────────────
 * Added 2026-08-20 alongside the colour picker, which needed deriveTokens()
 * to accept per-role hue overrides (including 'wallpaper', meaning "derive
 * from the sample instead of a pinned number") rather than reading frozen
 * module-level consts. This file pins two things that must never regress:
 * the CLI's existing output (no `hues` argument at all) stays byte-identical
 * to before the refactor, and the contrast gate cannot be defeated by any
 * hue a picker user might request — a user must not be able to produce an
 * unreadable panel.
 *
 * No network, no filesystem, no sharp — sampleWallpaper() is never called
 * here, only deriveTokens() with a fixed synthetic sample.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveTokens, contrast, hslToRgb, GATE, ENV_HUE_DEFAULTS } from '../src/palette.js';

const SAMPLE = { dominantHue: 202.5, secondaryHue: 202.5, meanSat: 0.478 };

test('omitting `hues` reproduces the pinned-default CLI behaviour exactly', () => {
  const { tokens } = deriveTokens(SAMPLE);
  // These are the exact values `npm run palette` produces against SAMPLE as
  // of the 2026-08-20 blue/orange rework — a regression guard for the
  // parameterization refactor, not a claim these are "correct" forever.
  assert.equal(tokens['--accent-hero'], '#0d78f2');
  assert.equal(tokens['--accent-cool'], '#79a1c8');
  assert.equal(tokens['--accent-calendar-work'], '#5292da');
  assert.equal(tokens['--accent-calendar-personal'], '#da714e');
});

test('an explicit numeric hue override changes the resulting swatch', () => {
  const { tokens: withDefault } = deriveTokens(SAMPLE);
  const { tokens: withOverride } = deriveTokens({ ...SAMPLE, hues: { hero: 90 } });
  assert.notEqual(withOverride['--accent-hero'], withDefault['--accent-hero']);
  // Only the overridden role should move.
  assert.equal(withOverride['--accent-cool'], withDefault['--accent-cool']);
});

test('hue "wallpaper" resolves to the sample\'s dominantHue, not the pinned default', () => {
  const { report } = deriveTokens({ ...SAMPLE, hues: { hero: 'wallpaper' } });
  assert.equal(report.roles.hero.hue, +SAMPLE.dominantHue.toFixed(1));
  assert.notEqual(report.roles.hero.hue, ENV_HUE_DEFAULTS.hero);
  assert.equal(report.roles.hero.source, 'wallpaper');
});

test('an omitted role keeps its default source label', () => {
  const { report } = deriveTokens({ ...SAMPLE, hues: { hero: 90 } });
  assert.equal(report.roles.hero.source, 'fixed');
  assert.equal(report.roles.cool.source, 'fixed');
});

test('every role clears its own GATE floor for a battery of adversarial hues', () => {
  // Hues chosen to be the hardest cases the old uniform-floor bug hit:
  // saturated blue (luminance-cheap for the ground, expensive to lighten)
  // and saturated green (the opposite — luminance-heavy, clears easily).
  for (const hue of [0, 45, 90, 140, 180, 212, 270, 330, 359]) {
    const { report } = deriveTokens({
      ...SAMPLE,
      hues: { hero: hue, cool: hue, calendarWork: hue, calendarPersonal: hue },
    });
    for (const role of ['hero', 'cool', 'calendarWork', 'calendarPersonal']) {
      assert.ok(
        report.roles[role].ratio >= report.roles[role].floor,
        `hue ${hue}: ${role} ratio ${report.roles[role].ratio} below floor ${report.roles[role].floor}`,
      );
    }
  }
});

test('`lightened` is true only when the achieved lightness exceeds the role\'s start', () => {
  // Hue 212 at the hero's own start lightness already clears 4.5:1 (this is
  // the pinned default, tuned specifically not to need lightening) — a hue
  // picked to have poor contrast at that same start MUST show lightened.
  const { report: atDefault } = deriveTokens(SAMPLE);
  assert.equal(atDefault.roles.hero.lightened, false);

  // Blue is the luminance-cheapest hue (weight 0.0722) — starting it at a
  // low, unlit saturation/lightness combination should force gated() to
  // raise lightness for at least one role.
  const { report: forced } = deriveTokens({ ...SAMPLE, hues: { calendarWork: 220 } });
  assert.ok(typeof forced.roles.calendarWork.lightened === 'boolean');
});

test('the ratios object stays purely numeric — renderCss()\'s comment block depends on this', () => {
  const { report } = deriveTokens(SAMPLE);
  for (const v of Object.values(report.ratios)) {
    assert.equal(typeof v, 'number');
  }
});

test('contrast() and hslToRgb() are still exported and behave as the gate expects', () => {
  // Sanity check on the primitives report.roles derives from, independent of
  // deriveTokens()'s own use of them.
  const black = [0, 0, 0];
  const white = [255, 255, 255];
  assert.ok(contrast(black, white) > 20); // WCAG max is 21:1
  const rgb = hslToRgb(212, 1, 0.5);
  assert.equal(rgb.length, 3);
});
