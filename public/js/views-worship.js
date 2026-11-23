// Worship: Prayer times, Qibla (phone compass), Calendar (Hijri+Gregorian), Fasting, Mosques (OSM + Google Maps directions), Zakat
import { $, escAttr, $$, esc, LS, I, api, state, toast, vibrate, shell, bindGo, go, sheet, localDay, hijri, hijriParts, fmtTime, computeTimes, loadMP, nextPrayer, PRAYERS, METHODS, guessMethod, locationPatch, validCoordinates,
  cd, every, saveSettings, TZ, tz, empty, loadingHTML, onCleanup, askAlim, confirmSheet } from './core.js';
import { heroCard } from './views-daily.js';

export async function locate(silent) {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) { if (!silent) toast('Location is not available — set your city in Settings'); return rej(new Error('No geolocation')); }
    navigator.geolocation.getCurrentPosition(async pos => {
      const lat = +pos.coords.latitude.toFixed(4), lng = +pos.coords.longitude.toFixed(4);
      try {
        const r = await api(`/reverse-city?lat=${lat}&lng=${lng}`);
        const patch = locationPatch({ ...r.result, lat, lng }, state.user.settings);
        await saveSettings(patch);
        if (!silent) toast('Location set: ' + (patch.city || `${lat}, ${lng}`));
        res();
      } catch (err) { if (!silent) toast(err.message || 'Could not resolve location — search your city instead'); rej(err); }
    }, err => { if (!silent) toast('Location permission denied — set your city in Settings'); rej(err); }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 36e5 });
  });
}

// Search is available on the prayer page itself, with or without GPS permission.
function bindPrayerLocation() {
  $('#loc').onclick = () => locate().then(viewPrayer).catch(() => {});
  const input = $('#prayerCityQ'), results = $('#prayerCityR');
  let timer, request = 0;
  input.oninput = () => {
    clearTimeout(timer); const id = ++request, q = input.value.trim();
    results.innerHTML = ''; if (q.length < 2) return;
    timer = setTimeout(async () => {
      try {
        const { results: cities } = await api('/geocode?q=' + encodeURIComponent(q));
        if (id !== request || !input.isConnected) return;
        results.innerHTML = cities.length ? cities.map((c, i) => `<button class="btn ghost block" data-pcity="${i}">${esc([c.name, c.admin, c.country].filter(Boolean).join(', '))}</button>`).join('') : '<div class="small muted">No cities found — try a nearby city.</div>';
        $$('[data-pcity]', results).forEach(b => b.onclick = async () => {
          try { await saveSettings(locationPatch(cities[+b.dataset.pcity], state.user.settings)); toast('Location set'); await viewPrayer(); }
          catch (e) { toast(e.message); }
        });
      } catch (e) { if (id === request && input.isConnected) results.innerHTML = '<div class="small muted">City search unavailable — please retry.</div>'; }
    }, 300);
  };
  onCleanup(() => { clearTimeout(timer); request++; });
}

const OPTIONAL_PRAYERS = [
  ['tahajjud', 'Tahajjud', 'Night prayer after sleep; the last third before Fajr is a preferred window.'],
  ['duha', 'Duha', 'After sunrise has passed and the sun has risen, until before Dhuhr; avoid prohibited times.'],
  ['witr', 'Witr', 'After Isha until before Fajr. Its legal classification differs by school.']
];
// Optional prayers live in the same table as the fard prayers (Tahajjud before Fajr, Duha after Sunrise, Witr after Isha).
const OPT_AR = { tahajjud: 'التهجد', duha: 'الضحى', witr: 'الوتر' };
function optionalRow(key, settings = {}, logs = {}, isToday = true, timeLabel = '') {
  const o = OPTIONAL_PRAYERS.find(x => x[0] === key); if (!o || settings[key] !== true) return '';
  const [, name, window] = o, done = logs[key] === 'done';
  return `<div class="prayer opt"><div class="nm">${name}<small>${OPT_AR[key]}</small><span class="opt-tag">Sunnah</span><div class="faint small opt-win">${window}</div></div><div class="tm">${timeLabel}</div>
    ${isToday ? `<div class="pstat"><button class="${done ? 'on' : ''}" data-optional-log="${key}" aria-pressed="${done}" title="${done ? name + ' completed · undo' : 'Mark ' + name + ' completed'}" aria-label="${done ? name + ' completed · undo' : 'Mark ' + name + ' completed'}">${I.check || '✓'}</button></div>` : ''}</div>`;
}
export function optionalPrayerCard(settings = {}, logs = {}, isToday = true) {
  return `<div class="card opt-card"><h3>Optional prayers</h3><div class="small muted">Show Tahajjud, Duha and Witr in your prayer table. They don’t affect your five-prayer streak.</div>${OPTIONAL_PRAYERS.map(([key, name, window]) => `<div class="list-item"><div class="grow"><b>${name}</b><div class="small faint">${window}</div></div><label class="toggle"><input type="checkbox" data-optional="${key}" aria-label="Track ${name}" ${settings[key] === true ? 'checked' : ''}><span></span></label></div>${settings[key] === true && isToday ? `<button class="btn ${logs[key] === 'done' ? 'accent' : 'ghost'} sm opt-legacy" data-optional-log="${key}" aria-pressed="${logs[key] === 'done'}">${logs[key] === 'done' ? name + ' completed · undo' : 'Mark ' + name + ' completed'}</button>` : ''}`).join('')}<div class="small faint" style="margin-top:10px">Windows are general guidance, not a ruling or a precise timetable. Follow your local scholar for details.</div></div>`;
}
function bindOptionalPrayers(root, settings, logs, redraw) {
  $$('[data-optional]', root).forEach(input => input.onchange = async () => {
    input.disabled = true;
    try { await saveSettings({ optionalPrayers: { ...settings.optionalPrayers, [input.dataset.optional]: input.checked } }); settings.optionalPrayers = state.user.settings.optionalPrayers; redraw(); }
    catch (e) { input.checked = !input.checked; toast(e.message); }
    finally { input.disabled = false; }
  });
  $$('[data-optional-log]', root).forEach(button => button.onclick = async () => {
    button.disabled = true; const prayer = button.dataset.optionalLog, status = logs[prayer] === 'done' ? null : 'done';
    try { await api('/prayer', { body: { prayer, status } }); logs[prayer] = status; vibrate(15); redraw(); }
    catch (e) { toast(e.message); button.disabled = false; }
  });
}

// ================= PRAYER =================
export async function viewPrayer() {
  const p = shell('Prayer times');
  const s = state.user.settings; let viewDate = new Date();
  const locationUI = `<div class="card"><div class="row between"><div class="small muted">${esc(s.city || 'Your prayer location')}${s.tz ? ' · ' + esc(s.tz) : ''}</div><button class="btn ghost" id="loc">Use GPS</button></div><label class="lbl" for="prayerCityQ">Search any city</label><input class="input" id="prayerCityQ" placeholder="City name, anywhere in the world" autocomplete="off"><div id="prayerCityR"></div></div>`;
  if (!validCoordinates(s.lat, s.lng)) { p.innerHTML = empty('clock', 'Set your location to see prayer times.', locationUI); bindPrayerLocation(); return; }
  p.innerHTML = loadingHTML();
  const [today, mp] = await Promise.all([api('/today').catch(() => ({ prayers: {}, daylog: {} })), loadMP()]);
  function draw() {
    const t = computeTimes(viewDate, mp); const isToday = localDay(viewDate) === localDay(); const np = nextPrayer(mp);
    p.innerHTML = `${locationUI}<div id="hero"></div>
      <div class="row between" style="margin:6px 0 8px"><button class="iconbtn" id="prev" aria-label="Previous day">${I.back}</button><div style="text-align:center"><div style="font-weight:600">${isToday ? 'Today' : viewDate.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short', timeZone: tz() })}</div><div class="faint small">${esc(hijri(viewDate))}</div></div><button class="iconbtn" id="next" aria-label="Next day">${I.fwd}</button></div>
      <div class="card" style="padding:6px 12px">${[['tahajjud'], ...PRAYERS].flatMap(x => x[0] === 'sunrise' ? [x, ['duha']] : x[0] === 'isha' ? [x, ['witr']] : [x]).map(([k, n, ar]) => !n ? optionalRow(k, s.optionalPrayers, today.prayers, isToday, k === 'tahajjud' ? (t.lastThird ? 'from ' + fmtTime(t.lastThird) : '') : k === 'duha' && t.sunrise && t.dhuhr ? 'from ' + fmtTime(new Date(t.sunrise.getTime() + 20 * 60000)) : k === 'witr' ? 'after Isha' : '') : `<div class="prayer ${isToday && np && !np.tomorrow && np.key === k ? 'next' : ''}"><div class="nm">${n}<small>${ar}</small></div><div class="tm">${fmtTime(t[k])}</div>
        ${k !== 'sunrise' && isToday ? `<div class="pstat" data-p="${k}">${[['ontime', I.check, 'On time'], ['jamaah', I.users, 'In congregation'], ['late', I.clock, 'Late'], ['missed', I.x, 'Missed']].map(([st, ic, tt]) => `<button class="${today.prayers[k] === st ? 'on' : ''}" data-s="${st}" title="${tt}" aria-label="${n}: ${tt}">${ic}</button>`).join('')}</div>` : ''}</div>`).join('')}</div>
      <div class="faint small" style="margin:-4px 4px 12px">Tap to log: on time · in congregation · late · missed</div>
      ${optionalPrayerCard(s.optionalPrayers, today.prayers, isToday)}
      <div class="grid2"><div class="kpi"><div class="l">Middle of the night</div><div class="n" style="font-size:20px">${fmtTime(t.midnight)}</div></div><div class="kpi"><div class="l">Last third (tahajjud)</div><div class="n" style="font-size:20px">${fmtTime(t.lastThird)}</div></div></div>
      <div class="card soft small muted" style="margin-top:12px">${false ? '' : `<b>Calculated:</b> ${esc(METHODS[s.method] || s.method)} · Asr ${s.madhab === 'Hanafi' ? 'Hanafi' : 'Standard'}.`} ${esc(s.city || `${s.lat}, ${s.lng}`)}<br>Change method, Asr, or adjust minutes to match your mosque in <a href="#/settings">Settings</a>. Times are calculated on your device.</div><div id="adhanCard"></div>`;
    bindPrayerLocation();
    bindOptionalPrayers(p, s, today.prayers, draw);
    heroCard($('#hero'));
    renderAdhanCard();
    const moveDay = delta => {
      const d = new Date(localDay(viewDate) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + delta);
      viewDate = globalThis.ShukrPrayerLocation.zonedTime(d.toISOString().slice(0, 10), '12:00', tz()); draw();
    };
    $('#prev').onclick = () => moveDay(-1);
    $('#next').onclick = () => moveDay(1);
    $$('.pstat').forEach(g => $$('button', g).forEach(b => b.onclick = async () => { const k = g.dataset.p; const st = today.prayers[k] === b.dataset.s ? null : b.dataset.s; today.prayers[k] = st; vibrate(15); draw(); await api('/prayer', { body: { prayer: k, status: st } }).catch(e => toast(e.message)); }));
  }
  async function renderAdhanCard() { const el = $('#adhanCard', p); if (!el) return; const U = await import('./views-ummah.js'); el.innerHTML = await U.adhanSettingsHTML(); U.bindAdhanSettings(el, renderAdhanCard); }
  draw();
}

// ================= QIBLA (device compass) =================
export async function viewQibla() {
  const p = shell('Qibla'); const t = computeTimes();
  if (!t) { p.innerHTML = empty('compass', 'Set your location first.', `<div style="margin-top:14px"><button class="btn accent" id="loc">Use my location</button></div>`); $('#loc').onclick = () => locate().then(viewQibla).catch(() => {}); return; }
  const q = t.qibla;
  const toRad = x => x * Math.PI / 180; const s = state.user.settings;
  const dist = (() => { const la1 = toRad(s.lat), lo1 = toRad(s.lng), la2 = toRad(21.4225), lo2 = toRad(39.8262); const h = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2; return Math.round(2 * 6371 * Math.asin(Math.sqrt(h))); })();
  p.innerHTML = `<div style="text-align:center;margin-top:12px"><div style="font-family:var(--serif);font-size:42px" id="qdeg">${q.toFixed(1)}°</div><div class="muted small">Qibla bearing from true North · ${dist.toLocaleString()} km to the Ka‘bah</div></div>
    <div class="compass" id="compass"><div class="phone-arrow"></div><div class="dial" id="dial"><span class="mark n">N</span><span class="mark e">E</span><span class="mark s">S</span><span class="mark w">W</span>
      <div class="needle" style="transform:rotate(${q}deg)"></div><div class="kaaba" id="kaaba" style="transform:rotate(${q}deg) translateY(-118px) rotate(${-q}deg)">${I.kaaba}</div></div><div class="center"></div></div>
    <div style="text-align:center;min-height:48px" id="qstat" class="muted">Tap below, then hold your phone flat.</div>
    <div style="text-align:center;margin-top:6px"><button class="btn accent" id="startC">${I.compass} Use phone compass</button></div>
    <div class="card soft small muted" style="margin-top:16px">Point the top of your phone (the arrow) toward the Ka‘bah icon. Keep away from metal and magnets, and move your phone in a figure-8 to calibrate. If your phone has no compass, use the bearing above with a physical compass.</div>`;
  const kaabaR = () => { const r = $('#compass').clientWidth / 2 - 42; $('#kaaba').style.transform = `rotate(${q}deg) translateY(-${r}px) rotate(${-q}deg)`; }; kaabaR();
  let lastBuzz = 0, smooth = null, gotAny = false;
  const handler = e => {
    let heading = null;
    if (typeof e.webkitCompassHeading === 'number') heading = e.webkitCompassHeading;
    else if (e.absolute && e.alpha != null) heading = (360 - e.alpha) % 360;
    if (heading == null) return; gotAny = true;
    const so = screen.orientation?.angle || window.orientation || 0; heading = (heading + so + 360) % 360;
    smooth = smooth == null ? heading : smooth + ((((heading - smooth) % 360) + 540) % 360 - 180) * 0.25;
    const dial = $('#dial'); if (!dial) return;
    dial.style.transform = `rotate(${-smooth}deg)`;
    const diff = ((q - smooth + 540) % 360) - 180; const ad = Math.abs(diff);
    $('#compass').classList.toggle('aligned', ad < 4);
    $('#qstat').innerHTML = ad < 4 ? '<b style="color:var(--green)">You are facing the Qibla</b>' : `Turn ${diff > 0 ? 'right' : 'left'} ${Math.round(ad)}°`;
    if (ad < 4 && Date.now() - lastBuzz > 1500) { vibrate(40); lastBuzz = Date.now(); }
  };
  const stop = () => { window.removeEventListener('deviceorientationabsolute', handler, true); window.removeEventListener('deviceorientation', handler, true); };
  onCleanup(stop);
  $('#startC').onclick = async () => {
    try { if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') throw new Error('Compass permission denied'); } }
    catch (e) { toast(e.message || 'Compass permission denied'); return; }
    if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', handler, true); else window.addEventListener('deviceorientation', handler, true);
    $('#startC').classList.add('hidden'); $('#qstat').textContent = 'Reading compass…';
    setTimeout(() => { if (!gotAny && $('#qstat')) $('#qstat').textContent = 'No compass data from this device. Use the bearing above.'; }, 4000);
  };
}

// ================= CALENDAR =================
const HMONTHS = ['Muharram', 'Safar', 'Rabi‘ al-Awwal', 'Rabi‘ al-Thani', 'Jumada al-Ula', 'Jumada al-Akhirah', 'Rajab', 'Sha‘ban', 'Ramadan', 'Shawwal', 'Dhu al-Qa‘dah', 'Dhu al-Hijjah'];
const EVENTS = { '1-1': 'Islamic New Year', '1-9': 'Tasu‘a (sunnah fast)', '1-10': 'Day of ‘Ashura (sunnah fast)', '3-12': 'Mawlid (12 Rabi‘ al-Awwal) — observed by many', '7-27': 'Isra’ & Mi‘raj (commonly observed)', '8-15': 'Mid-Sha‘ban', '9-1': 'Ramadan begins', '9-21': 'Last ten nights — seek Laylat al-Qadr', '9-23': 'Odd night of the last ten', '9-25': 'Odd night of the last ten', '9-27': 'Odd night of the last ten (27th)', '9-29': 'Odd night of the last ten', '10-1': 'Eid al-Fitr', '12-1': 'First ten days of Dhul Hijjah', '12-8': 'Day of Tarwiyah', '12-9': 'Day of ‘Arafah (sunnah fast for non-pilgrims)', '12-10': 'Eid al-Adha', '12-11': 'Days of Tashriq', '12-12': 'Days of Tashriq', '12-13': 'Days of Tashriq' };
const EVINFO = {
  '1-1': ['newyear', 'A new Hijri year. Muharram is one of the four sacred months (Quran 9:36).'],
  '1-10': ['fast', 'Fasting ‘Ashura expiates the sins of the previous year (Muslim 1162). Fast the 9th with it (Muslim 1134).'],
  '1-9': ['fast', 'Fasting the 9th alongside ‘Ashura differs from the People of the Book (Muslim 1134).'],
  '9-1': ['ramadan', 'The month of fasting and the Quran (Quran 2:185).'],
  '9-21': ['qadr', 'Seek Laylat al-Qadr in the odd nights of the last ten (Bukhari 2017).'], '9-23': ['qadr', ''], '9-25': ['qadr', ''], '9-27': ['qadr', ''], '9-29': ['qadr', ''],
  '10-1': ['eid', 'Pay Zakat al-Fitr before the prayer. Fasting on Eid day is not allowed (Bukhari 1990).'],
  '12-1': ['ten', 'No days are more beloved to Allah for good deeds than these ten (Bukhari 969).'],
  '12-9': ['fast', 'Fasting ‘Arafah expiates the previous and coming year (Muslim 1162).'],
  '12-10': ['eid', 'Eid al-Adha: the prayer, then the udhiyah (sacrifice).'],
  '12-11': ['tashriq', 'Days of eating, drinking and remembering Allah — no fasting (Muslim 1141).'], '12-12': ['tashriq', ''], '12-13': ['tashriq', '']
};
function moonPhase(d) { const syn = 29.530588853, ref = Date.UTC(2000, 0, 6, 18, 14); const age = (((d.getTime() - ref) / 864e5) % syn + syn) % syn;
  const idx = Math.round(age / syn * 8) % 8; return { age, icon: ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'][idx], name: ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'][idx] }; }
function sunnahFast(d, hp) { const dow = d.getDay(); const out = [];
  if (hp.m === 9) out.push('Ramadan fast');
  if ((hp.m === 10 && hp.d === 1) || (hp.m === 12 && hp.d >= 10 && hp.d <= 13)) return ['No fasting today'];
  if (dow === 1 || dow === 4) out.push(dow === 1 ? 'Monday fast' : 'Thursday fast');
  if ([13, 14, 15].includes(hp.d) && !(hp.m === 12 && hp.d === 13)) out.push('White day fast');
  if (hp.m === 10 && hp.d >= 2) out.push('Six of Shawwal');
  if (hp.m === 12 && hp.d === 9) out.push('Day of ‘Arafah');
  if (hp.m === 1 && (hp.d === 9 || hp.d === 10)) out.push(hp.d === 10 ? '‘Ashura' : 'Tasu‘a');
  if (hp.m === 1 && hp.d < 9) out.push('Muharram (best fasting after Ramadan)');
  return out; }
export async function viewCalendar() {
  const p = shell('Calendar');
  let cur = new Date(); cur.setDate(1); let mode = LS.get('calMode', 'greg');
  const fasting = new Set(((await api('/fasting').catch(() => ({ days: [] }))).days || []).map(d => d.day));
  let prayerHist = {}; try { const h = await api('/prayers/history?days=150'); (h.days || h.rows || []).forEach(r => { prayerHist[r.day] = r; }); } catch {}
  function draw() {
    const y = cur.getFullYear(), m = cur.getMonth();
    let start, days;
    if (mode === 'greg') { start = new Date(y, m, 1); days = new Date(y, m + 1, 0).getDate(); }
    else { const hp = hijriParts(cur); start = new Date(cur.getTime() - (hp.d - 1) * 864e5); days = 0; let d = new Date(start); while (hijriParts(d).m === hp.m && days < 31) { days++; d = new Date(d.getTime() + 864e5); } }
    const first = start.getDay(); const cells = [];
    for (let i = 0; i < first; i++) cells.push('<div></div>');
    const today = localDay(); const evList = []; let fastsThisMonth = 0;
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 864e5 + 12 * 36e5); const ds = localDay(d); const hp = hijriParts(d);
      const ev = EVENTS[`${hp.m}-${hp.d}`]; if (ev) evList.push([d, hp, ev]);
      const kind = EVINFO[`${hp.m}-${hp.d}`]?.[0] || (ev ? 'ev' : ''); const sf = sunnahFast(d, hp);
      const fri = d.getDay() === 5, white = [13, 14, 15].includes(hp.d), fasted = fasting.has(ds); if (fasted) fastsThisMonth++;
      const mp = moonPhase(d); const showMoon = hp.d === 1 || hp.d === 15 || mp.name === 'Full moon' && hp.d === 14;
      cells.push(`<div class="day ${ds === today ? 'today' : ''} ${white ? 'white' : ''} ${fri ? 'fri' : ''} ${kind ? 'k-' + kind : ''} ${hp.m === 9 ? 'ram' : ''}" data-d="${ds}">
        <span class="g">${mode === 'greg' ? d.getDate() : hp.d}</span><span class="h">${mode === 'greg' ? (hp.d === 1 ? HMONTHS[hp.m - 1].split(' ')[0].replace(/[‘’]/g, '').slice(0, 5) : hp.d) : d.getDate()}</span>
        <span class="marks">${ev ? '<i class="mk ev"></i>' : ''}${sf.length && sf[0] !== 'No fasting today' ? '<i class="mk sf"></i>' : ''}${fasted ? '<i class="mk fd"></i>' : ''}${fri ? '<i class="mk jm"></i>' : ''}</span>${showMoon ? `<span class="mo mo-${mp.name === 'Full moon' ? 'full' : mp.name === 'New moon' ? 'new' : 'part'}"></span>` : ''}</div>`);
    }
    const hpS = hijriParts(start), hpE = hijriParts(new Date(start.getTime() + (days - 1) * 864e5));
    const title = mode === 'greg' ? `${start.toLocaleDateString([], { month: 'long', year: 'numeric' })}` : `${HMONTHS[hpS.m - 1]} ${hpS.y} AH`;
    const subtitle = mode === 'greg' ? `${HMONTHS[hpS.m - 1]}${hpE.m !== hpS.m ? ' – ' + HMONTHS[hpE.m - 1] : ''} ${hpE.y} AH` : `${start.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${new Date(start.getTime() + (days - 1) * 864e5).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
    // upcoming events (next 400 days)
    const up = []; for (let k = 0; k < 400 && up.length < 6; k++) { const d = new Date(Date.now() + k * 864e5); const hp = hijriParts(d); const ev = EVENTS[`${hp.m}-${hp.d}`]; if (ev && !/Odd night|Tashriq/.test(ev) || (ev && /27th/.test(ev))) { if (!up.some(x => x[2] === ev)) up.push([d, hp, ev, k]); } }
    const sacred = [1, 7, 11, 12].includes(hpS.m);
    p.innerHTML = `<div class="seg" style="margin:8px 0 12px"><button class="${mode === 'greg' ? 'on' : ''}" data-m="greg">Gregorian</button><button class="${mode === 'hijri' ? 'on' : ''}" data-m="hijri">Hijri</button></div>
      <div class="row between" style="margin-bottom:8px"><button class="iconbtn" id="cp" aria-label="Previous month">${I.back}</button><div style="text-align:center"><div style="font-family:var(--serif);font-size:20px">${title}</div><div class="faint small">${subtitle}${sacred ? ' · Sacred month' : ''}</div></div><button class="iconbtn" id="cn" aria-label="Next month" style="transform:scaleX(-1)">${I.back}</button></div>
      <div class="cal cal2">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => `<div class="dow ${i === 5 ? 'fri' : ''}">${d}</div>`).join('')}${cells.join('')}</div>
      <div class="cal-legend"><span><i class="mk ev"></i>Islamic day</span><span><i class="mk sf"></i>Sunnah fast</span><span><i class="mk fd"></i>You fasted</span><span><i class="mk jm"></i>Jumu‘ah</span><span><b class="lg-w"></b>White days</span></div>
      <div class="row" style="gap:8px;margin:6px 0 12px"><button class="btn ghost sm" id="todayBtn">Today</button><span class="faint small grow" style="text-align:right">${fastsThisMonth ? `You fasted ${fastsThisMonth} day${fastsThisMonth > 1 ? 's' : ''} this month` : ''}</span></div>
      ${evList.length ? `<div class="card"><h3>This month</h3>${evList.map(([d, hp, ev]) => `<div class="list-item" data-d2="${localDay(d)}"><div class="grow"><div>${esc(ev)}</div><div class="faint small">${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} · ${hp.d} ${HMONTHS[hp.m - 1]}</div></div></div>`).join('')}</div>` : ''}
      <div class="card"><h3>Coming up</h3>${up.map(([d, hp, ev, k]) => `<div class="list-item"><div class="grow"><div>${esc(ev)}</div><div class="faint small">${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · ${hp.d} ${HMONTHS[hp.m - 1]} ${hp.y}</div></div><span class="cal-in">${k === 0 ? 'Today' : k === 1 ? 'Tomorrow' : 'in ' + k + ' days'}</span></div>`).join('')}</div>
      <div class="card soft small muted">Hijri dates use the Umm al-Qura calendar; local moon-sighting may differ by a day — adjust in Settings (Hijri adjustment). Tap any day for prayer times, fasting and details.</div>`;
    $$('[data-m]', p).forEach(b => b.onclick = () => { mode = b.dataset.m; LS.set('calMode', mode); draw(); });
    $('#cp').onclick = () => { cur = mode === 'greg' ? new Date(y, m - 1, 1) : new Date(start.getTime() - 15 * 864e5); draw(); };
    $('#cn').onclick = () => { cur = mode === 'greg' ? new Date(y, m + 1, 1) : new Date(start.getTime() + (days + 2) * 864e5); draw(); };
    $('#todayBtn').onclick = () => { cur = new Date(); if (mode === 'greg') cur.setDate(1); draw(); };
    const openDay = ds => { const d = new Date(ds + 'T12:00:00'); const hp = hijriParts(d); const ev = EVENTS[`${hp.m}-${hp.d}`]; const info = EVINFO[`${hp.m}-${hp.d}`]?.[1];
      const t = computeTimes(d); const sf = sunnahFast(d, hp); const mp = moonPhase(d); const ph = prayerHist[ds];
      sheet(`<h3>${d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3><div class="muted">${hp.d} ${HMONTHS[hp.m - 1]} ${hp.y} AH · <span class="mo-i mo-${mp.name === 'Full moon' ? 'full' : mp.name === 'New moon' ? 'new' : 'part'}"></span> ${mp.name}</div>
        ${ev ? `<div class="badge" style="margin-top:8px">${esc(ev)}</div>${info ? `<p class="small" style="margin:8px 0 0">${esc(info)}</p>` : ''}` : ''}
        ${d.getDay() === 5 ? `<a class="list-item" href="#/jummah"><div class="grow">🕌 Jumu‘ah — sunnahs & mosques near you</div>›</a>` : ''}
        ${sf.length ? `<div class="chips wrap" style="margin-top:8px">${sf.map(x => `<span class="chip ${x === 'No fasting today' ? '' : 'on'}">${esc(x)}</span>`).join('')}</div>` : ''}
        ${t ? `<div class="divider"></div><div class="cal-times">${PRAYERS.map(([k, n]) => `<div><small>${n}</small><b>${fmtTime(t[k])}</b>${ph && ph[k] ? `<i class="pst ${esc(ph[k])}"></i>` : ''}</div>`).join('')}</div>` : ''}
        <div class="divider"></div><div class="list-item"><div class="grow">I fasted this day</div><label class="toggle"><input type="checkbox" id="fastT" ${fasting.has(ds) ? 'checked' : ''}><span></span></label></div>`, (sh) => {
        $('#fastT', sh).onchange = async e => { await api('/fasting', { body: { day: ds, on: e.target.checked, kind: hp.m === 9 ? 'ramadan' : 'sunnah' } }); if (e.target.checked) fasting.add(ds); else fasting.delete(ds); draw(); };
      }); };
    $$('.day[data-d]', p).forEach(c => c.onclick = () => openDay(c.dataset.d));
    $$('[data-d2]', p).forEach(c => c.onclick = () => openDay(c.dataset.d2));
  }
  draw();
}

// ================= FASTING =================
export async function viewFasting() {
  const p = shell('Fasting');
  const { days } = await api('/fasting'); const set = new Set(days.map(d => d.day)); const today = localDay(); const hp = hijriParts(new Date());
  const year = new Date().getFullYear(); const thisYear = days.filter(d => d.day.startsWith(String(year))).length;
  const ram = days.filter(d => d.kind === 'ramadan').length;
  const dow = new Date().getDay(); const sunnahToday = dow === 1 || dow === 4 || [13, 14, 15].includes(hp.d) || (hp.m === 1 && [9, 10].includes(hp.d)) || (hp.m === 12 && hp.d === 9);
  p.innerHTML = `<div class="card" style="text-align:center"><div class="faint small">Today · ${esc(hijri())}</div><div style="font-family:var(--serif);font-size:22px;margin:6px 0">${set.has(today) ? 'You are fasting today' : sunnahToday ? 'Today is a sunnah fasting day' : 'Not fasting today'}</div>
    <button class="btn ${set.has(today) ? 'ghost' : 'accent'}" id="tog">${set.has(today) ? 'Unmark today' : 'I’m fasting today'}</button></div>
    <div class="grid3"><div class="kpi"><div class="n">${thisYear}</div><div class="l">Fasts in ${year}</div></div><div class="kpi"><div class="n">${ram}</div><div class="l">Ramadan days logged</div></div><div class="kpi"><div class="n">${days.length}</div><div class="l">All-time</div></div></div>
    <div class="card" style="margin-top:12px"><h3>Sunnah fasts</h3>
      <div class="list-item"><div class="grow">Mondays & Thursdays</div><span class="faint small">Tirmidhi 747</span></div>
      <div class="list-item"><div class="grow">White days — 13th, 14th, 15th of each Hijri month</div><span class="faint small">Nasa’i 2420</span></div>
      <div class="list-item"><div class="grow">Day of ‘Arafah (9 Dhul Hijjah)</div><span class="faint small">Muslim 1162</span></div>
      <div class="list-item"><div class="grow">‘Ashura (10 Muharram) with the 9th</div><span class="faint small">Muslim 1162, 1134</span></div>
      <div class="list-item"><div class="grow">Six days of Shawwal</div><span class="faint small">Muslim 1164</span></div></div>
    <div class="card"><h3>Recent</h3>${days.slice(0, 30).map(d => `<div class="list-item"><div class="grow">${new Date(d.day + 'T12:00').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div><span class="badge ${d.kind === 'ramadan' ? '' : 'green'}">${esc(d.kind)}</span></div>`).join('') || '<div class="faint small">No fasts logged yet. Tap days in the Calendar to log past fasts.</div>'}</div>
    <button class="btn ghost block" data-go="/calendar">Open calendar</button>`;
  bindGo(p);
  $('#tog').onclick = async () => { await api('/fasting', { body: { on: !set.has(today), kind: hp.m === 9 ? 'ramadan' : 'sunnah' } }); vibrate(15); viewFasting(); };
}

// ================= MOSQUES =================
let leafletP = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return leafletP || (leafletP = new Promise((res, rej) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.append(l);
    const s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload = () => res(window.L); s.onerror = () => { leafletP = null; rej(new Error('Map failed to load')); }; document.head.append(s);
  }));
}
export async function viewMosques() {
  const p = shell('Mosques near me');
  let alive = true; onCleanup(() => { alive = false; });
  let s = state.user.settings;
  if (s.lat == null) { p.innerHTML = empty('mosque', 'Set your location to find mosques nearby.', `<div style="margin-top:14px"><button class="btn accent" id="loc">Use my location</button></div><div style="margin-top:10px"><a class="btn ghost" href="https://www.google.com/maps/search/mosque+near+me" target="_blank" rel="noopener">Open Google Maps</a></div>`); $('#loc').onclick = () => locate().then(() => alive && viewMosques()).catch(e => toast(e.message)); return; }
  let rad = LS.get('mosqueRad', 3000), here = { lat: +s.lat, lng: +s.lng };
  const zoom = r => r <= 1500 ? 15 : r <= 3000 ? 14 : r <= 6000 ? 13 : 12;
  // Google Maps embed (no API key needed); every result opens in the Google Maps app.
  const embed = () => `https://maps.google.com/maps?q=${encodeURIComponent('mosque')}&ll=${here.lat},${here.lng}&sll=${here.lat},${here.lng}&z=${zoom(rad)}&output=embed`;
  const gSearch = () => `https://www.google.com/maps/search/mosque/@${here.lat},${here.lng},${zoom(rad)}z`;
  const gDir = m => `https://www.google.com/maps/dir/?api=1&origin=${here.lat},${here.lng}&destination=${m.lat},${m.lng}`;
  const gPlace = m => `https://www.google.com/maps/search/?api=1&query=${m.lat},${m.lng}`;
  p.innerHTML = `<div class="gmap-wrap"><iframe id="gmap" class="gmap" title="Mosques on Google Maps" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen src="${escAttr(embed())}"></iframe>
      <a class="gmap-open" href="${escAttr(gSearch())}" target="_blank" rel="noopener">${I.mosque} Open in Google Maps</a></div>
    <div class="seg" style="margin:10px 0">${[1500, 3000, 6000, 12000].map(r => `<button data-r="${r}" class="${r === rad ? 'on' : ''}">${r / 1000} km</button>`).join('')}</div>
    <div class="row between" style="margin-bottom:8px"><span class="faint small" id="mcount"></span><button class="btn ghost sm" id="relocate">${I.pin} Update location</button></div>
    <div id="mlist">${loadingHTML('Finding mosques…')}</div>`;
  const $l = () => alive ? $('#mlist', p) : null;
  async function load() {
    const list = $l(); if (!list) return; list.innerHTML = loadingHTML('Finding mosques…');
    $('#gmap', p).src = embed();
    $('.gmap-open', p).href = gSearch();
    try {
      const { mosques } = await api(`/mosques?lat=${here.lat}&lng=${here.lng}&r=${rad}`);
      const el = $l(); if (!el) return;
      $('#mcount', p).textContent = `${mosques.length} within ${rad / 1000} km`;
      el.innerHTML = mosques.length ? mosques.map(m => `<div class="mosque-row"><a class="mosque-ic" href="${escAttr(gPlace(m))}" target="_blank" rel="noopener" aria-label="Show on Google Maps">${I.mosque}</a><div class="grow"><div class="mosque-name">${esc(m.name)}</div><div class="faint small">${(m.dist / 1000).toFixed(1)} km${m.address ? ' · ' + esc(m.address) : ''}</div></div>
          <a class="btn accent sm" href="${escAttr(gDir(m))}" target="_blank" rel="noopener">${I.route} Go</a>${m.phone ? `<a class="btn ghost sm tt-sq" href="tel:${escAttr(m.phone)}" aria-label="Call">${I.phone}</a>` : ''}</div>`).join('')
        : `<div class="empty small">No mosques listed nearby in our data.<div style="margin-top:12px"><a class="btn accent sm" href="${escAttr(gSearch())}" target="_blank" rel="noopener">Search Google Maps</a></div></div>`;
    } catch (e) { const el = $l(); if (!el) return; el.innerHTML = `<div class="empty small">${esc(e.message)}<div style="margin-top:12px"><a class="btn accent sm" href="${escAttr(gSearch())}" target="_blank" rel="noopener">Search Google Maps instead</a></div></div>`; }
  }
  $$('[data-r]', p).forEach(b => b.onclick = () => { rad = +b.dataset.r; LS.set('mosqueRad', rad); $$('[data-r]', p).forEach(x => x.classList.toggle('on', x === b)); load(); });
  $('#relocate', p).onclick = () => navigator.geolocation?.getCurrentPosition(pos => { if (!alive) return; here = { lat: pos.coords.latitude, lng: pos.coords.longitude }; load(); }, () => toast('Location permission denied'), { enableHighAccuracy: true, timeout: 10000 });
  load();
}

// ================= ZAKAT =================
// Every ISO-4217 currency the device knows, common Muslim-world currencies first, labelled in the user's language.
function zakatCurrencies(sel) {
  const top = ['USD', 'EUR', 'GBP', 'SAR', 'AED', 'LKR', 'INR', 'PKR', 'BDT', 'MYR', 'IDR', 'TRY', 'EGP', 'QAR', 'KWD', 'NGN', 'CAD', 'AUD'];
  let all = []; try { all = Intl.supportedValuesOf('currency'); } catch { all = top; }
  let dn; try { dn = new Intl.DisplayNames([navigator.language || 'en', 'en'], { type: 'currency' }); } catch {}
  const label = c => `${c} — ${dn ? dn.of(c) : c}`;
  const rest = all.filter(c => !top.includes(c)).sort((a, b) => label(a).localeCompare(label(b)));
  const opt = c => `<option value="${c}" ${c === sel ? 'selected' : ''}>${esc(label(c))}</option>`;
  if (sel && !all.includes(sel) && !top.includes(sel)) rest.unshift(sel);
  return `<optgroup label="Popular">${top.map(opt).join('')}</optgroup><optgroup label="All currencies">${rest.map(opt).join('')}</optgroup>`;
}
export async function viewZakat() {
  const p = shell('Zakat calculator');
  const v = LS.get('zakat', { gold: 0, silver: 0, cash: 0, bank: 0, invest: 0, business: 0, receivable: 0, debts: 0, goldPrice: 0, silverPrice: 0, nisab: 'silver', currency: 'LKR' });
  p.innerHTML = `<div class="sub" style="margin-top:10px">Estimate the zakat due on your wealth held for one lunar year (hawl). Zakat is 2.5% of zakatable wealth above the nisab.</div>
    <div class="card"><div class="grid2"><div><label class="lbl">Currency</label><select class="input" id="currency">${zakatCurrencies(v.currency)}</select></div><div><label class="lbl">Nisab basis</label><select class="input" id="nisab"><option value="silver" ${v.nisab === 'silver' ? 'selected' : ''}>Silver (595 g)</option><option value="gold" ${v.nisab === 'gold' ? 'selected' : ''}>Gold (85 g)</option></select></div></div>
    <div class="row between" style="margin:12px 0 6px"><span class="faint small" id="zlive">Metal prices per gram in your currency</span><button class="btn ghost sm" id="zfetch">Use live prices</button></div><div class="grid2"><div><label class="lbl">Gold price / gram</label><input class="input" type="number" inputmode="decimal" id="goldPrice" value="${v.goldPrice || ''}"></div><div><label class="lbl">Silver price / gram</label><input class="input" type="number" inputmode="decimal" id="silverPrice" value="${v.silverPrice || ''}"></div></div></div>
    <div class="card"><h3>Your wealth</h3>${[['gold', 'Gold you own (grams)'], ['silver', 'Silver you own (grams)'], ['cash', 'Cash in hand'], ['bank', 'Bank balances'], ['invest', 'Investments & shares (zakatable value)'], ['business', 'Business stock / trade goods'], ['receivable', 'Money owed to you (expected)'], ['debts', 'Debts due now (subtract)']].map(([k, l]) => `<label class="lbl">${l}</label><input class="input" type="number" inputmode="decimal" id="${k}" value="${v[k] || ''}">`).join('')}</div>
    <div class="card" id="zres"></div>
    <button class="btn ghost block" id="askZ">Ask Alim about my zakat (cites published fatwas)</button>
    <div class="card soft small muted" style="margin-top:12px">This is an estimate. Rulings differ on jewellery, retirement funds and other assets — consult a qualified scholar or your local zakat authority.</div>`;
  const calc = () => {
    $$('input,select', p).forEach(i => { if (i.id) v[i.id] = i.type === 'number' ? (+i.value || 0) : i.value; }); LS.set('zakat', v);
    const goldVal = v.gold * v.goldPrice, silverVal = v.silver * v.silverPrice;
    const total = goldVal + silverVal + v.cash + v.bank + v.invest + v.business + v.receivable - v.debts;
    const nisabVal = v.nisab === 'gold' ? 85 * v.goldPrice : 595 * v.silverPrice;
    const fmt = n => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: v.currency, maximumFractionDigits: 2 }).format(Math.max(0, n)); } catch { return `${esc(v.currency)} ${Math.max(0, n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`; } };
    $('#zres').innerHTML = `<div class="row between"><span class="muted">Zakatable wealth</span><b>${fmt(total)}</b></div><div class="row between" style="margin-top:6px"><span class="muted">Nisab (${v.nisab})</span><b>${nisabVal ? fmt(nisabVal) : 'enter metal price'}</b></div><div class="divider"></div>
      <div class="row between"><span style="font-family:var(--serif);font-size:20px">Zakat due</span><span style="font-family:var(--serif);font-size:26px;color:var(--accent)">${nisabVal && total >= nisabVal ? fmt(total * 0.025) : fmt(0)}</span></div>
      ${nisabVal && total < nisabVal ? '<div class="faint small" style="margin-top:6px">Your wealth is below the nisab — no zakat is due.</div>' : ''}`;
  };
  $$('input,select', p).forEach(i => i.addEventListener('input', calc)); calc();
  let alive = true; onCleanup(() => { alive = false; });
  async function live(auto) {
    const btn = $('#zfetch', p), msg = $('#zlive', p); if (!btn) return;
    btn.disabled = true; msg.textContent = 'Getting today’s gold & silver prices…';
    try {
      const d = await api('/metal-prices?currency=' + encodeURIComponent(v.currency));
      if (!alive) return;
      $('#goldPrice', p).value = +d.gold.toFixed(2); $('#silverPrice', p).value = +d.silver.toFixed(2); v.priceCur = v.currency; calc();
      msg.textContent = `Live ${d.currency} prices · ${new Date(d.updated).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`;
    } catch (e) { if (alive) msg.textContent = auto ? 'Enter today’s prices per gram' : e.message; }
    finally { if (alive) btn.disabled = false; }
  }
  $('#zfetch', p).onclick = () => live(false);
  $('#currency', p).addEventListener('change', () => live(false));
  if (!v.goldPrice || !v.silverPrice || v.priceCur !== v.currency) live(true);
  $('#askZ').onclick = () => askAlim('Help me understand zakat on my wealth — what counts as zakatable (gold jewellery, savings, investments, pension) according to published fatwas? Please cite sources.', 'fiqh');
}
