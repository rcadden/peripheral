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

/** Stone geometry, in pane px. */
export const STONE = Object.freeze({ x: 430, y: 397, w: 420, h: 75 });

/** Thermometer geometry, in pane px — lower right, on the front glass. */
export const THERMO = Object.freeze({ x: 1046, y: 376, w: 206, h: 90 });

const mk = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
};

/**
 * The slate itself — irregular, lit from above. Painted once per tank; the
 * lettering is a separate canvas (paintStoneText) so it can stay legible
 * regardless of the scene light.
 *
 * @param {() => number} rand  seeded [0,1)
 */
export function paintStone(rand) {
  const { w, h } = STONE;
  const c = mk(w, h);
  const g = c.getContext('2d');

  // An irregular slab outline: a rounded rectangle with jittered corners.
  const pts = [];
  const N = 72;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const sx = Math.cos(a), sy = Math.sin(a);
    // Superellipse — flat top and bottom, rounded ends.
    const px = Math.sign(sx) * Math.pow(Math.abs(sx), 0.35);
    const py = Math.sign(sy) * Math.pow(Math.abs(sy), 0.5);
    const j = 1 - (Math.sin(i * 0.7) * 0.5 + 0.5) * 0.02 - rand() * 0.008;
    pts.push([w / 2 + px * (w / 2 - 4) * j, h / 2 + py * (h / 2 - 5) * j]);
  }
  const outline = () => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
  };

  // Contact shadow on the sand.
  g.save();
  g.translate(3, 5);
  outline();
  g.fillStyle = 'rgba(30,24,16,0.45)';
  g.fill();
  g.restore();

  outline();
  const body = g.createLinearGradient(0, 0, 0, h);
  body.addColorStop(0, '#5a646a');
  body.addColorStop(0.12, '#3d454a');
  body.addColorStop(1, '#22282c');
  g.fillStyle = body;
  g.fill();

  g.save();
  outline();
  g.clip();
  // Slate grain: fine horizontal laminations.
  for (let k = 0; k < 70; k++) {
    const y = rand() * h;
    g.strokeStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + rand() * 0.05})`;
    g.lineWidth = 0.6 + rand() * 1.4;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(w * 0.3, y + rand() * 4 - 2, w * 0.7, y + rand() * 4 - 2, w, y + rand() * 3 - 1.5);
    g.stroke();
  }
  // Top bevel catching the light bar.
  const bevel = g.createLinearGradient(0, 0, 0, 10);
  bevel.addColorStop(0, 'rgba(220,235,240,0.35)');
  bevel.addColorStop(1, 'rgba(220,235,240,0)');
  g.fillStyle = bevel;
  g.fillRect(0, 0, w, 10);
  g.restore();

  outline();
  g.strokeStyle = 'rgba(10,12,14,0.8)';
  g.lineWidth = 1.5;
  g.stroke();
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
 * The carved lettering. Pale, chalk-filled letters with a carved inner
 * shadow on their upper edge — reads as inscribed, and stays high contrast
 * against the dark slate. Its own canvas so the shader can keep it legible
 * at night, when the rest of the stone is lit only by moonlight.
 *
 * @param {{headline: string, detail: string}} text
 */
export function paintStoneText(text) {
  const { w, h } = STONE;
  const c = mk(w, h);
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const maxW = w - 54;

  const line = (s, weight, maxPx, minPx, y) => {
    const t = fit(g, s, weight, maxPx, minPx, maxW);
    // Carved: a dark offset above, then the chalk fill, then a faint lip below.
    g.fillStyle = 'rgba(0,0,0,0.75)';
    g.fillText(t, w / 2, y - 1.5);
    g.fillStyle = '#ece6d6';
    g.fillText(t, w / 2, y);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillText(t, w / 2, y + 1);
  };
  line(text.headline, 700, 34, 22, h * 0.36);
  line(text.detail, 600, 22, 15, h * 0.72);
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

  const rr = (x, y, ww, hh, r) => {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + ww, y, x + ww, y + hh, r);
    g.arcTo(x + ww, y + hh, x, y + hh, r);
    g.arcTo(x, y + hh, x, y, r);
    g.arcTo(x, y, x + ww, y, r);
    g.closePath();
  };

  // Housing.
  rr(1, 1, w - 2, h - 2, 12);
  const hs = g.createLinearGradient(0, 0, 0, h);
  hs.addColorStop(0, '#4b5155');
  hs.addColorStop(1, '#2a2e31');
  g.fillStyle = hs;
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = 1;
  g.stroke();

  // LCD window.
  rr(9, 9, w - 18, h - 18, 6);
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

  const digit = '#d6f2e6';
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
