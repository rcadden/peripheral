/* gcal-days.test.js — the two-day fetch behind Sprint 9's slate stone, and
 * the transparency flag behind its mode rule. The property that matters:
 * `events` still means exactly "today" for everything that already reads it. */

import test from 'node:test';
import assert from 'node:assert/strict';

import { twoDayWindow, splitDays, tomorrowStart, normaliseEvent, collect, dayWindow } from '../src/sources/gcal.js';

const at = (d, h, m = 0) => new Date(2026, 9, d, h, m);
const e = (id, start, end) => ({ id, start: start.toISOString(), end: end.toISOString(), allDay: false });

test('the two-day window starts where the one-day window did and runs a day longer', () => {
  const now = at(8, 14, 3);
  assert.equal(twoDayWindow(now).timeMin, dayWindow(now).timeMin);
  assert.match(twoDayWindow(now).timeMax, /^2026-10-10T00:00:00/);
});

test('splitDays: an event running past midnight stays today, as it always did', () => {
  const late = e('late', at(8, 23), at(9, 1));
  const morning = e('morning', at(9, 9), at(9, 10));
  const { today, tomorrow } = splitDays([late, morning], at(8, 12));
  assert.deepEqual(today.map((x) => x.id), ['late']);
  assert.deepEqual(tomorrow.map((x) => x.id), ['morning']);
});

test('splitDays: an event starting exactly at midnight is tomorrow\'s', () => {
  const { tomorrow } = splitDays([e('m', tomorrowStart(at(8, 12)), at(9, 1))], at(8, 12));
  assert.equal(tomorrow.length, 1);
});

test('"Show as: Free" is carried as transparent; busy events carry nothing new', () => {
  const base = { id: 'x', summary: 'Lunch', start: { dateTime: '2026-10-08T12:00:00-04:00' },
                 end: { dateTime: '2026-10-08T13:00:00-04:00' } };
  assert.equal(normaliseEvent({ ...base, transparency: 'transparent' }, 'work').transparent, true);
  assert.equal('transparent' in normaliseEvent(base, 'work'), false);
});

test('collect merges tomorrow from fetchDays and tolerates today-only providers', async () => {
  const days = { label: 'a', fetchDays: async () => ({ today: [e('t', at(8, 10), at(8, 11))], tomorrow: [e('m', at(9, 9), at(9, 10))] }) };
  const legacy = { label: 'b', fetchToday: async () => [e('u', at(8, 9), at(8, 10))] };
  const state = await collect([days, legacy]);
  assert.deepEqual(state.events.map((x) => x.id), ['u', 't']);
  assert.deepEqual(state.tomorrow.map((x) => x.id), ['m']);
});
