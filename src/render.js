/* render.js — screenshot a pane URL into a 1280x480 JPEG.
 *
 * ── NOT IMPLEMENTED ──────────────────────────────────────────────────────
 * Needs `npm i` (Playwright + its ~120MB Chromium download).
 *
 * IMPORTANT — OneDrive: this repo lives inside OneDrive, which locks files it
 * is syncing. Set PLAYWRIGHT_BROWSERS_PATH to somewhere outside sync scope
 * (see .env.example) or the browser download will intermittently fail with
 * EBUSY/EPERM. This is a lesson inherited from the desktop-companion project,
 * which hit the same thing with Cargo build artifacts.
 *
 * Design notes already settled:
 *   - ONE long-lived browser + page. Launching Chromium per frame would cost
 *     more than the entire rest of the daemon.
 *   - deviceScaleFactor 1. The panel is 1280x480 of real pixels; rendering at
 *     2x and downscaling only softens the type.
 *   - JPEG, not PNG — the panel wants JPEG and PNG would need transcoding.
 *   - The page keeps its own 1s countdown timer, so a screenshot is always
 *     current. render.js never injects data; it only captures.
 */

export const VIEWPORT = { width: 1280, height: 480 };

export class Renderer {
  #browser = null;
  #page = null;

  /** @param {string} url e.g. http://127.0.0.1:4780/panes/agenda/ */
  async open(url) {
    void url;
    // TODO:
    //   const { chromium } = await import('playwright');
    //   this.#browser = await chromium.launch({ args: ['--force-color-profile=srgb'] });
    //   this.#page = await this.#browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    //   await this.#page.goto(url, { waitUntil: 'networkidle' });
    throw new Error('Renderer.open() not implemented — run `npm i` first');
  }

  /** @returns {Promise<Buffer>} JPEG of the current page state */
  async capture() {
    // TODO: return this.#page.screenshot({ type: 'jpeg', quality: 92 });
    throw new Error('Renderer.capture() not implemented');
  }

  /** Point the same page at a different pane, for cycling. */
  async goto(url) {
    void url;
    throw new Error('Renderer.goto() not implemented');
  }

  async close() {
    await this.#page?.close?.();
    await this.#browser?.close?.();
    this.#page = this.#browser = null;
  }
}
