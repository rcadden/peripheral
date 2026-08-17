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
  const { pathname } = new URL(req.url, `http://${HOST}:${PORT}`);

  if (req.method !== 'GET') return void res.writeHead(405).end('method not allowed');

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
