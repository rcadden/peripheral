# Peripheral — Roadmap

Sprints are thematic, not time-boxed. `- [x]` marks done; nothing is deleted.
**Bold** items are the critical path.

## Sprint 1 — Foundation
- [x] Identify the hardware and its actual interface (HID `0416:5302`, not a monitor)
- [x] Confirm which calendars are reachable from the personal Google account
- [x] Decide the runtime — Node, not Python
      *(2026-08-17: the original reason recorded here, "Python isn't installed,"
      was wrong — Python 3.14.2 is installed and reachable via `py`. The
      decision stands on one language end to end plus native-binding risk on a
      very new CPython. See the dated correction in `CLAUDE.md`.)*
- [x] Local server serving panes from `web/`, `/api/state` endpoint
- [x] Agenda pane rendering at true 1280×480 on mock data, live countdown
- [x] Wallpaper → palette extraction with a hard contrast gate
- [x] Resolve work-calendar access — **decided: work account is the primary**
      *(2026-08-17: route 2, sharing work → personal, tested and BLOCKED by
      Balcom. But personal is already natively shared INTO work, so route 1 —
      one OAuth token against Balcom — gets both halves and Google merges them
      server-side. Route 2 is dead; do not retry. Route 3 (ICS) remains the
      fallback. Original plan was personal-as-primary with two merged tokens;
      superseded.)*
- [ ] **Verify Balcom permits third-party OAuth app access** — the one untested
      assumption the plan rests on. Separate Workspace control from the sharing
      restriction that killed route 2; do not infer it from that failure.
- [ ] **Google OAuth: create desktop client in a *personal* Cloud project,
      authorise the *work* account, token store**
- [ ] Enumerate real calendarIds via `calendarList.list`, map them to display
      labels (`work` / `personal`) — ids for shared-in calendars must be
      verified, not assumed
- [ ] **Real calendar data behind `/api/state`, single work account**
- [ ] Confirm Windows enumerates `0416:5302` on arrival (`npm run probe`)
- [ ] **HID transport: JPEG frame push at 1 fps**
- [ ] Playwright renderer: screenshot localhost → JPEG → transport
- [ ] Daemon: wire sources → state → render → push, with last-good-state cache
- [ ] Run on login (Task Scheduler), survive panel disconnect without dying

## Sprint 2 — More of life
- [ ] Pane cycling with per-pane dwell times
- [ ] Photos pane — **blocked pending verification.** Google restricted the
      Photos Library API; broad album read may no longer be available to
      third-party apps. Confirm current policy before designing. Fallbacks:
      Picker API session, or a synced local/Drive folder.
- [ ] Inbox pane — unread count and top senders, no message bodies on screen
- [ ] Weather pane
- [ ] Tomorrow's first event when today is done

## Sprint 3 — Polish and release
- [ ] `README` with photos of the thing actually running
- [ ] Public repo, MIT
- [ ] One-command setup for someone who owns the same $38 panel
- [ ] Second panel support (the 9.16" 1920×480 sibling is the same family)

## Future Explorations
- Touch input — the 6.86" is not a touchscreen, but the 8.8" class is. Would
  make tap-to-join-Meet possible.
- Now-playing pane (Spotify MCP already authorised in the workspace)
- n8n / workflow status pane
- Claude usage pane — the origin of the idea, and the one thing Ricky wanted
  least. Cheap to add once the pane system exists.
- Do-not-disturb takeover: full-bleed "IN A MEETING" when an event is live
