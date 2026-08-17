/* probe.js — is the panel there, and does it look like we expect?
 *
 * THIS IS THE FIRST THING TO RUN when the hardware arrives. It installs
 * nothing on the device and writes nothing to it: pure enumeration.
 *
 *   npm run probe
 *
 * If you don't want to `npm i` first, the zero-install equivalent is:
 *
 *   Get-PnpDevice -Class HIDClass | Where-Object InstanceId -match 'VID_0416'
 *
 * Expected: Thermalright Trofeo Vision 6.86" at VID 0x0416 / PID 0x5302.
 * Absent => bad cable, bad port, or a dead unit. Present but with unexpected
 * report sizes => a firmware revision the protocol reference doesn't cover.
 */

const WANT_VID = Number(process.env.PERIPHERAL_HID_VID ?? 0x0416);
const WANT_PID = Number(process.env.PERIPHERAL_HID_PID ?? 0x5302);

const hex = (n) => '0x' + n.toString(16).padStart(4, '0');

async function main() {
  let HID;
  try {
    HID = await import('node-hid');
  } catch {
    console.error('node-hid not installed. Run `npm i` first, or use the');
    console.error('PowerShell one-liner in the header of this file.');
    process.exitCode = 1;
    return;
  }

  const devices = HID.default.devices();

  console.log(`Looking for ${hex(WANT_VID)}:${hex(WANT_PID)}\n`);

  const match = devices.filter((d) => d.vendorId === WANT_VID && d.productId === WANT_PID);

  if (match.length === 0) {
    console.log('NOT FOUND.\n');
    console.log(`${devices.length} HID device(s) enumerated. Anything from vendor 0x0416:`);
    const sameVendor = devices.filter((d) => d.vendorId === WANT_VID);
    if (sameVendor.length) console.table(sameVendor);
    else console.log('  (none — the panel is not enumerating at all)');
    console.log('\nCheck, in order: the USB-C cable (a known failure point on');
    console.log('this model), a different port, then whether the unit is dead.');
    process.exitCode = 1;
    return;
  }

  console.log(`FOUND ${match.length} interface(s):\n`);
  for (const d of match) {
    console.log({
      manufacturer: d.manufacturer,
      product: d.product,
      vendorId: hex(d.vendorId),
      productId: hex(d.productId),
      // Multi-interface devices expose several paths; the LCD is usually the
      // one with the largest output report. Record which path actually works.
      usagePage: d.usagePage != null ? hex(d.usagePage) : undefined,
      usage: d.usage != null ? hex(d.usage) : undefined,
      interface: d.interface,
      path: d.path,
    });
  }
  console.log('\nRecord the working `path` in CLAUDE.md under Environment.');
}

main();
