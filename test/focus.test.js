/* focus.test.js — the hero pick.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────────────────────────────────────────────────────────
 * The hero rule was wrong twice on 2026-08-17, and the second wrong version
 * looked exactly like the first one working. Each rule had been derived from a
 * single observed overlap, which is a coincidence, not evidence: the two
 * candidate rules AGREED on that one case, so it could not distinguish them.
 * The second real overlap of the day is what separated them.
 *
 * Standing rule this file enforces: a rule derived from one observed case gets
 * that case written down as a test before it ships. Every dated case below is a
 * real moment from Ricky's calendar, not a hypothetical — so when someone
 * changes this logic a third time, the failures name a day and a consequence.
 *
 * `now` is always passed in explicitly. Nothing here reads the wall clock.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { classify, pickFocus, pickNext, selectAgenda, resolvePersonalEvents } from '../web/panes/agenda/focus.js';

/* Local-time helper. The panel is single-machine and single-timezone by
 * design, and the real data arrives with -04:00 offsets, so building local
 * Dates is the honest reproduction of what the browser sees. */
const at = (h, m = 0) => new Date(2026, 7, 17, h, m, 0, 0); // 2026-08-17, local

const ev = (id, startH, startM, endH, endM, extra = {}) => ({
  id,
  title: id,
  start: at(startH, startM).toISOString(),
  end: at(endH, endM).toISOString(),
  allDay: false,
  ...extra,
});

/* ── classify ───────────────────────────────────────────────────────────── */

test('classify: an event is past once it has ended, inclusive of its end', () => {
  const e = ev('m', 14, 0, 14, 30);
  assert.equal(classify(e, at(14, 30)), 'past');
  assert.equal(classify(e, at(14, 29)), 'now');
});

test('classify: an event is now from its start instant, not after it', () => {
  const e = ev('m', 14, 0, 14, 30);
  assert.equal(classify(e, at(14, 0)), 'now');
  assert.equal(classify(e, at(13, 59)), 'future');
});

/* ── the two real regressions ───────────────────────────────────────────── */

/* Attempt 1 shipped start-order and failed here: the hero went to the long
 * block, showing 40 minutes of runway instead of the 10 that mattered. */
test('2026-08-17 14:20 — a short meeting beats the long block it sits inside', () => {
  const block = ev('Norah vball', 13, 0, 15, 0, { calendar: 'personal' });
  const meeting = ev('Focus check-in', 14, 0, 14, 30, { calendar: 'work' });

  const { focus } = selectAgenda([block, meeting], at(14, 20));
  assert.equal(focus.id, 'Focus check-in');
});

/* Attempt 2 shipped ending-soonest — which passes the case above, and fails
 * here. The practice ends at 16:30 and the meeting at 16:45, so ending-soonest
 * demoted the meeting Ricky was actually sitting in. This is the case that
 * proves duration, not end time, is the discriminator. */
test('2026-08-17 16:10 — a meeting beats a 2h practice that ends sooner', () => {
  const practice = ev('Reese vball practice', 14, 30, 16, 30, { calendar: 'personal' });
  const meeting = ev('Allied Milk Producers', 16, 0, 16, 45, { calendar: 'work' });

  const { focus } = selectAgenda([practice, meeting], at(16, 10));
  assert.equal(focus.id, 'Allied Milk Producers');
});

/* The same day carried several self-blocks on the work calendar — "Focus time",
 * "Out of office", "After 5p for me". They are containers, and a real meeting
 * overlapping one must win regardless of which ends first. */
test('a self-block never takes the hero from an overlapping meeting', () => {
  const focusTime = ev('Focus time', 14, 30, 15, 50, { calendar: 'work' });
  const kickoff = ev('RAZ-35857 kickoff', 15, 45, 16, 0, { calendar: 'work' });

  const { focus } = selectAgenda([focusTime, kickoff], at(15, 47));
  assert.equal(focus.id, 'RAZ-35857 kickoff');
});

/* ── the tiebreak ───────────────────────────────────────────────────────── */

/* CORRECTED 2026-08-18: was "ends soonest wins" — this test used to assert
 * the opposite of what's below. Ricky, shown a real pair of same-length
 * meetings (a production meeting and an onboarding call starting inside it):
 * the newer one should take over, not the one you were already in. */
test('equal-length overlapping events: the one that started more recently wins', () => {
  const older = ev('started earlier', 16, 0, 16, 30);
  const newer = ev('started later', 16, 15, 16, 45);

  const { focus } = selectAgenda([older, newer], at(16, 20));
  assert.equal(focus.id, 'started later');
});

/* ── duration overrides ─────────────────────────────────────────────────── */

/* Real case, 2026-08-18: "BAL-Thurs Production Meeting" is booked 60 minutes
 * and routinely runs 30. Ricky: hard-code it, no general logic needed. This
 * alone resolves the real conflict — the override drops it below the
 * onboarding call's actual duration, so no tiebreak is even reached. */
test('a known-short recurring meeting loses the hero once its real length is up', () => {
  const production = ev('BAL-Thurs Production Meeting', 10, 30, 11, 30, { calendar: 'work' });
  const onboarding = ev('M2M Partner Onboarding Overview', 11, 0, 12, 0, { calendar: 'work' });

  // Still within the booked hour, but past the 30 minutes it actually runs.
  const { focus } = selectAgenda([production, onboarding], at(11, 5));
  assert.equal(focus.id, 'M2M Partner Onboarding Overview');
});

/* CORRECTED 2026-08-18, same day: this test originally asserted the override
 * left `end` untouched, so the countdown would still read against the real
 * 11:30 calendar hold. Ricky, once shown that asymmetry: "let's have the
 * countdown be the 30 minute timer, not the calendar hold." The override
 * now replaces `end` outright — this is the ONLY meeting this applies to. */
test('a duration override replaces the displayed end time too, not just eligibility', () => {
  const production = ev('BAL-Thurs Production Meeting', 10, 30, 11, 30, { calendar: 'work' });

  const { focus } = selectAgenda([production], at(10, 45));
  assert.equal(focus.id, 'BAL-Thurs Production Meeting');
  // The countdown reads against 11:00 (30 real minutes), not the 11:30 the
  // calendar still shows.
  assert.equal(new Date(focus.end).getHours(), 11);
  assert.equal(new Date(focus.end).getMinutes(), 0);
});

test('the override is name-matched, not calendar-wide — an unrelated meeting is unaffected', () => {
  const other = ev('Weekly DS + Media Meeting + Status', 10, 0, 11, 0, { calendar: 'work' });
  const shorter = ev('1:1 with Nick', 10, 30, 10, 45, { calendar: 'work' });

  const { focus } = selectAgenda([other, shorter], at(10, 35));
  assert.equal(focus.id, '1:1 with Nick'); // genuinely shorter, no override involved
});

/* ── personal-event claiming ─────────────────────────────────────────────── */

/* Real case, 2026-08-18: Ricky's own account of why "Norah vball game" (no
 * name in the title) should still count — he protects it with a block on
 * his work calendar too, "so that my coworkers don't book meetings for me
 * when I need to be at a game or practice." The work block's existence is
 * the claim; the personal event's own title doesn't need to say his name. */
test('a protective work-calendar block claims the matching personal event', () => {
  const workBlock = ev("Norah's first school volleyball game", 16, 15, 17, 50, { calendar: 'work' });
  const game = ev('Norah vball game', 16, 30, 17, 30, { calendar: 'personal' });

  const { timed } = selectAgenda([workBlock, game], at(16, 40));
  assert.ok(timed.some((e) => e.id === 'Norah vball game'));
});

/* Companion to the above: once claimed, the personal event still wins the
 * hero on the EXISTING shortest-duration rule — the work block is the wider
 * container (it's carrying the travel-time padding), so no new precedence
 * logic was needed once the event stopped being dropped. */
test('a claimed personal event still beats its own wider protective block on duration', () => {
  const workBlock = ev("Norah's first school volleyball game", 16, 15, 17, 50, { calendar: 'work' });
  const game = ev('Norah vball game', 16, 30, 17, 30, { calendar: 'personal' });

  const { focus } = selectAgenda([workBlock, game], at(16, 40));
  assert.equal(focus.id, 'Norah vball game');
});

/* Real case, 2026-08-18: Ricky specifically wants "Reese vball practice"
 * (Friday, no name in the title) demoted in favor of a real work meeting —
 * but the naive version of this rule (any overlapping work event claims)
 * would have wrongly rescued it too, because "Ricky GTD" — a 9:30am–4:50pm
 * general availability block, not built for this practice — also happens to
 * span it. Padding tolerance is what tells them apart. */
test('a sprawling availability block does NOT claim an unrelated personal event inside it', () => {
  const allDayAvailability = ev('Ricky GTD', 9, 30, 16, 50, { calendar: 'work' });
  const practice = ev('Reese vball practice', 15, 15, 16, 30, { calendar: 'personal' });

  const { timed } = selectAgenda([allDayAvailability, practice], at(15, 30));
  assert.ok(!timed.some((e) => e.id === 'Reese vball practice'));
});

/* Real case, 2026-08-18: "C digestive health appointment - RC may need to
 * pick up girls" — claimed by initials, independent of any work block. */
test('a personal event is claimed by Ricky\'s initials, not just his full name', () => {
  const appt = ev('C digestive health appointment - RC may need to pick up girls', 14, 25, 15, 25,
    { calendar: 'personal' });

  const { timed } = selectAgenda([appt], at(14, 30));
  assert.ok(timed.some((e) => e.id.includes('RC may need')));
});

/* An unnamed, unclaimed personal event with nothing else on the calendar at
 * all is dropped outright — not merely demoted. Ricky: "it doesn't even
 * need to be listed, really." */
test('resolvePersonalEvents: an unclaimed personal event is dropped, not just demoted', () => {
  const someonesGame = ev('Norah vball game', 16, 30, 17, 30, { calendar: 'personal' });
  assert.deepEqual(resolvePersonalEvents([someonesGame]), []);
});

/* Work and "other" (a colleague's calendar, etc.) events are never touched —
 * the filter only ever looks at calendar: 'personal'. */
test('resolvePersonalEvents: non-personal events pass through untouched', () => {
  const meeting = ev('Weekly DS + Media Meeting + Status', 10, 0, 11, 0, { calendar: 'work' });
  assert.deepEqual(resolvePersonalEvents([meeting]), [meeting]);
});

/* ── all-day events are context, never focus ────────────────────────────── */

/* An all-day event spans local midnight to local midnight, so it classifies as
 * 'now' all day. Before this was handled, one US Holidays entry owned the hero
 * from midnight to midnight and hid every real meeting. */
test('an all-day event never takes the hero, even with nothing else live', () => {
  const holiday = { id: 'US Holiday', title: 'US Holiday', allDay: true,
    start: at(0, 0).toISOString(), end: new Date(2026, 7, 18).toISOString() };
  const later = ev('Sprint sync', 17, 0, 17, 30);

  const { allDay, timed, focus } = selectAgenda([holiday, later], at(16, 10));
  assert.equal(allDay.length, 1);
  assert.equal(timed.length, 1);
  assert.equal(focus.id, 'Sprint sync');
});

test('an all-day event is not offered as focus when the day is otherwise empty', () => {
  const holiday = { id: 'US Holiday', title: 'US Holiday', allDay: true,
    start: at(0, 0).toISOString(), end: new Date(2026, 7, 18).toISOString() };

  const { focus } = selectAgenda([holiday], at(16, 10));
  assert.equal(focus, undefined);
});

/* ── future fallback and exhaustion ─────────────────────────────────────── */

test('with nothing live, the soonest future event takes the hero', () => {
  const soon = ev('Sprint sync', 17, 0, 17, 30);
  const later = ev('PT appointment', 17, 30, 18, 30);

  const { focus } = selectAgenda([later, soon], at(16, 50));
  assert.equal(focus.id, 'Sprint sync');
});

test('a long future event is not penalised — duration only breaks live ties', () => {
  const longOne = ev('Evening block', 17, 0, 19, 0);
  const shortLater = ev('Quick call', 18, 0, 18, 15);

  const { focus } = selectAgenda([longOne, shortLater], at(16, 50));
  assert.equal(focus.id, 'Evening block');
});

test('once every timed event is past there is no focus', () => {
  const { focus } = selectAgenda([ev('Sprint sync', 9, 0, 9, 30)], at(16, 10));
  assert.equal(focus, undefined);
});

test('selectAgenda does not mutate or reorder the caller\'s array', () => {
  const input = [ev('later', 17, 0, 17, 30), ev('earlier', 9, 0, 9, 30)];
  const snapshot = input.map((e) => e.id);

  const { timed } = selectAgenda(input, at(16, 10));
  assert.deepEqual(input.map((e) => e.id), snapshot);
  assert.deepEqual(timed.map((e) => e.id), ['earlier', 'later']);
});

/* pickFocus operates on already-phased events, so guard the empty input the
 * renderer would otherwise have to special-case. */
test('pickFocus returns undefined for an empty day', () => {
  assert.equal(pickFocus([]), undefined);
});

/* ── pickNext: the "and then what?" column ──────────────────────────────── */

test('pickNext: the event right behind the hero, not the hero itself', () => {
  const { timed, focus, next } = selectAgenda(
    [ev('sync', 16, 0, 16, 30), ev('kwr', 17, 0, 17, 30)], at(15, 50));
  assert.equal(focus.id, 'sync');
  assert.equal(next.id, 'kwr');
  assert.ok(timed);
});

test('pickNext: undefined when nothing follows the hero', () => {
  const { next } = selectAgenda([ev('sync', 16, 0, 16, 30)], at(15, 50));
  assert.equal(next, undefined);
});

test('pickNext: skips a longer event that overlaps but started before the hero', () => {
  // Same shape as the shortest-duration-wins case: the practice started
  // earlier and overlaps the meeting, so it sits before focus in start order.
  // It must not be reported as "next" — it's already happening, not ahead.
  const practice = ev('practice', 14, 30, 16, 30, { calendar: 'personal' });
  const meeting = ev('meeting', 16, 0, 16, 45, { calendar: 'work' });
  const later = ev('later', 17, 0, 17, 30);

  const { focus, next } = selectAgenda([practice, meeting, later], at(16, 10));
  assert.equal(focus.id, 'meeting');
  assert.equal(next.id, 'later');
});

test('pickNext: undefined when there is no focus at all', () => {
  assert.equal(pickNext([ev('past', 9, 0, 9, 30)], undefined), undefined);
});
