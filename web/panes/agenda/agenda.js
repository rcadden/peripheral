/* Agenda pane renderer.
 *
 * Data comes from the daemon at /api/state. If that endpoint is not there —
 * which is the case any time you just open this file in a browser — the pane
 * falls back to generated mock events anchored to the real clock, so the
 * countdown actually ticks and the design can be judged at true size.
 *
 * Every value rendered here is display-only. No writes, ever.
 *
 * The hero pick lives in focus.js, NOT here — it is the one decision worth
 * testing and it has to be reachable from test/. See the history in that file.
 */

import { selectAgenda } from './focus.js';

const POLL_MS = 60_000; // state refresh
const TICK_MS = 1_000;  // countdown repaint

const el = {
  clock: document.getElementById('clock'),
  badge: document.getElementById('badge'),
  heroEyebrow: document.getElementById('heroEyebrow'),
  countdown: document.getElementById('countdown'),
  title: document.getElementById('title'),
  meta: document.getElementById('meta'),
  thenEyebrow: document.getElementById('thenEyebrow'),
  thenCountdown: document.getElementById('thenCountdown'),
  thenTitle: document.getElementById('thenTitle'),
  thenMeta: document.getElementById('thenMeta'),
  events: document.getElementById('events'),
  progress: document.getElementById('progress'),
};

let state = null;
let usingMock = false;

/* ── formatting ─────────────────────────────────────────────────────────── */

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
                'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function fmtClock(d) {
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${d.getDate()} · ${fmtTime(d)}`;
}

function fmtTime(d) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h < 12 ? 'AM' : 'PM';
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

// Short form for the agenda column, where horizontal space is tight.
// "10:00a" not "10:00 AM" (Ricky, 2026-08-18) — no space, single lowercase
// letter for the meridiem. The column is `max-content` (see agenda.css), so
// every character shaved here hands width straight back to the title.
function fmtTimeShort(d) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h < 12 ? 'a' : 'p';
  h = h % 12 || 12;
  return `${h}:${m}${ap}`;
}

/* Countdown wording. Deliberately coarse: at a glance from three feet you
 * want the magnitude, not the seconds. Seconds only appear under a minute,
 * where they're the whole point. */
function fmtCountdown(ms) {
  if (ms <= 0) return 'NOW';
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 1) return `IN ${Math.floor(ms / 1000)} SEC`;
  if (totalMin < 60) return `IN ${totalMin} MIN`;
  const hr = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (hr >= 10 || min === 0) return `IN ${hr} HR`;
  return `IN ${hr} HR ${min} MIN`;
}

// Same coarseness as fmtCountdown, without the "IN"/"NOW" framing — this one
// answers "how long", not "how soon". Used for the length of the meeting
// coming up next, in the "then" column.
function fmtDuration(ms) {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  if (totalMin < 60) return `${totalMin} MIN`;
  const hr = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (hr >= 10 || min === 0) return `${hr} HR`;
  return `${hr} HR ${min} MIN`;
}

// The hero's countdown when the hero IS the thing happening — time
// remaining, not time until. Ricky, 2026-08-18: "NOW" was accurate but told
// you nothing; the number that matters here is how much runway is left.
function fmtRemaining(ms) {
  if (ms <= 0) return 'ENDING';
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 1) return `${Math.floor(ms / 1000)} SEC LEFT`;
  if (totalMin < 60) return `${totalMin} MIN LEFT`;
  const hr = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (hr >= 10 || min === 0) return `${hr} HR LEFT`;
  return `${hr} HR ${min} MIN LEFT`;
}

// Shared by both the hero and "then" countdowns — they are the same column
// width now (equal thirds), the same font, so the same breakpoints apply.
// See the dated history in agenda.css for why these exact numbers: they are
// measured against the real 387px column, not estimated, and the three
// tiers below 106px exist because two were not enough for the longest
// strings either format can produce.
function countdownSizeClass(text) {
  return text.length > 12 ? 'len-xl' : text.length > 8 ? 'len-lg' : text.length > 3 ? 'len-md' : '';
}

// The "happening now" countdown lives inside the is-now badge, which carries
// its own padding (16px each side — see .countdown.is-now in agenda.css), so
// it has 32px less room than the plain countdown does. Found 2026-08-18:
// "26 MIN LEFT" at the len-lg tier (the size countdownSizeClass() picked for
// an 11-char string) measured 419px total against a 387px hero column,
// because the size was chosen for the text alone with no padding budgeted.
// fmtRemaining's longest strings ("9 HR 59 MIN LEFT") don't fit even at the
// plain countdown's smallest tier, so this is its own scale rather than a
// reuse — measured against the real padded budget (355px = 387 − 32).
function remainingSizeClass(text) {
  if (text.length > 14) return 'len-xxl';
  if (text.length > 9) return 'len-xl';
  if (text.length > 6) return 'len-lg';
  return 'len-md';
}

/* ── mock data (browser-only fallback) ──────────────────────────────────── */

/* Display labels and tints, keyed by PeripheralEvent.calendar — which is the
 * label from the calendarId -> label map, not the account. Keys here must
 * match guessLabel() in src/sources/gcal.js, which is what the daemon uses
 * when no map is configured. An unknown key still renders, dimmed. */
const CALENDARS = {
  work: { label: 'Balcom', tint: 'var(--accent-cool)' },
  personal: { label: 'Personal', tint: 'var(--accent-hero)' },
  // TripIt feed on the work account — flights and hotels. An imported feed, so
  // it refreshes on Google's schedule (8–24h) rather than in real time; fine
  // for a flight tomorrow, not something to trust to the minute.
  travel: { label: 'Travel', tint: 'var(--text-dim)' },
  athletics: { label: 'Athletics', tint: 'var(--text-dim)' },
  holidays: { label: 'Holidays', tint: 'var(--text-faint)' },
  other: { label: 'Other', tint: 'var(--text-dim)' },
};

function mockState() {
  const now = new Date();
  const at = (minsFromNow, durMins) => {
    const s = new Date(now.getTime() + minsFromNow * 60_000);
    s.setSeconds(0, 0);
    return { start: s.toISOString(), end: new Date(s.getTime() + durMins * 60_000).toISOString() };
  };
  // Local midnight to local midnight, matching what the normaliser emits for
  // an all-day event. Present in the mock deliberately: the hero-hijack bug
  // this guards against was invisible until real data carried one.
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  const tomorrow = new Date(midnight); tomorrow.setDate(tomorrow.getDate() + 1);

  return {
    generatedAt: now.toISOString(),
    stale: false,
    events: [
      { id: 'm0', title: 'Ashley OOO', calendar: 'holidays', allDay: true,
        start: midnight.toISOString(), end: tomorrow.toISOString() },
      // Offsets are kept tight around "now" so the mock stays plausible
      // whatever time of day you open the page.
      { id: 'm1', title: 'Media team standup', calendar: 'work',
        conference: 'meet', attendeeCount: 4, ...at(-95, 25) },
      { id: 'm2', title: 'KWR automation — Phase 2 scoping', calendar: 'work',
        conference: 'meet', attendeeCount: 3, ...at(-45, 30) },
      { id: 'm3', title: 'Audience research — Stage 3 fine-tuning', calendar: 'work',
        conference: 'meet', attendeeCount: 3, ...at(34, 30) },
      { id: 'm4', title: 'VB JV Women vs. Reynolds', calendar: 'athletics',
        location: 'Reynolds HS', ...at(122, 90) },
      { id: 'm5', title: '1:1 with Nick', calendar: 'work',
        conference: 'meet', attendeeCount: 2, ...at(245, 30) },
    ],
  };
}

/* ── state ──────────────────────────────────────────────────────────────── */

async function loadState() {
  try {
    const res = await fetch('/api/state', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state = await res.json();
    usingMock = false;
  } catch {
    // No daemon. Keep the last good state if we had one, otherwise mock.
    if (!state || usingMock) {
      state = mockState();
      usingMock = true;
    } else {
      state.stale = true; // daemon went away mid-session
    }
  }
  render();
}

/* ── render ─────────────────────────────────────────────────────────────── */

function render() {
  const now = new Date();
  el.clock.textContent = fmtClock(now);
  el.badge.hidden = !state?.stale;

  if (!state?.events?.length) return renderEmpty(now);

  // Sorting, the all-day split, phasing, the hero pick and the "next after
  // the hero" pick all live in focus.js.
  const { allDay, timed, focus, next } = selectAgenda(state.events, now);

  renderHero(focus, timed, allDay, now);
  renderThen(focus, next);
  renderList(timed, allDay, focus, now);
  renderProgress(focus, timed, now);
}

function renderEmpty(now) {
  el.heroEyebrow.textContent = 'Up next';
  el.countdown.textContent = 'CLEAR';
  el.countdown.className = 'countdown';
  el.title.textContent = 'Nothing scheduled';
  el.meta.textContent = '';
  blankThen();
  el.events.innerHTML = '<li class="empty">No events</li>';
  el.progress.style.width = '0%';
}

function blankThen() {
  el.thenEyebrow.textContent = '';
  el.thenCountdown.textContent = '';
  el.thenCountdown.className = 'countdown';
  el.thenTitle.textContent = '';
  el.thenMeta.textContent = '';
}

function renderHero(focus, marked, allDay, now) {
  el.heroEyebrow.textContent = 'Up next';

  if (!focus) {
    // No timed events left, but an all-day entry is still worth naming — it is
    // usually the reason the day is otherwise empty.
    if (!marked.length && allDay.length) {
      el.countdown.textContent = 'CLEAR';
      el.countdown.className = 'countdown';
      el.title.textContent = allDay[0].title;
      el.meta.innerHTML = `<span>All day</span>`
        + (allDay.length > 1 ? `<span class="sep">·</span><span>+${allDay.length - 1} more</span>` : '');
      return;
    }
    el.countdown.textContent = 'DONE';
    el.countdown.className = 'countdown';
    el.title.textContent = 'Nothing left today';
    el.meta.textContent = `${marked.length} event${marked.length === 1 ? '' : 's'} behind you`;
    return;
  }

  const isNow = focus.phase === 'now';
  // Ricky, 2026-08-18: "Up next" was only ever accurate before the first
  // meeting of the day. While the hero IS the thing happening, say so, and
  // show time remaining rather than the now-meaningless "NOW".
  el.heroEyebrow.textContent = isNow ? 'Happening' : 'Up next';
  const text = isNow
    ? fmtRemaining(new Date(focus.end) - now)
    : fmtCountdown(new Date(focus.start) - now);

  el.countdown.textContent = text;
  el.countdown.className = ['countdown', isNow ? remainingSizeClass(text) : countdownSizeClass(text), isNow ? 'is-now' : '']
    .filter(Boolean).join(' ');

  el.title.textContent = focus.title;
  el.meta.innerHTML = buildMetaHtml(focus);
}

// Below this, the gap before "next" isn't a real break — showing the
// meeting itself is more useful than "1 MIN FREE".
const BACK_TO_BACK_MS = 2 * 60_000;

/**
 * The middle column: what's next AFTER the meeting you're currently in.
 * Ricky, 2026-08-18: only meaningful while the hero is a live meeting — the
 * two hours before his first meeting had nothing to be "after" — and should
 * read as a second hero (same countdown/title/meta styling), not a
 * secondary note.
 *
 * Two shapes, chosen by whether there's an actual gap before "next":
 *   - a real break: the headline is the LENGTH OF THE BREAK ("30 MIN" /
 *     "Free time"), not the next meeting — found same day, live, the first
 *     version always led with the next meeting even with 30 minutes of
 *     open time in front of it, which is the more important fact.
 *   - back-to-back: nothing to name as free, so the headline is the next
 *     meeting itself — its length and title.
 */
function renderThen(focus, next) {
  if (!focus || focus.phase !== 'now') return blankThen();

  el.thenEyebrow.textContent = 'Up next';

  if (!next) {
    el.thenCountdown.textContent = 'CLEAR';
    el.thenCountdown.className = 'countdown';
    el.thenTitle.textContent = 'Nothing else today';
    el.thenMeta.textContent = '';
    return;
  }

  const gapMs = new Date(next.start) - new Date(focus.end);

  if (gapMs > BACK_TO_BACK_MS) {
    const text = fmtDuration(gapMs);
    el.thenCountdown.textContent = text;
    el.thenCountdown.className = ['countdown', countdownSizeClass(text)].filter(Boolean).join(' ');
    el.thenTitle.textContent = 'Free time';
    el.thenMeta.innerHTML = `<span>Then</span><span class="sep">·</span>`
      + `<span>${esc(next.title)}</span><span class="sep">·</span>`
      + `<span>${esc(fmtTime(new Date(next.start)))}</span>`;
    return;
  }

  const text = fmtDuration(new Date(next.end) - new Date(next.start));
  el.thenCountdown.textContent = text;
  el.thenCountdown.className = ['countdown', countdownSizeClass(text)].filter(Boolean).join(' ');

  el.thenTitle.textContent = next.title;
  el.thenMeta.innerHTML = buildMetaHtml(next);
}

/** The meta line under a title: calendar dot + label, time range, conference,
 * location, attendee count. Shared by the hero and the "then" column — same
 * event shape, same line. */
function buildMetaHtml(ev) {
  const start = new Date(ev.start);
  const end = new Date(ev.end);
  const cal = CALENDARS[ev.calendar] || { label: ev.calendar, tint: 'var(--text-dim)' };
  const bits = [`${fmtTime(start)} – ${fmtTime(end)}`];
  // The normaliser detects Meet, Zoom and Teams.
  const CONF = { meet: 'Meet', zoom: 'Zoom', teams: 'Teams' };
  if (CONF[ev.conference]) bits.push(CONF[ev.conference]);
  // A conference link pasted into the location field is already reported as
  // the conference; repeating the raw URL would eat the whole meta line.
  if (ev.location && !/^https?:\/\//i.test(ev.location)) {
    bits.push(shortLocation(ev.location));
  }
  if (ev.attendeeCount) bits.push(`${ev.attendeeCount} people`);

  return `<span class="cal-dot" style="background:${cal.tint}"></span>`
    + `<span>${cal.label}</span><span class="sep">·</span>`
    + bits.map(esc).join('<span class="sep">·</span>');
}

/**
 * Locations arrive as full postal addresses — Google autocompletes them, so
 * "Asheville Christian Academy" is stored as "Asheville Christian Academy, 74
 * Riverwood Rd, Swannanoa, NC 28778, USA". On first contact with real data
 * that wrapped the meta line to three lines and pushed it into the progress
 * bar.
 *
 * The venue name is the only part that helps at a glance. You already know
 * which state you live in, and you are not reading a ZIP code from three feet.
 * Keep the first comma-separated segment; fall back to a hard truncation for
 * addresses that begin with a street number and have no name.
 */
function shortLocation(loc) {
  const head = loc.split(',')[0].trim();
  // A bare street address ("74 Riverwood Rd") is not a name — keep a bit more.
  const useful = /^\d/.test(head) ? loc.split(',').slice(0, 2).join(',').trim() : head;
  return useful.length > 38 ? `${useful.slice(0, 37)}…` : useful;
}

function renderList(marked, allDay, focus, now) {
  // The panel fits six rows. All-day entries are pinned at the top and take
  // from that budget — they are context for the day, so at most two get to
  // crowd out timed events, which are the thing you actually came for.
  const MAX = 6;
  const pinned = allDay.slice(0, 2);

  let rows = marked;
  const budget = MAX - pinned.length;
  if (rows.length > budget) {
    // Keep a little of what's done for context, but bias hard toward ahead.
    const firstUpcoming = rows.findIndex((e) => e.phase !== 'past');
    const start = firstUpcoming < 0
      ? rows.length - budget
      : Math.max(0, Math.min(firstUpcoming - 1, rows.length - budget));
    rows = rows.slice(start, start + budget);
  }

  const allDayHtml = pinned.map((ev) => `<li class="event is-allday">`
    + `<span class="tick"></span>`
    + `<span class="when">ALL DAY</span>`
    + `<span class="what">${esc(ev.title)}</span>`
    + `</li>`).join('');

  const timedHtml = rows.map((ev) => {
    const cls = ev.phase === 'past' ? 'is-past'
      : ev.phase === 'now' ? 'is-now'
      : focus && ev.id === focus.id ? 'is-next' : '';
    return `<li class="event ${cls}">`
      + `<span class="tick"></span>`
      + `<span class="when">${fmtTimeShort(new Date(ev.start))}</span>`
      + `<span class="what">${esc(ev.title)}</span>`
      + `</li>`;
  }).join('');

  el.events.innerHTML = allDayHtml + timedHtml
    || '<li class="empty">No events</li>';
}

/* Fill represents how far we are through the gap before the next event, so
 * a nearly-full bar means "get up now". During an event it tracks elapsed. */
function renderProgress(focus, marked, now) {
  if (!focus) return void (el.progress.style.width = '0%');

  const start = new Date(focus.start);
  const end = new Date(focus.end);

  let from, to;
  if (focus.phase === 'now') {
    from = start; to = end;
  } else {
    const prevEnd = marked
      .filter((e) => new Date(e.end) <= now)
      .reduce((max, e) => Math.max(max, new Date(e.end)), 0);
    // Cap the runway at 90 minutes so an empty morning isn't a dead bar.
    const cap = start.getTime() - 90 * 60_000;
    from = new Date(Math.max(prevEnd || cap, cap));
    to = start;
  }

  const span = to - from;
  const pct = span <= 0 ? 100 : Math.max(0, Math.min(100, ((now - from) / span) * 100));
  el.progress.style.width = `${pct.toFixed(2)}%`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/* ── loop ───────────────────────────────────────────────────────────────── */

loadState();
setInterval(loadState, POLL_MS);
setInterval(render, TICK_MS);
