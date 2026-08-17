/* oauth.test.js — guards on the auth flow's non-network parts.
 *
 * The browser-launch tests exist because of a real bug (2026-08-17): the
 * launcher piped the authorization URL through `cmd /c start` unquoted, cmd
 * treated every `&` as a command separator, and the browser received only
 * `...?client_id=XXX`. Google replied `invalid_request: Required parameter is
 * missing: response_type`, and because the URL PRINTED to the terminal was
 * correct — pasting it worked — the fault looked like a Google-side policy
 * problem for most of a session.
 *
 * A unit test cannot re-run cmd's parser, so these assert the shape instead:
 * never the known-bad form, and always something that carries the URL whole.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { browserOpenCommands, requestedScopes } from '../src/auth/oauth.js';

/** A realistic authorization URL: many params, so many `&`. */
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth?client_id=123.apps.googleusercontent.com'
  + '&redirect_uri=http%3A%2F%2F127.0.0.1%3A54321%2Fcallback&response_type=code'
  + '&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.readonly+openid+email'
  + '&code_challenge=abc-123_XYZ&code_challenge_method=S256&state=deadbeef'
  + '&access_type=offline&prompt=consent';

/* ── browser launch ──────────────────────────────────────────────────── */

test('every platform gets at least one way to open a browser', () => {
  for (const p of ['win32', 'darwin', 'linux']) {
    assert.ok(browserOpenCommands(AUTH_URL, p).length > 0, p);
  }
});

test('the URL is passed whole, never split on & or ?', () => {
  for (const p of ['win32', 'darwin', 'linux']) {
    for (const { args } of browserOpenCommands(AUTH_URL, p)) {
      const carrier = args.find((a) => a.includes('accounts.google.com'));
      assert.ok(carrier, `${p}: no argument carries the URL`);
      // The whole URL in ONE argument. Splitting it across two would arrive
      // at the browser as a truncated URL plus junk.
      assert.ok(carrier.includes('response_type=code'), `${p}: lost response_type`);
      assert.ok(carrier.includes('state=deadbeef'), `${p}: lost the trailing params`);
    }
  }
});

test('a Windows cmd/start invocation always quotes the URL', () => {
  // THE REGRESSION GUARD. `cmd /c start "" <bare-url>` is the exact form that
  // broke, because cmd reparses `&` as a command separator.
  for (const { cmd, args, opts } of browserOpenCommands(AUTH_URL, 'win32')) {
    if (cmd !== 'cmd') continue;
    const carrier = args.find((a) => a.includes('accounts.google.com'));
    assert.ok(carrier.startsWith('"') && carrier.endsWith('"'),
      'a URL handed to cmd must be quoted, or & ends the command');
    assert.equal(opts.windowsVerbatimArguments, true,
      'without verbatim args Node re-escapes the quotes and cmd loses them');
  }
});

test('Windows prefers a shell-free launcher', () => {
  // rundll32 is spawned directly, so no shell exists to reinterpret &, %, ^
  // or | in the URL. Preferring it means the quoting above is a fallback
  // rather than the only thing standing between us and the bug.
  const [first] = browserOpenCommands(AUTH_URL, 'win32');
  assert.notEqual(first.cmd, 'cmd', 'the first choice should not involve a shell');
});

/* ── scope allowlist ─────────────────────────────────────────────────── */

test('read-only scopes are accepted', () => {
  const scopes = ['https://www.googleapis.com/auth/calendar.readonly', 'openid', 'email'];
  assert.deepEqual(requestedScopes(scopes), scopes);
});

test('any writable calendar scope is refused', () => {
  // project_goals.md principle 2: read-only forever, enforced structurally so
  // that no later edit can quietly widen it.
  for (const bad of [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/drive',
  ]) {
    assert.throws(() => requestedScopes([bad]), /refusing non-read-only scope/, bad);
  }
});
