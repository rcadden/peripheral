# Peripheral

## Project Name & North Star
**Peripheral** — *your life, in the corner of your eye.* An ambient panel on a
1280×480 USB LCD that shows what's actually next, readable at a glance from a
few feet, without being asked. Named for the double meaning: it is literally a
USB peripheral, and it is built for peripheral awareness.

Success in one sentence: **Ricky stops opening Google Calendar to find out
whether he has a meeting soon.**

## Status
Sprint 1 — Foundation. Agenda pane renders at true size on mock data; palette
extraction working. Hardware arrives **2026-08-18**; transport unwritten.

## Hardware — read this before touching the transport
**Thermalright Trofeo Vision LCD 6.86" Black Edition** ($37.90, Amazon
`B0GYKJZT2F`, purchased 2026-08-16).

| Property | Value |
|---|---|
| Resolution | **1280×480**, fixed |
| Connection | USB-C (9-pin internal USB header on a desktop) |
| **Enumeration** | **USB HID — `VID:PID 0416:5302`. NOT a monitor.** |
| Frame format | JPEG pushed over HID |
| Mount | Magnetic back |

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
- **Google Calendar** (read-only) — two accounts, merged. See Environment.

## Environment & Credentials
Secrets live in `.env` (gitignored) and a local token store. **This repo goes
public when it's done**, so nothing real is ever committed. `.env.example` is
the contract.

| Value | Status |
|---|---|
| Google OAuth client ID / secret | **NOT YET CREATED** |
| Personal calendar | `grcadden@gmail.com` — confirmed reachable |
| Work calendar (Balcom) | **UNRESOLVED — critical path.** Not visible from the personal account. |
| Server port | `4780` (1280 wide, 480 tall), override `PERIPHERAL_PORT` |
| Wallpaper source | `%APPDATA%\Microsoft\Windows\Themes\TranscodedWallpaper` |

### Work calendar — the open question
Confirmed 2026-08-17: the personal Google account exposes only Personal, US
Holidays, and two imported athletics feeds. **No Balcom calendar.** Work is the
more important half, so this is the critical path. Routes, in order:

1. **Direct OAuth against the Balcom account** (two tokens, merged in app).
   Real-time. Risk: Workspace admin may block unverified third-party apps.
2. **Native Google sharing, work → personal Gmail.** Real-time, one token.
   Risk: admin may forbid external sharing or downgrade it to free/busy only.
3. **Private ICS "secret address".** Almost always works but Google refreshes
   imported feeds every 8–24h — **fatal for a countdown.** Last resort.

`src/sources/gcal.js` is a provider interface so all three drop in
interchangeably. Nothing else in the build depends on which we get.

## Brand & Design
- **Aesthetic:** flat near-black ground, monospace throughout, no gradients
  beyond a sub-3% vertical lift, no photographic background.
- **Palette is derived from the current Windows wallpaper** — but **hue only.**
  Lightness is forced and every token is gated on contrast against the ground
  before it ships (`--accent-*` ≥ 7:1, `--text-dim` ≥ 4.5:1, `--text-faint`
  ≥ 3:1). **Wallpaper proposes, contrast vetoes.** See `src/palette.js`.
- Regenerate with `npm run palette`. `web/tokens.css` is generated — never
  hand-edit it.
- Type scale is tuned for 6.86" read from ~3 feet, not for a desktop monitor.

## Lessons Learned
- **2026-08-17 — Never use the wallpaper as a bitmap background.** The
  screenshot that inspired this project did, and the type was unreadable. The
  wallpaper's own dominant colours were measured at brightness 0.72–0.84. Hue
  is the only safe thing to inherit from an arbitrary image.
- **2026-08-17 — OneDrive sync locks build artifacts.** Inherited from
  `desktop-companion`, which had to redirect Cargo output outside OneDrive.
  Keep `node_modules`, Playwright browsers, and caches out of sync scope or
  expect intermittent EPERM/EBUSY. Playwright's browser download is redirected
  via `PLAYWRIGHT_BROWSERS_PATH` — see `.env.example`.
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
