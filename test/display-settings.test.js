/* display-settings.test.js — persisted display orientation and its precedence.
 *
 * Mirrors test/weather-location.test.js's structure and reasoning: pure local
 * file I/O only, every test against a temp file, never the real
 * %LOCALAPPDATA%\Peripheral\display.json.
 *
 * The precedence tests are the point of this file. The value ordering
 * (saved > env > default) is the one rule that, if it silently inverted,
 * would make the settings UI look broken while reporting success — so it is
 * pinned here rather than left to the one place it happens to be written.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DisplaySettingsStore,
  resolveRotation,
  parseRotation,
  envRotation,
  ROTATIONS,
} from '../src/display-settings.js';

let n = 0;
const tmp = () => path.join(os.tmpdir(), `peripheral-display-test-${process.pid}-${n++}.json`);

/** Set PERIPHERAL_ROTATE for one test and always put it back. */
async function withEnv(value, fn) {
  const before = process.env.PERIPHERAL_ROTATE;
  if (value === undefined) delete process.env.PERIPHERAL_ROTATE;
  else process.env.PERIPHERAL_ROTATE = value;
  try {
    await fn();
  } finally {
    if (before === undefined) delete process.env.PERIPHERAL_ROTATE;
    else process.env.PERIPHERAL_ROTATE = before;
  }
}

// ── parsing ────────────────────────────────────────────────────────────────

test('only 0 and 180 parse — a quarter turn is rejected, not silently accepted', () => {
  assert.equal(parseRotation(0), 0);
  assert.equal(parseRotation(180), 180);
  // 90/270 would need a 480x1280 pane, not a transform. Accepting them here
  // would promise a layout that does not exist.
  assert.equal(parseRotation(90), null);
  assert.equal(parseRotation(270), null);
  assert.equal(parseRotation(360), null);
});

test('the string form parses — it arrives that way from .env and from a form control', () => {
  assert.equal(parseRotation('180'), 180);
  assert.equal(parseRotation(' 0 '), 0);
  assert.equal(parseRotation('upside down'), null);
  assert.equal(parseRotation(''), null);
});

test('null/undefined/NaN are absences, not values', () => {
  assert.equal(parseRotation(null), null);
  assert.equal(parseRotation(undefined), null);
  assert.equal(parseRotation(NaN), null);
  assert.equal(parseRotation({}), null);
});

// ── precedence ─────────────────────────────────────────────────────────────

test('a saved value BEATS PERIPHERAL_ROTATE — the picker is the source of truth', async () => {
  // This inverts palette.js's env-always-wins rule on purpose (see
  // display-settings.js). If this assertion ever flips, a human flipping the
  // toggle would see "saved" and no change on the glass.
  await withEnv('180', () => {
    assert.deepEqual(resolveRotation({ rotate: 0 }), { rotate: 0, source: 'saved' });
  });
});

test('PERIPHERAL_ROTATE applies when nothing has been saved — the unattended-install path', async () => {
  await withEnv('180', () => {
    assert.deepEqual(resolveRotation(null), { rotate: 180, source: 'env' });
  });
});

test('with neither saved nor env, the panel is upright', async () => {
  await withEnv(undefined, () => {
    assert.deepEqual(resolveRotation(null), { rotate: 0, source: 'default' });
  });
});

test('an empty PERIPHERAL_ROTATE is an absence, not a zero', async () => {
  // .env.example ships the key present-but-blank for several vars, so blank
  // must fall through to the default rather than count as an explicit choice.
  await withEnv('', () => {
    assert.equal(envRotation(), null);
    assert.equal(resolveRotation(null).source, 'default');
  });
});

test('a junk PERIPHERAL_ROTATE is ignored rather than crashing the daemon', async () => {
  await withEnv('sideways', () => {
    assert.equal(envRotation(), null);
    assert.deepEqual(resolveRotation(null), { rotate: 0, source: 'default' });
  });
});

// ── persistence ────────────────────────────────────────────────────────────

test('a missing file loads as null — the normal case before the picker is used', async () => {
  assert.equal(await new DisplaySettingsStore(tmp()).load(), null);
});

test('a saved rotation round-trips', async () => {
  const store = new DisplaySettingsStore(tmp());
  await store.save({ rotate: 180 });
  assert.deepEqual(await store.load(), { rotate: 180 });
});

test('saving 0 persists as a real choice, not as an absence', async () => {
  // The distinction that matters: someone who deliberately sets Normal while
  // PERIPHERAL_ROTATE=180 must not have the env var reassert itself.
  const store = new DisplaySettingsStore(tmp());
  await store.save({ rotate: 0 });
  assert.deepEqual(await store.load(), { rotate: 0 });
  await withEnv('180', async () => {
    assert.deepEqual(resolveRotation(await store.load()), { rotate: 0, source: 'saved' });
  });
});

test('the string form saves too — a form control sends "180", not 180', async () => {
  const store = new DisplaySettingsStore(tmp());
  await store.save({ rotate: '180' });
  assert.deepEqual(await store.load(), { rotate: 180 });
});

test('an invalid rotation is refused at the store, not just at the HTTP handler', async () => {
  const store = new DisplaySettingsStore(tmp());
  await assert.rejects(() => store.save({ rotate: 90 }), /must be one of 0, 180/);
  // And nothing was written — a rejected save must not leave a file behind
  // that the next boot would then have to distrust.
  assert.equal(await store.load(), null);
});

test('a corrupt file is ignored, never thrown — the daemon must still start', async () => {
  const p = tmp();
  await fs.writeFile(p, '{ this is not json');
  assert.equal(await new DisplaySettingsStore(p).load(), null);
});

test('a file from a different version is ignored', async () => {
  const p = tmp();
  await fs.writeFile(p, JSON.stringify({ version: 99, display: { rotate: 180 } }));
  assert.equal(await new DisplaySettingsStore(p).load(), null);
});

test('a saved value outside ROTATIONS is ignored rather than pushed to the panel', async () => {
  // Hand-edited file, or one written by a future version that supports more
  // orientations. Falling back is right: an upright panel is readable, a pane
  // rotated to an angle this layout has no design for is not.
  const p = tmp();
  await fs.writeFile(p, JSON.stringify({ version: 1, display: { rotate: 90 } }));
  assert.equal(await new DisplaySettingsStore(p).load(), null);
});

test('the saved file is written atomically (temp file renamed, not truncate-in-place)', async () => {
  const p = tmp();
  const store = new DisplaySettingsStore(p);
  await store.save({ rotate: 180 });
  const leftovers = (await fs.readdir(path.dirname(p)))
    .filter((f) => f.startsWith(path.basename(p)) && f.endsWith('.tmp'));
  assert.deepEqual(leftovers, []);
});

test('ROTATIONS is what the UI and the validators agree on', () => {
  assert.deepEqual(ROTATIONS, [0, 180]);
});
