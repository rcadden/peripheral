# Peripheral — Project Goals

## North Star
*Your life, in the corner of your eye.*

A small piece of glass on the desk that answers "what's next?" before you think
to ask. Not a dashboard you consult — a thing you absorb.

**Success, one sentence:** Ricky stops opening Google Calendar to find out
whether he has a meeting soon.

## Why this exists
A Nest Hub Max currently occupies this space and earns its keep as a photo
frame and nothing else. It cannot show a work calendar, cannot be customised,
and phones home. A $38 USB LCD plus local software does the useful part better
and keeps the data on the machine.

## What it is
An always-on 1280×480 panel driven by a local Node daemon. It cycles a small
set of **panes**. Sprint 1 ships exactly one — the agenda — because one pane
done properly beats four half-built.

## Principles
1. **Ambient, not interactive.** No input. If it needs a click, it belongs in a
   browser instead. Everything on screen must be legible in under a second from
   about three feet.
2. **Read-only, everywhere.** Peripheral never writes to a calendar, never
   sends anything, never acknowledges an invite. It is a window, not a door.
3. **Never render blank.** A dead network, an expired token, or a crashed source
   must degrade to last-known-good data with a visible stale marker. A blank
   ambient display is worse than a wrong one, because you stop trusting it.
4. **Local by default.** No cloud component. The panel is USB-powered by this
   PC; if the PC is asleep the screen is dark anyway, so there is nothing for a
   server to do. A calendar token should not exist anywhere it doesn't need to.
5. **Legibility is not negotiable.** Personalisation — including the
   wallpaper-derived palette — is always subordinate to contrast. Any feature
   that can make the panel harder to read is wrong, however clever.
6. **The hardware will fail.** Assume it. The renderer must be independently
   useful so that a dead panel costs a screen, not the project.

## Non-goals
- Not a productivity tool. It does not manage, nag, or track.
- Not a Claude usage meter. That was the origin of the idea and is the least
  interesting part of it; it can come later as one more pane.
- Not cross-platform in v1. Windows 11, this machine, this panel.
- Not multi-user, not networked, not authenticated — because it never listens
  on anything but loopback.

## Acceptance criteria — v1
- [ ] Panel shows the next event with a live countdown, driven by real Google
      Calendar data from **both** the work and personal accounts
- [ ] Today's remaining events listed, past events visibly de-emphasised
- [ ] Palette tracks the current Windows wallpaper and every token still passes
      its contrast floor
- [ ] Survives: panel unplugged and replugged · network dropped · token expired
      · no events today · an all-day event · overlapping events
- [ ] Starts on login without a console window
- [ ] Same URL opens in a browser and looks identical
- [ ] Nothing secret in git history at the point the repo goes public
