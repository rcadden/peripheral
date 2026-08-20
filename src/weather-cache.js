/* weather-cache.js — last-good weather reading, persisted across restarts.
 *
 * Same reasoning as cache.js (calendar): a restart at logon with the network
 * still negotiating should not blank the bar. Separate file rather than
 * reusing StateCache, because the two have different shapes and different
 * staleness rules — a stale CALENDAR is still useful ("here's what I last
 * knew"), but a stale TEMPERATURE reading is actively misleading past a
 * couple of hours, so this gets a much shorter cache ceiling.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { dataFile } from './paths.js';

const CACHE_VERSION = 1;

/** Older than this and a cached reading is worse than none. */
export const MAX_WEATHER_CACHE_AGE_MS = 3 * 60 * 60 * 1000; // 3h

export function defaultWeatherCachePath() {
  if (process.env.PERIPHERAL_WEATHER_STATE_PATH) {
    return path.resolve(process.env.PERIPHERAL_WEATHER_STATE_PATH);
  }
  return dataFile('last-weather.json');
}

export class WeatherCache {
  constructor(filePath = defaultWeatherCachePath()) {
    this.filePath = filePath;
    this._lastWritten = null;
  }

  /** @returns {Promise<import('./sources/weather.js').WeatherState|null>} */
  async load() {
    let parsed;
    try {
      parsed = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`[weather-cache] ignoring unreadable cache (${this.filePath}): ${err.message}`);
      }
      return null;
    }

    if (parsed.version !== CACHE_VERSION || !parsed.state?.generatedAt) {
      console.warn('[weather-cache] ignoring cache written by a different version');
      return null;
    }

    const age = Date.now() - new Date(parsed.state.generatedAt).getTime();
    if (!Number.isFinite(age) || age > MAX_WEATHER_CACHE_AGE_MS) {
      console.warn(`[weather-cache] ignoring cache ${Math.round(age / 60_000)}min old`);
      return null;
    }

    console.log(`[weather-cache] restored reading ${Math.round(age / 60_000)}min old — `
      + 'serving stale until the first fetch');
    return { ...parsed.state, stale: true };
  }

  /** @param {import('./sources/weather.js').WeatherState} state */
  async save(state) {
    const signature = JSON.stringify({
      tempF: state.tempF, highF: state.highF,
      precipChance: state.precipChance, condition: state.condition,
    });
    if (signature === this._lastWritten) return;

    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify({ version: CACHE_VERSION, state }, null, 2));
      await fs.rename(tmp, this.filePath);
      this._lastWritten = signature;
    } catch (err) {
      console.warn(`[weather-cache] could not persist state: ${err.message}`);
    }
  }
}
