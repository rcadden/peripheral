/* Display-orientation picker — client side.
 *
 * Follows weather-location.js's contract, not palette.js's: a discrete choice
 * with a Save button and NO live preview against the pane.
 *
 * ── WHY THERE IS NO PREVIEW ─────────────────────────────────────────────
 * The first cut of this file rotated the colour picker's iframe as you
 * selected. It looked like the obvious win and was wrong twice.
 *
 *   1. It contradicted the reason rotation is a URL flag at all. The whole
 *      point (see paneUrlFor() in daemon.js) is that the frame going to the
 *      glass rotates while the page a human opens in a browser stays upright
 *      and readable. Rotating this page's own preview is exactly what that
 *      design exists to avoid — and it left the colour picker below judging
 *      contrast on upside-down type.
 *   2. It previewed the wrong thing anyway. Rotation cancels a physical
 *      mount: on the actual panel, 180 looks UPRIGHT. A rotated preview shows
 *      the frame as transmitted, which is the one form nobody ever sees.
 *
 * So this control does not pretend to show you the answer. It reports what is
 * in force, says plainly when a selection hasn't been saved, and sends you to
 * the glass — the only place an orientation decision can actually be closed.
 *
 * Nothing here decides precedence. The server reports which source is in
 * force (saved / env / default) and this file just says so out loud — see
 * src/display-settings.js for why a picker-saved value outranks an env var.
 */

const choicesEl = document.getElementById('orientChoices');
const saveBtn = document.getElementById('orientSaveBtn');
const statusEl = document.getElementById('orientStatus');
const sourceNoteEl = document.getElementById('orientSourceNote');

/** Last value the SERVER confirmed is in force — not what's selected here. */
let savedRotate = null;

function selected() {
  const checked = choicesEl.querySelector('input[name="rotate"]:checked');
  return checked ? Number(checked.value) : 0;
}

function select(rotate) {
  const radio = choicesEl.querySelector(`input[name="rotate"][value="${rotate}"]`);
  if (radio) radio.checked = true;
}

/** Say plainly when the selection differs from what the panel is showing. */
function renderPending() {
  const pending = savedRotate !== null && selected() !== savedRotate;
  statusEl.textContent = pending ? 'not saved yet' : '';
  statusEl.className = 'status';
}

function renderSource(source, rotate) {
  if (source === 'env') {
    sourceNoteEl.textContent = ` Currently ${rotate}°, set by PERIPHERAL_ROTATE in .env; `
      + 'saving here overrides it from now on.';
  } else if (source === 'default') {
    sourceNoteEl.textContent = ' Nothing saved yet — the panel is upright by default.';
  } else {
    sourceNoteEl.textContent = '';
  }
}

for (const radio of choicesEl.querySelectorAll('input[name="rotate"]')) {
  radio.addEventListener('change', renderPending);
}

saveBtn.addEventListener('click', async () => {
  const rotate = selected();
  saveBtn.disabled = true;
  statusEl.textContent = 'saving…';
  statusEl.className = 'status';
  try {
    const res = await fetch('/api/display', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rotate }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
    const saved = await res.json();
    savedRotate = saved.rotate;
    select(saved.rotate);
    renderSource(saved.source, saved.rotate);
    // Deliberately not "done". The daemon picks this up off a file watch
    // within moments, but the only thing that closes an orientation decision
    // is looking at the actual panel.
    statusEl.textContent = 'saved — the panel reorients within moments. Check the glass.';
    statusEl.className = 'status ok';
  } catch (err) {
    statusEl.textContent = `save failed: ${err.message}`;
    statusEl.className = 'status err';
  } finally {
    saveBtn.disabled = false;
  }
});

async function loadCurrent() {
  try {
    const res = await fetch('/api/display', { cache: 'no-store' });
    if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
    const { rotate, source } = await res.json();
    savedRotate = rotate;
    select(rotate);
    renderSource(source, rotate);
  } catch (err) {
    statusEl.textContent = `could not load current orientation: ${err.message}`;
    statusEl.className = 'status err';
  }
}

loadCurrent();
