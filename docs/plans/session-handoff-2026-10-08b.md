# Session handoff — 2026-10-08b

**Supersedes [`session-handoff-2026-10-08.md`](session-handoff-2026-10-08.md)
(the overnight build's handoff), which is kept for the record and never
edited.** Everything in it still holds except where this file says otherwise.

Derived from `CHANGELOG.md` — the 2026-10-08 *day session* entries, starting
at *"Seen on the glass — the fish tank's first day"*. The changelog is the
source of truth for what happened; this file is a view of what to do next.
**If the two ever disagree, the changelog wins.**

Written for a cold start after a multi-day gap.

---

## Read this first

**The fish tank has been on the glass, and the next unit of work is a
written fish-behaviour spec — not code.** Ricky watched the tank all morning
on 2026-10-08 and it was iterated live. Three fish-behaviour models were
invented and all three were rejected on the glass (*"I don't think you fully
understand how a fish tank works"*). The fourth is built from references,
written down, and approved by Ricky before anything is coded.

**Ricky wants the freshwater "riverbed" look, not saltwater.**

## What changed this session

| Area | Now | Verified by |
|---|---|---|
| Frame rate | **10 fps** (was 4). Settable 1/2/4/6/8/10. Daemon achieves ~7.5 | fps-test on the panel, Ricky watching |
| Stutter | **Root cause: Task Scheduler's default priority 7** (below normal, CPU and I/O). Logon task now `-Priority 4` | Measured A/B; process reports `Normal` |
| Countdown | **LCD card on the glass**, matching the clock (was a slate stone) | Seen: "the card looks fine" |
| Fish | 2x size, 3x speed, school rebuilt as per-fish waypoints | Measured only — **behaviour rejected** |
| Caustics | Gains cut ~2/3 on substrate, ~1/2 on plants and wood | Rendered — **shadows still seen on the glass** |
| Tank JPEG | Quality 80 via `window.__jpegQuality` (~108KB, was 188KB) | Measured |
| Diagnostics | Hitch log (`[hid] hitch`), push trace (`PERIPHERAL_PUSH_TRACE=1`) | Exercised |
| 2026-10-07 | Panel dropped off USB at a Modern Standby resume; replug fixed it. Logged, unclassified | Diagnosed from logs |

## Where the project lives

Unchanged from the previous handoffs:

| Thing | Where |
|---|---|
| Repo | `C:\dev\peripheral` — remote [`github.com/rcadden/peripheral`](https://github.com/rcadden/peripheral), **public** |
| Daemon log | `%LOCALAPPDATA%\Peripheral\daemon.log` — `npm run startup:logs` |
| Watchdog log | `%LOCALAPPDATA%\Peripheral\watchdog.log` |
| Display settings | `%LOCALAPPDATA%\Peripheral\display.json` — rotation and tank `enabled`/`leadMinutes`/`fps` |
| Tank pane | `http://127.0.0.1:4780/panes/tank/` (`?fps=10`, `?hour=21.5`, `?weather=rain`, `?seed=YYYY-MM-DD`) |
| **Reference clips** | `C:\Users\grcad\Videos\2026-10-08 09-39-40.mp4` through `09-42-51.mp4` (5 clips, ~31s, 1080p60). **Ignore `2026-06-25 10-04-39.mp4`** — an unrelated 24-minute Zoom recording |
| **Reference model** | Deskworlds, `github.com/chaseleantj/deskworlds`, MIT — `scenes/riverscape/src/fish.js` |

## What works right now

| Command / URL | What it does |
|---|---|
| `npm start` | The daemon — agenda during events and 10 min before, tank otherwise |
| `npm test` | **187/187.** Scoped glob on purpose — bare `node --test` drives real hardware |
| `npm run fps-test -- 6 8 10` | Pushes a synthetic animation to the panel at the named rates. **Stop the daemon first** (see the gap below) |
| `npm run startup:install` | Registers both tasks — the logon task now at **priority 4** |
| `grep hitch daemon.log` | Every push ≥400ms, with per-chunk timing and what the main thread was doing |
| `PERIPHERAL_PUSH_TRACE=1` | One log line per push — for diagnosis only |
| `/settings/palette/` | Tank on/off, lead minutes, fps (1–10) |

**Stopping the daemon has a gap:** `npm run startup:uninstall` (or
`Stop-ScheduledTask`) leaves `node src\daemon.js` running, unsupervised.
Kill it explicitly, and **confirm by the port** (`curl
127.0.0.1:4780/api/health` must fail), not by a process filter's silence.

## The next action — needs Ricky for approval

**Write the fish-behaviour spec.** One page, for approval before code:

1. **Read Deskworlds' model:** `scenes/riverscape/src/fish.js` — the `SWIM`,
   `GAIT`, `TURN`, `SHOAL`, `HOVER`, `MAX_EXPLORERS` constants and the
   comments above them. They cite the research.
2. **Measure the reference clips.** `ffmpeg` is installed. Extract frames at
   ~4/s, read them in sequence, and measure what the spec needs: how long
   fish hover, how often and how sharply they turn, how far an excursion
   goes, how loosely the shoal holds, how the shoal moves as a group.
   **Clip 5** (rainbowfish over carpet plants) is the closest match to
   Ricky's preferred look; clip 2 (planted freshwater, tetras + angelfish)
   is next.
3. **Write the spec** — schooling species, the centrepiece gourami, the
   bottom-dwellers — in Deskworlds' terms, translated to our 2.5D side view.
4. **Ricky approves it.** Then build, then judge on the glass.

## Then, in order

1. **Floating shadows on the grass.** Ricky still sees them; 60 consecutive
   renders show none. **Ask for a photo or video of the glass before
   theorising** — the last theory (caustics) was real in the renders and did
   not fix what he sees.
2. **Variety** — two fish shapes ever seen; one school + one centrepiece +
   one grazer group per day. Probably folds into the behaviour spec.
3. **Shrimp invisible on the glass** — red on green carpet, even at 2x.
4. **Timer grid** — `TICK_MS` 25 → 10 in `hid-worker.js` may lift ~7.5 fps
   toward 10. Measure by the per-30s `pushed=` delta.
5. **Fix `startup:uninstall` orphaning the daemon.**
6. **Motion blur**, only if the fish still look steppy once their behaviour
   is right.
7. Carried forward: **Sprint 8** (panel liveness in the health signal — log,
   never act); **tomorrow's first event on the agenda pane** (small, since
   `state.tomorrow` exists); **measure under load** (Teams + build).

## Facts established the hard way — do not re-derive

Everything in the previous handoffs still holds. New this session:

- **The panel holds 10 fps cleanly; 12 starts dropping slots.** fps-test,
  151KB frames: 6/8/10 fps exact, 0 failed, 0 late, worst push 78–94ms.
  Pushes take ~50ms when nothing else is running.
- **Task Scheduler's default priority (7) throttles the daemon** — CPU and
  I/O. From a terminal the same daemon ran ~30% faster with a third of the
  worst-case latency. Any task doing real-time work sets `-Priority 4`.
- **Ruled out as stutter causes, each by its own test:** Chromium screenshot
  contention (a second process capturing at ~9/s did not slow pushes), the
  worker thread (same loop, same speed on either thread), and frame size
  (108KB vs 151KB both fine outside the daemon).
- **Slow pushes are slow across every chunk** (~5ms each against ~0.6ms), not
  one stalled chunk — contention, not the endpoint pausing.
- **The worker's 25ms tick lands on Windows' 15.6ms timer grid** — push gaps
  of 109–125ms against a 100ms target.
- **The tank renders on the GPU:** `ANGLE (Intel, Intel(R) Iris(R) Xe
  Graphics … Direct3D11 …)`, captures 18–90ms.
- **Background is baked once** (boot and 03:00); per frame the GPU only
  composites layers and runs sway/caustics/rays/particles/fish shaders. The
  expensive per-frame step is the screenshot + JPEG encode, and the panel
  needs a full frame every time.
- **Fish metrics I invent do not predict Ricky's verdict.** A school measuring
  15 reversals/fish/min and 29% alignment still read as "a current."
- **When fish size changes, simulation constants tied to it break** — the
  school's neighbour radius had to become `max(110, 2.6 × length)`.
- **Depth wander needs a restoring force** — without one, fish pin at z 0.05
  or 0.95 within a minute and the back half vanishes behind the plants.
- **`display: rotated 180 degrees (from saved)` appears at boot** — the
  Sprint 7 boot-time check from earlier handoffs is answered.

## Open questions for Ricky

- **The fish-behaviour spec** — approval, once written.
- **What do the shadows look like?** A photo or video of the glass.
- **Long timed blocks and the tank** — carried forward. Partial evidence: on
  2026-10-08 the tank showed from ~08:05 until the 10:20 lead-in, so no
  all-day block was live that morning.
- **Carried forward, still open:** Sprint 8's dark-panel signal; `focusTime` /
  `outOfOffice` in the hero slot; the 5-minute watchdog interval; the
  2026-08-24 07:47:16 daemon death; the 2026-08-18 cable disagreement; the
  2026-10-07 standby-resume drop (repeatable or one-off?).
- **Outstanding from 2026-08-20, still not confirmed resolved:** rotating
  the Google client secret that was printed into a session transcript.
