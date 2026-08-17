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
Const DONT_WAIT = False
Const MAX_LOG_BYTES = 5242880   ' 5MB

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

' The doubled quoting is cmd.exe's rule, not a typo: with /c, cmd strips the
' outermost pair, so paths containing spaces need their own quotes inside it.
sh.Run "cmd /c """"" & repo & "\scripts\run-daemon.cmd"" >> """ & logPath & """ 2>&1""", HIDDEN, DONT_WAIT
