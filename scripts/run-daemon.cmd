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

echo [startup] %DATE% %TIME% — daemon exited with code %ERRORLEVEL%
