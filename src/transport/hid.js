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

import { promises as fs } from 'node:fs';
import path from 'node:path';

const VID = Number(process.env.PERIPHERAL_HID_VID ?? 0x0416);
const PID = Number(process.env.PERIPHERAL_HID_PID ?? 0x5302);
const DRY_RUN = /^true$/i.test(process.env.PERIPHERAL_DRY_RUN ?? '');

/* ── Wire constants, Type 2 (0416:5302) ───────────────────────────────────
 * Taken from the protocol reference, not inferred. See the links in the
 * header. Every one of these was cross-checked against two independent
 * implementations (trcc-linux HidLcd, and its HidApiTransport for the
 * hidapi-specific report-ID handling).
 */
const MAGIC = Buffer.from([0xDA, 0xDB, 0xDC, 0xDD]);
const INIT_SIZE = 512;          // handshake packet, zero-padded
const RESPONSE_SIZE = 512;      // bytes requested on the read
const CHUNK = 512;              // == OUT endpoint maxPacketSize, measured
const CMD_PICTURE = 0x02;
const FRAME_SETTLE_MS = 1;      // _DELAY_FRAME_TYPE2_S in the reference

/**
 * MEASURED ON HARDWARE 2026-08-17 — the panel's inactivity timeout.
 *
 * The firmware discards the pushed frame and falls back to its built-in boot
 * logo roughly 3 seconds after the last frame it received. Confirmed three ways
 * in one run of `npm run idle-test`:
 *
 *   - one frame then silence, handle held OPEN -> reverted at ~3s
 *   - 1 fps for 15s                            -> stayed up the whole time
 *   - after the last frame, handle released    -> reverted ~2s later
 *
 * The handle is irrelevant; only time-since-last-frame matters. If closing the
 * handle were the trigger, the third case would have reverted instantly.
 *
 * Consequence: the daemon must push UNCONDITIONALLY and forever. There is no
 * "content unchanged, skip this frame" optimisation available — that is just a
 * blank panel with extra steps. See project_goals.md principle 3.
 *
 * Timings are stopwatch-measured and carry a second or two of human error, so
 * treat 3000ms as approximate and keep real margin under it.
 */
export const IDLE_TIMEOUT_MS = 3000;

/**
 * The slowest safe push cadence. 1 fps sits ~3x inside the measured timeout,
 * which absorbs a late frame without the panel dropping. Do not raise this
 * above ~1500ms without re-running `npm run idle-test` on the actual unit.
 */
export const KEEPALIVE_INTERVAL_MS = 1000;

/** Round up to the next multiple of CHUNK. Frames are 512-aligned. */
const alignUp = (n) => Math.ceil(n / CHUNK) * CHUNK;

/**
 * 512-byte handshake: magic, 8 zeros, command=1 (DEV_INFO), 4 zeros, padded.
 * @returns {Buffer}
 */
export function buildInitPacket() {
  const p = Buffer.alloc(INIT_SIZE);
  MAGIC.copy(p, 0);
  p.writeUInt32LE(1, 12);   // command = DEV_INFO. Offsets 4-11 stay zero.
  return p;
}

/**
 * Type 2 frame: 20-byte header + JPEG, zero-padded to a 512 multiple.
 *
 *   0..3   magic DA DB DC DD
 *   4..5   cmd_type = 0x0002 (PICTURE)
 *   6..7   0x0000 = JPEG payload  (0x0001 would be RGB565)
 *   8..11  width, height as u16 LE
 *   12..15 0x00000002
 *   16..19 payload length, u32 LE
 *
 * @param {Buffer} jpeg
 * @param {number} width
 * @param {number} height
 * @returns {Buffer}
 */
export function buildFramePacket(jpeg, width = 1280, height = 480) {
  if (!(jpeg?.length >= 2) || jpeg[0] !== 0xFF || jpeg[1] !== 0xD8) {
    throw new Error('frame payload is not a JPEG (missing FF D8 magic)');
  }
  const header = Buffer.alloc(20);
  MAGIC.copy(header, 0);
  header.writeUInt16LE(CMD_PICTURE, 4);
  header.writeUInt16LE(0x0000, 6);      // JPEG mode
  header.writeUInt16LE(width, 8);
  header.writeUInt16LE(height, 10);
  header.writeUInt32LE(0x00000002, 12);
  header.writeUInt32LE(jpeg.length, 16);

  const raw = Buffer.concat([header, jpeg]);
  const padded = Buffer.alloc(alignUp(raw.length));   // Buffer.alloc zero-fills
  raw.copy(padded, 0);
  return padded;
}

/**
 * Parse a handshake reply. Returns null if it isn't one.
 *
 * PM lives at [5] and SUB at [4]. A Trofeo Vision answers PM=128 SUB=1. Some
 * firmwares reply with only 8 bytes; the magic alone is enough to accept those,
 * and PM/SUB still parse.
 *
 * @param {Buffer} resp
 */
export function parseHandshake(resp) {
  if (!resp || resp.length < 6 || !resp.subarray(0, 4).equals(MAGIC)) return null;
  const short = resp.length < 20;
  return {
    pm: resp[5],
    sub: resp[4],
    short,
    // The reference requires [12]==0x01 on a full-length reply.
    standardValid: short ? false : resp[12] === 0x01,
    raw: Buffer.from(resp),
  };
}

export class PanelTransport {
  #device = null;
  #healthy = false;
  #lastError = null;
  #backoffMs = 1000;
  #info = null;
  #frameDir = null;

  get healthy() { return this.#healthy; }
  get lastError() { return this.#lastError; }
  /** Handshake result: { pm, sub, short } once open() has succeeded. */
  get info() { return this.#info; }

  async open() {
    if (DRY_RUN) {
      this.#frameDir = path.resolve('frames');
      await fs.mkdir(this.#frameDir, { recursive: true });
      this.#healthy = true;
      console.log(`[hid] DRY_RUN — frames go to ${this.#frameDir}, not the panel`);
      return true;
    }

    let HID;
    try {
      HID = (await import('node-hid')).default;
    } catch (err) {
      this.#fail(new Error(`node-hid not available: ${err.message}. Run \`npm i\`.`));
      return false;
    }

    try {
      // Enumerate rather than open by VID/PID: this device exposes two
      // interfaces and only interface 0 carries the frame endpoint. The
      // instance path also changes per USB port, so it must not be hardcoded.
      const candidates = HID.devices().filter(
        (d) => d.vendorId === VID && d.productId === PID,
      );
      if (!candidates.length) {
        this.#fail(new Error(
          `panel ${hex(VID)}:${hex(PID)} not enumerating — check the USB-C cable ` +
          `(a known failure point on this model), then the port, then the unit`,
        ));
        return false;
      }
      // usagePage 0xff06 is the vendor-defined page the frame interface uses.
      const target = candidates.find((d) => d.usagePage === 0xff06) ?? candidates[0];

      this.#device = new HID.HID(target.path);
      this.#device.on('error', (e) => this.#fail(e));

      this.#info = await this.#handshake();
      this.#healthy = true;
      this.#backoffMs = 1000;
      this.#lastError = null;
      console.log(
        `[hid] open — PM=${this.#info?.pm ?? '?'} SUB=${this.#info?.sub ?? '?'}` +
        `${this.#info?.short ? ' (short reply)' : ''}`,
      );
      return true;
    } catch (err) {
      this.#fail(err);
      await this.close();
      return false;
    }
  }

  /**
   * Write the init packet and read the reply.
   *
   * A missing or unparseable reply is NOT fatal. One documented firmware
   * reboots on the init packet and streams without answering, and the panel is
   * still perfectly writable in that state. Failing the open here would turn a
   * quirk into a dead display, which is the opposite of what this project
   * wants — so we log and continue.
   */
  async #handshake() {
    this.#writeReport(buildInitPacket());
    let resp = null;
    try {
      // node-hid's readTimeout takes ONLY a timeout; the report length comes
      // from the descriptor. Passing (length, timeout) throws "readTimeout
      // needs time out parameter" and silently skips the handshake.
      resp = this.#device.readTimeout(1000);
    } catch (err) {
      console.warn(`[hid] handshake read failed (${err.message}) — continuing`);
    }
    const parsed = resp?.length ? parseHandshake(Buffer.from(resp)) : null;
    if (!parsed) {
      console.warn(
        '[hid] no valid handshake reply — proceeding anyway. Some firmwares ' +
        'reboot on init and stream without answering.',
      );
      return null;
    }
    return parsed;
  }

  /**
   * One HID output report. hidapi requires a report-ID byte first; this device
   * uses the default report, so that byte is 0x00 and a 512-byte chunk goes out
   * as 513 bytes. Confirmed against the reference's HidApiTransport.
   * @param {Buffer} chunk
   */
  #writeReport(chunk) {
    const report = Buffer.alloc(chunk.length + 1);
    chunk.copy(report, 1);              // report[0] stays 0x00
    return this.#device.write(report);
  }

  /**
   * Push one frame.
   *
   * The frame MUST go out as a sequence of 512-byte reports, never one blob.
   * The firmware latches only when it arrives that way: a single large write
   * succeeds, reports every byte transferred, and leaves the panel on its boot
   * logo. That is issue #150 in the reference implementation and it is the
   * single easiest thing to get wrong here.
   *
   * @param {Buffer} jpeg 1280x480 JPEG
   * @returns {Promise<boolean>} false on a non-fatal failed write
   */
  async push(jpeg) {
    const packet = buildFramePacket(jpeg, PANEL.width, PANEL.height);

    if (DRY_RUN) {
      const file = path.join(this.#frameDir, `frame-${Date.now()}.jpg`);
      await fs.writeFile(file, jpeg);
      return true;
    }

    if (!this.#device) return false;

    try {
      for (let offset = 0; offset < packet.length; offset += CHUNK) {
        const chunk = packet.subarray(offset, offset + CHUNK);
        const written = this.#writeReport(chunk);
        // A short write is the real failure. Windows counts the report-ID byte,
        // so a full chunk reports 513 — hence >=, not ===. An equality check
        // here wrongly failed every Windows frame (reference issue #240).
        if (written < chunk.length) {
          this.#fail(new Error(`short write at offset ${offset}: ${written} bytes`));
          return false;
        }
      }
      await sleep(FRAME_SETTLE_MS);
      this.#healthy = true;
      return true;
    } catch (err) {
      // A panel that vanishes mid-write is the expected case on this hardware.
      // Report unhealthy, drop the handle, and let the daemon keep rendering.
      this.#fail(err);
      await this.close();
      return false;
    }
  }

  /** Backoff for the daemon's reconnect loop. Doubles to 30s, then holds. */
  get backoffMs() { return this.#backoffMs; }
  noteReconnectFailure() {
    this.#backoffMs = Math.min(this.#backoffMs * 2, 30_000);
  }

  #fail(err) {
    this.#healthy = false;
    this.#lastError = err;
    console.error(`[hid] ${err.message}`);
  }

  async close() {
    if (this.#device) {
      try { this.#device.close(); } catch { /* already gone */ }
    }
    this.#device = null;
    this.#healthy = false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hex = (n) => '0x' + n.toString(16).padStart(4, '0');

export const PANEL = { width: 1280, height: 480, vid: VID, pid: PID };
