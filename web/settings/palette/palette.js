/* Colour picker — client side.
 *
 * Never computes colour math itself. Every hex value, contrast ratio, and
 * "had to be lightened" note comes from GET /api/palette/preview, which runs
 * the exact same deriveTokens()/gated() logic src/palette.js uses to write
 * the real tokens.css. This page only collects hue choices and displays what
 * the server reports back — the single source of truth for "is this
 * readable" stays server-side, on purpose (see src/palette.js's contrast
 * gate).
 *
 * Live preview never touches disk. It overrides CSS custom properties
 * directly on the preview iframe's own <html> element, inline — which beats
 * the iframe's linked tokens.css at equal specificity (confirmed: no
 * `!important` exists anywhere under web/), and vanishes the moment the
 * iframe reloads. web/tokens.css on disk is untouched until Save.
 */

const ROLES = [
  { key: 'hero', label: 'Hero (now / next)', token: '--accent-hero' },
  { key: 'cool', label: 'Cool (calmer accent)', token: '--accent-cool' },
  { key: 'calendarWork', label: 'Calendar — work', token: '--accent-calendar-work' },
  { key: 'calendarPersonal', label: 'Calendar — personal', token: '--accent-calendar-personal' },
];

const controlsEl = document.getElementById('controls');
const iframe = document.getElementById('preview');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');

/** @type {Record<string, {mode:'auto'|'manual', hue:number}>} */
const state = {};
for (const { key } of ROLES) state[key] = { mode: 'manual', hue: 210 };

function buildControls() {
  controlsEl.innerHTML = ROLES.map(({ key, label }) => `
    <div class="role" data-role="${key}">
      <div class="role-head">
        <span class="role-name">${label}</span>
        <span class="swatch" id="swatch-${key}"></span>
      </div>
      <div class="source-toggle">
        <label><input type="radio" name="source-${key}" value="manual" checked> manual</label>
        <label><input type="radio" name="source-${key}" value="auto"> wallpaper</label>
      </div>
      <div class="hue-row">
        <input type="range" min="0" max="359" step="1" id="hue-${key}" value="210">
        <span class="hue-value" id="hueval-${key}">210°</span>
      </div>
      <div class="role-meta">
        <span class="hex" id="hex-${key}">—</span>
        <span id="ratio-${key}">—</span>
        <span id="lightened-${key}"></span>
      </div>
    </div>
  `).join('');

  for (const { key } of ROLES) {
    const slider = document.getElementById(`hue-${key}`);
    slider.addEventListener('input', () => {
      state[key].hue = Number(slider.value);
      document.getElementById(`hueval-${key}`).textContent = `${slider.value}°`;
      schedulePreview();
    });
    for (const radio of document.querySelectorAll(`input[name="source-${key}"]`)) {
      radio.addEventListener('change', () => {
        state[key].mode = radio.value === 'auto' ? 'auto' : 'manual';
        slider.disabled = state[key].mode === 'auto';
        schedulePreview();
      });
    }
  }
}

function currentHues() {
  const out = {};
  for (const { key } of ROLES) out[key] = state[key].mode === 'auto' ? 'wallpaper' : state[key].hue;
  return out;
}

function applyToIframe(tokens) {
  const doc = iframe.contentDocument;
  if (!doc) return; // iframe not loaded yet — the next preview response will catch up
  for (const { token } of ROLES) {
    if (tokens[token]) doc.documentElement.style.setProperty(token, tokens[token]);
  }
}

function renderReport(report) {
  for (const { key } of ROLES) {
    const role = report.roles[key];
    if (!role) continue;

    // Only move the slider/toggle to match the server's resolved state on
    // the FIRST load (see loadInitial) — subsequent calls are driven BY the
    // controls, so we don't fight the user's in-progress drag.
    document.getElementById(`swatch-${key}`).style.background = role.hex;
    document.getElementById(`hex-${key}`).textContent = role.hex;

    const ratioEl = document.getElementById(`ratio-${key}`);
    ratioEl.textContent = `${role.ratio}:1 (floor ${role.floor})`;
    ratioEl.className = role.ratio >= role.floor ? 'ratio-ok' : '';

    const lightenedEl = document.getElementById(`lightened-${key}`);
    lightenedEl.textContent = role.lightened ? 'lightened to pass the floor' : '';
    lightenedEl.className = role.lightened ? 'lightened' : '';
  }
}

let previewTimer = null;
function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(runPreview, 120);
}

async function runPreview() {
  const hues = currentHues();
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(hues)) params.set(key, String(value));

  try {
    const res = await fetch(`/api/palette/preview?${params}`, { cache: 'no-store' });
    if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
    const { tokens, report } = await res.json();
    renderReport(report);
    applyToIframe(tokens);
  } catch (err) {
    statusEl.textContent = `preview failed: ${err.message}`;
    statusEl.className = 'status err';
  }
}

async function loadInitial() {
  try {
    const res = await fetch('/api/palette/preview', { cache: 'no-store' });
    if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
    const { tokens, report } = await res.json();

    for (const { key } of ROLES) {
      const role = report.roles[key];
      state[key].mode = role.source === 'wallpaper' ? 'auto' : 'manual';
      state[key].hue = role.hue;
      document.getElementById(`hue-${key}`).value = String(Math.round(role.hue));
      document.getElementById(`hue-${key}`).disabled = state[key].mode === 'auto';
      document.getElementById(`hueval-${key}`).textContent = `${Math.round(role.hue)}°`;
      document.querySelector(`input[name="source-${key}"][value="${state[key].mode}"]`).checked = true;
    }
    renderReport(report);
    applyToIframe(tokens);
  } catch (err) {
    statusEl.textContent = `could not load current palette: ${err.message}`;
    statusEl.className = 'status err';
  }
}

saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
  statusEl.textContent = 'saving…';
  statusEl.className = 'status';
  try {
    const res = await fetch('/api/palette/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hues: currentHues() }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
    const { report } = await res.json();
    renderReport(report);
    statusEl.textContent = 'saved — the physical panel updates automatically within a few seconds';
    statusEl.className = 'status ok';
  } catch (err) {
    statusEl.textContent = `save failed: ${err.message}`;
    statusEl.className = 'status err';
  } finally {
    saveBtn.disabled = false;
  }
});

buildControls();
// Wait for the preview iframe to finish its own load before the first
// applyToIframe() call — contentDocument is only reliably ready after this.
iframe.addEventListener('load', loadInitial, { once: true });
