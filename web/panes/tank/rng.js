/* rng.js — seeded randomness and noise for the tank.
 *
 * "A new tank every day" means the same date must always produce the same
 * tank, across restarts and across machines (roadmap, Sprint 9). Math.random
 * cannot do that, so everything that shapes the scene draws from here.
 * Pure, dependency-free, and importable from Node so test/ can pin it.
 */

/** 32-bit FNV-1a of a string — turns '2026-10-08' into a seed. */
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * mulberry32 with a few conveniences. Small, fast, and good enough for
 * placing plants — this is set dressing, not cryptography.
 *
 * @param {number} seed
 */
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng = {
    next,
    /** Uniform in [lo, hi). */
    range: (lo, hi) => lo + (hi - lo) * next(),
    /** Integer in [lo, hi]. */
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    /** Roughly normal, mean 0, sd ~1 (sum of uniforms). */
    gauss: () => (next() + next() + next() + next() - 2) * 1.732,
    /** An independent child stream, so adding draws in one place does not
     * reshuffle everything generated after it. */
    fork: (label) => makeRng(hashString(`${a}:${label}`)),
  };
  return rng;
}

/** Smooth 1D value noise in [-1, 1], seeded. */
export function makeNoise1(seed) {
  const r = makeRng(seed);
  const N = 256;
  const table = Array.from({ length: N }, () => r.range(-1, 1));
  return (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    const a = table[((i % N) + N) % N];
    const b = table[(((i + 1) % N) + N) % N];
    return a + (b - a) * u;
  };
}

/** Smooth 2D value noise in [-1, 1], seeded. */
export function makeNoise2(seed) {
  const r = makeRng(seed);
  const N = 256;
  const perm = Array.from({ length: N }, (_, i) => i);
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(r.next() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const vals = Array.from({ length: N }, () => r.range(-1, 1));
  const at = (x, y) => vals[perm[(perm[x & 255] + y) & 255]];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/** Fractal sum of 2D noise. */
export function fbm2(noise, x, y, octaves = 4) {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}
