/* info.js — the information that lives inside the scene.
 *
 * Roadmap, Sprint 9: "Every piece of information lives inside the scene — no
 * header bar, no UI chrome."
 *
 *   Next meeting   a flat inscribed slate stone in the sand path, foreground
 *                  centre. Carved lettering at high contrast — legibility
 *                  beats subtlety. Updates once a minute; glows faintly from
 *                  ~T-20.
 *   Clock + temp   a stick-on digital thermometer on the glass, lower right.
 *
 * The wording functions are pure and match the agenda's own (agenda.js
 * fmtCountdown/fmtTime), so the stone never words a time differently from
 * the pane that replaces it ten minutes later. Painting is split from wording
 * so test/ can pin the words.
 */

import { stoneSubject } from './mode.js';

/* ── wording (pure) ─────────────────────────────────────────────────────── */

export function fmtTime(d) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h < 12 ? 'AM' : 'PM';
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

/** Same coarseness as the agenda's fmtCountdown. */
export function fmtCountdown(ms) {
  if (ms <= 0) return 'NOW';
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 1) return 'IN <1 MIN'; // the stone repaints once a minute
  if (totalMin < 60) return `IN ${totalMin} MIN`;
  const hr = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (hr >= 10 || min === 0) return `IN ${hr} HR`;
  return `IN ${hr} HR ${min} MIN`;
}

function fmtRemaining(ms) {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  if (totalMin < 60) return `${totalMin} MIN LEFT`;
  const hr = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return min ? `${hr} HR ${min} MIN LEFT` : `${hr} HR LEFT`;
}

/** Minutes at which the stone starts to glow (roadmap: "from ~T-20"). */
export const GLOW_FROM_MIN = 20;

/**
 * The stone's two lines and whether it glows.
 *
 * @param {Date} now
 * @param {object|null} state  /api/state
 * @returns {{headline: string, detail: string, glow: number}}  glow in [0,1]
 */
export function stoneText(now, state) {
  const s = stoneSubject(now, state);
  if (s.kind === 'now') {
    return { headline: `NOW · ${fmtRemaining(new Date(s.event.end) - now)}`, detail: s.event.title, glow: 1 };
  }
  if (s.kind === 'today') {
    const ms = new Date(s.event.start) - now;
    const mins = ms / 60_000;
    const glow = mins <= GLOW_FROM_MIN ? Math.min(1, 1 - (mins - 5) / (GLOW_FROM_MIN - 5)) : 0;
    return {
      headline: fmtCountdown(ms),
      detail: `${fmtTime(new Date(s.event.start))}  ${s.event.title}`,
      glow: Math.max(0, glow),
    };
  }
  if (s.kind === 'tomorrow') {
    return { headline: `TOMORROW ${fmtTime(new Date(s.event.start))}`, detail: s.event.title, glow: 0 };
  }
  return { headline: 'ALL CLEAR', detail: 'Nothing on the calendar', glow: 0 };
}

/* ── painting ───────────────────────────────────────────────────────────── */

export const FONT = '"Cascadia Mono", "Cascadia Code", Consolas, ui-monospace, "DejaVu Sans Mono", monospace';

/** Countdown card geometry, in pane px.
 *
 * 2026-10-08, first look on the glass — Ricky: the grey "stone" slab "doesn't
 * look anything like a stone slab ... the data is right, the presentation is
 * not." It was a slate half-buried in the sand (x 430, y 397, 420x75) with
 * carved lettering. It is now a standalone LCD card on the front glass, the
 * same housing as the clock badge and bottom-aligned with it, so the tank has
 * one UI language instead of a prop and a gadget. The names STONE / paintStone
 * are kept so nothing downstream had to change. */
export const STONE = Object.freeze({ x: 356, y: 376, w: 568, h: 90 });

/** Thermometer geometry, in pane px — lower right, on the front glass. */
export const THERMO = Object.freeze({ x: 1046, y: 376, w: 206, h: 90 });

const mk = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
};

const DIGIT = '#d6f2e6';

/** Rounded-rect path. */
function rrect(g, x, y, ww, hh, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + ww, y, x + ww, y + hh, r);
  g.arcTo(x + ww, y + hh, x, y + hh, r);
  g.arcTo(x, y + hh, x, y, r);
  g.arcTo(x, y, x + ww, y, r);
  g.closePath();
}

/** The shared LCD housing: grey bezel, dark window, faint top sheen. Used by
 * both the countdown card and the clock badge so they read as one family. */
function paintHousing(g, w, h) {
  rrect(g, 1, 1, w - 2, h - 2, 12);
  const hs = g.createLinearGradient(0, 0, 0, h);
  hs.addColorStop(0, '#4b5155');
  hs.addColorStop(1, '#2a2e31');
  g.fillStyle = hs;
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = 1;
  g.stroke();

  rrect(g, 9, 9, w - 18, h - 18, 6);
  g.fillStyle = '#0c1412';
  g.fill();
  g.save();
  g.clip();
  const sheen = g.createLinearGradient(0, 9, 0, h / 2);
  sheen.addColorStop(0, 'rgba(255,255,255,0.08)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sheen;
  g.fillRect(9, 9, w - 18, h / 2);
  g.restore();
}

/**
 * The countdown card's housing. Painted once per tank; the readout is a
 * separate canvas (paintStoneText) so it can change every minute.
 *
 * @param {() => number} [_rand]  unused since the 2026-10-08 redesign; kept
 *   so the scene's call site and seeded RNG sequence are unchanged
 */
export function paintStone(_rand) {
  const { w, h } = STONE;
  const c = mk(w, h);
  paintHousing(c.getContext('2d'), w, h);
  return c;
}

/** Fit text to a width by shrinking, then by ellipsis. */
function fit(g, text, weight, maxPx, minPx, maxW) {
  for (let px = maxPx; px >= minPx; px -= 1) {
    g.font = `${weight} ${px}px ${FONT}`;
    if (g.measureText(text).width <= maxW) return text;
  }
  let t = text;
  while (t.length > 1 && g.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/**
 * The countdown readout: plain LCD digits in the clock badge's colour — the
 * headline big, the event line smaller and slightly dimmer. Transparent
 * outside the glyphs; the shader lays it over the housing.
 *
 * @param {{headline: string, detail: string}} text
 */
export function paintStoneText(text) {
  const { w, h } = STONE;
  const c = mk(w, h);
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const maxW = w - 44;
  g.fillStyle = DIGIT;
  g.fillText(fit(g, text.headline, 700, 38, 24, maxW), w / 2, 36);
  g.fillStyle = 'rgba(214,242,230,0.72)';
  g.fillText(fit(g, text.detail, 600, 20, 14, maxW), w / 2, 67);
  return c;
}

/**
 * The stick-on thermometer: a dark LCD in a grey housing, light digits. Dark
 * rather than the classic pale LCD so it does not become the brightest thing
 * on the glass at night.
 *
 * @param {{now: Date, tempF?: number|null, stale?: boolean}} o
 */
export function paintThermo({ now, tempF, stale }) {
  const { w, h } = THERMO;
  const c = mk(w, h);
  const g = c.getContext('2d');

  paintHousing(g, w, h);

  const digit = DIGIT;
  g.textBaseline = 'alphabetic';
  // Clock.
  const t = fmtTime(now);
  const [hm, ap] = t.split(' ');
  g.fillStyle = digit;
  g.font = `700 32px ${FONT}`;
  g.textAlign = 'right';
  g.fillText(hm, w - 58, 44);
  g.font = `700 16px ${FONT}`;
  g.textAlign = 'left';
  g.fillText(ap, w - 52, 44);

  // Outdoor temperature.
  g.font = `700 26px ${FONT}`;
  g.textAlign = 'right';
  g.fillText(typeof tempF === 'number' ? `${tempF}°F` : '--°F', w - 58, 76);
  g.font = `600 13px ${FONT}`;
  g.textAlign = 'left';
  g.fillStyle = stale ? '#d98a3d' : 'rgba(214,242,230,0.65)';
  g.fillText(stale ? 'STALE' : 'OUT', w - 52, 75);
  return c;
}
