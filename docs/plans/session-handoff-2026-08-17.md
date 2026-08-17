# Session handoff — 2026-08-17

First session. Scaffold built, nothing shipped to hardware yet. Read this, then
`../../CLAUDE.md`, then start.

---

## State in one paragraph

The agenda pane is real and renders correctly at true 1280×480 on mock data with
a live countdown. The wallpaper→palette engine is real and its contrast gate is
verified. The local server is real and dependency-free. **The renderer, the HID
transport, and the calendar source are stubs** — each carries its decisions and
its list of unknowns in a header comment. The hardware arrives **2026-08-18**.
The blocker that gates real data is work-calendar access, which is unresolved.

## See it working in 30 seconds

```bash
node src/server.js
```

Open <http://127.0.0.1:4780/panes/agenda/> and size the window to 1280×480. No
daemon means no `/api/state`, so the pane falls back to mock events anchored to
the real clock — the countdown ticks and the layout is honest. `node src/daemon.js`
also works and will tell you exactly what isn't implemented yet.

## Three decisions that constrain everything downstream

1. **The panel is USB HID `0416:5302`, not a monitor.** The OS never shows a
   second display. You push JPEG frames. Any plan that involves "open a browser
   on the device" or "move a window to the panel" is wrong.
2. **The daemon screenshots its own localhost URL.** One renderer, two
   consumers: Playwright → HID panel, and any browser → design iteration plus
   the fallback for when the panel dies. **Never fork the pane into a "panel
   version" and a "browser version."** The moment they diverge the fallback
   stops being trustworthy.
3. **The palette inherits hue only.** Lightness is forced and every token is
   gated on contrast before it ships. Wallpaper proposes, contrast vetoes. Do
   not relax this to make something look nicer.

## Critical path: work-calendar access

The Balcom calendar is **not** reachable from the personal Google account —
confirmed by enumeration on 2026-08-17, which returned only Personal, US
Holidays, and two imported athletics feeds. Work is the more important half, so
nothing about real data proceeds until this resolves.

Run these two tests first; they're cheap and they decide the architecture:

| Test | How | If it works | If it fails |
|---|---|---|---|
| **Route 1 — direct OAuth** | Create a Google Cloud desktop OAuth client, request `calendar.readonly`, authorise the Balcom account | Best outcome. Two tokens, merged in `collect()`. Real-time, full event detail. | Workspace admin blocks unverified third-party apps → ask Balcom IT to allowlist the client ID, or fall to route 2 |
| **Route 2 — native sharing** | In Balcom Google Calendar settings, share the calendar to `grcadden@gmail.com` | One token, real-time, simplest code | Admin forbids external sharing, or downgrades to free/busy only (blocks with no titles) |

**Route 3 (private ICS secret address) is a last resort and must set
`stale: true`.** Google refreshes imported feeds every 8–24h, which is fatal for
a countdown — it will confidently show a meeting that already happened.

**Needs Ricky before starting:** which Google account should own the GCP project
for the OAuth client.

## When the hardware arrives — in this order

1. **Plug it in. Do not install the bundled TRCC software.** It's clunky,
   Windows-only, and claims the device. The Reddit OP who built the same thing
   says the same.
2. `npm run probe` — or the zero-install PowerShell one-liner in
   [`src/transport/probe.js`](../../src/transport/probe.js)'s header.
   Expect `0416:5302`. If absent, diagnose in this order: **USB-C cable** (a
   known failure point on this model) → different port → dead unit. Don't start
   protocol work against a device that isn't enumerating.
3. Record the working HID `path` in `CLAUDE.md` under Environment.
4. Then implement the transport, reading the protocol off
   [thermalright-trcc-linux](https://github.com/Lexonight1/thermalright-trcc-linux)
   rather than guessing. `PERIPHERAL_DRY_RUN=true` writes frames to `./frames/`
   so the renderer can be finished without a working panel.

## Open questions for Ricky

1. **Which account owns the GCP project** for the OAuth client. Blocking route 1.
2. **Photos may not be possible.** Google restricted the Photos Library API;
   third-party album read access may be gone entirely. This is the reason the
   Nest Hub is being replaced, so if album slideshows are the thing that would
   actually be missed, **verify current Google policy before building more
   calendar polish.** Unverified as of this session. Fallbacks if confirmed
   dead: Picker API session, or a synced local/Drive folder.
3. Should Peripheral start on login now, or stay manual until it's trusted?

## Don't

- Don't install TRCC.
- Don't hand-edit `web/tokens.css` — it's generated. Use `npm run palette`.
- Don't push to a remote. Repo goes public **after** it's done; local `main` +
  `dev` only for now.
- Don't put `node_modules` or Playwright browsers inside OneDrive sync scope —
  set `PLAYWRIGHT_BROWSERS_PATH` (see `.env.example`). Second project in this
  workspace to hit OneDrive file locking.
- Don't trust `python` on PATH; the launcher is `py` (Python 3.14.2).

## Verified this session, so you needn't re-check

- Node 24.13.1, npm 11.12.1, git, Python 3.14.2 via `py` + pip 25.3. `uv` absent.
- Wallpaper sampled: 2752×1536, dominant hue 207.5 (sky), secondary 67.5
  (foliage), mean saturation 0.439.
- Palette gate output: hero 15.8:1, cool 7.49:1, text 16.81:1, dim 6.86:1,
  faint 3.67:1 — all clear their floors.
- `node src/daemon.js` starts, serves, and reports its missing pieces without
  crashing.
- Agenda pane screenshotted at 1280×480 and corrected: time column widened to
  104px right-aligned (`12:30 AM` was colliding with titles), agenda column to
  462px, mock offsets compressed so events stay plausible at any hour.
