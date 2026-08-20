/* weather.js — NWS (api.weather.gov) weather source.
 *
 * Free, keyless, US-only — fits Asheville and costs nothing. No account, no
 * secret, nothing in .env. The only courtesy NWS asks is an identifying
 * User-Agent header, which is not a credential.
 *
 * ── LOCATION IS HARDCODED ON PURPOSE ────────────────────────────────────
 * Resolved 2026-08-19 from Ricky's real address (169 Monroe Creek Blvd,
 * Asheville, NC 28806 → 35.54360964445704, -82.60927223632042):
 *
 *   gridId=GSP, gridX=54, gridY=73 — confirmed 443m from Asheville itself,
 *   elevation 643m (matches Asheville's actual elevation; GSP is just the
 *   NWS office CODE responsible for this county, not where the data comes
 *   from — the office is ~55mi away in Greenville, SC, but issues
 *   elevation-specific gridded forecasts for every cell in its territory).
 *
 *   station=KAVL — confirmed by Ricky as "2 exits down the freeway."
 *
 * This install is fixed in one spot, so there is no reason to geocode on
 * every boot — that's a dependency and a failure mode for zero benefit.
 * If the panel ever moves, re-resolve via `https://api.weather.gov/points/{lat},{lon}`
 * and update the constants below.
 */

const GRID_ID = 'GSP';
const GRID_X = 54;
const GRID_Y = 73;
const STATION_ID = 'KAVL';

const USER_AGENT = 'Peripheral/0.1 (github.com/rcadden/peripheral, contact: grcadden@gmail.com)';

async function getJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/geo+json' },
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

/**
 * NWS forecast/observation text -> one of a small icon set. Deliberately
 * coarse (5 states) to match a handful of flat glyphs, not a 1:1 mapping of
 * NWS's much larger vocabulary ("Patchy Fog then Sunny" etc).
 *
 * @param {string} text
 * @returns {'clear'|'cloudy'|'rain'|'snow'|'storm'}
 */
export function mapCondition(text) {
  const t = (text || '').toLowerCase();
  if (/thunder|storm/.test(t)) return 'storm';
  if (/snow|sleet|ice|flurr/.test(t)) return 'snow';
  if (/rain|shower|drizzle/.test(t)) return 'rain';
  if (/cloud|overcast|fog|haze|smoke/.test(t)) return 'cloudy';
  return 'clear';
}

/**
 * @typedef {object} WeatherState
 * @property {string}  generatedAt
 * @property {boolean} stale
 * @property {number}  tempF          current, from the nearest station
 * @property {number}  highF          today's forecast high
 * @property {number}  precipChance   0-100
 * @property {'clear'|'cloudy'|'rain'|'snow'|'storm'} condition
 * @property {string}  conditionText  raw NWS text, for logs/debugging
 */

export class NwsProvider {
  constructor({ gridId = GRID_ID, gridX = GRID_X, gridY = GRID_Y, stationId = STATION_ID } = {}) {
    this.gridId = gridId;
    this.gridX = gridX;
    this.gridY = gridY;
    this.stationId = stationId;
  }
  get label() { return 'nws'; }

  /** @returns {Promise<WeatherState>} */
  async fetchNow() {
    const [forecast, obs] = await Promise.all([
      getJson(`https://api.weather.gov/gridpoints/${this.gridId}/${this.gridX},${this.gridY}/forecast`),
      getJson(`https://api.weather.gov/stations/${this.stationId}/observations/latest`),
    ]);

    const periods = forecast.properties?.periods ?? [];
    // Today's daytime period carries the day's real high. Run this at night
    // and periods[0] is "Tonight" instead — falling back to it means "highF"
    // becomes tonight's low on a late refresh. Known and accepted: there is
    // no "today's high" left to report once today's daytime period has
    // already passed, and this provider does not try to invent one.
    const today = periods.find((p) => p.isDaytime) ?? periods[0];
    if (!today) throw new Error('nws: no forecast periods returned');

    const props = obs.properties ?? {};
    const tempC = props.temperature?.value;
    // Station observations occasionally arrive with a null reading (sensor
    // gap). Falling back to the forecast high beats throwing the whole
    // fetch away over one missing field.
    const tempF = typeof tempC === 'number' ? Math.round((tempC * 9) / 5 + 32) : today.temperature;

    const conditionText = props.textDescription || today.shortForecast || '';

    return {
      generatedAt: new Date().toISOString(),
      stale: false,
      tempF,
      highF: today.temperature,
      precipChance: Math.round(today.probabilityOfPrecipitation?.value ?? 0),
      condition: mapCondition(conditionText),
      conditionText,
    };
  }
}
