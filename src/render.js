/* render.js — screenshot a pane URL into a 1280x480 JPEG.
 *
 * The one structural decision (see CLAUDE.md): the daemon screenshots its OWN
 * localhost URL. One renderer, two consumers — Playwright for the panel, and
 * any browser for design iteration and as the fallback when the panel dies.
 * This module never injects data or knows what a pane means. It only captures.
 *
 * Playwright's Chromium lives outside the project via PLAYWRIGHT_BROWSERS_PATH
 * (see .env.example). Not a sync workaround any more — the repo left OneDrive —
 * but a ~700MB browser cache still has no business inside a project directory.
 *
 * Design notes, settled before implementation and still true:
 *   - ONE long-lived browser + page. Launching Chromium per frame would cost
 *     more than the entire rest of the daemon.
 *   - deviceScaleFactor 1. The panel is 1280x480 of real pixels; rendering at
 *     2x and downscaling only softens the type.
 *   - JPEG, not PNG — the panel wants JPEG and PNG would need transcoding.
 *   - The page keeps its own 1s countdown timer, so a screenshot is always
 *     current. render.js never injects data; it only captures.
 *
 * ── WHY capture() MUST NOT BE TRUSTED TO RETURN ──────────────────────────
 * The panel reverts to its boot logo ~3s after the last frame (measured; see
 * hid.js IDLE_TIMEOUT_MS). A screenshot that hangs is therefore not a slow
 * frame, it is a blank panel. Every capture is raced against a timeout and the
 * caller is expected to keep pushing the previous frame rather than wait.
 * The daemon owns that policy; this module just guarantees capture() settles.
 */

export const VIEWPORT = { width: 1280, height: 480 };

/** A capture that takes longer than this is abandoned, not awaited. */
export const CAPTURE_TIMEOUT_MS = 2000;

/** JPEG quality. 92 is visually lossless at this size; ~40-60KB per frame. */
const JPEG_QUALITY = 92;

export class Renderer {
  #browser = null;
  #page = null;
  #url = null;
  #consecutiveFailures = 0;

  get healthy() { return this.#page !== null && !this.#page.isClosed(); }
  get url() { return this.#url; }
  get consecutiveFailures() { return this.#consecutiveFailures; }

  /** @param {string} url e.g. http://127.0.0.1:4780/panes/agenda/ */
  async open(url) {
    const { chromium } = await import('playwright');

    this.#browser = await chromium.launch({
      args: [
        // Match the panel's colour handling; without this Chromium may apply a
        // display profile and the palette's contrast gate stops meaning
        // anything by the time it reaches the glass.
        '--force-color-profile=srgb',
        // No compositor games — this window is never seen by a human.
        '--disable-lcd-text',
      ],
    });

    this.#page = await this.#browser.newPage({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
    });

    // Surface pane-side errors instead of silently rendering a broken page.
    // A pane that throws still screenshots fine — it just screenshots wrong.
    this.#page.on('pageerror', (err) => {
      console.error(`[render] pane threw: ${err.message}`);
    });
    this.#page.on('console', (msg) => {
      if (msg.type() === 'error') console.error(`[render] pane console: ${msg.text()}`);
    });

    await this.#goto(url);
    return true;
  }

  async #goto(url) {
    this.#url = url;
    // 'load' rather than 'networkidle': the pane runs a 1s countdown timer, so
    // the network never actually goes idle and networkidle would wait out its
    // full timeout on every navigation.
    await this.#page.goto(url, { waitUntil: 'load', timeout: 10_000 });
    // Let fonts settle. A screenshot taken mid-font-swap ships the fallback
    // face to the panel, which at this type size is very visible.
    await this.#page.evaluate(() => document.fonts?.ready);
  }

  /**
   * JPEG of the current page state.
   *
   * Returns null rather than throwing on failure — a dead render must not take
   * down the push loop. The caller keeps shipping the last good frame.
   *
   * @returns {Promise<Buffer|null>}
   */
  async capture() {
    if (!this.healthy) {
      this.#consecutiveFailures++;
      return null;
    }
    try {
      const shot = await this.#page.screenshot({
        type: 'jpeg',
        quality: JPEG_QUALITY,
        // Explicit clip: if the pane's CSS ever makes the document taller than
        // the viewport, a default screenshot would silently change size and the
        // panel would receive a frame whose header lies about its geometry.
        clip: { x: 0, y: 0, ...VIEWPORT },
        timeout: CAPTURE_TIMEOUT_MS,
      });
      this.#consecutiveFailures = 0;
      return shot;
    } catch (err) {
      this.#consecutiveFailures++;
      console.error(`[render] capture failed (${this.#consecutiveFailures}): ${err.message}`);
      return null;
    }
  }

  /** Point the same page at a different pane, for cycling. */
  async goto(url) {
    if (!this.healthy) throw new Error('renderer not open');
    await this.#goto(url);
  }

  /** Rebuild the browser after it has died. Cheap enough to just do. */
  async reopen() {
    const url = this.#url;
    await this.close();
    if (!url) throw new Error('nothing to reopen — open(url) was never called');
    return this.open(url);
  }

  async close() {
    try { await this.#page?.close(); } catch { /* already gone */ }
    try { await this.#browser?.close(); } catch { /* already gone */ }
    this.#page = this.#browser = null;
  }
}
