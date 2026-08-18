/* focus.js — which event owns the hero slot.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────────────────────────────────────────────────────────
 * This is the one piece of logic that decides what the whole panel is FOR,
 * and it was wrong twice in a single day (2026-08-17) because it lived inline
 * in agenda.js with no exports, so `test/` could not reach it. Both wrong
 * rules were derived from one observed case each, shipped, and then failed on
 * the next real overlap. See test/focus.test.js — every case in there is a
 * real day, not a hypothetical.
 *
 * Pure functions only. No DOM, no fetch, no clock of its own — `now` is always
 * passed in, which is what makes the real cases reproducible as tests.
 */

/**
 * A handful of recurring meetings that are scheduled longer than they
 * actually run — found 2026-08-18 by pulling Ricky's real week and asking
 * him to read overlaps. "BAL-Thurs/Mon. Production Meeting" is booked 60
 * minutes and routinely wraps in 30. Ricky: *"this is a hard rule, you could
 * just code it in without any other logic. That actually resolves this
 * unique case."* Then, once shown the asymmetry (the countdown still read
 * against the real 60-minute hold): *"let's have the countdown be the 30
 * minute timer, not the calendar hold. That's the only exception to this
 * rule currently."*
 *
 * So this REPLACES `end`, not just eligibility — applied once, up front, in
 * `selectAgenda()`, before anything else touches the event. Everything
 * downstream (`classify`, the countdown, the meta time range, the progress
 * bar, `pickNext`) reads the overridden end and has no idea an override
 * happened. "Only exception currently" — this must stay a small, explicit,
 * name-matched list, not a heuristic.
 */
const DURATION_OVERRIDES = [
  { match: /production meeting/i, minutes: 30 },
];

/** Rewrite `end` for any event a known override applies to; pass others through. */
function applyDurationOverrides(ev) {
  const override = DURATION_OVERRIDES.find((o) => o.match.test(ev.title));
  if (!override) return ev;
  const end = new Date(new Date(ev.start).getTime() + override.minutes * 60_000);
  return { ...ev, end: end.toISOString() };
}

/** 'past' | 'now' | 'future' for one event at a given instant. */
export function classify(ev, now) {
  const s = new Date(ev.start), e = new Date(ev.end);
  if (e <= now) return 'past';
  if (s <= now && now < e) return 'now';
  return 'future';
}

const duration = (e) => new Date(e.end) - new Date(e.start);

/**
 * The hero pick, given timed events already carrying `phase`.
 *
 * Happening now if anything is, else the soonest future event. Among
 * concurrent live events the SHORTEST one wins; the one that started most
 * RECENTLY breaks ties.
 *
 * History, because this rule has now been wrong three times and each wrong
 * version looked like the previous one working:
 *
 *   Attempt 1 — start-order. At 2:20pm a 1–3pm block and a 2:00–2:30 meeting
 *   were both live, and the hero went to the block: 40 minutes of runway shown
 *   instead of the 10 that mattered.
 *
 *   Attempt 2 — ending soonest. Fixed that case and was fit to it. At 4:10pm a
 *   2:30–4:30 vball practice and a 4:00–4:45 meeting were both live; the
 *   practice ends first, so the panel demoted the meeting he was sitting in.
 *
 * Ending-soonest was never the discriminator, it just correlated with it in the
 * first case. Duration is: a short, sharply-bounded event is a commitment you
 * are IN; a long one is a container you are inside of — a two-hour practice,
 * "Focus time", "Out of office", "After 5p for me". Containers are context.
 *
 *   Tiebreak, corrected 2026-08-18 — LATEST START, not ending soonest. Found
 *   by walking Ricky's real week rather than waiting for it to happen: two
 *   same-length meetings overlapping (a production meeting and, right after
 *   it starts, an onboarding call — the real case that's ALSO handled by the
 *   duration override above; this tiebreak is what he'd want for the general
 *   shape when no override applies). Ricky's read: the one you just walked
 *   into is the one happening — "ending soonest" would have kept the hero on
 *   the OLDER meeting for its entire second half, which is backwards.
 */
export function pickFocus(timed) {
  const live = timed.filter((e) => e.phase === 'now')
    .sort((a, b) => duration(a) - duration(b) || new Date(b.start) - new Date(a.start));
  return live[0] || timed.find((e) => e.phase === 'future');
}

/**
 * The event after the one in the hero — "and then what?" The answer to
 * whether the hero event is something you can leave immediately after, or
 * whether another commitment sits right behind it.
 *
 * Walks forward from focus's position in the already-sorted `timed` array,
 * skipping anything past. This naturally excludes a longer event that
 * overlaps focus but started earlier (it sits before focus in start order,
 * not after), which is correct — that one is already accounted for by focus
 * losing the hero to duration in pickFocus.
 */
export function pickNext(timed, focus) {
  if (!focus) return undefined;
  const idx = timed.findIndex((e) => e.id === focus.id);
  for (let i = idx + 1; i < timed.length; i++) {
    if (timed[i].phase !== 'past') return timed[i];
  }
  return undefined;
}

/**
 * Ricky's own name/initials — a personal-calendar event that names him is a
 * direct signal he's personally involved, not just an entry that landed on
 * his calendar. Real examples: "Ricky take and pick up- Norah vball
 * practice", "C digestive health appointment - RC may need to pick up
 * girls". Word-boundary matched so "RC" doesn't fire on "search" or "arch".
 *
 * Expected to need tuning — Ricky, 2026-08-18: *"this will be tricky to
 * parse out and will likely take consistent tweaking, both in the device
 * logic, but also IRL the way that meetings get put on this calendar."*
 */
const NAME_MARKERS = [/\bricky\b/i, /\brc\b/i];

/**
 * How much slack a "protective block" on the work calendar gets, on either
 * boundary, before it no longer counts as the SAME commitment as the
 * personal event it's supposedly guarding. Ricky: "sometimes the work block
 * will include travel time, so they might start earlier and/or end later" —
 * real examples run 5–20 minutes of padding, so 60 is generous room for
 * genuine travel time while still excluding a block that just happens to
 * contain the personal event without being FOR it.
 *
 * That distinction is why this exists at all: a bare time-overlap check
 * looked sufficient until "Ricky GTD" (a 9:30am–4:50pm general availability
 * block, not tied to anything specific) turned out to overlap Friday's
 * "Reese vball practice" too — which Ricky explicitly wants demoted, not
 * claimed. A block spanning 7+ hours around a 75-minute practice is not the
 * same thing as a block built to cover it.
 */
const PROTECTIVE_BLOCK_PADDING_MS = 60 * 60_000;

/** Same real-world commitment, work block padded with travel time either side. */
function isProtectiveMatch(work, personal) {
  const startDiff = Math.abs(new Date(work.start) - new Date(personal.start));
  const endDiff = Math.abs(new Date(work.end) - new Date(personal.end));
  return startDiff <= PROTECTIVE_BLOCK_PADDING_MS && endDiff <= PROTECTIVE_BLOCK_PADDING_MS;
}

/**
 * Personal-calendar events are demoted by default: the account carries other
 * people's activities (a kid's game, a kid's practice) that Ricky isn't
 * necessarily attending himself, and treating every one of them as a hero
 * candidate buries his own actual commitments. Two things "claim" one,
 * putting it back in competition on equal footing with work events:
 *
 *   1. His own name/initials are in the title (NAME_MARKERS above) — direct
 *      evidence he's involved.
 *   2. A matching WORK-calendar block exists (isProtectiveMatch above).
 *      Ricky, 2026-08-18: *"I often ALSO put related blocks on my work
 *      calendar, so that my coworkers don't book meetings for me when I need
 *      to be at a game or practice."* The block's existence is itself the
 *      signal — even when the personal event's own title says nothing about
 *      him.
 *
 * Claiming only UNLOCKS the personal event — it does not change its time or
 * remove the matched work block. Both then compete on the existing
 * shortest-duration rule exactly as before, which already does the right
 * thing here: the work block is typically the wider container (travel time
 * padding it further), so the personal event — shorter, and carrying the
 * real title/location/conference/attendees — already wins that comparison
 * on its own. This is deliberately the simpler of two designs considered:
 * merging the personal event's displayed time onto the (wider, more
 * accurate) work block's window is closer to what Ricky described ("the
 * work block time is the priority"), but doing that AND folding the matched
 * work event out of candidacy broke the existing historical regression
 * tests below, which model overlaps where a personal and a work event
 * happen to intersect with no deliberate blocking relationship at all —
 * merging them would have been wrong there. Revisit if a real case shows
 * unlock-only isn't enough.
 *
 * An unclaimed personal event is dropped outright — not demoted, not shown
 * dim in the list, just not part of the day Peripheral is describing. Ricky:
 * "it doesn't even need to be listed, really."
 */
export function resolvePersonalEvents(timed) {
  const nonPersonal = timed.filter((e) => e.calendar !== 'personal');
  return timed.filter((e) => {
    if (e.calendar !== 'personal') return true;
    if (NAME_MARKERS.some((re) => re.test(e.title))) return true;
    return nonPersonal.some((w) => isProtectiveMatch(w, e));
  });
}

/**
 * The whole hero decision for a day's events: sort, split all-day from timed,
 * phase the timed ones, pick the focus.
 *
 * ALL-DAY EVENTS ARE NOT CANDIDATES FOR THE HERO.
 *
 * An all-day event spans local midnight to local midnight, so classify() calls
 * it 'now' for the entire day — and since 'now' wins the focus slot, a single
 * US Holidays entry would sit in the hero from midnight to midnight and hide
 * every actual meeting. That is the North Star failing outright: you would
 * still have to open Google Calendar to find out what's next.
 *
 * This did not show up on mock data, which had no all-day events. It became
 * live the moment the real calendar list was discovered, because the account
 * carries a holidays calendar. So: all-day events are context, listed but
 * never focused, and never on the countdown or the progress bar.
 */
export function selectAgenda(events, now) {
  const sorted = [...events].sort((a, b) => new Date(a.start) - new Date(b.start));
  const allDay = sorted.filter((e) => e.allDay);
  const timedRaw = sorted.filter((e) => !e.allDay).map(applyDurationOverrides);
  // resolvePersonalEvents only filters (unclaimed personal events dropped);
  // it never changes start/end, so start order from `sorted` is preserved.
  const timed = resolvePersonalEvents(timedRaw).map((ev) => ({ ...ev, phase: classify(ev, now) }));
  const focus = pickFocus(timed);
  return { allDay, timed, focus, next: pickNext(timed, focus) };
}
