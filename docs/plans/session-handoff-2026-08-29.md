# Session handoff — 2026-08-29

**Supersedes [`session-handoff-2026-08-24.md`](session-handoff-2026-08-24.md),
which is kept for the record and never edited.** Everything in it still holds
except where this file says otherwise.

Derived from `CHANGELOG.md`, which is the source of truth for *what happened*.
This file is a view of *what to do next*. **If the two ever disagree, the
changelog wins.**

Written for a cold start after a multi-day gap. Assume no memory of the
session that produced it.

---

## Read this first

**The panel is not working. It is not a software problem, and nothing in this
repo can fix it.**

On 2026-08-29 — **day 13** of ownership — the Thermalright Trofeo Vision
stopped enumerating. Windows does not see the device at all: all four nodes
under `VID_0416&PID_5302` are present in the registry with `Present: False`.
That absence was verified against a control query (318 present devices, other
HID devices reporting `Status OK`), so it is a real absence and not a bad
check.

It did not fail cleanly. It flickered first, for about twelve hours —
repeated `ok → STALLED → down → ok` cycles, **1,142 `down` heartbeats against
15,750 `ok`** across the log — then `Cannot write to hid device: WriteFile:
(0x0000048F) The device is not connected`, one worker respawn, and 1,174
`not enumerating` messages. This is precisely the flicker-then-permanent-death
curve the 19% one-star reviews describe, inside the predicted 1–8 week window.

**The next step is physical, in this order: cable, then port, then unit.**

Ricky has said twice (2026-08-18) that he does not think it is the cable. That
position stands and this handoff does not override it — **do not swap hardware
on your own initiative.** What has changed is the cost of finding out: with the
panel now fully absent, a new USB-C cable is a single test with two clean
outcomes. Either the panel returns and the cable theory was right, or it does
not and the theory is eliminated. It stopped being an argument and became an
errand.

**Everything else in the project is fine and running.** The daemon stayed up
through the entire failure, kept fetching calendar and weather, kept rendering,
and kept serving the browser fallback. That is exactly what the decoupled
transport was built for, and it held on the day it was needed.

## What changed since the previous handoff

Two sessions, both small.

**2026-08-28/29 — Sprint 7, display orientation. Complete and confirmed on the
glass.** Ricky mounted the panel upside down and asked for the display to be
rotated; on his follow-up it became a settings feature the same session. He
confirmed it on the physical panel — *"I checked the panel yesterday, the
rotation looked good"* — which is the last known-good observation of this
hardware.

**2026-08-29 — the panel died, and every supervision layer called it healthy.**
Found by the session-close verification gate, not by anyone looking for it.
Opened as Sprint 8.

## Where the project lives

| Thing | Where |
|---|---|
| Repo | `C:\dev\peripheral` — deliberately NOT in OneDrive |
| Remote | [`github.com/rcadden/peripheral`](https://github.com/rcadden/peripheral) — **public.** Treat every commit as public. |
| Branches | `dev` is the working branch; `main` is fast-forwarded to it at session close, without asking (project-specific override) |
| Token store | `%LOCALAPPDATA%\Peripheral\tokens.json` |
| State cache | `%LOCALAPPDATA%\Peripheral\last-state.json` |
| Palette overrides | `%LOCALAPPDATA%\Peripheral\palette-overrides.json` |
| Weather location | `%LOCALAPPDATA%\Peripheral\weather-location.json` |
| **Display settings** | **`%LOCALAPPDATA%\Peripheral\display.json` — new this session** |
| Daemon log | `%LOCALAPPDATA%\Peripheral\daemon.log` — `npm run startup:logs` |
| Watchdog log | `%LOCALAPPDATA%\Peripheral\watchdog.log` — `npm run watchdog:logs` |
| Scheduled tasks | `Peripheral` (logon+30s) and `Peripheral Watchdog` (every 5 min) |

## What works right now

| Command | What it does |
|---|---|
| `npm start` | The daemon — sources, server, renderer, transport |
| `npm run serve` | Just the HTTP server, for pane design work |
| `npm test` | **128/128 passing.** Scoped glob on purpose — bare `node --test` drives real hardware |
| `npm run startup:status` | Task registration *and* whether the daemon is actually up |
| `npm run startup:logs` / `watchdog:logs` | The two logs |
| `npm run watchdog:test` | Forces the real end/sweep/run recovery sequence |
| `npm run probe` | HID enumeration check — **currently finds nothing, correctly** |
| `npm run palette` | Regenerates `web/tokens.css`. Never hand-edit that file |

**The browser fallback is the only working display surface right now:**
`http://127.0.0.1:4780/panes/agenda/` — real merged calendar, live weather,
correct colours. Settings at `http://127.0.0.1:4780/settings/palette/`.

## How display rotation works — read before changing it

- **It is a render-time flag on the pane URL, never a stylesheet edit.** The
  daemon opens `?rotate=180`; an inline script in the pane's `<head>` sets
  `data-rotate="180"` on `<html>`; one CSS rule rotates `.pane`. A human
  opening the URL by hand gets no parameter and therefore an upright,
  readable page. **Do not "simplify" this into a plain CSS rule** — that
  turns the browser fallback upside down, which is the thing the design
  exists to prevent.
- **Applied to `.pane`, not `html`/`body`.** `.pane` is exactly the viewport
  size, so a 180° turn about its centre lands on the same box. 180° is an
  exact pixel mapping — nothing is resampled, type quality is unchanged.
- **0 and 180 only, validated at three layers.** A quarter turn needs a
  480×1280 pane — different layout, different type scale — not a transform.
  Offering it would promise a layout that does not exist.
- **A picker-saved value beats `PERIPHERAL_ROTATE`.** This deliberately
  inverts `palette.js`'s env-always-wins rule. Reasoning is in
  `src/display-settings.js` and pinned by tests. `PERIPHERAL_ROTATE` is the
  default for an unattended install, nothing more.
- **Changes apply without a daemon restart** — `daemon.js` watches
  `display.json` and calls `renderer.goto()` on the rebuilt URL. A restart
  would bounce the HID device, which is not something to do because someone
  flipped a radio button.
- **There is deliberately no live preview.** Rotation cancels a physical
  mount, so a correctly-set 180 panel looks *upright* on the glass — a
  rotated preview shows the one form nobody ever sees.

## The next action

**Get a panel back, or decide not to.** This needs Ricky and cannot be done
from a session:

1. Try a different USB-C cable. Highest-information single test available, and
   it settles a question that has been open and disputed since 2026-08-18.
2. If that fails, a different port, then conclude the unit.
3. If the unit is dead, the decision is Ricky's: replace the same model
   (~$37.90, known 3.7★ reliability), move to the 8.8"/1920×480 class that has
   been circling in Future Explorations, or stop.

Until then the project still runs and is still useful in the browser, but its
whole point — ambient, glanceable, on the desk — is unavailable.

## Then, in order

1. **Sprint 8 — panel liveness in the health signal.** Buildable now, without
   hardware. `/api/health` returns `{"ok":true,"hasState":true}` and says
   nothing about the panel; `PanelProxy` already derives `ok`/`STALLED`/`down`
   and the heartbeat already prints it. Wiring it into the health endpoint is
   likely the whole build. **Scope it to log loudly and NOT act** — restarting
   the daemon fixes nothing when the USB device is gone, and a signal a dead
   cable can assert forever is how a watchdog becomes a crash loop. Verifiable
   only in the `down` direction until hardware returns; say so rather than
   claiming it works.
2. **Close the two cheap unverified items from Sprint 7**, both one-liners:
   click the settings Save button once by hand (its click path has never been
   exercised by a human — only the endpoint, via `curl`), and check the next
   daemon start logs `display: rotated 180 degrees (from saved)`, which proves
   boot-time application of a saved orientation. Neither needs the panel.
3. **Tomorrow's first event when today is done** (Future Explorations) — the
   agenda pane says "Nothing left today" at 5pm, which is true and unhelpful.
   Buildable any session, needs no pane system and no hardware.

## Facts established the hard way — do not re-derive

Everything in the previous handoffs still holds and is carried forward (not
repeated here). New this session:

- **Every health signal in this project reports the daemon; the thing that
  matters is the panel.** During a ~12h panel outage, `/api/health` said `ok`,
  the watchdog wrote 1,176 lines with no non-`ok` entry, and the logon task sat
  in `Running`. All correct, all answering a question nobody asked. The truth
  appeared only as `panel=down` in a 30-second heartbeat line in a log file.
  **When adding a supervisor, write down what it does not cover in the same
  commit** — that sentence is the next roadmap item.
- **A monitor must not act on a signal a permanent fault can assert forever.**
  "Restart when the panel is down" would have produced an endless restart loop
  on top of a dead panel. This is why Sprint 8 is scoped to logging.
- **Rotation cancels a physical condition, so previewing it shows the form
  nobody sees.** A correctly-set 180 panel reads upright on the glass. Before
  building a preview of any setting that compensates for a physical property,
  ask what the user sees at the far end of the pipeline, not what the system
  emits.
- **`Number('')` is `0`.** An empty form field or blank JSON value parsed as a
  valid rotation and would have silently meant "Normal" — a missing answer
  disguised as a deliberate one. When a coercion maps absence onto a legal
  value, reject the absence explicitly before coercing. Caught by a test, not
  by reading the code.
- **Ricky checks the panel between sessions and does not always report back.**
  The rotation was about to be recorded as never-seen-on-the-glass; asked
  directly, he had already looked and it was fine. **At the verification gate,
  ask — do not assert an absence.**
- **Verifying a device is absent needs a control query.** `Get-PnpDevice`
  filtered on the VID/PID returning nothing proves nothing on its own. Confirm
  the cmdlet returns other devices first. Same standing rule as the
  `chrome-headless-shell` mistake: prove the check can return something.

## Open questions for Ricky

- **Cable, port, or unit?** Unanswerable from a session. See "Read this first."
- **If the unit is dead, replace it with what?** Same model, the 8.8"/1920×480
  class, or stop. This is a spending decision and a scope decision at once.
- **What should a dead panel look like to a human who is not reading logs?**
  Sprint 8 can report the state; it cannot decide how Ricky should find out. An
  ambient display that has failed is indistinguishable from one nobody looked
  at — which is exactly what happened for twelve hours.
- **Carried forward, still open:** whether `focusTime`/`outOfOffice` should ever
  take the hero slot; whether 5 minutes is the right watchdog interval; and what
  actually killed the daemon at 07:47:16 on 2026-08-24 (made survivable, never
  diagnosed).
