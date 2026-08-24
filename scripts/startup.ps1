<#
.SYNOPSIS
  Register, remove or inspect the Peripheral run-at-logon task.

.DESCRIPTION
  Peripheral is an ambient display. It is only ambient if it is already there
  when you sit down -- a panel you have to remember to start is a panel that
  spends most of its life showing a vendor logo. This registers a per-user
  logon task so the daemon comes up with the desktop.

  NO ADMIN REQUIRED, deliberately. The task runs as the current interactive
  user with the current user's rights. Nothing here needs elevation, and a
  personal calendar daemon has no business asking for it.

  The console window is suppressed via scripts\hidden.vbs -- see the comment
  block in that file for why that specific mechanism and not the obvious ones.
  Output goes to %LOCALAPPDATA%\Peripheral\daemon.log, rotated at 5MB.

.PARAMETER Action
  install | uninstall | status | logs

.EXAMPLE
  npm run startup:install
  npm run startup:status
  npm run startup:logs
#>

[CmdletBinding()]
param(
  [ValidateSet('install', 'uninstall', 'status', 'logs', 'watchdog-logs', 'watchdog-run')]
  [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'

$TaskName = 'Peripheral'
$WatchName = 'Peripheral Watchdog'
$Repo     = Split-Path -Parent $PSScriptRoot
$LogPath  = Join-Path $env:LOCALAPPDATA 'Peripheral\daemon.log'
$WatchLog = Join-Path $env:LOCALAPPDATA 'Peripheral\watchdog.log'

function Get-PeripheralTask {
  Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
}

function Get-WatchdogTask {
  Get-ScheduledTask -TaskName $WatchName -ErrorAction SilentlyContinue
}

function Get-DaemonProcess {
  # Filtered on the command line and not the image name. The daemon runs as
  # `node src\daemon.js`, so a filter on "peripheral" matches nothing -- a
  # check that cannot return a hit is worse than no check, because it reports
  # a confident absence. (Learned the hard way on 2026-08-24, mid-diagnosis.)
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like '*src\daemon.js*' }
}

switch ($Action) {

  'install' {
    # Fail loudly and early rather than registering a task that can only ever
    # fail at logon, where nobody is watching the output.
    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $node) { throw "node is not on PATH -- the logon task would fail silently." }

    $vbs = Join-Path $PSScriptRoot 'hidden.vbs'
    foreach ($f in @($vbs, (Join-Path $PSScriptRoot 'run-daemon.cmd'), (Join-Path $Repo 'src\daemon.js'))) {
      if (-not (Test-Path $f)) { throw "missing $f" }
    }

    # NOT $action: PowerShell variables are case-insensitive, so that name
    # collides with the $Action parameter and fails ValidateSet on assignment.
    $taskAction = New-ScheduledTaskAction `
      -Execute 'wscript.exe' `
      -Argument ('"{0}" "{1}"' -f $vbs, $Repo) `
      -WorkingDirectory $Repo

    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    # The panel is USB-powered by this PC and the network may still be
    # negotiating at logon. 30s costs nothing and avoids a first refresh that
    # is guaranteed to fail.
    $trigger.Delay = 'PT30S'

    $settings = New-ScheduledTaskSettingsSet `
      -AllowStartIfOnBatteries `
      -DontStopIfGoingOnBatteries `
      -DontStopOnIdleEnd `
      -RestartCount 3 `
      -RestartInterval (New-TimeSpan -Minutes 1) `
      -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
      -MultipleInstances IgnoreNew
    # ExecutionTimeLimit 0 = never. The default is 3 days, after which Windows
    # would kill a daemon that is working perfectly, and the panel would revert
    # to its logo with nothing in the log to explain it.

    $principal = New-ScheduledTaskPrincipal `
      -UserId "$env:USERDOMAIN\$env:USERNAME" `
      -LogonType Interactive `
      -RunLevel Limited

    Register-ScheduledTask -TaskName $TaskName -Action $taskAction -Trigger $trigger `
      -Settings $settings -Principal $principal -Force `
      -Description ("Peripheral - ambient agenda daemon for the Trofeo Vision USB panel. Repo: $Repo") | Out-Null

    # ---- the watchdog -------------------------------------------------------
    # RestartOnFailure above only fires on a non-zero exit code, which requires
    # the daemon to survive long enough to produce one. On 2026-08-24 it did
    # not: it vanished at 07:47:16 leaving no fatal line, no crash record and
    # no evidence at all, and the panel sat on its logo for 31 minutes. This
    # second task asks the opposite question -- not "did it report a failure"
    # but "is it answering right now" -- which is the only one that has an
    # answer when the process is already gone.
    $watchVbs = Join-Path $PSScriptRoot 'watchdog.vbs'
    if (-not (Test-Path $watchVbs)) { throw "missing $watchVbs" }

    $watchAction = New-ScheduledTaskAction `
      -Execute 'wscript.exe' `
      -Argument ('"{0}" "{1}"' -f $watchVbs, $Repo) `
      -WorkingDirectory $Repo

    # Two triggers. The repeating one is the actual supervision; the logon one
    # exists so a machine that boots straight into a broken daemon does not
    # wait out the first interval before anything looks at it.
    $watchTriggers = @()

    $repeat = New-ScheduledTaskTrigger -Once -At (Get-Date) `
      -RepetitionInterval (New-TimeSpan -Minutes 5)
    $watchTriggers += $repeat

    $watchLogon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    # Later than the daemon's own 30s so a normal logon is never mistaken for
    # a dead daemon and restarted while it is still opening Chromium.
    $watchLogon.Delay = 'PT3M'
    $watchTriggers += $watchLogon

    $watchSettings = New-ScheduledTaskSettingsSet `
      -AllowStartIfOnBatteries `
      -DontStopIfGoingOnBatteries `
      -DontStopOnIdleEnd `
      -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
      -MultipleInstances IgnoreNew
    # IgnoreNew matters here: one run can take ~90s between probe retries and
    # the post-restart settle, and overlapping watchdogs would fight over the
    # same task.

    Register-ScheduledTask -TaskName $WatchName -Action $watchAction -Trigger $watchTriggers `
      -Settings $watchSettings -Principal $principal -Force `
      -Description ("Peripheral watchdog - restarts the daemon when /api/health stops answering.") | Out-Null

    Write-Host "registered '$TaskName'" -ForegroundColor Green
    Write-Host "  runs      wscript.exe hidden.vbs -> run-daemon.cmd -> node src\daemon.js"
    Write-Host "  as        $env:USERDOMAIN\$env:USERNAME (interactive, not elevated)"
    Write-Host "  at        logon + 30s"
    Write-Host "  log       $LogPath"
    Write-Host ""
    Write-Host "registered '$WatchName'" -ForegroundColor Green
    Write-Host "  runs      wscript.exe watchdog.vbs -> GET /api/health"
    Write-Host "  at        every 5 min, and logon + 3m"
    Write-Host "  log       $WatchLog"
    Write-Host ""
    Write-Host "Not started yet. Start it now with:" -ForegroundColor Yellow
    Write-Host "  Start-ScheduledTask -TaskName $TaskName"
    Write-Host ""
    Write-Host "VERIFY BY EYE, not by exit code: a running task proves the process" -ForegroundColor Yellow
    Write-Host "started, never that the panel lit up. Look at the glass."
  }

  'uninstall' {
    # Watchdog first, deliberately. Removing the daemon task while the watchdog
    # is still armed means the next tick finds nothing answering and tries to
    # restart a task that no longer exists.
    if (Get-WatchdogTask) {
      Stop-ScheduledTask  -TaskName $WatchName -ErrorAction SilentlyContinue
      Unregister-ScheduledTask -TaskName $WatchName -Confirm:$false
      Write-Host "removed '$WatchName'" -ForegroundColor Green
    } else {
      Write-Host "'$WatchName' is not registered -- nothing to do."
    }

    if (Get-PeripheralTask) {
      Stop-ScheduledTask  -TaskName $TaskName -ErrorAction SilentlyContinue
      Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
      Write-Host "removed '$TaskName'" -ForegroundColor Green
    } else {
      Write-Host "'$TaskName' is not registered -- nothing to do."
    }
  }

  'status' {
    $task = Get-PeripheralTask
    if (-not $task) {
      Write-Host "'$TaskName' is not registered."
      Write-Host "  install with: npm run startup:install"
      break
    }
    $info = Get-ScheduledTaskInfo -TaskName $TaskName
    Write-Host "'$TaskName'"
    Write-Host "  state        $($task.State)"
    Write-Host "  last run     $($info.LastRunTime)"
    Write-Host "  last result  $($info.LastTaskResult)  (0 = ok, 267009 = currently running)"
    Write-Host "  next run     $($info.NextRunTime)"
    Write-Host "  log          $(if (Test-Path $LogPath) { $LogPath } else { '(none yet)' })"
    # A live daemon is the only thing that keeps the panel off its logo, so
    # report the process too -- a task can be 'Ready' with nothing running.
    $proc = Get-DaemonProcess
    if ($proc) {
      Write-Host "  process      pid $($proc.ProcessId) -- running" -ForegroundColor Green
    } else {
      Write-Host "  process      not running -- the panel is on its vendor logo" -ForegroundColor Yellow
    }

    # Since 2026-08-24 the task is expected to sit in 'Running' for as long as
    # the daemon lives: hidden.vbs waits, so the task instance IS the daemon's
    # lifetime. A 'Ready' task with a live process means an old detached
    # hidden.vbs is still in play and nothing is supervising it.
    if ($task.State -ne 'Running' -and $proc) {
      Write-Host "  WARNING      task is '$($task.State)' but the daemon is alive --" -ForegroundColor Yellow
      Write-Host "               it was started outside the task, so restart-on-failure" -ForegroundColor Yellow
      Write-Host "               is not watching it. Restart via the task to fix." -ForegroundColor Yellow
    }

    $watch = Get-WatchdogTask
    Write-Host ""
    if (-not $watch) {
      Write-Host "'$WatchName' is not registered -- nothing will restart a dead daemon." -ForegroundColor Yellow
      Write-Host "  install with: npm run startup:install"
    } else {
      $winfo = Get-ScheduledTaskInfo -TaskName $WatchName
      Write-Host "'$WatchName'"
      Write-Host "  state        $($watch.State)"
      Write-Host "  last run     $($winfo.LastRunTime)"
      Write-Host "  last result  $($winfo.LastTaskResult)"
      Write-Host "  next run     $($winfo.NextRunTime)"
      if (Test-Path $WatchLog) {
        Write-Host "  last check   $((Get-Content $WatchLog -Tail 1 -Encoding UTF8))"
      } else {
        Write-Host "  last check   (no watchdog.log yet -- it has never run)" -ForegroundColor Yellow
      }
    }
  }

  'watchdog-logs' {
    if (-not (Test-Path $WatchLog)) {
      Write-Host "no watchdog log yet at $WatchLog"
      break
    }
    Get-Content $WatchLog -Tail 60 -Encoding UTF8
  }

  'watchdog-run' {
    # Fault injection, not a simulation. This runs the real recovery path --
    # schtasks /end, the orphan sweep, schtasks /run -- against the real
    # daemon, because a recovery path that cannot be triggered on demand is
    # one that stays unverified until the night it is needed.
    Write-Host "forcing a watchdog restart of '$TaskName' -- the panel will blink." -ForegroundColor Yellow
    $vbs = Join-Path $PSScriptRoot 'watchdog.vbs'
    & cscript.exe //nologo $vbs $Repo --force
    Write-Host ""
    Get-Content $WatchLog -Tail 10 -Encoding UTF8
  }

  'logs' {
    if (-not (Test-Path $LogPath)) {
      Write-Host "no log yet at $LogPath"
      break
    }
    # -Encoding UTF8: node writes UTF-8, Windows PowerShell reads ANSI by
    # default, and every em-dash in the daemon's output arrives as mojibake.
    Get-Content $LogPath -Tail 60 -Encoding UTF8
  }
}
