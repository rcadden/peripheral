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
 * ── MEASURED ON REAL HARDWARE, 2026-08-17 ────────────────────────────────
 * Device arrived a day early and enumerates cleanly. Descriptors read via
 * libusb; nothing written to the device yet.
 *
 *   USB composite device, 1 config, 2 interfaces:
 *
 *   interface 0 — HID, vendor-defined (usagePage 0xff06, usage 0x0001)
 *       ep 0x82  OUT  INTERRUPT  maxPacketSize 512   <- THE FRAME CHANNEL
 *       ep 0x83  IN   INTERRUPT  maxPacketSize 8     <- status/ack, presumably
 *
 *   interface 1 — vendor-specific (class 255), ZERO endpoints
 *       Windows binds WinUSB to it and names it "USBDISPLAY", which is a red
 *       herring: an interface with no endpoints cannot carry frame data. It is
 *       a discovery stub. Do not chase it.
 *
 *   node-hid path (interface 0):
 *     \\?\HID#VID_0416&PID_5302&MI_00#8&16660c7e&0&0000#{4d1e55b2-...}
 *     Enumerate it rather than hardcoding — the instance id changes per port.
 *
 * CONFIRMED: unknown #1 above is answered. Frames go over HID interface 0, and
 * the 512-byte OUT endpoint sets the chunk size. A 1280x480 JPEG at ~50-150KB
 * is therefore ~100-300 writes per frame, which at 1 fps is unremarkable.
 * Manufacturer and product strings both read "USBDISPLAY".
 *
 * STILL UNKNOWN, and still must not be guessed: the handshake (#2), the frame
 * header/length/checksum layout (#4), and malformed-frame behaviour (#5).
 * Read those off the protocol reference before writing a single byte. This
 * panel has a 19% one-star failure rate; do not fuzz it.
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
