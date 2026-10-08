/* tank-settings.test.js — the fish tank's three settings in display.json
 * (Sprint 9). Same file and same rules as rotation, so the important cases
 * are the ones where the two settings share a file: neither may clobber or
 * invalidate the other. Temp files only, never the real display.json. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DisplaySettingsStore, resolveTank, resolveRotation, parseTank, validateTankStrict,
  TANK_DEFAULTS,
} from '../src/display-settings.js';

let n = 0;
const tmp = () => path.join(os.tmpdir(), `peripheral-tank-settings-${process.pid}-${n++}.json`);

test('defaults: on, 10 minutes of lead, 10 fps — Ricky 2026-10-08, after fps-test', () => {
  assert.deepEqual(TANK_DEFAULTS, { enabled: true, leadMinutes: 10, fps: 10 });
  assert.deepEqual(resolveTank(null), TANK_DEFAULTS);
});

test('a file written before Sprint 9 loads exactly as it did', async () => {
  const p = tmp();
  await fs.writeFile(p, JSON.stringify({ version: 1, display: { rotate: 180 } }));
  assert.deepEqual(await new DisplaySettingsStore(p).load(), { rotate: 180 });
  assert.deepEqual(resolveTank(await new DisplaySettingsStore(p).load()), TANK_DEFAULTS);
});

test('saving the tank keeps a saved rotation, and vice versa', async () => {
  const store = new DisplaySettingsStore(tmp());
  await store.save({ rotate: 180 });
  await store.save({ tank: { enabled: false } });
  assert.deepEqual(await store.load(), { rotate: 180, tank: { enabled: false } });
  await store.save({ rotate: 0 });
  assert.deepEqual(await store.load(), { rotate: 0, tank: { enabled: false } });
});

test('tank fields merge — saving fps does not reset enabled', async () => {
  const store = new DisplaySettingsStore(tmp());
  await store.save({ tank: { enabled: false, leadMinutes: 15 } });
  await store.save({ tank: { fps: 2 } });
  assert.deepEqual(resolveTank(await store.load()), { enabled: false, leadMinutes: 15, fps: 2 });
});

test('a tank-only file leaves rotation to the env/default chain', async () => {
  const store = new DisplaySettingsStore(tmp());
  await store.save({ tank: { leadMinutes: 5 } });
  const saved = await store.load();
  assert.equal(saved.rotate, null);
  assert.equal(resolveRotation(saved).source === 'saved', false);
});

test('form-control strings are accepted', () => {
  assert.deepEqual(validateTankStrict({ enabled: 'false', leadMinutes: '12', fps: '6' }),
                   { enabled: false, leadMinutes: 12, fps: 6 });
});

test('an empty lead field is an absence, not zero minutes', () => {
  assert.throws(() => validateTankStrict({ leadMinutes: '' }), /leadMinutes/);
  assert.deepEqual(parseTank({ leadMinutes: '' }), {});
});

test('out-of-range values are refused on save, and nothing is written', async () => {
  const store = new DisplaySettingsStore(tmp());
  for (const bad of [{ fps: 5 }, { fps: 0 }, { fps: 2.5 }, { leadMinutes: 0 },
                     { leadMinutes: 61 }, { enabled: 'yes' }, {}]) {
    await assert.rejects(() => store.save({ tank: bad }), /tank/, JSON.stringify(bad));
  }
  assert.equal(await store.load(), null);
});

test('a hand-edited bad field falls back to its default without losing the others', async () => {
  const p = tmp();
  await fs.writeFile(p, JSON.stringify({
    version: 1, display: { rotate: 180, tank: { enabled: false, fps: 30 } },
  }));
  const saved = await new DisplaySettingsStore(p).load();
  assert.equal(saved.rotate, 180);
  assert.deepEqual(resolveTank(saved), { enabled: false, leadMinutes: 10, fps: 10 });
});
