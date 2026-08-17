# Session handoff — 2026-08-17 (second session)

Supersedes `session-handoff-2026-08-17.md`, which was written before the
hardware arrived. That file is kept for the record; **this one is current.**

## Where the project lives now

| | |
|---|---|
| **Working copy** | **`C:\dev\peripheral`** — NOT in OneDrive any more |
| Remote | `github.com/rcadden/peripheral`, **private** until Sprint 3 |
| Old location | `OneDrive\Agent_Workspace\peripheral\` holds only `MOVED.md` |
| Token store | `%LOCALAPPDATA%\Peripheral\tokens.json` (nothing there yet) |
| Playwright browsers | `C:\dev\ms-playwright` (~700MB, outside the project) |

Start any session with `cd C:\dev\peripheral`.

## What works right now

**The whole loop is closed.** `npm start` renders the agenda pane and pushes it
to the panel at 1 fps. Verified over a 30s run: 29 pushes, 0 failures.

```bash
npm start
```

| Command | What it does |
|---|---|
| `npm start` | Full daemon — server, renderer, transport |
| `npm run serve` | Server only; open the pane in a browser |
| `npm run send -- docs/first-light.jpg` | Push one JPEG. Transport smoke test |
| `npm run idle-test` | Re-measure the panel's ~3s idle timeout |
| `npm run auth` | OAuth consent. **Needs a client ID that does not exist yet** |
| `npm run palette` | Regenerate `web/tokens.css` from the wallpaper |
| `npm run probe` | Enumerate the HID device |

Playwright needs `PLAYWRIGHT_BROWSERS_PATH=C:\dev\ms-playwright`. It is in
`.env.example`; **there is no `.env` yet**, so either create one or export it.

## The next action, and it needs Ricky

**Create the Google OAuth client.** Everything else on the calendar half is
written and waiting. Roughly ten minutes:

1. Google Cloud console signed in as **`grcadden@gmail.com`** (a personal
   project — deliberately *not* the Balcom org).
2. Enable the Google Calendar API.
3. Credentials → OAuth client → type **Desktop app**.
4. Consent screen → add **`ricky.cadden@balcomagency.com`** as a test user.
5. Put the id/secret in `.env`, then `npm run auth` and sign in **as the Balcom
   account**.

Step 5 is the experiment. Success prints every visible calendar with its real
id and `accessRole`, and emits a paste-ready `calendars` map.

**This is the project's one untested assumption:** whether Balcom's Workspace
permits third-party OAuth app access. If consent is refused with an admin
message, the only route left is ICS, which refreshes every 8–24h and downgrades
the countdown from a number to a rough indicator.

## Then, in order

1. `ApiProvider.fetchToday()` in `src/sources/gcal.js` — `events.list` per mapped
   calendar, `singleEvents=true`, drop cancelled, treat declined as absent.
2. Wire it into `daemon.js` `refreshState()`, replacing the throwing stub.
3. Last-good-state cache to disk so a restart doesn't start blank.
4. Run on login via Task Scheduler.

## Facts established the hard way — do not re-derive

- **The panel is `0416:5302`, HID Type 2.** Handshake returns `PM=128 SUB=1`
  plus a serial. Frame channel is interface 0, ep `0x82` OUT INTERRUPT,
  **512-byte packets**. Interface 1 is a zero-endpoint WinUSB decoy.
- **Frames must ship as a sequence of 512-byte reports, never one blob.** A
  single big write succeeds, reports every byte transferred, and leaves the
  panel on its logo.
- **hidapi prepends a report-ID byte**, so a 512-byte chunk goes out as 513.
  Short-write checks use `>=`, never `==`.
- **The panel forgets after ~3s.** Stop pushing and it reverts to its vendor
  logo. The USB handle is irrelevant. This is why the push and render loops are
  separate, and why there is no "nothing changed, skip this frame" optimisation.
- **Work calendar: sharing work→personal is BLOCKED by Balcom.** But personal is
  already natively shared *into* work, so the plan is one token against the
  **work** account with Google merging server-side. Route 2 is dead; do not
  retry it.
- **A blocked share does not predict blocked OAuth** — separate Workspace admin
  controls.
- **"Accepted" is not "displayed."** Transport success proves bytes moved. Only
  eyes on the glass prove pixels changed.

## Open questions for Ricky

1. **Does Balcom permit third-party OAuth apps?** Unblocks everything.
2. **Does the daemon's live render look right on the panel?** It was verified by
   metrics (29/29 pushes) at the end of the session but not yet confirmed by eye
   on a sustained run.
3. Sprint 3 packaging — deferred deliberately. Startup-on-login is a Task
   Scheduler entry and needs no packaging.
