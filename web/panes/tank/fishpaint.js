/* fishpaint.js — side-view portraits of each species, painted once.
 *
 * Each animal is drawn facing RIGHT into its own canvas at SCALE x its
 * on-screen size, then mip-mapped down by the GPU, so fine stripes stay crisp
 * instead of shimmering. The vertex shader in scene.js bends the tail and
 * turns the fish; nothing here animates.
 *
 * A body is two contours — dorsal and ventral — from the nose (u=1) back to
 * the caudal peduncle, plus fins. Patterns are clipped to the body. Fins are
 * translucent with a brighter rim, which is what makes them read as fins and
 * not as part of the body when they pass over the bright backdrop.
 *
 * The neon/cardinal stripe is painted in a saturated electric blue on
 * purpose: scene.js detects that hue and modulates it as the fish turns,
 * which is the cheap version of "view-angle iridescence".
 */

import { canvas } from './paint.js';

export const SCALE = 4;
/** Texture aspect (height / length) shared with scene.js. */
export const ASPECT = 0.62;

const TAU = Math.PI * 2;

/**
 * @param {object} sp  a SPECIES entry
 * @returns {HTMLCanvasElement}
 */
export function paintSpecies(sp) {
  const L = Math.round(sp.length * SCALE);
  const c = canvas(L, Math.round(L * ASPECT));
  const g = c.getContext('2d');
  g.translate(0, c.height / 2);
  const painter = PAINTERS[sp.id];
  painter(g, L);
  return c;
}

/* ── body geometry ──────────────────────────────────────────────────────── */

/**
 * Build the body outline. x runs 0..L left to right with the nose at
 * L*noseAt; the tail fin occupies the left. `h` is half the body depth as a
 * fraction of L. Returns the closed path and a function giving the dorsal and
 * ventral y at any x, for placing stripes.
 */
function body(g, L, { h = 0.13, belly = 1.05, nose = 0.95, ped = 0.24, pedH = 0.035, peak = 0.6, blunt = 0.55 }) {
  const x0 = L * ped, x1 = L * nose;
  /* u runs 0 at the peduncle to 1 at the nose. sin(pi * u^k) peaks where
   * u^k = 0.5, so k = ln 0.5 / ln peak puts the deepest point at `peak`.
   * The first version used k < 1 and put it near the TAIL — every species
   * came out a teardrop with a needle nose (caught on a contact sheet,
   * 2026-10-08). The outer power rounds the snout instead of pointing it. */
  const k = Math.log(0.5) / Math.log(peak);
  const profile = (u) => Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(u, k))), blunt);
  const top = (x) => {
    const u = (x - x0) / (x1 - x0);
    if (u <= 0) return -pedH * L;
    if (u >= 1) return 0;
    return -Math.max(pedH * L * (1 - u) * 1.2, h * L * profile(u));
  };
  const bot = (x) => -top(x) * belly;
  g.beginPath();
  g.moveTo(x0, top(x0));
  for (let x = x0; x <= x1; x += L / 120) g.lineTo(x, top(x));
  g.lineTo(x1, 0);
  for (let x = x1; x >= x0; x -= L / 120) g.lineTo(x, bot(x));
  g.closePath();
  return { top, bot, x0, x1 };
}

function fin(g, pts, fill, rim) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p.length === 4) g.quadraticCurveTo(p[0], p[1], p[2], p[3]);
    else g.lineTo(p[0], p[1]);
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (rim) { g.strokeStyle = rim; g.lineWidth = 1.2; g.stroke(); }
}

/** Forked caudal fin hung off the peduncle. */
function forkTail(g, L, b, fill, rim, spread = 0.13, depth = 0.6) {
  const x = b.x0 + 2, y = 0;
  const tip = L * 0.02;
  fin(g, [[x, b.top(b.x0) * 0.9], [x - L * 0.08, -L * spread * 0.6, tip, -L * spread],
    [x - L * 0.12 * (1 - depth) + L * 0.06, y], [tip, L * spread],
    [x - L * 0.08, L * spread * 0.6, x, b.bot(b.x0) * 0.9]], fill, rim);
}

function roundTail(g, L, b, fill, rim, spread = 0.12) {
  const x = b.x0 + 2;
  fin(g, [[x, b.top(b.x0)], [L * 0.02, -L * spread * 1.2, L * 0.02, 0], [L * 0.02, L * spread * 1.2, x, b.bot(b.x0)]], fill, rim);
}

function eye(g, x, y, r, iris = '#c9c2a8') {
  g.fillStyle = iris;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.fillStyle = '#0b0b0d';
  g.beginPath(); g.arc(x + r * 0.1, y, r * 0.62, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath(); g.arc(x + r * 0.35, y - r * 0.35, r * 0.22, 0, TAU); g.fill();
}

/** Vertical shading over the body: dark back, pale belly, a top highlight. */
function shadeBody(g, L, b, back, mid, bellyCol) {
  const gr = g.createLinearGradient(0, -L * 0.16, 0, L * 0.16);
  gr.addColorStop(0, back);
  gr.addColorStop(0.5, mid);
  gr.addColorStop(1, bellyCol);
  g.fillStyle = gr;
  g.fill();
}

function withClip(g, fn) { g.save(); g.clip(); fn(); g.restore(); }

/** A soft colour patch: full at the centre, gone by radius r. */
function radial(g, x, y, r, col) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, col);
  gr.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
  return gr;
}

function gill(g, x, b, col = 'rgba(0,0,0,0.18)') {
  g.strokeStyle = col;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x, b.top(x) * 0.7);
  g.quadraticCurveTo(x - 6, 0, x, b.bot(x) * 0.7);
  g.stroke();
}

/* ── species ────────────────────────────────────────────────────────────── */

const CLEAR_FIN = 'rgba(225,235,235,0.28)';
const CLEAR_RIM = 'rgba(240,250,250,0.45)';

function tetraBase(g, L, { back, mid, bellyCol, h = 0.105 }) {
  const shape = { h, belly: 1.0, nose: 0.96, ped: 0.24, peak: 0.6 };
  // Fins behind the body.
  const probe = body(g, L, shape);
  forkTail(g, L, probe, CLEAR_FIN, CLEAR_RIM, 0.1);
  fin(g, [[L * 0.5, probe.top(L * 0.5)], [L * 0.52, -L * 0.24], [L * 0.62, probe.top(L * 0.62)]], CLEAR_FIN, CLEAR_RIM);
  fin(g, [[L * 0.32, probe.bot(L * 0.32)], [L * 0.36, L * 0.17], [L * 0.52, probe.bot(L * 0.52)]], CLEAR_FIN, CLEAR_RIM);
  const b = body(g, L, shape);
  shadeBody(g, L, b, back, mid, bellyCol);
  return b;
}

function stripe(g, L, b, from, to, yFrac, thick, col0, col1) {
  const gr = g.createLinearGradient(L * from, 0, L * to, 0);
  gr.addColorStop(0, col0);
  gr.addColorStop(1, col1);
  g.fillStyle = gr;
  g.beginPath();
  for (let x = L * from; x <= L * to; x += L / 60) {
    const y = b.top(x) + (b.bot(x) - b.top(x)) * yFrac;
    if (x === L * from) g.moveTo(x, y - L * thick); else g.lineTo(x, y - L * thick);
  }
  for (let x = L * to; x >= L * from; x -= L / 60) {
    const y = b.top(x) + (b.bot(x) - b.top(x)) * yFrac;
    g.lineTo(x, y + L * thick);
  }
  g.closePath();
  g.fill();
}

/** A fan-shaped caudal fin with a shallow notch — gouramis, rainbowfish. */
function fanTail(g, L, b, fill, rim, spread = 0.16) {
  const x = b.x0 + 2;
  fin(g, [[x, b.top(b.x0) * 0.85], [x - L * 0.08, -L * spread * 1.05, L * 0.02, -L * spread],
    [L * 0.07, 0], [L * 0.02, L * spread], [x - L * 0.08, L * spread * 1.05, x, b.bot(b.x0) * 0.85]], fill, rim);
}

/**
 * A gourami: deep, laterally flat oval with a small snout; a LONG, low anal
 * fin running most of the belly and past the tail base; a small dorsal set
 * well back; a fan tail; and the thread-like pelvic feelers that make a
 * gourami read as one. `pattern` paints inside the body outline.
 */
function gouramiBase(g, L, { back, mid, belly, fins, rim, feelers }, pattern) {
  const shape = { h: 0.19, belly: 1.0, nose: 0.94, ped: 0.22, peak: 0.5, blunt: 0.55 };
  const p = body(g, L, shape);
  fanTail(g, L, p, fins, rim, 0.17);
  // Anal fin: from behind the pelvics along the belly, deepest at the rear,
  // its trailing tip reaching back past the tail base.
  fin(g, [[L * 0.68, p.bot(L * 0.68)], [L * 0.58, p.bot(L * 0.58) + L * 0.06],
    [L * 0.34, p.bot(L * 0.34) + L * 0.11], [L * 0.2, L * 0.13],
    [L * 0.25, p.bot(L * 0.25)]], fins, rim);
  // Dorsal: short-based and set back, sloping rearward.
  fin(g, [[L * 0.48, p.top(L * 0.48)], [L * 0.38, p.top(L * 0.4) - L * 0.1],
    [L * 0.27, p.top(L * 0.3) - L * 0.05], [L * 0.28, p.top(L * 0.28)]], fins, rim);
  const b = body(g, L, shape);
  shadeBody(g, L, b, back, mid, belly);
  withClip(g, () => pattern());
  gill(g, L * 0.79, b);
  // Pelvic feelers, drawn over the body: two long threads trailing back.
  g.strokeStyle = feelers;
  g.lineCap = 'round';
  for (const [w, end] of [[L * 0.009, 0.28], [L * 0.007, 0.36]]) {
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(L * 0.73, b.bot(L * 0.73) * 0.75);
    g.quadraticCurveTo(L * 0.62, L * 0.27, L * end, L * 0.29);
    g.stroke();
  }
  return b;
}

const PAINTERS = {
  neon(g, L) {
    const b = tetraBase(g, L, { back: '#5d5a3c', mid: '#9aa38c', bellyCol: '#e8ecea' });
    withClip(g, () => {
      // Red lower rear half, fading out toward mid-body.
      const red = g.createLinearGradient(L * 0.5, 0, L * 0.64, 0);
      red.addColorStop(0, '#e0303a');
      red.addColorStop(1, 'rgba(224,48,58,0)');
      g.fillStyle = red;
      g.fillRect(L * 0.24, L * 0.005, L * 0.4, L * 0.2);
      stripe(g, L, b, 0.28, 0.9, 0.36, 0.028, '#1a6cff', '#22d6ff');
    });
    gill(g, L * 0.8, b);
    eye(g, L * 0.88, -L * 0.015, L * 0.032);
  },
  cardinal(g, L) {
    const b = tetraBase(g, L, { back: '#55553c', mid: '#8d9886', bellyCol: '#e9ecec' });
    withClip(g, () => {
      g.fillStyle = '#d8283a';
      g.fillRect(L * 0.24, L * 0.004, L * 0.7, L * 0.2);
      stripe(g, L, b, 0.27, 0.92, 0.36, 0.03, '#1868ff', '#20d8ff');
    });
    gill(g, L * 0.8, b);
    eye(g, L * 0.88, -L * 0.015, L * 0.032);
  },
  ember(g, L) {
    const b = tetraBase(g, L, { back: '#c85a2a', mid: '#ff8040', bellyCol: '#ffc090', h: 0.115 });
    withClip(g, () => {
      g.fillStyle = 'rgba(255,255,255,0.15)';
      g.fillRect(L * 0.3, -L * 0.02, L * 0.6, L * 0.02);
    });
    eye(g, L * 0.87, -L * 0.015, L * 0.036, '#e05a30');
  },
  rummynose(g, L) {
    const shape = { h: 0.098, belly: 1.0, nose: 0.96, ped: 0.24, peak: 0.6 };
    const probe = body(g, L, shape);
    // Black-and-white banded tail — the species' signature.
    forkTail(g, L, probe, 'rgba(235,240,240,0.8)', null, 0.11);
    for (const [y0, h] of [[-0.1, 0.03], [-0.018, 0.036], [0.07, 0.03]]) {
      g.save();
      forkTail(g, L, probe, 'rgba(0,0,0,0)', null, 0.11); // leaves the tail as the current path
      g.clip();
      g.fillStyle = '#121214'; // after forkTail, which sets its own fill
      g.fillRect(0, L * y0, L * 0.26, L * h);
      g.restore();
    }
    fin(g, [[L * 0.5, probe.top(L * 0.5)], [L * 0.52, -L * 0.22], [L * 0.62, probe.top(L * 0.62)]], CLEAR_FIN, CLEAR_RIM);
    const b = body(g, L, shape);
    shadeBody(g, L, b, '#8a9490', '#cfd7d6', '#f0f2f0');
    withClip(g, () => {
      const rg = g.createLinearGradient(L * 0.72, 0, L * 0.96, 0);
      rg.addColorStop(0, 'rgba(220,30,30,0)');
      rg.addColorStop(0.35, 'rgba(220,30,30,0.95)');
      rg.addColorStop(1, '#c41e24');
      g.fillStyle = rg;
      g.fillRect(L * 0.7, -L * 0.2, L * 0.3, L * 0.4);
    });
    eye(g, L * 0.88, -L * 0.012, L * 0.03, '#d02020');
  },
  harlequin(g, L) {
    const shape = { h: 0.135, belly: 1.0, nose: 0.95, ped: 0.25, peak: 0.6 };
    const probe = body(g, L, shape);
    forkTail(g, L, probe, 'rgba(240,140,90,0.45)', 'rgba(255,170,120,0.6)');
    fin(g, [[L * 0.48, probe.top(L * 0.48)], [L * 0.5, -L * 0.27], [L * 0.6, probe.top(L * 0.6)]], 'rgba(240,140,90,0.45)', null);
    fin(g, [[L * 0.36, probe.bot(L * 0.36)], [L * 0.4, L * 0.22], [L * 0.52, probe.bot(L * 0.52)]], 'rgba(240,140,90,0.45)', null);
    const b = body(g, L, shape);
    shadeBody(g, L, b, '#a8604a', '#f0a888', '#f6d8c8');
    withClip(g, () => {
      // The black triangular wedge from mid-body to the peduncle.
      g.fillStyle = '#18161a';
      g.beginPath();
      g.moveTo(L * 0.62, -L * 0.12);
      g.lineTo(L * 0.62, L * 0.06);
      g.lineTo(L * 0.25, L * 0.0);
      g.lineTo(L * 0.25, -L * 0.03);
      g.closePath();
      g.fill();
    });
    eye(g, L * 0.86, -L * 0.02, L * 0.035);
  },
  chili(g, L) {
    const b = tetraBase(g, L, { back: '#b8281e', mid: '#ea3a2c', bellyCol: '#f07a60', h: 0.11 });
    withClip(g, () => stripe(g, L, b, 0.3, 0.86, 0.45, 0.018, '#3a0c0a', '#5a1410'));
    eye(g, L * 0.87, -L * 0.012, L * 0.038, '#d84030');
  },

  /* Boeseman's rainbowfish (2026-10-08, behaviour spec Q3): deep, laterally
   * flat body with a high back; steel-blue fore, orange-red aft — the fish in
   * Ricky's clip 5. Two dorsal fins and a long anal fin, all tinted. Tail
   * changed the same day from forkTail (it rendered as two spikes) to fanTail. */
  rainbow(g, L) {
    const shape = { h: 0.165, belly: 1.0, nose: 0.95, ped: 0.24, peak: 0.52, blunt: 0.5 };
    const probe = body(g, L, shape);
    fanTail(g, L, probe, 'rgba(230,110,60,0.6)', 'rgba(255,170,110,0.5)', 0.13);
    fin(g, [[L * 0.56, probe.top(L * 0.56)], [L * 0.6, -L * 0.25], [L * 0.68, probe.top(L * 0.68)]], 'rgba(120,150,200,0.5)', null);
    fin(g, [[L * 0.3, probe.top(L * 0.3)], [L * 0.36, -L * 0.26], [L * 0.52, probe.top(L * 0.52)]], 'rgba(230,110,60,0.55)', null);
    fin(g, [[L * 0.28, probe.bot(L * 0.28)], [L * 0.38, L * 0.24], [L * 0.62, probe.bot(L * 0.62)]], 'rgba(230,110,60,0.55)', null);
    const b = body(g, L, shape);
    shadeBody(g, L, b, '#2d4a78', '#6f93c4', '#c8d6e6');
    withClip(g, () => {
      // Orange-red rear, blending into the blue mid-body.
      const rear = g.createLinearGradient(L * 0.3, 0, L * 0.6, 0);
      rear.addColorStop(0, 'rgba(236,92,40,0.95)');
      rear.addColorStop(1, 'rgba(236,92,40,0)');
      g.fillStyle = rear;
      g.fillRect(0, -L, L * 0.6, 2 * L);
    });
    gill(g, L * 0.8, b);
    eye(g, L * 0.87, -L * 0.03, L * 0.036, '#d8dce0');
  },

  /* ── gouramis, repainted 2026-10-08 ─────────────────────────────────────
   * Ricky, on the glass: "the two gourami look terrible." A contact sheet of
   * the painters alone showed why — generic kite-shaped triangle fins,
   * lollipop tails, no pelvic feelers, and on the pearl a pattern bug (below).
   * All three now share gouramiBase(): the real anatomy. */
  honey(g, L) {
    gouramiBase(g, L, { back: '#b8761c', mid: '#f0a63a', belly: '#f6cc78',
      fins: 'rgba(240,170,60,0.5)', rim: 'rgba(255,214,120,0.6)', feelers: 'rgba(250,206,120,0.85)' }, () => {
      // A displaying male: dark blue-black from the chin back along the
      // breast, as a band under the midline — not a patch on the face.
      // Soft-edged on every side: a first version used a rectangle and read
      // as the fish dipped in ink.
      g.save();
      g.translate(L * 0.76, L * 0.15);
      g.scale(2.2, 1);
      const band = g.createRadialGradient(0, 0, 0, 0, 0, L * 0.13);
      band.addColorStop(0, 'rgba(34,40,78,0.88)');
      band.addColorStop(0.55, 'rgba(34,40,78,0.7)');
      band.addColorStop(1, 'rgba(34,40,78,0)');
      g.fillStyle = band;
      g.fillRect(-L * 0.2, -L * 0.2, L * 0.4, L * 0.4);
      g.restore();
    });
    eye(g, L * 0.86, -L * 0.035, L * 0.034, '#d0a050');
  },
  dwarf(g, L) {
    gouramiBase(g, L, { back: '#a83420', mid: '#e05436', belly: '#ec8a64',
      fins: 'rgba(214,72,52,0.55)', rim: 'rgba(110,190,240,0.75)', feelers: 'rgba(240,120,90,0.85)' }, () => {
      // Slanted, irregular turquoise bars — not an even barcode.
      g.fillStyle = 'rgba(96,186,236,0.85)';
      let x = L * 0.27, k = 0;
      while (x < L * 0.82) {
        const w = L * (0.016 + 0.01 * ((k * 0.618) % 1));
        const slant = L * 0.05;
        g.beginPath();
        g.moveTo(x + slant, -L * 0.25); g.lineTo(x + slant + w, -L * 0.25);
        g.lineTo(x + w, L * 0.25); g.lineTo(x, L * 0.25);
        g.closePath(); g.fill();
        x += L * (0.045 + 0.02 * ((k * 0.381 + 0.3) % 1)); k++;
      }
      // Blue throat.
      g.fillStyle = radial(g, L * 0.84, L * 0.1, L * 0.14, 'rgba(70,150,220,0.9)');
      g.fillRect(0, -L, L, 2 * L);
    });
    eye(g, L * 0.86, -L * 0.035, L * 0.034, '#c04030');
  },
  pearl(g, L) {
    gouramiBase(g, L, { back: '#6e6656', mid: '#b8ad98', belly: '#e9dcc6',
      fins: 'rgba(206,196,176,0.5)', rim: 'rgba(240,235,222,0.5)', feelers: 'rgba(236,150,90,0.85)' }, () => {
      // Orange breast of a male.
      g.fillStyle = radial(g, L * 0.76, L * 0.15, L * 0.2, 'rgba(236,128,56,0.85)');
      g.fillRect(0, -L, L, 2 * L);
      /* Pearls evenly over the whole body. The first version placed dot k at
       * ((k*0.618)%1, (k*0.381)%1) — and 0.381 = 1 - 0.618, so every dot fell
       * on one diagonal: the "sash." The R2 sequence has no such correlation. */
      for (let k = 0; k < 260; k++) {
        const x = L * (0.22 + 0.72 * ((0.5 + k * 0.7548776662) % 1));
        const y = L * (-0.2 + 0.4 * ((0.5 + k * 0.5698402910) % 1));
        g.fillStyle = 'rgba(252,250,242,0.8)';
        g.beginPath(); g.arc(x, y, L * 0.0075, 0, TAU); g.fill();
      }
      // A straight dark stripe from the snout to a spot at the tail base.
      const line = g.createLinearGradient(L * 0.26, 0, L * 0.88, 0);
      line.addColorStop(0, 'rgba(26,22,18,0.85)');
      line.addColorStop(1, 'rgba(26,22,18,0.15)');
      g.fillStyle = line;
      g.fillRect(L * 0.26, -L * 0.012, L * 0.62, L * 0.024);
      g.fillStyle = '#1a1612';
      g.beginPath(); g.arc(L * 0.27, 0, L * 0.026, 0, TAU); g.fill();
    });
    eye(g, L * 0.86, -L * 0.035, L * 0.034, '#c06030');
  },

  corydoras(g, L) {
    const shape = { h: 0.165, belly: 0.75, nose: 0.94, ped: 0.24, peak: 0.62, blunt: 0.4 };
    const probe = body(g, L, shape);
    forkTail(g, L, probe, 'rgba(230,225,215,0.5)', CLEAR_RIM, 0.12);
    fin(g, [[L * 0.56, probe.top(L * 0.56)], [L * 0.62, -L * 0.34], [L * 0.7, probe.top(L * 0.7)]], '#1c1a1a', null);
    const b = body(g, L, shape);
    shadeBody(g, L, b, '#b8aca0', '#ece0d4', '#f6ece4');
    withClip(g, () => {
      g.fillStyle = '#18161a';
      // Panda patches: eye mask, dorsal saddle, tail spot.
      g.beginPath(); g.ellipse(L * 0.84, -L * 0.04, L * 0.05, L * 0.1, 0.3, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(L * 0.6, -L * 0.17, L * 0.12, L * 0.07, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(L * 0.28, -L * 0.01, L * 0.05, L * 0.05, 0, 0, TAU); g.fill();
      // Armour plates.
      g.strokeStyle = 'rgba(80,60,50,0.25)';
      g.lineWidth = 1;
      for (let x = L * 0.3; x < L * 0.78; x += L * 0.035) {
        g.beginPath(); g.moveTo(x, -L * 0.2); g.lineTo(x + L * 0.01, L * 0.15); g.stroke();
      }
    });
    // Barbels.
    g.strokeStyle = 'rgba(230,215,200,0.9)';
    g.lineWidth = 1.4;
    for (const dy of [0.05, 0.075]) {
      g.beginPath(); g.moveTo(L * 0.93, L * 0.02); g.quadraticCurveTo(L * 0.97, L * dy, L * 0.99, L * (dy + 0.03)); g.stroke();
    }
    eye(g, L * 0.84, -L * 0.04, L * 0.028, '#d8c8a8');
  },
  otocinclus(g, L) {
    const shape = { h: 0.09, belly: 0.85, nose: 0.96, ped: 0.24, peak: 0.62, blunt: 0.5 };
    const probe = body(g, L, shape);
    forkTail(g, L, probe, 'rgba(200,190,160,0.5)', null, 0.09);
    const b = body(g, L, shape);
    shadeBody(g, L, b, '#6a5a3a', '#b8a476', '#e8dcc0');
    withClip(g, () => stripe(g, L, b, 0.24, 0.95, 0.5, 0.016, '#2a2418', '#3a3020'));
    eye(g, L * 0.86, -L * 0.03, L * 0.025, '#a89060');
  },

  amano(g, L) { shrimp(g, L, { body: 'rgba(176,186,178,0.78)', dots: 'rgba(120,76,52,0.9)', leg: 'rgba(190,200,190,0.75)' }); },
  cherry(g, L) { shrimp(g, L, { body: 'rgba(212,42,38,0.96)', dots: 'rgba(150,18,18,0.7)', leg: 'rgba(220,70,64,0.85)' }); },
};

/** Shrimp, side view, facing right: an arched, segmented abdomen rising from
 * the tail fan to a carapace and pointed rostrum, legs underneath, long
 * antennae sweeping back over the body. */
function shrimp(g, L, col) {
  const segs = 9;
  const seg = [];
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);            // 0 tail .. 1 head
    const x = L * (0.16 + 0.62 * t);
    const y = -Math.sin(Math.PI * (0.15 + 0.7 * t)) * L * 0.07 + L * 0.03;
    const r = L * (0.045 + 0.06 * Math.sin(Math.PI * Math.min(1, 0.25 + t * 0.85)));
    seg.push([x, y, r]);
  }
  // Legs: walking legs under the carapace, swimmerets under the abdomen.
  g.strokeStyle = col.leg;
  g.lineWidth = Math.max(1.2, L * 0.012);
  for (let i = 2; i < segs - 1; i++) {
    const [x, y, r] = seg[i];
    const len = i > 5 ? L * 0.13 : L * 0.07;
    g.beginPath(); g.moveTo(x, y + r * 0.7); g.lineTo(x + L * 0.03, y + r + len); g.stroke();
  }
  // Tail fan.
  const [tx, ty, tr] = seg[0];
  g.fillStyle = col.body;
  g.beginPath();
  g.moveTo(tx + tr * 0.5, ty - tr * 0.6);
  g.lineTo(L * 0.03, ty - L * 0.08);
  g.quadraticCurveTo(L * 0.0, ty, L * 0.03, ty + L * 0.08);
  g.lineTo(tx + tr * 0.5, ty + tr * 0.6);
  g.closePath();
  g.fill();
  // Segments, tail first so the head overlaps.
  for (const [x, y, r] of seg) {
    g.fillStyle = col.body;
    g.beginPath(); g.ellipse(x, y, r * 1.1, r, 0, 0, TAU); g.fill();
  }
  // Carapace and rostrum.
  const [hx, hy, hr] = seg[segs - 1];
  g.beginPath();
  g.moveTo(hx - hr, hy - hr * 0.9);
  g.quadraticCurveTo(hx + hr * 0.6, hy - hr * 1.15, L * 0.95, hy - hr * 0.35);
  g.lineTo(hx + hr * 0.6, hy + hr * 0.2);
  g.quadraticCurveTo(hx, hy + hr, hx - hr, hy + hr * 0.6);
  g.closePath();
  g.fill();
  // Markings: a dashed line along the side.
  for (const [x, y, r] of seg.slice(1, segs - 1)) {
    g.fillStyle = col.dots;
    g.beginPath(); g.ellipse(x, y + r * 0.2, Math.max(1.2, r * 0.32), Math.max(1, r * 0.18), 0, 0, TAU); g.fill();
  }
  // A highlight along the back.
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.lineWidth = Math.max(1, L * 0.01);
  g.beginPath();
  seg.forEach(([x, y, r], i) => (i ? g.lineTo(x, y - r * 0.75) : g.moveTo(x, y - r * 0.75)));
  g.stroke();
  // Eye, antennae.
  g.fillStyle = '#111';
  g.beginPath(); g.arc(hx + hr * 0.35, hy - hr * 0.45, Math.max(1.6, L * 0.025), 0, TAU); g.fill();
  g.strokeStyle = col.leg;
  g.lineWidth = Math.max(1, L * 0.01);
  g.beginPath(); g.moveTo(hx + hr * 0.5, hy - hr * 0.2); g.quadraticCurveTo(L * 0.99, hy - L * 0.2, L * 0.55, hy - L * 0.25); g.stroke();
  g.beginPath(); g.moveTo(hx + hr * 0.5, hy); g.quadraticCurveTo(L * 0.99, hy - L * 0.08, L * 0.99, hy - L * 0.22); g.stroke();
}
