// Shared prayer-calculation presets (browser: window.ShukrMethods, server: require). Angles from each authority's published parameters.
(function (root) {
  // [fajrAngle, ishaAngle, ishaIntervalMin, maghribAngle, {minute offsets}]
  const EXTRA = { ACJU: [18, 18], Gulf: [19.5, 0, 90], Jordan: [18, 18, 0, 0, { maghrib: 5 }], JAKIM: [20, 18], KEMENAG: [20, 18, 0, 0, { dhuhr: 2 }], Russia: [16, 15],
    France: [12, 12], France15: [15, 15], France18: [18, 18], Portugal: [18, 0, 77, 0, { maghrib: 3 }], Morocco: [19, 17, 0, 0, { maghrib: 5 }], Algeria: [18, 17, 0, 0, { maghrib: 3 }], Tunisia: [18, 18],
    Jafari: [16, 14, 0, 4] };
  function params(adhan, s, coords) {
    let p;
    if (s.method === 'MuslimProLK') { p = adhan.CalculationMethod.Other(); p.fajrAngle = 19.65; p.ishaAngle = 18; p.methodAdjustments = { fajr: 0, sunrise: 0, dhuhr: 1, asr: 1, maghrib: 0, isha: 0 }; }
    else if (EXTRA[s.method] || s.method === 'Custom') {
      const cu = s.custom || {}, iv = cu.ishaMode === 'interval';
      const [fa, ia, ii, ma, adj] = s.method === 'Custom' ? [+cu.fajr || 18, iv ? 0 : (+cu.isha || 17), iv ? (+cu.ishaMin || 90) : 0, +cu.maghrib || 0] : EXTRA[s.method];
      p = adhan.CalculationMethod.Other(); p.fajrAngle = fa; p.ishaAngle = ia || 0; p.ishaInterval = ii || 0; if (ma) p.maghribAngle = ma;
      p.methodAdjustments = { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0, ...(adj || {}) };
    } else p = (adhan.CalculationMethod[s.method] || adhan.CalculationMethod.MuslimWorldLeague)();
    if (s.method === 'MoonsightingCommittee' && s.shafaq && adhan.Shafaq && adhan.Shafaq[s.shafaq]) p.shafaq = adhan.Shafaq[s.shafaq];
    p.madhab = s.madhab === 'Hanafi' ? adhan.Madhab.Hanafi : adhan.Madhab.Shafi;
    p.highLatitudeRule = s.highLat && s.highLat !== 'auto' && adhan.HighLatitudeRule[s.highLat] ? adhan.HighLatitudeRule[s.highLat] : adhan.HighLatitudeRule.recommended(coords);
    p.adjustments = { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0, ...(s.adjust || {}) };
    p.rounding = adhan.Rounding.Nearest;
    return p;
  }
  const api = { EXTRA, params };
  root.ShukrMethods = api; if (typeof module === 'object' && module && module.exports) module.exports = api;
})(globalThis);
