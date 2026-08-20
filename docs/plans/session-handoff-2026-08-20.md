# Session handoff — 2026-08-20 (tenth session — Sprint 3 opens, sideways)

**Supersedes [`session-handoff-2026-08-18e.md`](session-handoff-2026-08-18e.md),
which is kept for the record and must not be edited.** That file's technical
facts are still carried forward below; this one adds what changed this
session and reopens Sprint 3's shape as a live question.

Derived from `CHANGELOG.md`; if the two disagree, the changelog wins.

## What changed since the previous handoff

Weather was built (started 2026-08-19, confirmed and committed 2026-08-20),
answering Sprint 3's "which source, keyed or not" open question — but it
landed in a different shape than the roadmap asked for.

1. **`NwsProvider` (`src/sources/weather.js`).** Free, keyless NWS API
   (`api.weather.gov`), hardcoded to Ricky's real address (grid `GSP 54,73`,
   station `KAVL`) rather than geocoded at runtime — the install is fixed in
   one spot, so there's no reason to pay a geocoding call and its failure
   modes on every boot. Zero recurring cost.
2. **`src/weather-cache.js`**, separate from the calendar's `cache.js` — its
   own 3h staleness ceiling instead of 36h, because a stale temperature
   misleads faster than a stale calendar.
3. **Daemon wiring:** weather refreshes on its own 15-min interval, merged
   into `/api/state` via a new `publishState()` helper so neither source
   blocks the other. Heartbeat gained `weather=ok|stale|none`.
4. **But it shipped as a redesigned three-panel top bar on the *existing*
   agenda pane** (logo / weather / time, mirroring the body grid's
   three-column layout) — not as a standalone weather pane. Three live
   rounds with Ricky before landing on the current bar: weather promoted
   from a small aside to equal visual weight with the clock, its three
   stats (temp/high/precip) made uniform with no demoted caption tier, and
   the date caption bumped off an illegible-at-3ft faint size.
5. **Verified 2026-08-20:** 82/82 tests unchanged, `/api/state` confirmed
   serving real merged weather + calendar data, DOM-clean at true 1280×480
   (no overflow, no console errors) — **and confirmed by Ricky directly on
   the physical panel: "looks good on the glass."** Committed as `ecb5c52`.
6. **Roadmap correction, found closing this out, not during the build:**
   the weather item satisfies the roadmap's underlying reasoning (prove the
   panel can show more than the calendar, cheaply, no new auth) but not its
   literal ask (a separate pane for cycling to cycle to). Left `[~]` in
   `directives/roadmap.md`, flagged `NEEDS RICKY`. See the dated Lessons
   Learned entry in `CLAUDE.md` (2026-08-20) — the standing rule it produced:
   re-read a roadmap item's original wording against what was actually
   built at close time, not just whether it works.

## Where the project lives

| | |
|---|---|
| Repo | `C:\dev\peripheral` — deliberately NOT in OneDrive |
| Remote | `github.com/rcadden/peripheral` — private until the **release sprint (5)** |
| Branches | `dev` and `main`, both at the same commit after this session's push |
| Token store | `%LOCALAPPDATA%\Peripheral\tokens.json` |
| State cache | `%LOCALAPPDATA%\Peripheral\last-state.json` |
| Weather cache | `%LOCALAPPDATA%\Peripheral\weather-cache.json` (or wherever `WeatherCache` writes — check `src/weather-cache.js` if this drifts) |
| Daemon log | `%LOCALAPPDATA%\Peripheral\daemon.log` |
| Scheduled task | `Peripheral`, at task path `\` |
| Pane URL | `http://127.0.0.1:4780/panes/agenda/` |

## What works right now

| Command | What it does |
|---|---|
| `npm start` | Daemon: server + renderer + transport worker + pane-file watcher |
| `npm test` | **82 pass, 0 fail.** Scoped glob — never touches hardware |
| `npm run palette` | Regenerates `web/tokens.css`, including the calendar accents |
| `npm run stall-test` | Fault-injects a wedged transport. Dry run, safe with the daemon live |
| `npm run idle-test` | Re-derives the ~3s forget window. **Drives real hardware for 68s** |
| `npm run probe` | Confirms Windows enumerates `0416:5302` |
| `npm run auth` | OAuth login. Not needed again unless the token is revoked |
| `npm run startup:status` / `:logs` | Task state and daemon log |

Editing anything under `web/panes/` (or `web/tokens.css`) reloads the live
pane automatically within ~1s — watch the log for `[daemon] pane reloaded`.
Editing `daemon.js`, `render.js`, or anything outside `web/` still needs a
real restart:

```powershell
$p = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*src\daemon.js*' }
if ($p) { Stop-Process -Id $p.ProcessId -Force }
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName Peripheral
```

**Note the taskkill caveat from 2026-08-19: `Stop-Process -Force` (like
`taskkill /F`) skips the daemon's graceful-shutdown handler** (the one that
calls `panel.close()`). No real-world consequence has actually been observed
from this yet — the one incident that looked like it turned out to be an
unplugged panel, not a bad HID handle — but it's still true as a mechanism
and worth remembering if a *real* stuck-panel-after-restart case shows up.

Panel is live under the scheduled task.

## The next action

**Sprint 3's shape needs Ricky before more code gets written against it.**
Pane cycling is completely unbuilt. Weather is built, verified, and on the
glass — but not as a pane. The sprint's original closing condition ("cycles
between agenda and weather") names a pane that doesn't exist.

**The open question, verbatim from the roadmap:** does always-visible
weather in the bar replace the need for a weather *pane*, or does pane
cycling still want a second pane to prove itself against — and if so, what?
Candidates already listed for Sprint 4 (tomorrow's-first-event, inbox,
photos) could serve as the "second pane" instead of building a weather pane
redundantly.

**Once that's answered:**
1. **Pane cycling with per-pane dwell times** — `render.js` already has
   `goto()` for this (also now doing double duty for hot-reloading edited
   pane files — see `reloadPane()` in `daemon.js`). Constraints already
   settled and not to be re-litigated: push stays at 1 fps on the transport
   thread regardless of what the renderer is doing, and a pane switch must
   never cost a frame — if `goto()` plus font settle takes longer than the
   ~3s forget window, the previous pane's frame keeps shipping until the new
   one is ready.
2. Rewrite Sprint 3's closing condition once the second pane is picked.

**If a design conversation is wanted instead of a build:** the colour
palette rework (green/pink aren't final) is still queued but unscheduled —
could slot in before or alongside the rest of Sprint 3.

**Separately, open and disputed, unrelated to any of the above:** what's
actually causing the transport stalls, if not the cable. Unchanged across
several handoffs now — still no answer from Ricky, still not acted on.

## Then, in order

1. **Resolve Sprint 3's pane-cycling target** (needs Ricky, see above), then
   build pane cycling itself.
2. The colour palette rework, whenever it gets scheduled.
3. **Sprint 4: more panes** — tomorrow's first event, an inbox pane (needs a
   new Gmail readonly scope against the same internal-app OAuth client —
   verify that first), a photos pane (research spike on current Google
   Photos Library API policy BEFORE any design work — it may be restricted
   for third-party apps). Any of these is now also a candidate for "the
   pane cycling proves itself against," see above.

## Facts established the hard way — do not re-derive

Everything in the previous handoffs still holds and is carried forward (not
repeated here). New this session:

- **A roadmap item can be fully built, fully verified, and confirmed on the
  glass, and still not be the thing the roadmap asked for.** All of this
  session's verification tiers passed for weather (tests, data, DOM, eyes-
  on-glass) without ever surfacing that it landed as a bar redesign instead
  of a pane — because "does it work" and "is it the shape that was asked
  for" are different questions, and only the second one was left unchecked
  until session-close's roadmap-sync step. See the dated Lessons Learned
  entry in `CLAUDE.md`.
- **`WEATHER_INTERVAL_MS` (15 min) and `WEATHER_STALE_AFTER_MS` (2× that, 30
  min) are independent of the calendar's `SOURCE_INTERVAL_MS`/`STALE_AFTER_MS`
  — both intentionally, not coincidentally different**: NWS's gridded
  forecast updates roughly hourly, so polling every minute would be pure
  load with no new information, and a stale temperature misleads faster
  than a stale calendar (3h cache ceiling vs. 36h).
- **The weather grid point (`GSP 54,73`) and station (`KAVL`) are hardcoded
  in `weather.js`, not derived at runtime.** If the panel is ever moved to a
  different physical location, this needs a manual re-derivation via
  `api.weather.gov/points/{lat},{lon}` — it will not self-correct.

## Open questions for Ricky

1. **Does bar-embedded weather satisfy Sprint 3, or does pane cycling still
   need a real second pane to prove itself against — and if so, which one?**
   New this session; blocks the next build step.
2. **When to schedule the colour palette rework** — queued, unscheduled.
   Green/pink were a first pass through the gate, not a final choice.
3. **Should `focusTime`/`outOfOffice` take the hero when nothing else is
   live?** Still open, unchanged across several handoffs.
4. **Where does "tomorrow's first event" belong** — unchanged; still reads
   "Nothing left today" at 5pm.
5. **What's actually causing the transport stalls, if not the cable?**
   Unchanged — still disputed, still no alternative theory offered.
6. **Does the personal-event-claiming rule need the "work block time is
   priority" merge behavior**, or is unlock-only enough? Only a real case
   will really answer this.
