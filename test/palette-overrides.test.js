/* palette-overrides.test.js — persisted colour-picker choices.
 *
 * Mirrors test/cache.test.js's structure and reasoning: every test writes to
 * a temp file, never the real %LOCALAPPDATA%\Peripheral\palette-overrides.json.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { PaletteOverridesStore, mergeHues } from '../src/palette-overrides.js';
import { ENV_HUE_DEFAULTS, ENV_HUE_KEYS } from '../src/palette.js';

let n = 0;
const tmp = () => path.join(os.tmpdir(), `peripheral-palette-overrides-test-${process.pid}-${n++}.json`);

test('a missing overrides file loads as {}, not an error — the normal case before anyone uses the picker', async () => {
  const store = new PaletteOverridesStore(tmp());
  assert.deepEqual(await store.load(), {});
});

test('a saved partial hues object round-trips', async () => {
  const store = new PaletteOverridesStore(tmp());
  await store.save({ hero: 90 });
  assert.deepEqual(await store.load(), { hero: 90 });
});

test('save merges into what is already saved, rather than replacing it', async () => {
  const store = new PaletteOverridesStore(tmp());
  await store.save({ hero: 90 });
  await store.save({ cool: 40 });
  assert.deepEqual(await store.load(), { hero: 90, cool: 40 });
});

test('a later save overwrites only the role it touches', async () => {
  const store = new PaletteOverridesStore(tmp());
  await store.save({ hero: 90, cool: 40 });
  await store.save({ hero: 120 });
  assert.deepEqual(await store.load(), { hero: 120, cool: 40 });
});

test('the literal "wallpaper" is a valid, storable value', async () => {
  const store = new PaletteOverridesStore(tmp());
  await store.save({ hero: 'wallpaper' });
  assert.deepEqual(await store.load(), { hero: 'wallpaper' });
});

test('an unknown role key is dropped, not persisted', async () => {
  const store = new PaletteOverridesStore(tmp());
  await store.save({ hero: 90, notARole: 1 });
  assert.deepEqual(await store.load(), { hero: 90 });
});

test('an invalid hue value (not a finite number or "wallpaper") is dropped', async () => {
  const store = new PaletteOverridesStore(tmp());
  await store.save({ hero: 'not-a-hue', cool: NaN, calendarWork: 100 });
  assert.deepEqual(await store.load(), { calendarWork: 100 });
});

test('a corrupt file is ignored, never thrown — the daemon must still start', async () => {
  const p = tmp();
  await fs.writeFile(p, '{ this is not json');
  assert.deepEqual(await new PaletteOverridesStore(p).load(), {});
});

test('a file from a different version is ignored', async () => {
  const p = tmp();
  await fs.writeFile(p, JSON.stringify({ version: 99, hues: { hero: 90 } }));
  assert.deepEqual(await new PaletteOverridesStore(p).load(), {});
});

test('mergeHues: with nothing saved and no env vars set, every role is the hardcoded default', () => {
  const hues = mergeHues({}, {});
  for (const role of Object.keys(ENV_HUE_DEFAULTS)) {
    assert.equal(hues[role], ENV_HUE_DEFAULTS[role]);
  }
});

test('mergeHues: a saved value is used when no env var and no request override are present', () => {
  const hues = mergeHues({ hero: 90 }, {});
  assert.equal(hues.hero, 90);
});

test('mergeHues: a request override (e.g. the picker\'s live preview) wins over a saved value', () => {
  const hues = mergeHues({ hero: 90 }, { hero: 45 });
  assert.equal(hues.hero, 45);
});

test('mergeHues: an actually-SET env var wins over a saved value', (t) => {
  const key = ENV_HUE_KEYS.hero;
  const original = process.env[key];
  process.env[key] = '300';
  t.after(() => {
    if (original === undefined) delete process.env[key];
    else process.env[key] = original;
  });

  const hues = mergeHues({ hero: 90 }, {});
  // ENV_HUE_DEFAULTS.hero was computed at palette.js's module-load time
  // (before this test set the env var), so this only proves precedence
  // logic picks the env branch — not that the numeric value is live-reread.
  // That's correct: env vars are boot-time only throughout this codebase.
  assert.equal(hues.hero, ENV_HUE_DEFAULTS.hero);
});
