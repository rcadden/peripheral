# Session handoff — 2026-08-24 (eleventh session — Sprint 6, opened by a failure)

**Supersedes [`session-handoff-2026-08-20.md`](session-handoff-2026-08-20.md).**
That file is kept for the record and is not edited. Everything in it and in the
handoffs before it still holds unless explicitly corrected here.

Derived from `CHANGELOG.md`, which is the source of truth for what happened. If
this file and the changelog ever disagree, **the changelog wins.**

---

## What changed since the previous handoff

**The panel was dark for 31 minutes and nobody found out until Ricky looked
up.** That is the whole session.

Sprint 5 closed on 08-20 with the repo public and the daemon apparently solid.
The next morning the first message was *"The screen is just on the logo - what
happened?"* The daemon had started at 06:50:16, run clean for 57 minutes, and
stopped at **07:47:16** mid-stream — the last line in `daemon.log` is an
ordinary healthy heartbeat. Nothing restarted it, for 31 minutes, until a
manual `schtasks /run`.

**The root cause was not in the daemon.** `scripts/hidden.vbs` launched it with
`WScript.Shell.Run`'s don't-wait flag, so `wscript.exe` exited 0 about a second
after logon. **Task Scheduler watches that process, not `node.exe`.** So the
task reported `Ready / LastTaskResult 0` for the entire hour the daemon ran
**and** for the half hour it was dead, and the `RestartOnFailure 3x1min` it
carried was bound to a process that always succeeded immediately. It could
never fire, and never had — since the task was first registered on 08-17.

Sprint 6 opened and closed the same day to fix it. See the roadmap.

---

## Where the project lives

| | |
|---|---|
| Repo | `C:\dev\peripheral` — deliberately NOT in OneDrive |
| Remote | `github.com/rcadden/peripheral` — **PUBLIC since 2026-08-20.** Every commit is public; history is not cleaned retroactively |
| Branches | `dev` and `main`, both at the same commit after this session's push |
| Token store | `%LOCALAPPDATA%\Peripheral\tokens.json` |
| State cache | `%LOCALAPPDATA%\Peripheral\last-state.json` |
| Weather cache | `%LOCALAPPDATA%\Peripheral\last-weather.json` |
| Daemon log | `%LOCALAPPDATA%\Peripheral\daemon.log` |
| **Watchdog log** | `%LOCALAPPDATA%\Peripheral\watchdog.log` — **new this session** |
| Scheduled tasks | **Two now:** `Peripheral` and `Peripheral Watchdog`, both at task path `\` |
| Pane URL | `http://127.0.0.1:4780/panes/agenda/` |

---

## What works right now

| Command | What it does |
|---|---|
| `npm start` | Daemon: server + renderer + transport worker + pane-file watcher |
| `npm test` | **110 pass, 0 fail.** Scoped glob — never touches hardware |
| `npm run palette` | Regenerates `web/tokens.css`, including the calendar accents |
| `npm run stall-test` | Fault-injects a wedged transport. Dry run, safe with the daemon live |
| `npm run idle-test` | Re-derives the ~3s forget window. **Drives real hardware for 68s** |
| `npm run probe` | Confirms Windows enumerates `0416:5302` |
| `npm run auth` | OAuth login. Not needed again unless the token is revoked |
| `npm run startup:status` | Task state, daemon process, **and watchdog state + last check** |
| `npm run startup:logs` | Tail the daemon log |
| **`npm run watchdog:logs`** | **New.** Tail the watchdog log — one line per 5-min check |
| **`npm run watchdog:test`** | **New.** Forces the real recovery path. **The panel will blink** |

Editing anything under `web/panes/` (or `web/tokens.css`) reloads the live pane
automatically within ~1s — watch for `[daemon] pane reloaded`. Editing
`daemon.js`, `render.js`, or anything outside `web/` still needs a real restart.

**Restarting the daemon changed this session.** The old snippet (kill the node
process, then `Start-ScheduledTask`) now leaves the task's own `wscript.exe`
running, and it will relaunch the daemon ~10s later on its own. Prefer:

```powershell
schtasks /end /tn "Peripheral"; Start-Sleep -Seconds 4; schtasks /run /tn "Peripheral"
```

`schtasks /end` terminates the whole task tree — `wscript`, `cmd` and `node`
together. This only became meaningful once `hidden.vbs` started waiting; before
that the task was never "running" and `/end` did nothing.

**The `Stop-Process -Force` caveat from 2026-08-19 still holds:** a forced kill
skips the daemon's graceful-shutdown handler (the one calling `panel.close()`).
No real-world consequence has ever been observed from it.

**Panel is live under the scheduled task, and Ricky confirmed it on the glass at
session close: "Glass checks out."**

---

## How the supervision works now — read this before changing any of it

Three layers, because each one covers a death the others cannot see.

| Layer | Covers | Time to recover |
|---|---|---|
| `hidden.vbs` relaunch loop | Daemon crashes with a non-zero exit code | **~10s** |
| `Peripheral Watchdog` task | Daemon gone, wedged, or lying — anything where `/api/health` stops answering | **up to ~5.5 min** |
| Task `RestartOnFailure` | Task fails to *launch*. **Not** a non-zero exit — measured | n/a |

**Do not assume `RestartOnFailure` does process supervision.** It was tested
directly on 08-24 with the watchdog disabled so nothing could take the credit:
daemon killed 08:33:14, task result correctly `4294967295`, and **two minutes
later the task was still `Ready` with nothing restarted.** Windows Task
Scheduler's restart-on-failure responds to a task that fails to launch, not to
an action that returns non-zero. The setting stays registered because it costs
nothing and does cover the launch case; it is not what brings the daemon back.

**The watchdog decides on `GET /api/health`, never on the log's mtime.** NTFS
defers last-write-time updates for open files, so a healthy daemon can look
stale and get killed on a schedule. The test run also produced the inverse — the
log read `0s old` while the daemon was dead, because the exit banner had just
been written to it. mtime is logged as context, never decided on.

**Two things the launcher deliberately refuses to do:** it never resurrects exit
code 0 (that is the `SIGINT`/`SIGTERM` path — resurrecting it would make the
daemon impossible to stop by hand), and it gives up after five failures inside a
minute each rather than crash-spinning, leaving the watchdog to retry slowly.

---

## The next action

**Nothing is blocked, and nothing needs Ricky to proceed.** Sprint 5 shipped;
Sprint 6 closed the same day it opened. The genuinely useful next thing is the
one buildable item sitting in Future Explorations:

**"Tomorrow's first event when today is done."** At 5pm the pane reads *"Nothing
left today,"* which is true and unhelpful. It was moved out of the shelved
Sprint 4 on 08-20 specifically because it never needed the multi-pane system —
it is a change to what the existing agenda pane shows, buildable in one session,
independent of everything that was cancelled.

**But check the panel's overnight behaviour first.** Read
`npm run watchdog:logs` before writing any code. That log did not exist before
this session, and its first unattended night is the only thing that will tell us
whether the supervision actually works when it matters.

---

## Then, in order

1. **Read `watchdog.log`.** A clean run of `ok` lines every 5 minutes means the
   supervisor is alive. A gap followed by `DEAD` / `recovered` means it earned
   its keep — record the date in the changelog either way.
2. **"Tomorrow's first event"** — the one buildable Future Exploration.
3. **Rotate the Google client secret.** Outstanding since 2026-08-20, when a
   `diff` printed it into a session transcript. Ricky deferred it to handle
   himself; it is still not done, and the repo is public now (the secret was
   never committed — the exposure was the transcript, not the repo).
4. **Open questions below**, none of which block anything.

---

## Facts established the hard way — do not re-derive

Everything in the previous handoffs still holds and is carried forward (not
repeated here). New this session:

- **A supervisor bound to the wrong process reports success the entire time it
  is failing.** The tell is the task's own state: if `Peripheral` is not sitting
  in `Running` for as long as the daemon lives, it is not watching the daemon.
  `npm run startup:status` now warns about exactly this.
- **`echo` resets `%ERRORLEVEL%` in cmd.** `run-daemon.cmd` reported the
  daemon's exit code with an echo, and the act of reporting it destroyed it — so
  `cmd` returned 0 for a crashed daemon and every layer above faithfully
  propagated the lie. Capture into a variable *before* logging, and `exit /b` it,
  or the script exits with the status of the echo.
- **Windows Task Scheduler's `RestartOnFailure` does not fire on a non-zero
  action exit code.** Measured, not assumed. See the table above.
- **NTFS defers last-write-time updates for open files**, which makes a log's
  mtime unsafe as a liveness signal in both directions.
- **`taskkill /im node.exe` would kill every unrelated node process on this
  machine** — MCP servers, npx helpers, several at any time. The watchdog's
  orphan sweep filters on the command line (`*src\daemon.js*`). So does
  `startup.ps1`. **Use that filter; do not invent a new one** — an ad-hoc filter
  on `*peripheral*` matches nothing, because the command line is `node
  --env-file-if-exists=.env src\daemon.js`.
- **The 2026-08-24 outage was NOT a panel event and must not be counted on the
  hardware failure curve.** The panel behaved exactly as designed — it forgets
  ~3s after the last frame, and there was no daemon sending frames. Before
  adding anything to that curve, confirm the daemon was actually alive and
  pushing at the time.
- **Ricky commits directly in GitHub's web UI between sessions.** This session's
  work was committed locally on top of a stale `dev`, and `origin/dev` turned
  out to carry a commit that wasn't local ("Change product link to affiliate
  link"). **Fetch and compare before committing, not just before pushing.**
  Resolve divergence by rebasing the local unpushed work onto `origin/dev` —
  never with `--force`, which here would have silently reverted a deliberate
  revenue-relevant change.

---

## Open questions for Ricky

1. **Is a worst-case ~5.5 minute dark panel acceptable?** That is the gap when
   the launcher cannot catch the death (a whole-tree kill — which is what
   08-24 looked like) and the 5-minute watchdog has to notice. Raised at
   session close; he did not ask for it to change, so it stays. Tunable in
   `startup.ps1`.
2. **What killed the daemon at 07:47:16?** Still unknown — no fatal line, no
   crash record, no reboot. Made survivable, not diagnosed. An Office
   Click-to-Run reconfigure landed at 07:49, ~2 min later; adjacent, unproven,
   and explicitly not claimed as cause.
3. **Should `focusTime`/`outOfOffice` take the hero when nothing else is live?**
   Still open, unchanged across several handoffs.
4. **Where does "tomorrow's first event" belong** — unchanged; still reads
   "Nothing left today" at 5pm. Now the top buildable item.
5. **What's actually causing the transport stalls, if not the cable?**
   Unchanged — still disputed, still no alternative theory offered.
6. **Does the personal-event-claiming rule need the "work block time is
   priority" merge behavior**, or is unlock-only enough? Only a real case will
   answer this.
