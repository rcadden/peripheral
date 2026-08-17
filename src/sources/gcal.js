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
 * This file is deliberately a PROVIDER INTERFACE so all three access routes
 * drop in interchangeably and nothing downstream cares which one we got:
 *
 *   ApiProvider   — OAuth calendar.readonly per account. Real-time. Preferred.
 *   SharedProvider— work calendar shared to the personal account natively;
 *                   one token, real-time, but may arrive as free/busy only.
 *   IcsProvider   — private "secret address" .ics. Works almost anywhere, but
 *                   Google refreshes imported feeds every 8-24h, which is
 *                   FATAL for a countdown. Last resort; must set stale=true.
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
 * @property {string}  calendar        account/calendar key, e.g. "work"
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

export class ApiProvider extends CalendarProvider {
  constructor({ account, calendarIds = [] }) {
    super();
    this.account = account;
    this.calendarIds = calendarIds;
  }
  get label() { return `gcal:${this.account}`; }
  async fetchToday() {
    // TODO: events.list per calendar, timeMin = local midnight, timeMax = +1d,
    // singleEvents=true & orderBy=startTime so recurrences expand properly.
    // Drop status==='cancelled'. Treat a declined invite as absent.
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
 * fatal: if work succeeds and personal fails, show work and flag stale.
 * Returning nothing because one source broke is the failure mode that makes an
 * ambient display untrustworthy.
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
