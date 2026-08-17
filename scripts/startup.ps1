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
  [ValidateSet('install', 'uninstall', 'status', 'logs')]
  [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'

$TaskName = 'Peripheral'
$Repo     = Split-Path -Parent $PSScriptRoot
$LogPath  = Join-Path $env:LOCALAPPDATA 'Peripheral\daemon.log'

function Get-PeripheralTask {
  Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
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

    Write-Host "registered '$TaskName'" -ForegroundColor Green
    Write-Host "  runs      wscript.exe hidden.vbs -> run-daemon.cmd -> node src\daemon.js"
    Write-Host "  as        $env:USERDOMAIN\$env:USERNAME (interactive, not elevated)"
    Write-Host "  at        logon + 30s"
    Write-Host "  log       $LogPath"
    Write-Host ""
    Write-Host "Not started yet. Start it now with:" -ForegroundColor Yellow
    Write-Host "  Start-ScheduledTask -TaskName $TaskName"
    Write-Host ""
    Write-Host "VERIFY BY EYE, not by exit code: a running task proves the process" -ForegroundColor Yellow
    Write-Host "started, never that the panel lit up. Look at the glass."
  }

  'uninstall' {
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
    $proc = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
      Where-Object { $_.CommandLine -like '*src\daemon.js*' }
    if ($proc) {
      Write-Host "  process      pid $($proc.ProcessId) -- running" -ForegroundColor Green
    } else {
      Write-Host "  process      not running -- the panel is on its vendor logo" -ForegroundColor Yellow
    }
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
