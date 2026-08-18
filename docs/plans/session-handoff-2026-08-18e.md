# Session handoff — 2026-08-18e (ninth session — Sprint 2 closes)

**Supersedes [`session-handoff-2026-08-18d.md`](session-handoff-2026-08-18d.md),
which is kept for the record and must not be edited.** That file's technical
facts are still carried forward below; this one adds what changed this
session, closes Sprint 2, and points at Sprint 3.

Derived from `CHANGELOG.md`; if the two disagree, the changelog wins.

## What changed since the previous handoff

Colour-coding by calendar — Sprint 2's last unblocked item — shipped, and
Ricky closed the sprint.

1. **Two new contrast-gated palette tokens**, computed through the real gate
   rather than hand-picked: `--accent-calendar-work` (green, 7.97:1) and
   `--accent-calendar-personal` (pink/magenta, 6.22:1), floored at 6.0 —
   higher than the decorative tiers, because a marker nobody notices
   defeats the purpose. The roadmap's own pre-written guess ("shades of one
   hue is likelier to work") was wrong: Ricky wanted genuinely different hue
   families, not tonal variation — *"I don't want shades - I want
   completely different colors. Contrast is the point."*
2. **Two rounds of "not visible enough," same sitting.** First cut (a small
   dot, a tinted tick) wasn't enough: *"I don't want just the little
   buttons... the title of the event [colored]. The dots aren't big/obvious
   enough to see."* Second cut coloured the agenda list's title text on
   every row. Third correction: *"Make sure the timestamp is also
   colored."* The list's title AND timestamp now both carry calendar
   colour; the tick is the only thing still phase-coloured (blue) on
   is-now/is-next, which is now the sole remaining urgency signal there.
   Hero/then were untouched — Ricky's objection was specifically about the
   agenda list.
3. **Sprint 2 — Agenda, second pass — is COMPLETE.** Ricky: *"consider
   Sprint 2 completed. We'll work on Sprint 3 tomorrow (maybe)."* Two things
   carried forward rather than force-closed: overlap precedence stays a
   living, ongoing-tuning system (not a finished deliverable), and whether
   `focusTime`/`outOfOffice` should ever take the hero slot is still open.
4. **Queued but not yet scheduled: the colour palette needs a rework.**
   Ricky, same closing message: *"We'll need to rework the color palette,
   but let's put that on a future tuning/optimization sprint."* Green/pink
   cleared the gate on the first attempt; not a considered final choice.
   No sprint assigned yet — raise it when picking the next design-heavy
   piece of work.

## Where the project lives

| | |
|---|---|
| Repo | `C:\dev\peripheral` — deliberately NOT in OneDrive |
| Remote | `github.com/rcadden/peripheral` — private until the **release sprint (5)** |
| Branches | `dev` and `main`, both at the same commit after this session's push |
| Token store | `%LOCALAPPDATA%\Peripheral\tokens.json` |
| State cache | `%LOCALAPPDATA%\Peripheral\last-state.json` |
| Daemon log | `%LOCALAPPDATA%\Peripheral\daemon.log` |
| Scheduled task | `Peripheral`, at task path `\` |
| Pane URL | `http://127.0.0.1:4780/panes/agenda/` |

## What works right now

| Command | What it does |
|---|---|
| `npm start` | Daemon: server + renderer + transport worker + pane-file watcher |
| `npm test` | **82 pass, 0 fail.** Scoped glob — never touches hardware |
| `npm run palette` | Regenerates `web/tokens.css`, including the two calendar accents |
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

Panel is live under the scheduled task.

## The next action

**Sprint 2 is closed. Sprint 3 is next — "maybe tomorrow," per Ricky, so this
may open cold after a gap.** Sprint 3's question: *can the panel show more
than one thing?*

1. **Pane cycling with per-pane dwell times.** The infrastructure — which
   pane is showing, how long each holds, switching without the push loop
   ever noticing. `render.js` already has `goto()` for exactly this (also
   now used for hot-reloading edited pane files — see how it's called in
   `daemon.js`'s `reloadPane()` for the mechanics). Constraints already
   settled and not to be re-litigated: push stays at 1 fps on the transport
   thread regardless of what the renderer is doing, and a pane switch must
   never cost a frame — if a `goto()` plus font settle takes longer than the
   ~3s forget window, the previous pane's frame keeps shipping until the new
   one is ready.
2. **Weather pane — the proof, not a nice-to-have.** Cycling can't be
   verified with one pane; weather is the cheapest real second pane (no
   OAuth, no new scope, no new token).

**Closing condition for Sprint 3:** the panel cycles between agenda and
weather, unattended, across a logon, with no blank frame at the switch and
no flicker on the glass.

**If a design conversation is wanted instead of a build:** the colour
palette rework (green/pink aren't final) is queued but unscheduled — could
slot in before or alongside Sprint 3 if Ricky would rather do that first.

**Separately, open and disputed, unrelated to any of the above:** what's
actually causing the transport stalls, if not the cable. Unchanged across
several handoffs now — still no answer from Ricky, still not acted on.

## Then, in order

1. **Sprint 3: pane cycling, with weather as the proof** (see above).
2. The colour palette rework, whenever it gets scheduled.
3. **Sprint 4: more panes** — tomorrow's first event, an inbox pane
   (needs a new Gmail readonly scope against the same internal-app OAuth
   client — verify that first), a photos pane (research spike on current
   Google Photos Library API policy BEFORE any design work — it may be
   restricted for third-party apps).

## Facts established the hard way — do not re-derive

Everything in the previous handoffs still holds and is carried forward
(not repeated here). New this session:

- **A written guess in the roadmap is a hypothesis, not a constraint** —
  even one that reads like settled reasoning. The roadmap said "shades of
  one hue is likelier to work than more hues" before this session's design
  conversation happened; Ricky's actual answer was the opposite ("I don't
  want shades - I want completely different colors"). Treat any
  pre-written design note the same way a first-draft implementation gets
  treated on this project: check it against the real conversation before
  building to it.
- **Inline styles always beat class-based CSS rules, regardless of
  specificity — used deliberately here, not discovered as a bug.** The
  agenda list's is-now/is-next rows keep phase-coloured (blue) ticks via
  CSS classes; their title/time text is recoloured to calendar identity via
  inline `style="color:..."`, which cleanly overrides the inherited phase
  colour without touching the CSS rules governing the tick. Useful pattern
  when two coloring systems need to coexist on siblings within the same
  element without one clobbering the other's rules.
- **Two new palette tokens exist now**: `--accent-calendar-work` (`#28bd5a`,
  green) and `--accent-calendar-personal` (`#df68a3`, pink/magenta), gated
  at floor 6.0 (new `GATE.calendar` in `palette.js`). Regenerate with
  `npm run palette` same as the other tokens; do not hand-edit
  `web/tokens.css`.

## Open questions for Ricky

1. **When to schedule the colour palette rework** — queued, unscheduled.
   Green/pink were a first pass through the gate, not a final choice.
2. **Should `focusTime`/`outOfOffice` take the hero when nothing else is
   live?** Still open, unchanged across several handoffs.
3. **Where does "tomorrow's first event" belong** — unchanged; still reads
   "Nothing left today" at 5pm. (Now explicitly a Sprint 4 item.)
4. **What's actually causing the transport stalls, if not the cable?**
   Unchanged — still disputed, still no alternative theory offered.
5. **Does the personal-event-claiming rule need the "work block time is
   priority" merge behavior**, or is unlock-only enough? Only a real case
   will really answer this.
