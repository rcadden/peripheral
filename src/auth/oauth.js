/* oauth.js — Google OAuth for a desktop app, loopback + PKCE.
 *
 * Flow (Google's "Desktop app" client type):
 *   1. Start a one-shot HTTP server on 127.0.0.1 on an ephemeral port.
 *   2. Open the consent URL with code_challenge (PKCE S256) and state.
 *   3. Google redirects back to the loopback with ?code=...
 *   4. Exchange code + code_verifier for tokens. Persist the refresh token.
 *   5. Thereafter, refresh on demand. The consent screen is never seen again
 *      unless the token is revoked.
 *
 * A desktop client's client_secret is NOT secret — it ships in the app and
 * Google documents it as non-confidential. PKCE is what actually binds the
 * exchange to this process, which is why it is not optional here.
 *
 * READ-ONLY FOREVER. requestedScopes() enforces an allowlist so no future edit
 * can quietly widen this into write access. See project_goals.md principle 2.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { TokenStore } from './tokens.js';

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';

/** The only scopes this project may ever request. */
const SCOPE_ALLOWLIST = Object.freeze([
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'openid',
  'email',
]);

/** Refresh this long before actual expiry, so a slow render never races it. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * @param {string[]} scopes
 * @returns {string[]}
 */
export function requestedScopes(scopes = ['https://www.googleapis.com/auth/calendar.readonly', 'openid', 'email']) {
  const bad = scopes.filter((s) => !SCOPE_ALLOWLIST.includes(s));
  if (bad.length) {
    throw new Error(
      `refusing non-read-only scope(s): ${bad.join(', ')}. ` +
      `Peripheral is read-only by design (project_goals.md principle 2). ` +
      `If you genuinely need a new scope, add it to SCOPE_ALLOWLIST deliberately.`,
    );
  }
  return scopes;
}

const b64url = (buf) => buf.toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function pkcePair() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

/**
 * How to hand a URL to the user's browser, per platform.
 *
 * ── DO NOT ROUTE A URL THROUGH `cmd /c start` UNQUOTED ────────────────────
 * That is what this used to do, and cmd treats `&` as a COMMAND SEPARATOR.
 * An OAuth authorization URL is almost entirely `&`-delimited parameters, so
 * the browser received exactly `...?client_id=XXX` and nothing else. Google
 * answered, accurately, `Error 400: invalid_request — Required parameter is
 * missing: response_type`.
 *
 * It cost a debugging session because of how it failed: the URL printed to
 * the terminal was perfectly correct, and pasting it by hand worked. Only the
 * auto-opened browser was broken, so the bug looked like a Google-side policy
 * problem — an earlier attempt even produced "This app is blocked", which was
 * misread as a Workspace restriction. Measured 2026-08-17 against a local
 * server: the current form dropped every parameter after the first.
 *
 * `rundll32 url.dll,FileProtocolHandler` invokes no shell at all, so there is
 * nothing to reparse `&`, `%`, `^` or `|`. Verified to deliver the URL intact.
 * The quoted `start` form also survives, and is kept only as a fallback.
 *
 * Exported so a test can assert we never regress to the unquoted form.
 *
 * @param {string} url
 * @returns {{cmd: string, args: string[], opts: object}[]} in preference order
 */
export function browserOpenCommands(url, platform = process.platform) {
  if (platform === 'win32') {
    return [
      { cmd: 'rundll32', args: ['url.dll,FileProtocolHandler', url], opts: {} },
      // cmd's `start` takes the first quoted arg as a window title, hence "".
      // The URL MUST carry its own quotes, and windowsVerbatimArguments stops
      // Node from re-escaping them into something cmd no longer understands.
      { cmd: 'cmd', args: ['/c', 'start', '""', `"${url}"`], opts: { windowsVerbatimArguments: true } },
    ];
  }
  if (platform === 'darwin') return [{ cmd: 'open', args: [url], opts: {} }];
  return [{ cmd: 'xdg-open', args: [url], opts: {} }];
}

/** Best-effort browser open. Always returns; the URL is printed regardless. */
function openBrowser(url) {
  for (const { cmd, args, opts } of browserOpenCommands(url)) {
    try {
      spawn(cmd, args, { detached: true, stdio: 'ignore', ...opts }).unref();
      return;
    } catch { /* try the next one */ }
  }
  // Not fatal: loginInteractive() prints the URL immediately above this call.
}

function htmlPage(title, body) {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
    `<style>body{background:#0d0d0f;color:#e8e8ea;font:16px ui-monospace,monospace;` +
    `display:grid;place-items:center;height:100vh;margin:0;text-align:center}` +
    `p{max-width:40ch;line-height:1.6}</style><body><div><h1>${title}</h1>${body}</div>`;
}

/**
 * Run the interactive consent flow once and persist the result.
 *
 * @param {object} opts
 * @param {string} opts.account        store key, e.g. 'work'
 * @param {string} opts.clientId
 * @param {string} opts.clientSecret
 * @param {string[]=} opts.scopes
 * @param {TokenStore=} opts.store
 * @param {number=} opts.timeoutMs
 * @returns {Promise<import('./tokens.js').StoredToken>}
 */
export async function loginInteractive({
  account,
  clientId,
  clientSecret,
  scopes,
  store = new TokenStore(),
  timeoutMs = 5 * 60 * 1000,
}) {
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set — see .env.example');
  }
  const scopeList = requestedScopes(scopes);
  const { verifier, challenge } = pkcePair();
  const state = b64url(crypto.randomBytes(16));

  const { code, redirectUri } = await new Promise((resolve, reject) => {
    /**
     * Captured at listen time, NOT read from server.address() inside the
     * handler. address() returns null once the server is closing, and a browser
     * routinely sends a second request (favicon, or a reload) down the same
     * keep-alive socket after we have responded — which would throw in the
     * handler and take down `npm run auth` *after* consent already succeeded.
     */
    let port = null;
    /** Once the flow has settled, later requests are noise. Never re-settle. */
    let settled = false;

    const timer = setTimeout(() => {
      shutdown();
      reject(new Error(`consent timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    const shutdown = () => {
      clearTimeout(timer);
      // Drop keep-alive sockets too, or the process lingers until they idle out.
      server.closeAllConnections?.();
      server.close();
    };

    const server = http.createServer((req, res) => {
      // Connection: close keeps the browser from holding a socket open against
      // a server we are about to shut down.
      res.setHeader('connection', 'close');

      const url = new URL(req.url, `http://127.0.0.1:${port ?? 0}`);
      if (url.pathname !== '/callback' || settled) {
        // Covers /favicon.ico and any repeat delivery of the callback.
        res.writeHead(settled ? 204 : 404).end();
        return;
      }
      const err = url.searchParams.get('error');
      const gotCode = url.searchParams.get('code');
      const gotState = url.searchParams.get('state');

      const finish = (status, title, body, outcome) => {
        settled = true;
        res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
        res.end(htmlPage(title, body));
        shutdown();
        outcome();
      };

      if (err) {
        const desc = url.searchParams.get('error_description') ?? '';
        // The failure mode we are specifically testing for on Balcom.
        const hint = /admin|policy|blocked|disallow/i.test(`${err} ${desc}`)
          ? '<p>This looks like a Workspace admin restriction on third-party '
            + 'app access. That is the assumption the calendar plan rested on. '
            + 'Fall back to the ICS route.</p>'
          : '';
        return finish(400, 'Consent failed', `<p>${err}<br>${desc}</p>${hint}`,
          () => reject(new Error(`consent denied: ${err}${desc ? ` — ${desc}` : ''}`)));
      }
      if (gotState !== state) {
        return finish(400, 'State mismatch',
          '<p>Discarded a callback whose state did not match. Re-run to retry.</p>',
          () => reject(new Error('state mismatch — possible CSRF, aborted')));
      }
      if (!gotCode) {
        return finish(400, 'No code', '<p>Callback carried no authorization code.</p>',
          () => reject(new Error('callback carried no code')));
      }
      return finish(200, 'Peripheral is authorised',
        '<p>Token stored. You can close this tab and return to the terminal.</p>',
        () => resolve({
          code: gotCode,
          // Must byte-match the redirect_uri sent to the auth endpoint, or the
          // token exchange fails with redirect_uri_mismatch.
          redirectUri: `http://127.0.0.1:${port}/callback`,
        }));
    });

    server.on('error', (e) => { clearTimeout(timer); reject(e); });

    // Port 0 = let the OS pick. Google allows any loopback port for desktop
    // clients, so there is nothing to pre-register.
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      const redirect = `http://127.0.0.1:${port}/callback`;
      const authUrl = `${AUTH_ENDPOINT}?${new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirect,
        response_type: 'code',
        scope: scopeList.join(' '),
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        access_type: 'offline',   // required for a refresh_token
        prompt: 'consent',        // force it, so a re-auth reliably returns one
      })}`;

      console.log(`\n[auth] authorising account "${account}"`);
      console.log(`[auth] listening on ${redirect}`);
      console.log(`[auth] sign in as the ${account.toUpperCase()} account.`);
      // Printed BEFORE the browser opens, and worded to cover the failure that
      // actually happened: the auto-open path once mangled the URL while this
      // text stayed correct, so "no browser opened" was the wrong symptom to
      // wait for. If Google shows an error, suspect the launcher first.
      console.log(`\nIf no browser opens — or the page shows an authorization`
        + ` error — paste this URL yourself:\n\n${authUrl}\n`);
      openBrowser(authUrl);
    });
  });

  const tokens = await postToken({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  const email = await fetchEmail(tokens.access_token).catch(() => undefined);

  return store.set(account, {
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    expires_at: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    scope: tokens.scope,
    token_type: tokens.token_type,
    account_email: email,
    obtained_at: new Date().toISOString(),
  });
}

/** POST to the token endpoint and surface Google's error text usefully. */
async function postToken(params) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) {
    const e = new Error(
      `token endpoint ${res.status}: ${body.error ?? 'unknown'}` +
      `${body.error_description ? ` — ${body.error_description}` : ''}`,
    );
    e.googleError = body.error;
    throw e;
  }
  return body;
}

async function fetchEmail(accessToken) {
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`userinfo ${res.status}`);
  return (await res.json()).email;
}

/**
 * Holds one account's credentials and hands out valid access tokens.
 * Refreshes transparently; the caller never thinks about expiry.
 */
export class OAuthClient {
  /**
   * @param {object} opts
   * @param {string} opts.account
   * @param {string=} opts.clientId
   * @param {string=} opts.clientSecret
   * @param {TokenStore=} opts.store
   */
  constructor({
    account,
    clientId = process.env.GOOGLE_CLIENT_ID,
    clientSecret = process.env.GOOGLE_CLIENT_SECRET,
    store = new TokenStore(),
  }) {
    this.account = account;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.store = store;
    /** @type {Promise<string>|null} in-flight refresh, so N callers cause 1 call */
    this._refreshing = null;
  }

  /**
   * A valid access token, refreshed if it is missing or near expiry.
   * @returns {Promise<string>}
   */
  async getAccessToken() {
    const tok = await this.store.get(this.account);
    if (!tok) {
      throw new Error(
        `no token for account "${this.account}" — run \`npm run auth\` first`,
      );
    }
    const fresh = tok.access_token
      && tok.expires_at
      && tok.expires_at - Date.now() > REFRESH_MARGIN_MS;
    if (fresh) return tok.access_token;

    // Collapse concurrent refreshes. The daemon can have a render and a fetch
    // both wanting a token in the same tick.
    this._refreshing ??= this._refresh(tok.refresh_token)
      .finally(() => { this._refreshing = null; });
    return this._refreshing;
  }

  /** @returns {Promise<string>} */
  async _refresh(refreshToken) {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — cannot refresh');
    }
    let tokens;
    try {
      tokens = await postToken({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      });
    } catch (err) {
      if (err.googleError === 'invalid_grant') {
        // Revoked, expired, or the Workspace admin pulled app access. This is
        // the single-token risk landing. Do NOT delete the stored token
        // automatically — the daemon should keep serving last-good state and
        // say so, rather than silently losing the only credential it has.
        throw new Error(
          `refresh rejected (invalid_grant) for "${this.account}". The token is ` +
          `no longer valid — revoked, password changed, or Workspace app access ` +
          `withdrawn. Re-run \`npm run auth\`. Serving last-good state until then.`,
          { cause: err },
        );
      }
      throw err;
    }
    await this.store.set(this.account, {
      access_token: tokens.access_token,
      expires_at: Date.now() + (tokens.expires_in ?? 3600) * 1000,
      scope: tokens.scope ?? undefined,
      token_type: tokens.token_type,
    });
    return tokens.access_token;
  }

  /**
   * Authenticated JSON GET against a Google API. Retries once on a 401, since
   * a token can be revoked mid-flight.
   *
   * @param {string} url
   * @returns {Promise<any>}
   */
  async apiGet(url) {
    const attempt = async (token) => fetch(url, {
      headers: { authorization: `Bearer ${token}` },
    });

    let res = await attempt(await this.getAccessToken());
    if (res.status === 401) {
      const tok = await this.store.get(this.account);
      res = await attempt(await this._refresh(tok.refresh_token));
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GET ${url} -> ${res.status}: ${body.slice(0, 400)}`);
    }
    return res.json();
  }

  /**
   * Every calendar this account can see, including ones shared in. This is how
   * the calendarId -> label map in gcal.js gets its real ids: a shared-in
   * calendar's id is usually the sharer's address, but imported and secondary
   * calendars use opaque ids and must not be guessed.
   *
   * `accessRole` matters — 'freeBusyReader' means titles will be absent.
   */
  async listCalendars() {
    const out = [];
    let pageToken;
    do {
      const url = new URL('https://www.googleapis.com/calendar/v3/users/me/calendarList');
      url.searchParams.set('maxResults', '250');
      url.searchParams.set('minAccessRole', 'freeBusyReader');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const page = await this.apiGet(url.toString());
      out.push(...(page.items ?? []).map((c) => ({
        id: c.id,
        summary: c.summary,
        primary: Boolean(c.primary),
        accessRole: c.accessRole,
        timeZone: c.timeZone,
        selected: Boolean(c.selected),
      })));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return out;
  }
}
