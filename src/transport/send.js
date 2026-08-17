/* send.js — push one JPEG to the panel and report what happened.
 *
 *   npm run send -- path/to/frame.jpg
 *   npm run send -- path/to/frame.jpg --repeat 5
 *
 * This is the debug tool for the transport, kept because "does the panel still
 * work?" is a question worth answering in one command without starting the
 * whole daemon. It is also the fastest way to prove a suspected-dead panel is
 * actually dead rather than the renderer being broken.
 *
 * PERIPHERAL_DRY_RUN=true writes to ./frames/ instead, so this works with no
 * hardware attached.
 */

import { readFile } from 'node:fs/promises';
import { PanelTransport, PANEL } from './hid.js';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('-'));
const repeatIdx = args.indexOf('--repeat');
const repeat = repeatIdx === -1 ? 1 : Number(args[repeatIdx + 1] ?? 1);

if (!file) {
  console.error('usage: npm run send -- <file.jpg> [--repeat N]');
  process.exit(1);
}

const jpeg = await readFile(file);
console.log(`${file}: ${jpeg.length} bytes`);
if (jpeg[0] !== 0xFF || jpeg[1] !== 0xD8) {
  console.error('not a JPEG (missing FF D8). The panel only accepts JPEG.');
  process.exit(1);
}

const panel = new PanelTransport();
if (!(await panel.open())) {
  console.error(`could not open the panel: ${panel.lastError?.message}`);
  process.exit(1);
}

if (panel.info) {
  const { pm, sub, short, standardValid } = panel.info;
  console.log(`handshake: PM=${pm} SUB=${sub}` +
    `${short ? ' short' : ''}${standardValid ? ' valid' : ''}`);
  // PM 128 / SUB 1 is the Trofeo Vision 1280x480. A different PM means a
  // different panel in the same 0416:5302 family, and the geometry in
  // PANEL would then be wrong.
  if (pm !== 128) {
    console.warn(`WARNING: expected PM=128 for a ${PANEL.width}x${PANEL.height} ` +
      `Trofeo Vision. PM=${pm} is a different panel — check the geometry.`);
  }
} else {
  console.log('handshake: no reply (some firmwares stream without answering)');
}

let sent = 0;
for (let i = 0; i < repeat; i++) {
  const t0 = Date.now();
  const ok = await panel.push(jpeg);
  console.log(`frame ${i + 1}/${repeat}: ${ok ? 'ok' : 'FAILED'} in ${Date.now() - t0}ms`);
  if (!ok) {
    console.error(`  ${panel.lastError?.message}`);
    break;
  }
  sent++;
  if (i < repeat - 1) await new Promise((r) => setTimeout(r, 1000));
}

await panel.close();
console.log(`\n${sent}/${repeat} frame(s) accepted by the device.`);
console.log('Accepted means the writes succeeded — LOOK AT THE PANEL to confirm');
console.log('it actually latched and displayed. The two are not the same thing.');
process.exitCode = sent === repeat ? 0 : 1;
