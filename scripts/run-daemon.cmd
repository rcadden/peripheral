@echo off
REM run-daemon.cmd — the actual daemon invocation, in one place.
REM
REM Split out of hidden.vbs so the command line is editable without touching
REM VBS quoting rules, and so it can be run by hand to reproduce exactly what
REM the logon task does:
REM
REM   scripts\run-daemon.cmd
REM
REM cwd is set by the caller (hidden.vbs, or you). Everything below assumes the
REM repo root.

echo.
echo ================================================================
echo [startup] %DATE% %TIME% — starting Peripheral daemon
echo ================================================================

REM --env-file-if-exists is what supplies GOOGLE_CLIENT_ID/SECRET and
REM PLAYWRIGHT_BROWSERS_PATH. Node >= 22.9. Missing .env is not an error: the
REM daemon still serves the pane and pushes frames, it just has no calendar.
node --env-file-if-exists=.env src\daemon.js

REM Capture BEFORE the echo. `echo` succeeds, and succeeding is exactly what
REM resets %ERRORLEVEL% to 0 -- so reporting the exit code destroys the exit
REM code. cmd then returns 0 for a daemon that crashed, hidden.vbs propagates
REM that 0, and the task's restart-on-failure never fires. The whole
REM supervision chain is only as honest as this one variable.
set "RC=%ERRORLEVEL%"

echo [startup] %DATE% %TIME% — daemon exited with code %RC%

REM `exit /b` and not a bare fall-through: without it cmd exits with the code
REM of the last command it ran, which is the echo above.
exit /b %RC%
