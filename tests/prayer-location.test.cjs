const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const file = require('node:path').join(__dirname, '../public/js/prayer-location.js');
function helpers() { const context = {}; vm.runInNewContext(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '', context); return context.ShukrPrayerLocation || {}; }
test('regional methods cover continents and a location patch preserves explicit override', () => {
  const { guessMethod, locationPatch } = helpers();
  assert.equal(typeof guessMethod, 'function');
  for (const [zone, country, expected] of [['Asia/Colombo', 'LK', 'MuslimProLK'], ['America/New_York', 'US', 'NorthAmerica'], ['America/Sao_Paulo', 'BR', 'MuslimWorldLeague'], ['Europe/London', 'GB', 'MoonsightingCommittee'], ['Africa/Cairo', 'EG', 'Egyptian'], ['Africa/Johannesburg', 'ZA', 'MuslimWorldLeague'], ['Asia/Riyadh', 'SA', 'UmmAlQura'], ['Asia/Karachi', 'PK', 'Karachi'], ['Asia/Singapore', 'SG', 'Singapore'], ['Australia/Sydney', 'AU', 'MuslimWorldLeague']]) assert.equal(guessMethod(zone, country), expected, zone);
  const city = { lat: 0, lng: 32, name: 'Kampala', country: 'Uganda', countryCode: 'UG', tz: 'Africa/Kampala', id: 232422 };
  const patch = locationPatch(city, {});
  assert.equal(patch.lat, 0); assert.equal(patch.tz, city.tz); assert.equal(patch.method, 'MuslimWorldLeague');
  assert.equal(locationPatch(city, { methodChosen: true, method: 'Karachi' }).method, undefined);
  assert.throws(() => locationPatch({ ...city, tz: undefined }, {}), /timezone/i);
});
test('coordinate validation accepts zero but rejects absent, nonnumeric and out of range coordinates', () => {
  const { validCoordinates } = helpers();
  assert.equal(typeof validCoordinates, 'function', 'shared coordinate validator must exist');
  for (const pair of [[0, 0], [0, 32], [51, 0], [-90, -180], [90, 180]]) assert.equal(validCoordinates(...pair), true);
  for (const pair of [[null, 0], ['', 0], [undefined, 0], [NaN, 0], [91, 0], [0, -181], [true, 0]]) assert.equal(validCoordinates(...pair), false);
});
