# Peripheral — Roadmap

Sprints are thematic, not time-boxed. `- [x]` marks done; nothing is deleted.
**Bold** items are the critical path.

## Renumbering — 2026-08-18

**Sprint 2 was split.** It bundled "make the one pane right" with "build a
multi-pane system": two subsystems that share no code, no design decisions, and
no failure modes, behind eleven mixed items and two gates that could not be
closed by working on them. Split so each sprint answers one question and you can
tell when it is answered.

**Mapping for dead labels — old references resolve as follows:**

| Old label | Now |
|---|---|
| Sprint 2 — *More of life* → "Agenda pane, second pass" | **Sprint 2 — Agenda, second pass** |
| Sprint 2 — *More of life* → "New panes" | **Sprint 3** (cycling + weather) and **Sprint 4** (the rest) |
| **Sprint 3 — *Polish and release*** | **Sprint 5 — Polish and release** (contents unchanged) |

Anything written before this date saying "Sprint 3" means today's Sprint 5.
Nothing was deleted; items moved between headings and the originals are marked
where they changed.

**Also recorded, because it caused real confusion:** Sprint 1 closed 2026-08-17
and the roadmap advanced to Sprint 2 the same day, but every session since spent
its time *hardening Sprint 1* — the worker-thread transport, the hero rule, the
agenda time column. **Sprint 2 had zero completed items and had been "current"
for a day without being worked.** It opens now, for real.

### Standing watch — not sprint items

Things that cannot be closed by working on them. They need time, real-world
events, or a loaded machine, so they are watched rather than checked off. As
sprint gates they only made a sprint look stalled.

- **The `travel` (TripIt) label has never rendered.** Zero events on the day it
  was wired up. Needs Ricky to actually have a trip. Not a suspected defect — a
  blind spot with nothing disproving it either.
- **`worstPush` drift.** A 2013ms push was observed 2026-08-18 on an idle
  machine (typical: 200–630ms). Harmless in isolation — well inside the ~3s
  forget window — but an upward trend over days is the signal that the USB-C
  cable is degrading. **Do not tune `SLOW_PUSH_MS` down to chase it**; that
  threshold is the panel's measured forget window.
- **Panel hardware failure curve.** Two events in two days (2026-08-17 heap
  corruption, 2026-08-18 endpoint stall), both consistent with the cable rather
  than the unit. **If a third arrives, replace the cable before concluding
  anything about the panel.** Dated log at the bottom of `CHANGELOG.md`.
- **Cadence on a genuinely busy machine.** `npm run stall-test` proves the main
  thread survives a blocked transport; it does not prove the transport keeps 1
  fps while a Teams call and a build are running. Watch `worstPush` and the
  heartbeat deltas under real load.
- **Whether `terminate()` interrupts a real wedged `node-hid` write.**
  Unknowable without a real wedge; `Atomics.wait` is a V8-level block and a
  stuck driver call is not. The respawn does not depend on it.

## Sprint 1 — Foundation
- [x] Identify the hardware and its actual interface (HID `0416:5302`, not a monitor)
- [x] Confirm which calendars are reachable from the personal Google account
- [x] Decide the runtime — Node, not Python
      *(2026-08-17: the original reason recorded here, "Python isn't installed,"
      was wrong — Python 3.14.2 is installed and reachable via `py`. The
      decision stands on one language end to end plus native-binding risk on a
      very new CPython. See the dated correction in `CLAUDE.md`.)*
- [x] Local server serving panes from `web/`, `/api/state` endpoint
- [x] Agenda pane rendering at true 1280×480 on mock data, live countdown
- [x] Wallpaper → palette extraction with a hard contrast gate
- [x] Resolve work-calendar access — **decided: work account is the primary**
      *(2026-08-17: route 2, sharing work → personal, tested and BLOCKED by
      Balcom. But personal is already natively shared INTO work, so route 1 —
      one OAuth token against Balcom — gets both halves and Google merges them
      server-side. Route 2 is dead; do not retry. Route 3 (ICS) remains the
      fallback. Original plan was personal-as-primary with two merged tokens;
      superseded.)*
- [x] **Verify Balcom permits third-party OAuth app access**
      *(2026-08-17: ANSWERED — no for third-party, yes for internal. A client
      owned by a PERSONAL Cloud project is blocked outright
      (`admin_policy_enforced`, "This app is blocked", no click-through). A
      client owned by a project INSIDE `balcomagency.com` is an internal app
      and is trusted by default. Same scopes, same account, same code — only
      project ownership differed. **Route 1a is the answer; route 3 (ICS) is
      dead and needs no building.** Internal user type also removes the 7-day
      refresh-token expiry, verification, and test users.)*
- [x] OAuth flow + token store written (`src/auth/`, `npm run auth`) — PKCE
      loopback, atomic store outside OneDrive, read-only scope allowlist.
      Untested against Google; needs a client ID.
- [x] ~~Create the OAuth desktop client in a *personal* Cloud project~~
      **Superseded 2026-08-17 — it must be an *in-org* project.** Created under
      `balcomagency.com` and authorised as the work account.
- [x] Enumerate real calendarIds and map them to display labels
      *(2026-08-17: 8 calendars visible. Three on the panel — `work`,
      `personal` (`grcadden@gmail.com`, **`accessRole: owner`, full titles, not
      free/busy**), and the TripIt `travel` feed. Five excluded: colleagues' and
      direct reports' calendars plus a shared team calendar. Reasoning in
      `.env`.)*
- [x] Implement `ApiProvider.fetchToday()` — `events.list` per mapped calendar,
      `singleEvents=true`, drop cancelled, treat declined as absent
- [x] **Real calendar data behind `/api/state`, single work account**
      *(2026-08-17: 19 events on the first live fetch, work and personal merged
      server-side by Google. The work-as-primary design is confirmed end to
      end — one token, no client-side reconciliation.)*
- [x] Confirm Windows enumerates `0416:5302` on arrival
      *(2026-08-17, a day early. Enumerates cleanly. Frame channel measured:
      interface 0, ep 0x82 OUT INTERRUPT, 512-byte packets. Interface 1 is a
      zero-endpoint WinUSB decoy. Nothing written to the device yet.)*
- [x] Read the handshake + frame header off the protocol reference
- [x] **HID transport: JPEG frame push — FIRST LIGHT 2026-08-17.** Handshake
      returns PM=128 SUB=1; a 1280×480 JPEG renders on the glass with correct
      geometry and channel order
- [x] Measure the panel's idle behaviour (`npm run idle-test`) — reverts to its
      boot logo ~3s after the last frame; the USB handle is irrelevant
- [x] **Playwright renderer: screenshot localhost → JPEG → transport** — 33-37ms
      per capture, one long-lived browser, capture races a 2s timeout
- [x] **Daemon: push loop and render loop SEPARATE** — push unconditionally at
      1 fps shipping the latest available frame; render updates it when it can.
      A hung screenshot must never stall the push (see the ~3s idle timeout)
- [x] Daemon: wire sources → state → render → push, with last-good-state cache
      *(2026-08-17: cache persists to `%LOCALAPPDATA%`, restored stale-flagged
      before the first fetch.)*
- [x] Run on login (Task Scheduler), survive panel disconnect without dying
      *(2026-08-17: per-user task, no admin, hidden window, rotated log.
      A renderer that will not open now retries instead of producing a zombie
      that reports success while pushing nothing.)*
- [x] Type scale +2px across the board and the accent palette moved to blue
      *(2026-08-17, judged on the real panel on a real desk. The old
      `--accent-hero` took the wallpaper's COMPLEMENT — an acid yellow-green
      `#d9f325`, maximally legible and, in Ricky's words, obnoxious. Accent hues
      are now pinned to two blues; only ground/text still inherit from the
      wallpaper. First attempt overcorrected to a pale cyan `#47cff5` — "a
      little too light" — because a **uniform 7:1 floor cannot be met by a
      saturated blue**: luminance weights blue at 0.0722, so the gate brightens
      it toward cyan and then toward pastel. Fixed by setting the hero floor
      per role rather than uniformly — 4.5:1, which is AAA for the 106px
      countdown and AA for the 22px agenda rows. Landed on `#0d78f2`, hero
      4.67:1, cool 7.25:1. The two accents are now the same hue family
      separated by saturation and lightness, because a 20-degree hue difference
      does not survive 6.86" at three feet.
      **Accepted PROVISIONALLY, not finally** — Ricky, on the glass: "the blue
      is OK for now, and the font size is improved… subject to change after
      using it for a few days." Do not treat either as settled; a revisit is
      expected and is not a regression.
      **Second type pass same day**, after living with the first: the bar mark
      and clock doubled (30px / 34px), the eyebrows doubled to 30px and went
      bold, and the agenda list took another +2px to 24px. Verdict on the
      glass: "much better" — still provisional.)*

**Sprint 1 is complete.** The panel shows Ricky's real day.

## Sprint 2 — Agenda, second pass

**The question: is the one pane right?** Everything here came from living with
real data on the real panel, 2026-08-17 and 2026-08-18.

*Was "Sprint 2 — More of life", whose "New panes" half is now Sprints 3 and 4.*

**Three of these need Ricky before any code.** They are tagged `NEEDS RICKY` so
a session does not pick one up and stall halfway.

- [ ] **Third pane: "and then what?"** — keep the current left/right split
      (now on the left, today's schedule on the right) and add a middle column
      for the event *after* the one in the hero. The question it answers is
      specific: *do I just need to get through this meeting, or is there
      another one immediately behind it?* That changes whether you can run to
      the kitchen, and it is currently invisible — the right-hand list shows
      the next event but not how much room there is before it.
      Open: what the middle pane shows when the gap is hours, or when nothing
      follows. "Clear until 4pm" is probably more useful than an empty column.
- [~] **Overlap precedence — needs real rules, not a clean shift.**
      **`NEEDS RICKY`** — the roadmap has said "wants a conversation before
      code" since it was written, and that has not happened yet.
      ~~Right now
      the hero picks the concurrent event ENDING SOONEST~~ **CORRECTED
      2026-08-18: ending-soonest was wrong and is gone.** It failed on a real
      day — at 4:10pm a 2:30–4:30 practice and a 4:00–4:45 meeting were both
      live, and the practice ends first, so the panel demoted the meeting he was
      sitting in. **The rule is now SHORTEST DURATION, ending-soonest breaking
      ties**, on the reasoning that a short sharply-bounded event is a
      commitment you are *in* while a long one is a container you are *inside
      of*. See `web/panes/agenda/focus.js`, which now holds this logic and its
      full history, and `test/focus.test.js`.
      **Still open, and still wanting a conversation before code:** duration is
      one signal, not the ruleset below. Ricky's read: work usually takes
      precedence, *but there are exceptions to every rule* — a kid's game beats
      a status meeting. Candidate signals to weigh rather than a single rule:
      calendar, whether he accepted vs. was invited, attendee count, whether
      it is a `focusTime`/`outOfOffice` block, and duration. **Do not ship a
      rigid work-always-wins rule.** This wants a conversation before code.
- [ ] **Colour-code entries by calendar** — one colour for personal, one for
      work, and possibly shades within work driven by *who is in the meeting*
      (a 1:1 with a direct report reading differently from a 40-person
      all-hands). Constraint to respect: the palette gate caps how many colours
      can clear 7:1 against the ground, and two accents already sit on adjacent
      rows in the agenda list. Shades-of-one-hue is likelier to work than more
      hues. Needs design work before implementation.
- [ ] Revisit whether `focusTime` and `outOfOffice` should be able to take the
      hero slot. **`NEEDS RICKY`** — a judgement, not a build. Kept deliberately
      — blocked time is real time — but a countdown to "Focus time" may read as
      noise. *Partly overtaken 2026-08-18: the shortest-duration rule already
      demotes a long block behind a live short meeting, so the bad case that
      motivated this (a two-hour block outranking a 30-minute meeting) is gone.
      What remains is narrower — whether a block should hold the hero when
      nothing else is live.*
- [ ] **Re-decide the accent blue and the type scale after a few days of real
      use.** **`NEEDS RICKY` — and this one is DUE.** Both were accepted
      provisionally on 2026-08-17, explicitly "not final". Queued here so the
      revisit is a scheduled step rather than something that only happens if
      Ricky remembers to complain. *He has now read the panel across two days,
      including spotting a spacing defect on it unaided (2026-08-18) — which is
      exactly the informed look this was waiting for.*
- ~~**See the `travel` label render at least once.**~~ **MOVED 2026-08-18 to
      Standing watch** (top of this file). It cannot be closed by working on it:
      the TripIt feed returned zero events, so it needs Ricky to actually have a
      trip. As a sprint checkbox it was an unclosable gate that only made the
      sprint look stalled.
- [x] **Watch an all-day event reach the panel.** ~~The fix has never been
      exercised by real data.~~ **DONE 2026-08-18.** A genuine all-day entry
      ("Donna Mills passed away", from a subscribed calendar) reached the pane
      and behaved correctly: pinned at the top of the list, rendered with the
      quiet `ALL DAY` label, and **did not take the hero** — the 10:00 AM
      meeting did. Confirmed in a JPEG captured through `src/render.js`, so it
      is verified at the Rendered tier rather than only tested.

## Sprint 3 — The multi-pane system

**The question: can the panel show more than one thing?**

*Was the first half of "Sprint 2 — More of life → New panes".*

- [ ] **Pane cycling with per-pane dwell times.** The infrastructure: which pane
      is showing, how long each holds, and how the renderer switches without the
      push loop ever noticing. `render.js` already has `goto()` for exactly
      this, unused so far.
      Constraints that are already settled and must not be re-litigated: the
      push loop runs at 1 fps on the transport thread regardless of what the
      renderer is doing, and the panel forgets after ~3s — **a pane switch must
      never cost a frame.** If a `goto()` plus font settle takes longer than the
      forget window, the previous pane's frame keeps shipping until the new one
      is ready. Never blank between panes.
- [ ] **Weather pane — the proof, not a nice-to-have.** Cycling cannot be
      verified with one pane, and shipping cycling infrastructure with nothing
      to cycle to would be untested infrastructure — the exact trap that cost
      the 2026-08-18 session. Weather is the cheapest real second pane: no
      OAuth, no new scopes, no new token. It earns its place here by being the
      thing that proves the mechanism.
      Open: which source, and whether it needs an API key (prefer a zero-cost
      one — name the recurring cost before choosing).

**Closing condition:** the panel cycles between agenda and weather, unattended,
across a logon, with no blank frame at the switch and no flicker on the glass.

## Sprint 4 — More panes

**The question: what else earns a pane?**

*Was the second half of "Sprint 2 — More of life → New panes".*

Each of these is roughly one session and they are independent — order them by
what Ricky actually wants to see, not by this list.

- [ ] **Tomorrow's first event when today is done.** The smallest and probably
      the most valuable: the agenda currently reads "Nothing left today", which
      is true and unhelpful at 5pm. Arguably belongs in the agenda pane rather
      than a pane of its own — decide when building it.
- [ ] **Inbox pane** — unread count and top senders, **no message bodies on
      screen.** This thing sits in a room; the constraint is not negotiable.
      Needs a new OAuth scope (Gmail readonly) against the same internal-app
      client, which is the part to verify first.
- [ ] **Photos pane — research spike BEFORE it is a build item.** Google
      restricted the Photos Library API; broad album read may no longer be
      available to third-party apps. **Confirm current policy before designing
      anything.** Fallbacks: Picker API session, or a synced local/Drive folder
      — the local folder needs no API at all and may simply be the answer.

## Sprint 5 — Polish and release

*Was Sprint 3. Renumbered 2026-08-18 when Sprint 2 was split; contents
unchanged. Any earlier reference to "Sprint 3 — Polish and release" means this.*
- [ ] **Colour picker in the packaged release, like Golem's.** Right now the
      accent hues are constants in `src/palette.js` with env-var overrides, and
      re-tinting the panel means editing source and running `npm run palette`.
      That is fine for Ricky and useless for anyone else who buys the same $38
      panel. Requirements the picker has to respect, which is what makes this
      more than a colour input:
      - **The contrast gate is not optional.** The picker proposes a hue; the
        existing gate still forces lightness and vetoes anything that fails its
        floor. A user must not be able to produce an unreadable panel.
      - Show the resulting ratio next to each swatch, and say plainly when a
        chosen hue had to be lightened to pass.
      - Per-role floors, not one number — the hero is 106px, the agenda rows
        are 22px, and `--text-faint` is deliberately below AA. See the dated
        note in `palette.js`.
      - Live preview against the actual pane, not against a colour chip.
      - Keep "inherit from wallpaper" as an option, since that is the original
        idea and still the nicest default for someone who has not thought
        about it.
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
