/* cache.js — last-good-state, persisted across restarts.
 *
 * WHY THIS IS MANDATORY, NOT NICE-TO-HAVE
 * ────────────────────────────────────────────────────────────────────────
 * The daemon already keeps a last-good state in memory, so a Wi-Fi blip or a
 * failed refresh never blanks the panel. That protection evaporates on
 * restart — and restart is the common case, because this thing is meant to
 * launch at logon. Boot the PC with the Wi-Fi still negotiating and the panel
 * shows an empty agenda, which reads as "you have a free day" rather than
 * "I don't know yet". That is the exact failure project_goals.md principle 3
 * exists to prevent.
 *
 * It got more important after the single-token revision (2026-08-17): with one
 * work token serving both calendars, one `invalid_grant` loses everything at
 * once. Yesterday's events marked stale beat an empty screen.
 *
 * Contents: real event titles from a work calendar. So it lives in the
 * per-user data directory alongside the token store, never in the repo —
 * this repo goes public. See paths.js.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { dataFile } from './paths.js';

const CACHE_VERSION = 1;

/** Older than this and it is not worth showing at all. */
export const MAX_CACHE_AGE_MS = 36 * 60 * 60 * 1000; // 36h

export function defaultCachePath() {
  if (process.env.PERIPHERAL_STATE_PATH) {
    return path.resolve(process.env.PERIPHERAL_STATE_PATH);
  }
  return dataFile('last-state.json');
}

export class StateCache {
  constructor(filePath = defaultCachePath()) {
    this.filePath = filePath;
    /** Serialised form of the last thing written, to skip no-op writes. */
    this._lastWritten = null;
  }

  /**
   * The cached state, or null. Always returned with `stale: true` — it is by
   * definition not a live reading, and the badge must say so before the first
   * successful fetch replaces it.
   *
   * A cache from a previous *day* is returned too, and that is intentional:
   * the pane's own classification will mark every event past and render
   * "Nothing left today", which is an honest thing to say while stale. Only
   * MAX_CACHE_AGE_MS drops it entirely.
   *
   * @returns {Promise<import('./sources/gcal.js').PeripheralState|null>}
   */
  async load() {
    let parsed;
    try {
      parsed = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
    } catch (err) {
      // A missing cache is the normal first run. A corrupt one is not worth
      // failing over — it is a convenience, and the daemon must still start.
      if (err.code !== 'ENOENT') {
        console.warn(`[cache] ignoring unreadable cache (${this.filePath}): ${err.message}`);
      }
      return null;
    }

    if (parsed.version !== CACHE_VERSION || !parsed.state?.generatedAt) {
      console.warn('[cache] ignoring cache written by a different version');
      return null;
    }

    const age = Date.now() - new Date(parsed.state.generatedAt).getTime();
    if (!Number.isFinite(age) || age > MAX_CACHE_AGE_MS) {
      console.warn(`[cache] ignoring cache ${Math.round(age / 3_600_000)}h old`);
      return null;
    }

    console.log(`[cache] restored ${parsed.state.events?.length ?? 0} event(s), `
      + `${Math.round(age / 60_000)}min old — serving stale until the first fetch`);
    return { ...parsed.state, stale: true };
  }

  /**
   * Persist a state. Never throws: losing the cache costs a blank panel on the
   * *next* restart, while throwing here would cost the panel right now.
   *
   * @param {import('./sources/gcal.js').PeripheralState} state
   */
  async save(state) {
    // The daemon refreshes once a minute and the agenda changes a few times a
    // day. Comparing events rather than the whole state skips ~1400 writes a
    // day that differ only in `generatedAt`.
    const signature = JSON.stringify(state.events ?? []);
    if (signature === this._lastWritten) return;

    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.${process.pid}.tmp`;
      await fs.writeFile(tmp, JSON.stringify({
        version: CACHE_VERSION,
        state,
      }, null, 2), { mode: 0o600 });
      // Rename over the old file, so a crash mid-write cannot leave a truncated
      // cache that the next boot would have to distrust.
      await fs.rename(tmp, this.filePath);
      this._lastWritten = signature;
    } catch (err) {
      console.warn(`[cache] could not persist state: ${err.message}`);
    }
  }
}
