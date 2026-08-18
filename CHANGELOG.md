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
- **The loop is closed — the live agenda pane renders on the panel** (2026-08-17).
  `npm start` now runs server → renderer → transport end to end. Measured over a
  30s run: **29 pushes, 0 failures, frame age 1s**, panel and renderer both
  healthy throughout.
  - `src/render.js` implemented — one long-lived Chromium and page, viewport
    1280×480 at `deviceScaleFactor: 1`, JPEG quality 92 (~63KB/frame).
    **33–37ms per capture** after a ~5.5s cold start.
  - `capture()` returns `null` instead of throwing, races a 2s timeout, and uses
    an explicit clip so a CSS change that makes the document taller can never
    silently ship a frame whose header lies about its geometry.
  - `waitUntil: 'load'`, not `networkidle` — the pane runs a 1s countdown timer,
    so the network never goes idle and `networkidle` would burn its full timeout
    on every navigation. Waits on `document.fonts.ready` instead, because a
    screenshot mid-font-swap ships the fallback face at this type size.
  - Pane-side `pageerror` and console errors are surfaced. A pane that throws
    still screenshots fine — it just screenshots *wrong*.
- **Daemon rebuilt around two independent loops** (2026-08-17). The push loop
  ships the current frame at a fixed 1 fps and **never awaits a render**; the
  render loop replaces that frame whenever it can.
  - This directly contradicts the design the file's own TODO carried — a single
    interval that captured and *then* pushed. That couples the panel staying lit
    to the renderer being fast, so a Chromium hiccup, font reflow or GC pause
    lands the frame after the ~3s timeout and the panel shows its vendor logo.
    The symptom would be intermittent flicker, which is miserable to diagnose
    after the fact.
  - A stale frame is a countdown a few seconds behind. A missed push is the
    vendor logo. Those are not close in cost.
  - Panel reconnects are fired off, not awaited — a physically absent panel can
    take seconds to fail to open, and blocking the push loop on that guarantees
    the logo on the way back. Re-entrancy guards stop a slow tick stacking.
  - Renderer rebuilds itself after 5 consecutive capture failures.
  - Shutdown closes Chromium explicitly; an orphaned browser outlives its parent.
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

- **The calendar half is written end to end** (2026-08-17). Everything from
  `events.list` to the panel now exists. **None of it has spoken to Google**,
  because the OAuth client still does not exist — see Known unknowns.
  - `ApiProvider.fetchToday()` implemented in `src/sources/gcal.js`.
    `singleEvents=true` + `orderBy=startTime` so a recurring standup expands to
    today's instance rather than arriving as one master event with an RRULE.
    Follows pagination. Cancelled events and declined invites are dropped.
  - **The query window is local midnight to local midnight with an explicit
    offset**, not a UTC day. A bare UTC window shifts the agenda by the offset
    and silently loses the last hours of the evening.
  - **All-day events parse via a local-date constructor, never
    `new Date('2026-09-07')`** — that is UTC midnight, which is the previous
    evening everywhere west of Greenwich. `end.date` is exclusive, per Google.
  - A `freeBusyReader` calendar returns blocks with no summary at all. Those
    render as **"Busy"**, never an empty string, which would read as a
    rendering bug rather than as information.
  - Conference detection widened from Meet to **Meet, Zoom and Teams**, read
    from `conferenceData` first and falling back to URIs in the entry points,
    location or description.
  - `guessLabel()` extracted and **shared between `npm run auth` and the
    daemon**, so the map printed for pasting is the same map used when nothing
    is pasted. They previously would have disagreed.
  - One calendar failing no longer loses the account, and one provider failing
    no longer loses the rest.
  - `collect()` now **throws on total failure instead of returning an empty
    state.** `{ events: [] }` means "genuinely nothing scheduled" and makes the
    panel say CLEAR — a specific, reassuring, and in that situation false
    claim. If every source is down we do not know the day is clear, and the
    caller must fall back to last-good rather than assert it.
  - `buildProviders()` reads `PERIPHERAL_ACCOUNTS` and
    `PERIPHERAL_CALENDARS_<ACCOUNT>` (`id=label` pairs; empty means discover
    every visible calendar once per process). Missing credentials produce a
    warning and no source — not an error. The daemon must still come up, serve
    the pane and push frames, because that is what works today.
- **`npm test` — 30 tests**, `node:test`, zero dependencies. 19 over the
  calendar normaliser, 11 over the state cache.
  - The normaliser fixtures cover the transform, **not the network**: they are
    built from Google's documented resource shape rather than captured from a
    live account, so **they do not prove the field names Google actually
    sends.** Spot-check one real payload against them when the token exists.
  - The cache tests exist because the cache only writes on a *successful*
    fetch, so nothing today exercises it — it would have sat unverified until
    the first real token, despite its entire job being to behave correctly on
    the boot after something went wrong.
  - The script uses a **scoped glob**, because bare `node --test` auto-discovers
    anything matching `*-test.js` — which swept in `src/transport/idle-test.js`
    and drove the real panel for 68 seconds. Tests must never touch hardware.
- **Last-good state now survives a restart** (`src/cache.js`). The in-memory
  last-good state protected against a failed refresh but evaporated on restart,
  and restart is the common case now that the daemon launches at logon. Boot
  with Wi-Fi still negotiating and the panel showed an empty agenda, which
  reads as "you have a free day" rather than "I don't know yet".
  - Restored **before** the first fetch, flagged `stale: true`, and the flag is
    sticky until a fetch actually succeeds — age alone would clear the badge on
    a two-minute-old cache and quietly assert that leftovers are live.
  - Dropped entirely past 36h. Atomic write; a corrupt or unreadable cache is
    logged and ignored rather than fatal.
  - Lives in `%LOCALAPPDATA%\Peripheral\`, not the repo: it holds real event
    titles from a work calendar, and **this repo goes public.** `src/paths.js`
    now owns that directory for both the cache and the token store.
- **Run at logon** — `npm run startup:install` / `:uninstall` / `:status` /
  `:logs`, registering a per-user Task Scheduler entry. **No admin required**,
  by design. Logs to `%LOCALAPPDATA%\Peripheral\daemon.log`, rotated at 5MB.
  - The console window is suppressed with a `.vbs` launcher
    (`WScript.Shell.Run` window style 0). `powershell -WindowStyle Hidden` still
    flashes on every logon, and the no-window alternative — "run whether logged
    on or not" — needs a stored password or the batch-logon right. The reasoning
    is recorded in `scripts/hidden.vbs` so it isn't re-litigated.
  - `ExecutionTimeLimit` set to **never**. The default is 3 days, after which
    Windows would kill a daemon that was working perfectly and the panel would
    revert to its logo with nothing in the log to explain it.
  - `startup:status` reports **the process, not just the task** — a task can sit
    at `Ready` with result 0 while nothing is running.
  - Verified by actually running the task: 30 pushes, 0 failures, no window.

### Fixed (this session)

- **The daemon could become a zombie, and did on the very first logon-task
  run** (2026-08-17). `main()` awaited `renderer.open()` bare, and the top-level
  handler set `process.exitCode = 1`. By that point the HTTP server is listening
  and intervals are armed, so **Node has work left and does not exit.** The
  result: `[daemon] fatal` in the log, a live `node.exe`, the scheduled task
  reporting **result 0**, nothing being pushed, and the panel on its vendor logo
  indefinitely with nothing retrying. Every signal said healthy.
  - Renderer open is now a **warning that retries every 30s**, matching how the
    panel is already treated, and recovery is logged
    (`renderer ready (recovered after 3 failed attempts)`).
  - Genuine fatals now `process.exit(1)`, so a dead daemon **looks** dead and
    the task's restart-on-failure can fire.
  - Both paths verified deliberately: broken Chromium path → process stays up,
    retries, heartbeat honestly reads `renderer=down`; path restored →
    recovers unattended.
  - **This was found by running the logon task, not by reading the code**, and
    could not have been found any other way: the trigger was an environment
    difference. Which is the standing rule already in `CLAUDE.md` — green
    metrics are not evidence.
- **The logon task had no `PLAYWRIGHT_BROWSERS_PATH`, so Chromium was not where
  Playwright looked and the daemon died at startup.** A scheduled task does not
  inherit a terminal's exported variables. There was no `.env` at all — the
  variable had only ever been set by hand in a shell. `.env` now exists
  (gitignored) with everything except the two Google values.
  **Standing rule: anything the daemon needs belongs in `.env`, never in a
  terminal that happened to export it.**
- **All-day events would have hijacked the hero slot for the entire day.** An
  all-day event spans local midnight to local midnight, so `classify()` calls it
  `now`, and `now` wins the focus slot — one US Holidays entry would have sat in
  the countdown from midnight to midnight and hidden every actual meeting. That
  is the North Star failing outright.
  - All-day events are now **context, never focus**: excluded from the hero,
    the countdown and the progress bar; pinned above the timed rows, dimmed,
    labelled `ALL DAY`, capped at two so they cannot crowd out the meetings.
  - **Invisible on mock data, which had no all-day events** — it would have
    become live the moment the real calendar list was discovered, since the
    account carries a holidays calendar. An all-day entry is now in the mock so
    the browser fallback exercises it.
- A conference URL pasted into an event's `location` no longer prints the raw
  URL in the meta line, where it ate the whole row.
- `npm start` and `npm run serve` now load `.env`. Only `auth`, `send` and
  `idle-test` did, so the daemon — the one thing that runs unattended — was the
  only script without its configuration.
- `npm run startup:logs` reads the log as UTF-8. Node writes UTF-8, Windows
  PowerShell reads ANSI, and every em-dash arrived as mojibake.

- **The browser launcher truncated the OAuth URL at the first `&`**
  (2026-08-17). `openBrowser()` ran `cmd /c start "" <url>` with the URL
  unquoted, and **cmd treats `&` as a command separator** — so the browser
  received `...?client_id=XXX` and nothing else, and cmd tried to run
  `response_type=code` as a program. Google replied, accurately,
  `Error 400: invalid_request — Required parameter is missing: response_type`.
  - **It cost most of a session because of how it failed.** The URL *printed to
    the terminal* was correct throughout, and pasting it by hand worked. Only
    the auto-open path was broken, so the fault presented as a Google-side
    account problem — an earlier attempt produced *"This app is blocked"*,
    which was misread as a Workspace restriction and reported as such.
    **Correction: that screen was not evidence of anything about Balcom.**
  - Fixed by removing the shell: `rundll32 url.dll,FileProtocolHandler` is
    spawned directly, so nothing can reinterpret `&`, `%`, `^` or `|`. The
    quoted `start` form is kept only as a fallback.
  - Measured against a local server before and after: the old form delivered
    `/?v=CURRENT` — every parameter after the first gone — and both new forms
    delivered the URL intact.
  - `browserOpenCommands()` is exported and covered by four regression tests
    asserting we never route a URL through unquoted `cmd /c start` again.
  - The printed-URL hint is reworded to *"if no browser opens — or the page
    shows an authorization error"*, because "no browser opened" was the wrong
    symptom to wait for.
- **A personal-project OAuth client is blocked by Balcom; the plan is now an
  in-org client** (2026-08-17). Confirmed after the launcher bug was fixed and
  a correct URL finally reached Google: consent as the Balcom account returns
  `admin_policy_enforced` — *"This app is blocked"* — with no click-through.
  - Supersedes the earlier note in `CLAUDE.md` that the client "does not need
    to live in the Balcom org". That was tested and is wrong. Text kept and
    marked, per the no-tidying rule.
  - **Route 1a: own the Cloud project inside `balcomagency.com`.** A client
    owned by an in-org project is an *internal app*, and "trust internal apps"
    is on by default. Ricky has Console access on the work account and has
    already used this route for n8n calendar access — which is why this is the
    plan rather than a guess.
  - Internal user type also removes the **7-day refresh-token expiry** that
    External-plus-Testing would have imposed, along with verification and the
    test-user list. Simpler than the personal-project route, not a compromise.
  - Fallback if project creation is restricted: ask IT to allowlist the client
    id under Security → API controls → App access control.
  - **Untested as of this writing.**

- **REAL EVENTS ON REAL GLASS, 2026-08-17.** The panel is showing Ricky's
  actual day. The North Star is functionally met.
  - **Route 1a works.** An OAuth client owned by a Cloud project inside
    `balcomagency.com` is an *internal app* and consented without incident.
    The personal-project client was blocked; the in-org one was not. Same
    scopes, same account, same code — only project ownership differed.
  - **The work-as-primary design is validated.** One token against Balcom
    returned **8 calendars**, and `grcadden@gmail.com` came back with
    `accessRole: owner` — **full event titles, not free/busy.** Personal events
    ("Norah vball", "Reese vball practice") render with real names. Google does
    the merge server-side exactly as the 2026-08-17 revision predicted. No
    second token, no client-side reconciliation.
  - First live fetch: **19 events**, work and personal interleaved, Meet and
    Zoom both detected correctly from real invites.
  - **Three of eight calendars are on the panel** — work, personal, and the
    TripIt travel feed. The other five are colleagues' calendars (Nick, Alex,
    Brittany, Steve) and a shared team calendar, visible for scheduling.
    Putting a direct report's 1:1s on this panel would bury Ricky's own next
    meeting under other people's days, which is precisely the failure the
    North Star names. `steve.cantrell@` is free/busy only and would have
    rendered as a wall of "Busy" besides. Reasoning recorded in `.env`.

- **Three defects that only real data could reveal** (2026-08-17). Mock data
  was well-formed; a live work calendar is not.
  - **The hero showed the wrong live event.** Focus picked the earliest-
    starting current event, so at 2:20pm a 1–3pm block outranked a 2:00–2:30
    meeting — the panel displayed the thing with 40 minutes left instead of the
    thing he had to leave in 10. Among concurrent events the one **ending
    soonest** now wins: that is the one with a deadline, and a deadline is the
    only thing worth a countdown.
  - **Google's `workingLocation` events took a row every weekday.** They
    rendered as an all-day entry reading "Home" — the where-are-you-working
    banner, not something that happens at a time. Dropped, along with
    `birthday` and `fromGmail`, which are all-day and derived rather than
    scheduled. **`outOfOffice` and `focusTime` are deliberately kept**: that is
    time Ricky blocked, and hiding it would tell him he is free when he decided
    he was not.
  - **An autocompleted postal address broke the layout.** Google stores
    "Asheville Christian Academy" as the venue plus street, city, state, ZIP and
    country; the meta line wrapped to three lines and pushed through the
    progress bar. Locations are now trimmed to the venue name — you do not read
    a ZIP code from three feet — with a two-line CSS clamp as a hard backstop,
    because **no field from a calendar invite may ever be able to reflow the
    hero.** The panel has no scrollbar and no second chance.
  - Test count 30 → 38.

- **Type scale up 2px across the board, and the accents moved to blue**
  (2026-08-17). Both judged on the real panel on a real desk, which is the only
  place either question can be answered.
  - The smallest type (11px `STALE` badge) was unreadable at distance. Every
    `font-size` in `agenda.css` is up by 2px; the layout still fits 480px with
    six agenda rows.
  - `--accent-hero` used to take the wallpaper's **complement**, which against
    a blue wallpaper (dominant hue 208) produced an acid yellow-green
    `#d9f325` — maximally legible and, in Ricky's words, obnoxious. Accent hues
    are now **pinned**; only ground and text still inherit from the wallpaper.
  - **First blue attempt was wrong and the reason is worth keeping.** Pinning
    the hue to blue under the existing uniform 7:1 floor produced a pale cyan
    `#47cff5` — "a little too light". The floor was the cause, not the hue:
    relative luminance weights blue at 0.0722 against green's 0.7152, so
    forcing a saturated blue to 7:1 drags it toward cyan and then toward
    pastel. Measured: hue 212 at 85% saturation first clears 7:1 at lightness
    0.64, by which point it is `#559ef1`.
  - **Fixed by making the floor per-role rather than uniform** — `--accent-hero`
    is now gated at 4.5:1. That is not a relaxation of the contrast principle,
    it is the principle applied to the size the token is actually used at: the
    countdown is 106px, where WCAG's large-text AAA threshold is 4.5:1, and the
    smallest use is a 22px agenda row where 4.5:1 is AA for normal text.
    `--text-faint` already had a role-specific floor of 3.0 for the same kind
    of reason.
  - Result: `--accent-hero` `#0d78f2` at 4.67:1, `--accent-cool` `#79a1c8` at
    7.25:1. The two accents are now **one hue family separated by saturation
    and lightness** rather than by hue, because they sit on adjacent rows in
    the agenda list and a 20-degree hue difference does not survive 6.86" at
    three feet.
- **`workingLocation` confirmed unwanted, `focusTime` and `outOfOffice`
  confirmed wanted** (2026-08-17) — Ricky, directly. The code already matched;
  this records that it is a decision rather than a guess.
- **No flicker observed in normal use** (2026-08-17, Ricky, on the glass). The
  push-rate shortfall recorded earlier was measured only while this session's
  own concurrent test processes were running. Downgraded from a suspected
  defect to a load-sensitivity note — but not closed, because the mechanism
  (render and push timers sharing one event loop) is still unexamined.

- **`/session-close` command** (`.claude/commands/session-close.md`), adapted
  from Drywater's, 2026-08-17. Same skeleton — blocking gate, documentation in
  a fixed order, commit, cold-reader handoff — because that skeleton works.
  What changed is everything downstream of what "shipping" means here.
  - Drywater's Step 0 asks which release channel to ship to. Peripheral has no
    channels, so its gate asks **what was actually verified and by what
    method**, sorting every claim into seen-on-the-glass / rendered / measured
    / tested / written-only. That is this project's recurring failure mode:
    three separate times on 2026-08-17 the daemon reported perfect health while
    something was wrong.
  - The Discord dispatch step and all release execution were **dropped**, not
    adapted. No audience, no channels.
  - Drywater's final step is release execution; Peripheral's is **"leave the
    panel lit"** — a session ending with a stopped daemon has shipped a dark
    panel, and the failure is silent until Ricky glances up.
  - Encodes two things that were previously habit and written nowhere: the
    dated **superseding handoff** pattern (new file per session, previous never
    edited), and the changelog-before-handoff ordering as an enforced step
    order rather than an intention.
  - Step 1 gained a **secret scan**, because `.env` holds a live client secret
    and this repo goes public in Sprint 3. History is not cleaned later.
- **Branching override, recorded in `CLAUDE.md`** (Ricky, 2026-08-17):
  `/session-close` pushes `dev` **and fast-forwards `main`, without asking.**
  This deliberately contradicts the global rule that `main` needs explicit
  instruction, and the override is written down so a future session does not
  "fix" it back. Peripheral's risk profile is not Drywater's — no paying
  customers, no store review, no public build, one user on one machine, and
  `main` is not deployed anywhere. Outside `/session-close` the normal rule
  still applies. Mechanism is `git push origin dev:main`, which fast-forwards
  without a local checkout and so avoids a branch switch on Windows while the
  daemon holds the working tree open.
- **The blue and the type scale are accepted PROVISIONALLY** (Ricky, on the
  glass, 2026-08-17): *"The blue is OK for now, and the font size is improved.
  Consider both closed, but not final — they're subject to change after using
  it for a few days."* Recorded as a decision with an expiry rather than a
  settled one; a revisit is queued on the roadmap so it happens on purpose
  rather than only if something annoys him enough to mention it.
- **The state cache round trip is confirmed against real data**, not just unit
  tests: `[cache] restored 18 event(s) — serving stale until the first fetch`
  fired three times across daemon restarts on 2026-08-17.
- **Second type pass, later on 2026-08-17** (amends the +2px entry above, which
  stands as written). Ricky, after living with the first pass:
  - `.mark` ("PERIPHERAL") 15px → **30px**, `.clock` (date/time) 17px → **34px**
    — both doubled.
  - `.eyebrow` ("UP NEXT" / "TODAY") 15px → **30px** and **bold** (600 → 700).
  - The agenda list up another 2px: `.event` 22 → 24, the all-day `when` label
    17 → 19, `.empty` 22 → 24.
  - `.mark-glyph` scaled 13px → 26px. **Not asked for** — a 13px square beside
    30px type reads as a rendering bug rather than as a lockup. Flagged as a
    judgement call rather than done silently.
  - **`.bar` had a fixed `height: 22px`** which clipped the instant the bar type
    doubled. Height is content-driven now; `.body` is `flex: 1 1 auto` and
    absorbs the difference.
  - **Checked and NOT changed:** the agenda time column is `104px` and its own
    comment promises it holds the widest form, `12:30 AM`. Measured in the page
    at the new size: **76.9px**. It fits with room to spare, so the column was
    left alone. Recorded because the next size increase is the one that breaks
    it, and this is the number to check against.
  - Six agenda rows still fit 480px with nothing clipped.
  - **Verdict on the glass: "much better"** (Ricky, 2026-08-17). Still
    provisional — the second pass does not settle the type scale, and the
    roadmap revisit after a few days of use stands.
- **`focusTime` reached the hero slot in normal use**, 2026-08-17 15:27 — the
  panel showed a countdown to Ricky's own focus block. This is the open
  question from the design pass appearing in the wild rather than in theory,
  and it is now something he can judge rather than predict.
- The unused **personal Google Cloud project has been deleted** (Ricky,
  2026-08-17). The in-org project is the only one. Closes the housekeeping item
  raised when its client id/secret were exposed in a chat transcript.

### Changed — the roadmap was split and renumbered (2026-08-18)

- **Sprint 2 bundled two subsystems.** "Agenda pane, second pass" is polish on a
  thing that exists; "New panes" needs pane-cycling infrastructure that does
  not. They share no code, no design decisions and no failure modes, and sat
  behind eleven mixed items — builds, decisions only Ricky can make, and gates
  that could not be closed by working on them at all.
- **Now four sprints, each answering one question**, so it is possible to tell
  when one is finished:

  | Sprint | Question |
  |---|---|
  | 2 — Agenda, second pass | Is the one pane right? |
  | 3 — The multi-pane system | Can the panel show more than one thing? |
  | 4 — More panes | What else earns a pane? |
  | 5 — Polish and release | Can someone else run this? *(was Sprint 3)* |

- **A mapping table for the dead labels is at the top of the roadmap**, per the
  never-tidy-history rule. One existing label moved: **Sprint 3 (Polish and
  release) is now Sprint 5.** Three live references were corrected to name the
  *release sprint* rather than a number, so a future renumber cannot make them
  lie: `CLAUDE.md`'s remote row and two lines in
  `.claude/commands/session-close.md`. Historical references in this changelog
  and in previous handoffs are **not** edited — the mapping note resolves them.
- **New: a "Standing watch" section, for things that cannot be closed by working
  on them.** The `travel` label needs Ricky to have a trip; `worstPush` drift
  and the panel's failure curve need weeks; busy-machine cadence needs a loaded
  PC. As sprint checkboxes these were unclosable gates that only made a sprint
  look stalled. The `travel` item moved there out of Sprint 2.
- **Weather was promoted from "a pane" to the proof of pane cycling** (Sprint 3
  rather than Sprint 4). Cycling cannot be verified with one pane, and shipping
  the infrastructure with nothing to cycle to would be untested infrastructure —
  the exact trap that cost this morning's session. Weather is the cheapest real
  second pane: no OAuth, no new scope, no new token.
- **Photos is explicitly a research spike before it is a build item.** Google
  restricted the Photos Library API and the local-folder fallback may simply be
  the answer; designing before confirming policy would be work done twice.
- **Decision items are tagged `NEEDS RICKY`.** Three of Sprint 2's five need a
  conversation before code, and unflagged they invite a session to pick one up
  and stall halfway.
- **Recorded because it caused real confusion:** Sprint 1 closed 2026-08-17 and
  the roadmap advanced the same day, but every session since spent its time
  *hardening Sprint 1* — the worker-thread transport, the hero rule, the agenda
  time column. **Sprint 2 had zero completed items and had been nominally
  "current" for a day without being worked**, which is the roadmap describing a
  state the project was not in. Noted in the roadmap so a cold read does not
  inherit the same impression.

### Fixed — the agenda time column collided with the title (2026-08-18)

- **Seen on the glass by Ricky:** list rows read `10:00 AMWeekly DS + Media…`
  with no space. The daemon reported `panel=ok` throughout, because a layout
  defect is invisible to every health metric this project has.
- **Measured, not estimated.** `10:00 AM` at the row's actual 24px type is
  **114.42px** in a **104px** column. It overflowed to the right, closing the
  12px gutter down to **1.58px** — which at 6.86" reads as a missing space.
- **The `104px` was not merely mis-tuned, it was re-derived at the wrong type
  size.** The 2026-08-17 lesson recorded the column as "measured in the page at
  **76.9px**, not estimated". That measurement is reproducible — at **16px**
  the same string is 76.28px. It is also 95.36px at 20px and 114.42px at 24px.
  So `104px` was correct at 16px and at 20px and wrong at the size actually
  shipped. A measurement is only valid for the state it was taken in.
- **Fixed by deleting the number, not re-tuning it.** `.events` now owns the
  column (`grid-template-columns: 13px max-content 1fr`) and rows adopt it via
  `grid-template-columns: subgrid`. Content-driven, so it cannot fall behind
  another type change.
- **A first attempt was wrong and is worth recording.** Putting `max-content`
  on `.event` alone looked right and misaligned the list: each `<li>` is its own
  grid, so the column resolved **per row** — 88.58px for the 19px `ALL DAY` row
  against 114.42px for the 24px timed rows, leaving titles starting at two
  different x positions. Subgrid is what makes one shared column possible.
  `8ch` was also considered and rejected: it computes to 112.5px against the
  114.42px needed, because `ch` excludes letter-spacing — a fudge factor away
  from being the same magic number again.
- **Verified through `src/render.js`**, not only in a browser: the fix relies on
  subgrid, and Playwright's Chromium is a different build from the in-app one.
  Captured JPEG shows the gap present and all titles aligned at x=974.42.
- **Confirmed on the glass by Ricky, 2026-08-18: *"Reads correctly - much
  better."*** Closes the loop at the only tier that counts — the defect was
  found by eye and is now signed off by eye. Nothing measured it in between
  except at the moment it was already being fixed.
- `.empty` gained `grid-column: 1 / -1`; without it the empty-state text would
  be trapped in the 13px tick column now that `.events` is a grid.

### Added — `npm run stall-test`, so the recovery paths are no longer theoretical (2026-08-18)

The worker-thread fix shipped with every recovery branch unexecuted — slow-push
detection, reopen, the stall alarm and the respawn were all "written but
unverified", and a wedged USB endpoint is not reproducible on request. This
injects the fault instead of waiting years for it.

- `src/transport/stall-test.js` — a committed diagnostic, per the standing rule
  that produced `npm run idle-test`. Runs under `PERIPHERAL_DRY_RUN`, writes
  frames to a temp dir, and **never touches the panel**; safe with the daemon
  live. Thresholds are env-overridable so a run takes seconds.
- **`Atomics.wait` is the injection primitive**, deliberately: it blocks the
  worker thread synchronously and uninterruptibly, which is the exact shape of
  a stuck native call. A `setTimeout` would prove nothing, because it yields —
  and yielding is the entire thing that was missing.
- **Results, 13/13 checks:**
  - **Main-thread loop lag during a 4-second worker block: 11–13ms.** That is
    the headline number and the whole claim of the redesign. The same condition
    on 2026-08-18 morning produced a 36,600ms stall.
  - `open()` returned `false` at 2011ms against a 2000ms deadline instead of
    hanging, with the reason recorded.
  - The stall was reported as `STALLED 4s`, not hidden, and cleared itself to
    `ok` automatically once the worker returned.
  - Respawn fired after the configured silence, and **the replacement worker
    pushed normally**. `terminate()` did kill the blocked worker here (exit
    code 1) — but see Known unknowns: `Atomics.wait` is not a native driver
    call, so this does **not** establish the same against a real wedged
    `node-hid` write.
- **The diagnostic immediately found a real observability defect.** The
  heartbeat reported `lastPush`, a single sample — and the worker completed a
  **4012ms** push and a **4ms** push back-to-back before the main thread got a
  turn, so `lastPush` read **4ms**. The one push that mattered was invisible.
  `PanelProxy` now holds the peak as messages arrive (the only place that sees
  every report) and the heartbeat drains it, reporting **`worstPush`** for the
  interval. A slow push can no longer be swallowed by a faster one behind it.
  - Two of the diagnostic's own assertions failed first for exactly this
    reason: a timer-based sampler on the main thread could never observe the
    peak. The fix belonged in the proxy, not the test.

### Changed — the hero pick moved out of the pane and got a rule that holds (2026-08-18)

- **`web/panes/agenda/focus.js` (new)** — `classify()`, `pickFocus()` and
  `selectAgenda()` extracted from `agenda.js`. Pure functions, no DOM, no fetch,
  no clock of their own (`now` is injected), which is what makes real days
  reproducible as tests. `agenda.js` imports it and `index.html` became
  `<script type="module">`; both are served over http so ESM resolves.
- **The reason for the extraction is the reason it was wrong twice.** The hero
  pick is the one decision that determines what the panel is *for*, and it lived
  inline with no exports, so `test/` could not reach it. Two rules shipped, each
  derived from a single observed case, each failing on the next real overlap:
  - *Attempt 1, start-order.* At 2:20pm a 1–3pm block and a 2:00–2:30 meeting
    were both live; the hero went to the block — 40 minutes of runway shown
    instead of the 10 that mattered.
  - *Attempt 2, ending-soonest.* Fixed that case and was fit to it. At 4:10pm a
    2:30–4:30 volleyball practice and a 4:00–4:45 meeting were both live; the
    practice ends first, so the panel demoted the meeting he was sitting in.
  - **Now: shortest duration wins, ending-soonest breaks ties.** Ending-soonest
    was never the discriminator — it merely correlated with it in the first
    case. A short, sharply-bounded event is a commitment you are *in*; a long
    one is a container you are *inside of* ("Focus time", "Out of office",
    a two-hour practice). Containers are context, not focus.
- **`test/focus.test.js` (new)** — 13 tests, and every case is a real day rather
  than a hypothetical, including both failures above by date and time.
- All-day events remain excluded from the hero, with the reasoning carried into
  `focus.js` rather than left behind in the pane.

### Fixed — the transport moved off the main thread (2026-08-18)

Addresses the incident recorded under *Diagnosed* below, which was written
before the fix existed and is left as-is.

- **`src/transport/hid-worker.js` (new) — the push loop runs on a worker
  thread**, and owns the push *cadence*, not merely the writes. The main thread
  sends a frame only when the renderer produces a new one; the worker re-pushes
  whatever it holds at 1 fps on its own timer. **That distinction is the fix.**
  Had the interval stayed on the main thread, a blocked main thread would still
  have starved the panel — the writes would have moved and the coupling would
  have remained.
- **`src/transport/panel-proxy.js` (new) — the main-thread handle**, whose real
  job is honest health. Liveness is derived from the worker's **silence** rather
  than from a flag, because a flag reports the last thing a component was
  observed to be and the failure was precisely a component that had stopped
  answering. Adds `panel=STALLED <n>s` as a state distinct from `ok`/`down`,
  a slow-push detector on the worker side (three pushes ≥ the panel's ~3s forget
  window drops the handle and reopens), and a worker respawn after 60s of
  attributable silence.
- **`src/transport/hid.js` is unchanged.** All wire logic, the handshake, the
  frame header and the reconnect backoff were correct — the backoff proved it
  during the replug — and were moved rather than rewritten. `idle-test.js` and
  `send.js` still use `PanelTransport` directly, which is right: they are
  one-shot diagnostics where blocking the caller is the desired behaviour.
- **`src/daemon.js` heartbeat now reports `loopLag`** — how late a 1000ms timer
  actually fired. It is the only figure on that line a stale flag cannot fake,
  and its absence is why every health signal read green during the incident.
- **`open()` is bounded (10s).** Device enumeration and the handshake both block
  on the worker thread; an unbounded await would have let a hung transport stop
  `main()` before it reached the renderer — the transport taking down the
  daemon, which is the exact failure the redesign exists to prevent.
- **`test/panel-proxy.test.js` (new) — 18 tests**, no hardware, no sleeps, `now`
  always injected. The stall decision is extracted as pure functions for the
  reason `focus.js` was: logic `test/` cannot reach gets to be wrong twice
  first. Suite: **69 pass, 0 fail.**
- **A false positive, caught on the first real run and fixed.** The detector
  logged `TRANSPORT STALLED — no push completed for 3s` while the worker was
  pushing perfectly, because the **main thread** was busy launching Chromium and
  had not drained the worker's messages. Worker status arrives on the main
  thread's event loop, so "time since the last message we handled" conflates
  *the worker stopped sending* with *we stopped listening*. `stallState()` now
  subtracts `mainLagMs` — how late the proxy's own watchdog fired — so silence
  during a blocked main thread is not held against the worker. Four tests pin
  it, including the inverse case: **lag must not become an excuse that masks a
  genuinely stalled worker.**
  - Worth recording plainly: **the detector written in response to this incident
    reproduced the incident's own bug on its first run.** A timeout measured on
    a blocked loop is evidence about the waiter, not the awaited — the same
    error that got a healthy Chromium torn down. The class is easy to re-enter.
- **Verification.** Two clean daemon starts, the second with `chrome-headless-shell`
  killed first so the Chromium launch was genuinely cold — the condition that
  produced the false positive. Four heartbeats at **30/30/27/30 pushes**,
  `lastPush` 34–200ms, `loopLag=0ms`, `panel=ok`, stderr empty.
  **NOT YET VERIFIED: eyes on the glass.** Every number above is a metric, and
  this project's own standing rule says metrics are not evidence that pixels
  changed. See Known unknowns.

### Diagnosed, not yet fixed (2026-08-18)

- **The two "independent" loops are not independent, and the mechanism is now
  measured.** First morning of real unattended use after a reboot. Ricky
  reported the panel reverting to the vendor logo repeatedly since logon —
  behaviour it had not shown the day before.
  - **Root cause: `node-hid`'s `write()` is synchronous.** `PanelTransport.push()`
    (`src/transport/hid.js:310`) issues ~81 blocking 512-byte writes in a bare
    `for` loop with nothing to yield on. When the USB endpoint stops draining,
    each call blocks *inside the driver*, and the whole batch pins the single
    Node thread for tens of seconds.
  - **The measurement that settles it:** a request to the daemon's own
    `/api/state` — a `node:http` handler returning a cached object, normally
    sub-millisecond — **took 36.6 seconds**. After the fix below it measured
    **138ms**. Process CPU was ~17s across 14 minutes of wall clock, i.e.
    near-idle: the thread was not computing, it was waiting in the kernel.
  - **Observed push rate: 413 → 417 → 421 → 422 across four 30-second
    heartbeats** — roughly one frame per 30s against a target of 30. The panel's
    forget window is ~3s, so it sat on its logo ~90% of the time. This is the
    user-visible symptom, and it is the predicted one.
  - **The renderer failures were collateral, not causal.** The five
    `page.screenshot: Timeout 2000ms exceeded` errors were Playwright's own
    timers expiring on the blocked loop; Chromium was healthy throughout. The
    daemon nonetheless hit `RENDERER_REOPEN_AFTER` and tore down a working
    browser, then could not rebuild it because the loop never yielded. **A
    starvation symptom was treated as a renderer fault.**
  - **The health output was actively misleading.** The heartbeat read
    `panel=ok renderer=down` while the truth was the exact inverse. This is the
    existing "a dead daemon must LOOK dead" rule failing one layer up — the
    daemon was neither dead nor working, and nothing it reported said so.
  - **Recovery required physically replugging the USB-C.** Nothing in the daemon
    could clear a stalled endpoint from inside the blocked thread. On replug the
    reconnect backoff worked exactly as designed — two failed attempts at 2s and
    4s, then `[hid] open — PM=128 SUB=1`, `[daemon] panel reconnected`, and the
    rate returned to 29 pushes per heartbeat with `frameAge` 0–1s. **Same
    process throughout (PID 22992); no restart.** The 8 permanent `failed=`
    writes are the record of the unplugged interval.
  - **Correction, same session:** while diagnosing, it was stated as a finding
    that Playwright's Chromium had died and could not relaunch. That was wrong.
    The process check filtered for `chrome.exe` and then `headless_shell.exe`;
    the actual binary is **`chrome-headless-shell.exe`**, and 8 of them were
    running the whole time. A failed lookup was reported as an absence. The root
    cause above rests on the latency and CPU measurements, not on that claim,
    and is unaffected.
  - **Fix not yet applied.** The transport belongs in a `worker_thread` so a
    blocking write costs one thread instead of the process. Two smaller items
    fall out of it: the heartbeat should time each push and report a stall
    directly rather than inferring health from flags, and the renderer's
    5-failure rebuild must not fire when the failures are timeouts on a starved
    loop.
- **Panel disconnect event — 2026-08-18, day 2.** Logged per the hardware-risk
  policy at the bottom of this file. Preceded by the previous evening's daemon
  exit with code **1073807364 = `0xC0000374` STATUS_HEAP_CORRUPTION**, a native
  crash consistent with `node-hid`. Cleared by a replug; cable is the usual
  culprit on this model. First entry on the failure curve.

### Known unknowns
- ~~**Whether Balcom permits third-party OAuth app access.**~~ **ANSWERED
  2026-08-17: no for third-party, yes for internal.** A personal-project client
  is blocked (`admin_policy_enforced`); a client owned by an in-org Cloud
  project consents normally. ICS is no longer needed and route 3 can stay
  unbuilt.
- ~~**Whether `ApiProvider.fetchToday()` works against real Google.**~~
  **ANSWERED 2026-08-17: it does.** 19 real events on the first live fetch,
  Meet and Zoom detected from real invites, personal calendar arriving with
  full titles. Three defects surfaced immediately and are fixed — see above.
  The fixtures did their job on the transform and were silent on everything
  real data does differently, which is the honest limit of a fixture.
- ~~**Whether the token survives long-term.**~~ **ANSWERED 2026-08-18: it
  survives, and the refresh path works unattended.** First cold logon after the
  token was issued. `tokens.json` was rewritten at **07:11:46**, five seconds
  after the daemon started at 07:11:41 — the refresh executing and persisting a
  new access token with nobody watching. The panel showed the correct date for
  today, and `/api/state` reports `stale: false` with 12 live events. Internal
  apps having no 7-day expiry is now observation rather than documentation, at
  least across one night. Note this was **verified by the daemon's own logon
  run**, which is the only way it could have been.
  - Unrelated to the token: the same log carries
    `gcal:work: every calendar failed — fetch failed` and a `serving last good
    (463s old)` warning. Those land squarely inside the blocked-loop window
    above and are **collateral from the stall, not a calendar or auth fault** —
    the source timer, like every other timer, was starved. Recorded so a future
    reader does not go hunting for an OAuth problem that never existed.
- **Whether an all-day event now behaves correctly on the panel.** The
  hero-hijack fix has still never been exercised by real data: the only all-day
  event the account produced was a `workingLocation` entry, which is now
  dropped before it reaches the pane. The path is tested, not observed.
- **Whether the `travel` label renders at all.** The TripIt feed returned zero
  events on the day it was wired up — 15 work, 3 personal, 0 travel — so that
  calendar's label and tint have never appeared. Not a suspected defect, a
  blind spot: nothing has disproved it either.
- ~~**Whether the push-rate shortfall matters.**~~ **ANSWERED 2026-08-18: yes,
  and worse than flicker.** Ricky's "no flicker in normal use" (2026-08-17, on
  the glass) was true and remains the correct read of that day; it was simply
  not a busy morning. The unexamined mechanism was the real finding — see
  *Diagnosed, not yet fixed* above. Superseded text kept below.
  > Ricky reports **no flicker in normal use** (2026-08-17, on the glass), which
  > is the only evidence that can settle the user-facing question, and it
  > settles it in the good direction. Left open anyway because the *mechanism*
  > is unexamined — the render and push timers share one event loop, which is
  > precisely the coupling the two-loop design was meant to eliminate. A quiet
  > panel today does not prove a quiet panel during a Teams call and a build.
- ~~**Whether the push loop holds up when the PC is busy.**~~ **ANSWERED
  2026-08-18: it does not, and the suspected mechanism was close but wrong.**
  The suspicion recorded here — "render and push timers competing on one event
  loop" — pointed at the right file and the right thread, and the reproduction
  instruction (load the CPU, watch the heartbeat deltas) is what made the
  failure legible when it arrived on its own. But the cause is not two timers
  competing for a busy loop. **It is one synchronous native call blocking the
  loop outright**, which no amount of timer scheduling can mitigate and which
  CPU load only makes more likely to be noticed. Full evidence in *Diagnosed,
  not yet fixed* above. Superseded text kept below.
  > Undisturbed, the daemon pushes **28–30 frames per 30s heartbeat with 0
  > failures** (100s run). But during this session's own testing — several
  > concurrent PowerShell and npm processes — the same heartbeats read **19, 25
  > and 15 pushes**, with four 2-second screenshot timeouts and a `frameAge` of
  > 3s. Fifteen pushes in thirty seconds means up to 2s between frames, which is
  > inside the panel's ~3s forget window; that is visible flicker, and the
  > machine this runs on will not be idle. Not diagnosed further this session.
  > **Suspect the render and push timers competing on one event loop** — the two
  > loops are logically independent but share a thread, which is exactly the
  > coupling the two-loop design was meant to remove. Reproduce by loading the
  > CPU and watching the heartbeat deltas.
- ~~**Whether the worker-thread transport actually keeps the panel lit.**~~
  **ANSWERED 2026-08-18: yes — "the screen is holding strong" (Ricky, on the
  glass).** The metrics said so first — five heartbeats across two starts at
  30/30/27/30/27 pushes, `loopLag=0ms`, `failed=0`, stderr empty — but this
  project's rule is that metrics are not evidence pixels changed, and the
  sustained observation is what closes it. Note the contrast with the morning:
  the *same* heartbeat format reported `panel=ok` throughout a total outage.
  What makes today's numbers trustworthy is not the numbers, it is that a human
  looked.
  - Still unobserved, deliberately not folded into this answer: whether the
    panel holds during a genuinely busy machine — a Teams call and a build —
    which is the harder half of the original question and needs a loaded PC
    rather than a quiet one.
- ~~**Whether the respawn path works.**~~ **ANSWERED 2026-08-18: it works.**
  `npm run stall-test` drives it: respawn fires after the configured silence and
  the replacement worker pushes normally, with main-thread lag never exceeding
  16ms throughout. Slow-push detection, reopen, the stall alarm and automatic
  recovery are all exercised in the same run.
- **Whether `terminate()` can interrupt a *real* wedged `node-hid` write.**
  **STILL OPEN, and deliberately not claimed.** The diagnostic blocks the worker
  with `Atomics.wait`, and `terminate()` did kill it (exit code 1) — but
  `Atomics.wait` is a V8-level block and a stuck driver call is not. The
  respawn's value does not depend on this: a fresh worker reopening the device
  restores the panel whether or not the old thread ever dies, and the only cost
  of a surviving orphan is one leaked thread. **A truly wedged endpoint may
  still need a replug** — that caveat stays in `panel-proxy.js`.
- **Why a push occasionally takes ~2 seconds.** Observed within the first hour
  of `worstPush` existing (2026-08-18, 08:33 heartbeat: `worstPush=2013ms`, on
  an otherwise idle machine, `loopLag=0ms`, no failures). Typical intervals read
  200–630ms. **This is inside the ~3s forget window, so nothing flickered and
  the slow-push detector did not fire** — but it is two-thirds of the way to the
  panel dropping the frame, and it was invisible before today: `lastPush` would
  have reported whichever fast push happened to land last.
  Not diagnosed. Candidates, in no order: USB scheduling, the 81 sequential
  512-byte writes contending with something else on the bus, or the host briefly
  busy. **Do not tune `SLOW_PUSH_MS` down to "catch" it without knowing the
  cause** — the threshold is deliberately the panel's own forget window, and
  lowering it would trade a real signal for noise. Watch whether the figure
  drifts upward over days; that pattern, not a single sample, is what would
  indicate the cable degrading.
- **Whether the panel holds up on a genuinely busy machine.** The original
  question behind the whole incident. `stall-test` proves the main thread
  survives a blocked transport; it does not prove the *transport* keeps its
  cadence when the PC is loaded with a Teams call and a build. Reproduce by
  loading the CPU and watching `worstPush` and the heartbeat deltas — which is
  now possible, because `worstPush` exists.
- **Whether the live panel still looks right.** The daemon was verified this
  session by metrics again — 30 pushes, 0 failures, under the logon task — and
  the pane was verified through the real renderer as a JPEG. **Neither is eyes
  on the glass**, and the all-day row is new visual output that has never been
  seen at 6.86 inches from three feet.
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

### Failure log

| Date | Age | Event | Cleared by |
|---|---|---|---|
| 2026-08-17 ~18:07 | day 1 | Daemon exited **1073807364** (`0xC0000374`, STATUS_HEAP_CORRUPTION) — a native crash, consistent with `node-hid`. | Machine shut down for the night. |
| 2026-08-18 07:16–07:31 | day 2 | USB endpoint stopped draining after a cold boot. Synchronous HID writes blocked the daemon's thread for ~30s at a time; panel on the vendor logo ~90% of the time. | **Physical replug of the USB-C.** Daemon self-recovered, no restart. |

Two events in two days is early on the curve, and both are consistent with the
cable — the failure point the reviews name most often. Neither is yet evidence
of a dying unit. **If a third arrives, replace the cable before concluding
anything about the panel.** The decoupled-transport decision is looking
correct sooner than hoped.
