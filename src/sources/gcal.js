/* gcal.js — Google Calendar source.
 *
 * ── STATUS ───────────────────────────────────────────────────────────────
 * ApiProvider.fetchToday() is IMPLEMENTED (2026-08-17). It has never run
 * against a live Google account, because the OAuth client does not exist yet —
 * the normalisation half is covered by recorded-payload fixtures in
 * `test/gcal.test.js` (`npm test`), the network half is not covered by
 * anything. First real run is the verification. See CLAUDE.md § work calendar.
 *
 * Confirmed 2026-08-17: the personal Google account exposes Personal, US
 * Holidays, and two imported athletics feeds. It does NOT expose the Balcom
 * work calendar, which is the more important half.
 *
 * REVISED 2026-08-17 — THE WORK ACCOUNT IS THE PRIMARY.
 * Sharing work -> personal was tested and is blocked by Balcom. But personal is
 * already natively shared INTO the work calendar (by email, full details, real
 * time). So we authenticate ONCE against work and Google does the merge
 * server-side. One token, no client-side reconciliation.
 *
 * Consequence for this file: an account no longer implies a display label. A
 * single 'work' account now yields both work and personal events, so callers
 * pass a calendarId -> label MAP rather than a bare id array. See ApiProvider.
 *
 * This file is deliberately a PROVIDER INTERFACE so all remaining access routes
 * drop in interchangeably and nothing downstream cares which one we got:
 *
 *   ApiProvider   — OAuth calendar.readonly per account. Real-time. Preferred,
 *                   and now the plan: one instance, account 'work'.
 *   IcsProvider   — private "secret address" .ics. Works almost anywhere, but
 *                   Google refreshes imported feeds every 8-24h, which is
 *                   FATAL for a countdown. Last resort; must set stale=true.
 *
 * REMOVED: SharedProvider (work calendar shared out to the personal account).
 * Balcom blocks outbound external calendar sharing — confirmed 2026-08-17.
 * Do not reintroduce it.
 *
 * Read-only forever. This module must never construct a write request.
 */

/**
 * The one shape the rest of Peripheral understands. Every provider returns
 * this, normalised, sorted by start, times as ISO strings with offset.
 *
 * @typedef {object} PeripheralEvent
 * @property {string}  id
 * @property {string}  title
 * @property {string}  start           ISO 8601 with offset
 * @property {string}  end             ISO 8601 with offset
 * @property {boolean} allDay
 * @property {string}  calendar        DISPLAY label, e.g. "work" | "personal".
 *                                     Deliberately NOT the account — one account
 *                                     can serve several labels. Comes from the
 *                                     calendarId -> label map, never inferred.
 * @property {string=} location
 * @property {number=} attendeeCount
 * @property {'meet'|'zoom'|'teams'|undefined} conference
 * @property {'confirmed'|'tentative'|'cancelled'} status
 *
 * @typedef {object} PeripheralState
 * @property {string}  generatedAt
 * @property {boolean} stale
 * @property {PeripheralEvent[]} events   today only, sorted by start
 */

import { OAuthClient } from '../auth/oauth.js';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

/* ── time ────────────────────────────────────────────────────────────────
 * Everything downstream is local-clock reasoning: "today" is the day this PC
 * thinks it is, and the countdown is against this PC's wall clock. So the
 * query window is local midnight to local midnight, expressed with an explicit
 * offset. Sending a bare UTC window would shift the agenda by the offset and
 * silently drop the last few hours of the evening.
 */

/** ISO 8601 with this machine's UTC offset, e.g. 2026-08-17T00:00:00-04:00. */
export function toLocalIso(d) {
  const p = (n, w = 2) => String(Math.abs(n)).padStart(w, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    + `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    + `${sign}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`;
}

/** Local midnight today → local midnight tomorrow, as ISO strings. */
export function dayWindow(now = new Date()) {
  const min = new Date(now); min.setHours(0, 0, 0, 0);
  const max = new Date(min); max.setDate(max.getDate() + 1);
  return { timeMin: toLocalIso(min), timeMax: toLocalIso(max) };
}

/* ── normalisation ───────────────────────────────────────────────────────
 * Google's event resource is large, inconsistent between calendar types, and
 * changes shape depending on how much the account is allowed to see. This is
 * the only place that knows about any of that.
 */

/**
 * Google `eventType` values that are calendar METADATA rather than events.
 *
 * `workingLocation` is the offender that showed up on first contact with the
 * real account: it rendered as an all-day row reading "Home". It is how Google
 * stores the where-are-you-working banner, it exists on most weekdays, and it
 * is not something that happens at a time. On a six-row panel it costs a row
 * every single day to say nothing.
 *
 * `birthday` and `fromGmail` are pre-emptive: both are all-day, both are
 * derived rather than scheduled, and neither is a commitment.
 *
 * NOT dropped, deliberately: `outOfOffice` and `focusTime`. Those are time
 * Ricky actually blocked, and an ambient panel that hides them would be
 * telling him he is free when he decided he was not. They are real, so they
 * stay — the fix for them is that they should not outrank a live meeting for
 * the hero slot, which is a focus-selection problem, not a filtering one.
 */
const DROPPED_EVENT_TYPES = new Set(['workingLocation', 'birthday', 'fromGmail']);

/**
 * Has the signed-in user declined this? A declined invite must not occupy the
 * hero slot — an event you said no to is not "up next". Treated as absent
 * rather than rendered dim, because the panel is read at a glance and a dim
 * row still reads as a commitment.
 */
export function isDeclined(raw) {
  const self = raw.attendees?.find((a) => a.self);
  if (self) return self.responseStatus === 'declined';
  // No attendee list: a solo event on your own calendar. Can't be declined.
  return false;
}

/** meet | zoom | teams, or undefined. Checks the structured field first. */
export function detectConference(raw) {
  const type = raw.conferenceData?.conferenceSolution?.key?.type;
  if (type === 'hangoutsMeet' || type === 'eventHangout') return 'meet';
  if (raw.hangoutLink) return 'meet';

  // addOn conferences (Zoom, Teams) only identify themselves in the URI.
  const haystack = [
    ...(raw.conferenceData?.entryPoints ?? []).map((e) => e.uri ?? ''),
    raw.location ?? '',
    raw.description ?? '',
  ].join(' ').toLowerCase();

  if (/zoom\.us|zoomgov\.com/.test(haystack)) return 'zoom';
  if (/teams\.microsoft\.com|teams\.live\.com/.test(haystack)) return 'teams';
  if (/meet\.google\.com/.test(haystack)) return 'meet';
  return undefined;
}

/**
 * One Google event resource → one PeripheralEvent, or null if it should not
 * appear at all.
 *
 * @param {any} raw       a `events.list` item
 * @param {string} label  display label from the calendarId -> label map
 * @returns {import('./gcal.js').PeripheralEvent|null}
 */
export function normaliseEvent(raw, label) {
  if (raw.status === 'cancelled') return null;
  if (isDeclined(raw)) return null;
  if (DROPPED_EVENT_TYPES.has(raw.eventType)) return null;

  const allDay = Boolean(raw.start?.date);
  if (!allDay && !raw.start?.dateTime) return null; // malformed; skip quietly

  let start, end;
  if (allDay) {
    // `date` is a bare YYYY-MM-DD and `end.date` is EXCLUSIVE. Parsing it with
    // `new Date('2026-08-17')` would give UTC midnight, which is the previous
    // evening in every western timezone — the classic off-by-one-day bug.
    start = toLocalIso(fromDateOnly(raw.start.date));
    end = toLocalIso(fromDateOnly(raw.end?.date ?? raw.start.date));
  } else {
    start = raw.start.dateTime;
    end = raw.end?.dateTime ?? raw.start.dateTime;
  }

  return {
    id: raw.id,
    // A freeBusyReader calendar returns events with no summary at all. Showing
    // an empty title would read as a rendering bug; "Busy" is the truth.
    title: raw.summary?.trim() || 'Busy',
    start,
    end,
    allDay,
    calendar: label,
    location: raw.location || undefined,
    attendeeCount: raw.attendees?.length || undefined,
    conference: detectConference(raw),
    status: raw.status === 'tentative' ? 'tentative' : 'confirmed',
  };
}

/** 'YYYY-MM-DD' → local midnight on that date. */
function fromDateOnly(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Best-effort display label for a calendar we were not given a mapping for.
 * Shared by `npm run auth` (which prints a paste-ready map) and the daemon
 * (which falls back to this when no map is configured) so the two never
 * disagree about what a calendar is called.
 *
 * @param {{id:string, primary?:boolean}} cal
 * @param {string} account
 */
export function guessLabel(cal, account) {
  if (cal.primary) return account;
  if (/holiday/i.test(cal.id)) return 'holidays';
  if (/@gmail\.com$/i.test(cal.id)) return 'personal';
  if (/@import\.calendar\.google\.com$/i.test(cal.id)) return 'athletics';
  return 'other';
}

/** @abstract */
export class CalendarProvider {
  /** @returns {Promise<PeripheralEvent[]>} today's events for this provider */
  async fetchToday() {
    throw new Error('not implemented');
  }
  /** Human label for logs and the stale badge. */
  get label() { return 'provider'; }
}

/**
 * One OAuth account, one or more calendars within it.
 *
 * The intended construction after the 2026-08-17 revision — note that a single
 * account supplies BOTH labels, because personal is natively shared into work:
 *
 *   new ApiProvider({
 *     account: 'work',
 *     calendars: {
 *       'ricky.cadden@balcomagency.com': 'work',
 *       'grcadden@gmail.com':            'personal',
 *     },
 *   })
 *
 * Discover the real calendarIds with calendarList.list once the token exists —
 * a shared-in calendar's id is usually the sharer's address, but imported and
 * secondary calendars use opaque ids. Do not hardcode until verified.
 */
export class ApiProvider extends CalendarProvider {
  /**
   * @param {object} opts
   * @param {string} opts.account
   * @param {Record<string,string>=} opts.calendars  calendarId -> display label.
   *   Empty means "discover them", see `resolveCalendars()`.
   * @param {OAuthClient=} opts.client
   */
  constructor({ account, calendars = {}, client }) {
    super();
    this.account = account;
    /** @type {Record<string,string>} calendarId -> display label */
    this.calendars = calendars;
    this.client = client ?? new OAuthClient({ account });
    /** Discovered map, cached for the process. See resolveCalendars(). */
    this._resolved = Object.keys(calendars).length ? calendars : null;
  }
  get label() { return `gcal:${this.account}`; }
  /** Display label for a calendarId. Unmapped ids fall back to the account. */
  labelFor(calendarId) {
    return this._resolved?.[calendarId] ?? this.calendars[calendarId] ?? this.account;
  }

  /**
   * The calendarId -> label map to actually query.
   *
   * If none was configured we enumerate the account once and keep the result
   * for the life of the process. Enumerating on every refresh would double the
   * API calls for a list that changes about twice a year; a restart is a
   * perfectly good cache invalidation for that.
   */
  async resolveCalendars() {
    if (this._resolved) return this._resolved;
    const cals = await this.client.listCalendars();
    this._resolved = Object.fromEntries(
      cals.map((c) => [c.id, guessLabel(c, this.account)]),
    );
    console.log(`[gcal] ${this.label}: discovered ${cals.length} calendar(s) — `
      + Object.entries(this._resolved).map(([id, l]) => `${l}<-${id}`).join(', '));
    return this._resolved;
  }

  /**
   * Every event in one calendar's day window, following pagination.
   *
   * `singleEvents=true` is what expands a recurring series into the individual
   * instance that falls today — without it a weekly standup comes back as one
   * master event with an RRULE and the panel shows the wrong date forever.
   */
  async fetchCalendar(calendarId, window) {
    const items = [];
    let pageToken;
    do {
      const url = new URL(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`);
      url.searchParams.set('timeMin', window.timeMin);
      url.searchParams.set('timeMax', window.timeMax);
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('orderBy', 'startTime');
      url.searchParams.set('showDeleted', 'false');
      url.searchParams.set('maxResults', '250');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const page = await this.client.apiGet(url.toString());
      items.push(...(page.items ?? []));
      pageToken = page.nextPageToken;
    } while (pageToken);
    return items;
  }

  async fetchToday(now = new Date()) {
    const map = await this.resolveCalendars();
    const ids = Object.keys(map);
    if (!ids.length) throw new Error(`${this.label}: no calendars to query`);

    const window = dayWindow(now);

    /* One failing calendar must not lose the others. A deleted or unshared
     * calendar 404s forever, and letting that take down the whole account
     * would turn a stale entry in the map into a permanently blank panel. */
    const results = await Promise.allSettled(
      ids.map(async (id) => (await this.fetchCalendar(id, window))
        .map((raw) => normaliseEvent(raw, map[id]))
        .filter(Boolean)),
    );

    const events = [];
    const failures = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') events.push(...r.value);
      else failures.push(`${ids[i]}: ${r.reason?.message ?? r.reason}`);
    });

    if (failures.length === ids.length) {
      throw new Error(`${this.label}: every calendar failed — ${failures[0]}`);
    }
    for (const f of failures) console.warn(`[gcal] ${this.label} calendar failed — ${f}`);

    events.sort((a, b) => new Date(a.start) - new Date(b.start));
    return events;
  }
}

export class IcsProvider extends CalendarProvider {
  constructor({ account, url }) {
    super();
    this.account = account;
    this.url = url;
  }
  get label() { return `ics:${this.account}`; }
  async fetchToday() {
    // TODO: fetch, parse VEVENT, expand RRULE for today only.
    // MUST mark state stale — this data can be up to 24h old.
    throw new Error('IcsProvider.fetchToday() not implemented');
  }
}

/**
 * Merge providers into one state. Partial failure is normal and must not be
 * fatal: if one provider succeeds and another fails, show what we have and flag
 * stale. Returning nothing because one source broke is the failure mode that
 * makes an ambient display untrustworthy.
 *
 * NOTE after the 2026-08-17 revision: the normal case is now a SINGLE provider,
 * so partial failure mostly disappears and total failure gets more likely — one
 * revoked work token loses work AND personal at once. That is the accepted cost
 * of one token, and it is precisely why the daemon's last-good-state cache is
 * mandatory rather than nice to have. `stale: true` with yesterday's events beats
 * an empty screen (project_goals.md, principle 3).
 *
 * TOTAL failure THROWS rather than returning an empty state. This distinction
 * is the whole point: `{ events: [] }` means "genuinely nothing scheduled" and
 * the panel says CLEAR, which is a specific and reassuring claim. If every
 * source is down we do not know that, and saying it is worse than saying
 * nothing — the caller must fall back to last-good instead.
 *
 * @param {CalendarProvider[]} providers
 * @returns {Promise<PeripheralState>}
 * @throws if every provider failed, or if there are none
 */
export async function collect(providers) {
  if (!providers.length) throw new Error('no calendar providers configured');

  const results = await Promise.allSettled(providers.map((p) => p.fetchToday()));

  const events = [];
  const failures = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') events.push(...r.value);
    else {
      const msg = r.reason?.message ?? String(r.reason);
      failures.push(`${providers[i].label}: ${msg}`);
      console.error(`[gcal] ${providers[i].label} failed:`, msg);
    }
  });

  if (failures.length === providers.length) {
    throw new Error(`all ${providers.length} calendar source(s) failed — ${failures[0]}`);
  }

  events.sort((a, b) => new Date(a.start) - new Date(b.start));

  return {
    generatedAt: new Date().toISOString(),
    stale: failures.length > 0,
    events,
  };
}
