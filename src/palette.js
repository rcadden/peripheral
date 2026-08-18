/* palette.js — wallpaper -> design tokens.
 *
 * THE RULE: the wallpaper contributes HUE ONLY. Lightness is forced to values
 * that suit a 6.86" panel read from three feet, and every token is then gated
 * against the ground colour for contrast before it is allowed out. A pastel
 * beach photo must not be able to produce an unreadable panel.
 *
 * Wallpaper proposes. Contrast vetoes.
 *
 * Reads %APPDATA%\Microsoft\Windows\Themes\TranscodedWallpaper rather than the
 * HKCU\Control Panel\Desktop\WallPaper registry value: under Windows Spotlight
 * or a theme slideshow the registry path goes stale or points at the transcoded
 * copy anyway, whereas the transcoded file is always the image on screen now.
 *
 * Writes web/tokens.css. Run with `npm run palette`.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKENS_OUT = path.resolve(__dirname, '..', 'web', 'tokens.css');

export const WALLPAPER_PATH = path.join(
  process.env.APPDATA ?? '',
  'Microsoft', 'Windows', 'Themes', 'TranscodedWallpaper',
);

/* Contrast floors, by role. WCAG AA body text is 4.5:1; we hold the primary
 * tiers well above it because this is glanced at, not read. The faint tier is
 * intentionally below AA — it carries events already in the past, where low
 * salience IS the information.
 *
 * `calendar` is its own tier (2026-08-18): a small tick/dot marking which
 * calendar an event is on, distinct from `hero`/`cool`'s job of marking
 * urgency. Floored at 6.0, not 4.5 — Ricky, explicitly: "contrast is the
 * point." A tiny marker that's easy to miss defeats the purpose entirely. */
const GATE = { hero: 4.5, cool: 7.0, text: 7.0, dim: 4.5, faint: 3.0, calendar: 6.0 };

/* Why --accent-hero's floor is 4.5 and not 7.0 (lowered 2026-08-17).
 *
 * A 7:1 floor cannot be met by a saturated blue. Luminance weights green at
 * 0.7152 and blue at 0.0722, so pushing a blue to 7:1 against a near-black
 * ground forces it toward cyan and then toward pastel — measured: hue 212 at
 * 85% saturation only reaches 7:1 at lightness 0.64, by which point it is
 * #559ef1. The first blue palette shipped #47cff5 for exactly this reason and
 * Ricky's verdict was "a little too light". The gate was the cause, not the
 * hue choice.
 *
 * 4.5:1 is the right floor for this token because of the SIZES IT IS USED AT:
 *   - the countdown is 106px, and the NOW badge is 106px on a filled block.
 *     WCAG treats anything ≥24px as large text: AA is 3:1, AAA is 4.5:1. So
 *     4.5 clears AAA with room to spare on the element that dominates the panel.
 *   - the smallest use is a 22px agenda row, where 4.5:1 is AA for normal text.
 * The old uniform 7.0 was a single number applied to roles with very different
 * type sizes. This is not a relaxation of the principle — it is the principle
 * applied per role, which is what --text-faint's 3.0 floor already did.
 *
 * --accent-cool stays at 7.0. It is the quieter of the two and desaturating it
 * to reach that floor is exactly the subordinate reading we want.
 */

/* ── HUE POLICY — the third clause ───────────────────────────────────────
 * "Wallpaper proposes, contrast vetoes" — and now: Ricky overrules.
 *
 * The accents used to take the wallpaper's DOMINANT hue for --accent-cool and
 * its COMPLEMENT for --accent-hero. That is a sound way to guarantee the two
 * accents are told apart, and against the measured wallpaper (dominant 208,
 * blue) it produced a complement of ~70 — an acid yellow-green, #d9f325.
 * It was maximally legible and, in Ricky's words, obnoxious. Judged on a real
 * panel on a real desk, 2026-08-17.
 *
 * So the accent hues are now PINNED, and only ground/text still inherit from
 * the wallpaper. Both accents are blue; they are separated by hue distance
 * plus a deliberate lightness split instead of by complement:
 *
 *   --accent-hero  ice/cyan, brighter — NOW, the countdown, the progress fill
 *   --accent-cool  periwinkle, calmer — the next event, the work calendar dot
 *
 * They appear on ADJACENT ROWS in the agenda list (is-now above is-next), so
 * "both are blue" is a real constraint, not a free choice. 35 degrees apart
 * with different lightness is the minimum that still reads as two colours at
 * 6.86" from three feet. Do not narrow it without looking at the glass.
 *
 * Override per-run if you want to experiment; the contrast gate still applies
 * to whatever you pick, so you cannot produce an unreadable panel this way.
 */
const HERO_HUE = Number(process.env.PERIPHERAL_HERO_HUE ?? 212);
const COOL_HUE = Number(process.env.PERIPHERAL_COOL_HUE ?? 210);

/* Calendar-identity hues (2026-08-18) — a separate concern from HERO_HUE/
 * COOL_HUE above, which mark URGENCY (now / next) and stay blue on purpose.
 * Ricky, when offered "shades of one hue" for calendar identity: "I don't
 * want shades - I want completely different colors. Contrast is the point."
 * So these are genuinely different hue families, chosen to sit far from
 * both the blue accents (~210) AND the amber --stale badge (~30):
 *   work      ~140, green — reads clearly, and luminance weights green
 *             heavily (0.7152), so it clears a high contrast floor without
 *             desaturating toward pastel the way the blues had to.
 *   personal  ~330, magenta/pink — far from both green and blue, and not
 *             readable as an error/alert state the way pure red would be.
 * Being genuinely different hues from accent-hero/accent-cool is what makes
 * this safe to introduce at all — a calendar tick and a phase tick never
 * compete for the same meaning. */
const CALENDAR_WORK_HUE = Number(process.env.PERIPHERAL_CALENDAR_WORK_HUE ?? 140);
const CALENDAR_PERSONAL_HUE = Number(process.env.PERIPHERAL_CALENDAR_PERSONAL_HUE ?? 330);

/* ── colour maths ───────────────────────────────────────────────────────── */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
      hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [r1 + m, g1 + m, b1 + m].map((v) => Math.round(clamp(v, 0, 1) * 255));
}

export const toHex = ([r, g, b]) =>
  '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

/* WCAG 2.x relative luminance. */
export function luminance([r, g, b]) {
  const lin = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrast(rgbA, rgbB) {
  const a = luminance(rgbA), b = luminance(rgbB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/* Raise lightness in small steps until the pair clears its floor. Hue and
 * saturation are preserved — we brighten, we never desaturate to cheat. */
function gated(hue, sat, startL, groundRgb, floor) {
  for (let l = startL; l <= 0.97; l += 0.01) {
    const rgb = hslToRgb(hue, sat, l);
    if (contrast(rgb, groundRgb) >= floor) return { rgb, l };
  }
  // Unreachable in practice against a near-black ground, but never return
  // something that failed the gate: fall back to plain white.
  return { rgb: [255, 255, 255], l: 1 };
}

/* ── wallpaper sampling ─────────────────────────────────────────────────── */

/* Returns { dominantHue, secondaryHue, meanSat } from a 64x64 downsample.
 * Uses sharp when available. sharp is an optionalDependency so a bare clone
 * still runs — it just falls back to the committed default tokens. */
export async function sampleWallpaper(file = WALLPAPER_PATH) {
  let sharp;
  try {
    ({ default: sharp } = await import('sharp'));
  } catch {
    throw new Error('sharp not installed — run `npm i` to enable palette extraction');
  }

  const N = 64;
  const { data } = await sharp(file)
    .resize(N, N, { fit: 'cover' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Bucket hues into 15-degree bins, weighted by saturation * pixel count, and
  // ignore near-grey pixels — they carry no usable hue signal.
  const BINS = 24;
  const bins = new Float64Array(BINS);
  let satSum = 0, satCount = 0;

  for (let i = 0; i < data.length; i += 3) {
    const [r, g, b] = [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d < 0.04) continue;                    // grey
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = ((h * 60) % 360 + 360) % 360;
    bins[Math.floor(h / (360 / BINS))] += s;
    satSum += s; satCount++;
  }

  const ranked = [...bins]
    .map((weight, idx) => ({ weight, hue: idx * (360 / BINS) + (360 / BINS) / 2 }))
    .sort((a, b) => b.weight - a.weight);

  const dominantHue = ranked[0]?.hue ?? 210;
  // Secondary must be a genuinely different hue family, not the next bin over.
  const secondaryHue = ranked.find(
    (r) => Math.abs(((r.hue - dominantHue + 540) % 360) - 180) < 120,
  )?.hue ?? (dominantHue + 150) % 360;

  return {
    dominantHue,
    secondaryHue,
    meanSat: satCount ? satSum / satCount : 0.4,
  };
}

/* ── token derivation ───────────────────────────────────────────────────── */

export function deriveTokens({ dominantHue, secondaryHue, meanSat }) {
  const hD = dominantHue;
  // Still sampled and still reported, but no longer feeds a token — the accent
  // hues are pinned. Kept in the report because it is the number that explains
  // where the old yellow came from, and it is what you would restore if the
  // complementary scheme is ever revisited.
  const hS = secondaryHue;

  // Ground: dominant hue, lightness pinned near black. A touch of the hue keeps
  // the panel from looking like a dead LCD without lifting luminance.
  const groundRgb = hslToRgb(hD, 0.30, 0.042);
  const ground2Rgb = hslToRgb(hD, 0.24, 0.095);
  const ruleRgb = hslToRgb(hD, 0.22, 0.145);

  // Accent saturation tracks the wallpaper's vividness but is floored high:
  // at 6.86" read from a few feet, a desaturated accent reads as grey. Tuned
  // against the measured 2026-08-17 wallpaper (hue 208/70, mean sat 0.44),
  // where a 0.55 floor produced a visibly muddy #66a3d6.
  const accentSat = clamp(Math.max(meanSat, 0.78) * 1.15, 0.70, 1.0);

  /* Accent hues are pinned (see HUE_POLICY above); the wallpaper no longer
   * reaches them. Start lightnesses differ so the two blues separate by
   * brightness as well as hue — `gated` only ever raises lightness, so these
   * are floors, and the hero stays the brighter of the two after gating. */
  /* The two accents are now the SAME hue family, separated by saturation and
   * lightness rather than by hue. Deep and vivid = happening now; pale and
   * desaturated = merely next. That hierarchy survives at 6.86" from three
   * feet, where a 20-degree hue difference does not.
   *
   * `gated` only ever raises lightness, so these start values are floors: the
   * hero starts deep and stays deep because 4.5:1 is already met there. */
  const hero = gated(HERO_HUE, clamp(accentSat, 0.85, 1.0), 0.50, groundRgb, GATE.hero);
  const cool = gated(COOL_HUE, 0.42, 0.62, groundRgb, GATE.cool);
  const text = gated(hD, 0.16, 0.93, groundRgb, GATE.text);
  const dim = gated(hD, 0.12, 0.60, groundRgb, GATE.dim);
  const faint = gated(hD, 0.10, 0.42, groundRgb, GATE.faint);
  // Calendar-identity accents — fixed hues (see CALENDAR_*_HUE above), high
  // saturation floor for the same "don't read as grey at 6.86"" reason the
  // blues use, gated at 6.0 rather than borrowing hero/cool's floors because
  // this is its own tier with its own point (visibility of a small marker).
  const calWork = gated(CALENDAR_WORK_HUE, 0.65, 0.45, groundRgb, GATE.calendar);
  const calPersonal = gated(CALENDAR_PERSONAL_HUE, 0.65, 0.55, groundRgb, GATE.calendar);

  return {
    tokens: {
      '--ground': toHex(groundRgb),
      '--ground-2': toHex(ground2Rgb),
      '--rule': toHex(ruleRgb),
      '--text': toHex(text.rgb),
      '--text-dim': toHex(dim.rgb),
      '--text-faint': toHex(faint.rgb),
      '--accent-hero': toHex(hero.rgb),
      '--accent-cool': toHex(cool.rgb),
      '--accent-calendar-work': toHex(calWork.rgb),
      '--accent-calendar-personal': toHex(calPersonal.rgb),
      '--stale': '#d98a3d',
    },
    report: {
      dominantHue: +hD.toFixed(1),
      secondaryHue: +hS.toFixed(1),
      meanSat: +meanSat.toFixed(3),
      ratios: {
        hero: +contrast(hero.rgb, groundRgb).toFixed(2),
        cool: +contrast(cool.rgb, groundRgb).toFixed(2),
        text: +contrast(text.rgb, groundRgb).toFixed(2),
        dim: +contrast(dim.rgb, groundRgb).toFixed(2),
        faint: +contrast(faint.rgb, groundRgb).toFixed(2),
        calWork: +contrast(calWork.rgb, groundRgb).toFixed(2),
        calPersonal: +contrast(calPersonal.rgb, groundRgb).toFixed(2),
      },
    },
  };
}

export function renderCss({ tokens, report }) {
  const r = report.ratios;
  return `/* ─────────────────────────────────────────────────────────────────────────
   tokens.css — GENERATED. Do not hand-edit; \`npm run palette\` overwrites.

   Sampled ${new Date().toISOString()} from the current wallpaper.
     dominant hue ${report.dominantHue}deg · secondary hue ${report.secondaryHue}deg · mean sat ${report.meanSat}

   Hue comes from the wallpaper. Lightness is forced, then gated:
     --accent-hero ${String(r.hero).padStart(6)}:1  (floor ${GATE.hero})
     --accent-cool ${String(r.cool).padStart(6)}:1  (floor ${GATE.cool})
     --text        ${String(r.text).padStart(6)}:1  (floor ${GATE.text})
     --text-dim    ${String(r.dim).padStart(6)}:1  (floor ${GATE.dim})
     --text-faint  ${String(r.faint).padStart(6)}:1  (floor ${GATE.faint}, de-emphasised tier)
     --accent-calendar-work     ${String(r.calWork).padStart(6)}:1  (floor ${GATE.calendar})
     --accent-calendar-personal ${String(r.calPersonal).padStart(6)}:1  (floor ${GATE.calendar})
   ───────────────────────────────────────────────────────────────────────── */

:root {
${Object.entries(tokens).map(([k, v]) => `  ${k}: ${v};`).join('\n')}

  /* geometry — the panel is a fixed 1280x480 of glass */
  --pane-w: 1280px;
  --pane-h: 480px;
  --pad: 30px;
  --font-mono: "Cascadia Mono", "Cascadia Code", Consolas, ui-monospace, monospace;
}
`;
}

export async function regenerate() {
  const sample = await sampleWallpaper();
  const derived = deriveTokens(sample);
  await fs.writeFile(TOKENS_OUT, renderCss(derived), 'utf8');
  return derived;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  regenerate()
    .then(({ tokens, report }) => {
      console.log('[palette] wrote web/tokens.css');
      console.log('[palette] hue', report.dominantHue, '/', report.secondaryHue,
                  '· mean sat', report.meanSat);
      console.table(report.ratios);
      console.log(tokens);
    })
    .catch((err) => {
      console.error('[palette]', err.message);
      console.error('[palette] keeping existing web/tokens.css');
      process.exitCode = 1;
    });
}
