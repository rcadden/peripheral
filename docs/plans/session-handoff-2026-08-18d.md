# Session handoff — 2026-08-18d (eighth session)

**Supersedes [`session-handoff-2026-08-18c.md`](session-handoff-2026-08-18c.md),
which is kept for the record and must not be edited.** That file's technical
facts are still carried forward below; this one adds what changed this
session and replaces the plan.

Derived from `CHANGELOG.md`; if the two disagree, the changelog wins.

## What changed since the previous handoff

Two more rounds on Sprint 2's third pane (one driven by an actual photo of
the glass), and the *other* `NEEDS RICKY` item — overlap precedence — finally
got its conversation, built from Ricky's real calendar instead of guesswork.

1. **First physical-panel photo of the session found what browser checks
   couldn't.** List rows were truncating hard, and the wrapped-row bullets
   were visibly misaligned. Fixed: reclaimed unused gutter width, applied
   progressive disclosure (only the live/next rows wrap to 2 lines), fixed a
   `.tick`'s own `align-self` silently beating a row-level override, dropped
   all-day items after 10am and past events entirely, and found a real
   `is-next` highlighting bug (checking the wrong field) along the way.
2. **The meta line got redesigned twice more.** Calendar label dropped
   entirely ("obvious from the event name"); time now always gets its own
   line, location+conference+attendees combined below it. A second
   flex-column-stacking bug (bare `<span>`s becoming one-line-each) hit the
   "Free time" branch — same bug class as an earlier fix that didn't get
   generalized to every call site.
3. **Overlap precedence is built.** Ricky asked Claude to pull his real
   8-day calendar and read overlaps together rather than design from
   hypotheticals. Three rules shipped:
   - A named duration override for one recurring meeting (booked 60min,
     runs 30) — replaces its *displayed* end time too, not just eligibility.
   - Tiebreak changed: latest-start wins, not ending-soonest.
   - Personal-calendar events demoted by default, claimed by name/initials
     in the title OR a time-matching work-calendar block (±60min padding
     tolerance — a bare overlap check was tried first and was wrong, caught
     against real data before shipping).
   **Explicitly not settled** — Ricky expects ongoing tuning, both in the
   logic and in how he titles future calendar entries.
4. **Standing permission established: the in-app browser preview is
   glass-equivalent for verification**, per Ricky directly comparing it to
   the physical panel. This changes what counts as "seen" at the Step 0 gate
   going forward — see `[[verification-requires-the-real-device]]` in
   memory.

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
| `npm run stall-test` | Fault-injects a wedged transport. Dry run, safe with the daemon live |
| `npm run idle-test` | Re-derives the ~3s forget window. **Drives real hardware for 68s** |
| `npm run probe` | Confirms Windows enumerates `0416:5302` |
| `npm run auth` | OAuth login. Not needed again unless the token is revoked |
| `npm run palette` | Regenerates `web/tokens.css` from the wallpaper |
| `npm run startup:status` / `:logs` | Task state and daemon log |

Editing anything under `web/panes/` reloads the live pane automatically
within ~1s (watch the log for `[daemon] pane reloaded`). Editing `daemon.js`,
`render.js`, or anything outside `web/` still needs a real restart:

```powershell
$p = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*src\daemon.js*' }
if ($p) { Stop-Process -Id $p.ProcessId -Force }
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName Peripheral
```

Panel is live under the scheduled task.

## The next action

**One decision is still waiting on Ricky, and it's overdue:**

1. **Re-decide the accent blue and the type scale.** Accepted *provisionally*
   2026-08-17 — *"closed, but not final"*. Now well overdue — he's been
   looking at the panel daily for two days across multiple redesign rounds,
   including a physical photo. This is exactly the informed look the
   revisit was queued for.

**Overlap precedence is no longer waiting on a decision** — it shipped this
session — but it IS waiting on more real-world exposure. Watch for cases
where the personal-event-claiming rule gets something wrong (an unclaimed
event that should have shown, or a claimed one that shouldn't have) and
bring them back the same way this session's rules were built: as real
examples, not hypotheticals.

**If Ricky wants a build instead:** Sprint 2's remaining unblocked item is
**colour-code entries by calendar** — needs design work first (the palette's
contrast gate caps how many hues can clear their floors), but the `CALENDARS`
label/tint map already exists in `agenda.js` and is sitting unused, waiting
for exactly this.

**Separately, open and disputed:** what's actually causing the transport
stalls, if not the cable. Unchanged from the last two handoffs — still no
answer from Ricky, still not acted on.

## Then, in order

1. **The accent blue / type scale decision** — cheap, no code required, and
   overdue.
2. Colour-code entries by calendar — needs the design conversation first.
3. **Sprint 3: pane cycling, with weather as the proof.** Weather is in
   Sprint 3 deliberately — cycling cannot be verified with one pane.

## Facts established the hard way — do not re-derive

Everything in the previous handoffs still holds and is carried forward
(`session-handoff-2026-08-18.md`'s full list is not repeated here, nor is
`...18c.md`'s). New this session:

- **A child's own `align-self` silently beats a parent's `align-items`
  override.** `.tick` carried `align-self: center` from the single-line
  design; a row-level `align-items: start` added later did nothing for it
  specifically. Check every descendant for a conflicting `align-self`, not
  just the container, when overriding alignment for one state.
- **The same layout bug can hit twice in one session if a fix isn't
  generalized to every call site.** Bare `<span>`s with no wrapping element,
  inside a `display: flex; flex-direction: column` container, each become
  their own line. Fixed once for the "All day" branch; the "Free time"
  branch (written earlier, not revisited) hit the identical bug later the
  same session. When a container's display model changes, grep for every
  call site that writes into it.
- **A bare time-overlap check is too permissive for "is this a deliberate
  protective block."** A personal event and an unrelated 7-hour
  general-availability block ("Ricky GTD") technically overlap, but treating
  that as a deliberate pairing was wrong — caught by testing against real
  calendar data before shipping, not after. A ±60-minute padding tolerance
  on both boundaries distinguishes a travel-time-padded match from a block
  that merely contains the event.
- **A more "complete" implementation of a stated preference can be the wrong
  one if it breaks what already works.** The first cut of personal-event
  claiming adopted the matched work block's wider time window and removed
  the work event from candidacy — closer to Ricky's literal words ("the work
  block time is the priority"), but it broke existing regression tests
  modeling coincidental (non-deliberate) work/personal overlaps. The
  simpler "unlock only, don't merge" version gets the same real-world
  outcome via the existing duration rule, without the risk. Flagged to
  Ricky as an explicit known gap rather than silently chosen.
- **Ricky, 2026-08-18, comparing the in-app browser preview directly against
  the physical panel: "it looks identical to the glass. Use this moving
  forward to review/check your own work."** Standing permission — the
  browser preview counts as "seen," when actually looked at (not just
  DOM-measured). See `[[verification-requires-the-real-device]]` in memory
  for the full update.

## Open questions for Ricky

1. **The blue and the type scale** — still overdue, unchanged across three
   handoffs now.
2. **Should `focusTime`/`outOfOffice` take the hero when nothing else is
   live?** Unchanged, narrower than before the shortest-duration rule.
3. **Where does "tomorrow's first event" belong** — unchanged; still reads
   "Nothing left today" at 5pm.
4. **What's actually causing the transport stalls, if not the cable?**
   Unchanged from the last handoff — still disputed, still no alternative
   theory offered, still not acted on.
5. **NEW: does the personal-event-claiming rule need the "work block time is
   priority" merge behavior**, or is unlock-only enough? Only a real case
   will really answer this — watch for one rather than deciding in the
   abstract.
