# Session handoff — 2026-08-18b (sixth session, continued)

**Supersedes [`session-handoff-2026-08-18.md`](session-handoff-2026-08-18.md),
which is kept for the record and must not be edited.** Written the same day,
hours later, because the roadmap was restructured after it was published and its
"what to do next" no longer matches the sprint numbering.

> **The technical facts have not changed.** The *Facts established the hard way*
> section of [`session-handoff-2026-08-18.md`](session-handoff-2026-08-18.md)
> is still complete and authoritative — read it. Nothing was learned about the
> hardware, the transport or Google after it was written. This file replaces
> only the plan.

Derived from `CHANGELOG.md`; if the two disagree, the changelog wins.

## What changed since the previous handoff

1. **The agenda time column was colliding with the title** — rows read
   `10:00 AMWeekly DS + Media` with no space. Found by Ricky on the glass;
   invisible to every metric. `10:00 AM` is 114.42px at the row's real 24px
   type, in a 104px column. Fixed by deleting the constant: `.events` owns the
   column as `max-content`, rows adopt it via `subgrid`.
   **Signed off on the glass: *"Reads correctly - much better."***
2. **The roadmap was split and renumbered.** See below.

## The sprint structure — renumbered 2026-08-18

Sprint 2 bundled agenda polish with a multi-pane system: two subsystems, eleven
mixed items, and two gates that could not be closed by working on them.

| Sprint | The question it answers | State |
|---|---|---|
| 1 — Foundation | Does the panel show his real day? | **Complete**, and now hardened |
| **2 — Agenda, second pass** | *Is the one pane right?* | **Current.** 1 build item, 3 decisions |
| 3 — The multi-pane system | Can the panel show more than one thing? | Not started |
| 4 — More panes | What else earns a pane? | Not started |
| 5 — Polish and release | Can someone else run this? | Not started. **Was Sprint 3** |

**Any reference written before 2026-08-18 to "Sprint 3 — Polish and release"
means today's Sprint 5.** The mapping table is at the top of
`directives/roadmap.md`. Historical references in the changelog and in earlier
handoffs were deliberately **not** edited.

**Sprint 2 had been nominally current for a day with zero completed items**,
because every session since Sprint 1 closed was spent hardening Sprint 1. It
opens now, for real.

## Where the project lives

| | |
|---|---|
| Repo | `C:\dev\peripheral` — deliberately NOT in OneDrive |
| Remote | `github.com/rcadden/peripheral` — private until the **release sprint (5)** |
| Branches | `dev` and `main`, both at the same commit |
| Token store | `%LOCALAPPDATA%\Peripheral\tokens.json` |
| State cache | `%LOCALAPPDATA%\Peripheral\last-state.json` |
| Daemon log | `%LOCALAPPDATA%\Peripheral\daemon.log` |
| Scheduled task | `Peripheral`, at task path `\` |
| Pane URL | `http://127.0.0.1:4780/panes/agenda/` |

## What works right now

| Command | What it does |
|---|---|
| `npm start` | Daemon: server + renderer + transport worker |
| `npm test` | **69 pass, 0 fail.** Scoped glob — never touches hardware |
| `npm run stall-test` | Fault-injects a wedged transport. Dry run, safe with the daemon live |
| `npm run idle-test` | Re-derives the ~3s forget window. **Drives real hardware for 68s** |
| `npm run probe` | Confirms Windows enumerates `0416:5302` |
| `npm run auth` | OAuth login. Not needed again unless the token is revoked |
| `npm run palette` | Regenerates `web/tokens.css` from the wallpaper |
| `npm run startup:status` / `:logs` | Task state and daemon log |

Panel is live under the scheduled task, ~29 pushes per 30s heartbeat, 0 failures.

## The next action

**Two decisions are waiting on Ricky, and one is overdue.** Neither needs code
first, and both are cheap:

1. **Re-decide the accent blue and the type scale.** Accepted *provisionally*
   2026-08-17 — *"closed, but not final"*. He has now read the panel across two
   days and spotted a spacing defect on it unaided, which is exactly the
   informed look the revisit was queued for. **This is the overdue one.**
2. **Overlap precedence beyond duration.** The roadmap has said "wants a
   conversation before code" since it was written and that conversation has not
   happened. Duration is one signal; the roadmap lists five more and warns
   explicitly against a rigid work-always-wins rule.

**If Ricky wants a build instead:** the **third "and then what?" column**
(Sprint 2) is the only fully-specified, unblocked build item in the current
sprint, and it aims straight at the North Star — *do I need to get through this
meeting, or is there another right behind it?* That question is currently
unanswerable from the panel.

## Then, in order

1. Third pane / "and then what?" column — Sprint 2's build item.
2. Colour-code entries by calendar — needs design work first; the palette
   contrast gate caps how many hues can clear their floors.
3. **Sprint 3: pane cycling, with weather as the proof.** Weather is in Sprint 3
   deliberately — cycling cannot be verified with one pane, and shipping the
   infrastructure with nothing to cycle to is untested infrastructure.

## Standing watch — do not treat these as tasks

Moved out of the sprints because no amount of work closes them. Full list at the
top of `directives/roadmap.md`.

- **The `travel` label has never rendered** — needs Ricky to have a trip.
- **`worstPush` drift.** A 2013ms push was seen 2026-08-18 on an idle machine
  (typical 200–630ms). Harmless alone; an upward trend over days is the cable
  signal. **Do not tune `SLOW_PUSH_MS` down to chase it.**
- **Panel hardware failure curve** — two events in two days, both consistent
  with the cable. **A third means replace the cable** before blaming the unit.
- **Cadence on a genuinely busy machine** — still only proven on a quiet PC.

## Open questions for Ricky

1. **The blue and the type scale** — see The next action. Overdue. A reversal is
   expected and is **not** a regression.
2. **Overlap precedence** — wants a conversation.
3. **Should `focusTime`/`outOfOffice` take the hero when nothing else is live?**
   Narrower than it was: the shortest-duration rule already stops a long block
   outranking a live short meeting.
4. **Where does "tomorrow's first event" belong** — its own pane, or inside the
   agenda pane? It currently reads "Nothing left today" at 5pm, which is true
   and unhelpful.
