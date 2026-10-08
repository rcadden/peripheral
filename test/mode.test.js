/* mode.test.js — agenda or fish tank (Sprint 9).
 *
 * The roadmap named these fixtures before a line of code existed: back-to-back,
 * all-day only, empty day, event in progress, 9- vs 11-minute gap, and
 * workingLocation noise. This is the one decision that can hide a meeting
 * behind an aquarium, so every case states the consequence of getting it wrong.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveMode, stoneSubject } from '../web/panes/tank/mode.js';
import { normaliseEvent } from '../src/sources/gcal.js';

const at = (h, m = 0, day = 8) => new Date(2026, 9, day, h, m, 0, 0); // 2026-10-08 local

const ev = (id, sh, sm, eh, em, extra = {}) => ({
  id, title: id, calendar: 'work', allDay: false,
  start: at(sh, sm).toISOString(), end: at(eh, em).toISOString(), ...extra,
});

const allDay = (id) => ({
  id, title: id, calendar: 'holidays', allDay: true,
  start: at(0, 0).toISOString(), end: at(0, 0, 9).toISOString(),
});

test('an event in progress shows the agenda', () => {
  assert.equal(resolveMode(at(10, 15), [ev('standup', 10, 0, 10, 30)], 10), 'agenda');
});

test('free time with the next event far off shows the tank', () => {
  assert.equal(resolveMode(at(9, 0), [ev('standup', 10, 0, 10, 30)], 10), 'tank');
});

test('the agenda takes over exactly at T-lead — a hard cut, inclusive', () => {
  const events = [ev('review', 14, 0, 15, 0)];
  assert.equal(resolveMode(at(13, 49), events, 10), 'tank');
  assert.equal(resolveMode(at(13, 50), events, 10), 'agenda');
});

test('back-to-back meetings never show the tank between them', () => {
  const events = [ev('a', 10, 0, 10, 30), ev('b', 10, 30, 11, 0)];
  for (const m of [0, 15, 29, 30, 31, 59]) {
    assert.equal(resolveMode(at(10, m), events, 10), 'agenda', `10:${m}`);
  }
  assert.equal(resolveMode(at(11, 0), events, 10), 'tank');
});

test('a 9-minute gap stays on the agenda; an 11-minute gap shows the tank for its first minute', () => {
  const nine = [ev('a', 10, 0, 10, 30), ev('b', 10, 39, 11, 0)];
  assert.equal(resolveMode(at(10, 30), nine, 10), 'agenda');
  assert.equal(resolveMode(at(10, 35), nine, 10), 'agenda');

  const eleven = [ev('a', 10, 0, 10, 30), ev('b', 10, 41, 11, 0)];
  assert.equal(resolveMode(at(10, 30), eleven, 10), 'tank');
  assert.equal(resolveMode(at(10, 31), eleven, 10), 'agenda');
});

test('nothing left today shows the tank', () => {
  assert.equal(resolveMode(at(18, 0), [ev('a', 10, 0, 11, 0)], 10), 'tank');
});

test('an empty day shows the tank', () => {
  assert.equal(resolveMode(at(12, 0), [], 10), 'tank');
});

test('NO calendar state is not an empty day — the agenda says what it knows', () => {
  assert.equal(resolveMode(at(12, 0), null, 10), 'agenda');
  assert.equal(resolveMode(at(12, 0), undefined, 10), 'agenda');
});

test('all-day events never pull the agenda onto the glass (2026-08-17 rule)', () => {
  assert.equal(resolveMode(at(12, 0), [allDay('Columbus Day')], 10), 'tank');
});

test('a free ("Show as: Free") event does not count', () => {
  assert.equal(resolveMode(at(12, 15), [ev('lunch', 12, 0, 13, 0, { transparent: true })], 10), 'tank');
});

test('workingLocation noise never reaches the mode rule', () => {
  const raw = {
    id: 'wl', eventType: 'workingLocation', summary: 'Home',
    start: { dateTime: at(9, 0).toISOString() }, end: { dateTime: at(17, 0).toISOString() },
  };
  const events = [normaliseEvent(raw, 'work')].filter(Boolean);
  assert.equal(resolveMode(at(12, 0), events, 10), 'tank');
});

test('an unclaimed personal event does not take the glass — same set as the agenda', () => {
  const practice = ev('Reese vball practice', 12, 0, 13, 15, { calendar: 'personal' });
  assert.equal(resolveMode(at(12, 30), [practice], 10), 'tank');
  const claimed = ev('Ricky pick up from practice', 12, 0, 13, 15, { calendar: 'personal' });
  assert.equal(resolveMode(at(12, 30), [claimed], 10), 'agenda');
});

test('the production-meeting override hands back to the tank at 30 minutes', () => {
  const pm = ev('BAL-Thurs/Mon. Production Meeting', 10, 0, 11, 0);
  assert.equal(resolveMode(at(10, 20), [pm], 10), 'agenda');
  assert.equal(resolveMode(at(10, 45), [pm], 10), 'tank');
});

test('leadMinutes is honoured', () => {
  const events = [ev('review', 14, 0, 15, 0)];
  assert.equal(resolveMode(at(13, 40), events, 20), 'agenda');
  assert.equal(resolveMode(at(13, 40), events, 5), 'tank');
});

/* ── the slate stone ─────────────────────────────────────────────────────── */

test('stone: next event today', () => {
  const s = stoneSubject(at(9, 0), { events: [ev('standup', 10, 0, 10, 30)] });
  assert.equal(s.kind, 'today');
  assert.equal(s.event.id, 'standup');
});

test('stone: after the last event, tomorrow\'s first (Ricky 2026-10-08)', () => {
  const s = stoneSubject(at(18, 0), {
    events: [ev('a', 10, 0, 11, 0)],
    tomorrow: [ev('later', 13, 0, 14, 0, { start: at(13, 0, 9).toISOString(), end: at(14, 0, 9).toISOString() }),
               ev('first', 9, 0, 9, 30, { start: at(9, 0, 9).toISOString(), end: at(9, 30, 9).toISOString() })],
  });
  assert.equal(s.kind, 'tomorrow');
  assert.equal(s.event.id, 'first');
});

test('stone: tomorrow\'s all-day events are not "first"', () => {
  const s = stoneSubject(at(18, 0), { events: [], tomorrow: [{ ...allDay('x'), start: at(0, 0, 9).toISOString(), end: at(0, 0, 10).toISOString() }] });
  assert.equal(s.kind, 'clear');
});

test('stone: a cached state from before Sprint 9 (no tomorrow) is just clear', () => {
  assert.equal(stoneSubject(at(18, 0), { events: [] }).kind, 'clear');
  assert.equal(stoneSubject(at(18, 0), null).kind, 'clear');
});
