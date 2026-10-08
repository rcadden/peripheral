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

/* ── Fish tank idle mode (Sprint 9, 2026-10-08) ──────────────────────────
 * During free time the panel shows a procedurally generated aquarium; the
 * agenda takes over during events and for `leadMinutes` before the next one
 * (see web/panes/tank/mode.js). Three settings, all applied by the existing
 * display.json file watch without a daemon restart — the Sprint 7 pattern.
 *
 *   enabled      on by default (Ricky, 2026-10-08: "On, with an off switch")
 *   leadMinutes  how long before an event the agenda takes back the glass
 *   fps          the tank's push rate. 4 by default — Ricky's cadence call
 *                against the panel's reliability record, 2026-10-08. Capped
 *                at 4 here AND in the transport (cadence.js MAX_FPS): the
 *                render loop floors at 250ms, so a higher value would be a
 *                promise the daemon cannot keep.
 *                SUPERSEDED same day, after fps-test on the real unit: 10 by
 *                default, options up to 10, capped at 10 in both places, and
 *                the render floor is now 100ms. See cadence.js MAX_FPS.
 *
 * No env var outranks or defaults these. Rotation has PERIPHERAL_ROTATE for
 * unattended provisioning; nothing about the tank needs to be set before a
 * human can open a browser, and every extra precedence layer is one more way
 * for a control to look like it did nothing.
 */

/** @typedef {{enabled: boolean, leadMinutes: number, fps: number}} TankSettings */

export const TANK_DEFAULTS = Object.freeze({ enabled: true, leadMinutes: 10, fps: 10 });
export const TANK_FPS_OPTIONS = [1, 2, 4, 6, 8, 10];
const TANK_FPS_MAX = TANK_FPS_OPTIONS[TANK_FPS_OPTIONS.length - 1];
export const TANK_LEAD_RANGE = Object.freeze({ min: 1, max: 60 });

/** A boolean, from JSON or a form control. Absence and junk are null. */
function parseBool(v) {
  if (v === true || v === false) return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return null;
}

/** An integer in [min, max], from JSON or a form control — or null. */
function parseIntIn(v, min, max) {
  // Same trap as parseRotation: Number('') is 0. Reject the absence first.
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = typeof v === 'string' ? Number(v.trim()) : v;
  if (typeof n !== 'number' || !Number.isInteger(n)) return null;
  return n >= min && n <= max ? n : null;
}

/**
 * Validate each tank field on its own; return only the valid ones. Used on
 * LOAD, where a bad field is warned about and dropped (falling back to its
 * default) rather than discarding the whole file.
 *
 * @param {unknown} raw
 * @returns {Partial<TankSettings>|null}
 */
export function parseTank(raw) {
  if (typeof raw !== 'object' || raw === null) return null;
  const out = {};
  if (raw.enabled !== undefined) {
    const v = parseBool(raw.enabled);
    if (v === null) console.warn(`[display] ignoring saved tank.enabled=${raw.enabled}`);
    else out.enabled = v;
  }
  if (raw.leadMinutes !== undefined) {
    const v = parseIntIn(raw.leadMinutes, TANK_LEAD_RANGE.min, TANK_LEAD_RANGE.max);
    if (v === null) console.warn(`[display] ignoring saved tank.leadMinutes=${raw.leadMinutes}`);
    else out.leadMinutes = v;
  }
  if (raw.fps !== undefined) {
    const v = parseIntIn(raw.fps, 1, TANK_FPS_MAX);
    if (v === null || !TANK_FPS_OPTIONS.includes(v)) console.warn(`[display] ignoring saved tank.fps=${raw.fps}`);
    else out.fps = v;
  }
  return out;
}

/**
 * Validate on SAVE, where a bad field is an error the caller hears about —
 * a settings form must never report success for a value that was dropped.
 *
 * @param {unknown} raw
 * @returns {Partial<TankSettings>}
 */
export function validateTankStrict(raw) {
  if (typeof raw !== 'object' || raw === null) throw new Error('tank must be an object');
  const out = {};
  if (raw.enabled !== undefined) {
    const v = parseBool(raw.enabled);
    if (v === null) throw new Error(`tank.enabled must be true or false — got ${raw.enabled}`);
    out.enabled = v;
  }
  if (raw.leadMinutes !== undefined) {
    const v = parseIntIn(raw.leadMinutes, TANK_LEAD_RANGE.min, TANK_LEAD_RANGE.max);
    if (v === null) {
      throw new Error(`tank.leadMinutes must be a whole number ${TANK_LEAD_RANGE.min}–${TANK_LEAD_RANGE.max} — got ${raw.leadMinutes}`);
    }
    out.leadMinutes = v;
  }
  if (raw.fps !== undefined) {
    const v = parseIntIn(raw.fps, 1, TANK_FPS_MAX);
    if (v === null || !TANK_FPS_OPTIONS.includes(v)) {
      throw new Error(`tank.fps must be one of ${TANK_FPS_OPTIONS.join(', ')} — got ${raw.fps}`);
    }
    out.fps = v;
  }
  if (!Object.keys(out).length) throw new Error('tank: nothing to save');
  return out;
}

/**
 * Saved values over defaults, field by field.
 *
 * @param {null|{tank?: Partial<TankSettings>}} saved
 * @returns {TankSettings}
 */
export function resolveTank(saved) {
  return { ...TANK_DEFAULTS, ...(saved?.tank ?? {}) };
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
   * Each setting is validated on its own (Sprint 9 added `tank` beside
   * `rotate`): a bad value in one must not throw away a good value in the
   * other. `tank` is present only when something was saved for it, so a file
   * written before Sprint 9 loads exactly as it always did.
   *
   * @returns {Promise<null|{rotate: 0|180|null, tank?: Partial<TankSettings>}>}
   */
  async load() {
    const display = await this.#readRaw();
    if (!display) return null;

    let rotate = null;
    if (display.rotate !== undefined) {
      rotate = parseRotation(display.rotate);
      if (rotate === null) {
        console.warn(`[display] ignoring saved rotate=${display.rotate} — not 0 or 180`);
      }
    }
    const tank = display.tank !== undefined ? parseTank(display.tank) : null;
    const hasTank = tank !== null && Object.keys(tank).length > 0;

    if (rotate === null && !hasTank) return null;
    return hasTank ? { rotate, tank } : { rotate };
  }

  /** The raw `display` object on disk, or null. Never throws. */
  async #readRaw() {
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
    return parsed.display;
  }

  /**
   * Save a PARTIAL update — `{rotate}`, `{tank: {...}}`, or both — merged
   * over whatever is already saved, so the orientation control and the fish
   * tank controls can each save without clobbering the other.
   *
   * @param {{rotate?: number|string, tank?: object}} patch
   * @throws if a supplied value is not one the daemon can actually use — the
   *   validation lives here, not only in the HTTP handler, so nothing can
   *   persist a value the daemon would then have to ignore at boot.
   */
  async save(patch) {
    const hasRotate = patch?.rotate !== undefined;
    const hasTank = patch?.tank !== undefined;
    if (!hasRotate && !hasTank) {
      throw new Error(`rotate must be one of ${ROTATIONS.join(', ')} — got ${patch?.rotate}`);
    }

    const next = {};
    const current = await this.load();
    if (current?.rotate !== null && current?.rotate !== undefined) next.rotate = current.rotate;
    if (current?.tank) next.tank = { ...current.tank };

    if (hasRotate) {
      const rotate = parseRotation(patch.rotate);
      if (rotate === null) {
        throw new Error(`rotate must be one of ${ROTATIONS.join(', ')} — got ${patch.rotate}`);
      }
      next.rotate = rotate;
    }
    if (hasTank) {
      next.tank = { ...next.tank, ...validateTankStrict(patch.tank) };
    }

    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify({
      version: DISPLAY_VERSION,
      display: next,
    }, null, 2), { mode: 0o600 });
    // Rename over the old file, so a crash mid-write cannot leave a truncated
    // settings file the next boot would have to distrust.
    await fs.rename(tmp, this.filePath);
    return next;
  }
}
