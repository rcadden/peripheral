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

import { classify, pickFocus, selectAgenda } from '../web/panes/agenda/focus.js';

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

test('equal-length overlapping events fall back to ending soonest', () => {
  const a = ev('ends later', 16, 15, 16, 45);
  const b = ev('ends sooner', 16, 0, 16, 30);

  const { focus } = selectAgenda([a, b], at(16, 20));
  assert.equal(focus.id, 'ends sooner');
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
