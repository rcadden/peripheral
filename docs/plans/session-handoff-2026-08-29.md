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

**CORRECTION, appended 2026-08-29 shortly after this file was written. The
section below is WRONG and is kept struck-through rather than deleted.** The
panel was never dead — Ricky had unplugged it: *"I took my laptop downstairs
and the panel is attached to my external monitor."* There is no hardware
fault, nothing to diagnose, and nothing to buy. **Plug it back in.**

The rule that comes out of it, which is the only part worth carrying forward:
**an unplugged panel is indistinguishable from a dead one in every signal this
project emits** — `not enumerating`, absent from Windows PnP, `The device is
not connected`. Before concluding anything about this hardware, confirm it is
physically connected. This is the second time the mistake has been made; the
first is the struck-through 2026-08-19 row in `CHANGELOG.md`.

<details><summary>Superseded text — the hardware-death conclusion (wrong)</summary>

~~The panel is not working. It is not a software problem, and nothing in this
repo can fix it. On 2026-08-29 — day 13 of ownership — the Thermalright Trofeo
Vision stopped enumerating. Windows does not see the device at all: all four
nodes under `VID_0416&PID_5302` are present in the registry with
`Present: False`. It did not fail cleanly; it flickered first, for about twelve
hours. This is precisely the flicker-then-permanent-death curve the 19%
one-star reviews describe, inside the predicted 1–8 week window. The next step
is physical, in this order: cable, then port, then unit.~~

**Every observation in that paragraph was accurate. The conclusion was not.**

</details>

**Everything else in the project is fine and running.** The daemon stayed up
through the whole disconnect, kept fetching calendar and weather, kept
rendering, and kept serving the browser fallback — which is the decoupled
transport working exactly as designed.

## What changed since the previous handoff

Two sessions, both small.

**2026-08-28/29 — Sprint 7, display orientation. Complete and confirmed on the
glass.** Ricky mounted the panel upside down and asked for the display to be
rotated; on his follow-up it became a settings feature the same session. He
confirmed it on the physical panel — *"I checked the panel yesterday, the
rotation looked good."*

**2026-08-29 — the panel appeared dead and every supervision layer called it
healthy. It was unplugged.** Found by the session-close verification gate, and
misdiagnosed there; see the correction above. The supervision blind spot it
exposed is real regardless of the cause, and is now Sprint 8.

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
| `npm run probe` | HID enumeration check. Finds nothing while the panel is unplugged — which is correct, and is not evidence of a fault |
| `npm run palette` | Regenerates `web/tokens.css`. Never hand-edit that file |

**The browser fallback works whether or not the panel is plugged in:**
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

**Plug the panel back in**, and confirm the daemon picks it up on its own
(`[hid] open — PM=128 SUB=1` in `daemon.log`, then `panel=ok` in the
heartbeat). The reconnect loop retries every 30s, so this should need no
intervention at all — which is worth actually verifying once, since it has
never been watched deliberately.

Then **Sprint 8**, below. No hardware decision is pending and nothing needs
buying.

## Then, in order

1. **Sprint 8 — panel liveness in the health signal.** Buildable now, without
   hardware. `/api/health` returns `{"ok":true,"hasState":true}` and says
   nothing about the panel; `PanelProxy` already derives `ok`/`STALLED`/`down`
   and the heartbeat already prints it. Wiring it into the health endpoint is
   likely the whole build. **Scope it to log loudly and NOT act** — restarting
   the daemon fixes nothing when the USB device is absent, and a signal that a
   routine unplug asserts for hours is how a watchdog becomes a crash loop —
   it would have spent this Saturday restarting a healthy daemon because its
   owner went downstairs. Both directions are testable simply by unplugging
   the panel, which is a better fault injector than anything that needed
   building.
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

- ~~Cable, port, or unit?~~ **VOID — it was unplugged.**
- ~~If the unit is dead, replace it with what?~~ **VOID — same reason.**
- **What should a disconnected or dark panel look like to a human who is not
  reading logs?** This one survives the correction and got sharper: the answer
  has to distinguish "you unplugged it" (routine, most days) from "it stopped
  working" (rare, alarming). Sprint 8 can report the state; it cannot decide
  how Ricky should find out.
- **Carried forward, still open:** whether `focusTime`/`outOfOffice` should ever
  take the hero slot; whether 5 minutes is the right watchdog interval; what
  actually killed the daemon at 07:47:16 on 2026-08-24; and the 2026-08-18
  cable disagreement, which this session did not touch and did not resolve.
