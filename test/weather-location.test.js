/* weather-location.test.js — the persisted picker-saved weather location.
 *
 * Only WeatherLocationStore (pure local file I/O) is tested here — no test
 * in this repo makes live network calls (see test/cache.test.js and
 * test/palette-overrides.test.js for the same convention), and
 * resolveZip()/resolveGrid()/resolveZipToGrid() are thin wrappers around two
 * real external APIs (Zippopotam.us, api.weather.gov) with nothing left to
 * unit-test once network I/O is excluded — their correctness was verified
 * live during development instead (see CHANGELOG.md, 2026-08-20).
 *
 * Mirrors test/cache.test.js's structure and reasoning. Every test writes to
 * a temp file, never the real %LOCALAPPDATA%\Peripheral\weather-location.json.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { WeatherLocationStore } from '../src/weather-location.js';

let n = 0;
const tmp = () => path.join(os.tmpdir(), `peripheral-weather-location-test-${process.pid}-${n++}.json`);

const LOCATION = {
  zip: '28806', city: 'Asheville', state: 'NC',
  lat: 35.5808, lon: -82.6078,
  gridId: 'GSP', gridX: 54, gridY: 73, stationId: 'KAVL',
};

test('a missing location file loads as null — the normal case before the picker is ever used', async () => {
  const store = new WeatherLocationStore(tmp());
  assert.equal(await store.load(), null);
});

test('a saved location round-trips exactly', async () => {
  const store = new WeatherLocationStore(tmp());
  await store.save(LOCATION);
  assert.deepEqual(await store.load(), LOCATION);
});

test('a later save replaces the whole location, not a partial merge', async () => {
  // Unlike PaletteOverridesStore, a location is one atomic unit — there's no
  // sense in which "half a grid reference" is meaningful, so save() here is
  // a full overwrite by design, not a role-by-role merge.
  const store = new WeatherLocationStore(tmp());
  await store.save(LOCATION);
  const second = { ...LOCATION, zip: '10001', city: 'New York', gridId: 'OKX', gridX: 33, gridY: 35 };
  await store.save(second);
  assert.deepEqual(await store.load(), second);
});

test('a corrupt file is ignored, never thrown — the daemon must still start', async () => {
  const p = tmp();
  await fs.writeFile(p, '{ this is not json');
  assert.equal(await new WeatherLocationStore(p).load(), null);
});

test('a file from a different version is ignored', async () => {
  const p = tmp();
  await fs.writeFile(p, JSON.stringify({ version: 99, location: LOCATION }));
  assert.equal(await new WeatherLocationStore(p).load(), null);
});

test('a file missing gridId is ignored rather than treated as a valid location', async () => {
  const p = tmp();
  await fs.writeFile(p, JSON.stringify({ version: 1, location: { zip: '28806' } }));
  assert.equal(await new WeatherLocationStore(p).load(), null);
});

test('the saved file is written atomically (temp file renamed, not truncate-in-place)', async () => {
  // Same guarantee cache.js/tokens.js/palette-overrides.js all make: a crash
  // mid-write cannot leave a half-written file the next boot has to distrust.
  const p = tmp();
  const store = new WeatherLocationStore(p);
  await store.save(LOCATION);
  const files = await fs.readdir(path.dirname(p));
  const leftoverTmp = files.filter((f) => f.startsWith(path.basename(p)) && f.endsWith('.tmp'));
  assert.deepEqual(leftoverTmp, [], 'no .tmp file should survive a successful save');
});
