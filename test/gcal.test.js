/* gcal.test.js — the normaliser, against recorded Google payload shapes.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────────────────────────────────────────────────────────
 * `ApiProvider.fetchToday()` was written before the OAuth client existed, so
 * it has never seen a real response. The network half of it is unverifiable
 * today. The normalisation half is not — Google's event resource shapes are
 * documented and stable, and every judgement call in `normaliseEvent()`
 * (declined = absent, all-day end dates are exclusive, no summary = "Busy")
 * is a decision that will be wrong silently on the panel if it is wrong here.
 *
 * These fixtures are hand-built from the documented resource shape, NOT
 * captured from a live account. That is the limitation: they prove the
 * transform, they do not prove the field names Google actually sends. When
 * the token exists, spot-check one real payload against these.
 *
 * `node --test`, zero dependencies. Run with `npm test`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normaliseEvent,
  detectConference,
  isDeclined,
  dayWindow,
  toLocalIso,
  guessLabel,
} from '../src/sources/gcal.js';

/* ── helpers ─────────────────────────────────────────────────────────── */

/** A timed event, offset-bearing like Google sends. */
const timed = (over = {}) => ({
  id: 'evt1',
  status: 'confirmed',
  summary: 'Media team standup',
  start: { dateTime: '2026-08-17T09:30:00-04:00', timeZone: 'America/New_York' },
  end: { dateTime: '2026-08-17T09:55:00-04:00', timeZone: 'America/New_York' },
  ...over,
});

/* ── time window ─────────────────────────────────────────────────────── */

test('toLocalIso carries an explicit offset, never bare UTC', () => {
  const iso = toLocalIso(new Date(2026, 7, 17, 0, 0, 0));
  assert.match(iso, /^2026-08-17T00:00:00[+-]\d{2}:\d{2}$/);
  assert.ok(!iso.endsWith('Z'), 'a Z suffix would shift the day by the offset');
});

test('dayWindow spans local midnight to local midnight', () => {
  const { timeMin, timeMax } = dayWindow(new Date(2026, 7, 17, 14, 3, 9));
  assert.match(timeMin, /^2026-08-17T00:00:00/);
  assert.match(timeMax, /^2026-08-18T00:00:00/);
  assert.ok(new Date(timeMax) - new Date(timeMin) === 86_400_000
    || Math.abs(new Date(timeMax) - new Date(timeMin) - 86_400_000) === 3_600_000,
    'exactly 24h, or 23/25h across a DST boundary');
});

test('dayWindow handles a DST boundary without losing the evening', () => {
  // 2026-11-01 is the US fall-back date: that local day is 25 hours long.
  const { timeMin, timeMax } = dayWindow(new Date(2026, 10, 1, 12, 0, 0));
  assert.match(timeMin, /^2026-11-01T00:00:00/);
  assert.match(timeMax, /^2026-11-02T00:00:00/);
});

/* ── exclusions ──────────────────────────────────────────────────────── */

test('cancelled events are dropped', () => {
  assert.equal(normaliseEvent(timed({ status: 'cancelled' }), 'work'), null);
});

test('a declined invite is treated as absent, not dim', () => {
  const raw = timed({
    attendees: [
      { email: 'someone@else.com', responseStatus: 'accepted' },
      { email: 'ricky@x.com', self: true, responseStatus: 'declined' },
    ],
  });
  assert.equal(isDeclined(raw), true);
  assert.equal(normaliseEvent(raw, 'work'), null);
});

test('accepted, tentative and needsAction invites all survive', () => {
  for (const responseStatus of ['accepted', 'tentative', 'needsAction']) {
    const raw = timed({ attendees: [{ self: true, responseStatus }] });
    assert.equal(isDeclined(raw), false, responseStatus);
    assert.ok(normaliseEvent(raw, 'work'), responseStatus);
  }
});

test('an event with no attendee list cannot be declined', () => {
  assert.equal(isDeclined(timed()), false);
});

test('a malformed event with neither dateTime nor date is skipped, not thrown', () => {
  assert.equal(normaliseEvent(timed({ start: {} }), 'work'), null);
});

/* ── field mapping ───────────────────────────────────────────────────── */

test('a timed event maps straight through, offsets preserved', () => {
  const ev = normaliseEvent(timed({
    location: 'Reynolds HS',
    attendees: [{ self: true, responseStatus: 'accepted' }, { email: 'b@c.d' }],
  }), 'work');

  assert.equal(ev.id, 'evt1');
  assert.equal(ev.title, 'Media team standup');
  assert.equal(ev.start, '2026-08-17T09:30:00-04:00');
  assert.equal(ev.end, '2026-08-17T09:55:00-04:00');
  assert.equal(ev.allDay, false);
  assert.equal(ev.calendar, 'work');
  assert.equal(ev.location, 'Reynolds HS');
  assert.equal(ev.attendeeCount, 2);
  assert.equal(ev.status, 'confirmed');
});

test('the calendar label comes from the map, never from the account', () => {
  // The whole point of the 2026-08-17 revision: one account, several labels.
  assert.equal(normaliseEvent(timed(), 'personal').calendar, 'personal');
  assert.equal(normaliseEvent(timed(), 'athletics').calendar, 'athletics');
});

test('tentative status is carried, not flattened to confirmed', () => {
  assert.equal(normaliseEvent(timed({ status: 'tentative' }), 'work').status, 'tentative');
});

test('a free/busy-only calendar yields "Busy", never an empty title', () => {
  // freeBusyReader access returns the block with no summary at all. An empty
  // string on the panel reads as a rendering bug rather than as information.
  for (const summary of [undefined, '', '   ']) {
    assert.equal(normaliseEvent(timed({ summary }), 'work').title, 'Busy');
  }
});

test('absent optional fields are undefined, not empty strings or zero', () => {
  const ev = normaliseEvent(timed(), 'work');
  assert.equal(ev.location, undefined);
  assert.equal(ev.attendeeCount, undefined);
  assert.equal(ev.conference, undefined);
});

/* ── all-day ─────────────────────────────────────────────────────────── */

test('all-day end dates are exclusive and land on local midnight', () => {
  // Google sends end.date as the day AFTER the last day. Parsing either bound
  // with `new Date('2026-08-17')` gives UTC midnight, which is the previous
  // evening west of Greenwich — the off-by-one-day bug this guards.
  const ev = normaliseEvent({
    id: 'h1',
    status: 'confirmed',
    summary: 'Labor Day',
    start: { date: '2026-09-07' },
    end: { date: '2026-09-08' },
  }, 'holidays');

  assert.equal(ev.allDay, true);
  assert.match(ev.start, /^2026-09-07T00:00:00[+-]/);
  assert.match(ev.end, /^2026-09-08T00:00:00[+-]/);
  assert.equal(new Date(ev.start).getDate(), 7, 'must not slip to the 6th');
});

/* ── conference detection ────────────────────────────────────────────── */

test('Meet is detected from the structured field and from hangoutLink', () => {
  assert.equal(detectConference({
    conferenceData: { conferenceSolution: { key: { type: 'hangoutsMeet' } } },
  }), 'meet');
  assert.equal(detectConference({ hangoutLink: 'https://meet.google.com/abc-defg-hij' }), 'meet');
});

test('Zoom and Teams are detected from the entry-point URI', () => {
  const withUri = (uri) => ({
    conferenceData: {
      conferenceSolution: { key: { type: 'addOn' } },
      entryPoints: [{ entryPointType: 'video', uri }],
    },
  });
  assert.equal(detectConference(withUri('https://balcom.zoom.us/j/123')), 'zoom');
  assert.equal(detectConference(withUri('https://teams.microsoft.com/l/meetup-join/x')), 'teams');
});

test('a conference link pasted into location or description still counts', () => {
  assert.equal(detectConference({ location: 'https://us02web.zoom.us/j/9' }), 'zoom');
  assert.equal(detectConference({ description: 'dial in: https://meet.google.com/x' }), 'meet');
});

test('an ordinary in-person event has no conference', () => {
  assert.equal(detectConference({ location: 'Reynolds HS', description: 'bring snacks' }), undefined);
});

/* ── label guessing ──────────────────────────────────────────────────── */

test('guessLabel matches what `npm run auth` prints', () => {
  // These two must agree or the map you paste from `npm run auth` disagrees
  // with what the daemon does when you paste nothing.
  assert.equal(guessLabel({ id: 'ricky@balcomagency.com', primary: true }, 'work'), 'work');
  assert.equal(guessLabel({ id: 'grcadden@gmail.com' }, 'work'), 'personal');
  assert.equal(guessLabel({ id: 'en.usa#holiday@group.v.calendar.google.com' }, 'work'), 'holidays');
  assert.equal(guessLabel({ id: 'kcbn7gua52qb1enmissvieovipboc050@import.calendar.google.com' }, 'work'), 'athletics');
  assert.equal(guessLabel({ id: 'opaque@group.calendar.google.com' }, 'work'), 'other');
});
