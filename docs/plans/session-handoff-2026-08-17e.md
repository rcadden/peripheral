# Session handoff — 2026-08-17 (fifth session)

Supersedes `session-handoff-2026-08-17d.md`, written earlier the same day before
the design pass and the session-close tooling. That file is kept for the record;
**this one is current.**

Derived from `CHANGELOG.md`, per the session-end ritual. If the two disagree,
the changelog wins.

> **Amendment, 2026-08-17 (same day, after this file was first written).**
> Appended rather than rewritten, per the no-tidying rule. Two changes:
> - **A second type pass landed.** `.mark` and `.clock` doubled (30px / 34px),
>   the eyebrows doubled to 30px and went bold, and the agenda list took another
>   +2px to 24px. `.bar`'s fixed 22px height was removed — it clipped. The
>   agenda time column was checked and deliberately left at 104px: `12:30 AM`
>   measures 76.9px at the new size.
> - **The personal Google Cloud project has been deleted.** Open question 6
>   below is closed; the in-org project is the only one.
>
> The type scale remains **provisionally** accepted — the second pass does not
> change that, and open question 2 still stands.

## State of the world

**Sprint 1 is complete and the panel is live on Ricky's desk**, showing his real
day: work and personal calendars merged server-side through one in-org OAuth
token, rendered at 1280×480, pushed over HID at 1 fps, started automatically at
logon.

The North Star — *stop opening Google Calendar to find out whether there's a
meeting soon* — is met. What remains is endurance and polish.

## Where the project lives

| | |
|---|---|
| **Working copy** | **`C:\dev\peripheral`** |
| Remote | `github.com/rcadden/peripheral` — **private** until Sprint 3 |
| Branches | `dev` and `main` both current. `/session-close` pushes both. |
| `.env` | **Exists**, gitignored, complete — including the in-org Google client |
| Token store | `%LOCALAPPDATA%\Peripheral\tokens.json` — `ricky.cadden@balcomagency.com` |
| State cache | `%LOCALAPPDATA%\Peripheral\last-state.json` |
| Daemon log | `%LOCALAPPDATA%\Peripheral\daemon.log`, rotated at 5MB |
| Playwright browsers | `C:\dev\ms-playwright` |

## What works right now

```bash
npm run startup:status
```

| Command | What it does |
|---|---|
| `npm start` | Full daemon — server, renderer, transport |
| `npm test` | 38 tests. Zero dependencies |
| `/session-close` | This checklist. Pushes `dev` **and** `main` |
| `npm run startup:status` | Task state **and** whether the process is actually up |
| `npm run startup:logs` | Tail the daemon log |
| `npm run auth -- --status` | What is in the token store, no secrets |
| `npm run palette` | Regenerate `web/tokens.css`. Accepts `PERIPHERAL_HERO_HUE` |
| `npm run serve` | Server only; open the pane in a browser |
| `npm run send -- docs/first-light.jpg` | Push one JPEG. Transport smoke test |
| `npm run idle-test` | Re-measure the panel's ~3s idle timeout |
| `npm run probe` | Enumerate the HID device |

## The next action

**Live with it.** There is no blocked work and nothing waiting on Ricky. The
most valuable thing that can happen now is a normal workday passing with the
panel running, because almost every remaining question needs time rather than
code.

## Then, in order

1. **Confirm the token refreshed overnight.** The refresh path has never run —
   the access token was under an hour old when the session ended. Internal apps
   have no 7-day expiry, but that is documentation, not observation. **If the
   panel still shows today's events tomorrow morning, that is the proof.** If
   it shows stale data with the badge lit, read `npm run startup:logs` for
   `invalid_grant`.
2. **Re-decide the blue and the type scale** after a few days. Both were
   accepted *provisionally* — see Open questions. This is a scheduled revisit,
   not a bug report.
3. **Watch for the two unrendered paths** — an all-day event reaching the pane,
   and the `travel` label appearing. Neither has ever been seen.
4. Sprint 2, when it starts: the agenda pane's second pass is specced in
   `directives/roadmap.md` — third middle pane, overlap precedence, colour
   coding by calendar and attendees.
5. Sprint 3 packaging, and the repo going public. The colour picker lives here.

## Facts established the hard way — do not re-derive

Carried forward and added to. Everything in the previous handoffs still holds.

- **The panel is `0416:5302`, HID Type 2.** Handshake returns `PM=128 SUB=1`.
  Frame channel is interface 0, ep `0x82` OUT INTERRUPT, **512-byte packets**.
  Interface 1 is a zero-endpoint WinUSB decoy.
- **Frames ship as a sequence of 512-byte reports, never one blob.** hidapi
  prepends a report-ID byte, so a 512-byte chunk goes out as 513; short-write
  checks use `>=`, never `==`.
- **The panel forgets after ~3s.** Stop pushing and it reverts to its vendor
  logo. The USB handle is irrelevant. There is no "nothing changed, skip this
  frame" optimisation — that is a blank panel with extra steps.
- **A personal-project OAuth client cannot consent against Balcom.** It is a
  *third-party app* to the Workspace and is blocked (`admin_policy_enforced`).
  A client owned by a project **inside `balcomagency.com`** is an *internal
  app* and is trusted by default. **Route 1a is the answer. Do not retry the
  personal project. Route 3 (ICS) is dead and needs no building.**
- **Sharing work → personal is blocked by Balcom** (route 2, dead). Personal →
  work is a native share and works, which is what makes work-as-primary viable.
- **`process.exitCode = 1` does not stop this daemon.** The HTTP server and the
  intervals keep Node alive. A fatal path must call `process.exit()`, or it
  produces a zombie that every health signal reports as fine.
- **A scheduled task inherits no shell environment.** Anything the daemon needs
  belongs in `.env`, never in a terminal that happened to export it.
- **`cmd` treats `&` as a command separator**, so `cmd /c start "" <url>`
  truncates any URL at its first parameter. This masqueraded as a Google policy
  block for most of a session. Verify what you actually sent before concluding
  a remote system rejected you.
- **`node --test` with no arguments discovers `*-test.js`**, which includes
  `src/transport/idle-test.js` — it will drive the real panel for 68 seconds.
  The test script uses a scoped glob.
- **PowerShell variables are case-insensitive** (`$action` collides with an
  `$Action` parameter), and **`powershell.exe` reads BOM-less `.ps1` as ANSI**,
  so an em-dash in a comment is a parse error several lines later. Keep
  `scripts/*.ps1` ASCII-only.
- **A saturated blue cannot clear 7:1** against this ground — luminance weights
  blue at 0.0722, so the gate drags it to cyan and then to pastel. Contrast
  floors are **per role**, not uniform; `--accent-hero` is gated at 4.5:1
  because it is used at 106px.
- **`web/tokens.css` is generated.** Never hand-edit it; `npm run palette`
  overwrites.
- **All-day events span local midnight to local midnight**, so any "is it
  happening now" test says yes all day. They are never focus candidates.
- **Mock data is well-formed by construction and will never warn you.** Real
  calendars brought concurrent events, Google metadata event types, and postal
  addresses long enough to reflow the layout.

## Open questions for Ricky

1. **Did the token survive the night?** The one genuinely unknown thing.
2. **The blue and the type scale are accepted PROVISIONALLY.** His words,
   2026-08-17: *"The blue is OK for now, and the font size is improved.
   Consider both closed, but not final — they're subject to change after using
   it for a few days."* A later reversal is expected and is **not** a
   regression — do not argue from "but you approved this."
3. **Should `focusTime` and `outOfOffice` be able to take the hero slot?** Kept
   deliberately, because blocked time is real time. But a countdown to "Focus
   time" may read as noise. **This is no longer hypothetical — it happened at
   15:27 on 2026-08-17**, with the panel counting down Ricky's own focus block.
   Judge it in use rather than in theory.
4. **Is the `travel` (TripIt) feed worth its row?** It is an imported feed, so
   it refreshes on Google's schedule, not in real time. It has also never
   rendered — zero events on the day it was wired up.
5. **Does the panel flicker when the PC is genuinely busy?** He reports **no
   flicker in normal use**, which settles the user-facing question in the good
   direction. Left open because the mechanism is unexamined: the render and
   push timers share one event loop, which is the exact coupling the two-loop
   design was meant to remove.
6. ~~**Delete the unused personal Google Cloud project?**~~ **DONE
   2026-08-17** — Ricky deleted it. The in-org project is the only one.
