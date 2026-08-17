/* cache.test.js — the last-good-state cache.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────────────────────────────────────────────────────────
 * The cache only writes when a calendar fetch SUCCEEDS, and no fetch can
 * succeed until the OAuth client exists. So running the daemon today
 * exercises none of it — the code would sit unverified until the first real
 * token, and its whole job is to behave correctly on the boot AFTER something
 * went wrong. That is the worst possible thing to discover is broken.
 *
 * Every test here writes to a temp file, never the real
 * %LOCALAPPDATA%\Peripheral\last-state.json.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { StateCache, MAX_CACHE_AGE_MS } from '../src/cache.js';

let n = 0;
const tmp = () => path.join(os.tmpdir(), `peripheral-cache-test-${process.pid}-${n++}.json`);

const stateAt = (ageMs, events = [{ id: 'a', title: 'Standup' }]) => ({
  generatedAt: new Date(Date.now() - ageMs).toISOString(),
  stale: false,
  events,
});

test('a missing cache is null, not an error — this is the normal first run', async () => {
  const c = new StateCache(tmp());
  assert.equal(await c.load(), null);
});

test('a saved state round-trips', async () => {
  const c = new StateCache(tmp());
  await c.save(stateAt(0));
  const back = await c.load();
  assert.equal(back.events.length, 1);
  assert.equal(back.events[0].title, 'Standup');
});

test('a restored state is ALWAYS stale, even when it is seconds old', async () => {
  // The point of the flag is provenance, not age: nothing in THIS process has
  // confirmed the data. Returning stale:false on a young cache would put a
  // clean badge on a panel showing numbers no live fetch has backed.
  const c = new StateCache(tmp());
  await c.save(stateAt(0));
  assert.equal((await c.load()).stale, true);
});

test('a cache older than the limit is dropped entirely', async () => {
  const c = new StateCache(tmp());
  await c.save(stateAt(MAX_CACHE_AGE_MS + 60_000));
  assert.equal(await c.load(), null);
});

test('a cache just inside the limit is kept', async () => {
  const c = new StateCache(tmp());
  await c.save(stateAt(MAX_CACHE_AGE_MS - 60_000));
  assert.ok(await c.load());
});

test('a corrupt cache is ignored, never thrown — the daemon must still start', async () => {
  const p = tmp();
  await fs.writeFile(p, '{ this is not json');
  assert.equal(await new StateCache(p).load(), null);
});

test('a cache from a different version is ignored', async () => {
  const p = tmp();
  await fs.writeFile(p, JSON.stringify({ version: 99, state: stateAt(0) }));
  assert.equal(await new StateCache(p).load(), null);
});

test('a cache with no generatedAt is ignored rather than treated as ageless', async () => {
  const p = tmp();
  await fs.writeFile(p, JSON.stringify({ version: 1, state: { events: [] } }));
  assert.equal(await new StateCache(p).load(), null);
});

test('an unchanged agenda is not rewritten', async () => {
  // The daemon refreshes once a minute; the agenda changes a few times a day.
  // Without this, ~1400 writes a day differ only in generatedAt.
  const p = tmp();
  const c = new StateCache(p);
  await c.save(stateAt(0));
  const first = (await fs.stat(p)).mtimeMs;

  await new Promise((r) => setTimeout(r, 20));
  await c.save(stateAt(0)); // same events, later generatedAt
  assert.equal((await fs.stat(p)).mtimeMs, first, 'should not have rewritten');

  await c.save(stateAt(0, [{ id: 'b', title: 'Different' }]));
  assert.notEqual((await fs.stat(p)).mtimeMs, first, 'a real change must write');
});

test('an unwritable path is a warning, not a throw', async () => {
  // Losing the cache costs a blank panel on the NEXT restart. Throwing here
  // would cost the panel right now, which is strictly worse.
  const c = new StateCache(path.join(os.tmpdir(), 'peripheral-nope\0bad', 'x.json'));
  await c.save(stateAt(0)); // must resolve
});

test('an empty agenda round-trips as empty, not as missing', async () => {
  // "Genuinely nothing scheduled" is a real state and must survive a restart
  // as itself — collect() throws rather than returning this when sources fail,
  // so an empty cache really does mean a clear day.
  const c = new StateCache(tmp());
  await c.save(stateAt(0, []));
  const back = await c.load();
  assert.deepEqual(back.events, []);
});
