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
 * salience IS the information. */
const GATE = { hero: 7.0, cool: 7.0, text: 7.0, dim: 4.5, faint: 3.0 };

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

  const hero = gated(hS, accentSat, 0.55, groundRgb, GATE.hero);
  const cool = gated(hD, accentSat, 0.62, groundRgb, GATE.cool);
  const text = gated(hD, 0.16, 0.93, groundRgb, GATE.text);
  const dim = gated(hD, 0.12, 0.60, groundRgb, GATE.dim);
  const faint = gated(hD, 0.10, 0.42, groundRgb, GATE.faint);

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
