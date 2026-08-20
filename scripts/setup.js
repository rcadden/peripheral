/* setup.js — one command for everything that CAN be automated.
 *
 * "One-command setup" is Sprint 5's own wording, and it's honest to say up
 * front what this can't do: creating a Google OAuth client is a manual
 * console.cloud.google.com flow with no API to script it. Nothing here
 * pretends otherwise. What this DOES do:
 *
 *   1. Create .env from .env.example, if it doesn't exist yet.
 *   2. Regenerate web/tokens.css from the current wallpaper, if `sharp` is
 *      installed (optionalDependency — fine if it's not; the committed
 *      defaults still work).
 *   3. Probe for the panel over HID, if `node-hid` is installed. Fine if
 *      the panel isn't plugged in yet — this is informational, not a gate.
 *   4. Print the ordered remaining steps, with the one unavoidable manual
 *      one (OAuth) called out first so it isn't a surprise at the end.
 *
 * Nothing here is fatal. A step that can't run yet (no sharp, no panel, no
 * .env filled in) prints why and moves on — the point is to get a stranger
 * as close to "the panel shows my day" as automation allows, not to block
 * on the one part that can't be automated.
 *
 *   npm run setup
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

/* Runs a script with THIS process's own node binary, not through `npm run`.
 * Two problems that avoids: `npm` is a .cmd shim on Windows, and spawning a
 * .cmd directly (no shell) throws EINVAL on this Node/Windows combination —
 * confirmed by testing, not assumed — while `shell: true` works but Node
 * deprecates it (DEP0190) as a blanket caution about unescaped args. Neither
 * problem exists when the child is `node <fixed-path>` directly: node.exe is
 * a real executable, and process.execPath is always its exact path. */
function runScript(relativePath) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [path.join(REPO, relativePath)], { cwd: REPO, stdio: 'inherit' });
    p.on('close', (code) => resolve(code));
    p.on('error', () => resolve(1));
  });
}

async function step(title, fn) {
  console.log(`\n── ${title} ──`);
  await fn();
}

async function main() {
  await step('.env', async () => {
    const envPath = path.join(REPO, '.env');
    const examplePath = path.join(REPO, '.env.example');
    try {
      await fs.access(envPath);
      console.log('.env already exists — leaving it alone.');
    } catch {
      await fs.copyFile(examplePath, envPath);
      console.log('created .env from .env.example.');
      console.log('Nothing in it works yet — see the OAuth step below.');
    }
  });

  await step('palette (web/tokens.css from your current wallpaper)', async () => {
    const code = await runScript('src/palette.js');
    if (code !== 0) {
      console.log('Skipped or failed (likely `sharp` isn\'t installed — run `npm i` first).');
      console.log('Not fatal: the committed web/tokens.css already works.');
    }
  });

  await step('panel probe (is the hardware there?)', async () => {
    const code = await runScript('src/transport/probe.js');
    if (code !== 0) {
      console.log('Not found yet, or `node-hid` isn\'t installed — not fatal.');
      console.log('Run `npm run probe` again once the panel is plugged in.');
    }
  });

  console.log(`
── what's left, in order ──────────────────────────────────────────────────

1. Google OAuth client (the one step nothing here can automate):
     a. console.cloud.google.com → new project → Google Calendar API →
        enable it
     b. Credentials → Create client → type "Desktop app"
     c. Paste the client id/secret into .env (GOOGLE_CLIENT_ID /
        GOOGLE_CLIENT_SECRET)

2. npm run auth
     Signs you in and prints every calendar you can see, with its real id —
     paste the ones you want into .env's PERIPHERAL_CALENDARS_WORK.

3. npm run startup:install
     Registers the daemon to start at logon. Verify BY EYE afterward — a
     registered task proves the process started, never that the panel lit
     up. Look at the glass.

4. (optional) http://127.0.0.1:4780/settings/palette/ — the colour picker,
   once the daemon is running, if the wallpaper-derived defaults aren't to
   your taste.
`);
}

main();
