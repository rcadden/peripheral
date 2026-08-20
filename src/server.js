/* Local HTTP server for Peripheral.
 *
 * Serves the panes out of web/ and exposes the current aggregated state at
 * /api/state. Deliberately dependency-free so it runs on a bare Node install.
 *
 * This exists because the daemon renders frames by screenshotting its OWN
 * localhost URL. One renderer, two consumers:
 *   1. Playwright screenshots http://127.0.0.1:PORT/panes/agenda/ -> HID panel
 *   2. You open the same URL in a browser when the panel is dead or you're
 *      iterating on design.
 *
 * Binds to 127.0.0.1 only. Nothing here should ever be reachable off-machine.
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleWallpaper, deriveTokens, regenerate } from './palette.js';
import { PaletteOverridesStore, mergeHues } from './palette-overrides.js';
import { WeatherLocationStore, resolveZipToGrid } from './weather-location.js';
import { NwsProvider } from './sources/weather.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '..', 'web');
const PORT = Number(process.env.PERIPHERAL_PORT ?? 4780); // 480p, 1280 wide
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

/* Current state, owned by the daemon. Null until a source has produced data —
 * the pane falls back to mock events on 503 so it never renders blank. */
let currentState = null;

export function setState(next) {
  currentState = next;
}

/* Colour-picker plumbing (added 2026-08-20). One store instance for the
 * process lifetime — cheap, and PaletteOverridesStore itself does no
 * caching, so every call re-reads the file (small, infrequent writes). */
const paletteOverrides = new PaletteOverridesStore();

/** Parse ?hero=..&cool=..&calendarWork=..&calendarPersonal=.. into a partial
 * hues object. A value is either a finite number or the literal "wallpaper".
 * Absent params are simply omitted, letting mergeHues() fall through to the
 * saved/env/default chain for whichever roles weren't specified. */
function parseQueryHues(searchParams) {
  const out = {};
  for (const role of ['hero', 'cool', 'calendarWork', 'calendarPersonal']) {
    if (!searchParams.has(role)) continue;
    const raw = searchParams.get(role);
    out[role] = raw === 'wallpaper' ? 'wallpaper' : Number(raw);
  }
  return out;
}

async function handlePalettePreview(req, res, searchParams) {
  try {
    const saved = await paletteOverrides.load();
    const hues = mergeHues(saved, parseQueryHues(searchParams));
    // Deliberately re-sampled every call, not cached — this is local,
    // low-frequency (a human dragging a slider, not a hot loop), and the
    // wallpaper file is small. Caching risks serving a stale sample if the
    // wallpaper changes mid-session, which would be a worse bug than the
    // extra decode cost.
    const sample = await sampleWallpaper();
    const derived = deriveTokens({ ...sample, hues });
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      .end(JSON.stringify(derived));
  } catch (err) {
    res.writeHead(500, { 'content-type': 'application/json' })
      .end(JSON.stringify({ error: err.message }));
  }
}

async function handlePaletteSave(req, res) {
  let body = '';
  try {
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 4096) {
        res.writeHead(413).end('too large');
        return;
      }
    }
    const parsed = JSON.parse(body);
    if (typeof parsed.hues !== 'object' || parsed.hues === null) {
      res.writeHead(400, { 'content-type': 'application/json' })
        .end(JSON.stringify({ error: 'expected {"hues": {...}}' }));
      return;
    }

    await paletteOverrides.save(parsed.hues);
    const saved = await paletteOverrides.load();
    // Re-derive with the merged (env-precedence-applied) hues so the daemon's
    // own web/ watcher picks up the same tokens.css this response describes.
    const derived = await regenerate(mergeHues(saved, {}));
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(derived));
  } catch (err) {
    res.writeHead(err instanceof SyntaxError ? 400 : 500, { 'content-type': 'application/json' })
      .end(JSON.stringify({ error: err.message }));
  }
}

/* Weather-location plumbing (added 2026-08-20) — same pattern as the
 * palette overrides above: one store instance for the process lifetime,
 * every call re-reads the file. This module never touches the daemon's own
 * `weatherProvider` — see daemon.js's applyLocationIfChanged() and
 * watchWeatherLocation(), which pick up a saved location by watching this
 * same file rather than server.js reaching into daemon.js directly. Keeping
 * that edge one-directional (daemon.js already imports server.js; the
 * reverse would be circular) is why the coupling is a file-watch and not a
 * function call. */
const weatherLocation = new WeatherLocationStore();

async function handleWeatherLocationGet(req, res) {
  const location = await weatherLocation.load();
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    .end(JSON.stringify({ location }));
}

async function handleWeatherLocationSave(req, res) {
  let body = '';
  try {
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 1024) {
        res.writeHead(413).end('too large');
        return;
      }
    }
    const parsed = JSON.parse(body);
    if (typeof parsed.zip !== 'string') {
      res.writeHead(400, { 'content-type': 'application/json' })
        .end(JSON.stringify({ error: 'expected {"zip": "12345"}' }));
      return;
    }

    // Resolve BEFORE persisting — an invalid zip or an NWS/geocoder hiccup
    // must never overwrite a working saved location with a broken one.
    const location = await resolveZipToGrid(parsed.zip);
    await weatherLocation.save(location);

    // One live confirmation read, so the response proves the new location
    // actually works rather than just that it resolved to A grid cell —
    // the same "accepted is not displayed" caution this project applies to
    // the HID transport applies here: a resolved grid ID is not proof NWS
    // will actually return a reading for it.
    const weather = await new NwsProvider(location).fetchNow();

    res.writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ location, weather }));
  } catch (err) {
    res.writeHead(err instanceof SyntaxError ? 400 : 502, { 'content-type': 'application/json' })
      .end(JSON.stringify({ error: err.message }));
  }
}

async function serveStatic(req, res, urlPath) {
  // Resolve inside WEB_ROOT and verify — cheap defence against traversal.
  let rel = decodeURIComponent(urlPath).replace(/^\/+/, '');
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';

  const full = path.resolve(WEB_ROOT, rel);
  if (full !== WEB_ROOT && !full.startsWith(WEB_ROOT + path.sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  try {
    const body = await fs.readFile(full);
    res.writeHead(200, {
      'content-type': MIME[path.extname(full).toLowerCase()] ?? 'application/octet-stream',
      // The panel repaints from a live page; never let anything cache.
      'cache-control': 'no-store',
    }).end(body);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'EISDIR') res.writeHead(404).end('not found');
    else {
      console.error('[server]', err);
      res.writeHead(500).end('error');
    }
  }
}

const server = http.createServer(async (req, res) => {
  const { pathname, searchParams } = new URL(req.url, `http://${HOST}:${PORT}`);

  // The POST routes in this server, matched before the blanket GET-only
  // gate below — everything else stays GET-only, unchanged.
  if (req.method === 'POST' && pathname === '/api/palette/save') {
    return void handlePaletteSave(req, res);
  }
  if (req.method === 'POST' && pathname === '/api/weather-location') {
    return void handleWeatherLocationSave(req, res);
  }

  if (req.method !== 'GET') return void res.writeHead(405).end('method not allowed');

  if (pathname === '/api/palette/preview') {
    return void handlePalettePreview(req, res, searchParams);
  }
  if (pathname === '/api/weather-location') {
    return void handleWeatherLocationGet(req, res);
  }

  if (pathname === '/api/state') {
    if (!currentState) {
      // Explicitly not an empty 200 — the pane must be able to tell
      // "no data yet" from "genuinely nothing scheduled".
      return void res.writeHead(503, { 'content-type': 'application/json' })
        .end(JSON.stringify({ error: 'no state yet' }));
    }
    return void res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    }).end(JSON.stringify(currentState));
  }

  if (pathname === '/api/health') {
    return void res.writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ ok: true, hasState: currentState !== null }));
  }

  await serveStatic(req, res, pathname);
});

export function start() {
  return new Promise((resolve) => {
    server.listen(PORT, HOST, () => {
      console.log(`[peripheral] http://${HOST}:${PORT}/panes/agenda/`);
      resolve({ port: PORT, host: HOST, url: `http://${HOST}:${PORT}` });
    });
  });
}

export function stop() {
  return new Promise((resolve) => server.close(resolve));
}

// Run standalone: `node src/server.js`
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  start();
}
