/* mode.js — agenda or fish tank? (Sprint 9)
 *
 * During free time the panel shows the tank; the agenda takes the glass back
 * during an event and for `leadMinutes` before the next one. This is the one
 * decision that can hide a meeting, so — like focus.js — it is pure, has no
 * clock of its own, and lives where both the daemon (Node) and test/ can
 * import it. The tank page imports it too, for the slate stone's text, so the
 * stone and the mode switch can never disagree about what "next" means.
 *
 * Rules, from the roadmap (planned with Ricky 2026-10-07):
 *   - Event in progress                         -> agenda
 *   - Next event starts within leadMinutes      -> agenda
 *   - Otherwise                                 -> tank, including when
 *                                                  nothing remains today
 *   - Gaps of leadMinutes or less never show the tank — that falls out of the
 *     second rule, so back-to-back meetings cannot flicker.
 *   - All-day events ignored (2026-08-17: context, never focus).
 *   - Free/transparent and declined events ignored. Declined never reach the
 *     state (gcal.js drops them); transparent ones are filtered here.
 *   - Hard cut at T-lead for v1.
 *
 * The event set is the AGENDA's set: selectAgenda() applies the duration
 * overrides and the personal-calendar demotion, so a personal event the
 * agenda would not show cannot pull the agenda onto the glass either, and a
 * production meeting that "ends" at 30 minutes hands back to the tank at 30.
 */

import { selectAgenda } from '../agenda/focus.js';

export const DEFAULT_LEAD_MINUTES = 10;

/**
 * The agenda's view of the day, minus events marked "Show as: Free".
 *
 * @param {object[]} events  state.events
 * @param {Date} now
 */
export function commitments(events, now) {
  return selectAgenda((events ?? []).filter((e) => !e.transparent), now);
}

/**
 * @param {Date} now
 * @param {object[]|null|undefined} events  state.events, or null when the
 *   daemon has no calendar state at all
 * @param {number} leadMinutes
 * @returns {'agenda'|'tank'}
 */
export function resolveMode(now, events, leadMinutes = DEFAULT_LEAD_MINUTES) {
  /* No calendar state at all is NOT an empty day. "Nothing scheduled" is a
   * specific claim (see collect() in gcal.js) and the tank would be making it
   * silently; the agenda at least says what it knows. */
  if (!Array.isArray(events)) return 'agenda';

  const { timed } = commitments(events, now);
  if (timed.some((e) => e.phase === 'now')) return 'agenda';

  const next = timed.find((e) => e.phase === 'future');
  if (next && new Date(next.start) - now <= leadMinutes * 60_000) return 'agenda';

  return 'tank';
}

/**
 * What the slate stone should say: the event in progress (only reachable in a
 * browser — the daemon would be showing the agenda), else the next event
 * today, else tomorrow's first, else nothing.
 *
 * @param {Date} now
 * @param {{events?: object[], tomorrow?: object[]}|null} state
 * @returns {{kind: 'now'|'today'|'tomorrow'|'clear', event?: object}}
 */
export function stoneSubject(now, state) {
  const { timed } = commitments(state?.events, now);
  const live = timed.find((e) => e.phase === 'now');
  if (live) return { kind: 'now', event: live };
  const next = timed.find((e) => e.phase === 'future');
  if (next) return { kind: 'today', event: next };

  /* Tomorrow's events are all 'future' relative to now, so selectAgenda's
   * phase is right for them too. Its focus pick is the first one. */
  const { timed: tmr } = commitments(state?.tomorrow, now);
  const first = tmr.find((e) => e.phase === 'future');
  if (first) return { kind: 'tomorrow', event: first };
  return { kind: 'clear' };
}
