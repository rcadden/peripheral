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
 * concurrent live events the SHORTEST one wins; ending-soonest breaks ties.
 *
 * History, because this rule has now been wrong twice and the second version
 * looked like the first one working:
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
 */
export function pickFocus(timed) {
  const live = timed.filter((e) => e.phase === 'now')
    .sort((a, b) => duration(a) - duration(b) || new Date(a.end) - new Date(b.end));
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
  const timed = sorted.filter((e) => !e.allDay)
    .map((ev) => ({ ...ev, phase: classify(ev, now) }));
  const focus = pickFocus(timed);
  return { allDay, timed, focus, next: pickNext(timed, focus) };
}
