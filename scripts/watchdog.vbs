' watchdog.vbs — restart Peripheral when the daemon stops proving it is alive.
'
' WHY THIS EXISTS (2026-08-24)
' ─────────────────────────────────────────────────────────────────────────
' hidden.vbs now waits, so the logon task's RestartOnFailure finally works.
' That covers exactly one shape of death: the daemon exits with a non-zero
' code, Task Scheduler notices, Task Scheduler restarts it.
'
' It does not cover the death that actually happened. On 2026-08-24 the daemon
' stopped at 07:47:16 with no `[daemon] fatal` line, no shutdown line, no WER
' crash record and no reboot — it took none of its own exit paths. A silent
' external kill produces no evidence at all, and an exit code that Windows may
' well report as deliberate. daemon.js's own guarantee — "a daemon that is dead
' must LOOK dead" — is about the process being honest. Nothing in it helps when
' the process is gone before it can say anything.
'
' So this checks the opposite way round: not "did it report a failure" but "is
' it currently answering." A daemon that cannot answer gets restarted, whatever
' the reason, whether it is absent, wedged, or lying.
'
' WHY /api/health AND NOT THE LOG'S TIMESTAMP
' ─────────────────────────────────────────────────────────────────────────
' The log's mtime was the obvious signal and is the wrong one to decide on.
' NTFS defers last-write-time updates for a file that is still open, so a
' perfectly healthy daemon can show a stale timestamp — which would make this
' script kill it on a schedule. (Measured on this machine the mtime does track
' the 30s heartbeat, so it is reported below as useful context. It is not what
' the decision is made on. A signal that is usually right is not a safe basis
' for something that kills a process.)
'
' /api/health is served by the daemon's MAIN thread, which makes it the right
' probe for a second reason: the push loop lives on a worker thread now, so a
' wedged main thread leaves the panel showing a frozen agenda while frames keep
' flowing. That reads as healthy from the glass and from the push counter. It
' does not read as healthy here.
'
' THREE STRIKES, NOT ONE
' ─────────────────────────────────────────────────────────────────────────
' One failed probe restarts nothing. The daemon does real work on its main
' thread — a Playwright capture, a calendar fetch — and a single 5s timeout is
' not proof of death. Three failures 10s apart is. The retries are inside one
' run so no state has to survive between runs.
'
' Usage — registered by scripts/startup.ps1 as the task "Peripheral Watchdog":
'   wscript.exe watchdog.vbs "C:\dev\peripheral"
'   wscript.exe watchdog.vbs "C:\dev\peripheral" --force
'
' --force skips the probe and restarts unconditionally. It is here because a
' recovery path that cannot be triggered on demand is a recovery path that
' stays unverified forever — the same reason idle-test and stall-test exist.

Option Explicit

Const HIDDEN       = 0
Const WAIT_FOR_IT  = True
Const MAX_LOG_BYTES = 1048576   ' 1MB - this log is one short line per check

Const PROBE_ATTEMPTS   = 3
Const PROBE_TIMEOUT_MS = 5000
Const PROBE_GAP_MS     = 10000
Const SETTLE_MS        = 25000  ' how long to give a restart before re-probing

Dim repo, force, port, sh, fso, logDir, wdLog, daemonLog

If WScript.Arguments.Count < 1 Then
  WScript.Echo "usage: wscript watchdog.vbs <repo-path> [--force]"
  WScript.Quit 1
End If

repo  = WScript.Arguments(0)
force = (WScript.Arguments.Count > 1 And LCase(WScript.Arguments(WScript.Arguments.Count - 1)) = "--force")

Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Same port the daemon defaults to, same override. Read from the environment
' rather than .env: this script has no business parsing a file that holds the
' Google client secret.
port = sh.ExpandEnvironmentStrings("%PERIPHERAL_PORT%")
If port = "%PERIPHERAL_PORT%" Or Len(Trim(port)) = 0 Then port = "4780"

logDir    = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Peripheral"
wdLog     = logDir & "\watchdog.log"
daemonLog = logDir & "\daemon.log"

If Not fso.FolderExists(logDir) Then fso.CreateFolder logDir
RotateLog wdLog

Main

Sub Main
  Dim ok, i, ageNote

  ageNote = LogAgeNote()

  If force Then
    Note "FORCE - restarting without probing (" & ageNote & ")"
  Else
    ok = False
    For i = 1 To PROBE_ATTEMPTS
      If Probe() Then
        ok = True
        Exit For
      End If
      If i < PROBE_ATTEMPTS Then WScript.Sleep PROBE_GAP_MS
    Next

    If ok Then
      ' One line per check, deliberately. A watchdog that only writes when it
      ' acts is indistinguishable from a watchdog that is not running — and
      ' "is the supervisor itself alive" is the exact question this whole
      ' file exists because nobody could answer.
      Note "ok - /api/health answered (" & ageNote & ")"
      Exit Sub
    End If

    Note "DEAD - /api/health failed " & PROBE_ATTEMPTS & " times over " & _
         ((PROBE_ATTEMPTS - 1) * PROBE_GAP_MS / 1000) & "s (" & ageNote & ")"
  End If

  Restart

  WScript.Sleep SETTLE_MS
  If Probe() Then
    Note "recovered - /api/health answering again"
  Else
    ' Not fatal and not retried harder: the next scheduled run is minutes away
    ' and will try again from scratch. Saying so plainly matters more than
    ' looping here, because this line is the evidence that the restart itself
    ' is not working and the fault is somewhere else.
    Note "STILL DEAD after restart - check daemon.log"
  End If
End Sub

' ── liveness ──────────────────────────────────────────────────────────────

Function Probe()
  Dim http
  Probe = False
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  If Err.Number <> 0 Then
    Note "probe unavailable: cannot create ServerXMLHTTP (" & Err.Description & ")"
    Err.Clear
    On Error Goto 0
    ' Fail SAFE, not open: an unusable probe must never be read as "dead" and
    ' trigger a restart loop against a daemon that is fine.
    Probe = True
    Exit Function
  End If

  ' resolve, connect, send, receive. ServerXMLHTTP and not XMLHTTP precisely
  ' because XMLHTTP cannot be given a receive timeout, and a probe that can
  ' hang forever is not a probe.
  http.setTimeouts PROBE_TIMEOUT_MS, PROBE_TIMEOUT_MS, PROBE_TIMEOUT_MS, PROBE_TIMEOUT_MS
  http.open "GET", "http://127.0.0.1:" & port & "/api/health", False
  http.send

  If Err.Number = 0 Then
    If http.status = 200 Then Probe = True
  End If
  Err.Clear
  On Error Goto 0
End Function

' ── recovery ──────────────────────────────────────────────────────────────

Sub Restart
  Dim rc

  ' /end terminates the task's whole process tree — wscript, cmd and node.
  ' This only became meaningful once hidden.vbs started waiting: before that
  ' the task was never "running", so there was no instance for /end to end.
  rc = sh.Run("cmd /c schtasks /end /tn ""Peripheral""", HIDDEN, WAIT_FOR_IT)
  Note "  schtasks /end -> " & rc

  WScript.Sleep 5000

  ' Belt and braces. An orphaned daemon still holds the HTTP port and the HID
  ' handle, so the replacement would fail to bind and fail to open the panel --
  ' a restart that produces two broken daemons instead of one.
  ' Filtered on the command line, never on the image name: `taskkill /im
  ' node.exe` would take out every unrelated node process on the machine.
  rc = sh.Run("powershell -NoProfile -ExecutionPolicy Bypass -Command """ & _
              "Get-CimInstance Win32_Process -Filter \""Name='node.exe'\"" | " & _
              "Where-Object { $_.CommandLine -like '*src\daemon.js*' } | " & _
              "ForEach-Object { Stop-Process -Id $_.ProcessId -Force }""", HIDDEN, WAIT_FOR_IT)
  Note "  orphan sweep -> " & rc

  rc = sh.Run("cmd /c schtasks /run /tn ""Peripheral""", HIDDEN, WAIT_FOR_IT)
  Note "  schtasks /run -> " & rc
End Sub

' ── logging ───────────────────────────────────────────────────────────────

Function LogAgeNote()
  Dim age
  If Not fso.FileExists(daemonLog) Then
    LogAgeNote = "no daemon.log"
    Exit Function
  End If
  age = DateDiff("s", fso.GetFile(daemonLog).DateLastModified, Now)
  LogAgeNote = "daemon.log " & age & "s old"
End Function

Sub Note(msg)
  Dim f
  On Error Resume Next
  Set f = fso.OpenTextFile(wdLog, 8, True)   ' 8 = append, True = create
  If Err.Number <> 0 Then Exit Sub
  f.WriteLine "[watchdog] " & Now & " " & msg
  f.Close
  On Error Goto 0
End Sub

Sub RotateLog(p)
  On Error Resume Next
  If fso.FileExists(p) Then
    If fso.GetFile(p).Size > MAX_LOG_BYTES Then
      If fso.FileExists(p & ".1") Then fso.DeleteFile p & ".1", True
      fso.MoveFile p, p & ".1"
    End If
  End If
  On Error Goto 0
End Sub
