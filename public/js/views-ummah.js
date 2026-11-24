// Ummah hub: Jummah finder, mosque map (community database on OpenStreetMap), adhan player & sound settings.
import { $, $$, esc, escAttr, LS, I, api, state, toast, vibrate, shell, bindGo, go, sheet, saveSettings, loadingHTML, empty, onCleanup, duckNasheed, computeTimes } from './core.js';
import { locate } from './views-worship.js';

// ---------------- ADHAN ----------------
let adhanList = null;
export async function adhanVoices() { if (!adhanList) adhanList = fetch('/adhan/adhan.json').then(r => r.json()); return adhanList; }
let player = null;
export function stopAdhan() { document.querySelectorAll('[data-prev].on').forEach(x => { x.classList.remove('on'); x.innerHTML = I.play; }); if (player) { player.pause(); player.src = ''; player = null; duckNasheed(false); document.querySelector('.adhan-bar')?.remove(); document.documentElement.classList.remove('adhan-playing'); } }
export async function playAdhan(voiceId, { prayer = null, short = false } = {}) {
  const list = await adhanVoices(); const v = list.find(x => x.id === voiceId) || list[0];
  stopAdhan(); player = new Audio(short ? v.short : v.url); player.volume = Math.min(1, state.user?.settings?.reminders?.adhanVolume ?? 1); duckNasheed(true);
  const bar = document.createElement('div'); bar.className = 'adhan-bar';
  bar.innerHTML = `<span class="ab-ic">${I.mosque}</span><div class="grow"><b>${prayer ? esc(prayer[0].toUpperCase() + prayer.slice(1)) + ' · ' : ''}Adhan</b><div class="faint small">${esc(v.label)}</div></div><button class="btn ghost sm" id="abStop">${I.stop} Stop</button>`;
  document.body.append(bar); document.documentElement.classList.add('adhan-playing'); $('#abStop', bar).onclick = stopAdhan;
  player.onended = stopAdhan;
  try { await player.play(); } catch { const pl = player; document.querySelector('.adhan-bar')?.remove(); document.documentElement.classList.remove('adhan-playing');
    document.querySelector('.adhan-gate')?.remove(); const g = document.createElement('div'); g.className = 'adhan-gate';
    g.innerHTML = `<button class="ag-play" aria-label="Play adhan">${I.play}</button><b>${prayer ? esc(prayer[0].toUpperCase() + prayer.slice(1)) + ' — ' : ''}it’s time to pray</b><small>Tap to play the adhan</small><button class="ag-x">Not now</button>`;
    document.body.append(g);
    g.querySelector('.ag-play').onclick = async () => { g.remove(); document.body.append(bar); document.documentElement.classList.add('adhan-playing'); player = pl; try { await pl.play(); } catch { stopAdhan(); } };
    g.querySelector('.ag-x').onclick = () => { g.remove(); player = pl; stopAdhan(); }; }
}
// Service worker asks open windows to play when an adhan notification arrives.
const adhanKey = p => 'adhanPlayed:' + new Date().toDateString() + ':' + p;
const markPlayed = p => { try { localStorage.setItem(adhanKey(p), '1'); } catch {} };
const wasPlayed = p => { try { return !!localStorage.getItem(adhanKey(p)); } catch { return false; } };
let pendingAdhan = null;
function fireAdhan(voice, prayer) { if (prayer && wasPlayed(prayer)) return; if (prayer) markPlayed(prayer); playAdhan(voice, { prayer }); }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && pendingAdhan && Date.now() - pendingAdhan.at < 10 * 60000) { const a = pendingAdhan; pendingAdhan = null; fireAdhan(a.voice, a.prayer); } });
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => {
  if (e.data?.type === 'adhan') { if (document.visibilityState === 'visible') fireAdhan(e.data.voice, e.data.prayer); else pendingAdhan = { voice: e.data.voice, prayer: e.data.prayer, at: Date.now() }; }
  if (e.data?.type === 'adhan-stop') stopAdhan();
});
// Opening from a notification: #/prayer?adhan=fajr
window.addEventListener('hashchange', () => checkAdhanHash()); setTimeout(() => checkAdhanHash(), 1500);
// 3) In-app scheduler: whenever Shukr is open, play the adhan at prayer time itself (doesn't depend on push delivery).
setInterval(() => { try {
  if (!state.user || document.visibilityState !== 'visible') return; const r = state.user.settings?.reminders || {};
  if (r.prayers === false) return; const t = computeTimes(new Date()); if (!t) return; const now = Date.now();
  for (const p of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']) { if (r.prayerList && r.prayerList[p] === false) continue;
    const mode = (r.adhanPer && r.adhanPer[p]) || r.adhanMode || 'sound'; if (mode !== 'adhan') continue;
    const at = t[p] instanceof Date ? t[p].getTime() : 0; if (at && now >= at && now - at < 3 * 60000 && !wasPlayed(p)) fireAdhan(p === 'fajr' ? (r.fajrVoice || 'fajr-ramadan') : (r.adhanVoice || 'madinah'), p); }
} catch {} }, 15000);
function checkAdhanHash(tries = 0) { const m = location.hash.match(/[?&]adhan=(\w+)/); if (!m) return; if (!state.user) { if (tries < 40) setTimeout(() => checkAdhanHash(tries + 1), 500); return; } const r = state.user.settings.reminders || {};
  markPlayed(m[1]); playAdhan(m[1] === 'fajr' ? (r.fajrVoice || 'fajr-ramadan') : (r.adhanVoice || 'madinah'), { prayer: m[1] }); history.replaceState(null, '', location.hash.replace(/[?&]adhan=\w+/, '')); }

// Adhan & notification sound settings card (used on Prayer times + Settings)
export async function adhanSettingsHTML() {
  const r = state.user.settings.reminders || {}; const list = await adhanVoices(); const mode = r.adhanMode || 'sound';
  const per = r.adhanPer || {};
  const opt = sel => list.map(v => `<option value="${v.id}" ${v.id === sel ? 'selected' : ''}>${esc(v.label)}</option>`).join('');
  return `<div class="card adh-card"><h3>${I.mosque} Adhan & notification sound</h3>
    <div class="seg adh-mode">${[['adhan', 'Adhan'], ['sound', 'Tone'], ['silent', 'Silent']].map(([k, l]) => `<button data-am="${k}" class="${mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="faint small" style="margin:6px 0 10px">${mode === 'adhan' ? 'The full adhan plays when Shukr is open or when you tap the notification. Phones only allow a short system sound for notifications in the background.' : mode === 'sound' ? 'Your phone’s normal notification tone.' : 'Notification only, no sound or vibration.'}</div>
    <div id="adhVoices" ${mode === 'adhan' ? '' : 'hidden'}>
      <label class="lbl">Adhan voice</label><div class="faint small" id="adhSub"></div><div class="row" style="gap:8px"><select class="input grow" id="adhV">${opt(r.adhanVoice || 'madinah')}</select><button class="iconbtn" data-prev="adhV" aria-label="Preview">${I.play}</button></div>
      <label class="lbl">Fajr adhan</label><div class="row" style="gap:8px"><select class="input grow" id="adhF">${opt(r.fajrVoice || 'fajr-ramadan')}</select><button class="iconbtn" data-prev="adhF" aria-label="Preview">${I.play}</button></div>
      <label class="lbl">Volume</label><input type="range" id="adhVol" min="20" max="100" value="${Math.round((r.adhanVolume ?? 1) * 100)}" style="width:100%">
    </div>
    <label class="lbl">Per prayer</label>
    <div class="adh-per">${['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].map(p => { const m = per[p] || mode; return `<div class="list-item"><div class="grow" style="text-transform:capitalize">${p}</div><div class="seg sm">${[['adhan', I.mosque], ['sound', I.speaker], ['silent', I.mute]].map(([k, ic]) => `<button data-pp="${p}" data-pm="${k}" class="${m === k ? 'on' : ''}" aria-label="${k}">${ic}</button>`).join('')}</div></div>`; }).join('')}</div>
    <div class="row wrap" style="gap:6px;margin-top:10px"><button class="btn ghost sm" id="adhTest">${I.play} Test now</button><button class="btn ghost sm" data-go="/sounds/credits">Recording credits</button></div>
  </div>`;
}
export function bindAdhanSettings(root, rerender) {
  const r = () => state.user.settings.reminders || {};
  const saveR = async patch => { try { await saveSettings({ reminders: patch }); } catch (e) { toast(e.message); } };
  $$('[data-am]', root).forEach(b => b.onclick = async () => { await saveR({ adhanMode: b.dataset.am, adhanPer: {} }); vibrate(10); rerender(); });
  $$('[data-pp]', root).forEach(b => b.onclick = async () => { const per = { ...(r().adhanPer || {}), [b.dataset.pp]: b.dataset.pm }; await saveR({ adhanPer: per }); $$(`[data-pp="${b.dataset.pp}"]`, root).forEach(x => x.classList.toggle('on', x === b)); });
  const sub = async () => { const l = await adhanVoices(); const v = l.find(x => x.id === $('#adhV', root)?.value); if ($('#adhSub', root)) $('#adhSub', root).textContent = v ? v.sub + ' · ' + Math.round(v.secs / 60 * 10) / 10 + ' min' : ''; }; sub();
  $('#adhV', root)?.addEventListener('change', e => { saveR({ adhanVoice: e.target.value }); sub(); });
  $('#adhF', root)?.addEventListener('change', e => saveR({ fajrVoice: e.target.value }));
  $('#adhVol', root)?.addEventListener('change', e => saveR({ adhanVolume: +e.target.value / 100 }));
  $$('[data-prev]', root).forEach(b => b.onclick = async () => { const was = player && b.classList.contains('on'); stopAdhan(); $$('[data-prev]', root).forEach(x => { x.classList.remove('on'); x.innerHTML = I.play; });
    if (was) return; await playAdhan($('#' + b.dataset.prev, root).value, { short: true }); if (player) { b.classList.add('on'); b.innerHTML = I.stop; player.addEventListener('ended', () => { b.classList.remove('on'); b.innerHTML = I.play; }); } });
  $('#adhTest', root).onclick = async () => { const m = r().adhanMode || 'sound'; if (m === 'adhan') playAdhan(r().adhanVoice || 'madinah', { prayer: 'asr' });
    try { await api('/push/test', { body: { kind: 'prayer' } }); toast('Test notification sent'); } catch (e) { toast(e.message); } };
  bindGo(root);
}

// ---------------- MAP ----------------
let mlP = null;
function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  return mlP || (mlP = new Promise((res, rej) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/vendor/maplibre/maplibre-gl.css'; document.head.append(l);
    const s = document.createElement('script'); s.src = '/vendor/maplibre/maplibre-gl.js'; s.onload = () => res(window.maplibregl); s.onerror = () => { mlP = null; rej(new Error('Map failed to load')); }; document.head.append(s);
  }));
}
let leafletP = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return leafletP || (leafletP = new Promise((res, rej) => {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/vendor/leaflet/leaflet.css'; document.head.append(l);
    const s = document.createElement('script'); s.src = '/vendor/leaflet/leaflet.js'; s.onload = () => res(window.L); s.onerror = () => { leafletP = null; rej(new Error('Map failed to load')); }; document.head.append(s);
  }));
}
const km = d => d == null ? '' : d < 1000 ? Math.round(d / 10) * 10 + ' m' : (d / 1000).toFixed(d < 10000 ? 1 : 0) + ' km';
const gDir = m => `https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}`;
const gPlace = m => `https://www.google.com/maps/search/?api=1&query=${m.lat}%2C${m.lng}`;
const jText = m => (m.jummah || []).map(j => `${j.khutbah ? 'Khutbah ' + j.khutbah : ''}${j.khutbah && j.salah ? ' · ' : ''}${j.salah ? 'Salah ' + j.salah : ''}${j.lang ? ' · ' + j.lang : ''}`);
function here() { const s = state.user.settings; return s.lat != null ? { lat: +s.lat, lng: +s.lng } : null; }

function mosqueCard(m) {
  const langs = [...new Set([...(m.jummah || []).map(j => j.lang).filter(Boolean), ...(m.langs || [])])];
  return `<div class="mq-card" data-mq="${escAttr(m.id)}"><div class="mq-ic">${I.mosque}</div><div class="grow">
    <div class="mq-name">${esc(m.name)}${m.verified >= 2 ? ` <span class="mq-ok" title="Confirmed by the community">${I.check}</span>` : ''}</div>
    <div class="faint small">${km(m.dist)}${m.address ? ' · ' + esc(m.address) : ''}</div>
    ${m.jummah?.length ? `<div class="mq-j">${I.clock} ${jText(m).map(esc).join('<br>')}</div>` : `<div class="mq-j none">Jummah time not added yet</div>`}
    ${langs.length ? `<div class="mq-langs">${langs.map(l => `<span>${esc(l)}</span>`).join('')}</div>` : ''}
    ${m.imam ? `<div class="faint small">Imam: ${esc(m.imam)}</div>` : ''}
    ${m.goers ? `<div class="mq-hot">${I.flame} ${m.goers} going this Friday</div>` : ''}
  </div><div class="mq-acts"><a class="btn accent sm" href="${escAttr(gDir(m))}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${I.route} Go</a><a class="btn ghost sm mq-g" href="${escAttr(gPlace(m))}" target="_blank" rel="noopener" onclick="event.stopPropagation()" aria-label="Open in Google Maps">${I.pin} Maps</a></div></div>`;
}

export async function viewMosqueMap(query) {
  const p = shell('Mosques', { back: '/ummah', flush: true }); let alive = true; onCleanup(() => { alive = false; });
  let pos = here();
  if (!pos) { p.innerHTML = empty('mosque', 'Set your location to see mosques near you.', `<div style="margin-top:14px"><button class="btn accent" id="loc">${I.pin} Use my location</button></div>`); $('#loc').onclick = () => locate().then(() => viewMosqueMap(query)).catch(e => toast(e.message)); return; }
  let rad = LS.get('mqRad', 5000), filt = query?.get?.('jummah') === '1' ? 'jummah' : 'all', lang = '';
  p.innerHTML = `<div class="mq-map-wrap"><div id="mqMap" class="mq-map"></div><button class="mq-fab" id="mqAdd" aria-label="Add a mosque">${I.plus} Add mosque</button><button class="mq-locate" id="mqLocate" aria-label="Show my live location"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/></svg></button></div>
    <div class="mq-tools"><div class="seg sm">${[2000, 5000, 10000, 20000].map(r => `<button data-r="${r}" class="${r === rad ? 'on' : ''}">${r / 1000} km</button>`).join('')}</div>
      <div class="chips" style="margin-top:8px"><button class="chip ${filt === 'all' ? 'on' : ''}" data-f="all">All</button><button class="chip ${filt === 'jummah' ? 'on' : ''}" data-f="jummah">${I.clock} Jummah times</button><select class="chip" id="mqLang"><option value="">Any language</option></select></div>
      <a class="mq-gsearch" href="https://www.google.com/maps/search/mosque/@${pos.lat},${pos.lng},14z" target="_blank" rel="noopener">${I.external} Also search mosques on Google Maps</a></div>
    <div id="mqList" class="mq-list">${loadingHTML('Finding mosques…')}</div>
    <div class="faint small mq-credit">Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors · Jummah details by the Shukr community</div>`;
  let ML, map, markers = [], data = [], meMk = null, watchId = null, follow = false, loadedAt = { ...pos };
  onCleanup(() => { if (watchId != null) navigator.geolocation?.clearWatch(watchId); });
  try { ML = await loadMapLibre(); } catch (e) { toast(e.message); }
  if (!alive) return;
  if (ML) {
    map = new ML.Map({ container: $('#mqMap', p), style: state.flags?.mapStyle || 'https://tiles.openfreemap.org/styles/liberty', center: [pos.lng, pos.lat], zoom: 13, attributionControl: false });
    map.addControl(new ML.AttributionControl({ compact: true }), 'bottom-left');
    const me = document.createElement('div'); me.className = 'mq-me'; meMk = new ML.Marker({ element: me }).setLngLat([pos.lng, pos.lat]).addTo(map);
    map.on('dragstart', () => { follow = false; $('#mqLocate', p)?.classList.remove('follow'); });
    onCleanup(() => { try { map.remove(); } catch {} });
  }
  const pinEl = m => { const e = document.createElement('div'); e.className = 'mq-pin' + (m.jummah?.length ? ' j' : '') + (m.goers ? ' hot' : ''); e.innerHTML = `<span>${I.mosque}</span>`; return e; };
  function draw() {
    const list = data.filter(m => (filt !== 'jummah' || m.jummah.length) && (!lang || m.langs.includes(lang) || m.jummah.some(j => j.lang === lang)));
    const el = $('#mqList', p); if (!el) return;
    el.innerHTML = list.length ? list.map(mosqueCard).join('') : `<div class="empty small">No mosques match. ${filt === 'jummah' ? 'Be the first to add Jummah times — tap a mosque.' : ''}</div>`;
    $$('[data-mq]', el).forEach(c => c.onclick = () => go('/mosque/' + encodeURIComponent(c.dataset.mq)));
    if (map) { markers.forEach(mk => mk.remove()); markers = list.map(m => new ML.Marker({ element: pinEl(m), anchor: 'bottom' }).setLngLat([m.lng, m.lat])
      .setPopup(new ML.Popup({ offset: 30, closeButton: false }).setHTML(`<b>${esc(m.name)}</b><br>${jText(m).map(esc).join('<br>') || 'No Jummah time yet'}<br><a href="#/mosque/${encodeURIComponent(m.id)}">Details</a> · <a href="${escAttr(gPlace(m))}" target="_blank" rel="noopener">Google Maps</a>`)).addTo(map)); }
  }
  async function load(live) {
    if (!live) $('#mqList', p).innerHTML = loadingHTML('Finding mosques…');
    try { const r = await api(`/ummah/mosques?lat=${pos.lat}&lng=${pos.lng}&r=${rad}`); if (!alive) return; data = r.mosques;
      const sel = $('#mqLang', p); if (sel.options.length < 2) sel.innerHTML += r.langs.map(l => `<option>${esc(l)}</option>`).join('');
      if (map && !live) map.jumpTo({ center: [pos.lng, pos.lat], zoom: rad <= 2000 ? 14.5 : rad <= 5000 ? 13 : rad <= 10000 ? 12 : 11 });
      draw();
    } catch (e) { if (alive) $('#mqList', p).innerHTML = `<div class="empty small">${esc(e.message)}</div>`; }
  }
  $$('[data-r]', p).forEach(b => b.onclick = () => { rad = +b.dataset.r; LS.set('mqRad', rad); $$('[data-r]', p).forEach(x => x.classList.toggle('on', x === b)); load(); });
  $$('[data-f]', p).forEach(b => b.onclick = () => { filt = b.dataset.f; $$('[data-f]', p).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $('#mqLang', p).onchange = e => { lang = e.target.value; draw(); };
  // Live GPS: tap to start following your real-time position; mosques reload when you move more than ~1/4 of the radius.
  const dist = (a, b) => { const R = 6371e3, t = Math.PI / 180, dLa = (b.lat - a.lat) * t, dLo = (b.lng - a.lng) * t; const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  $('#mqLocate', p).onclick = () => {
    const btn = $('#mqLocate', p);
    if (!navigator.geolocation) return toast('Location isn’t available on this device');
    follow = true; btn.classList.add('follow', 'busy');
    if (map) map.easeTo({ center: [pos.lng, pos.lat], zoom: Math.max(map.getZoom(), 14) });
    if (watchId != null) return;
    watchId = navigator.geolocation.watchPosition(g => {
      if (!alive) return; btn.classList.remove('busy');
      pos = { lat: g.coords.latitude, lng: g.coords.longitude };
      if (meMk) meMk.setLngLat([pos.lng, pos.lat]);
      if (map && follow) map.easeTo({ center: [pos.lng, pos.lat], duration: 600 });
      if (dist(pos, loadedAt) > Math.max(300, rad / 4)) { loadedAt = { ...pos }; load(true); }
    }, e => { btn.classList.remove('busy', 'follow'); watchId = null; toast(e.code === 1 ? 'Allow location access to see where you are' : 'Couldn’t get your location — try again outdoors'); },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  };
  $('#mqAdd', p).onclick = () => { const c = map ? map.getCenter() : null; addMosque(c ? { lat: c.lat, lng: c.lng } : pos); };
  load();
}

function infoForm(m, langs) {
  const j = (m?.jummah?.length ? m.jummah : [{}]).concat(m?.jummah?.length >= 1 && m.jummah.length < 3 ? [] : []);
  const row = (x, i) => `<div class="mq-jrow" data-j="${i}"><div><div class="faint small">Khutbah</div><input class="input" type="time" data-k value="${escAttr(x.khutbah || '')}"></div><div><div class="faint small">Salah</div><input class="input" type="time" data-s value="${escAttr(x.salah || '')}"></div><div><div class="faint small">Language</div><select class="input" data-l><option value="">—</option>${langs.map(l => `<option ${x.lang === l ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div></div>`;
  return `<label class="lbl">Jummah times</label><div id="jRows">${j.map(row).join('')}</div><button class="btn ghost sm" id="jMore">${I.plus} Another Jummah</button>
    <label class="lbl">Imam / khateeb</label><input class="input" id="fImam" maxlength="80" value="${escAttr(m?.imam || '')}" placeholder="e.g. Sheikh Ahmed">
    <label class="lbl">Other languages spoken</label><div class="chips wrap" id="fLangs">${langs.map(l => `<button class="chip ${m?.langs?.includes(l) ? 'on' : ''}" data-lg="${escAttr(l)}">${esc(l)}</button>`).join('')}</div>
    <label class="lbl">Facilities</label><div class="chips wrap">${[['women', 'Women’s area'], ['wudu', 'Wudu'], ['parking', 'Parking'], ['wheelchair', 'Wheelchair access'], ['kids', 'Kids’ classes'], ['eid', 'Eid prayer']].map(([k, l]) => `<button class="chip ${m?.facilities?.[k] ? 'on' : ''}" data-fc="${k}">${l}</button>`).join('')}</div>
    <label class="lbl">Notes</label><textarea class="input" id="fNotes" rows="2" maxlength="300" placeholder="Parking tips, entrance, women's entrance…">${esc(m?.notes || '')}</textarea>`;
}
function bindInfo(sh, langs) {
  $('#jMore', sh).onclick = () => { const n = $$('.mq-jrow', sh).length; if (n >= 4) return; const d = document.createElement('div'); d.innerHTML = infoForm({ jummah: [{}] }, langs).match(/<div class="mq-jrow"[\s\S]*?<\/select><\/div><\/div>/)[0]; $('#jRows', sh).append(d.firstElementChild); };
  $$('[data-lg],[data-fc]', sh).forEach(b => b.onclick = () => b.classList.toggle('on'));
}
function readInfo(sh) {
  return { jummah: $$('.mq-jrow', sh).map(r => ({ khutbah: $('[data-k]', r).value, salah: $('[data-s]', r).value, lang: $('[data-l]', r).value || null })).filter(j => j.khutbah || j.salah),
    imam: $('#fImam', sh).value.trim(), langs: $$('[data-lg].on', sh).map(b => b.dataset.lg), facilities: Object.fromEntries($$('[data-fc]', sh).map(b => [b.dataset.fc, b.classList.contains('on')])), notes: $('#fNotes', sh).value.trim() };
}
async function addMosque(c) {
  const { langs } = await api('/ummah/langs');
  sheet(`<h3>Add a mosque</h3><p class="muted small">It will be placed at the centre of the map. Move the map first if needed.</p>
    <label class="lbl">Name</label><input class="input" id="fName" maxlength="90" placeholder="Masjid …"><label class="lbl">Address</label><input class="input" id="fAddr" maxlength="160">
    ${infoForm(null, langs)}<button class="btn accent block" id="fSave" style="margin-top:14px">Add mosque</button>`, (sh, close) => {
    bindInfo(sh, langs);
    $('#fSave', sh).onclick = async () => { try { const r = await api('/ummah/mosques', { body: { name: $('#fName', sh).value, address: $('#fAddr', sh).value, lat: c.lat, lng: c.lng, ...readInfo(sh) } }); close(); toast('Mosque added — jazakAllahu khayran'); go('/mosque/' + r.id); } catch (e) { toast(e.message); } };
  });
}

export async function viewMosque(id) {
  const p = shell('Mosque', { back: '/mosques' }); p.innerHTML = loadingHTML();
  let d; try { d = await api('/ummah/mosques/' + encodeURIComponent(id)); } catch (e) { p.innerHTML = empty('mosque', esc(e.message)); return; }
  const m = d.mosque; const langs = [...new Set([...m.jummah.map(j => j.lang).filter(Boolean), ...m.langs])];
  p.innerHTML = `<div class="mq-hero"><div class="mq-hero-ic">${I.mosque}</div><h2>${esc(m.name)}</h2>${m.nameAr ? `<div class="ar" style="font-size:22px">${esc(m.nameAr)}</div>` : ''}<div class="faint small">${km(m.dist)}${m.address ? ' · ' + esc(m.address) : ''}</div>
      <div class="row" style="justify-content:center;gap:8px;margin-top:12px"><a class="btn accent" href="${escAttr(gDir(m))}" target="_blank" rel="noopener">${I.route} Directions</a><a class="btn ghost" href="${escAttr(gPlace(m))}" target="_blank" rel="noopener">${I.external} Google Maps</a><button class="btn ${m.fav ? 'accent' : 'ghost'}" id="mFav">${m.fav ? I.check + ' My mosque' : I.plus + ' My mosque'}</button></div></div>
    <div class="card"><h3>${I.clock} Jummah</h3>${m.jummah.length ? m.jummah.map((j, i) => `<div class="list-item"><div class="grow"><b>${m.jummah.length > 1 ? (i + 1) + ordinal(i + 1) + ' Jummah' : 'Jummah'}</b><div class="faint small">${j.khutbah ? 'Khutbah ' + esc(j.khutbah) : ''}${j.khutbah && j.salah ? ' · ' : ''}${j.salah ? 'Salah ' + esc(j.salah) : ''}</div></div>${j.lang ? `<span class="mq-langs"><span>${esc(j.lang)}</span></span>` : ''}</div>`).join('') : '<div class="muted small">No Jummah time yet. Do you know it? Add it for everyone.</div>'}
      ${m.imam ? `<div class="list-item"><div class="grow">Imam</div><b>${esc(m.imam)}</b></div>` : ''}
      ${langs.length ? `<div class="list-item"><div class="grow">Languages</div><div class="mq-langs">${langs.map(l => `<span>${esc(l)}</span>`).join('')}</div></div>` : ''}
      ${Object.entries(m.facilities).filter(([, v]) => v).length ? `<div class="chips wrap" style="margin-top:8px">${Object.entries(m.facilities).filter(([, v]) => v).map(([k]) => `<span class="mq-fac">${I.check} ${{ women: 'Women’s area', wudu: 'Wudu', parking: 'Parking', wheelchair: 'Wheelchair access', kids: 'Kids’ classes', eid: 'Eid prayer' }[k]}</span>`).join('')}</div>` : ''}
      ${m.notes ? `<p class="small" style="margin-top:8px">${esc(m.notes)}</p>` : ''}
      <div class="faint small" style="margin-top:8px">${m.verified ? `${I.check} Jummah times confirmed by ${m.verified} ${m.verified === 1 ? 'person' : 'people'}` : m.jummah.length ? 'Jummah times not confirmed by a second person yet' : ''}</div>
      <div class="row wrap" style="gap:8px;margin-top:10px"><button class="btn ghost sm" id="mEdit">${I.edit} ${m.jummah.length ? 'Update' : 'Add'} Jummah info</button>${m.jummah.length && !m.voted ? `<button class="btn ghost sm" id="mOk">${I.check} These times are correct</button>` : ''}</div></div>
    <div class="card mq-going"><div class="grow"><b>${I.flame} ${m.goers} going this Friday</b><div class="faint small">Let the Ummah know where you’ll pray Jummah</div></div><button class="btn accent sm" id="mGo">I’m going</button></div>
    ${m.phone || m.website ? `<div class="card">${m.phone ? `<a class="list-item" href="tel:${escAttr(m.phone)}"><div class="grow">${I.phone} ${esc(m.phone)}</div></a>` : ''}${m.website ? `<a class="list-item" href="${escAttr(m.website)}" target="_blank" rel="noopener"><div class="grow">${I.globe} Website</div></a>` : ''}</div>` : ''}`;
  $('#mFav').onclick = async () => { try { await api(`/ummah/mosques/${encodeURIComponent(id)}/fav`, { body: { on: !m.fav } }); toast(m.fav ? 'Removed' : 'Added to your mosques — you’ll get its Jummah time on Fridays'); viewMosque(id); } catch (e) { toast(e.message); } };
  $('#mGo').onclick = async () => { try { await api(`/ummah/mosques/${encodeURIComponent(id)}/going`, { body: {} }); vibrate(20); toast('See you at Jummah, in sha Allah'); viewMosque(id); } catch (e) { toast(e.message); } };
  $('#mOk')?.addEventListener('click', async () => { try { await api(`/ummah/mosques/${encodeURIComponent(id)}/confirm`, { body: {} }); toast('Thank you for confirming'); viewMosque(id); } catch (e) { toast(e.message); } });
  $('#mEdit').onclick = () => sheet(`<h3>${esc(m.name)}</h3>${infoForm(m, d.langs)}<button class="btn accent block" id="fSave" style="margin-top:14px">Save</button>`, (sh, close) => {
    bindInfo(sh, d.langs);
    $('#fSave', sh).onclick = async () => { try { await api('/ummah/mosques/' + encodeURIComponent(id), { method: 'PUT', body: readInfo(sh) }); close(); toast('Saved — jazakAllahu khayran'); viewMosque(id); } catch (e) { toast(e.message); } };
  });
}
const ordinal = n => ['st', 'nd', 'rd'][((n + 90) % 100 - 10) % 10 - 1] || 'th';

// ---------------- JUMMAH ----------------
function nextFriday() { const d = new Date(); const add = (5 - d.getDay() + 7) % 7; d.setDate(d.getDate() + add); return { d, today: add === 0 }; }
export async function viewJummah() {
  const p = shell('Jummah', { back: '/ummah' }); const pos = here(); const r = state.user.settings.reminders || {};
  const { d, today } = nextFriday();
  p.innerHTML = `<div class="jm-hero"><div class="jm-day">${today ? 'Today is Jumu‘ah' : 'Next Jumu‘ah'}</div><div class="jm-date">${d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <div class="jm-prog"><div class="jm-pbar"><i id="jmBar"></i></div><span id="jmCount"></span></div></div>
    <div class="card jm-sun"><h3>${I.mosque} Sunnahs of Jumu‘ah</h3><div class="faint small" style="margin-bottom:6px">Tick them off — your list resets every Friday.</div><div id="jmList">${loadingHTML()}</div></div>
    <div class="card jm-adhan"><div class="row between" style="align-items:center"><h3 style="margin:0">${I.mosque} Call to prayer (adhan)</h3><label class="toggle"><input type="checkbox" id="jaOn" ${(r.adhanMode || 'sound') === 'adhan' ? 'checked' : ''}><span></span></label></div>
      <div class="faint small" id="jaSub" style="margin:4px 0 10px">${(r.adhanMode || 'sound') === 'adhan' ? 'On — the real adhan plays at each prayer time you switch on below.' : 'Off — turn on to hear the full adhan at prayer times.'}</div>
      <div class="ja-now"><button class="ja-play" id="jaPlay" aria-label="Play adhan">${I.play}</button><div class="grow"><b>Play the adhan now</b><div class="faint small" id="jaVoiceSub"></div></div></div>
      <div id="jaMore" ${(r.adhanMode || 'sound') === 'adhan' ? '' : 'hidden'}>
        <label class="lbl">Adhan voice</label><select class="input" id="jaVoice"></select>
        <label class="lbl">Fajr adhan</label><select class="input" id="jaFajr"></select>
        <label class="lbl">Play adhan for</label><div class="ja-per">${['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].map(k => { const on = ((r.adhanPer || {})[k] || 'adhan') === 'adhan'; return `<button class="ja-pp ${on ? 'on' : ''}" data-jp="${k}">${I.check}<span>${k === 'dhuhr' ? 'Dhuhr / Jumu‘ah' : k[0].toUpperCase() + k.slice(1)}</span></button>`; }).join('')}</div>
        <label class="lbl">Volume</label><input type="range" id="jaVol" min="20" max="100" value="${Math.round((r.adhanVolume ?? 1) * 100)}" style="width:100%">
        <div class="faint small" style="margin-top:8px">The full adhan plays when Shukr is open (or when you tap the prayer notification). When your phone is locked you get a notification — phones don’t let web apps play long audio in the background.</div>
      </div></div>
    <div class="card"><div class="list-item"><div class="grow"><b>Jummah alert</b><div class="faint small">Closest mosques, khutbah times & languages on Friday</div></div><label class="toggle"><input type="checkbox" id="jOn" ${r.jummah !== false ? 'checked' : ''}><span></span></label></div>
      <label class="lbl">Notify me before Dhuhr</label><div class="seg">${[30, 60, 90, 120, 180].map(n => `<button data-jl="${n}" class="${(r.jummahLead || 60) === n ? 'on' : ''}">${n < 60 ? n + ' min' : n / 60 + ' h'}</button>`).join('')}</div>
      <label class="lbl">Search radius</label><div class="seg">${[2000, 5000, 10000, 20000].map(n => `<button data-jr="${n}" class="${(r.jummahRadius || 5000) === n ? 'on' : ''}">${n / 1000} km</button>`).join('')}</div>
      <button class="btn ghost sm" id="jTest" style="margin-top:10px">${I.play} Send me a test Jummah alert</button></div>
    <div class="row between" style="margin:14px 2px 6px"><h3 style="margin:0">Jummah near you</h3><button class="btn ghost sm" data-go="/mosques?jummah=1">${I.pin} Map</button></div>
    <div id="jList">${pos ? loadingHTML('Finding Jummah…') : empty('pin', 'Set your location to find Jummah near you.', `<div style="margin-top:12px"><button class="btn accent" id="loc">${I.pin} Use my location</button></div>`)}</div>`;
  bindGo(p);
  // Sunnah checklist (stored per Friday on this device)
  const fkey = 'jmDone.' + d.toISOString().slice(0, 10); const done = new Set(LS.get(fkey, []));
  const sunnahs = await fetch('/data/jummah-sunnah.json').then(r => r.json()).catch(() => []);
  const drawSun = () => { const el = $('#jmList', p); if (!el) return;
    el.innerHTML = sunnahs.map(x => `<div class="jm-item ${done.has(x.id) ? 'on' : ''}" data-sn="${x.id}"><button class="jm-chk" aria-label="Done">${done.has(x.id) ? I.check : ''}</button><div class="grow"><div class="jm-t"><span class="jm-ic">${I[x.icon] || ""}</span>${esc(x.title)}</div><div class="faint small">${esc(x.when)}</div><div class="jm-x" hidden><p class="small">${esc(x.text)}</p><div class="faint small">${esc(x.ref)}</div>${x.action ? `<button class="btn ghost sm" data-go="${x.action}">Open</button>` : ''}</div></div><button class="iconbtn sm jm-more" aria-label="More">${I.info}</button></div>`).join('');
    const n = sunnahs.filter(x => done.has(x.id) && x.id !== 'no-fast-alone').length, t = sunnahs.length - 1;
    $('#jmBar', p).style.width = Math.round(n / t * 100) + '%'; $('#jmCount', p).textContent = `${n}/${t} sunnahs`;
    $$('.jm-chk', el).forEach(b => b.onclick = () => { const id = b.closest('[data-sn]').dataset.sn; done.has(id) ? done.delete(id) : done.add(id); LS.set(fkey, [...done]); vibrate(12); drawSun(); });
    $$('.jm-more', el).forEach(b => b.onclick = () => { const x = $('.jm-x', b.closest('[data-sn]')); x.hidden = !x.hidden; });
    bindGo(el); };
  drawSun();
  const saveR = async patch => { try { await saveSettings({ reminders: patch }); } catch (e) { toast(e.message); } };
  $('#jOn').onchange = e => saveR({ jummah: e.target.checked });
  $$('[data-jl]', p).forEach(b => b.onclick = () => { saveR({ jummahLead: +b.dataset.jl }); $$('[data-jl]', p).forEach(x => x.classList.toggle('on', x === b)); });
  $$('[data-jr]', p).forEach(b => b.onclick = () => { saveR({ jummahRadius: +b.dataset.jr }); $$('[data-jr]', p).forEach(x => x.classList.toggle('on', x === b)); loadList(+b.dataset.jr); });
  // ---- Adhan card ----
  { const list = await adhanVoices(), R = () => state.user.settings.reminders || {};
    const opts = sel => list.map(v => `<option value="${v.id}" ${v.id === sel ? 'selected' : ''}>${esc(v.label)} — ${esc(v.sub)}</option>`).join('');
    $('#jaVoice', p).innerHTML = opts(R().adhanVoice || 'madinah'); $('#jaFajr', p).innerHTML = opts(R().fajrVoice || 'fajr-ramadan');
    const vsub = () => { const v = list.find(x => x.id === $('#jaVoice', p).value) || list[0]; $('#jaVoiceSub', p).textContent = `${v.label} · ${Math.round(v.secs / 60 * 10) / 10} min`; }; vsub();
    const playing = () => document.documentElement.classList.contains('adhan-playing');
    const setBtn = () => { const b = $('#jaPlay', p); if (b) { b.innerHTML = playing() ? I.stop : I.play; b.classList.toggle('on', playing()); } };
    $('#jaPlay', p).onclick = async () => { if (playing()) { stopAdhan(); setBtn(); return; } await playAdhan($('#jaVoice', p).value, { prayer: nextFriday().today ? 'jumu‘ah' : null }); setBtn(); };
    const mo = new MutationObserver(setBtn); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] }); onCleanup(() => mo.disconnect());
    $('#jaOn', p).onchange = async e => { const on = e.target.checked; await saveR({ adhanMode: on ? 'adhan' : 'sound', ...(on ? { prayers: true } : {}) }); $('#jaMore', p).hidden = !on;
      $('#jaSub', p).textContent = on ? 'On — the real adhan plays at each prayer time you switch on below.' : 'Off — turn on to hear the full adhan at prayer times.'; vibrate(12); toast(on ? 'Adhan on' : 'Adhan off'); };
    $('#jaVoice', p).onchange = e => { saveR({ adhanVoice: e.target.value }); vsub(); };
    $('#jaFajr', p).onchange = e => saveR({ fajrVoice: e.target.value });
    $('#jaVol', p).onchange = e => saveR({ adhanVolume: +e.target.value / 100 });
    $$('[data-jp]', p).forEach(b => b.onclick = async () => { const on = !b.classList.contains('on'); b.classList.toggle('on', on); vibrate(8); await saveR({ adhanPer: { ...(R().adhanPer || {}), [b.dataset.jp]: on ? 'adhan' : 'sound' } }); });
  }
  $('#jTest').onclick = async () => { try { await api('/push/test', { body: { kind: 'jummah' } }); toast('Test Jummah alert sent'); } catch (e) { toast(e.message); } };
  $('#loc')?.addEventListener('click', () => locate().then(viewJummah).catch(e => toast(e.message)));
  async function loadList(rad = r.jummahRadius || 5000) {
    if (!pos) return; const el = $('#jList', p); el.innerHTML = loadingHTML('Finding Jummah…');
    try { const [{ mosques }, hs] = await Promise.all([api(`/ummah/mosques?lat=${pos.lat}&lng=${pos.lng}&r=${rad}`), api(`/ummah/hotspots?lat=${pos.lat}&lng=${pos.lng}`).catch(() => ({ hotspots: [] }))]);
      const goers = new Map(hs.hotspots.map(h => [h.id, h.goers]));
      const list = mosques.map(m => ({ ...m, goers: goers.get(m.id) || 0 })).sort((a, b) => (b.jummah.length > 0) - (a.jummah.length > 0) || a.dist - b.dist).slice(0, 25);
      el.innerHTML = list.length ? list.map(mosqueCard).join('') : `<div class="empty small">No mosques found within ${rad / 1000} km. Try a wider radius or add one from the map.</div>`;
      $$('[data-mq]', el).forEach(c => c.onclick = () => go('/mosque/' + encodeURIComponent(c.dataset.mq)));
    } catch (e) { el.innerHTML = `<div class="empty small">${esc(e.message)}</div>`; }
  }
  loadList();
}

// ---------------- UMMAH HUB ----------------
export async function viewUmmahHub() {
  const p = shell('Ummah'); const pos = here(); const { d, today } = nextFriday();
  p.innerHTML = `<div class="um-hero"><div class="um-t">One Ummah</div><div class="um-s">Prayer, Jummah and mosques — together, wherever you are.</div></div>
    <div class="um-grid">
      <button class="um-tile jm" data-go="/jummah"><span>${I.mosque}</span><b>Jummah</b><small>${today ? 'Today' : d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</small></button>
      <button class="um-tile mq" data-go="/mosques"><span>${I.pin}</span><b>Mosque map</b><small>Find & add mosques</small></button>
      <button class="um-tile ad" data-go="/prayer"><span>${I.clock}</span><b>Adhan & prayer</b><small>Times and adhan sound</small></button>
      <button class="um-tile cm" data-go="/ummah/feed"><span>${I.users}</span><b>Community</b><small>Posts from the Ummah</small></button>
    </div>
    <h3 style="margin:18px 2px 8px">${I.flame} Jummah hotspots near you</h3><div id="umHot">${pos ? loadingHTML() : empty('pin', 'Set your location to see Jummah hotspots.', `<div style="margin-top:12px"><button class="btn accent" id="loc">${I.pin} Use my location</button></div>`)}</div>`;
  bindGo(p); $('#loc')?.addEventListener('click', () => locate().then(viewUmmahHub).catch(e => toast(e.message)));
  if (!pos) return;
  try { const h = await api(`/ummah/hotspots?lat=${pos.lat}&lng=${pos.lng}`); const el = $('#umHot', p); if (!el) return;
    el.innerHTML = h.hotspots.length ? h.hotspots.map(mosqueCard).join('') + `<div class="faint small" style="margin:8px 2px">${h.total} mosques within 25 km · ${h.withJummah} with Jummah times</div>`
      : `<div class="card soft"><b>Be the first in your area.</b><div class="small muted" style="margin:6px 0 10px">Add the Jummah time, imam and khutbah language of your mosque — every Muslim nearby gets it in their Friday alert.</div><button class="btn accent sm" data-go="/mosques">${I.pin} Open the map</button></div>`;
    bindGo(el); $$('[data-mq]', el).forEach(c => c.onclick = () => go('/mosque/' + encodeURIComponent(c.dataset.mq)));
  } catch (e) { $('#umHot', p).innerHTML = `<div class="empty small">${esc(e.message)}</div>`; }
}
