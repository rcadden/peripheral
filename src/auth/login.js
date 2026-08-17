/* login.js — `npm run auth`. One-time consent, then verification.
 *
 *   npm run auth              authorise the work account (the default)
 *   npm run auth -- personal  authorise a second account, if ever needed
 *   npm run auth -- --status   show what's in the token store, no secrets
 *   npm run auth -- --logout work
 *
 * After a successful consent this prints every calendar the account can see,
 * with its real id and accessRole, and emits a ready-to-paste `calendars` map
 * for ApiProvider. That listing IS the verification: it proves the token works,
 * proves Balcom permits third-party app access, and proves whether the shared-in
 * personal calendar arrives with full details or only free/busy.
 */

import { TokenStore } from './tokens.js';
import { loginInteractive, OAuthClient } from './oauth.js';

const argv = process.argv.slice(2);
const store = new TokenStore();

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const warn = (s) => `\x1b[33m${s}\x1b[0m`;
const good = (s) => `\x1b[32m${s}\x1b[0m`;

async function showStatus() {
  const rows = await store.describe();
  console.log(`\ntoken store: ${store.filePath}`);
  if (!rows.length) {
    console.log(dim('  (empty — run `npm run auth`)'));
    return;
  }
  for (const r of rows) {
    console.log(`\n  ${bold(r.account)}`);
    console.log(`    email        ${r.email}`);
    console.log(`    scope        ${r.scope}`);
    console.log(`    obtained     ${r.obtained_at}`);
    console.log(`    access token ${r.access_token_expires_in}`);
    console.log(`    refresh token ${r.has_refresh_token ? good('present') : warn('MISSING')}`);
  }
}

/** Print the calendar list and a paste-ready provider config. */
async function verify(account) {
  const client = new OAuthClient({ account, store });
  console.log(`\n[auth] fetching calendar list for "${account}"…`);
  const cals = await client.listCalendars();

  if (!cals.length) {
    console.log(warn('  no calendars returned — unexpected; check the granted scope'));
    return;
  }

  console.log(`\n${bold(`${cals.length} calendar(s) visible:`)}\n`);
  for (const c of cals) {
    const flags = [
      c.primary ? 'primary' : null,
      c.accessRole === 'freeBusyReader' ? warn('FREE/BUSY ONLY — no titles') : c.accessRole,
    ].filter(Boolean).join(', ');
    console.log(`  ${bold(c.summary ?? '(no name)')}`);
    console.log(`    id    ${c.id}`);
    console.log(`    ${dim(flags)}`);
  }

  const freeBusy = cals.filter((c) => c.accessRole === 'freeBusyReader');
  if (freeBusy.length) {
    console.log(warn(
      `\n  ${freeBusy.length} calendar(s) are free/busy only. Events from those ` +
      `\n  arrive WITHOUT titles. Re-share with "See all event details" if one of ` +
      `\n  them is a calendar you need to read.`,
    ));
  }

  console.log(`\n${bold('Paste into the provider config:')}\n`);
  console.log(`  new ApiProvider({`);
  console.log(`    account: '${account}',`);
  console.log(`    calendars: {`);
  for (const c of cals) {
    const guess = c.primary ? account
      : /holiday/i.test(c.id) ? 'holidays'
      : /gmail\.com$/.test(c.id) ? 'personal'
      : 'other';
    console.log(`      '${c.id}': '${guess}',${dim(`  // ${c.summary ?? ''}`)}`);
  }
  console.log(`    },`);
  console.log(`  })\n`);
  console.log(dim('  Labels are guesses from the id — correct them by hand.'));
  console.log(dim('  Only ids you actually want on the panel need to stay.\n'));
}

async function main() {
  if (argv.includes('--status')) return showStatus();

  const logoutIdx = argv.indexOf('--logout');
  if (logoutIdx !== -1) {
    const account = argv[logoutIdx + 1];
    if (!account) throw new Error('--logout needs an account name');
    const removed = await store.remove(account);
    console.log(removed
      ? `removed token for "${account}"`
      : `no token stored for "${account}"`);
    return;
  }

  const account = argv.find((a) => !a.startsWith('-')) ?? 'work';

  const existing = await store.get(account);
  if (existing && !argv.includes('--force')) {
    console.log(
      `\n"${account}" is already authorised (${existing.account_email ?? 'unknown email'}).` +
      `\nVerifying the stored token rather than re-consenting.` +
      `\nUse --force to run consent again.`,
    );
    await verify(account);
    return;
  }

  await loginInteractive({
    account,
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    store,
  });

  console.log(good(`\n[auth] "${account}" authorised. Token stored at:`));
  console.log(`       ${store.filePath}`);
  console.log(dim('       Outside the repo and outside OneDrive sync, deliberately.'));

  await verify(account);
}

main().catch((err) => {
  console.error(`\n\x1b[31m[auth] ${err.message}\x1b[0m`);
  if (err.cause) console.error(dim(`       cause: ${err.cause.message}`));
  process.exitCode = 1;
});
