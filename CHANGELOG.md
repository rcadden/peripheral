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

- **Work calendar access resolved in principle — the work account is now the
  primary** (2026-08-17). Supersedes the original design of personal-as-primary
  with two tokens merged in-app.
  - Route 2 (native sharing, work → personal) was **tested and is blocked** by
    Balcom. Marked dead in `CLAUDE.md`; not to be retried.
  - Personal *is* natively shared **into** the work calendar, by email, with full
    event details and in real time. Outbound sharing from Balcom is blocked;
    inbound is not. So the merge happens inside the work account.
  - Therefore route 1 — one OAuth token against Balcom — yields both halves with
    Google doing the merge server-side. One token, one refresh path, no
    client-side reconciliation.
  - Recorded explicitly: **route 2's failure does not predict route 1's.**
    External sharing restrictions and third-party app access are separate
    Workspace Admin controls. Also recorded: the OAuth client does not need to
    live in the Balcom org — create it in a personal Cloud project and authorise
    the work account against it.
- `ApiProvider` now takes a `calendars` map (`calendarId → display label`)
  instead of a bare `calendarIds` array, and gains `labelFor()`. A single account
  can now serve several display labels, which single-account merging requires —
  every event would otherwise be tagged `work`. `PeripheralEvent.calendar` is
  documented as a display label, never inferred from the account. Unmapped ids
  fall back to the account name.
- `SharedProvider` removed from the `gcal.js` interface plan, with the reason
  recorded inline so it is not reintroduced.
- `collect()` documentation now notes the consequence of the single-provider
  case: partial failure largely disappears and total failure gets *more* likely,
  since one revoked work token loses work and personal together. That is the
  accepted cost of one token, and it upgrades the daemon's last-good-state cache
  from nice-to-have to mandatory.

- **OAuth flow and token store** — `src/auth/`, ready to run the moment a client
  ID exists. Zero new dependencies.
  - `src/auth/oauth.js` — Google desktop-app flow: loopback redirect on an
    ephemeral 127.0.0.1 port, PKCE S256, `state` CSRF check, `access_type=offline`
    and `prompt=consent` so a refresh token is reliably returned. `OAuthClient`
    refreshes transparently with a 5-minute margin, collapses concurrent
    refreshes into one call, and retries once on a mid-flight 401.
  - `src/auth/tokens.js` — atomic token store (temp file + rename, mode 0600).
    Merging never drops an existing `refresh_token`, because Google omits it on
    refresh responses and a naive spread would force a full re-consent. Refuses
    to persist a token with no refresh token at all. `describe()` returns a
    safe-to-log summary containing no token material.
  - `src/auth/login.js` — `npm run auth`, plus `--status`, `--logout <account>`,
    `--force`. On success it lists every visible calendar with its real id and
    `accessRole`, and emits a paste-ready `calendars` map for `ApiProvider`.
  - **Read-only enforced structurally.** `requestedScopes()` validates against a
    scope allowlist and throws on anything that could write, so no later edit
    quietly widens access (project_goals.md principle 2).
- `npm run auth` script, using Node's built-in `--env-file-if-exists=.env` — no
  dotenv dependency. Needs Node ≥ 22.9 for that flag; local is 24.13.1.

### Fixed
- **The token store must not live in the repo.** `.gitignore` listed `tokens/`
  and `*.token.json`, implying in-repo storage — but this repo is inside
  OneDrive, so a Balcom refresh token written there would be uploaded to
  Microsoft. Gitignore stops git, not OneDrive. The store now defaults to
  `%LOCALAPPDATA%\Peripheral\tokens.json`, outside both the repo and sync scope,
  overridable via `PERIPHERAL_TOKEN_PATH`. The gitignore rules stay as a second
  line of defence. Directly serves project_goals.md principle 4.
- **Loopback callback crashed on a second request.** The handler read
  `server.address().port`, which returns `null` once the server is closing, and
  browsers routinely send a follow-up request (favicon, or a reload) down the
  same keep-alive socket. That threw inside the handler and would have taken down
  `npm run auth` *after* consent already succeeded — the worst possible timing,
  since the token was already granted. The port is now captured once at listen
  time, a `settled` flag makes later requests inert (204), responses set
  `connection: close`, and shutdown drops keep-alive sockets so the process
  exits. Caught by testing the favicon case rather than by reading the code.

- **Hardware arrived and was probed, 2026-08-17** — a day early. Enumerates
  cleanly at `0416:5302`. Nothing written to the device.
  - **The JPEG-over-HID assumption is confirmed.** Frame channel is interface 0,
    endpoint `0x82` OUT INTERRUPT, **512-byte packets**; endpoint `0x83` IN
    INTERRUPT carries 8-byte packets, presumably status. HID usage is vendor
    defined (`0xff06` / `0x0001`), and both manufacturer and product strings read
    `USBDISPLAY`.
  - **Interface 1 is a decoy.** Windows binds WinUSB to a second vendor-specific
    interface and labels it `USBDISPLAY`, which initially looked like the real
    frame path. It has **zero endpoints** and cannot carry data. Recorded in
    `hid.js` so it isn't chased again.
  - The 512-byte packet size sets the chunk size: a 1280×480 JPEG at ~50–150KB is
    ~100–300 writes per frame, unremarkable at 1 fps.
  - `node-hid` is therefore the right binding, and the runtime decision holds.
  - Probe dependencies were installed to a scratch directory **outside OneDrive**
    rather than into the repo, per the sync-lock lesson. The repo is still a bare
    clone with no `node_modules`.

- **FIRST LIGHT, 2026-08-17.** A rendered 1280×480 JPEG is on the glass. The
  full chain works: build frame → HID → panel.
  - Type 2 wire protocol implemented in `src/transport/hid.js` from the protocol
    reference rather than guessed. Handshake returns `PM=128 SUB=1` with a valid
    serial — the reference's documented signature for a 1280×480 Trofeo Vision,
    so the panel identified itself rather than being assumed.
  - Verified on the glass by eye: full 1280 width arrives, RGB channel order is
    correct, geometry is right.
  - `npm run send -- <file.jpg>` added as the standing transport debug tool, and
    `docs/first-light.jpg` as a test frame with inward-pointing corner brackets,
    edge labels and RGB swatches, so orientation and channel order are checkable
    at a glance.
- **The panel's idle timeout is ~3 seconds** — measured, not assumed, with the
  new `npm run idle-test`. The firmware discards the pushed frame and reverts to
  its boot logo about 3s after the last frame received. **Holding the USB handle
  open does not preserve the image; only a new frame does.**
  - Three phases separated the causes in one run: one frame then silence with the
    handle open reverted at ~3s; 1 fps for 15s stayed rock steady; and after the
    final frame the image survived ~2s past the handle close rather than dropping
    instantly. That last phase is what rules out handle-close as the trigger.
  - `project_goals.md` principle 3 amended from "never render blank" to **"never
    render blank — and never *stop* rendering."** An idle daemon is a blank
    panel; there is no "content unchanged, skip this frame" optimisation.
  - Forces the daemon's architecture: **push loop and render loop must be
    separate.** Push runs unconditionally at 1 fps shipping the most recent frame
    available; render updates that frame whenever it can. A screenshot that hangs
    must not be able to stall the push.
  - `IDLE_TIMEOUT_MS` and `KEEPALIVE_INTERVAL_MS` exported from `hid.js` with the
    measurement recorded beside them.
- **Moved out of OneDrive to `C:\dev\peripheral`, and given a git remote**
  (2026-08-17).
  - **The repo had no remote at all.** OneDrive was the only copy of the entire
    project. File history is not version control, and a sync client replicates
    deletions faithfully. Now pushed to a **private**
    `github.com/rcadden/peripheral` (`dev` and `main`), to go public in Sprint 3.
  - The project had accumulated one workaround per artifact to survive a synced
    folder: tokens redirected to `%LOCALAPPDATA%`, Playwright to `C:\dev`, and a
    `frames/` directory that at 1 fps would have written **86,400 files a day**
    into sync scope. Every fix was correct and the list kept growing. Moving the
    working copy retired the class instead of the instances.
  - `.env` — which will hold `GOOGLE_CLIENT_SECRET` — is outside sync scope as a
    side effect.
  - Verified after the move and before anything was removed: both branches
    present, history identical, dependencies reinstalled, and a frame pushed to
    the real panel from the new location (`PM=128 SUB=1`, accepted in 22ms).
  - Packaging into a single app was considered and **deferred to Sprint 3**,
    where it already belongs as a distribution concern. It solves none of the
    above: Playwright's Chromium cannot meaningfully be bundled, `node-hid` needs
    unpacking to load, tokens still need a writable data dir, and a build step
    works against the project's "runs on a bare clone" property. Running at
    startup is a Task Scheduler entry and needs no packaging at all.

### Known unknowns
- **Whether Balcom permits third-party OAuth app access.** The entire calendar
  plan rests on this one untested assumption. If it is blocked, the only
  remaining route is ICS, which refreshes every 8–24h and reduces the countdown
  from a number to a rough indicator.
- Real `calendarId` values. A shared-in calendar's id is usually the sharer's
  address, but imported and secondary calendars use opaque ids. Enumerate with
  `calendarList.list` once a token exists; do not hardcode.
- **The panel's handshake and frame header.** Endpoint geometry is now measured,
  but the handshake sequence, the frame header's length/checksum layout, and
  malformed-frame recovery behaviour are still unknown. These must be read off
  the protocol reference, not guessed — the panel has a 19% one-star failure rate
  and fuzzing it is how it becomes a paperweight.

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
