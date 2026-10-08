/* Fish tank settings — client side (Sprint 9).
 *
 * Same contract as display.js: a Save button, no live preview against the
 * panel, and a status line that says plainly when the controls differ from
 * what is in force. The server validates (and the store validates again), so
 * this file only reports what the server says is now true.
 *
 * Posts only {tank: {...}}; the server merges it into display.json without
 * touching the saved orientation.
 */

const enabledEl = document.getElementById('tankEnabled');
const leadEl = document.getElementById('tankLead');
const fpsEl = document.getElementById('tankFps');
const saveBtn = document.getElementById('tankSaveBtn');
const statusEl = document.getElementById('tankStatus');

/** Last settings the SERVER confirmed are in force. */
let saved = null;

function current() {
  return { enabled: enabledEl.checked, leadMinutes: Number(leadEl.value), fps: Number(fpsEl.value) };
}

function show(tank) {
  enabledEl.checked = tank.enabled;
  leadEl.value = String(tank.leadMinutes);
  fpsEl.value = String(tank.fps);
}

function renderPending() {
  const pending = saved && JSON.stringify(current()) !== JSON.stringify(saved);
  statusEl.textContent = pending ? 'not saved yet' : '';
  statusEl.className = 'status';
}

for (const el of [enabledEl, leadEl, fpsEl]) el.addEventListener('input', renderPending);

saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
  statusEl.textContent = 'saving…';
  statusEl.className = 'status';
  try {
    const res = await fetch('/api/display', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // leadEl.value, not Number(): an empty field must reach the server as
      // an absence and be refused, never coerce to 0 (the 2026-08-29 rule).
      body: JSON.stringify({ tank: { enabled: enabledEl.checked, leadMinutes: leadEl.value, fps: fpsEl.value } }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? res.statusText);
    saved = body.tank;
    show(saved);
    statusEl.textContent = 'saved — the panel follows within moments.';
    statusEl.className = 'status ok';
  } catch (err) {
    statusEl.textContent = `save failed: ${err.message}`;
    statusEl.className = 'status err';
  } finally {
    saveBtn.disabled = false;
  }
});

async function load() {
  try {
    const res = await fetch('/api/display', { cache: 'no-store' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? res.statusText);
    fpsEl.innerHTML = body.tankOptions.fps.map((f) => `<option value="${f}">${f}</option>`).join('');
    leadEl.min = String(body.tankOptions.lead.min);
    leadEl.max = String(body.tankOptions.lead.max);
    saved = body.tank;
    show(saved);
  } catch (err) {
    statusEl.textContent = `could not load the tank settings: ${err.message}`;
    statusEl.className = 'status err';
  }
}

load();
