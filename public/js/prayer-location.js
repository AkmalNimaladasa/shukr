// Shared by the server and browser so location rules cannot drift.
(function (root) {
  function validCoordinates(lat, lng) {
    const number = v => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(+v);
    return number(lat) && number(lng) && Math.abs(+lat) <= 90 && Math.abs(+lng) <= 180;
  }
  function guessMethod(zone = '', country = '') {
    const cc = String(country).toUpperCase();
    const regional = { LK: 'MuslimProLK', US: 'NorthAmerica', CA: 'NorthAmerica', EG: 'Egyptian', SA: 'UmmAlQura', YE: 'UmmAlQura', AE: 'Dubai', OM: 'Dubai', KW: 'Kuwait', QA: 'Qatar', BH: 'Qatar', SG: 'Singapore', MY: 'Singapore', ID: 'Singapore', BN: 'Singapore', TR: 'Turkey', IR: 'Tehran', PK: 'Karachi', IN: 'Karachi', BD: 'Karachi', AF: 'Karachi', NP: 'Karachi', GB: 'MoonsightingCommittee', IE: 'MoonsightingCommittee' };
    if (regional[cc]) return regional[cc];
    if (/Colombo/.test(zone)) return 'MuslimProLK';
    if (/Riyadh|Aden/.test(zone)) return 'UmmAlQura';
    if (/Dubai|Muscat/.test(zone)) return 'Dubai';
    if (/Kuwait/.test(zone)) return 'Kuwait';
    if (/Qatar|Bahrain/.test(zone)) return 'Qatar';
    if (/Singapore|Kuala_Lumpur|Kuching|Jakarta|Makassar|Jayapura|Brunei/.test(zone)) return 'Singapore';
    if (/Istanbul/.test(zone)) return 'Turkey';
    if (/Tehran/.test(zone)) return 'Tehran';
    if (/Cairo/.test(zone)) return 'Egyptian';
    if (/Karachi|Kolkata|Calcutta|Dhaka|Kabul|Kathmandu|Katmandu/.test(zone)) return 'Karachi';
    if (/^Europe\//.test(zone)) return 'MoonsightingCommittee';
    // America/* also includes South America: never apply ISNA to the whole continent.
    if (!cc && /^America\/(New_York|Detroit|Chicago|Denver|Boise|Phoenix|Los_Angeles|Anchorage|Juneau|Nome|Sitka|Yakutat|Adak|Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina|Moncton|Goose_Bay|Iqaluit|Whitehorse|Dawson|Dawson_Creek|Fort_Nelson|Swift_Current|Indiana\/|Kentucky\/|North_Dakota\/)/.test(zone)) return 'NorthAmerica';
    return 'MuslimWorldLeague';
  }
  function locationPatch(city, settings = {}) {
    if (!validCoordinates(city.lat, city.lng)) throw new Error('Invalid location coordinates');
    if (!city.tz) throw new Error('Location timezone is unavailable; please retry');
    try { new Intl.DateTimeFormat('en', { timeZone: city.tz }); } catch { throw new Error('Invalid location timezone'); }
    const patch = { lat: +city.lat, lng: +city.lng, city: [city.name, city.country].filter(Boolean).join(', ') || null, tz: city.tz, countryCode: city.countryCode || null, mpCityId: city.id || null };
    if (!settings.methodChosen) patch.method = guessMethod(city.tz, city.countryCode);
    return patch;
  }
  // Iterate the offset because UTC midnight can be on the other side of a DST
  // change from the requested local prayer time. Never use the device timezone.
  function zonedTime(day, hhmm, zone) {
    const [y, m, d] = day.split('-').map(Number), [h, mi] = hhmm.split(':').map(Number);
    const wall = Date.UTC(y, m - 1, d, h, mi);
    const f = new Intl.DateTimeFormat('en-US', { timeZone: zone || 'UTC', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    let instant = wall;
    for (let i = 0; i < 4; i++) {
      const p = Object.fromEntries(f.formatToParts(new Date(instant)).map(x => [x.type, x.value]));
      const next = instant + wall - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
      if (next === instant) break;
      instant = next;
    }
    return new Date(instant);
  }
  const helpers = { validCoordinates, guessMethod, locationPatch, zonedTime };
  root.ShukrPrayerLocation = helpers;
  if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
})(globalThis);
