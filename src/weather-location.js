/* weather-location.js — resolve a US zip code to NWS grid coordinates, and
 * persist the choice.
 *
 * Chain, both hops free and keyless — no new API key, no new recurring cost,
 * nothing in .env:
 *   1. zip -> lat/lon, via Zippopotam.us (api.zippopotam.us). Confirmed
 *      2026-08-20 to require no key or account for a bare US zip lookup.
 *   2. lat/lon -> NWS grid + nearest station, via api.weather.gov/points —
 *      the exact endpoint src/sources/weather.js's own hardcoded defaults
 *      were originally resolved through by hand, now automated.
 *
 * WHY ZIP, NOT A FULL ADDRESS OR RAW LAT/LON: a full-address geocoder with
 * the precision to matter (Google Places, etc.) requires a paid/keyed API,
 * which breaks the "free, keyless" principle weather.js already established.
 * Raw lat/lon is more precise but terrible UX — nobody has their coordinates
 * memorized. Zip is the point where "good enough precision" meets "an input
 * a stranger actually has on hand." A zip centroid is NOT your exact address
 * (confirmed: Ricky's own zip centroid lands ~2.5mi from his real
 * coordinates) — fine for weather, since an NWS grid cell already covers a
 * wide area, but worth saying plainly in the UI rather than implying
 * false precision.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { dataFile } from './paths.js';

const LOCATION_VERSION = 1;
const USER_AGENT = 'Peripheral/0.1 (github.com/rcadden/peripheral, contact: grcadden@gmail.com)';

/** Resolve the saved-location file path. Honours PERIPHERAL_WEATHER_LOCATION_PATH. */
export function defaultLocationPath() {
  if (process.env.PERIPHERAL_WEATHER_LOCATION_PATH) {
    return path.resolve(process.env.PERIPHERAL_WEATHER_LOCATION_PATH);
  }
  return dataFile('weather-location.json');
}

async function getJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/geo+json, application/json' },
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

/**
 * @param {string} zip 5-digit US zip
 * @returns {Promise<{lat:number, lon:number, city:string, state:string}>}
 */
export async function resolveZip(zip) {
  const clean = String(zip).trim();
  if (!/^\d{5}$/.test(clean)) throw new Error('zip must be exactly 5 digits');

  const data = await getJson(`https://api.zippopotam.us/us/${clean}`);
  const place = data.places?.[0];
  if (!place) throw new Error(`no US location found for zip ${clean}`);

  return {
    lat: Number(place.latitude),
    lon: Number(place.longitude),
    city: place['place name'],
    state: place['state abbreviation'],
  };
}

/**
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<{gridId:string, gridX:number, gridY:number, stationId:string}>}
 */
export async function resolveGrid(lat, lon) {
  const points = await getJson(`https://api.weather.gov/points/${lat},${lon}`);
  const { gridId, gridX, gridY, observationStations } = points.properties ?? {};
  if (!gridId) throw new Error('NWS returned no grid for this location — is it inside the US?');

  if (!observationStations) throw new Error('NWS returned no observation-station link for this grid');
  const stations = await getJson(observationStations);
  // NWS returns stations nearest-first; the first entry is the one to use.
  // See mapCondition()'s neighbour in weather.js — same "don't over-fit a
  // vendor's exact ordering guarantee" caution applies, but this is NWS's
  // own documented behaviour for this endpoint, not an assumption.
  const stationId = stations.features?.[0]?.properties?.stationIdentifier;
  if (!stationId) throw new Error('no observation station found near this location');

  return { gridId, gridX, gridY, stationId };
}

/**
 * Full chain: a zip code becomes everything NwsProvider needs.
 * @param {string} zip
 */
export async function resolveZipToGrid(zip) {
  const place = await resolveZip(zip);
  const grid = await resolveGrid(place.lat, place.lon);
  return { zip: String(zip).trim(), ...place, ...grid };
}

export class WeatherLocationStore {
  /** @param {string=} filePath */
  constructor(filePath = defaultLocationPath()) {
    this.filePath = filePath;
  }

  /**
   * The saved location, or null if none has ever been saved / the file is
   * unreadable / corrupt / a different version — never throws. Mirrors
   * StateCache's reasoning: a missing file is the normal case before anyone
   * uses this feature, and a corrupt one is not worth failing the daemon over.
   *
   * @returns {Promise<null|{zip:string, city:string, state:string, lat:number,
   *   lon:number, gridId:string, gridX:number, gridY:number, stationId:string}>}
   */
  async load() {
    let parsed;
    try {
      parsed = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`[weather-location] ignoring unreadable file (${this.filePath}): ${err.message}`);
      }
      return null;
    }

    if (parsed.version !== LOCATION_VERSION || !parsed.location?.gridId) {
      console.warn('[weather-location] ignoring file written by a different version');
      return null;
    }
    return parsed.location;
  }

  /** @param {object} location - the full shape resolveZipToGrid() returns */
  async save(location) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({
      version: LOCATION_VERSION,
      location,
    }, null, 2), { mode: 0o600 });
    // Rename over the old file, so a crash mid-write cannot leave a
    // truncated location file the next boot would have to distrust.
    await fs.rename(tmp, this.filePath);
  }
}
