/* palette-overrides.js — persisted colour-picker choices.
 *
 * Mirrors src/cache.js and src/auth/tokens.js exactly: atomic temp-file +
 * rename, versioned JSON, stored OUTSIDE the repo in the per-user data
 * directory (see paths.js) rather than in .env. Not .env because:
 *
 *   - env vars are read ONCE at process boot (Node's --env-file-if-exists),
 *     so a picker "Save" writing to .env would need a full daemon restart
 *     to take effect. A JSON file that palette.js's regenerate() reads at
 *     call time applies immediately.
 *   - there is no existing pattern anywhere in this codebase for writing to
 *     .env programmatically, and .env also holds real secrets — adding a
 *     write path to it is extra risk for no benefit here.
 *
 * Only stores the roles the user actually touched via the picker (a partial
 * object), not a full snapshot of every role — so a role nobody has ever
 * picked a colour for naturally falls through to the env/hardcoded default,
 * and adding a new accent role to palette.js later needs no migration here.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { dataFile } from './paths.js';
import { ENV_HUE_KEYS, ENV_HUE_DEFAULTS } from './palette.js';

const OVERRIDES_VERSION = 1;
const ROLES = ['hero', 'cool', 'calendarWork', 'calendarPersonal'];

/** Resolve the overrides file path. Honours PERIPHERAL_PALETTE_OVERRIDES_PATH. */
export function defaultOverridesPath() {
  if (process.env.PERIPHERAL_PALETTE_OVERRIDES_PATH) {
    return path.resolve(process.env.PERIPHERAL_PALETTE_OVERRIDES_PATH);
  }
  return dataFile('palette-overrides.json');
}

/** A hue value is valid if it's a finite number or the literal 'wallpaper'. */
function isValidHue(v) {
  return v === 'wallpaper' || (typeof v === 'number' && Number.isFinite(v));
}

export class PaletteOverridesStore {
  /** @param {string=} filePath */
  constructor(filePath = defaultOverridesPath()) {
    this.filePath = filePath;
  }

  /**
   * The saved partial hues object, or {} if none exist yet or the file is
   * unreadable/corrupt/wrong-version — never throws. A missing file is the
   * normal case (nobody has used the picker yet); a corrupt one is not worth
   * failing the daemon over, same reasoning as StateCache.
   *
   * @returns {Promise<{hero?:number|'wallpaper', cool?:number|'wallpaper',
   *   calendarWork?:number|'wallpaper', calendarPersonal?:number|'wallpaper'}>}
   */
  async load() {
    let parsed;
    try {
      parsed = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`[palette-overrides] ignoring unreadable file (${this.filePath}): ${err.message}`);
      }
      return {};
    }

    if (parsed.version !== OVERRIDES_VERSION || typeof parsed.hues !== 'object' || parsed.hues === null) {
      console.warn('[palette-overrides] ignoring file written by a different version');
      return {};
    }

    const hues = {};
    for (const role of ROLES) {
      if (role in parsed.hues && isValidHue(parsed.hues[role])) hues[role] = parsed.hues[role];
    }
    return hues;
  }

  /**
   * Shallow-merges `partialHues` into whatever is already saved and persists
   * the result. Unknown keys are dropped, invalid values are dropped — the
   * caller (the picker's save route) is expected to validate first, but this
   * is the last line of defence against writing a broken file.
   *
   * @param {object} partialHues
   */
  async save(partialHues) {
    const existing = await this.load();
    const merged = { ...existing };
    for (const role of ROLES) {
      if (role in partialHues && isValidHue(partialHues[role])) merged[role] = partialHues[role];
    }

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({
      version: OVERRIDES_VERSION,
      hues: merged,
    }, null, 2), { mode: 0o600 });
    // Rename over the old file, so a crash mid-write cannot leave a
    // truncated overrides file that the next boot would have to distrust.
    await fs.rename(tmp, this.filePath);
    return merged;
  }
}

/**
 * Combine env defaults, a saved picker override, and an optional per-request
 * override (e.g. the picker's live preview query string) into one hues
 * object, applying the documented precedence: env var (if actually SET, not
 * just falling back to its hardcoded default) wins, then the picker's saved
 * value, then the hardcoded default.
 *
 * @param {object} saved - from PaletteOverridesStore.load()
 * @param {object} [requestOverride] - e.g. parsed query-string values
 */
export function mergeHues(saved = {}, requestOverride = {}) {
  const hues = {};
  for (const role of ROLES) {
    if (role in requestOverride && requestOverride[role] !== undefined) {
      hues[role] = requestOverride[role];
    } else if (process.env[ENV_HUE_KEYS[role]] !== undefined) {
      hues[role] = ENV_HUE_DEFAULTS[role]; // env var IS the default's source here
    } else if (role in saved) {
      hues[role] = saved[role];
    } else {
      hues[role] = ENV_HUE_DEFAULTS[role];
    }
  }
  return hues;
}

export { ROLES as PALETTE_ROLES };
