// Shared server validation: optional logs must never enter five-prayer adherence.
const OBLIGATORY_PRAYERS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
const OPTIONAL_PRAYERS = ['tahajjud', 'duha', 'witr'];
function optionalPrayerSettings(value) {
  return Object.fromEntries(OPTIONAL_PRAYERS.map(key => [key, value?.[key] === true]));
}
function validateBlessingTimes(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5 || value.some(t => typeof t !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) || new Set(value).size !== value.length) {
    throw new Error('Choose 1–5 unique times in HH:MM format (00:00–23:59).');
  }
  return [...value].sort();
}
module.exports = { OBLIGATORY_PRAYERS, OPTIONAL_PRAYERS, optionalPrayerSettings, validateBlessingTimes };
