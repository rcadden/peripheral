/* sky.js — the tank's light, from the real sun and the real weather.
 *
 * Roadmap, Sprint 9: "Light bar colour and intensity follow local
 * sunrise/sunset, computed from the weather location — no extra API.
 * Moonlight blue at night." And conditions: "Overcast: dimmer, cooler light.
 * Clear: strong caustics. Rain/snow: drops on the surface."
 *
 * Pure: no DOM, no clock. `now` and the location are always passed in, so a
 * dusk in October is a test, not a wait.
 */

const RAD = Math.PI / 180;

/** Default location when no weather location is saved: the install default
 * in src/sources/weather.js (Asheville, NC). */
export const DEFAULT_LOCATION = Object.freeze({ lat: 35.5436, lon: -82.6093 });

/**
 * Solar altitude in degrees (NOAA's low-precision algorithm — well under a
 * degree of error, which is a minute or two of sunset; plenty for a light bar).
 *
 * @param {Date} date
 * @param {number} lat  degrees north
 * @param {number} lon  degrees east (west is negative)
 */
export function sunAltitude(date, lat, lon) {
  const d = date.getTime() / 86_400_000 + 2440587.5 - 2451545.0; // days since J2000
  const g = ((357.529 + 0.98560028 * d) % 360) * RAD;            // mean anomaly
  const q = (280.459 + 0.98564736 * d) % 360;                    // mean longitude
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD; // ecliptic longitude
  const e = (23.439 - 0.00000036 * d) * RAD;                     // obliquity
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;      // hours
  const lst = (gmst * 15 + lon) * RAD;
  const h = lst - ra;
  const phi = lat * RAD;
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h)) / RAD;
}

const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

const DAY = [1.0, 0.985, 0.95];
const GOLDEN = [1.0, 0.80, 0.58];
const DUSK = [0.78, 0.58, 0.70];
const MOON = [0.42, 0.56, 0.92];

/**
 * Everything the scene needs to know about light at one instant.
 *
 * @param {{altitude: number, condition?: string}} o
 * @returns {{intensity: number, color: number[], caustics: number, rays: number,
 *            drops: 'none'|'rain'|'snow', phase: 'day'|'golden'|'twilight'|'night'}}
 */
export function lighting({ altitude, condition = 'clear' }) {
  let color, intensity, phase;
  if (altitude >= 12) {
    color = DAY; intensity = 1; phase = 'day';
  } else if (altitude >= 0) {
    const t = smooth(0, 12, altitude);
    color = lerp3(GOLDEN, DAY, t); intensity = lerp(0.78, 1, t); phase = 'golden';
  } else if (altitude >= -8) {
    const t = smooth(-8, 0, altitude);
    color = lerp3(MOON, lerp3(DUSK, GOLDEN, t), t); intensity = lerp(0.36, 0.78, t); phase = 'twilight';
  } else {
    color = MOON; intensity = 0.36; phase = 'night';
  }

  /* The sun's own contribution to caustics and god rays: full in daylight,
   * faint moonlight shimmer at night. */
  const sun = smooth(-6, 10, altitude);
  let caustics = lerp(0.18, 1, sun);
  let rays = lerp(0.12, 1, sun);
  let drops = 'none';

  const cool = [0.86, 0.92, 1.0];
  switch (condition) {
    case 'cloudy':
      intensity *= 0.80; color = lerp3(color, cool, 0.35); caustics *= 0.35; rays *= 0.35;
      break;
    case 'rain':
    case 'storm':
      intensity *= 0.70; color = lerp3(color, cool, 0.45); caustics *= 0.25; rays *= 0.20;
      drops = 'rain';
      break;
    case 'snow':
      intensity *= 0.78; color = lerp3(color, [0.9, 0.95, 1.0], 0.5); caustics *= 0.30; rays *= 0.30;
      drops = 'snow';
      break;
    default: // clear: the strong caustics are the sun term above, unscaled
      break;
  }
  return { intensity, color, caustics, rays, drops, phase };
}
