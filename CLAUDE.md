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

**Hardened 2026-08-18 after its first real overnight.** The first cold boot
produced a total outage: `node-hid`'s `write()` is synchronous, so a USB
endpoint that stopped draining pinned the daemon's only thread and the panel sat
on its vendor logo while every health signal read `ok`. **The transport now runs
on a worker thread and owns its own push cadence**, a stall reports as
`panel=STALLED <n>s`, and `npm run stall-test` injects the fault so the recovery
paths are exercised rather than assumed. The OAuth token also refreshed
unattended overnight — the last genuinely unknown thing about Sprint 1.

**Sprint 2's build item shipped 2026-08-18** — the "and then what?" middle
column, iterated against live feedback across the whole day, including a
round driven by an actual photo of the glass (list truncation, tick
alignment, meta line stacked and then re-stacked twice more). Along the way,
found and fixed that the daemon never reloaded edited pane code on its own —
it now watches `web/` and reloads automatically.

**Overlap precedence — the other `NEEDS RICKY` item — got its conversation
2026-08-18, built from Ricky's real calendar rather than hypotheticals.**
Three rules shipped: a named duration override for one recurring meeting
that runs shorter than it's booked, a tiebreak change (latest start wins,
not ending soonest), and personal-calendar events demoted-by-default unless
claimed by name or a matching work-calendar block. Explicitly not settled —
Ricky expects ongoing tuning both in the logic and in how he titles future
calendar entries.

**Sprint 2 — Agenda, second pass — is COMPLETE, 2026-08-18.** Ricky: "consider
Sprint 2 completed. We'll work on Sprint 3 tomorrow (maybe)." Last item was
colour-coding by calendar — two new contrast-gated tokens, genuinely different
hue families from the phase-urgency blues (Ricky rejected the roadmap's own
"shades of one hue" guess: "I want completely different colors. Contrast is
the point"), applied to the agenda list's title AND timestamp after two rounds
of "not visible enough." The accent blue/type scale revisit also closed this
session ("good for now, mark them as complete"). Two things carried forward
rather than force-closed: overlap precedence stays a living, ongoing-tuning
system rather than a finished deliverable, and whether `focusTime`/
`outOfOffice` should ever take the hero slot is still open. Also queued,
not yet scheduled to a sprint: **the colour palette itself needs a rework**
— green/pink cleared the contrast gate but weren't a considered final choice.

**The roadmap was renumbered 2026-08-18** — Sprint 2 bundled agenda polish with
a multi-pane system and is now split into Sprints 2, 3 and 4; the release sprint
moved from 3 to **5**. A mapping table for the dead labels is at the top of
`directives/roadmap.md`, along with a **Standing watch** list of things that
cannot be closed by working on them. See the handoff.

**Sprint 3 opened 2026-08-19/20 with weather — then Sprints 3 and 4 both
closed as NOT PURSUING, same day.** `NwsProvider` (free, keyless NWS API,
hardcoded to Ricky's real address) shipped as a redesigned three-panel top
bar on the *existing* agenda pane, confirmed on the glass ("looks good"),
and Ricky decided that was the right shape, not a compromise: *"having the
weather in the header replaces the need for a weather pane."* Followed
immediately by the bigger call: *"I don't know that adding a second pane
does much for me in terms of value — the calendar/meetings pane is super
useful as-is."* **The multi-pane system (Sprint 3's pane cycling, all of
Sprint 4) is not being built.** Not deleted from the roadmap — struck
through and dated per the no-tidying rule — but the project's shape going
forward is one pane, richer, not several panes cycled between. "Tomorrow's
first event" survives as a Future Exploration, reframed as an agenda-pane
addition rather than a new pane, since it never needed cycling anyway.

**Sprint 5 opened the same day with the colour palette rework, queued since
Sprint 2.** Two live-iterated candidates (teal/rose rejected — "I don't like
the teal"; a first orange attempt caught before ever reaching the glass, at
25°, nearly on top of the fixed `--stale` badge, measured not eyeballed)
before Ricky's actual direction: *"I want the blue to be my work calendar
and the orange to be my personal calendar."* A deliberate reversal of the
2026-08-18 rule that calendar colors must be genuinely different from the
urgency blues — blue now marks both "now/next" and "this is work," by
request, not oversight. **Confirmed on the glass: "Looking good."** See the
dated hue history in `src/palette.js`.

**Sprint 5's colour picker shipped 2026-08-20** — `/settings/palette/`,
served alongside the existing panes, never reachable through the daemon's
own Renderer (confirmed by reading `render.js`: it holds exactly one
Playwright page, and nothing calls `goto()` with the picker's URL). Live
preview overrides CSS custom properties on an embedded `<iframe>` of the real
pane, in-browser only, zero disk writes until Save — verified live against
the running daemon, not just unit tests. `daemon.js`/`render.js` needed no
changes at all; the existing `web/` file watcher already does the rest.
See `directives/roadmap.md`'s Sprint 5 entry for the full verification list
and the one honestly-scoped gap (picker choices aren't re-applied by the
bare CLI, only by the picker's own Save path).

**Sprint 5 closed 2026-08-20 — the repo is public.** One-command setup
(`npm run setup`), a rewritten README with a privacy-reviewed real photo,
and a weather-location picker (zip code → NWS grid, same free/keyless
pattern as the colour picker, added mid-sprint on request) all shipped.
Second panel support was dropped, not silently — no hardware to build
against. Ricky reviewed `dev` on GitHub directly, had `main` fast-forwarded
to match while staying private, reviewed again, then gave the flip:
*"go ahead and make it public."* `LICENSE` (MIT) added, a final full-history
secret scan came back clean, and `gh repo edit --visibility public` made it
real — confirmed via `gh repo view`. **Repo:**
[`github.com/rcadden/peripheral`](https://github.com/rcadden/peripheral).

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

**Sprint 6 — Supervision — opened and closed 2026-08-24, by a failure.** The
morning after Sprint 5 shipped the public repo, the panel was on its vendor
logo and had been for 31 minutes. The daemon had died at 07:47:16 mid-stream
and **nothing restarted it, because nothing could have.** `hidden.vbs`
launched it detached, so `wscript.exe` exited 0 a second after logon and Task
Scheduler spent the entire outage reporting `Ready / LastTaskResult 0` — its
`RestartOnFailure` was bound to a process that always succeeded immediately.
Fixed in three layers: the exit code now survives `cmd` (`echo` was resetting
`%ERRORLEVEL%`), `hidden.vbs` waits and **relaunches crashes itself** — because
Task Scheduler's restart-on-failure was measured *not* to fire on a non-zero
exit code, only on a failure to launch — and a new **"Peripheral Watchdog"**
task probes `/api/health` every 5 minutes for the deaths the launcher cannot
see. Every path verified by killing the real daemon; **"Glass checks out."**
The 07:47:16 death itself is **still unexplained** — made survivable, not
diagnosed.

**Sprint 7 — Display orientation — opened and closed 2026-08-28/29.** Ricky
mounted the panel upside down and asked for the display to be rotated; it
became a settings feature the same session on his follow-up. **Confirmed on
the glass** — *"I checked the panel yesterday, the rotation looked good."*
Rotation is a render-time flag on the pane URL (`?rotate=180`), never a
stylesheet edit, so the frame pushed to the glass rotates while the page a
human opens in a browser stays upright and readable. Settable at
`/settings/palette/`, persisted to `display.json`, applied by a file watch
**without a daemon restart**. A picker-saved value beats `PERIPHERAL_ROTATE`
— a deliberate inversion of `palette.js`'s env-always-wins rule, reasoned in
`src/display-settings.js`. 0 and 180 only: a quarter turn needs a 480×1280
pane, not a transform.

~~**THE PANEL IS DEAD, OR ITS CABLE IS — 2026-08-29, day 13.**~~
**CORRECTED SAME DAY — NOT A HARDWARE EVENT.** Ricky had unplugged the panel:
*"I took my laptop downstairs and the panel is attached to my external
monitor."* The observations were real (absent from Windows PnP, `The device is
not connected`, ~12h of flicker in the log); the conclusion drawn from them was
not. **This does not count on the hardware failure curve.** It is the second
time this exact mistake has been made — see the struck-through 2026-08-19 row
in `CHANGELOG.md` — and the rule that now exists for it is in Lessons Learned.

**What survives is Sprint 8, better grounded than before.** During the
disconnect, `/api/health` answered `{"ok":true,"hasState":true}`, the watchdog
logged 1,176 lines without one non-`ok` entry, and the logon task sat in
`Running`. All correct, all answering a question nobody asked. **An ordinary
Saturday — picking up the laptop and walking downstairs — is indistinguishable,
in every signal this project emits, from catastrophic hardware failure.** One of
those two things happens most days. Sprint 8 stays scoped to **log loudly, do
not act**: a watchdog restarting the daemon on `panel=down` would have spent the
afternoon restarting a healthy daemon because its owner went downstairs.

> **Starting a session? Read
> [`docs/plans/session-handoff-2026-08-29.md`](docs/plans/session-handoff-2026-08-29.md)
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
| **Note 2026-08-29** | **The panel lives on the external monitor at the desk, and the laptop moves.** An unplugged panel presents in the logs exactly like a dead one — `not enumerating`, absent from Windows PnP. **Confirm it is physically connected before concluding anything about the hardware.** Corrected twice now (2026-08-19, 2026-08-29). |

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
Secrets live in `.env` (gitignored) and a local token store. **This repo is
public** (since 2026-08-20), so nothing real is ever committed. `.env.example`
is the contract.

| Value | Status |
|---|---|
| Google OAuth client ID / secret | **NOT YET CREATED.** Create as **Desktop app** in a *personal* Cloud project, not Balcom's. Flow is written — `npm run auth`. **`.env` now exists with these two lines blank**; fill them in there. |
| Repo location | **`C:\dev\peripheral`** — deliberately NOT in OneDrive. See Lessons Learned. |
| Remote | [`github.com/rcadden/peripheral`](https://github.com/rcadden/peripheral) — **public since 2026-08-20** (was private through Sprint 5, per the original plan). Treat every commit as public from now on — history isn't cleaned retroactively. |
| Token store | `%LOCALAPPDATA%\Peripheral\tokens.json` — **outside the repo on purpose.** A refresh token has no business in a project directory. Override with `PERIPHERAL_TOKEN_PATH`. |
| Personal calendar | `grcadden@gmail.com` — confirmed reachable. Also natively shared **into** the work calendar, which is how the primary gets it. |
| Work calendar (Balcom) | **PRIMARY account — critical path.** Direct OAuth, untested. Sharing work→personal is confirmed blocked; see below. |
| Display settings | `%LOCALAPPDATA%\Peripheral\display.json` — panel orientation saved by `/settings/palette/`. **Beats `PERIPHERAL_ROTATE`**, which is only the default. Override the path with `PERIPHERAL_DISPLAY_PATH`. |
| State cache | `%LOCALAPPDATA%\Peripheral\last-state.json` — last-good agenda, restored at boot. Holds real event titles, so **outside the repo**; this repo goes public. Override with `PERIPHERAL_STATE_PATH`. |
| Daemon log | `%LOCALAPPDATA%\Peripheral\daemon.log` — written by the logon task, rotated at 5MB. `npm run startup:logs` |
| Watchdog log | `%LOCALAPPDATA%\Peripheral\watchdog.log` — one line per 5-minute check, healthy ones included, rotated at 1MB. `npm run watchdog:logs`. **First thing to read after any morning the panel looked wrong.** |
| Scheduled tasks | **Two**, both registered by `npm run startup:install`: `Peripheral` (logon+30s, sits in `Running` for as long as the daemon lives) and `Peripheral Watchdog` (every 5 min, plus logon+3m). |
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
- **2026-08-29 — SECOND OCCURRENCE: an unplugged panel is indistinguishable
  from a dead one, and the exclusion test that exists for this does not cover
  it.** The session-close gate found `panel=down`, the device absent from
  Windows PnP, `The device is not connected`, and ~12h of flicker in the log,
  and concluded the hardware had died on the reviews' predicted curve. Ricky:
  *"I just unplugged the panel cause I took my laptop downstairs and the panel
  is attached to my external monitor."* Every observation was accurate. The
  conclusion was invented.
  What makes this worth writing down rather than shrugging off: **the project
  already had this exact correction on file**, struck through in
  `CHANGELOG.md` under 2026-08-19 — *"the panel was simply not physically
  connected this session"* — and the 2026-08-24 entry had already added a
  guard for the failure log: *before adding anything to this curve, confirm
  the daemon was actually alive and pushing at the time.* **That check was
  run, and it passed.** It rules out one wrong cause (a dead daemon) and says
  nothing about the other (an absent cable). A guard that covers the last
  mistake is not a guard against the next one.
  **Standing rule: `not enumerating` is a statement about the USB bus, never
  about the health of a device. Before attributing it to hardware, establish
  the panel is plugged in — and when that cannot be established from a
  session, ASK, because it is one question with a definitive answer.** More
  generally: a diagnosis that concludes "the hardware is dead" should be the
  last resort after the boring causes, and the most boring cause of a missing
  USB device is that nobody plugged it in. Cost of the error is not the wrong
  guess, it is what gets built on top — a failure-log entry, a hardware-spend
  question, and a paragraph of alarm in three documents.
  **What survives, and is better for it: the supervision gap is real.** During
  a routine unplug, `/api/health` answered `ok`, the watchdog logged 1,176
  lines with no non-`ok` entry, and the logon task sat in `Running`. The right
  framing is not "a dead panel went unnoticed" but **"an ordinary Saturday is
  indistinguishable from catastrophic failure in every signal this project
  emits"** — and the ordinary version happens most days. That also settles
  Sprint 8's scope: **log, never act.** A watchdog restarting on `panel=down`
  would have restarted a healthy daemon all afternoon because its owner
  carried a laptop downstairs.
- **2026-08-29 — RECURRENCE of the 2026-08-24 supervision rule, one layer
  out: every health signal in this project reports the DAEMON, and the thing
  Ricky cares about is the PANEL.** The panel was dark for roughly twelve
  hours. Throughout, `/api/health` answered `{"ok":true,"hasState":true}`,
  the watchdog wrote 1,176 lines without a single non-`ok` entry, and the
  logon task sat in `Running` exactly as designed. Every one of those signals
  was **correct** — the daemon really was alive, really was answering, really
  was rendering. They were also all answering a question nobody asked. The
  only place the truth appeared was `panel=down` in a 30-second heartbeat
  line in a log file, which is to say: nowhere a human would see it.
  Sprint 6's own standing rule called this shot and was applied too
  narrowly — *"a restart/monitor/health mechanism must be verified by
  observing the supervisor's own state while the supervised thing is
  running."* That was done, for the daemon. Nobody asked what the watchdog
  says while the **panel** is dead, because the watchdog was built during a
  daemon outage and the daemon became the implied subject.
  **Standing rule: a health check must be named for, and tested against, the
  failure of the thing the user actually experiences — not the process that
  happens to be convenient to poll.** When adding a supervisor, write down
  what it does NOT cover in the same commit; that sentence is the roadmap
  item for the next layer. **Corollary, and the reason Sprint 8 is scoped to
  log-only: a monitor must not act on a signal that a permanent fault can
  assert forever.** Restarting the daemon does nothing when the USB device is
  physically gone, so "restart when the panel is down" would have produced an
  endless restart loop on top of a dead panel — a second failure stacked on
  the first, caused by the fix.
- **2026-08-29 — A preview of a setting that cancels a physical condition
  shows the one form nobody ever sees.** The display-orientation control was
  first built with a live preview: select 180, watch the pane rotate in the
  settings iframe. It felt obviously right and was wrong, because **rotation
  exists to cancel an upside-down mount** — on the actual glass, a correctly
  set 180 panel reads UPRIGHT. The preview faithfully showed the frame as
  transmitted, which is precisely the form that never reaches anyone's eyes,
  and it did so by turning the browser fallback upside down: the exact
  outcome the URL-flag design was chosen to prevent. Two rules collided and
  the newer one lost on contact with what it was for.
  **Standing rule: before building a preview, ask what the user sees at the
  far end of the pipeline, not what the system emits.** For settings that
  compensate for a physical property — orientation, colour temperature,
  brightness against ambient light — the emitted form and the perceived form
  are different, and only the second one is worth showing. When they differ
  and the real thing is available, say so and point at it: the control now
  reads *"the only honest confirmation is the panel itself."*
- **2026-08-29 — `Number('')` is `0`, so an empty value can arrive disguised
  as a deliberate one.** `parseRotation()` accepted the string form on
  purpose (env vars and form controls both deliver strings), and
  `Number(''.trim())` is `0`, which is a *valid* rotation. An empty form
  field or a blank JSON value would therefore have resolved silently to
  "Normal" — not an error, not a fallback, but a confident wrong answer that
  looks identical to someone choosing upright. Caught by a test written
  before the code was trusted, not by reading it.
  **Standing rule: when a coercion maps absence onto a legal value, reject
  the absence explicitly before coercing.** The dangerous cases are the ones
  where the coerced result is in range — `Number('')` → `0`, `parseInt('x
  ')` → NaN is loud, `Number(null)` → `0` is silent, `[] == false` is worse.
  This is the same family as the 2026-08-18 rule about proving a check can
  return something: a value that cannot be distinguished from a real answer
  is not a safe default.
- **2026-08-24 — A supervisor bound to the wrong process is not a supervisor,
  and it reports success the entire time it is failing.** The logon task
  launched the daemon through `hidden.vbs` with `WScript.Shell.Run`'s
  don't-wait flag, so `wscript.exe` exited 0 about a second after logon. Task
  Scheduler watches *that* process. The task therefore read `Ready /
  LastTaskResult 0` for the whole hour the daemon ran **and** for the half
  hour it was dead, and its `RestartOnFailure 3x1min` was bound to a process
  that always succeeded immediately — it could never fire, and never had. This
  silently defeated the guarantee `daemon.js` documents at length, *"a daemon
  that is dead must LOOK dead, so the task's restart-on-failure can fire."*
  The daemon did look dead. Nothing was looking.
  **Standing rule: a restart/monitor/health mechanism must be verified by
  observing the supervisor's own state while the supervised thing is
  running.** If the task does not sit in `Running` for as long as the daemon
  lives, it is not watching the daemon. This is the same shape as the
  2026-08-18 rule that *a timeout is evidence about the waiting party, not the
  awaited one* — here, a task result is evidence about the process the task
  launched, which is not necessarily the process doing the work.
  **Corollary, measured the same day: Windows Task Scheduler's
  `RestartOnFailure` responds to a task that fails to LAUNCH, not to an action
  that returns non-zero.** Tested deliberately, with the watchdog disabled so
  nothing could take the credit: daemon killed 08:33:14, task result correctly
  `4294967295`, still `Ready` with nothing restarted two minutes later. Do not
  design around that setting doing process supervision — it does not. The
  relaunch loop lives in `hidden.vbs`, and the liveness check in
  `scripts/watchdog.vbs`.
- **2026-08-24 — Reporting a status value can destroy it.** `run-daemon.cmd`
  ended with `echo [startup] ... daemon exited with code %ERRORLEVEL%`, which
  is wrong in a way that reads as obviously correct: **`echo` succeeds, and
  succeeding is what resets `%ERRORLEVEL%` to 0.** The line meant to report the
  exit code was the line that erased it, so `cmd` returned 0 for a daemon that
  had crashed, and every layer above it — `hidden.vbs`, the task, `startup:
  status` — faithfully propagated that lie.
  **Standing rule: capture a status value into a variable before doing anything
  else with it, including logging it.** Any diagnostic that reads the thing it
  is reporting on can clobber it, and `%ERRORLEVEL%` is the sharpest instance
  because *every* command touches it. `exit /b %RC%` is also required — without
  it a `.cmd` exits with the status of its last command, which is the echo.
- **2026-08-24 — Do not choose a file's mtime as a liveness signal on
  Windows.** The obvious watchdog design was "restart if `daemon.log` hasn't
  been written in N seconds." **NTFS defers last-write-time updates for files
  that are still open**, so a perfectly healthy daemon holding its log open can
  present a stale timestamp — and the watchdog would have killed it on a
  schedule. Measured on this machine the mtime happens to track the 30s
  heartbeat, which is precisely the trap: it would have looked fine in testing.
  The test run also produced the inverse hazard, unprompted — **the log read
  `0s old` while the daemon was dead**, because `run-daemon.cmd`'s exit banner
  had just been written to it. So the signal is unreliable in both directions.
  **Standing rule: a signal that is usually right is not a safe basis for
  something destructive.** The probe is `GET /api/health` instead, which is
  answered by the daemon's main thread and therefore cannot be faked by a file
  that some other process touched. mtime is still logged as context — useful to
  read, never decided on.
- **2026-08-24 — RECURRENCE of the 2026-08-18 "prove the check can return
  something" rule, twice in one session, once with the correct check already
  sitting in the repo.** Diagnosing the outage I checked for a live daemon with
  `CommandLine -like '*peripheral*'`. The daemon's command line is `node
  --env-file-if-exists=.env src\daemon.js` — **no such substring**, so that
  check could not have returned a hit whether or not the daemon was running,
  and I reported a confident absence from it. The conclusion happened to be
  right on other evidence (a 29-minute gap in a log that writes every 30s), but
  the check was worthless. **`scripts/startup.ps1` already contained the
  correct filter — `*src\daemon.js*` — and I wrote a worse one instead of
  reading it.** Then, later the same session, I ran `grep -P` to check a file
  for non-ASCII, `grep` errored out with *"-P supports only unibyte and UTF-8
  locales"*, and I read the `||` fallback branch as a clean pass.
  **Standing rule, strengthened: a check that returns "nothing found" must be
  proven capable of returning something, AND its exit status must be
  distinguished from its result** — `cmd || echo clean` reports a *crashed*
  check as a clean one. **And before writing an ad-hoc check for a thing the
  project already inspects, grep the repo for how it does it.** The existing
  answer is both correct and maintained; a fresh one is neither.
- **2026-08-20 — A `diff` against a file holding real secrets prints those
  secrets, and a verification step doesn't get a pass on that just because
  it's "only checking a restore worked."** While testing `scripts/setup.js`'s
  fresh-clone path (temporarily moving the real `.env` aside, running setup,
  restoring it), the restore-verification step ran `diff .env .env.example`
  to confirm the file came back — and printed the real, live
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in plaintext into the session
  transcript. The file itself was never damaged; the mistake was showing its
  contents at all. Ricky was told immediately and offered a secret rotation,
  which he deferred to handle himself later — recorded here as still
  outstanding, not resolved.
  **Standing rule: never `cat`, `diff`, `grep -P` (print mode), or otherwise
  echo the contents of `.env` or any file matched by this project's own
  gitignore secrets section, even for verification, even against a template
  file.** Confirm a secret-bearing file's state by structural checks only —
  line count, a specific key's presence via `grep -c` (count, not content),
  file size, mtime — never by printing the diff. This is the same class of
  mistake the git-status secret-scan step already guards against for
  commits; it was missed here because the operation was "just testing a
  script," not "about to commit," and the rule hadn't been generalized to
  cover ad-hoc verification commands.
- **2026-08-20 — Satisfying a roadmap item's REASONING is not the same as
  building what it asked for, and the gap survives a full build-and-verify
  pass if nobody re-reads the original ask at close time.** Sprint 3's
  weather item was written as "a weather pane — the proof [that cycling has
  something to cycle to]." What got built answers the underlying question
  (can the panel show more than the calendar, cheaply) but is not a pane —
  it's a redesigned bar on the existing agenda pane. Every verification this
  session passed: tests green, DOM clean, data correct, and Ricky confirmed
  it on the glass. None of that checks whether the shipped thing is the
  shape the roadmap actually asked for, because that's a different question
  than "does this work."
  **Standing rule: at session-close, re-read the original roadmap item's
  wording against what was actually built, not just against whether it
  works.** A feature can be fully verified and still leave its sprint's
  stated closing condition referring to something that no longer exists —
  here, "cycles between agenda and weather" now names a pane that was never
  made. Caught during Step 2 of `/session-close`, not during the build
  itself; worth checking earlier next time a roadmap item's build diverges
  partway through from its literal description.
- **2026-08-18 — A child's own `align-self` beats a parent's `align-items`,
  silently.** Wrapped list rows needed their bullet top-aligned instead of
  baseline-aligned, so `align-items: start` was added on the row. It did
  nothing — `.tick` already carried its own `align-self: center` for the
  single-line case, and align-self on a child always wins over align-items on
  its parent. The bullet kept floating at the vertical center of the whole
  two-line block. Found by Ricky on an actual photo of the glass, not by any
  of the same-session browser-DOM overflow checks, because overflow
  measurement doesn't catch "positioned in the wrong place but still inside
  its box."
  **Standing rule: when overriding alignment for a specific state, check
  every descendant for its own conflicting `align-self` — a parent-level
  override is invisible to a child that already set its own.** And a
  corollary about verification: automated overflow/overlap checks and a
  human looking at the rendered result are answering different questions;
  neither substitutes for the other.
- **2026-08-18 — The same layout bug hit twice in one session because the fix
  the first time wasn't generalized.** The "All day" branch in `renderHero()`
  originally built raw `<span>`s directly into `.meta`'s innerHTML with no
  wrapping element. Once `.meta` became `display: flex; flex-direction:
  column` (the meta-stacking redesign), each bare span became its own flex
  item and therefore its own stacked line — three spans meant to read as one
  line rendered as three. Fixed for that branch. Then, later the same
  session, the then-column's "Free time" branch — written before the
  meta-stacking redesign and never revisited — hit the identical bug: three
  bare spans, three unwanted lines, `.then` grew ~33px taller than its grid
  row and pushed all three panel columns past the footer.
  **Standing rule: any HTML inserted into a `display: flex; flex-direction:
  column` container must be wrapped in a single line-container element
  (`.meta-line` here) — a bare run of siblings will each become their own
  line, not stay on one.** When a container's display model changes (block
  → flex column, in this case), grep for every call site that writes into
  it, not just the one being actively edited — the fix landing in one place
  and not propagating is exactly what happened here twice.
- **2026-08-18 — A daemon that screenshots its own localhost page still needs
  telling to look at disk again.** The one structural decision this project
  keeps citing — "the daemon screenshots its own localhost URL" — has an
  unstated corollary: `renderer.open()` navigates the Playwright page exactly
  once, and nothing about editing `agenda.js`/`.css`/`.html` on disk touches
  an already-open page. Ricky reported "I don't see it on the live panel"
  after a real feature shipped; the daemon had been running since before the
  edit, so the physical panel kept screenshotting the DOM it loaded at boot.
  **Standing rule: an already-running renderer does not re-read source files
  on its own — something has to tell it to.** Fixed with a debounced
  `fs.watch` on `web/` in `daemon.js` that calls the (previously unused,
  built-for-pane-cycling) `renderer.goto()` on any pane-file change, rather
  than restarting the whole daemon — a full restart also bounces the HID
  device, which is not something to do reflexively on every CSS tweak. Code
  outside `web/` (`daemon.js`, `render.js`, etc.) still needs a real process
  restart; the watcher only covers pane files.
  **Corollary, same day: an async side-effect handler that can lose a race
  must retry, not drop.** The reload landed once exactly while a capture was
  in flight, logged `pane reload skipped`, and never tried again — the daemon
  kept serving stale code silently, distinguishable from a healthy reload
  only by a repeating `pageerror` line that reads like ordinary noise.
  Watchers, retries, and anything else triggered by an external event (a file
  change, a signal) should assume the event can land on a busy moment and
  retry on a short timer rather than silently accept the first outcome.
- **2026-08-18 — A layout dimension change invalidates every text-fit
  threshold downstream of it, and it will be missed if only the new layout is
  eyeballed.** The hero column's width changed three times in one session
  (722px → 516px → 387px, chasing first a new middle column, then "equal
  thirds" on request), and each time broke the countdown's length-based font
  breakpoints, because they encode *pixel widths measured at a specific
  column width*, not a proportional rule. The third narrowing needed a size
  tier (`len-xl`, later `len-xxl`) beyond anything the first two required —
  a two-tier ladder that was "clearly enough" at 516px was provably not
  enough at 387px.
  **Standing rule: when a container's width changes, re-measure every
  content-length-based sizing decision inside it, in the live page, against
  the new width — do not assume a previous tuning pass generalizes.** This is
  the same shape as the 2026-08-17 time-column lesson below, recurring at the
  level of an entire breakpoint ladder instead of one constant.
  **A sub-case of this bit twice in the same session and is worth naming on
  its own: a padded element's fitting budget is `container width − padding`,
  not `container width`.** `remainingSizeClass()` initially sized text against
  the hero's full 387px column, but the "happening now" badge it renders into
  carries its own 16px-per-side padding — a budget the sizing function had no
  way to know about. "26 MIN LEFT" measured 419px total against a 387px
  column before this was caught by the same in-page overflow measurement used
  everywhere else this session. **Any size-fitting function needs the actual
  rendering budget passed in, not the outer container's width by default.**
- **2026-08-18 — A feature request evaluated against one calendar shape can
  be wrong against another, and the fix is to check with the person, not to
  guess harder.** The "and then what?" column's first design always led with
  the next meeting's own length and title. It read fine against the shape
  used to build and check it. Live, mid-meeting, it produced "Up Next:
  Ricky / Nick 1:1" while Ricky actually had a 30-minute break in front of
  that meeting — the more useful fact (there's a gap) was buried under a fact
  that was true but not what mattered. He caught it immediately because he
  was looking at the real thing while it was wrong, not because the design
  was reviewed harder before shipping.
  **Standing rule already in this file, reconfirmed: only eyes on the actual
  glass close a UI decision, and a browser-DOM check against live data — no
  matter how careful — answers "does it render correctly", never "is this the
  right thing to show."** Both questions matter and neither substitutes for
  the other.
- **2026-08-18 — A measurement is only valid for the state it was taken in, so
  record the state alongside the number.** The 2026-08-17 lesson below correctly
  demanded that a layout claim be re-measured in the page rather than trusted,
  and recorded `.event`'s time column at **76.9px**. That number was real and
  reproducible — **at 16px type.** The row ships at 24px, where the same string
  is **114.42px**, and the `104px` column it was vouching for overflowed into
  the title. `104px` is correct at 16px (76.28px) and at 20px (95.36px) and
  wrong at 24px. So the previous session obeyed the rule, got a true number, and
  still shipped the bug, because the number silently belonged to a different
  type scale.
  **Standing rule: a recorded measurement must carry the conditions that make
  it meaningful — type size, font, viewport, data — or it is a number with no
  claim attached.** And prefer deleting the constant to re-tuning it: the fix
  here is `max-content` on the list plus `subgrid` on the rows, which cannot
  fall behind a type change at all. A fixed px that must track another value is
  a bug with a timer on it.
  Corollary found while fixing it: **`max-content` on a row is not a column.**
  Each `<li>` is its own grid, so it resolved per row (88.58px vs 114.42px) and
  misaligned the list. Shared geometry needs shared grid — that is what subgrid
  is for.
- **2026-08-18 — A single sample cannot measure a spike, and the spike is
  always the thing you care about.** The heartbeat reported `lastPush`. The
  worker completed a **4012ms** push and then a **4ms** push before the main
  thread got a turn, so `lastPush` read **4ms** and the only push that mattered
  left no trace. Polling harder does not help: both reports land in the same
  event-loop turn and the second overwrites the first before any timer runs.
  **Standing rule: peaks must be recorded at the point every value is seen, not
  sampled by an observer on its own clock — and a health metric should report
  the worst value in the interval, not the last one.** The heartbeat now reports
  `worstPush`, drained each interval. Found by `npm run stall-test`, not by
  reading the code.
- **2026-08-18 — If a recovery path cannot be triggered on demand, build the
  trigger.** The worker-thread fix shipped with slow-push detection, reopen, the
  stall alarm and the respawn all unexecuted, because a wedged USB endpoint
  arrives unannounced and cannot be requested. That is how branches stay in the
  "written but unverified" tier permanently. `npm run stall-test` injects the
  fault with `Atomics.wait` — chosen because it blocks the thread synchronously
  and uninterruptibly, the exact shape of a stuck native call, where a
  `setTimeout` would prove nothing precisely because it yields.
  **Standing rule: fault injection belongs in the product, guarded by env, not
  in a test fixture** — it is the only way the real recovery code gets exercised,
  and it immediately paid for itself by exposing the `lastPush` defect above.
  This is the same rule as `npm run idle-test`, generalised from "behaviour we
  can't explain" to "behaviour we can't reproduce".
- **2026-08-18 — Two loops on one thread are one loop, and a synchronous native
  call is what proves it.** The daemon's central design is a push loop that
  "can never be blocked by anything," documented at length at the top of
  `daemon.js`. It is blocked by exactly one thing, and that thing is in the push
  loop itself: **`node-hid`'s `write()` is synchronous.** `push()` fires ~81
  blocking writes in a bare `for` loop, so a USB endpoint that stops draining
  pins the entire process — render loop, HTTP server, source timer and all.
  Measured: `/api/state`, a cached object served by `node:http`, **took 36.6
  seconds** to answer, against 138ms once healthy. Process CPU was near-idle
  throughout, because a thread blocked in the kernel burns nothing.
  **Standing rule: separating two loops into two timers separates nothing.
  Concurrency in Node comes from yielding, so any native binding on the hot path
  must be proven async or moved to a worker thread — and "the docs say it
  returns quickly" is not proof.** The rule generalises past this device: the
  same trap is waiting in any sync native call the daemon ever adds.
- **2026-08-18 — When one component starves, the loudest failure will be in a
  different component.** The visible errors were five
  `page.screenshot: Timeout 2000ms exceeded`, so the daemon dutifully tore down
  a **completely healthy** Chromium and then could not rebuild it. Playwright's
  timeout is measured on the same event loop that was blocked, so it fired
  without Chromium ever being slow. Every arrow pointed at the renderer; the
  fault was in the transport.
  **Standing rule: a timeout is evidence about the waiting party, not the
  awaited one.** Before acting on a component's failure count, establish that
  the component was actually given a chance to run — and prefer a health check
  that measures the shared resource directly (loop latency) over one that
  accumulates per-component failure tallies. Corollary already logged elsewhere
  in this file and violated again here: the heartbeat printed
  `panel=ok renderer=down` when the truth was precisely inverted.
  **Appended 2026-08-18, same day: the stall detector written to enforce this
  rule broke it on its first run.** `PanelProxy` announced
  `TRANSPORT STALLED — no push completed for 3s` while the worker was pushing
  perfectly, because the *main thread* was launching Chromium and had not
  drained the worker's messages. Worker status arrives on the main thread's
  event loop, so "time since the last message we handled" silently conflates
  *it stopped sending* with *we stopped listening* — the identical error, one
  layer up, committed within the hour by someone who had just written the rule
  down. Fixed by subtracting measured main-thread lag before attributing any
  silence. **The practical form of the rule: any silence- or timeout-based
  health check must first establish that the observer was awake for the
  interval it is judging.**
- **2026-08-18 — A failed lookup is not an absence, and reporting it as one
  manufactures a finding.** While diagnosing the above I checked for Playwright's
  browser process, found no `chrome.exe` outside Program Files and no
  `headless_shell.exe`, and stated as a conclusion that Chromium had died and
  could not relaunch. The binary is **`chrome-headless-shell.exe`**; eight were
  running the whole time. Two wrong guesses at a name became a confident claim
  about the world.
  **Standing rule: when a check returns nothing, first prove the check can
  return something.** Enumerate broadly (`ExecutablePath -like '*ms-playwright*'`
  across all processes) before concluding a thing is missing. This is the same
  shape as the `openBrowser()` lesson below — *verify what you actually sent
  before blaming the other end* — and it recurred within a day, which suggests
  the class needs watching rather than the instance.
- **2026-08-18 — The unknown that gets answered is the one written down with a
  reproduction.** This failure was predicted. `CHANGELOG.md` carried
  *"Whether the push loop holds up when the PC is busy… **suspect the render and
  push timers competing on one event loop.** Reproduce by loading the CPU and
  watching the heartbeat deltas."* That note pointed at the right thread and the
  right file, and made the real event legible in minutes instead of hours — even
  though its stated mechanism was **wrong** (not timers competing; one sync call
  blocking). A hypothesis that is close and falsifiable beat having no note at
  all by a wide margin.
  **Standing rule: record suspected mechanisms in Known unknowns even when
  unsure, and always with the command that would confirm or kill them.** Then
  when the answer arrives, mark the entry answered and say plainly which part of
  the guess was wrong — the correction is the part with teaching value.
- **2026-08-17 — A comment that promises a layout constraint is a claim with an
  expiry date.** `.event`'s time column carried "must hold the widest form —
  `12:30 AM`" beside a hard-coded `104px`. That number was tuned when the row
  was 20px type; by the time the row reached 24px nobody had re-checked it, and
  the comment still read as reassurance. It happened to still fit — measured in
  the page at **76.9px**, not estimated — but that was luck, not verification.
  **Standing rule: when a comment asserts that a fixed value satisfies a
  constraint, re-measure it in the page rather than trusting the sentence, and
  write the measured number into the changelog** so the next person changing
  the size has a figure to check against instead of prose.
  Related: `.bar` carried a fixed `height: 22px` that silently clipped the
  instant the bar type doubled. **A fixed dimension on a container whose
  contents can be resized is a latent clip** — prefer content-driven height and
  let a `flex: 1 1 auto` sibling absorb the change.
- **2026-08-17 — A local bug can masquerade as a remote policy decision.**
  `openBrowser()` ran `cmd /c start "" <url>` unquoted, and **cmd treats `&` as
  a command separator**, so the browser received only `...?client_id=XXX`.
  Google replied `invalid_request: Required parameter is missing:
  response_type` — an accurate description of what it got. An earlier attempt
  produced *"This app is blocked"*, which was read as a Workspace restriction
  and reported to Ricky as one. It was not evidence of anything.
  What made it expensive: **the URL printed to the terminal was correct the
  whole time, and pasting it by hand worked.** Only the auto-open path was
  broken, so every symptom pointed outward at Google.
  **Standing rule: before concluding that a remote system rejected you, verify
  what you actually sent it.** A request you never inspected is not evidence
  about the other end. Fixed with `rundll32 url.dll,FileProtocolHandler`, which
  spawns directly and involves no shell; four tests now guard the argv shape.
- **2026-08-17 — Mock data is well-formed by construction and will never warn
  you.** Real calendars arrived with three things the mock had no concept of:
  concurrent events (making "which live event is the hero" a real decision —
  it is the one *ending soonest*, not starting first), Google's metadata event
  types (`workingLocation` cost a row every weekday), and autocompleted postal
  addresses long enough to reflow the layout through the progress bar.
  **Standing rule: when a fixture is added for a case real data revealed, add
  it to the MOCK too**, so the browser fallback exercises the same shape. The
  mock now carries an all-day event for exactly this reason.
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
