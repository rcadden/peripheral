/* Agenda pane renderer.
 *
 * Data comes from the daemon at /api/state. If that endpoint is not there —
 * which is the case any time you just open this file in a browser — the pane
 * falls back to generated mock events anchored to the real clock, so the
 * countdown actually ticks and the design can be judged at true size.
 *
 * Every value rendered here is display-only. No writes, ever.
 */

const POLL_MS = 60_000; // state refresh
const TICK_MS = 1_000;  // countdown repaint

const el = {
  clock: document.getElementById('clock'),
  badge: document.getElementById('badge'),
  countdown: document.getElementById('countdown'),
  title: document.getElementById('title'),
  meta: document.getElementById('meta'),
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
function fmtTimeShort(d) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h < 12 ? 'AM' : 'PM';
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
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

/* ── mock data (browser-only fallback) ──────────────────────────────────── */

const CALENDARS = {
  work: { label: 'Balcom', tint: 'var(--accent-cool)' },
  personal: { label: 'Personal', tint: 'var(--accent-hero)' },
  athletics: { label: 'Athletics - VB JV Women', tint: 'var(--text-dim)' },
};

function mockState() {
  const now = new Date();
  const at = (minsFromNow, durMins) => {
    const s = new Date(now.getTime() + minsFromNow * 60_000);
    s.setSeconds(0, 0);
    return { start: s.toISOString(), end: new Date(s.getTime() + durMins * 60_000).toISOString() };
  };
  return {
    generatedAt: now.toISOString(),
    stale: false,
    events: [
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

function classify(ev, now) {
  const s = new Date(ev.start), e = new Date(ev.end);
  if (e <= now) return 'past';
  if (s <= now && now < e) return 'now';
  return 'future';
}

function render() {
  const now = new Date();
  el.clock.textContent = fmtClock(now);
  el.badge.hidden = !state?.stale;

  if (!state?.events?.length) return renderEmpty(now);

  const events = [...state.events].sort((a, b) => new Date(a.start) - new Date(b.start));
  const marked = events.map((ev) => ({ ...ev, phase: classify(ev, now) }));

  // "Up next" = happening now if anything is, else the soonest future event.
  const focus = marked.find((e) => e.phase === 'now') || marked.find((e) => e.phase === 'future');

  renderHero(focus, marked, now);
  renderList(marked, focus, now);
  renderProgress(focus, marked, now);
}

function renderEmpty(now) {
  el.countdown.textContent = 'CLEAR';
  el.countdown.className = 'countdown';
  el.title.textContent = 'Nothing scheduled';
  el.meta.textContent = '';
  el.events.innerHTML = '<li class="empty">No events</li>';
  el.progress.style.width = '0%';
}

function renderHero(focus, marked, now) {
  if (!focus) {
    el.countdown.textContent = 'DONE';
    el.countdown.className = 'countdown';
    el.title.textContent = 'Nothing left today';
    el.meta.textContent = `${marked.length} event${marked.length === 1 ? '' : 's'} behind you`;
    return;
  }

  const start = new Date(focus.start);
  const end = new Date(focus.end);
  const isNow = focus.phase === 'now';
  const text = isNow ? 'NOW' : fmtCountdown(start - now);

  el.countdown.textContent = text;
  el.countdown.className = 'countdown'
    + (text.length > 13 ? ' len-lg' : text.length > 9 ? ' len-md' : '')
    + (isNow ? ' is-now' : '');

  el.title.textContent = focus.title;

  const cal = CALENDARS[focus.calendar] || { label: focus.calendar, tint: 'var(--text-dim)' };
  const bits = [`${fmtTime(start)} – ${fmtTime(end)}`];
  if (focus.conference === 'meet') bits.push('Meet');
  if (focus.location) bits.push(focus.location);
  if (focus.attendeeCount) bits.push(`${focus.attendeeCount} people`);

  el.meta.innerHTML =
    `<span class="cal-dot" style="background:${cal.tint}"></span>`
    + `<span>${cal.label}</span><span class="sep">·</span>`
    + bits.map(esc).join('<span class="sep">·</span>');
}

function renderList(marked, focus, now) {
  // The panel fits six rows. Keep context: show a little of what's done, but
  // bias hard toward what's ahead.
  const MAX = 6;
  let rows = marked;
  if (rows.length > MAX) {
    const firstUpcoming = rows.findIndex((e) => e.phase !== 'past');
    const start = firstUpcoming < 0
      ? rows.length - MAX
      : Math.max(0, Math.min(firstUpcoming - 1, rows.length - MAX));
    rows = rows.slice(start, start + MAX);
  }

  el.events.innerHTML = rows.map((ev) => {
    const cls = ev.phase === 'past' ? 'is-past'
      : ev.phase === 'now' ? 'is-now'
      : focus && ev.id === focus.id ? 'is-next' : '';
    return `<li class="event ${cls}">`
      + `<span class="tick"></span>`
      + `<span class="when">${fmtTimeShort(new Date(ev.start))}</span>`
      + `<span class="what">${esc(ev.title)}</span>`
      + `</li>`;
  }).join('');
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
