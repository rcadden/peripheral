/* hid.js — push JPEG frames to the Trofeo Vision panel over USB HID.
 *
 * ── NOT IMPLEMENTED ──────────────────────────────────────────────────────
 * Blocked on hardware (arrives 2026-08-18). The shape below is settled; the
 * wire details are not, and must be read off the protocol reference rather
 * than guessed:
 *
 *   https://github.com/Lexonight1/thermalright-trcc-linux
 *     — handshake + model auto-detection for this device family
 *   https://github.com/christensen143/claude-trofeo-hud
 *     — same 6.86" panel, confirms JPEG-over-HID at 0416:5302
 *
 * Unknowns to resolve against a live device, in order:
 *   1. Which HID interface path accepts frames (run `npm run probe` first)
 *   2. Handshake sequence, if any, before the first frame is accepted
 *   3. Output report size and how a frame larger than one report is chunked
 *   4. Whether a header carries length/checksum, and its byte order
 *   5. Behaviour on malformed frames — does it recover or need a replug?
 *
 * Design constraints that are NOT negotiable:
 *   - Never throw into the daemon loop. A panel that vanishes mid-write is the
 *     expected case on this hardware, not an exception. Report unhealthy and
 *     let the daemon keep rendering; reconnect on a backoff.
 *   - Never hold the device open across a failed write without reopening.
 *   - 1 fps default. This panel has a reliability record; do not hammer it.
 */

const VID = Number(process.env.PERIPHERAL_HID_VID ?? 0x0416);
const PID = Number(process.env.PERIPHERAL_HID_PID ?? 0x5302);
const DRY_RUN = /^true$/i.test(process.env.PERIPHERAL_DRY_RUN ?? '');

export class PanelTransport {
  #device = null;
  #healthy = false;
  #lastError = null;
  #backoffMs = 1000;

  get healthy() { return this.#healthy; }
  get lastError() { return this.#lastError; }

  async open() {
    if (DRY_RUN) {
      this.#healthy = true;
      console.log('[hid] DRY_RUN — frames will be written to ./frames/, not the panel');
      return true;
    }
    throw new Error('PanelTransport.open() not implemented — see header. Set PERIPHERAL_DRY_RUN=true to work without hardware.');
  }

  /**
   * Push one frame.
   * @param {Buffer} jpeg 1280x480 JPEG
   * @returns {Promise<boolean>} false on a (non-fatal) failed write
   */
  async push(jpeg) {
    void jpeg;
    throw new Error('PanelTransport.push() not implemented — see header.');
  }

  async close() {
    this.#device = null;
    this.#healthy = false;
  }
}

export const PANEL = { width: 1280, height: 480, vid: VID, pid: PID };
