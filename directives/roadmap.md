# Peripheral — Roadmap

Sprints are thematic, not time-boxed. `- [x]` marks done; nothing is deleted.
**Bold** items are the critical path.

## Sprint 1 — Foundation
- [x] Identify the hardware and its actual interface (HID `0416:5302`, not a monitor)
- [x] Confirm which calendars are reachable from the personal Google account
- [x] Decide the runtime (Node, not Python — Python isn't installed)
- [x] Local server serving panes from `web/`, `/api/state` endpoint
- [x] Agenda pane rendering at true 1280×480 on mock data, live countdown
- [x] Wallpaper → palette extraction with a hard contrast gate
- [ ] **Resolve work-calendar access — route 1, 2, or 3 (see `CLAUDE.md`)**
- [ ] **Google OAuth: create desktop client, authorise both accounts, token store**
- [ ] **Real calendar data behind `/api/state`, two accounts merged**
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
