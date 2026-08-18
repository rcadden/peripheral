# Session handoff — 2026-08-18 (sixth session)

**Supersedes [`session-handoff-2026-08-17e.md`](session-handoff-2026-08-17e.md),
which is kept for the record and must not be edited.** Derived from
`CHANGELOG.md`; if the two ever disagree, the changelog wins.

## State of the world

**Sprint 1 held its first real overnight, and broke in a way that mattered.**
The first cold boot after the panel went live produced the failure the previous
handoff had only suspected: the daemon's "two independent loops" were one
thread, `node-hid`'s `write()` is synchronous, and a USB endpoint that stopped
draining pinned the whole process for tens of seconds at a time. The panel sat
on its vendor logo about 90% of the morning while every health signal read
green.

That is fixed. **The transport now runs on a worker thread and owns its own
push cadence**, the daemon reports a real stall as `panel=STALLED <n>s` instead
of `ok`, and `npm run stall-test` exercises every recovery branch with injected
faults so none of them ship unexecuted again.

Also this session: the OAuth token survived the night and refreshed unattended
(the previous handoff's one genuine unknown, now answered), the agenda's hero
rule was corrected for the second and final time, and a layout defect that no
metric could see was caught by Ricky looking at the panel.

**Sprint 2 is the current sprint.** Nothing in it was started.

## Where the project lives

| | |
|---|---|
| Repo | `C:\dev\peripheral` — deliberately NOT in OneDrive |
| Remote | `github.com/rcadden/peripheral` — private until Sprint 3 |
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
| `npm run stall-test` | **NEW.** Fault-injects a wedged transport. Dry run, safe with the daemon live |
| `npm run idle-test` | Re-derives the panel's ~3s forget window. **Drives real hardware for 68s** |
| `npm run probe` | Confirms Windows enumerates `0416:5302` |
| `npm run auth` | OAuth login. Not needed again unless the token is revoked |
| `npm run palette` | Regenerates `web/tokens.css` from the wallpaper |
| `npm run startup:status` / `:logs` | Task state and daemon log |

The panel is live under the scheduled task, pushing ~29 frames per 30s
heartbeat with 0 failures.

## The next action

**Nothing is blocked and nothing is urgent.** Sprint 1 is done and hardened;
Sprint 2 has not been started. Pick from `directives/roadmap.md`.

**Needs Ricky before code, not after:**
- **Overlap precedence** (Sprint 2) is explicitly marked *"wants a conversation
  before code"*. Duration now breaks ties, which is one signal — the roadmap
  lists five more (calendar, accepted vs invited, attendee count,
  focusTime/outOfOffice, duration) and warns against a rigid work-always-wins
  rule.
- **The blue and the type scale** are due their scheduled revisit. Both were
  accepted *provisionally* on 2026-08-17 and it has now been a day of real use.

## Then, in order

1. **Watch `worstPush` on a busy machine.** The one open question from this
   session's fix. `stall-test` proves the main thread survives a blocked
   transport; it does not prove the transport keeps cadence under load. Load the
   CPU, watch the heartbeat. This is now measurable only because `worstPush`
   exists — it did not before.
2. **Sprint 2, agenda second pass** — the third "and then what?" column is the
   highest-value item and is fully specified in the roadmap.
3. **See the `travel` label render once.** Still never observed.

## Facts established the hard way — do not re-derive

Everything in the previous handoffs still holds and is carried forward. New
this session:

- **`node-hid`'s `write()` is SYNCHRONOUS.** `push()` issues ~81 of them in a
  bare loop. Two `setInterval` timers on one thread are not two loops — a
  native call that never yields takes every turn. This is why the transport
  lives on a worker thread, and why the worker owns the push *cadence* and not
  merely the writes: if the interval had stayed on the main thread, a blocked
  main thread would still starve the panel.
- **The measurement that proves a blocked loop is `/api/state` latency.** It
  serves a cached object from `node:http` and should answer in under a
  millisecond. It measured **36,600ms** during the failure and **138ms**
  healthy. Process CPU was near-idle throughout — a thread blocked in the
  kernel burns nothing, so CPU tells you nothing.
- **A timeout is evidence about the waiter, not the awaited.** Five
  `page.screenshot: Timeout 2000ms` errors got a perfectly healthy Chromium
  torn down; Playwright's timer was on the blocked loop. The stall detector
  written in response to this **committed the same bug within the hour**,
  reporting a stall while the worker pushed fine because the main thread was
  launching Chromium and had not drained its messages. Any silence- or
  timeout-based health check must first establish that the observer was awake.
- **A single sample cannot measure a spike.** The worker completed a 4012ms
  push and a 4ms push before the main thread got a turn; `lastPush` read 4ms.
  Peaks must be recorded where every value is seen, not sampled on a timer.
  The heartbeat reports `worstPush`, drained per interval.
- **A measurement is only valid for the state it was taken in.** The `104px`
  agenda time column was vouched for by a real in-page measurement of "76.9px"
  — taken at **16px** type. At the 24px actually shipped the string is
  **114.42px**, and it overflowed into the title. Record type size, font and
  viewport alongside any layout number, and prefer deleting the constant
  (`max-content` + `subgrid`) to re-tuning it.
- **`max-content` on a row is not a column.** Each `<li>` is its own grid, so it
  resolves per row and misaligns the list. Shared geometry needs `subgrid`,
  which Playwright's Chromium does support — verified through `src/render.js`,
  not just the in-app browser.
- **Playwright's headless binary is `chrome-headless-shell.exe`**, not
  `chrome.exe` or `headless_shell.exe`. Two wrong guesses at that name produced
  a confident, false claim that Chromium had died. A failed lookup is not an
  absence: enumerate by `ExecutablePath -like '*ms-playwright*'`.
- **The internal-app OAuth token refreshes unattended and survives a reboot.**
  Confirmed 2026-08-18: `tokens.json` was rewritten five seconds after the
  logon-task daemon started. Internal apps having no 7-day expiry is now
  observation, not documentation.
- **`Atomics.wait` is the right way to simulate a stuck native call** — it
  blocks the thread synchronously and uninterruptibly. A `setTimeout` proves
  nothing, because yielding is the exact thing that was missing.
- **Ending-soonest was never the right hero rule.** It correlated with the
  right answer in the first case that motivated it and failed on the second
  real overlap. **Shortest duration wins**, ending-soonest breaks ties: a short
  sharply-bounded event is a commitment you are *in*, a long one is a container
  you are *inside of*.

## Open questions for Ricky

1. **Does the panel hold up when the PC is genuinely busy?** The original
   question behind the whole incident, still open. Today's evidence is a quiet
   machine.
2. **The blue and the type scale are due their revisit.** Accepted provisionally
   2026-08-17 — *"closed, but not final"*. It has now been a day of real use. A
   reversal is expected and is **not** a regression.
3. **Should `focusTime` and `outOfOffice` be able to take the hero slot?** Now
   partly moot: the duration rule demotes long blocks behind short meetings, so
   a two-hour focus block no longer outranks a live 30-minute meeting. But it
   can still take the hero when nothing else is live.
4. **Is the `travel` (TripIt) feed worth its row?** Still never rendered.
5. **Overlap precedence beyond duration** — see The next action. Wants a
   conversation.
6. **The panel disconnected on day 2.** Two hardware events in two days, both
   consistent with the cable rather than the unit. **If a third arrives,
   replace the USB-C cable before concluding anything about the panel.** The
   dated failure log is at the bottom of `CHANGELOG.md`.
