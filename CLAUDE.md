# Peripheral

## Project Name & North Star
**Peripheral** — *your life, in the corner of your eye.* An ambient panel on a
1280×480 USB LCD that shows what's actually next, readable at a glance from a
few feet, without being asked. Named for the double meaning: it is literally a
USB peripheral, and it is built for peripheral awareness.

Success in one sentence: **Ricky stops opening Google Calendar to find out
whether he has a meeting soon.**

## Status
**Sprint 1 complete — the panel shows Ricky's real day.** Work and personal
calendars merged server-side through one in-org OAuth token, rendered at
1280×480, pushed over HID at 1 fps, started automatically at logon.

Route 1a (OAuth client owned by a Cloud project **inside** `balcomagency.com`)
is the answer. A personal-project client is blocked by Workspace policy; an
in-org one is an internal app and is trusted by default. ICS is dead as a
fallback and does not need building.

Next: whatever Sprint 2 turns out to be. See the handoff.

<!-- Superseded 2026-08-17, kept per the no-tidying rule: -->
<details><summary>Previous status (pre-OAuth)</summary>
Sprint 1 — Foundation, essentially complete. Hardware arrived and works; the
loop is closed; the daemon **starts itself at logon**; the calendar fetch path
is written end to end and covered by fixture tests.

**One thing blocks the whole calendar half: the Google OAuth client does not
exist yet.** Nothing downstream of it is blocked — it is all written and
waiting. `npm run auth` is the experiment, and it tests Workspace policy and
the entire fetch path in one go.
</details>

> **Starting a session? Read
> [`docs/plans/session-handoff-2026-08-17d.md`](docs/plans/session-handoff-2026-08-17d.md)
> first.** It has the ordered next actions, what is verified and by what
> method, and the open questions that need Ricky.

## Session-end ritual — changelog first, handoff derived
**Run `/session-close`** (`.claude/commands/session-close.md`). It carries the
full checklist: a blocking verification gate, roadmap sync, changelog, lessons,
memory, commit, a derived handoff, and confirming the daemon is still running.
Adapted from Drywater's equivalent, 2026-08-17.

The rule the skill exists to enforce:

**Write [`CHANGELOG.md`](CHANGELOG.md) before touching the handoff, then rewrite
the handoff's next-actions from it.** The changelog is the source of truth for
*what happened*; the handoff is a derived view of *what to do next*.

The reason is drift. Both documents used to want updating at the end of a
session, both described overlapping ground, and whichever came second got
skipped — leaving two files that disagree about the state of the build. Deriving
one from the other means there is a single place to write and no chance of a
contradiction surviving a cold start.

Rules that follow from it:
- Nothing is deleted from the changelog. Corrections are appended with a date;
  superseded text stays and is marked superseded.
- Everything stays under `[Unreleased]` until the daemon pushes a frame to real
  glass. `0.1.0` is unpublished.
- Log panel failures **with dates** — see the hardware-risk note at the bottom of
  the changelog. If this thing dies at week three, that date is the evidence
  that justifies the decoupled transport.
- Each session gets a **new** dated handoff at
  `docs/plans/session-handoff-YYYY-MM-DD[letter].md` that names the file it
  supersedes. Previous handoffs are never edited and never deleted.

## Branching — this project overrides the global rule
**`/session-close` pushes `dev` and then fast-forwards `main`, without asking**
(Ricky, 2026-08-17). This deliberately contradicts the global instruction that
`main` is pushed only on explicit instruction — do not "fix" it back.

The global rule is calibrated for projects like Drywater, which has paying
customers, store review, and a public build on `main`. Peripheral has none of
that: no customers, no deployment, one user on one machine, and `main` is not
wired to anything. The cost of a bad `main` here is that Ricky pulls it on the
same PC he pushed it from. Sprints are also smaller and sessions more frequent,
so a branch question at every close is pure friction.

**Outside `/session-close`, the normal rule still applies** — mid-session work
goes to `dev`, and `main` is not touched unless Ricky says so.

`git push origin dev:main` is the mechanism: it fast-forwards without a local
checkout, so no branch switch happens on Windows while the daemon holds the
working tree open. A non-fast-forward rejection means the branches diverged,
which should not happen in this workflow — stop and report it rather than
reaching for `--force`.

## Hardware — read this before touching the transport
**Thermalright Trofeo Vision LCD 6.86" Black Edition** ($37.90, Amazon
`B0GYKJZT2F`, purchased 2026-08-16).

| Property | Value |
|---|---|
| Resolution | **1280×480**, fixed |
| Connection | USB-C (9-pin internal USB header on a desktop) |
| **Enumeration** | **USB HID — `VID:PID 0416:5302`. NOT a monitor.** Confirmed on hardware 2026-08-17. |
| Frame format | JPEG pushed over HID — **confirmed** |
| Frame channel | **Interface 0, ep `0x82` OUT INTERRUPT, 512-byte packets** |
| Status channel | Interface 0, ep `0x83` IN INTERRUPT, 8-byte packets |
| HID usage | usagePage `0xff06`, usage `0x0001` (vendor-defined) |
| Strings | manufacturer and product both `USBDISPLAY` |
| Handshake | replies `PM=128 SUB=1` + serial — confirms a 1280×480 Trofeo Vision |
| **Idle timeout** | **~3 s. Stop pushing and it reverts to its boot logo.** |
| Mount | Magnetic back |

### The panel forgets — push forever
Measured 2026-08-17 with `npm run idle-test`: the firmware discards the pushed
frame and falls back to its boot logo **~3 seconds** after the last frame it
received. Holding the USB handle open does **not** preserve the image; only a
new frame does.

This is not a bug to work around, it is the operating model. **An idle daemon is
a blank panel.** There is no "content unchanged, skip this frame" optimisation —
that is a blank panel with extra steps.

It also forces the daemon's shape: **the push loop and the render loop must be
separate.** Push runs unconditionally at 1 fps and always ships the most recent
frame available. Render updates that frame whenever it can. A Playwright
screenshot that takes 800 ms is fine; one that hangs for 10 s must not be able to
stall the push, or the panel goes to logo while the daemon is busy "working."

**Arrived and connected 2026-08-17** — a day early. Enumerates cleanly; nothing
has been written to it yet.

**Interface 1 is a decoy.** The device exposes a second, vendor-specific
interface that Windows binds WinUSB to and labels `USBDISPLAY`. It has **zero
endpoints**, so it cannot carry frame data. Don't chase it; the frames go over
HID interface 0.

The OS never sees a second display. There is no window to maximise and no
browser running on the device. Frames are rendered on the host and pushed.

**Do not install the bundled TRCC software.** It is Windows-only, clunky, and
claims the device. Confirmed by the Reddit OP who built the same thing.

**Reliability is poor and the design must assume failure.** 3.7★ over 145
ratings, 19% one-star, with a recurring pattern of flicker-then-permanent-death
at 1–8 weeks and disconnects that people resolve with a better USB-C cable.
This is why the renderer is decoupled from the transport (see below).

## Tech Stack
| Layer | Choice | Why |
|---|---|---|
| Runtime | **Node 22+ ESM, plain JS** | One language across daemon and panes, no build step, no venv. See the dated correction in Lessons Learned — the original rationale was wrong. |
| Server | `node:http`, zero deps | Runs on a bare clone with no `npm i`. |
| Renderer | Playwright Chromium → JPEG | Design in HTML/CSS, iterate in a real browser at true size. |
| Transport | `node-hid` | Pushes JPEG frames to `0416:5302`. |
| Palette | `sharp` (optional dep) | Wallpaper → tokens. Falls back to committed defaults. |
| Calendar | Google Calendar API, **read-only** | `calendar.readonly` scope. Nothing writes, ever. |

No Supabase, no Cloudflare, no n8n. **Fully local by design** — the panel is
USB-powered by this PC, so if the PC sleeps the screen is dark regardless.
Cloud hosting would buy nothing and would put a calendar token somewhere it
doesn't need to be.

## The one structural decision that matters
**The daemon screenshots its own localhost URL.** One renderer, two consumers:

1. Playwright screenshots `http://127.0.0.1:4780/panes/agenda/` → HID panel
2. You open the same URL in any browser — for design iteration, and as the
   working fallback when the panel dies

Never fork the pane into a "panel version" and a "browser version". The moment
those diverge, the fallback stops being trustworthy.

## Active Integrations
- **Google Calendar** (read-only) — **one account: work.** Personal arrives via a
  native share into the work calendar, so Google merges server-side and
  Peripheral holds a single token. See Environment.

## Environment & Credentials
Secrets live in `.env` (gitignored) and a local token store. **This repo goes
public when it's done**, so nothing real is ever committed. `.env.example` is
the contract.

| Value | Status |
|---|---|
| Google OAuth client ID / secret | **NOT YET CREATED.** Create as **Desktop app** in a *personal* Cloud project, not Balcom's. Flow is written — `npm run auth`. **`.env` now exists with these two lines blank**; fill them in there. |
| Repo location | **`C:\dev\peripheral`** — deliberately NOT in OneDrive. See Lessons Learned. |
| Remote | `github.com/rcadden/peripheral` — **private** until Sprint 3, then public. |
| Token store | `%LOCALAPPDATA%\Peripheral\tokens.json` — **outside the repo on purpose.** A refresh token has no business in a project directory. Override with `PERIPHERAL_TOKEN_PATH`. |
| Personal calendar | `grcadden@gmail.com` — confirmed reachable. Also natively shared **into** the work calendar, which is how the primary gets it. |
| Work calendar (Balcom) | **PRIMARY account — critical path.** Direct OAuth, untested. Sharing work→personal is confirmed blocked; see below. |
| State cache | `%LOCALAPPDATA%\Peripheral\last-state.json` — last-good agenda, restored at boot. Holds real event titles, so **outside the repo**; this repo goes public. Override with `PERIPHERAL_STATE_PATH`. |
| Daemon log | `%LOCALAPPDATA%\Peripheral\daemon.log` — written by the logon task, rotated at 5MB. `npm run startup:logs` |
| Server port | `4780` (1280 wide, 480 tall), override `PERIPHERAL_PORT` |
| Wallpaper source | `%APPDATA%\Microsoft\Windows\Themes\TranscodedWallpaper` |

### Work calendar — the plan (revised 2026-08-17)

**The work account is the primary, not the personal account.** One OAuth token,
against Balcom. Personal comes along for free because it is already natively
shared *into* the work calendar.

This inverts the original design and is simpler than it: Google performs the
merge server-side, so there is one token, one refresh path, and no client-side
reconciliation of two API responses.

**What is confirmed, 2026-08-17:**
- The personal Google account exposes only Personal, US Holidays, and two
  imported athletics feeds. **No Balcom calendar.**
- **Sharing work → personal is blocked.** Tested and confirmed not to work.
  Route 2 below is dead.
- **Personal → work is a native share by email, and it works** — real-time, full
  event details, not an ICS import. This is what makes work-as-primary viable.

**The direction of travel matters.** Outbound external sharing from Balcom is
blocked; inbound is fine. So the merge has to happen *inside* the work account,
which is exactly what work-as-primary does.

**Routes, revised:**

1. **Direct OAuth against the Balcom account — CURRENT PLAN.** One token, one
   account, personal included via the existing native share. Real-time.
   **Untested.** Risk: Workspace may block third-party app access.
2. ~~**Native Google sharing, work → personal Gmail.**~~ **DEAD — confirmed
   2026-08-17.** Balcom blocks outbound external calendar sharing. Text kept for
   the record; do not retry this.
3. **Private ICS "secret address."** Fallback only. Google refreshes imported
   feeds every 8–24h — **fatal for a countdown.** If we land here the panel must
   set `stale=true` permanently and the countdown becomes a rough indicator, not
   a number to trust.

**Route 2 failing does not predict route 1.** External sharing restrictions and
third-party app access are separate controls in the Workspace Admin console. A
Workspace that blocks the former commonly permits the latter. Do not infer route
1 is dead from route 2 being dead — test it.

~~**The OAuth client does not need to live in the Balcom org.** Create it in a
personal Google Cloud project and authorise the work account against it. Only
the consent step touches Balcom policy.~~
**SUPERSEDED 2026-08-17 — tested and wrong.** A client owned by a personal
Cloud project is a **third-party app** to Balcom's Workspace, and Balcom blocks
those: consent returns *"This app is blocked. This app tried to access
sensitive info in your Google Account."* — Google's `admin_policy_enforced`
screen, which has no click-through. Text kept per the no-tidying rule.

**Route 1a — the OAuth client lives IN the Balcom org. CURRENT PLAN.**
A client owned by a Cloud project inside `balcomagency.com` is an **internal
app**, and "trust internal apps" is on by default in the Admin console. Ricky
has Console access on the work account and has already used this route for
n8n calendar access, which is the evidence it is permitted.

This is simpler than the personal-project route, not a compromise. With
consent-screen **User Type: Internal**:
- **No 7-day refresh-token expiry.** That limit applies to External apps in
  Testing. An ambient display that needs re-consent every week is not ambient.
- No verification, and no "unverified app" interstitial.
- No test-user list — internal means any `balcomagency.com` account.

The one prerequisite: the new project's **Organization must read
`balcomagency.com`**, not "No organization". If the picker offers no org, then
project creation is restricted and the fallback is asking IT to allowlist the
client id under Security → API controls → App access control.

**Cost to note:** the Cloud project is Balcom property. It disappears if Ricky
leaves, and IT can see the client in the Admin console app list.

**To test it** (the flow is already written — `src/auth/`):
1. Google Cloud console as **`ricky.cadden@balcomagency.com`**, new project —
   **verify the Organization field reads `balcomagency.com`.**
2. Enable the Google Calendar API.
3. Google Auth Platform → Audience → User type **Internal**. Do not publish;
   do not add test users. Neither applies to an internal app.
4. Clients → Create client → type **Desktop app**.
5. Put the client id/secret in `.env`, then `npm run auth` and sign in **as the
   Balcom account**.

Success prints every visible calendar with its real id and `accessRole`. That
listing is the verification: it proves the token works, proves Balcom permits
third-party app access, and shows whether the shared-in personal calendar
arrives with full details or only free/busy. A `freeBusyReader` role means no
event titles — reshare with "See all event details" if so.

`src/sources/gcal.js` is a provider interface so all three routes drop in
interchangeably. Nothing else in the build depends on which one we get.

## Brand & Design
- **Aesthetic:** flat near-black ground, monospace throughout, no gradients
  beyond a sub-3% vertical lift, no photographic background.
- **Palette:** ground and text hues are derived from the current Windows
  wallpaper; **the accent hues are pinned** (`HERO_HUE` / `COOL_HUE` in
  `src/palette.js`, overridable per run). Lightness is always forced and every
  token is gated on contrast against the ground before it ships.
  **Wallpaper proposes, contrast vetoes, Ricky overrules.**
- **Contrast floors are per role, not uniform** — `--accent-hero` ≥ 4.5:1,
  `--accent-cool` ≥ 7:1, `--text` ≥ 7:1, `--text-dim` ≥ 4.5:1, `--text-faint`
  ≥ 3:1. The hero's floor is lower *because of the size it is used at*: the
  countdown is 106px, where WCAG's large-text AAA threshold is 4.5:1. A uniform
  7:1 is not achievable by any saturated blue — luminance weights blue at
  0.0722, so the gate drags it to cyan and then to pastel. That is exactly how
  the first blue attempt produced a washed-out `#47cff5`.
- **The accents are two shades of one hue family**, separated by saturation and
  lightness rather than hue. They land on adjacent rows in the agenda list
  (`is-now` above `is-next`), and a 20-degree hue difference does not survive
  6.86" read from three feet.
- Regenerate with `npm run palette`. `web/tokens.css` is generated — never
  hand-edit it.
- Type scale is tuned for 6.86" read from ~3 feet, not for a desktop monitor.

## Lessons Learned
- **2026-08-17 — A process can log `fatal`, keep running, and report success.**
  `main().catch()` set `process.exitCode = 1`, but by then the HTTP server was
  listening and the intervals were armed, so Node had work left and never
  exited. The scheduled task reported result 0, `node.exe` was alive, nothing
  was pushed, and the panel sat on its vendor logo. Every health signal said
  fine. A fatal path must call `process.exit()`.
  **Standing rule: a dead daemon must LOOK dead.** Anything that supervises it —
  Task Scheduler, a status command, you at a glance — can only act on what it
  can observe, so "degraded but alive" must never be indistinguishable from
  "working".
- **2026-08-17 — A scheduled task inherits no shell environment, and that is
  where the first logon run died.** `PLAYWRIGHT_BROWSERS_PATH` had only ever
  been exported by hand in a terminal, so Chromium was not where Playwright
  looked. **Standing rule: anything the daemon needs lives in `.env`, never in
  a terminal that happened to export it.** `.env.example` is the contract;
  `.env` must actually exist on any machine that runs the daemon unattended.
- **2026-08-17 — An unattended path is only verified by running it unattended.**
  Both bugs above were invisible to code review and to `npm start` in a
  terminal. They appeared on the first real logon-task run because the trigger
  was an environment difference. This is the same rule as "accepted is not
  displayed", one layer up.
- **2026-08-17 — `node --test` with no arguments discovers `*-test.js`**, so it
  swept in `src/transport/idle-test.js` and drove the real panel for 68
  seconds. The test script uses a scoped glob.
  **Standing rule: the test command must never be able to touch hardware.**
- **2026-08-17 — Windows scripting has two traps worth remembering.**
  PowerShell variables are case-insensitive, so a local `$action` collides with
  a `[ValidateSet]` `$Action` parameter and fails on assignment. And
  `powershell.exe` reads a BOM-less `.ps1` as ANSI, so a single em-dash in a
  comment becomes a parse error several lines later. Keep `scripts/*.ps1`
  ASCII-only.
- **2026-08-17 — All-day events span local midnight to local midnight**, so any
  "is this happening now" test returns true for the whole day. One US Holidays
  entry would have owned the hero slot from midnight to midnight and hidden
  every real meeting. All-day events are context, never focus.
  **The wider point: mock data that omits a case cannot warn you about it.** The
  mock now carries an all-day event for exactly this reason.
- **2026-08-17 — The panel reverts to its logo ~3s after the last frame.** The
  USB handle being open is irrelevant; only time-since-last-frame counts. This
  turns "never render blank" into "never *stop* rendering" and forces the push
  loop to be independent of the render loop. Measured with `npm run idle-test`,
  which exists so the number can be re-derived rather than trusted.
  **Standing rule:** any behaviour a device exhibits that we can't explain gets a
  committed diagnostic script, not a note. The script survives a firmware
  revision and a replacement unit; the note doesn't.
- **2026-08-17 — "Accepted" and "displayed" are different claims.** The very
  first frame push reported 81/81 chunks written with no errors while the panel
  showed nothing, because a bad `readTimeout` call had silently skipped the
  handshake. Transport success proves bytes moved, never that pixels changed.
  Any transport tool must say so out loud and ask for eyes on the glass.
- **2026-08-17 — Never use the wallpaper as a bitmap background.** The
  screenshot that inspired this project did, and the type was unreadable. The
  wallpaper's own dominant colours were measured at brightness 0.72–0.84. Hue
  is the only safe thing to inherit from an arbitrary image.
- **2026-08-17 — OneDrive sync locks build artifacts.** Inherited from
  `desktop-companion`, which had to redirect Cargo output outside OneDrive.
  Keep `node_modules`, Playwright browsers, and caches out of sync scope or
  expect intermittent EPERM/EBUSY. Playwright's browser download is redirected
  via `PLAYWRIGHT_BROWSERS_PATH` — see `.env.example`.
  **Superseded 2026-08-17 (same day): the repo moved out of OneDrive entirely**
  — see below. The redirect is kept anyway, because it costs nothing and the
  browser cache has no business inside a project directory.
- **2026-08-17 — Redirecting each offender out of a synced folder is losing
  strategy; move the project instead.** Peripheral lived in
  `OneDrive\Agent_Workspace\` and accumulated a workaround per artifact: tokens
  to `%LOCALAPPDATA%`, Playwright to `C:\dev`, and a `frames/` directory that at
  1 fps would have written **86,400 files a day** into sync scope. Each fix was
  correct and the list was still growing. Moving the working copy to
  `C:\dev\peripheral` retired the whole class at once.
  **The tell:** if a project needs a second redirect to keep a synced folder
  happy, the folder is the problem, not the artifact.
- **2026-08-17 — A cloud-synced folder is not a backup, and this repo had no
  remote at all.** OneDrive was the only copy of the entire project — file
  history is not version control, and a sync client will happily replicate a
  deletion. Fixed by pushing to a private GitHub repo. **Standing rule: a
  project gets a remote on day one, before it gets features.**
- **2026-08-17 — Don't trust `python` on PATH on Windows; the launcher is `py`.**
  `python.exe` resolves to the Microsoft Store stub alias, which prints an
  install message and exits 49 — it does not fail like a missing command.
  `py` is the real launcher. This was already recorded in
  `Agent_Memory/agent_memory.md` under Spotify History; I should have read it
  before concluding anything about Python.
- **2026-08-17 — CORRECTION to the runtime rationale.** The stack table
  originally justified Node by claiming *"Python is NOT installed."* **That was
  wrong.** Python **3.14.2** is installed and reachable via `py`, with pip 25.3
  (`C:\Users\grcad\AppData\Local\Python\pythoncore-3.14-64`). Only `uv` is
  genuinely absent. The decision to use Node stands, but on these grounds
  instead:
    1. The panes are HTML/CSS/JS no matter what, so Node means one language
       end to end rather than a Python daemon shelling to a JS frontend.
    2. The server is dependency-free and already runs on a bare clone — no
       venv, no install step to get a look at the design.
    3. Python 3.14 is very new; native wheels (`hidapi`, imaging) frequently
       lag a fresh CPython release, and the transport depends on a native
       binding. `node-hid` on Node 24 is the lower-risk path.
  If the HID protocol turns out to be painful in Node, the two Python
  reference implementations are a legitimate fallback — this is a preference,
  not a constraint.
- **2026-08-17 — Reddit is unreachable via WebFetch and blocked in the in-app
  browser, but loads in Chrome via `old.reddit.com`.** The modern React
  reddit.com renders blank to automation; `old.reddit.com` is server-rendered
  and yields full comment text.

## Reference
- Protocol reference (do not vendor, read): https://github.com/Lexonight1/thermalright-trcc-linux
- Same panel, macOS, Python: https://github.com/christensen143/claude-trofeo-hud
- Origin thread: https://old.reddit.com/r/ClaudeAI/comments/1vk88m5/38_claude_lcd_table_display/
