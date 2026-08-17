# Peripheral

**Your life, in the corner of your eye.**

An ambient calendar panel for a $38 USB LCD. Shows what's actually next — with
a live countdown — on a 1280×480 screen sitting on your desk. No cloud, no
account, no telemetry. Your calendar token never leaves the machine.

> Status: **early.** The agenda pane renders and the palette engine works. The
> hardware transport is unwritten — the panel arrives 2026-08-18.

## Hardware

[Thermalright Trofeo Vision LCD 6.86"](https://www.amazon.com/dp/B0GYKJZT2F) —
$37.90, 1280×480, USB-C, magnetic back.

**It is not a monitor.** It enumerates as a USB HID device (`0416:5302`) and you
push JPEG frames to it. Your OS will never show it as a second display. Skip the
bundled TRCC software entirely.

Buyer beware: 3.7★/145 with a real pattern of flicker-then-death inside a couple
of months, and disconnects that a better USB-C cable fixes. Peripheral is built
so a dead panel costs you a screen, not the setup — the same page opens in any
browser.

## How it works

The daemon serves the panes over loopback and **screenshots its own URL** to
produce frames. One renderer, two consumers:

```
  web/panes/agenda/  ──►  http://127.0.0.1:4780  ──┬─►  Playwright ─► JPEG ─► HID panel
                                                    └─►  your browser (design + fallback)
```

That's the whole trick. It means you iterate on the design in Chrome at true
size, and it means the fallback path is the same code as the real path — so it
can't quietly rot.

## Quick look, no hardware needed

```bash
node src/server.js
```

Open <http://127.0.0.1:4780/panes/agenda/> at 1280×480. With no daemon running
there's no `/api/state`, so the pane falls back to mock events anchored to your
real clock — the countdown ticks and the layout is honest.

## The palette

Tokens are derived from your current Windows wallpaper, but **hue only.**
Lightness is forced to values that work on a small panel, then every token is
gated on contrast against the ground before it ships:

| Token | Floor |
|---|---|
| `--accent-hero`, `--accent-cool`, `--text` | 7:1 |
| `--text-dim` | 4.5:1 |
| `--text-faint` (past events) | 3:1 |

**Wallpaper proposes, contrast vetoes.** This is not decoration — the screenshot
that inspired this project used a photo as the background and was genuinely
unreadable. An arbitrary image cannot be trusted with anything but hue.

```bash
npm i           # sharp, for wallpaper sampling
npm run palette # rewrites web/tokens.css
```

`web/tokens.css` is generated. Don't hand-edit it.

## Setup

Not yet documented — Google OAuth and the HID transport land next. See
[`directives/roadmap.md`](directives/roadmap.md).

## Prior art

Protocol work by others, gratefully read:

- [Lexonight1/thermalright-trcc-linux](https://github.com/Lexonight1/thermalright-trcc-linux) — reverse-engineered TRCC protocol for this device family
- [christensen143/claude-trofeo-hud](https://github.com/christensen143/claude-trofeo-hud) — same panel, macOS, Python

Idea from [this thread](https://old.reddit.com/r/ClaudeAI/comments/1vk88m5/38_claude_lcd_table_display/).

## License

MIT, once it's finished enough to be worth anyone's time.
