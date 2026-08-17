/* tokens.js — on-disk OAuth token store.
 *
 * WHERE THIS LIVES, AND WHY IT IS NOT IN THE REPO
 * ───────────────────────────────────────────────────────────────────────────
 * This repo sits inside OneDrive. Anything written here is uploaded to
 * Microsoft. A Balcom calendar refresh token is exactly the kind of thing
 * project_goals.md principle 4 says must not exist anywhere it doesn't need to,
 * so the default store is OUTSIDE the repo and outside sync scope:
 *
 *   Windows:  %LOCALAPPDATA%\Peripheral\tokens.json
 *   Other:    $XDG_CONFIG_HOME/peripheral/tokens.json  (or ~/.config/...)
 *
 * Override with PERIPHERAL_TOKEN_PATH. `.gitignore` still lists tokens/ and
 * *.token.json as a second line of defence — but note that .gitignore stops
 * git, not OneDrive. Do not "simplify" this back into the project directory.
 *
 * The file holds a long-lived REFRESH token. Treat it as a password.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const STORE_VERSION = 1;

/** Resolve the token file path. Honours PERIPHERAL_TOKEN_PATH. */
export function defaultTokenPath() {
  if (process.env.PERIPHERAL_TOKEN_PATH) {
    return path.resolve(process.env.PERIPHERAL_TOKEN_PATH);
  }
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA
      ?? path.join(os.homedir(), 'AppData', 'Local');
    return path.join(base, 'Peripheral', 'tokens.json');
  }
  const base = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
  return path.join(base, 'peripheral', 'tokens.json');
}

/**
 * @typedef {object} StoredToken
 * @property {string}  refresh_token   long-lived; the thing that actually matters
 * @property {string=} access_token    short-lived, ~1h
 * @property {number=} expires_at      epoch ms for access_token
 * @property {string=} scope           space-separated, as granted
 * @property {string=} token_type
 * @property {string=} account_email   whoever actually consented
 * @property {string}  obtained_at     ISO, for debugging "why did this stop working"
 */

export class TokenStore {
  /** @param {string=} filePath */
  constructor(filePath = defaultTokenPath()) {
    this.filePath = filePath;
    /** @type {{version:number, accounts:Record<string,StoredToken>}|null} */
    this._cache = null;
  }

  /** Read the store. A missing file is normal on first run, not an error. */
  async load() {
    if (this._cache) return this._cache;
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed.version !== STORE_VERSION) {
        throw new Error(
          `token store version ${parsed.version} != expected ${STORE_VERSION} ` +
          `(${this.filePath}) — delete it and re-run \`npm run auth\``,
        );
      }
      this._cache = parsed;
    } catch (err) {
      if (err.code === 'ENOENT') {
        this._cache = { version: STORE_VERSION, accounts: {} };
      } else if (err instanceof SyntaxError) {
        throw new Error(
          `token store is corrupt (${this.filePath}): ${err.message} — ` +
          `delete it and re-run \`npm run auth\``,
        );
      } else {
        throw err;
      }
    }
    return this._cache;
  }

  /** @returns {Promise<StoredToken|undefined>} */
  async get(account) {
    const store = await this.load();
    return store.accounts[account];
  }

  /** @returns {Promise<string[]>} */
  async accounts() {
    const store = await this.load();
    return Object.keys(store.accounts);
  }

  /**
   * Merge a token in and persist. Never drops an existing refresh_token: Google
   * omits it on refresh responses, and clobbering it with undefined would force
   * a full re-consent on the next run.
   *
   * @param {string} account
   * @param {Partial<StoredToken>} token
   */
  async set(account, token) {
    const store = await this.load();
    const existing = store.accounts[account] ?? {};
    const merged = {
      ...existing,
      ...token,
      refresh_token: token.refresh_token ?? existing.refresh_token,
      obtained_at: token.obtained_at ?? existing.obtained_at ?? new Date().toISOString(),
    };
    if (!merged.refresh_token) {
      throw new Error(
        `refusing to store a token for "${account}" with no refresh_token — ` +
        `the flow must request access_type=offline`,
      );
    }
    store.accounts[account] = merged;
    await this._persist(store);
    return merged;
  }

  /** Remove one account's token. Used when a refresh returns invalid_grant. */
  async remove(account) {
    const store = await this.load();
    if (!(account in store.accounts)) return false;
    delete store.accounts[account];
    await this._persist(store);
    return true;
  }

  /** Atomic write: temp file then rename, so a crash can't truncate the store. */
  async _persist(store) {
    const dir = path.dirname(this.filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(store, null, 2), { mode: 0o600 });
    await fs.rename(tmp, this.filePath);
    // Best-effort on Windows, where mode bits are largely advisory. The real
    // protection there is that %LOCALAPPDATA% is already per-user.
    try {
      await fs.chmod(this.filePath, 0o600);
    } catch { /* non-fatal */ }
    this._cache = store;
  }

  /** Safe-to-log summary. Never returns token material. */
  async describe() {
    const store = await this.load();
    return Object.entries(store.accounts).map(([account, t]) => ({
      account,
      email: t.account_email ?? '(unknown)',
      scope: t.scope ?? '(unrecorded)',
      obtained_at: t.obtained_at,
      access_token_expires_in:
        t.expires_at ? `${Math.round((t.expires_at - Date.now()) / 1000)}s` : '(none cached)',
      has_refresh_token: Boolean(t.refresh_token),
    }));
  }
}
