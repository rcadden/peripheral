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
  **2026-08-18, later the same day: arguably the third arrived** — 5+ more
  stalls during this session, one push at 6603ms (over 2x the previous worst).
  **Ricky does not think it's the cable** — asked directly what he suspects
  instead; no answer yet. Recorded as open, not resolved either direction. Do
  not swap the cable or otherwise act on the cable theory without his sign-off.
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

## Sprint 2 — Agenda, second pass — **COMPLETE 2026-08-18**

**The question it answered: is the one pane right?** Ricky, closing it out:
*"consider Sprint 2 completed. We'll work on Sprint 3 tomorrow (maybe)."*
Everything here came from living with real data on the real panel across
2026-08-17 and 2026-08-18 — the third pane, overlap precedence, and
colour-coding were all built or substantially reshaped from real feedback
rather than designed upfront and shipped once.

**Closed with two items not fully `[x]`, on purpose, not by oversight:**
- **Overlap precedence stays `[~]`.** Ricky's own words when it shipped:
  "this will likely take consistent tweaking, both in the device logic, but
  also IRL the way that meetings get put on this calendar." It's a living
  system now, not a sprint deliverable with an end state — watch for real
  cases it gets wrong rather than expecting it to reach `[x]`.
- **`focusTime`/`outOfOffice` taking the hero slot is still genuinely open**
  (below) — a judgement call, not a build, and closing the sprint doesn't
  answer it. Carried forward rather than force-closed.
- **Also carried forward, explicitly deferred rather than dropped: the
  colour palette needs a rework.** Ricky, same closing message: *"We'll
  need to rework the color palette, but let's put that on a future
  tuning/optimization sprint."* Green/pink cleared the contrast gate but
  were not a considered final choice. Not scheduled to a specific sprint
  yet — surface it when picking the next design-heavy piece of work.

*Was "Sprint 2 — More of life", whose "New panes" half is now Sprints 3 and 4.*

**Three of these needed Ricky before any code.** They were tagged
`NEEDS RICKY` so a session would not pick one up and stall halfway.

- [x] **Third pane: "and then what?"** — **BUILT 2026-08-18.** A middle
      column now sits between the hero and the agenda list (`.then` in
      `web/panes/agenda/`), originally answering the gap after the hero
      event ends: `{duration} FREE` when there's room, `RIGHT AFTER` when the
      next event starts within ~2 minutes of the hero ending, `OVERLAP` when
      it starts before the hero even ends. Logic (`pickNext`) lives in
      `focus.js` alongside the hero pick, tested in `focus.test.js`.
      **SUPERSEDED by Follow-up #3 below, same day** — the column's whole
      shape changed (only shows while the hero is live; headline is now
      "30 MIN / Free time" or the next meeting itself, not this wording).
      Text kept per the no-tidying rule; the current behavior is in
      Follow-up #3.
      **The `OVERLAP` case was found by real data within the hour of
      shipping, not designed for** — the first live render showed the "next"
      event starting at the SAME time as the hero (a personal commitment
      layered under a work meeting), which the initial "RIGHT AFTER" wording
      described as sequential when it was concurrent. Fixed by widening the
      gap check to a signed range instead of one threshold.
      **Narrowing the hero column to fit the new middle column broke the
      countdown's length-based font breakpoints** (`len-md`/`len-lg` in
      agenda.css), tuned for the old 722px hero width. Re-measured against the
      real 516px width in the live page (not estimated) and moved the
      thresholds down — see the comment above `el.countdown.className` in
      `agenda.js`. This is the same class of bug the 2026-08-17 time-column
      lesson describes: a size-dependent constant is only valid for the size
      it was measured at.
      Verified against real live calendar data (not mock) via in-page DOM
      measurement for horizontal/vertical overflow at all three columns — no
      overflow found. **Verified on the physical panel 2026-08-18** — Ricky
      confirmed on the glass after Follow-up #3 landed: "panel looks great
      for now."
      **Follow-up same day: the daemon doesn't reload edited pane code.**
      Ricky reported not seeing the new column on the real panel. Root cause:
      `render.js`'s Playwright page navigates once at daemon startup and
      never again outside of pane-cycling's unused `goto()` — editing
      agenda.js/css/html on disk does nothing to an already-running daemon.
      Fixed in `daemon.js`: a debounced `fs.watch` on `web/` now calls
      `renderer.goto()` (not a full process restart — that would also
      reopen the HID device, unwise while the transport is fighting the
      cable, see Standing watch below) whenever a pane file changes. Confirmed
      working: a CSS edit during this same session triggered
      `[daemon] pane reloaded` in the log with no manual restart.
      **Follow-up #2: equal thirds.** Ricky asked for the three columns equal
      width rather than the original 516/224/420px split. Changed `.body` to
      `grid-template-columns: 1fr 1fr 1fr`. This shrank the hero column to
      ~387px, which broke the just-fixed countdown breakpoints a second time
      and this time the existing three-tier ladder (106/80/60px) wasn't
      enough — "IN 9 HR 59 MIN" still overflowed at the smallest tier (60px,
      492px wide against 387px available). Added a fourth tier, `len-xl`
      (44px). Re-measured every length `fmtCountdown()` can actually produce
      (3, 7, 8, 9, 13, 14 chars — never anything else) against the real
      387px column; all fit with margin. Third time this exact bug shape has
      hit this file — a hero-width change breaks font breakpoints — worth
      remembering if the hero column moves again.
      **Follow-up #3, same day: three more requests from actually living
      with it.** (1) The hero eyebrow now reads "Happening" with time
      REMAINING (`fmtRemaining()`) while its event is live, "Up next" with
      time until otherwise — "NOW" told Ricky nothing once he was already in
      the meeting. (2) The then-column only populates while the hero is live
      (blank the two hours before his first meeting), and its headline
      distinguishes a real gap from back-to-back: `30 MIN` / `Free time` /
      `Then · <next title> · <time>` when there's room, or the next
      meeting's own length/title/meta when there isn't
      (`BACK_TO_BACK_MS = 2min`). The first cut of this always led with the
      next meeting regardless of gap, which Ricky caught immediately —
      showing "Ricky / Nick 1:1" as "Up Next" while he had 30 free minutes in
      front of it buried the more useful fact. (3) The agenda list's time
      column dropped to `10:00a` from `10:00 AM` — same `max-content` +
      subgrid column, no CSS change needed, just less content per row.
      **The is-now badge overflowed too, found by the same in-page
      measurement discipline**: `remainingSizeClass()`'s output sits inside
      `.countdown.is-now`, which carries its own 16px-per-side padding — a
      budget the plain `countdownSizeClass()` thresholds don't know about.
      "26 MIN LEFT" measured 419px total against a 387px column before this
      was caught. `remainingSizeClass()` is now a separate, smaller scale
      (down to a new `len-xxl` at 34px), measured against the padded budget
      (355px), because `fmtRemaining()`'s longest strings ("9 HR 59 MIN
      LEFT") don't fit even at the plain countdown's smallest tier.
      **The reload watcher lost a race with itself during this same round of
      edits** — a reload landed exactly when a capture was mid-flight, was
      logged as "skipped" with no retry, and the daemon kept running stale
      code silently until manually re-touched. Hardened same day:
      `reloadPaneWithRetry()` in `daemon.js` retries every 200ms (up to 6
      times) instead of dropping the reload on the first collision.
      **Follow-up #4, same day: the physical panel photo showed every list
      row truncating hard.** Ricky liked the equal-thirds grid aesthetically
      and asked to fix the truncation without giving it up. Fixed without
      touching the grid: reclaimed ~20px of unused gutter from `.agenda`'s
      padding and the tick/gap sizing (free width, no tradeoff), and applied
      progressive disclosure — the is-now and is-next rows now wrap to a
      full 2-line title, everything else stays single-line and truncated.
      **Found while verifying: the list's `is-next` class had been checking
      `ev.id === focus.id`, a leftover from before the hero/then split, when
      "focus" and "the next thing" were the same event.** Once `next` became
      its own value, the list never highlighted it — the "up next" row in
      the middle column had no matching highlight in the list at all until
      this was caught by checking real rendered classes, not assumed correct
      because it compiled. Fixed to check `next.id`. Dropped `MAX` from 6 to
      5 to keep the worst case (both special rows wrapped) inside the
      480px budget — measured with real slack (36.6px) rather than
      calculated, per the standing rule on this file.
      **Follow-up #5, same day: from an actual photo of the glass.** Ricky
      sent a photo (first physical-panel look this session) and flagged the
      tick/bullet misaligning on wrapped rows — `.tick`'s own
      `align-self: center` (needed for the single-line case) silently beat
      the row-level `align-items: start` override, centering the bullet on
      the whole two-line block instead of the first line. Fixed with a
      wrapped-row-only override. Also, three content changes: **all-day
      entries stop showing after 10am** ("I've seen it by that point"),
      **past events are dropped from the list entirely** (was: kept some for
      context), and **the meta line went through three redesigns** in one
      sitting — stacked-by-fact → dropped the calendar label entirely
      ("obvious from the event name") → time always alone on its own line,
      location+conference+attendees combined below it. Each redesign was
      checked against a synthetic worst case (long location + conference +
      attendees together) as well as live data — the first stacked version
      overflowed `.then` by ~20px the moment all fields showed up at once,
      caught by measurement before it shipped.
      **Ricky, after this round: "You can look at this yourself in the
      browser preview - it looks identical to the glass. Use this moving
      forward to review/check your own work."** Standing permission to treat
      the in-app browser as glass-equivalent for verification purposes going
      forward — recorded because it changes what counts as "seen" in the
      Step 0 gate.
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
      **The conversation happened, 2026-08-18, and it happened against real
      data.** Instead of designing from hypotheticals, Ricky asked to pull his
      actual calendar for the next 8 days and read real overlaps together —
      66 timed events, 38 overlapping pairs (see the deleted scratch script;
      it was a one-off analysis tool, not kept). Three concrete rules came
      out of it, all shipped and tested the same day:
      1. **A named exception, not a general rule.** "BAL-Thurs/Mon. Production
         Meeting" is booked 60 minutes and routinely runs 30. Ricky: *"this is
         a hard rule, you could just code it in without any other logic."*
         `DURATION_OVERRIDES` in `focus.js` — a small, explicit, title-matched
         list. Rewrites the event's displayed `end` outright (not just hero
         eligibility) after Ricky flagged that the countdown was still reading
         the real 60-minute hold: *"let's have the countdown be the 30 minute
         timer, not the calendar hold. That's the only exception to this rule
         currently."*
      2. **Tiebreak changed to LATEST START**, replacing ending-soonest, for
         when two live events are genuinely the same length: *"the newer
         meeting [should] show up over the back half"* of the older one.
      3. **Personal-calendar events are demoted by default and dropped if
         unclaimed** — `resolvePersonalEvents()` in `focus.js`. Claimed by (a)
         Ricky's name/initials in the title, or (b) a time-matching
         work-calendar block (Ricky protects real personal commitments with a
         placeholder on his work calendar "so that my coworkers don't book
         meetings for me"). **A bare overlap check was tried first and was
         wrong** — it let a 9:30am–4:50pm general-availability block
         ("Ricky GTD") wrongly claim an unrelated practice seven hours inside
         it. Fixed with a ~60-minute padding tolerance so only a
         travel-time-sized match counts. Claiming only unlocks the event for
         the *existing* duration comparison — it does not merge times or
         remove the matched work event; a wider "adopt the work block's time
         window" design was tried and reverted because it broke historical
         regression tests modeling coincidental (non-deliberate) overlaps.
      **Explicitly not settled — Ricky's own words: "this will likely take
      consistent tweaking, both in the device logic, but also IRL the way
      that meetings get put on this calendar."** Left `[~]` rather than
      `[x]` for that reason. Known gap: the "work block time is priority"
      nuance (using the wider, travel-padded work window as the *displayed*
      time, not just the unlock signal) is designed but not built — flagged
      to Ricky rather than guessed at. 82 tests now (was 69 at session start),
      including the real BAL-Thurs/M2M case, the Norah's-game work-match
      case, and the Reese-practice/"Ricky GTD" false-positive case as
      regression tests by name.
- [x] **Colour-code entries by calendar — BUILT 2026-08-18.** Roadmap
      originally guessed "shades of one hue is likelier to work than more
      hues." **Wrong guess — Ricky, directly: "I don't want shades - I want
      completely different colors. Contrast is the point."** Two new
      palette tokens, computed through the real contrast gate rather than
      hand-picked: `--accent-calendar-work` (green, #28bd5a, 7.97:1) and
      `--accent-calendar-personal` (pink/magenta, #df68a3, 6.22:1), floored
      at 6.0 — higher than the decorative tiers, because a marker nobody
      notices defeats the purpose. Deliberately different hue FAMILIES from
      the existing blue accents (which mean urgency — now/next — and stay
      blue), so a calendar colour and a phase colour never compete for the
      same meaning.
      **Went through two rounds of "not visible enough" the same session.**
      First cut: a small dot next to the hero/then title, a tinted tick in
      the agenda list. Ricky: *"I don't want just the little buttons... The
      dots aren't big/obvious enough to see (especially from 3ft away)."*
      Second cut: the agenda list's title TEXT itself is now calendar-
      coloured on every row. Third correction: *"Make sure the timestamp is
      also coloured"* — the time column now matches the title. The tick is
      the only thing still phase-coloured (blue) on is-now/is-next rows —
      once time and title both carry calendar colour, the tick is what's
      left to say "this one's happening now."
      Hero/then keep the smaller dot-in-front-of-title treatment (title
      text itself stays neutral there, for legibility on the panel's single
      most important line) — Ricky's objection was specifically about the
      agenda list, not those two panels.
      **Deferred, not forgotten: the actual hue choices need a rework.**
      Ricky, closing this out: *"We'll need to rework the color palette, but
      let's put that on a future tuning/optimization sprint."* Green/pink
      were a reasonable first pass through the contrast gate, not a
      considered final choice — revisit before calling this settled. `other`/
      `travel`/`athletics`/`holidays` still render neutral, unchanged from
      the original two-colour scope (personal, work).
      Scope note, also resolved: the "shades within work by attendee count"
      idea from the original roadmap text is dropped, not deferred — "I
      don't want shades" rules it out along with the hue-shading approach.
- [ ] Revisit whether `focusTime` and `outOfOffice` should be able to take the
      hero slot. **`NEEDS RICKY`** — a judgement, not a build. Kept deliberately
      — blocked time is real time — but a countdown to "Focus time" may read as
      noise. *Partly overtaken 2026-08-18: the shortest-duration rule already
      demotes a long block behind a live short meeting, so the bad case that
      motivated this (a two-hour block outranking a 30-minute meeting) is gone.
      What remains is narrower — whether a block should hold the hero when
      nothing else is live.*
- [x] **Re-decide the accent blue and the type scale after a few days of real
      use.** Both were accepted provisionally on 2026-08-17, explicitly "not
      final" — queued so the revisit would be a scheduled step rather than
      something that only happens if Ricky remembers to complain. **Revisited
      and accepted, 2026-08-18: "The blue and typescale are good for now.
      Mark them as complete for now."** Read the panel across two days first,
      including spotting a spacing defect on it unaided and living through a
      full afternoon of layout changes — the informed look this was waiting
      for. **"For now," not "forever"** — consistent with how every other
      design acceptance on this project is recorded; a future reversal is
      not a regression. See `[[design-decisions-are-provisional]]` in
      memory.
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
- [x] **Weather — built 2026-08-19, shipped in the bar rather than as a
      separate pane, and Ricky decided 2026-08-20 that's the right shape,
      not a compromise.** *"Having the weather in the header replaces the
      need for a weather pane."* `NwsProvider` (`src/sources/weather.js`):
      free, keyless NWS API (`api.weather.gov`), hardcoded to Ricky's actual
      address (grid `GSP 54,73`, station `KAVL`) rather than geocoded at
      runtime, since the install is fixed in one spot. Zero recurring cost.
      Wired into the daemon on its own 15-min interval (`WEATHER_INTERVAL_MS`,
      independent of the calendar's 60s), merged into `/api/state` via
      `publishState()`. The bar redesigned from "logo + clock" into three
      co-equal panels (logo / weather / time) through three live rounds with
      Ricky: weather promoted from a small aside to equal visual weight with
      the clock, its three stats (temp/high/precip) made uniform with no
      demoted caption tier, and the date caption bumped off an
      illegible-at-3ft faint size. Verified 2026-08-19/20: 82 tests
      unchanged, `/api/state` serving real weather data, DOM-clean at true
      1280×480, **and confirmed on the glass** ("looks good") 2026-08-20.
      **The `NEEDS RICKY` question this item carried — does bar-embedded
      weather replace the need for a weather pane — is answered: yes.**
      Weather is not, and will not become, a cyclable pane. `focus.js` and
      the cycling infrastructure below should not plan around it as one.

**Closing condition — rewritten 2026-08-20, the original is struck through per
the no-tidying rule:** ~~the panel cycles between agenda and weather,
unattended, across a logon, with no blank frame at the switch and no flicker
on the glass.~~ Weather is decided out of the running as a pane, so cycling
needs a genuinely different second pane to prove itself against — pull one
forward from Sprint 4 (tomorrow's-first-event is the smallest; see below) or
build a purpose-made proof pane. **New closing condition: the panel cycles
between agenda and one other real pane, unattended, across a logon, with no
blank frame at the switch and no flicker on the glass.** Which second pane is
still open — see Sprint 4.

## Sprint 4 — More panes

**The question: what else earns a pane?**

*Was the second half of "Sprint 2 — More of life → New panes".*

**One of these is now also Sprint 3's cycling target, decided 2026-08-20 when
weather was confirmed to be staying in the bar rather than becoming a pane.**
Whichever of the three below gets built first is the natural candidate —
"Tomorrow's first event" is the smallest and could plausibly be built
alongside pane cycling in one session rather than after it. Not yet decided
which; flag when picking this up.

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
