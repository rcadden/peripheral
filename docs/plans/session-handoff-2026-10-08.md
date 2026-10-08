# Session handoff — 2026-10-08

**Supersedes [`session-handoff-2026-08-29.md`](session-handoff-2026-08-29.md),
which is kept for the record and never edited.** Everything in it still holds
except where this file says otherwise.

Derived from `CHANGELOG.md` (the 2026-10-08 entries), which is the source of
truth for *what happened*. This file is a view of *what to do next*. **If the
two ever disagree, the changelog wins.**

Written for a cold start — and specifically for Ricky's morning, the day after
an overnight build he did not watch.

---

## Read this first

**Sprint 9, the fish tank, is built and on `dev` and `main`, and nobody has
seen it on the glass.** During free time the panel shows a procedurally
generated aquarium; the agenda takes over during events and 10 minutes
before the next one. It is **on by default** (Ricky's call), so the moment
the daemon runs the new code, free time on the panel looks completely
different.

**To see it:**

1. **In a browser, right now, no restart needed:**
   `http://127.0.0.1:4780/panes/tank/` — today's tank, animating. Preview
   flags: `?hour=21.5` (night), `?weather=rain`, `?seed=2026-10-09`
   (another day's tank), `?fps=4` (the panel's rate).
2. **On the panel:** pull, then **restart the daemon** — `daemon.js`,
   `render.js` and the transport changed, and the `web/` file watcher only
   reloads pane files. Signing out and back in (or rebooting) restarts it
   through the logon task cleanly. No `npm install` needed: three.js is
   vendored, and there are no new dependencies.
3. **Read `daemon.log`** (`npm run startup:logs`) for three lines:
   - `[daemon] fish tank: on, agenda from 10 min before an event, 4 fps`
   - `[tank] webgl renderer: …` — **this answers the GPU question.** "Intel"
     / "Iris" / "D3D11" means the GPU flags worked. "SwiftShader" means
     software GL: it still works (measured), just with more CPU.
   - `[daemon] mode: agenda -> tank (…)` when free time starts.

**If anything about it is wrong or unwanted:** `/settings/palette/` → Fish
tank → untick → Save. Back to the agenda within moments, no restart.

## What changed since the previous handoff

One session, overnight, unattended after Ricky answered six questions.

| Question | Ricky's answer |
|---|---|
| Tank frame rate | **4 fps** |
| On by default? | **On, with an off switch** |
| Stone after the last event | **Tomorrow's first event** |
| Overnight / weekends | **Tank always** |
| Close-out | **Full `/session-close`** (so `main` was fast-forwarded too) |
| three.js | **Vendor one pinned file** |

The full build list is in `CHANGELOG.md` → *"Added — Sprint 9, the fish tank
idle mode"*. The short version: a pure mode rule (`web/panes/tank/mode.js`),
the daemon switching panes on it, a transport cadence change with a hard
4 fps ceiling (`src/transport/cadence.js`), the tank scene itself
(`web/panes/tank/`), tomorrow's events fetched in the same request as today's,
settings at `/settings/palette/`, and `npm run fps-test`.

## Where the project lives

Unchanged from the previous handoff, with one addition:

| Thing | Where |
|---|---|
| Repo | `C:\dev\peripheral` |
| Remote | [`github.com/rcadden/peripheral`](https://github.com/rcadden/peripheral) — **public** |
| Display settings | `%LOCALAPPDATA%\Peripheral\display.json` — rotation **and now the tank's `enabled` / `leadMinutes` / `fps`** |
| Fish tank pane | `web/panes/tank/` → `http://127.0.0.1:4780/panes/tank/` |
| three.js | `web/vendor/three-0.170.0.module.min.js` (MIT, licence beside it) |

## What works right now

| Command / URL | What it does |
|---|---|
| `npm start` | The daemon — now switches between agenda and tank |
| `npm test` | **187/187.** Scoped glob on purpose — bare `node --test` drives real hardware |
| `npm run fps-test` | **New.** The Sprint 9 gate: pushes a synthetic animation to the real panel at 2/4/5/10/15 fps and measures it. **Stop the daemon first.** |
| `/panes/tank/` | **New.** The tank, in any browser |
| `/settings/palette/` | Now also: Fish tank on/off, lead minutes, fps |
| everything else | As in the previous handoff |

## How the tank works — read before changing it

- **It is a pane, not a mode of the agenda.** The daemon points its one
  Playwright page at `/panes/agenda/` or `/panes/tank/` and screenshots
  whichever is up. Same rule as always: never fork a "panel version".
- **The decision is `resolveMode()`** — pure, in `web/panes/tank/mode.js`,
  imported by the daemon, the tank page (for the stone) and the tests. It
  reuses the agenda's `selectAgenda()`, so overrides and personal-event
  demotion apply to both panes identically. **No calendar state at all means
  agenda**, never tank — the tank would otherwise silently claim an empty day.
- **The transport owns the rate.** The worker pushes a new frame as soon as
  `minGapMs` has passed (1000ms agenda — the old behaviour — 250ms tank) and
  re-pushes every 1s regardless. `MAX_FPS` (4) is enforced in the transport,
  so no setting or bug can push faster. Only `npm run fps-test` bypasses it,
  by talking to the device directly.
- **One frame per capture.** With `?fps=N` the tank does not run its own
  60 Hz loop; `render.js` calls `window.__beforeCapture()` before each
  screenshot. Generic hooks — `render.js` still knows nothing about panes.
- **Static layers are baked once** into canvases at build time; only shaders
  move per frame. The tank rebuilds at **03:00** with a fade, seeded by date.
- **Motion is designed for 4 fps.** Tail beats under 1.5 Hz (Nyquist at 4 fps
  is 2 Hz — pinned by a test). If the rate ever goes up, the motion budget
  can go up with it; if it goes down to 1–2 fps, it will look like a slow
  living painting, which is the intended degradation.
- **If the tank page cannot run** (no WebGL), it sets `window.__paneFailed`,
  the daemon falls back to the agenda and does not retry until midnight or a
  settings change.

## The next action — needs Ricky, and his eyes

**Look at the tank on the glass.** That is the roadmap's own second gate and
the only thing that closes this sprint. Then, in whichever order suits:

1. **Run `npm run fps-test`** (stop the daemon with `npm run
   startup:uninstall` first, `npm run startup:install` after). Watch the
   glass for each step and note smooth / stutter / flicker-to-logo. Paste the
   summary table into `CHANGELOG.md` with what you saw. If 4 fps is not
   clean, drop the tank's rate at `/settings/palette/` — 2 fps is the next
   step down.
2. **Read the `[tank] webgl renderer:` line** in `daemon.log` and record it.
3. **Check the mode rule against a real workday.** See the first open
   question below — a long timed block can keep the tank away all day.

## Then, in order

1. **Iterate the tank against the glass.** Expect it: the roadmap said
   "composition rules are what separate aquascape from random plants; expect
   iteration against the reference, on the glass." Everything so far was
   judged on a monitor. Likely first knobs: fish size (`species.js`, already
   drawn 30% over true scale for legibility), carpet brightness
   (`paint.js` `paintSubstrate`), night intensity (`sky.js`, 0.36).
2. **Measure under load** — `npm run fps-test` again during a Teams call
   with a build running (roadmap gate item 2).
3. **Sprint 8 — panel liveness in the health signal.** Unchanged from the
   previous handoff, still buildable without hardware, still scoped to
   **log, never act**.
4. **Tomorrow's first event on the agenda pane.** Half-done: `state.tomorrow`
   now exists. The agenda still says "Nothing left today" at 5pm; using
   `state.tomorrow` there is a small pane-only change.
5. The two one-line Sprint 7 checks from the previous handoff (click the
   orientation Save button by hand; confirm `display: rotated 180 degrees
   (from saved)` at boot). The second will appear in the log on the restart
   in "Read this first".

## Facts established the hard way — do not re-derive

Everything in the previous handoffs still holds and is carried forward (not
repeated here). New this session:

- **Render each generated part alone before judging the composite.** Every
  fish was a needle-nosed teardrop for two rounds of scene screenshots; a
  contact sheet caught it instantly. The driftwood's highlights were on the
  underside (a light vector used with the wrong sign) and only showed when
  moss — keyed off that normal — refused to grow.
- **A `Promise.race` timeout must be cleared in a `finally`.** Otherwise it
  rejects an orphaned promise after every win — four times a second here —
  and an unhandled rejection kills Node.
- **Headless Chromium on software GL (SwiftShader) can carry the tank at
  4 fps:** build ~170–400ms, capture ~120–250ms, measured in a Linux
  container. So a failed GPU path costs CPU, not the feature.
- **The project's Playwright (1.62.1) and a machine's installed Chromium can
  disagree on version** — the cloud container had build 1194 where 1.62.1
  wants 1234. Irrelevant on Ricky's machine (its browser was installed by its
  own Playwright), but if a fresh machine logs `Executable doesn't exist at
  …chromium_headless_shell-1234…`, that is the cause, and
  `npx playwright install chromium` with `PLAYWRIGHT_BROWSERS_PATH` set is
  the fix.

## Open questions for Ricky

- **Long timed blocks and the tank.** "Event in progress → agenda" is
  applied as written, so a block like "Ricky GTD" (9:30–4:50, from the
  2026-08-18 notes) keeps the tank off the glass all day. Is that block still
  on the calendar? If so: mark it "Show as: Free" (already honoured — no code
  change), or should long blocks stop counting?
- **Does 4 fps hold on this panel?** `npm run fps-test` answers the
  possible; only Ricky can weigh it against the reliability record.
- **Is the tank worth its place on the glass?** The off switch costs nothing
  if not.
- **Carried forward, still open:** what a dark/disconnected panel should look
  like to a human not reading logs (Sprint 8); whether `focusTime` /
  `outOfOffice` should ever take the hero slot; the 5-minute watchdog
  interval; what killed the daemon at 07:47:16 on 2026-08-24; the 2026-08-18
  cable disagreement.
- **Outstanding from 2026-08-20, still not confirmed resolved:** rotating
  the Google client secret that was printed into a session transcript.
