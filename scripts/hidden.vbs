' hidden.vbs — start the Peripheral daemon with no console window.
'
' WHY A VBS FILE IN 2026
' ─────────────────────────────────────────────────────────────────────────
' A logon-triggered scheduled task running as the interactive user gets a
' console window. `node.exe` has no flag to suppress it, and the usual
' alternatives each cost something:
'
'   powershell -WindowStyle Hidden   still flashes a window on every logon
'   task "run whether logged on or not"  runs in session 0 with no window, but
'                                   needs a stored password or the "log on as
'                                   a batch job" right — i.e. an admin
'   pythonw / start /b              same flash, plus a dependency
'
' WScript.Shell.Run with windowStyle 0 is the one that genuinely never draws
' anything and needs no elevation. It is boring and it has worked unchanged
' since Windows 2000.
'
' Output still goes to a log file, because a daemon you cannot see and cannot
' read is a daemon you cannot diagnose — and this project's standing rule is
' logs first, never guess.
'
' Usage (this is what scripts/startup.ps1 registers):
'   wscript.exe hidden.vbs "C:\dev\peripheral"

Option Explicit

Const HIDDEN = 0
Const WAIT_FOR_IT = True
Const MAX_LOG_BYTES = 5242880   ' 5MB

' Supervision budget. MIN_HEALTHY_SECONDS is what separates "it crashed" from
' "it cannot start": anything that dies inside a minute never got as far as
' pushing a frame.
Const MIN_HEALTHY_SECONDS = 60
Const MAX_FAST_FAILS      = 5
Const RELAUNCH_DELAY_MS   = 10000

Dim repo, logDir, logPath, sh, fso

If WScript.Arguments.Count < 1 Then
  WScript.Echo "usage: wscript hidden.vbs <repo-path>"
  WScript.Quit 1
End If

repo = WScript.Arguments(0)

Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

logDir  = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Peripheral"
logPath = logDir & "\daemon.log"

If Not fso.FolderExists(logDir) Then fso.CreateFolder logDir

' Rotate rather than grow without bound. At 1fps the heartbeat alone writes a
' line every 30s, so an un-rotated log is a slow disk leak on a machine that
' is meant to run this at every logon for months.
If fso.FileExists(logPath) Then
  If fso.GetFile(logPath).Size > MAX_LOG_BYTES Then
    If fso.FileExists(logPath & ".1") Then fso.DeleteFile logPath & ".1", True
    fso.MoveFile logPath, logPath & ".1"
  End If
End If

' Working directory matters: the daemon resolves web/ and .env relative to the
' repo root, and a scheduled task's default cwd is C:\Windows\System32.
sh.CurrentDirectory = repo

'
' WHY THIS WAITS, AND WHY THAT IS THE WHOLE POINT (2026-08-24)
' -----------------------------------------------------------------------
' This used to fire-and-forget. wscript.exe returned 0 about a second after
' logon, and Task Scheduler -- which watches THIS process, not node.exe --
' recorded "Ready, LastTaskResult 0" and stopped caring. The task carries
' RestartOnFailure 3x1min. It was bound to a process that always succeeded
' immediately, so it could never fire, and never had.
'
' The cost was measured on 2026-08-24: the daemon died at 07:47:16 and the
' panel sat on its vendor logo for 31 minutes with nothing watching. Every
' supervision guarantee written into daemon.js -- "a daemon that is dead must
' LOOK dead, so the task's restart-on-failure can fire" -- was true and
' useless, because the thing meant to be looking had already exited.
'
' Waiting makes wscript.exe a stand-in for the daemon's own lifetime: the task
' shows Running while the daemon runs, and its exit code becomes the task's
' result -- which is now honest, and is what npm run startup:status reports.
' The cost is one resident wscript.exe and one cmd.exe, which is the correct
' price.
'
' AND THE RESTART IS DONE HERE, NOT BY THE TASK (measured 2026-08-24)
' -----------------------------------------------------------------------
' The first version of this fix stopped at "wait and propagate", on the
' assumption that an honest non-zero result would let the task's
' RestartOnFailure 3x1min do the actual restarting. Tested, with the watchdog
' disabled so nothing else could take the credit: the daemon was killed at
' 08:33:14, the task result correctly became 4294967295, and two minutes later
' the task was still sitting at Ready with nothing restarted.
'
' Task Scheduler's restart-on-failure responds to a task that fails to LAUNCH,
' not to an action that returns non-zero. The setting is still registered
' because it costs nothing and covers the launch case, but it is not what
' brings the daemon back.
'
' So the loop below does it. A crash is relaunched in ~10s rather than waiting
' out a watchdog interval, and it needs no cooperation from Task Scheduler at
' all.
'
' Two things it deliberately does NOT do:
'   - resurrect a clean exit. Code 0 is the SIGINT/SIGTERM path in daemon.js,
'     which means somebody asked it to stop. Restarting that would make the
'     daemon impossible to stop by hand.
'   - spin on a daemon that cannot start. Five failures in under a minute each
'     means the fault is config, not luck -- a crash loop pushes nothing to the
'     panel and floods the log. It gives up and lets the watchdog retry on its
'     slow interval, which is the right cadence for "broken until a human
'     looks."
'
' A silent kill of this whole process tree leaves nothing here to do the
' relaunching, which is exactly the gap scripts/watchdog.vbs covers.
'
' The doubled quoting is cmd.exe's rule, not a typo: with /c, cmd strips the
' outermost pair, so paths containing spaces need their own quotes inside it.
Dim cmdLine, code, startedAt, uptime, fastFails

cmdLine = "cmd /c """"" & repo & "\scripts\run-daemon.cmd"" >> """ & logPath & """ 2>&1"""

fastFails = 0

Do
  startedAt = Now
  code = sh.Run(cmdLine, HIDDEN, WAIT_FOR_IT)
  uptime = DateDiff("s", startedAt, Now)

  ' Deliberate shutdown. Leave it down.
  If code = 0 Then Exit Do

  If uptime < MIN_HEALTHY_SECONDS Then
    fastFails = fastFails + 1
  Else
    ' It ran for a while before dying, so this is a fresh fault rather than a
    ' loop. Forgive the history -- a daemon that survives an hour and then
    ' crashes should get the same full budget of retries every time.
    fastFails = 0
  End If

  If fastFails >= MAX_FAST_FAILS Then
    Say "[startup] giving up after " & fastFails & " fast failures (last code " & _
        code & ") -- the watchdog will keep retrying every 5 min"
    Exit Do
  End If

  Say "[startup] daemon exited with code " & code & " after " & uptime & _
      "s -- relaunching in " & (RELAUNCH_DELAY_MS / 1000) & "s (fast failures: " & fastFails & ")"

  WScript.Sleep RELAUNCH_DELAY_MS
Loop

' Propagate rather than swallow. wscript's exit code IS the task's result, and
' a task result of 0 is a promise that the daemon shut down deliberately.
WScript.Quit code

' Append straight to the daemon log. Safe only here, between runs: cmd holds
' the file open for append while the daemon is alive, and two writers on one
' handle is how a log turns into confetti.
Sub Say(msg)
  Dim f
  On Error Resume Next
  Set f = fso.OpenTextFile(logPath, 8, True)
  If Err.Number <> 0 Then Exit Sub
  f.WriteLine msg
  f.Close
  On Error Goto 0
End Sub
