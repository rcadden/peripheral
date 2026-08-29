/* display-settings.js — persisted physical-display settings.
 *
 * Today that is one thing: which way up the panel is bolted to its magnetic
 * mount. It is a file rather than a constant because it describes THIS
 * install's hardware, not the product — the same reason weather-location.json
 * and palette-overrides.json exist, and it follows both of them exactly:
 * atomic temp-file + rename, versioned JSON, stored OUTSIDE the repo in the
 * per-user data directory (see paths.js). Named for the category rather than
 * for rotation so a second display-level setting doesn't need a second file.
 *
 * ── PRECEDENCE: THE PICKER WINS, AND THAT INVERTS THE PALETTE'S RULE ─────
 * palette.js's HUE POLICY says an env var ALWAYS beats a picker-saved choice.
 * Rotation deliberately does the opposite, decided 2026-08-28 when the
 * setting moved into the settings UI:
 *
 *   PERIPHERAL_ROTATE is the DEFAULT, used only when nothing has been saved.
 *   A value saved through the picker wins over it, always.
 *
 * The palette rule is right for what it governs — those env vars are per-run
 * experiments driven from a CLI (`npm run palette`), where "the flag I just
 * typed wins" is the whole point, and the CLI prints what it resolved. This
 * is a toggle in a web UI. If an env var could silently outrank it, flipping
 * the control would do nothing, report success, and leave the panel upside
 * down — a UI whose value is quietly ignored, which is the exact failure
 * class this project keeps writing rules against. A stale line in .env must
 * not be able to beat a human who just clicked Save while looking at the
 * glass.
 *
 * The env var is still worth keeping: it is the only way to set orientation
 * on a machine being provisioned unattended, before anyone has opened a
 * browser. `resolveRotation()` is the one place that ordering lives, and it
 * reports which source won so the UI can say so out loud.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { dataFile } from './paths.js';

const DISPLAY_VERSION = 1;

/* 0 or 180 only. A quarter turn is NOT a missing feature to add later: the
 * glass is 1280x480, so 90/270 would need a 480x1280 pane — a different
 * layout, different type scale, different everything — not a transform on
 * this one. Offering it as a rotation option would promise something a CSS
 * rotate cannot deliver. See agenda.css's [data-rotate] rule. */
export const ROTATIONS = [0, 180];

/** Resolve the settings file path. Honours PERIPHERAL_DISPLAY_PATH. */
export function defaultDisplayPath() {
  if (process.env.PERIPHERAL_DISPLAY_PATH) {
    return path.resolve(process.env.PERIPHERAL_DISPLAY_PATH);
  }
  return dataFile('display.json');
}

/**
 * Coerce anything into a valid rotation, or null if it isn't one.
 * Accepts the number and the string form — the number comes from JSON, the
 * string from an env var and from a form control, and treating `"180"` as
 * invalid would be a trap rather than a safety feature.
 *
 * @param {unknown} value
 * @returns {0|180|null}
 */
export function parseRotation(value) {
  if (value === null || value === undefined) return null;
  // Empty/whitespace string is an ABSENCE, not a zero. `Number('')` is 0, so
  // without this an empty form field or a blank JSON value would silently
  // resolve to "Normal" — a missing answer masquerading as a deliberate one.
  // Caught by test/display-settings.test.js, not by reading the code.
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = typeof value === 'string' ? Number(value.trim()) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return ROTATIONS.includes(n) ? /** @type {0|180} */ (n) : null;
}

/**
 * The rotation PERIPHERAL_ROTATE asks for, or null if it is unset or empty.
 * An unparseable value warns rather than throwing — a typo in .env must not
 * stop a daemon from coming up, and silently swallowing it would leave
 * someone staring at an upside-down panel wondering why their setting did
 * nothing.
 *
 * @returns {0|180|null}
 */
export function envRotation() {
  const raw = process.env.PERIPHERAL_ROTATE;
  if (raw === undefined || String(raw).trim() === '') return null;
  const parsed = parseRotation(raw);
  if (parsed === null) {
    console.warn(`[display] PERIPHERAL_ROTATE=${raw} is not 0 or 180 — ignoring it`);
  }
  return parsed;
}

/**
 * The single place the saved/env/default ordering lives. Reports its source
 * as well as its value so the settings UI can tell a human WHY the panel is
 * the way it is, rather than showing a number with no provenance.
 *
 * @param {null|{rotate?:number}} saved  what DisplaySettingsStore.load() returned
 * @returns {{rotate: 0|180, source: 'saved'|'env'|'default'}}
 */
export function resolveRotation(saved) {
  const fromSaved = parseRotation(saved?.rotate);
  if (fromSaved !== null) return { rotate: fromSaved, source: 'saved' };

  const fromEnv = envRotation();
  if (fromEnv !== null) return { rotate: fromEnv, source: 'env' };

  return { rotate: 0, source: 'default' };
}

export class DisplaySettingsStore {
  /** @param {string=} filePath */
  constructor(filePath = defaultDisplayPath()) {
    this.filePath = filePath;
  }

  /**
   * The saved settings, or null if none have been saved / the file is
   * unreadable / corrupt / a different version — never throws. Same
   * reasoning as StateCache and WeatherLocationStore: a missing file is the
   * normal case before anyone touches this feature, and a corrupt one is not
   * worth failing the daemon over. Falling back to the env/default chain
   * leaves the panel upright rather than dead.
   *
   * @returns {Promise<null|{rotate: 0|180}>}
   */
  async load() {
    let parsed;
    try {
      parsed = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`[display] ignoring unreadable file (${this.filePath}): ${err.message}`);
      }
      return null;
    }

    if (parsed.version !== DISPLAY_VERSION || typeof parsed.display !== 'object' || parsed.display === null) {
      console.warn('[display] ignoring file written by a different version');
      return null;
    }

    const rotate = parseRotation(parsed.display.rotate);
    if (rotate === null) {
      console.warn(`[display] ignoring saved rotate=${parsed.display.rotate} — not 0 or 180`);
      return null;
    }
    return { rotate };
  }

  /**
   * @param {{rotate: number|string}} display
   * @throws if the rotation is not one this pane can actually render — the
   *   validation lives here, not only in the HTTP handler, so nothing can
   *   persist a value the daemon would then have to ignore at boot.
   */
  async save(display) {
    const rotate = parseRotation(display?.rotate);
    if (rotate === null) {
      throw new Error(`rotate must be one of ${ROTATIONS.join(', ')} — got ${display?.rotate}`);
    }

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({
      version: DISPLAY_VERSION,
      display: { rotate },
    }, null, 2), { mode: 0o600 });
    // Rename over the old file, so a crash mid-write cannot leave a truncated
    // settings file the next boot would have to distrust.
    await fs.rename(tmp, this.filePath);
    return { rotate };
  }
}
