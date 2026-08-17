# Session handoff — 2026-08-17 (third session)

Supersedes `session-handoff-2026-08-17b.md`. That file is kept for the record;
**this one is current.**

Derived from `CHANGELOG.md`, per the session-end ritual in `CLAUDE.md`. If the
two disagree, the changelog wins.

## Where the project lives

| | |
|---|---|
| **Working copy** | **`C:\dev\peripheral`** |
| Remote | `github.com/rcadden/peripheral`, **private** until Sprint 3 |
| Token store | `%LOCALAPPDATA%\Peripheral\tokens.json` (still empty) |
| State cache | `%LOCALAPPDATA%\Peripheral\last-state.json` (**new**) |
| Daemon log | `%LOCALAPPDATA%\Peripheral\daemon.log` (**new**, rotated at 5MB) |
| Playwright browsers | `C:\dev\ms-playwright` |
| **`.env`** | **Now exists** (gitignored). Only the two Google values are blank. |

## What works right now

The whole loop is closed **and it now starts itself at logon**.

```bash
npm run startup:status
```

| Command | What it does |
|---|---|
| `npm start` | Full daemon — server, renderer, transport |
| `npm test` | 30 tests — calendar normaliser + state cache. **New.** |
| `npm run startup:install` | Register the run-at-logon task. No admin. **New.** |
| `npm run startup:status` | Task state **and** whether the process is actually up |
| `npm run startup:logs` | Tail the daemon log |
| `npm run startup:uninstall` | Remove the task |
| `npm run serve` | Server only; open the pane in a browser |
| `npm run send -- docs/first-light.jpg` | Push one JPEG. Transport smoke test |
| `npm run idle-test` | Re-measure the panel's ~3s idle timeout |
| `npm run auth` | OAuth consent. **Still needs a client ID that does not exist** |
| `npm run palette` | Regenerate `web/tokens.css` from the wallpaper |
| `npm run probe` | Enumerate the HID device |

**The logon task is installed and was left running.** It was verified end to
end: hidden window, UTF-8 log, 30 pushes / 0 failures.

## The next action, and it still needs Ricky

**Create the Google OAuth client.** This has not moved since the last handoff,
and it is now the *only* thing standing between the build and a real agenda —
everything downstream of it is written.

1. Google Cloud console signed in as **`grcadden@gmail.com`** (a personal
   project — deliberately *not* the Balcom org).
2. Enable the Google Calendar API.
3. Credentials → OAuth client → type **Desktop app**.
4. Consent screen → add **`ricky.cadden@balcomagency.com`** as a test user.
5. Put the id/secret in **`.env`** (it exists now; the two lines are blank and
   labelled), then `npm run auth` and sign in **as the Balcom account**.

Step 5 is the experiment, and it is now a bigger one than it was: it tests
**Workspace policy and the whole fetch path at once.** Success prints every
visible calendar with its real id and `accessRole`, and emits a paste-ready
`calendars` map.

**This is still the project's one untested assumption.** If consent is refused
with an admin message, the only route left is ICS, which refreshes every 8–24h
and downgrades the countdown from a number to a rough indicator.

## Then, in order

1. **Look at the panel.** The all-day row, the `ALL DAY` label and the pinned
   layout are new visual output that has never been seen on real glass. Also
   confirm the daemon that is running now still looks right after an hour.
2. **Spot-check one real Google payload against `test/gcal.test.js`.** The
   fixtures are built from the documented resource shape, not captured from a
   live account — they prove the transform, not the field names.
3. **Chase the push-rate degradation under load** (see below). This is the one
   thing that could make the panel flicker in normal use.
4. Sprint 3 packaging — still deferred deliberately.

## What changed this session

- `ApiProvider.fetchToday()` is implemented — real `events.list`, local-midnight
  window, pagination, recurrence expansion, cancelled and declined dropped.
- Wired into the daemon via `buildProviders()` from `.env`.
- Last-good state now persists to disk and is restored, flagged stale, **before**
  the first fetch.
- `npm test` exists — 30 tests, zero dependencies.
- Run-at-logon task, hidden, logged, no admin.
- **Three bugs found and fixed, two of them only findable by running it.** See
  the changelog. The important one: the daemon could log `fatal`, keep running,
  push nothing, and report success to the scheduler.
- All-day events no longer hijack the hero slot.

## Facts established the hard way — do not re-derive

Everything in the previous handoff still holds (panel is `0416:5302`, 512-byte
reports, hidapi's report-ID byte, the ~3s forget window, route 2 is dead,
"accepted" ≠ "displayed"). Added this session:

- **`process.exitCode = 1` does not stop this daemon.** The HTTP server and the
  intervals keep Node alive. A fatal path must call `process.exit()` or it
  produces a zombie that every health signal reports as fine.
- **A scheduled task inherits no shell environment.** `PLAYWRIGHT_BROWSERS_PATH`
  had only ever been exported by hand, so the first logon run could not find
  Chromium. **Anything the daemon needs belongs in `.env`.**
- **`node --test` with no arguments discovers `*-test.js` too**, which includes
  `src/transport/idle-test.js` — it ran and drove the panel for 68 seconds.
  The test script uses a scoped glob for this reason.
- **PowerShell variables are case-insensitive**, so a local `$action` collides
  with an `[ValidateSet]` `$Action` parameter and fails on assignment.
- **`powershell.exe` reads BOM-less `.ps1` as ANSI.** Keep `scripts/*.ps1`
  ASCII-only; an em-dash in a comment is a parse error three lines later.
- **All-day events span local midnight to local midnight**, so any
  "is it happening now" test says yes all day. They must never be focus
  candidates.

## Open questions for Ricky

1. **Does Balcom permit third-party OAuth apps?** Unblocks everything. Unchanged.
2. **Does the panel look right** — including the new all-day row — on a
   sustained run? Verified by metrics and by a rendered JPEG this session,
   **never by eye.**
3. **Does the panel flicker when the PC is busy?** Undisturbed the daemon holds
   28–30 pushes per 30s. Under this session's own concurrent test processes the
   same heartbeats read 19, 25 and 15, with `frameAge` touching 3s — inside the
   panel's forget window. Suspect the render and push timers competing on one
   event loop, which is the exact coupling the two-loop design was meant to
   remove. Worth a look before Sprint 3, and it needs a real answer rather than
   a guess.
4. **Leave the logon task installed?** It is registered and running now.
   `npm run startup:uninstall` removes it cleanly.
