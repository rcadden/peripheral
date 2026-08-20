/* Weather-location picker — client side.
 *
 * A zip code is a discrete, submitted action (not something you drag like a
 * hue slider), so unlike palette.js this has no live-preview-on-every-
 * keystroke path — just a lookup-and-save button. The resolution itself
 * (zip -> lat/lon -> NWS grid -> nearest station) happens entirely
 * server-side (src/weather-location.js); this file only sends the zip and
 * renders whatever comes back, the same "don't duplicate the source of
 * truth in client JS" rule palette.js follows for the contrast gate.
 */

const zipInput = document.getElementById('zipInput');
const zipSaveBtn = document.getElementById('zipSaveBtn');
const zipStatus = document.getElementById('zipStatus');
const locationCurrent = document.getElementById('locationCurrent');

function renderLocation(location, weather) {
  if (!location) {
    locationCurrent.textContent = 'No zip saved yet — using this install\'s built-in default location.';
    return;
  }
  const reading = weather
    ? ` — currently <span class="reading">${Math.round(weather.tempF)}°F, ${weather.conditionText}</span>`
    : '';
  locationCurrent.innerHTML =
    `<span class="place">${location.city}, ${location.state}</span> `
    + `(zip ${location.zip}, grid ${location.gridId} ${location.gridX},${location.gridY}, `
    + `station ${location.stationId})${reading}`;
}

async function loadCurrent() {
  try {
    const res = await fetch('/api/weather-location', { cache: 'no-store' });
    if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
    const { location } = await res.json();
    renderLocation(location, null);
    if (location) zipInput.value = location.zip;
  } catch (err) {
    locationCurrent.textContent = `could not load current location: ${err.message}`;
  }
}

zipSaveBtn.addEventListener('click', async () => {
  const zip = zipInput.value.trim();
  if (!/^\d{5}$/.test(zip)) {
    zipStatus.textContent = 'enter a 5-digit US zip code';
    zipStatus.className = 'status err';
    return;
  }

  zipSaveBtn.disabled = true;
  zipStatus.textContent = 'looking up…';
  zipStatus.className = 'status';
  try {
    const res = await fetch('/api/weather-location', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ zip }),
    });
    if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
    const { location, weather } = await res.json();
    renderLocation(location, weather);
    zipStatus.textContent = 'saved — the panel picks this up within moments, no restart needed';
    zipStatus.className = 'status ok';
  } catch (err) {
    zipStatus.textContent = `lookup failed: ${err.message}`;
    zipStatus.className = 'status err';
  } finally {
    zipSaveBtn.disabled = false;
  }
});

loadCurrent();
