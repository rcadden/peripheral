# Changelog

All notable changes to Peripheral are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Nothing is deleted from this file. Corrections are appended with a date and the
superseded text is marked, never rewritten.

Nothing has been released yet — `0.1.0` is unpublished and the panel hardware
arrives **2026-08-18**. Everything below sits under Unreleased until the daemon
pushes a frame to real glass.

## [Unreleased]

### Added
- Project scaffold — `CLAUDE.md`, `README.md`, `directives/project_goals.md`,
  `directives/roadmap.md`, `.env.example` as the secrets contract.
- Dependency-free local server (`src/server.js`, `node:http`) serving panes from
  `web/` with a `/api/state` endpoint. Runs on a bare clone with no `npm i`.
- Agenda pane rendering at true 1280×480 on mock data, with a live countdown.
- Wallpaper → palette extraction (`src/palette.js`) with a hard contrast gate:
  hue is inherited, lightness is forced, and every token is vetoed if it fails
  its ratio against the ground (`--accent-*` ≥ 7:1, `--text-dim` ≥ 4.5:1,
  `--text-faint` ≥ 3:1). Generates `web/tokens.css` — never hand-edited.
- HID probe script (`npm run probe`) for confirming Windows enumerates
  `0416:5302` when the panel arrives.
- Provider-interface stub for calendar sources (`src/sources/gcal.js`) so all
  three work-calendar access routes drop in interchangeably.
- Deliberately unimplemented stubs, each carrying its blocker and the unknowns
  to resolve rather than guessed-at code: `src/transport/hid.js` (blocked on
  hardware; lists five wire-protocol unknowns to read off the reference
  implementations, not invent), `src/render.js` (blocked on `npm i` and the
  Playwright Chromium download, with the OneDrive `PLAYWRIGHT_BROWSERS_PATH`
  workaround noted inline), and `src/daemon.js`, which wires only what exists.
  `npm start` today gives a working localhost pane on mock data plus an honest
  report of what is missing.
- Cold-start session handoff at
  `docs/plans/session-handoff-2026-08-17.md` — ordered next actions, the
  hardware-arrival checklist, what is verified, and the open questions.
- This changelog, and a Keep a Changelog convention for the project.
- Standing rule in `CLAUDE.md` — **session-end ritual is changelog first, handoff
  derived from it.** Both documents previously wanted updating at session end and
  described overlapping ground, so whichever came second got skipped and the two
  drifted. One place to write, no contradictions surviving a cold start.

### Changed
- Runtime rationale corrected (2026-08-17). The stack table originally justified
  Node with *"Python is NOT installed."* That was wrong: Python 3.14.2 is
  installed with pip 25.3, reachable via `py`; only `uv` is genuinely absent.
  The decision to use Node stands, on these grounds instead — one language
  across daemon and panes, a dependency-free server that runs on a bare clone,
  and lower native-binding risk (`node-hid`) than fresh-CPython wheels. The same
  correction is appended in `directives/roadmap.md`.
- `CLAUDE.md` Status now states hardware arrives **tomorrow, 2026-08-18**, names
  `npm run probe` as the first action when it lands, and records that
  work-calendar access is the critical path and is *not* blocked on hardware —
  it can move today.

### Fixed
- Nothing yet.

## Decisions worth not relitigating

Recorded here so they survive a cold start. Full reasoning lives in `CLAUDE.md`.

- **The daemon screenshots its own localhost URL.** One renderer, two consumers:
  Playwright → HID panel, and any browser → design iteration and the fallback
  when the panel dies. The pane is never forked into a "panel version" and a
  "browser version."
- **The wallpaper is never a bitmap background.** Hue only. Its own dominant
  colours measured at brightness 0.72–0.84 and the type was unreadable.
- **The bundled TRCC software is never installed.** It is Windows-only and
  claims the device.
- **Read-only, everywhere.** `calendar.readonly`. Nothing writes, ever.
- **Fully local.** No Supabase, no Cloudflare, no n8n. The panel is USB-powered
  by this PC, so cloud hosting would buy nothing and would put a calendar token
  somewhere it doesn't need to be.

## Known hardware risk

The Thermalright Trofeo Vision LCD rates 3.7★ over 145 ratings with 19%
one-star, and a recurring pattern of flicker-then-permanent-death at 1–8 weeks.
The renderer is decoupled from the transport specifically so that a dead panel
costs a screen, not the project. Log failures here when they happen — the dates
matter for judging the failure curve.
