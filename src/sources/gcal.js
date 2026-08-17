/* gcal.js — Google Calendar source.
 *
 * ── NOT IMPLEMENTED ──────────────────────────────────────────────────────
 * Blocked on the work-calendar access question, which is the project's
 * critical path. See CLAUDE.md § "Work calendar — the open question".
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
  constructor({ account, calendars = {} }) {
    super();
    this.account = account;
    /** @type {Record<string,string>} calendarId -> display label */
    this.calendars = calendars;
  }
  get label() { return `gcal:${this.account}`; }
  /** Display label for a calendarId. Unmapped ids fall back to the account. */
  labelFor(calendarId) {
    return this.calendars[calendarId] ?? this.account;
  }
  async fetchToday() {
    // TODO: events.list per calendarId in this.calendars, timeMin = local
    // midnight, timeMax = +1d, singleEvents=true & orderBy=startTime so
    // recurrences expand properly. Drop status==='cancelled'. Treat a declined
    // invite as absent. Set event.calendar = this.labelFor(calendarId).
    //
    // A shared-in calendar can return events WITHOUT details if the share is
    // free/busy only. Personal->work is confirmed full-details, but if a future
    // calendar comes back with no title, surface it as busy rather than blank.
    throw new Error('ApiProvider.fetchToday() not implemented — OAuth client not yet created');
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
 * @param {CalendarProvider[]} providers
 * @returns {Promise<PeripheralState>}
 */
export async function collect(providers) {
  const results = await Promise.allSettled(providers.map((p) => p.fetchToday()));

  const events = [];
  let anyFailed = false;
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') events.push(...r.value);
    else {
      anyFailed = true;
      console.error(`[gcal] ${providers[i].label} failed:`, r.reason?.message ?? r.reason);
    }
  });

  events.sort((a, b) => new Date(a.start) - new Date(b.start));

  return {
    generatedAt: new Date().toISOString(),
    stale: anyFailed,
    events,
  };
}
