/* paint.js — today's aquascape, painted once into canvases.
 *
 * Roadmap, Sprint 9, Performance: "generate the scene at startup and bake
 * static layers (backdrop, hardscape, base foliage) to textures once; per
 * frame, animate only sway, fish, caustics, particulates and the surface."
 * This file is the bake. scene.js turns each canvas into a texture and does
 * the per-frame work in shaders.
 *
 * No assets — everything here is drawn from code and the day's seed. The
 * target is "a convincing aquarium at a glance from three feet, not
 * photoreal": shapes and light first, detail only where it survives the
 * distance. All coordinates are pane pixels, 1280x480, y down.
 *
 * Light comes from the top (the light bar), slightly from the left, so upper
 * surfaces are lit and lower ones fall into shadow throughout.
 */

import { W, H, GEO, STEM_PALETTES } from './layout.js';
import { makeRng, makeNoise1, makeNoise2, fbm2 } from './rng.js';

/* ── small helpers ───────────────────────────────────────────────────────── */

export function canvas(w = W, h = H) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const LIGHT = norm([0.35, 1]); // direction the light travels: down, slightly right
function norm(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }

/** Point on a cubic bezier. */
function bez(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

/** Gradient across a 3-stop palette, t in [0,1]. */
function ramp(stops, t) {
  t = clamp01(t);
  if (t < 0.5) return mix(stops[0], stops[1], t * 2);
  return mix(stops[1], stops[2], (t - 0.5) * 2);
}

/** The sand path's centre and half-width at a given y on the substrate. */
export function pathAt(L, y) {
  const t = clamp01((y - GEO.substrateBack) / (H - GEO.substrateBack));
  const e = t * t * (3 - 2 * t);
  const cx = L.path.backX + (L.path.frontX - L.path.backX) * e + L.path.curve * Math.sin(Math.PI * t) * 0.6;
  const hw = (L.path.backWidth + (L.path.frontWidth - L.path.backWidth) * Math.pow(t, 0.8)) / 2;
  return { cx, hw };
}

/* ── backdrop ──────────────────────────────────────────────────────────────
 * The frosted, back-lit panel behind the tank: bright and cool at the top,
 * deepening toward the substrate, brightest behind the centre. Soft shimmer
 * lines are baked faintly here and animated in the shader. */
export function paintBackdrop(L) {
  const c = canvas();
  const g = c.getContext('2d');
  const r = makeRng(L.seed ^ 0xbac);

  const v = g.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0.00, '#eaf5f2');
  v.addColorStop(GEO.surface / H, '#dceeea');
  v.addColorStop(0.30, '#bfe0da');
  v.addColorStop(0.62, '#8fc2b8');
  v.addColorStop(GEO.substrateBack / H, '#62988c');
  v.addColorStop(1.00, '#4b7c71');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);

  // Brighter behind the centre, falling off toward the silicone corners.
  const rad = g.createRadialGradient(W * 0.5, H * 0.32, 40, W * 0.5, H * 0.4, W * 0.62);
  rad.addColorStop(0, 'rgba(255,255,250,0.40)');
  rad.addColorStop(0.55, 'rgba(255,255,250,0.08)');
  rad.addColorStop(1, 'rgba(20,50,50,0.30)');
  g.fillStyle = rad;
  g.fillRect(0, 0, W, H);

  // Depth haze toward the bottom — water between the eye and the back glass.
  const haze = g.createLinearGradient(0, GEO.surface, 0, GEO.substrateBack);
  haze.addColorStop(0, 'rgba(60,120,110,0)');
  haze.addColorStop(1, 'rgba(40,95,88,0.25)');
  g.fillStyle = haze;
  g.fillRect(0, GEO.surface, W, GEO.substrateBack - GEO.surface);

  // Faint vertical shimmer lines on the frosted film.
  for (let i = 0; i < 26; i++) {
    const x = r.range(0, W);
    const w = r.range(6, 28);
    const lg = g.createLinearGradient(x - w, 0, x + w, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, `rgba(255,255,255,${r.range(0.03, 0.08)})`);
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg;
    g.fillRect(x - w, GEO.surface, w * 2, GEO.substrateBack - GEO.surface);
  }

  grain(g, 0, 0, W, H, 5, r);
  return c;
}

/** Fine per-pixel grain, so large gradients do not band on the panel. */
function grain(g, x, y, w, h, amt, r) {
  const img = g.getImageData(x, y, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const n = (r.next() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, x, y);
}

/* ── stem plants ──────────────────────────────────────────────────────────
 * Rotala/Ludwigia-like: a thin stem with paired narrow leaves, green at the
 * base deepening to the family's colour toward the tip, leaves shrinking and
 * crowding at the top. Drawn back to front so the cluster has depth. */
function drawStem(g, r, { x, base, top, lean, family, dim = 1, leafScale = 1 }) {
  const pal = STEM_PALETTES[family].map(hex);
  const height = base - top;
  const p0 = [x, base];
  const p3 = [x + lean * height + r.range(-12, 12), top];
  const p1 = [x + r.range(-10, 10), base - height * 0.35];
  const p2 = [p3[0] + r.range(-14, 14), top + height * 0.3];

  // The stem itself.
  g.strokeStyle = rgb(shade(pal[0], 0.55 * dim));
  g.lineWidth = r.range(1.4, 2.2);
  g.beginPath();
  for (let i = 0; i <= 24; i++) {
    const [px, py] = bez(p0, p1, p2, p3, i / 24);
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.stroke();

  const steps = Math.max(10, Math.floor(height / 3.2));
  for (let i = 2; i <= steps; i++) {
    const t = i / steps;
    const [px, py] = bez(p0, p1, p2, p3, t);
    const [qx, qy] = bez(p0, p1, p2, p3, Math.min(1, t + 0.01));
    const ang = Math.atan2(qy - py, qx - px); // up the stem
    // Colour deepens toward the tip; a little noise keeps it from banding.
    const ct = clamp01(Math.pow(t, 1.6) + r.range(-0.08, 0.08));
    const col = shade(ramp(pal, ct), dim * r.range(0.85, 1.08));
    const len = (13 - 6 * t) * leafScale * r.range(0.85, 1.15);
    const wid = len * 0.34;
    for (const side of [-1, 1]) {
      const a = ang + side * (Math.PI / 2 - 0.55 - t * 0.35) + r.range(-0.15, 0.15);
      const lx = px + Math.cos(a) * len * 0.5;
      const ly = py + Math.sin(a) * len * 0.5;
      // Upper leaves catch more light.
      const lit = Math.sin(a) < 0 ? 1.12 : 0.88;
      g.fillStyle = rgb(shade(col, lit));
      g.beginPath();
      g.ellipse(lx, ly, len / 2, wid / 2, a, 0, Math.PI * 2);
      g.fill();
    }
  }
  // A crowded rosette at the very tip.
  for (let k = 0; k < 6; k++) {
    const a = -Math.PI / 2 + r.range(-1.1, 1.1);
    const len = r.range(4, 7) * leafScale;
    g.fillStyle = rgb(shade(pal[2], dim * r.range(0.95, 1.2)));
    g.beginPath();
    g.ellipse(p3[0] + Math.cos(a) * len * 0.4, p3[1] + Math.sin(a) * len * 0.4, len / 2, len * 0.18, a, 0, Math.PI * 2);
    g.fill();
  }
}

function drawCluster(g, r, cl, dim = 1) {
  const stems = [];
  for (let i = 0; i < cl.count; i++) {
    const x = r.range(cl.x0, cl.x1);
    // Taller toward the cluster's outer edge — "tall at the sides".
    const outer = cl.side === 'left' ? 1 - (x - cl.x0) / (cl.x1 - cl.x0) : (x - cl.x0) / (cl.x1 - cl.x0);
    const top = cl.top + (1 - outer) * 70 + r.range(-25, 25);
    stems.push({ x, top, base: GEO.substrateBack + r.range(4, 22) });
  }
  // Back stems first, a touch darker.
  stems.sort((a, b) => a.base - b.base);
  stems.forEach((s, i) => drawStem(g, r, {
    ...s, lean: cl.lean + r.range(-0.08, 0.08), family: cl.family,
    dim: dim * (0.78 + 0.22 * (i / stems.length)),
  }));
}

/* ── background plants ─────────────────────────────────────────────────────
 * Far bushes visible through the arch (low, slightly fogged) and the tall
 * corner stem clusters behind the wood. */
export function paintBackPlants(L) {
  const c = canvas();
  const g = c.getContext('2d');
  const r = makeRng(L.seed ^ 0xb00);

  // Distant low bushes — small, bluish, soft.
  const span = [L.arch.leftBase - 60, L.arch.rightBase + 60];
  for (let b = 0; b < L.backBushes.count; b++) {
    const cx = r.range(span[0], span[1]);
    const top = L.backBushes.top + r.range(-20, 30);
    const wdt = r.range(50, 110);
    // A soft body first, so the leaves read as a bush and not as confetti.
    const bh = GEO.substrateBack - top;
    const body = g.createRadialGradient(cx, GEO.substrateBack, 4, cx, GEO.substrateBack, Math.max(wdt, bh));
    body.addColorStop(0, 'rgba(52,98,64,0.95)');
    body.addColorStop(0.7, 'rgba(70,120,82,0.75)');
    body.addColorStop(1, 'rgba(70,120,82,0)');
    g.fillStyle = body;
    g.beginPath();
    g.ellipse(cx, GEO.substrateBack + 4, wdt * 0.95, bh * 0.95, 0, Math.PI, 0);
    g.fill();
    for (let k = 0; k < 900; k++) {
      const a = r.range(0, Math.PI);
      const rr = Math.sqrt(r.next());
      const x = cx + Math.cos(a) * wdt * rr;
      const y = GEO.substrateBack + 6 - Math.sin(a) * (GEO.substrateBack - top) * rr;
      const col = mix([58, 110, 70], [118, 168, 120], 1 - rr * 0.7 + r.range(-0.15, 0.15));
      g.fillStyle = rgb(col, 0.9);
      g.beginPath();
      g.ellipse(x, y, r.range(1.6, 3.4), r.range(1, 2), r.range(0, Math.PI), 0, Math.PI * 2);
      g.fill();
    }
  }

  // Tall corner stems (the first two clusters are always the tall corners).
  for (const cl of L.stemClusters.slice(0, 2)) drawCluster(g, r, cl, 0.92);
  return c;
}

/* ── driftwood ───────────────────────────────────────────────────────────
 * A branching structure, not a texture: limbs are polylines with a width at
 * every point, painted in passes — silhouette, body, top light, bark streaks,
 * crevices — then moss on the upward-facing surfaces. */

function limbFromBezier(p0, p1, p2, p3, w0, w1, noise, gnarl, n = 320) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let [x, y] = bez(p0, p1, p2, p3, t);
    const [x2, y2] = bez(p0, p1, p2, p3, Math.min(1, t + 0.01));
    const tx = x2 - x, ty = y2 - y;
    const l = Math.hypot(tx, ty) || 1;
    const nx = -ty / l, ny = tx / l;
    const d = noise(t * 5) * gnarl + noise(t * 17 + 9) * gnarl * 0.3;
    x += nx * d; y += ny * d;
    // Root flare at the base, then taper.
    const flare = 1 + 0.9 * Math.pow(1 - Math.min(1, t * 6), 2);
    pts.push({ x, y, w: (w0 + (w1 - w0) * Math.pow(t, 0.9)) * flare });
  }
  return pts;
}

function limbWalk(r, x, y, angle, length, w0, w1, curl) {
  const pts = [];
  const n = Math.max(8, Math.floor(length / 1.5));
  let a = angle;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // Wood stays under water: a branch that would break the surface stops.
    if (y < GEO.surface + 16) break;
    pts.push({ x, y, w: w0 + (w1 - w0) * t });
    a += curl + r.range(-0.045, 0.045);
    x += Math.cos(a) * (length / n);
    y += Math.sin(a) * (length / n);
  }
  return pts;
}

/** Tangent and the normal that faces the light, at point i of a limb. */
function frame(pts, i) {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  const t = norm([b.x - a.x, b.y - a.y]);
  let n = [-t[1], t[0]];
  // LIGHT is the direction light TRAVELS (down and to the right), so the lit
  // side's normal points against it. Inverted in the first render — every
  // highlight sat on the underside and no moss grew anywhere.
  if (n[0] * LIGHT[0] + n[1] * LIGHT[1] > 0) n = [-n[0], -n[1]]; // n points TOWARD the light
  return { t, n };
}

function paintLimb(g, r, pts, bark) {
  const step = (fn) => { for (let i = 0; i < pts.length; i++) fn(pts[i], i); };
  // Silhouette.
  g.fillStyle = rgb(shade(bark, 0.42));
  step((p) => { g.beginPath(); g.arc(p.x, p.y, p.w + 0.8, 0, Math.PI * 2); g.fill(); });
  // Body.
  step((p, i) => {
    g.fillStyle = rgb(shade(bark, 0.78 + 0.1 * Math.sin(i * 0.37)));
    g.beginPath(); g.arc(p.x, p.y, p.w, 0, Math.PI * 2); g.fill();
  });
  // Lit upper side.
  step((p, i) => {
    const { n } = frame(pts, i);
    g.fillStyle = rgb(shade(bark, 1.18), 0.55);
    g.beginPath(); g.arc(p.x - n[0] * -p.w * 0.38, p.y - n[1] * -p.w * 0.38, p.w * 0.55, 0, Math.PI * 2); g.fill();
  });
  // Shadowed underside.
  step((p, i) => {
    const { n } = frame(pts, i);
    g.fillStyle = rgb(shade(bark, 0.45), 0.5);
    g.beginPath(); g.arc(p.x - n[0] * p.w * 0.45, p.y - n[1] * p.w * 0.45, p.w * 0.5, 0, Math.PI * 2); g.fill();
  });
  // Bark streaks running along the grain — crevices dark, ridges pale.
  const lines = Math.max(3, Math.round(pts[0].w / 3));
  for (let k = 0; k < lines; k++) {
    const off = r.range(-0.85, 0.85);
    const dark = r.chance(0.65);
    g.strokeStyle = dark ? rgb(shade(bark, 0.28), r.range(0.35, 0.7)) : rgb(shade(bark, 1.45), r.range(0.15, 0.35));
    g.lineWidth = r.range(0.6, 1.4);
    g.beginPath();
    let started = false;
    const start = r.int(0, Math.floor(pts.length * 0.4));
    const end = Math.min(pts.length, start + r.int(Math.floor(pts.length * 0.3), pts.length));
    for (let i = start; i < end; i++) {
      const p = pts[i];
      const { n } = frame(pts, i);
      const o = off * p.w + Math.sin(i * 0.6 + k) * 0.6;
      const x = p.x + n[0] * o, y = p.y + n[1] * o;
      if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
    }
    g.stroke();
  }
  // Knots and pits.
  for (let k = 0; k < pts.length / 18; k++) {
    const p = pts[r.int(0, pts.length - 1)];
    if (p.w < 4) continue;
    g.fillStyle = rgb(shade(bark, 0.25), 0.7);
    g.beginPath();
    g.ellipse(p.x + r.range(-p.w, p.w) * 0.5, p.y + r.range(-p.w, p.w) * 0.5, r.range(1, p.w * 0.35), r.range(0.8, 2), r.range(0, Math.PI), 0, Math.PI * 2);
    g.fill();
  }
}

function paintMoss(g, r, pts, density) {
  const greens = ['#3c7024', '#4c842b', '#5f9932', '#74ad3c', '#8cc04a'].map(hex);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const { t, n } = frame(pts, i);
    // Moss grows on upward-facing surfaces: weight by how much the lit
    // normal points up, so vertical stretches stay bare bark.
    const up = clamp01(-n[1]) * clamp01(1 - Math.abs(t[1]) * 0.6);
    if (r.next() > up * density * 1.15) continue;
    if (i % 2) continue; // points are ~1.5px apart; every other is plenty
    const blobs = r.int(2, 5);
    for (let k = 0; k < blobs; k++) {
      const o = p.w * r.range(0.45, 1.05) + r.range(0, 4);
      const x = p.x + n[0] * o + r.range(-3, 3);
      const y = p.y + n[1] * o + r.range(-2, 2);
      // Deeper in the cushion is darker; the outer tufts catch the light.
      const outer = clamp01((o - p.w * 0.45) / (p.w * 0.6 + 4));
      const col = greens[Math.min(greens.length - 1, Math.floor((outer * 0.7 + r.next() * 0.3) * greens.length))];
      g.fillStyle = rgb(shade(col, r.range(0.85, 1.1)));
      g.beginPath(); g.arc(x, y, r.range(1.4, 3.4), 0, Math.PI * 2); g.fill();
    }
    // The odd strand hanging off the underside.
    if (r.chance(0.04 * density)) {
      g.strokeStyle = rgb(greens[1], 0.7);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(p.x - n[0] * p.w, p.y - n[1] * p.w);
      g.lineTo(p.x - n[0] * p.w + r.range(-3, 3), p.y - n[1] * p.w + r.range(6, 14));
      g.stroke();
    }
  }
}

/** The arch's limbs, as point lists — also used to perch otocinclus. */
export function buildWood(L) {
  const r = makeRng(L.seed ^ 0x3d);
  const noise = makeNoise1(L.seed ^ 0x77);
  const A = L.arch;
  const base = GEO.substrateBack + 16;
  const limbs = [];

  const left = limbFromBezier(
    [A.leftBase, base],
    [A.leftBase - 55 + A.lean * 80, 250],
    [A.apexX - 120, A.apexY - 18],
    [A.apexX + 110, A.apexY + 26],
    A.thickness, 4.5, noise, 9);
  const right = limbFromBezier(
    [A.rightBase, base],
    [A.rightBase + 55 + A.lean * 80, 245],
    [A.apexX + 120, A.apexY - 6],
    [A.apexX - 120, A.apexY + 34],
    A.thickness * 0.92, 4, (t) => noise(t + 40), 9);
  limbs.push({ pts: A.leftInFront ? right : left, main: true });
  limbs.push({ pts: A.leftInFront ? left : right, main: true });

  // Branches off the main limbs: upward and outward, tapering to twigs.
  const mains = [left, right];
  for (let b = 0; b < A.branches; b++) {
    const src = mains[b % 2];
    const i = r.int(Math.floor(src.length * 0.22), Math.floor(src.length * 0.7));
    const p = src[i];
    // Outward and upward from the arch, never back across its crown: the
    // first render grew every branch into one tangle at the top.
    const outward = b % 2 === 0 ? -1 : 1; // left limb branches left, right limb right
    const ang = outward < 0 ? Math.PI + r.range(0.25, 0.95) : -r.range(0.25, 0.95);
    const len = r.range(50, 140);
    const w0 = Math.max(2.5, p.w * 0.55);
    const br = limbWalk(r, p.x, p.y, ang, len, w0, 1.2, r.range(-0.02, 0.02));
    if (br.length < 2) continue;
    limbs.push({ pts: br });
    if (br.length > 8 && r.chance(0.6)) {
      const j = r.int(Math.floor(br.length * 0.4), br.length - 2);
      const q = br[j];
      limbs.push({ pts: limbWalk(r, q.x, q.y, ang + r.range(-0.8, 0.8), len * r.range(0.3, 0.55), Math.max(1.5, q.w * 0.7), 0.8, 0) });
    }
  }

  // Roots splaying along the substrate from each base.
  for (let s = 0; s < A.sideRoots; s++) {
    for (const [x, dir] of [[A.leftBase, -1], [A.rightBase, 1]]) {
      const ang = dir < 0 ? Math.PI + r.range(0.05, 0.35) : -r.range(0.05, 0.35);
      limbs.unshift({ pts: limbWalk(r, x, base - 4, ang, r.range(70, 140), A.thickness * 0.5, 2, dir * -0.004) });
    }
  }

  // An optional smaller piece at one side, leaning in.
  if (A.sidePiece) {
    const left = A.sidePiece.side === 'left';
    const x0 = left ? r.range(110, 190) : r.range(1090, 1170);
    const k = A.sidePiece.size;
    const p3x = left ? x0 + 150 * k : x0 - 150 * k;
    limbs.unshift({ pts: limbFromBezier([x0, base], [x0 + (left ? 10 : -10), base - 90 * k],
      [p3x + (left ? -40 : 40), base - 170 * k], [p3x, base - 200 * k], A.thickness * 0.65 * k, 3,
      (t) => noise(t + 80), 6, 60) });
  }
  return limbs;
}

export function paintWood(L, limbs = buildWood(L)) {
  const c = canvas();
  const g = c.getContext('2d');
  const r = makeRng(L.seed ^ 0x40);
  const barks = ['#5a4332', '#54402f', '#604735'].map(hex);
  const bark = barks[L.seed % barks.length];
  for (const limb of limbs) paintLimb(g, r, limb.pts, shade(bark, r.range(0.9, 1.08)));
  for (const limb of limbs) paintMoss(g, r, limb.pts, L.arch.mossDensity);
  return c;
}

/* ── mid plants: ferns on the wood, short stems before the corners ──────── */

function drawFernLeaf(g, r, x, y, ang, len, wid, col) {
  const tip = [x + Math.cos(ang) * len, y + Math.sin(ang) * len];
  const nx = -Math.sin(ang), ny = Math.cos(ang);
  // A slight droop toward the tip.
  const droop = len * r.range(0.04, 0.16);
  const c1 = [x + Math.cos(ang) * len * 0.35 + nx * wid, y + Math.sin(ang) * len * 0.35 + ny * wid + droop * 0.3];
  const c2 = [x + Math.cos(ang) * len * 0.35 - nx * wid, y + Math.sin(ang) * len * 0.35 - ny * wid + droop * 0.3];
  const t2 = [tip[0], tip[1] + droop];
  const lit = Math.sin(ang) < -0.2 ? 1.1 : 0.9;
  const grad = g.createLinearGradient(x, y, t2[0], t2[1]);
  grad.addColorStop(0, rgb(shade(col, 0.75 * lit)));
  grad.addColorStop(0.6, rgb(shade(col, 1.0 * lit)));
  grad.addColorStop(1, rgb(shade(col, 1.15 * lit)));
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(c1[0], c1[1], t2[0], t2[1]);
  g.quadraticCurveTo(c2[0], c2[1], x, y);
  g.fill();
  // Midrib.
  g.strokeStyle = rgb(shade(col, 1.45), 0.6);
  g.lineWidth = 0.9;
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo((x + t2[0]) / 2, (y + t2[1]) / 2 + droop * 0.2, t2[0], t2[1]);
  g.stroke();
}

export function paintMidPlants(L) {
  const c = canvas();
  const g = c.getContext('2d');
  const r = makeRng(L.seed ^ 0x51);

  // Shorter stem species in front of the corner bushes.
  for (const cl of L.stemClusters.slice(2)) drawCluster(g, r, cl, 1);

  // Ferns tied to the wood bases.
  const fernCols = ['#2f5a26', '#3a6a2c', '#2b5230'].map(hex);
  for (const clump of L.ferns.clumps) {
    const by = clump.high ? r.range(L.arch.apexY + 30, L.arch.apexY + 80) : GEO.substrateBack + 10;
    for (let k = 0; k < clump.count; k++) {
      const ang = -Math.PI / 2 + r.range(-1.25, 1.25);
      const len = clump.high ? r.range(40, 70) : r.range(60, 115);
      drawFernLeaf(g, r, clump.x + r.range(-14, 14), by + r.range(-4, 4), ang, len, len * r.range(0.13, 0.19),
        shade(r.pick(fernCols), r.range(0.9, 1.15)));
    }
  }
  return c;
}

/* ── substrate: gravel, the sand path, pebbles, the carpet ──────────────── */

export function paintSubstrate(L) {
  const c = canvas();
  const g = c.getContext('2d');
  const r = makeRng(L.seed ^ 0x5a);
  const n2 = makeNoise2(L.seed ^ 0x5b);
  const top = GEO.substrateBack;

  // Gravel bed: a gentle mound toward the back corners, flat at the front.
  const mound = (x) => top - 6 * Math.cos((x / W) * Math.PI * 2) - 4;
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= W; x += 8) g.lineTo(x, mound(x));
  g.lineTo(W, H);
  g.closePath();
  const gr = g.createLinearGradient(0, top - 10, 0, H);
  gr.addColorStop(0, rgb(shade([96, 86, 72], L.scatter.gravelDarkness)));
  gr.addColorStop(1, rgb(shade([58, 50, 42], L.scatter.gravelDarkness)));
  g.fillStyle = gr;
  g.fill();

  // Gravel speckle.
  g.save();
  g.clip();
  for (let k = 0; k < 9000; k++) {
    const x = r.range(0, W), y = r.range(top - 12, H);
    const v = r.range(0.55, 1.35);
    g.fillStyle = rgb(shade([110, 100, 86], v), 0.8);
    g.fillRect(x, y, r.range(1, 2.6), r.range(1, 2));
  }
  g.restore();

  // The sand path, front-centre running back under the arch.
  g.beginPath();
  const left = [], right = [];
  for (let y = top - 2; y <= H; y += 3) {
    const { cx, hw } = pathAt(L, y);
    const wob = n2(y * 0.05, 1) * 6;
    left.push([cx - hw + wob, y]);
    right.push([cx + hw + wob * 0.7, y]);
  }
  g.moveTo(left[0][0], left[0][1]);
  for (const p of left) g.lineTo(p[0], p[1]);
  for (const p of right.reverse()) g.lineTo(p[0], p[1]);
  g.closePath();
  const sand = g.createLinearGradient(0, top, 0, H);
  sand.addColorStop(0, '#b4a283');
  sand.addColorStop(1, '#cbbb9a');
  g.fillStyle = sand;
  g.fill();
  g.save();
  g.clip();
  for (let k = 0; k < 7000; k++) {
    const x = r.range(L.path.frontX - L.path.frontWidth, L.path.frontX + L.path.frontWidth);
    const y = r.range(top - 4, H);
    g.fillStyle = rgb(shade([190, 174, 146], r.range(0.75, 1.12)), 0.7);
    g.fillRect(x, y, 1.2, 1.2);
  }
  // Soft ripples in the sand.
  for (let k = 0; k < 14; k++) {
    const y = r.range(top + 10, H);
    g.strokeStyle = 'rgba(150,130,100,0.18)';
    g.lineWidth = 1.2;
    g.beginPath();
    const { cx, hw } = pathAt(L, y);
    g.moveTo(cx - hw, y);
    g.quadraticCurveTo(cx, y + r.range(-4, 4), cx + hw, y);
    g.stroke();
  }
  g.restore();

  // Pebbles along the path edges and around the wood bases.
  const pebbles = [];
  for (let k = 0; k < L.scatter.pebbles; k++) {
    const y = r.range(top + 2, H - 8);
    const { cx, hw } = pathAt(L, y);
    const edge = r.chance(0.5) ? -1 : 1;
    pebbles.push({ x: cx + edge * (hw + r.range(-10, 14)), y, s: r.range(5, 13) * (0.7 + (y - top) / (H - top) * 0.6) });
  }
  for (let k = 0; k < 8; k++) {
    for (const bx of [L.arch.leftBase, L.arch.rightBase]) {
      pebbles.push({ x: bx + r.range(-55, 55), y: top + r.range(4, 22), s: r.range(5, 12) });
    }
  }
  pebbles.sort((a, b) => a.y - b.y).forEach((p) => pebble(g, r, p.x, p.y, p.s));

  // The carpet: a dense mat of tiny bright leaves over the front substrate,
  // leaving the path open. Cushion-shaped top edge.
  const carpetTop = (x) => top - 2 - 7 * (0.5 + 0.5 * n2(x * 0.02, 5));
  const base = [76, 138, 48];
  const hueShift = L.carpet.hue;
  for (let k = 0; k < 26000 * L.carpet.extent; k++) {
    const x = r.range(0, W);
    const yMin = carpetTop(x);
    const y = yMin + Math.pow(r.next(), 0.8) * (H - yMin);
    const { cx, hw } = pathAt(L, y);
    if (Math.abs(x - cx) < hw + 4) continue; // keep the path open
    // Patchy extent: thin out toward the edges of today's coverage.
    const cover = n2(x * 0.008, y * 0.02 + 3) * 0.5 + 0.5;
    // Feathered, not a hard hole: a few strays survive past today's edge.
    if (cover > L.carpet.extent + 0.1 && r.next() < 0.9) continue;
    const depth = (y - top) / (H - top);
    const v = r.range(0.75, 1.2) * (0.85 + 0.25 * (1 - depth));
    const col = [base[0] + hueShift, base[1], base[2] - hueShift];
    g.fillStyle = rgb(shade(col, v));
    g.beginPath();
    g.ellipse(x, y, r.range(1.6, 3.2), r.range(1.1, 2.2), r.range(0, Math.PI), 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

function pebble(g, r, x, y, s) {
  const tones = [[128, 122, 112], [150, 138, 120], [104, 100, 96], [168, 156, 136]];
  const base = r.pick(tones);
  const rx = s * r.range(0.9, 1.4), ry = s * r.range(0.55, 0.8);
  // Contact shadow.
  g.fillStyle = 'rgba(20,16,12,0.35)';
  g.beginPath(); g.ellipse(x + 1, y + ry * 0.55, rx * 1.05, ry * 0.45, 0, 0, Math.PI * 2); g.fill();
  const rg = g.createRadialGradient(x - rx * 0.35, y - ry * 0.45, 1, x, y, rx * 1.1);
  rg.addColorStop(0, rgb(shade(base, 1.35)));
  rg.addColorStop(0.6, rgb(base));
  rg.addColorStop(1, rgb(shade(base, 0.55)));
  g.fillStyle = rg;
  g.beginPath(); g.ellipse(x, y, rx, ry, r.range(-0.2, 0.2), 0, Math.PI * 2); g.fill();
}

/* ── foreground: edge grass and the carpet's front lip ─────────────────── */

export function paintFront(L) {
  const c = canvas();
  const g = c.getContext('2d');
  const r = makeRng(L.seed ^ 0xf0);

  // Fine grass at the edges — long ribbons that sway the most.
  const blade = (x, h, lean) => {
    const base = H - r.range(2, 18);
    const tipX = x + lean * h;
    const col = mix([62, 120, 44], [128, 186, 80], r.next());
    const w = r.range(2.2, 4.2);
    g.fillStyle = rgb(col, 0.95);
    g.beginPath();
    g.moveTo(x - w / 2, base);
    g.quadraticCurveTo(x + lean * h * 0.3 - w / 2, base - h * 0.55, tipX, base - h);
    g.quadraticCurveTo(x + lean * h * 0.3 + w / 2, base - h * 0.55, x + w / 2, base);
    g.fill();
    g.strokeStyle = rgb(shade(col, 1.3), 0.5);
    g.lineWidth = 0.7;
    g.beginPath();
    g.moveTo(x, base);
    g.quadraticCurveTo(x + lean * h * 0.3, base - h * 0.55, tipX, base - h);
    g.stroke();
  };
  for (let k = 0; k < L.grass.left; k++) blade(r.range(8, 120), L.grass.height * r.range(0.55, 1.1), r.range(0.0, 0.25));
  for (let k = 0; k < L.grass.right; k++) blade(r.range(1160, 1272), L.grass.height * r.range(0.55, 1.1), r.range(-0.25, 0));

  // The carpet's very front lip, so the substrate meets the glass softly.
  for (let k = 0; k < 2600; k++) {
    const x = r.range(0, W);
    const y = r.range(H - 18, H);
    const { cx, hw } = pathAt(L, y);
    if (Math.abs(x - cx) < hw) continue;
    g.fillStyle = rgb(shade([104, 178, 62], r.range(0.8, 1.2)));
    g.beginPath();
    g.ellipse(x, y, r.range(2, 3.6), r.range(1.4, 2.4), r.range(0, Math.PI), 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/* ── the light bar, glass edges, and the reflection band ────────────────── */

/** The hood the light hangs from: dark, with a strip whose colour the shader
 * tints from the real sun. Only its alpha-masked strip is emissive. */
export function paintHood() {
  const c = canvas(W, 40);
  const g = c.getContext('2d');
  const body = g.createLinearGradient(0, 0, 0, GEO.hoodBottom);
  body.addColorStop(0, '#08090a');
  body.addColorStop(0.75, '#16191b');
  body.addColorStop(1, '#25292c');
  g.fillStyle = body;
  g.fillRect(0, 0, W, GEO.hoodBottom);
  // Fine top-edge highlight on the fixture.
  g.fillStyle = 'rgba(255,255,255,0.06)';
  g.fillRect(0, 2, W, 1);
  return c;
}

/** Everything that sits ON the glass rather than in the water: silicone
 * corners, the bottom frame, edge highlights, a soft vignette. */
export function paintGlass() {
  const c = canvas();
  const g = c.getContext('2d');

  // Bottom frame.
  const bf = g.createLinearGradient(0, GEO.glassBottom, 0, H);
  bf.addColorStop(0, '#1a1d1f');
  bf.addColorStop(1, '#050606');
  g.fillStyle = bf;
  g.fillRect(0, GEO.glassBottom, W, H - GEO.glassBottom);
  g.fillStyle = 'rgba(255,255,255,0.10)';
  g.fillRect(0, GEO.glassBottom, W, 1);

  // Side silicone seams and glass edge highlights.
  for (const [x, dir] of [[0, 1], [W, -1]]) {
    const sg = g.createLinearGradient(x, 0, x + dir * 14, 0);
    sg.addColorStop(0, 'rgba(8,10,10,0.95)');
    sg.addColorStop(0.45, 'rgba(20,26,26,0.75)');
    sg.addColorStop(1, 'rgba(20,26,26,0)');
    g.fillStyle = sg;
    g.fillRect(dir > 0 ? 0 : W - 14, GEO.hoodBottom, 14, H - GEO.hoodBottom);
    g.fillStyle = 'rgba(220,240,240,0.18)';
    g.fillRect(dir > 0 ? 9 : W - 10, GEO.surface, 1, GEO.glassBottom - GEO.surface);
  }

  // Vignette: the eye reads a lit box, darker at its corners.
  const vg = g.createRadialGradient(W / 2, H * 0.45, H * 0.4, W / 2, H * 0.5, W * 0.62);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,8,10,0.35)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, H);
  return c;
}

/**
 * The underside of the water surface reflects the tank (total internal
 * reflection): a mirrored strip of what lies just below it. Baked from the
 * other layers once; the shader ripples it.
 */
export function paintReflection(layers) {
  const bandH = GEO.surface - GEO.hoodBottom;
  const c = canvas(W, bandH);
  const g = c.getContext('2d');
  g.save();
  g.translate(0, bandH);
  g.scale(1, -1);
  for (const layer of layers) {
    g.drawImage(layer, 0, GEO.surface, W, bandH * 1.6, 0, 0, W, bandH);
  }
  g.restore();
  // Darken and cool it: a reflection is dimmer than the thing reflected.
  g.fillStyle = 'rgba(30,70,70,0.30)';
  g.fillRect(0, 0, W, bandH);
  return c;
}
