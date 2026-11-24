// Worship+ : Istighfar counter, Sunnah tracker (daily/weekly/monthly), How to pray guide, Halal food near me.
import { $, $$, esc, escAttr, I, api, state, toast, vibrate, shell, bindGo, loadJSON, askAlim, ring, confirmSheet, loadingHTML, LS, onCleanup } from '../core.js';

const quran = () => Promise.all([loadJSON('/data/quran-ar.json'), loadJSON('/data/quran-en-pickthall.json')]);
const day = d => new Date(d + 'T12:00:00').toLocaleDateString([], { weekday: 'short', day: 'numeric' });

// ================= ISTIGHFAR =================
export async function viewIstighfar() {
  const p = shell('Istighfar');
  p.innerHTML = loadingHTML();
  const [data, s0, [AR, EN]] = await Promise.all([loadJSON('/data/wp-istighfar.json'), api('/worship-plus/istighfar'), quran()]);
  let s = s0, pending = 0, timer = null, saving = Promise.resolve();
  const F = id => data.formulas.find(f => f.id === id) || data.formulas[1];
  const flush = () => { if (!pending) return saving; const n = pending; pending = 0;
    saving = saving.then(() => api('/worship-plus/istighfar', { body: { add: n } })).then(r => { s = { ...r, count: r.count + pending }; paintStats(); }).catch(e => toast(e.message)); return saving; };
  const benefits = data.benefits.map(b => `<div class="wp-ben"><div class="wp-ben-h">${esc(b.head)}</div>${b.intro ? `<p class="muted small">${esc(b.intro)}</p>` : ''}
    <div class="ar wp-ar" lang="ar">${b.a.map(a => esc(AR[b.s - 1][a - 1]) + ` ﴿${a.toLocaleString('ar-EG')}﴾`).join(' ')}</div>
    <p class="wp-en">${b.a.map(a => esc(EN[b.s - 1][a - 1])).join(' ')}</p><div class="faint small">Quran ${b.s}:${b.a[0]}${b.a.length > 1 ? '–' + b.a[b.a.length - 1] : ''} · Pickthall</div></div>`).join('');
  p.innerHTML = `
    <div class="wp-hero wp-ist">
      <div class="wp-hero-top"><span class="wp-pill">${I.flame} <b id="wStreak">0</b> day streak</span><span class="wp-pill">${I.star} Best <b id="wBest">0</b></span></div>
      <button class="wp-tap" id="wTap" aria-label="Count one istighfar">
        <svg viewBox="0 0 220 220" class="wp-tap-ring"><circle cx="110" cy="110" r="98" class="wp-tr-bg"/><circle cx="110" cy="110" r="98" class="wp-tr-fg" id="wArc" stroke-dasharray="616" stroke-dashoffset="616"/></svg>
        <span class="wp-tap-in"><b id="wCount">0</b><small>of <span id="wTarget">100</span></small><em>Tap anywhere in this box</em></span>
      </button>
      <div class="wp-life"><span>Lifetime istighfar</span><b id="wLife">0</b><div class="wp-lbar"><i id="wLbar"></i></div><small id="wLnext"></small></div>
      <div class="ar wp-phrase" lang="ar" id="wAr"></div><div class="wp-phrase-tr" id="wTr"></div>
      <div class="wp-hero-foot"><div class="seg wp-seg" id="wTargets">${[33, 70, 100, 1000].map(t => `<button data-t="${t}">${t}</button>`).join('')}</div><button class="iconbtn" id="wReset" aria-label="Reset today">${I.retry}</button></div>
    </div>
    <div class="grid3"><div class="kpi"><div class="n" id="wToday">0</div><div class="l">Today</div></div><div class="kpi"><div class="n" id="wTotal">0</div><div class="l">This week</div></div><div class="kpi"><div class="n" id="wDays">0</div><div class="l">Goal days (30d)</div></div></div>
    <div class="card"><h3>Last 30 days</h3><div class="wp-bars" id="wBars"></div></div>
    ${gemHTML(data.gem, AR, EN)}
    <div class="card"><h3>Words of istighfar</h3><p class="muted small">Tap one to make it your counter phrase.</p><div id="wForms"></div></div>
    <button class="btn ghost block" id="wAsk">${I.chat} Ask Alim about istighfar</button>`;
  bindGem(p, data, id => { s.phrase = id; api('/worship-plus/prefs', { method: 'PUT', body: { phrase: id } }).catch(() => {}); paintPhrase(); paintStats(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  const paintPhrase = () => { const f = F(s.phrase); $('#wAr').textContent = f.ar.length > 60 ? f.ar.slice(0, 60).replace(/\s\S*$/, '') + ' …' : f.ar; $('#wTr').textContent = f.short || f.tr; };
  function paintStats() {
    const n = s.count + pending, t = s.target;
    $('#wCount').textContent = n.toLocaleString(); $('#wTarget').textContent = t; $('#wToday').textContent = n.toLocaleString(); $('#wTotal').textContent = ((s.history || []).slice(-7).reduce((a, h) => a + (h.n || 0), 0) + pending).toLocaleString();
    { const life = s.total + pending, M = [100, 1000, 3300, 10000, 33000, 100000, 330000, 1000000, 10000000], nx = M.find(m => m > life) || life + 1, pv = [...M].reverse().find(m => m <= life) || 0;
      $('#wLife').textContent = life.toLocaleString(); $('#wLbar').style.width = Math.min(100, (life - pv) / (nx - pv) * 100) + '%'; $('#wLnext').textContent = `${(nx - life).toLocaleString()} to ${nx.toLocaleString()}`; }
    $('#wArc').setAttribute('stroke-dashoffset', 616 - 616 * Math.min(1, n / t)); $('#wTap').classList.toggle('done', n >= t); $('#wStreak').textContent = s.streak; $('#wBest').textContent = s.best;
    $('#wDays').textContent = s.history.filter(h => h.n >= h.target).length;
    $$('#wTargets button').forEach(b => b.classList.toggle('on', +b.dataset.t === t));
    const max = Math.max(...s.history.map(h => h.n), t, 1);
    $('#wBars').innerHTML = s.history.map(h => `<i title="${escAttr(h.d)}: ${h.n}" class="${h.n >= h.target ? 'met' : ''}" style="height:${Math.max(3, h.n / max * 100)}%"></i>`).join('');
    $('#wForms').innerHTML = data.formulas.map(f => `<button class="wp-form ${f.id === s.phrase ? 'on' : ''}" data-ph="${escAttr(f.id)}"><div class="wp-form-h"><b>${esc(f.title)}</b>${f.id === s.phrase ? `<span class="badge green">Active</span>` : ''}</div>
      ${f.tag ? `<div class="faint small">${esc(f.tag)}</div>` : ''}<div class="ar wp-ar" lang="ar">${esc(f.ar)}</div><div class="wp-tl">${esc(f.tr)}</div><div class="wp-en">${esc(f.en)}</div>
      ${f.note ? `<div class="muted small">${esc(f.note)}</div>` : ''}<div class="wp-ref">${esc(f.ref)}</div></button>`).join('');
    $$('[data-ph]', p).forEach(b => b.onclick = async () => { await flush(); const r = await api('/worship-plus/prefs', { method: 'PUT', body: { phrase: b.dataset.ph } }); s.phrase = r.prefs.phrase; paintPhrase(); paintStats(); toast('Counter phrase updated'); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }
  paintPhrase(); paintStats();
  $('#wTap').onclick = () => {
    pending++; const n = s.count + pending; vibrate(n === s.target ? [30, 60, 30] : 10);
    $('#wTap').classList.remove('pop'); void $('#wTap').offsetWidth; $('#wTap').classList.add('pop');
    if (n === s.target) toast('Goal reached — may Allah forgive us all 🤍');
    paintStats(); clearTimeout(timer); timer = setTimeout(flush, 900);
  };
  $$('#wTargets button').forEach(b => b.onclick = async () => { await flush(); await api('/worship-plus/prefs', { method: 'PUT', body: { istTarget: +b.dataset.t } }); s = await api('/worship-plus/istighfar'); paintStats(); });
  $('#wReset').onclick = async () => { if (!await confirmSheet('Reset today?', 'Today’s count goes back to zero.', 'Reset', true)) return; pending = 0; s = await api('/worship-plus/istighfar', { body: { reset: true } }); paintStats(); };
  $('#wAsk').onclick = () => askAlim('Teach me about istighfar: its virtues, the best words, and how to make it a daily habit.');
  window.addEventListener('pagehide', flush, { once: true }); window.addEventListener('hashchange', flush, { once: true });
}

// ================= SUNNAH TRACKER =================
export async function viewSunnah(q) {
  const p = shell('Sunnah tracker');
  p.innerHTML = loadingHTML();
  const [data, s0] = await Promise.all([loadJSON('/data/wp-sunnah.json'), api('/worship-plus/sunnah')]);
  let s = s0, tab = ['daily', 'weekly', 'monthly'].includes(q?.get('tab')) ? q.get('tab') : 'daily', editing = false;
  const LBL = { daily: 'Today', weekly: 'This week', monthly: 'This month' };
  function paint() {
    const hid = new Set(s.hidden), items = data[tab].filter(i => editing || !hid.has(i.id));
    const vis = data[tab].filter(i => !hid.has(i.id)), doneN = vis.filter(i => (s.done[tab][i.id] || 0) >= (i.target || 1)).length;
    const pct = vis.length ? Math.round(doneN / vis.length * 100) : 0;
    p.innerHTML = `
      <div class="wp-hero wp-sun"><div class="row between" style="align-items:center;gap:14px">${ring(pct, 92, 8, pct + '%')}
        <div class="grow"><div class="wp-hero-k">${LBL[tab]}</div><div class="wp-hero-big">${doneN} of ${vis.length} sunnahs</div>
        <div class="wp-pill">${I.flame} <b>${s.streak}</b> full-day streak</div></div></div></div>
      <div class="seg" style="margin:12px 0">${['daily', 'weekly', 'monthly'].map(t => `<button data-tab="${t}" class="${t === tab ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
      <div class="wp-list">${items.map(it => { const n = s.done[tab][it.id] || 0, T = it.target || 1, ok = n >= T, h = hid.has(it.id);
        return `<div class="wp-item ${ok ? 'done' : ''} ${h ? 'hid' : ''}"><button class="wp-check" data-it="${escAttr(it.id)}" aria-label="${escAttr(it.t)}">${ok ? I.check : T > 1 ? `<small>${n}/${T}</small>` : ''}</button>
          <div class="grow"><div class="wp-it-t">${esc(it.t)}</div><div class="wp-it-b">${esc(it.b)}</div><div class="wp-ref">${esc(it.ref)}</div></div>
          ${editing ? `<button class="chip ${h ? '' : 'on'}" data-hide="${escAttr(it.id)}">${h ? 'Show' : 'Shown'}</button>` : ''}</div>`; }).join('')}</div>
      <button class="btn ghost block" id="sEdit" style="margin-top:8px">${editing ? 'Done' : `${I.sliders} Choose which sunnahs to track`}</button>
      ${tab === 'daily' ? `<div class="card" style="margin-top:12px"><h3>Last 14 days</h3><div class="wp-bars wp-bars14">${s.history.map(h => `<div class="wp-b14"><i class="${h.total && h.done >= h.total ? 'met' : ''}" style="height:${h.total ? Math.max(4, h.done / h.total * 100) : 4}%"></i><span>${esc(day(h.d).split(' ')[0].slice(0, 2))}</span></div>`).join('')}</div></div>` : ''}
      <button class="btn ghost block" id="sAsk" style="margin-top:8px">${I.chat} Ask Alim about a sunnah</button>`;
    $$('[data-tab]', p).forEach(b => b.onclick = () => { tab = b.dataset.tab; paint(); });
    $$('[data-it]', p).forEach(b => b.onclick = async () => {
      const it = data[tab].find(x => x.id === b.dataset.it), T = it.target || 1, n = s.done[tab][it.id] || 0, nx = n >= T ? 0 : n + 1;
      s.done[tab][it.id] = nx; vibrate(nx >= T ? [15, 40, 15] : 10); paint();
      try { s = await api('/worship-plus/sunnah', { body: { item: it.id, n: nx } }); paint(); } catch (e) { toast(e.message); }
    });
    $$('[data-hide]', p).forEach(b => b.onclick = async () => { const set = new Set(s.hidden); set.has(b.dataset.hide) ? set.delete(b.dataset.hide) : set.add(b.dataset.hide);
      await api('/worship-plus/prefs', { method: 'PUT', body: { hidden: [...set] } }); s = await api('/worship-plus/sunnah'); paint(); });
    $('#sEdit').onclick = () => { editing = !editing; paint(); };
    $('#sAsk').onclick = () => askAlim('Which sunnahs should I add to my daily routine, and what are their rewards?');
  }
  paint();
}

// ================= HOW TO PRAY =================
const fig = (pose) => {
  const P = {
    stand: '<circle cx="50" cy="16" r="8"/><path d="M50 25v38M50 63l-8 30M50 63l8 30M50 34l-12 18M50 34l12 18"/>',
    takbir: '<circle cx="50" cy="16" r="8"/><path d="M50 25v38M50 63l-8 30M50 63l8 30M50 32l-14-6-2-12M50 32l14-6 2-12"/>',
    qiyam: '<circle cx="50" cy="16" r="8"/><path d="M50 25v38M50 63l-8 30M50 63l8 30M50 34l-10 12 14 2M50 34l10 12-6 2"/>',
    ruku: '<circle cx="22" cy="40" r="8"/><path d="M30 44h34M64 44l-4 49M64 44l4 49M34 44l2 22M44 44l6 22"/>',
    sujud: '<circle cx="18" cy="82" r="7"/><path d="M25 80l30-26M55 54l26 30M81 84l8 9M28 82l8 10M40 70l4 22"/>',
    sit: '<circle cx="44" cy="22" r="8"/><path d="M44 31v34M44 65l26 2M70 67l-6 24M44 65l-8 26h30M44 40l12 18M44 40l-6 22"/>',
    salam: '<circle cx="44" cy="22" r="8"/><path d="M44 31v34M44 65l26 2M70 67l-6 24M44 65l-8 26h30M44 40l12 18M44 40l-6 22"/><path d="M58 14q8 8 0 16" opacity=".7"/>',
  };
  return `<svg viewBox="0 0 100 100" class="wp-fig" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${P[pose] || P.stand}</svg>`;
};
const WUDU = [['Intention', 'Intend in your heart to make wudu, and say “Bismillah”.'], ['Hands', 'Wash both hands up to the wrists three times.'], ['Mouth', 'Rinse the mouth three times.'], ['Nose', 'Sniff water into the nose and blow it out, three times.'],
  ['Face', 'Wash the whole face three times, from hairline to chin and ear to ear.'], ['Arms', 'Wash the right arm up to and including the elbow three times, then the left.'], ['Head', 'Wipe over the head once with wet hands, front to back and back again.'],
  ['Ears', 'Wipe the inside and back of the ears once.'], ['Feet', 'Wash the right foot up to and including the ankle three times, then the left.'], ['Dua', 'Finish with the testimony of faith (Sahih Muslim 234).']];
const STEPS = [
  ['takbir', 'Takbir', 'Face the qibla, raise your hands and begin.', 'اللَّهُ أَكْبَرُ', 'Allahu akbar', 'Allah is the Greatest.'],
  ['qiyam', 'Standing (qiyam)', 'Recite al-Fatiha in every rak‘ah, then more Quran in the first two.', null, null, null, 'fatiha'],
  ['ruku', 'Bowing (ruku‘)', 'Bow with a straight back, hands on knees.', 'سُبْحَانَ رَبِّيَ الْعَظِيمِ', 'Subhana rabbiyal-‘azim (×3)', 'Glory be to my Lord, the Most Great.'],
  ['stand', 'Rising (i‘tidal)', 'Stand up straight again.', 'سَمِعَ اللَّهُ لِمَنْ حَمِدَهُ ، رَبَّنَا وَلَكَ الْحَمْدُ', 'Sami‘allahu liman hamidah, rabbana wa lakal-hamd', 'Allah hears whoever praises Him. Our Lord, to You belongs all praise.'],
  ['sujud', 'Prostration (sujud)', 'Forehead, nose, palms, knees and toes on the ground.', 'سُبْحَانَ رَبِّيَ الْأَعْلَى', 'Subhana rabbiyal-a‘la (×3)', 'Glory be to my Lord, the Most High.'],
  ['sit', 'Sitting between (jalsa)', 'Sit briefly, then make a second sujud.', 'رَبِّ اغْفِرْ لِي', 'Rabbighfir li', 'My Lord, forgive me.'],
  ['sit', 'Tashahhud', 'After every second rak‘ah, and in the last sitting, recite the tashahhud (and in the last, salawat on the Prophet ﷺ).', 'التَّحِيَّاتُ لِلَّهِ وَالصَّلَوَاتُ وَالطَّيِّبَاتُ…', 'At-tahiyyatu lillahi was-salawatu wat-tayyibat…', 'All greetings, prayers and good things are for Allah… (Sahih al-Bukhari 831)'],
  ['salam', 'Ending (taslim)', 'Turn your head to the right, then to the left.', 'السَّلَامُ عَلَيْكُمْ وَرَحْمَةُ اللَّهِ', 'As-salamu ‘alaykum wa rahmatullah', 'Peace and the mercy of Allah be upon you.'],
];
export async function viewSalahGuide() {
  const p = shell('How to pray');
  const [AR, EN] = await quran();
  p.innerHTML = `
    <div class="wp-hero wp-salah"><div class="wp-hero-k">Step by step</div><div class="wp-hero-big">The five daily prayers</div><p class="small" style="opacity:.9;margin:6px 0 0">A simple, beginner-friendly guide. Ways of praying differ slightly between the schools of law — all of the main ones are valid.</p></div>
    <div class="card"><h3>Rak‘at in each prayer</h3><table class="wp-tab"><tr><th>Prayer</th><th>Fard</th><th>Sunnah (confirmed)</th></tr>
      ${[['Fajr', 2, '2 before'], ['Dhuhr', 4, '4 before, 2 after'], ['Asr', 4, '—'], ['Maghrib', 3, '2 after'], ['Isha', 4, '2 after, then Witr']].map(r => `<tr><td>${r[0]}</td><td><b>${r[1]}</b></td><td>${r[2]}</td></tr>`).join('')}</table>
      <div class="wp-ref">Confirmed sunnah prayers: Sahih Muslim 728; Jami‘ at-Tirmidhi 415</div></div>
    <div class="card"><h3>First, wudu</h3><ol class="wp-ol">${WUDU.map(([h, d]) => `<li><b>${h}</b><span>${d}</span></li>`).join('')}</ol><div class="wp-ref">Description of wudu: Sahih al-Bukhari 159; Quran 5:6</div></div>
    <h3 style="margin:16px 4px 8px">The prayer</h3>
    ${STEPS.map(([pose, h, d, ar, tl, en, special], i) => `<div class="wp-step"><div class="wp-step-fig">${fig(pose)}<span>${i + 1}</span></div><div class="grow"><b>${h}</b><p class="muted small">${d}</p>
      ${special === 'fatiha' ? `<div class="ar wp-ar" lang="ar">${AR[0].map((a, j) => esc(a) + ` ﴿${(j + 1).toLocaleString('ar-EG')}﴾`).join(' ')}</div><p class="wp-en">${EN[0].map(esc).join(' ')}</p><div class="wp-ref">Surah al-Fatiha · Pickthall</div>`
        : `<div class="ar wp-ar" lang="ar">${esc(ar)}</div><div class="wp-tl">${esc(tl)}</div><div class="wp-en">${esc(en)}</div>`}</div></div>`).join('')}
    <div class="card"><h3>Small differences you may notice</h3><ul class="wp-ul">
      <li>Where the hands rest while standing (on the chest, below the chest or by the sides) differs between the schools.</li>
      <li>Raising the hands again before and after ruku‘ is done by some schools and not others.</li>
      <li>Saying “Amin” aloud after al-Fatiha in congregation differs too.</li></ul>
      <p class="muted small">Follow what your local mosque or teacher follows. If in doubt, ask a scholar.</p></div>
    <div class="grid2"><button class="btn ghost" data-go="/prayer">${I.clock} Prayer times</button><button class="btn ghost" data-go="/scholars">${I.cap} Ask a scholar</button></div>`;
  bindGo(p);
}

// ================= HALAL FOOD NEAR ME =================
// Uses the live GPS position when the user taps "Use my current location" (kept for this session), otherwise the
// saved prayer location. Every async write checks `alive` so a late response can't overwrite another page.
const HALAL_GPS = 'shukr.halalHere';
function gpsHere() { try { const h = JSON.parse(sessionStorage.getItem(HALAL_GPS) || 'null'); return h && Date.now() - h.t < 30 * 60000 ? h : null; } catch { return null; } }
function currentPosition() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('Location isn’t available on this device — set your city in Settings'));
    const ok = pos => res({ lat: +pos.coords.latitude.toFixed(5), lng: +pos.coords.longitude.toFixed(5), acc: Math.round(pos.coords.accuracy || 0), t: Date.now() });
    const fail = e => rej(new Error(e && e.code === 1 ? 'Location permission is off — allow it in your browser settings, then try again' : 'Couldn’t get your location — check GPS is on and try again'));
    // fast fix first (network/wifi), fall back to a high-accuracy GPS fix
    navigator.geolocation.getCurrentPosition(ok, e => e && e.code === 1 ? fail(e) : navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }), { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 });
  });
}
export async function viewHalalPlaces() {
  const p = shell('Halal food near me');
  let km = [1, 3, 5, 10].includes(LS.get('halalKm', 3)) ? LS.get('halalKm', 3) : 3, kind = 'all', r = null, tries = 0, alive = true, seq = 0, poll = null, here = gpsHere();
  onCleanup(() => { alive = false; clearTimeout(poll); });
  const where = () => here ? `Near your current location${here.acc > 1000 ? ' (approximate)' : ''}` : state.user?.settings?.city ? `Near ${state.user.settings.city}` : 'Near your saved location';
  const locBtn = (busy) => `<button class="btn ghost sm wp-locbtn" id="hHere" ${busy ? 'disabled' : ''}>${I.compass} ${busy ? 'Locating…' : here ? 'Update my location' : 'Use my current location'}</button>`;
  const head = (big, busy) => `<div class="wp-hero wp-halal"><div class="wp-hero-k">${esc(where())} · within ${km} km</div><div class="wp-hero-big">${big}</div></div>
    <div class="row wp-locrow">${locBtn(busy)}${here ? `<button class="btn ghost sm" id="hSaved">Use saved location</button>` : ''}</div>`;
  const skel = (busy) => head('Finding halal places…', busy) + Array.from({ length: 4 }, () => '<div class="card wp-place wp-skel"><i></i><i></i><i></i></div>').join('');
  function bindLoc() {
    const b = $('#hHere', p); if (b) b.onclick = useHere;
    const s = $('#hSaved', p); if (s) s.onclick = () => { here = null; sessionStorage.removeItem(HALAL_GPS); r = null; tries = 0; load(); };
  }
  async function useHere() {
    const b = $('#hHere', p); if (b) { b.disabled = true; b.innerHTML = `${I.compass} Locating…`; }
    try { here = await currentPosition(); if (!alive) return; sessionStorage.setItem(HALAL_GPS, JSON.stringify(here)); r = null; tries = 0; vibrate(10); load(); }
    catch (e) { if (!alive) return; toast(e.message, 4000); if (b) { b.disabled = false; b.innerHTML = `${I.compass} ${here ? 'Update my location' : 'Use my current location'}`; } }
  }
  async function load() {
    clearTimeout(poll); const my = ++seq;
    if (!r) { p.innerHTML = skel(); bindLoc(); }
    let res;
    try { res = await api(`/worship-plus/halal?km=${km}` + (here ? `&lat=${here.lat}&lng=${here.lng}` : '')); }
    catch (e) {
      if (!alive || my !== seq) return;
      if (e.data?.needLocation || /location/i.test(e.message)) {
        p.innerHTML = `<div class="empty"><div class="e">${I.pin}</div><h3>Where are you?</h3><p class="muted">Share your location to find halal food near you.</p>${locBtn(false).replace('btn ghost sm', 'btn accent')}</div>`; bindLoc(); return;
      }
      if (e.status === 429) { poll = setTimeout(() => alive && load(), 2500); return; }
      p.innerHTML = head('Couldn’t load places') + `<div class="empty"><p class="muted">${esc(e.message)}</p><button class="btn" id="hRetry">Try again</button></div>`; bindLoc(); $('#hRetry', p).onclick = () => { r = null; tries = 0; load(); }; return;
    }
    if (!alive || my !== seq) return;
    if (res.pending) {
      r = null;
      if (++tries > 24) { p.innerHTML = head('The map is slow right now') + `<div class="empty"><p class="muted">The map service didn’t answer in time. Please try again in a minute.</p><button class="btn" id="hRetry">Try again</button></div>`; bindLoc(); $('#hRetry', p).onclick = () => { tries = 0; load(); }; return; }
      p.innerHTML = skel() + `<p class="muted small" style="text-align:center">Searching the map for the first time in this area — this takes up to a minute once, then it’s instant.</p>`; bindLoc();
      poll = setTimeout(() => alive && load(), 2500); return;
    }
    tries = 0; r = res; if (kind !== 'all' && !r.places.some(x => x.kind === kind)) kind = 'all'; draw();
  }
  function draw() {
    const kinds = [...new Set(r.places.map(x => x.kind))];
    const list = r.places.filter(x => kind === 'all' || x.kind === kind);
    const LB = { restaurant: 'Restaurants', fast_food: 'Fast food', cafe: 'Cafés', butcher: 'Butchers', shop: 'Shops' };
    const LB1 = { restaurant: 'Restaurant', fast_food: 'Fast food', cafe: 'Café', butcher: 'Butcher', shop: 'Shop' };
    const dist = m => m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
    const site = u => { try { const x = new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };
    const tel = x => (x.phone || '').split(/[;,]/)[0].replace(/[^\d+]/g, '');
    p.innerHTML = head(`${r.places.length} halal place${r.places.length === 1 ? '' : 's'}`) + `
      <div class="chips">${[1, 3, 5, 10].map(k => `<button class="chip ${k === km ? 'on' : ''}" data-km="${k}">${k} km</button>`).join('')}</div>
      ${kinds.length > 1 ? `<div class="chips"><button class="chip ${kind === 'all' ? 'on' : ''}" data-k="all">All</button>${kinds.map(k => `<button class="chip ${k === kind ? 'on' : ''}" data-k="${escAttr(k)}">${esc(LB[k] || k)}</button>`).join('')}</div>` : ''}
      ${list.length ? list.map(x => `<div class="card wp-place"><div class="row between"><div class="grow"><b>${esc(x.name)}</b>
          <div class="faint small">${esc(LB1[x.kind] || x.kind || '')}${x.cuisine.length ? ' · ' + esc(x.cuisine.join(', ')) : ''}${x.halal === 'only' ? ' · fully halal' : ''}</div>
          ${x.address ? `<div class="muted small">${esc(x.address)}</div>` : ''}${x.hours ? `<div class="muted small">${I.clock} ${esc(x.hours)}</div>` : ''}</div>
          <span class="badge">${dist(x.dist)}</span></div>
        <div class="row" style="gap:8px;margin-top:10px"><a class="btn accent sm grow" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${x.lat},${x.lng}">${I.route} Go</a>
          <a class="btn ghost sm grow" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(x.name)}%20${x.lat}%2C${x.lng}">${I.pin} Maps</a>
          ${tel(x) ? `<a class="btn ghost sm" href="tel:${escAttr(tel(x))}" aria-label="Call">${I.phone}</a>` : ''}
          ${x.website && site(x.website) ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="${escAttr(site(x.website))}" aria-label="Website">${I.globe || I.link || 'Web'}</a>` : ''}</div></div>`).join('')
        : `<div class="empty"><p class="muted">${km < 10 ? 'No halal places are tagged on the map within ' + km + ' km. Try a bigger radius.' : 'No halal places are tagged on the map near here yet.'}</p>${km < 10 ? `<button class="btn" data-km="${km < 3 ? 3 : km < 5 ? 5 : 10}">Search ${km < 3 ? 3 : km < 5 ? 5 : 10} km</button>` : ''}</div>`}
      <p class="faint small" style="text-align:center;margin:14px 8px">Halal status comes from OpenStreetMap — please confirm with the restaurant.<br>Map data © OpenStreetMap contributors</p>`;
    bindLoc();
    $$('[data-km]', p).forEach(b => b.onclick = () => { km = +b.dataset.km; LS.set('halalKm', km); tries = 0; load(); });
    $$('[data-k]', p).forEach(b => b.onclick = () => { kind = b.dataset.k; draw(); });
  }
  load();
}

export const routes = [
  [/^\/istighfar$/, () => viewIstighfar(), 'istighfar'],
  [/^\/sunnah$/, (m, q) => viewSunnah(q), 'sunnah'],
  [/^\/salah-guide$/, () => viewSalahGuide(), 'salahguide'],
  [/^\/halal-places$/, () => viewHalalPlaces(), 'halalplaces'],
];


// ===== Istighfar & Tahajjud secrets — the gem of Shukr (Qur'an + sahih hadith; weak narrations labelled) =====
function gemHTML(G, AR, EN) {
  if (!G) return '';
  const day = new Date().toISOString().slice(0, 10), done = LS.get('ist.plan.' + day, {});
  const n = G.plan.filter(x => done[x.id]).length;
  const ay = b => `<div class="ar ist-ar" lang="ar">${b.a.map(a => esc(AR[b.s - 1][a - 1]) + ` ﴿${a.toLocaleString('ar-EG')}﴾`).join(' ')}</div><p class="ist-en">${b.a.map(a => esc(EN[b.s - 1][a - 1])).join(' ')}</p><div class="ist-ref">Qur’an ${b.s}:${b.a[0]}${b.a.length > 1 ? '–' + b.a[b.a.length - 1] : ''}</div>`;
  return `<section class="ist-gem">
    <div class="ist-hero"><div class="ist-gemic">${I.gem || I.sparkle}</div><small>The gem of Shukr</small><h2>Istighfar & Tahajjud secrets</h2>
      <p>“Ask your Lord for forgiveness… He will send rain upon you in abundance, give you wealth and children, and give you gardens and rivers.”</p><span>Nuh 71:10–12</span></div>
    <div class="ist-card"><h3>${I.calendar || I.check} Today’s istighfar plan <b class="ist-n" id="istN">${n}/${G.plan.length}</b></h3>
      <div class="ist-pbar"><i id="istBar" style="width:${n / G.plan.length * 100}%"></i></div>
      ${G.plan.map(x => `<label class="ist-step ${done[x.id] ? 'on' : ''}"><input type="checkbox" data-ip="${x.id}" ${done[x.id] ? 'checked' : ''}><span class="ist-chk">${I.check}</span><span class="grow"><small>${esc(x.time)}</small><b>${esc(x.what)}</b><em>${esc(x.why)}</em></span><button class="ist-use" data-use="${x.formula}" type="button">Use</button></label>`).join('')}
      <p class="ist-tip">Minimum that works: <b>100 a day</b>, like the Prophet ﷺ. Ambitious: 1,000 a day spread across your day. Best time: <b>sahar</b> — the last hour before Fajr.</p></div>
    <div class="ist-card"><h3>${I.quran || I.book} What the Qur’an promises</h3>${G.promise.map((b, i) => `<details class="ist-d" ${i === 0 ? 'open' : ''}><summary>${esc(b.head)}</summary>${ay(b)}<p class="ist-note">${esc(b.note)}</p></details>`).join('')}</div>
    <div class="ist-card"><h3>${I.moon} Tahajjud — the hidden door</h3>${G.tahajjud.map(([h, t]) => `<div class="ist-row"><b>${esc(h)}</b><p>${esc(t)}</p></div>`).join('')}
      <button class="btn accent block" id="istTah" style="margin-top:10px">${I.bell || I.clock} Calculate tonight’s last third</button><div id="istTahOut"></div></div>
    <div class="ist-card"><h3>${I.key || I.check} How to make it work — 5 conditions</h3>${G.conditions.map(([h, t], i) => `<div class="ist-cond"><span>${i + 1}</span><div><b>${esc(h)}</b><p>${esc(t)}</p></div></div>`).join('')}</div>
    <div class="ist-card"><h3>${I.users} The early Muslims knew</h3>${G.salaf.map(x => `<blockquote class="ist-q"><b>${esc(x.who)}</b><p>${esc(x.text)}</p><small>${esc(x.src)}</small></blockquote>`).join('')}</div>
    <div class="ist-card"><h3>${I.star} From the Prophet ﷺ</h3>${G.hadith.map(([t, r]) => `<div class="ist-h"><p>${esc(t)}</p><small>${esc(r)}</small></div>`).join('')}</div>
    <div class="ist-honest"><b>${I.info || 'ⓘ'} Honest note</b><p>${esc(G.honesty)}</p></div>
  </section>`;
}
function bindGem(p, data, usePhrase) {
  const G = data.gem; if (!G) return;
  const day = new Date().toISOString().slice(0, 10), key = 'ist.plan.' + day;
  $$('[data-ip]', p).forEach(c => c.onchange = () => { const d = LS.get(key, {}); d[c.dataset.ip] = c.checked; LS.set(key, d); c.closest('.ist-step').classList.toggle('on', c.checked);
    const n = G.plan.filter(x => d[x.id]).length; $('#istN', p).textContent = `${n}/${G.plan.length}`; $('#istBar', p).style.width = n / G.plan.length * 100 + '%';
    if (c.checked) vibrate(12); if (n === G.plan.length) toast('MashaAllah — full istighfar plan done today 🤍'); });
  $$('[data-use]', p).forEach(b => b.onclick = e => { e.preventDefault(); usePhrase(b.dataset.use); toast('Counter set to this phrase'); });
  const tb = $('#istTah', p); if (tb) tb.onclick = async () => {
    const out = $('#istTahOut', p); out.innerHTML = '<p class="faint small">Calculating…</p>';
    try { const t = await api('/prayertimes'); const tm = t.times || t.days?.[0]?.times || {}; const toMin = v => { const m = String(v || '').match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
      const mg = toMin(tm.maghrib || tm.Maghrib), fj = toMin(tm.fajr || tm.Fajr); if (mg == null || fj == null) throw new Error('no times');
      const night = (fj + 1440 - mg) % 1440, start = (mg + Math.round(night * 2 / 3)) % 1440, f = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      out.innerHTML = `<div class="ist-tah"><div><small>Last third starts</small><b>${f(start)}</b></div><div><small>Fajr</small><b>${f(fj)}</b></div><div><small>Night length</small><b>${Math.floor(night / 60)}h ${night % 60}m</b></div></div><p class="faint small">Set an alarm for ${f(start)}. Pray 2 + 2 rakʿat and Witr, then istighfar until Fajr.</p>`;
    } catch { out.innerHTML = '<p class="faint small">Set your location in Settings to calculate prayer times.</p>'; } };
}
