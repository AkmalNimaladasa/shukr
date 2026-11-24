// Worship+ : Istighfar counter, Sunnah tracker (daily/weekly/monthly), How to pray guide, Halal food near me.
import { $, $$, esc, escAttr, I, api, state, toast, vibrate, shell, bindGo, loadJSON, askAlim, ring, confirmSheet, loadingHTML, LS } from '../core.js';

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
        <span class="wp-tap-in"><b id="wCount">0</b><small>of <span id="wTarget">100</span></small></span>
      </button>
      <div class="wp-life"><span>Lifetime istighfar</span><b id="wLife">0</b><div class="wp-lbar"><i id="wLbar"></i></div><small id="wLnext"></small></div>
      <div class="ar wp-phrase" lang="ar" id="wAr"></div><div class="wp-phrase-tr" id="wTr"></div>
      <div class="wp-hero-foot"><div class="seg wp-seg" id="wTargets">${[33, 70, 100, 1000].map(t => `<button data-t="${t}">${t}</button>`).join('')}</div><button class="iconbtn" id="wReset" aria-label="Reset today">${I.retry}</button></div>
    </div>
    <div class="grid3"><div class="kpi"><div class="n" id="wToday">0</div><div class="l">Today</div></div><div class="kpi"><div class="n" id="wTotal">0</div><div class="l">This week</div></div><div class="kpi"><div class="n" id="wDays">0</div><div class="l">Goal days (30d)</div></div></div>
    <div class="card"><h3>Last 30 days</h3><div class="wp-bars" id="wBars"></div></div>
    <div class="card"><h3>Words of istighfar</h3><p class="muted small">Tap one to make it your counter phrase.</p><div id="wForms"></div></div>
    <div class="card"><h3>What istighfar opens up</h3>${benefits}</div>
    <button class="btn ghost block" id="wAsk">${I.chat} Ask Alim about istighfar</button>`;
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
export async function viewHalalPlaces() {
  const p = shell('Halal food near me');
  let km = LS.get('halalKm', 3), kind = 'all', r = null, tries = 0;
  const skel = () => `<div class="wp-hero wp-halal"><div class="wp-hero-k">Within ${km} km</div><div class="wp-hero-big">Finding halal places…</div></div>${Array.from({ length: 4 }, () => '<div class="card wp-place wp-skel"><i></i><i></i><i></i></div>').join('')}`;
  async function load() {
    if (!r) p.innerHTML = skel();
    try { r = await api(`/worship-plus/halal?km=${km}`); }
    catch (e) {
      if (/location/i.test(e.message)) {
        p.innerHTML = `<div class="empty"><div class="e">${I.pin}</div><h3>Where are you?</h3><p class="muted">Set your location to find halal food near you.</p><button class="btn accent" id="hLoc">Use my location</button></div>`;
        $('#hLoc').onclick = async () => { try { await (await import('../views-worship.js')).locate(); load(); } catch (er) { toast(er.message); } }; return;
      }
      p.innerHTML = `<div class="empty"><p class="muted">${esc(e.message)}</p><button class="btn" id="hRetry">Try again</button></div>`; $('#hRetry').onclick = load; return;
    }
    if (r.pending) { const res = r; r = null; p.innerHTML = skel() + `<p class="muted small" style="text-align:center">Searching the map for the first time in your area — this takes up to a minute once, then it’s instant.</p>`;
      const tm = setTimeout(() => { if (location.hash === '#/halal-places' && ++tries < 12) load(); }, 2500); window.addEventListener('hashchange', () => clearTimeout(tm), { once: true }); return; }
    draw();
  }
  function draw() {
    const kinds = [...new Set(r.places.map(x => x.kind))];
    const list = r.places.filter(x => kind === 'all' || x.kind === kind);
    const LB = { restaurant: 'Restaurants', fast_food: 'Fast food', cafe: 'Cafés', butcher: 'Butchers', shop: 'Shops' };
    const dist = m => m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
    p.innerHTML = `
      <div class="wp-hero wp-halal"><div class="wp-hero-k">Within ${km} km</div><div class="wp-hero-big">${r.places.length} halal place${r.places.length === 1 ? '' : 's'}</div></div>
      <div class="chips">${[1, 3, 5, 10].map(k => `<button class="chip ${k === km ? 'on' : ''}" data-km="${k}">${k} km</button>`).join('')}</div>
      ${kinds.length > 1 ? `<div class="chips"><button class="chip ${kind === 'all' ? 'on' : ''}" data-k="all">All</button>${kinds.map(k => `<button class="chip ${k === kind ? 'on' : ''}" data-k="${escAttr(k)}">${esc(LB[k] || k)}</button>`).join('')}</div>` : ''}
      ${list.length ? list.map(x => `<div class="card wp-place"><div class="row between"><div class="grow"><b>${esc(x.name)}</b>
          <div class="faint small">${esc(LB[x.kind] || x.kind || '')}${x.cuisine.length ? ' · ' + esc(x.cuisine.join(', ')) : ''}${x.halal === 'only' ? ' · fully halal' : ''}</div>
          ${x.address ? `<div class="muted small">${esc(x.address)}</div>` : ''}${x.hours ? `<div class="muted small">${I.clock} ${esc(x.hours)}</div>` : ''}</div>
          <span class="badge">${dist(x.dist)}</span></div>
        <div class="row" style="gap:8px;margin-top:10px"><a class="btn accent sm grow" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${x.lat},${x.lng}">${I.route} Go</a>
          <a class="btn ghost sm grow" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${x.lat}%2C${x.lng}">${I.pin} Maps</a>
          ${x.phone ? `<a class="btn ghost sm" href="tel:${escAttr(x.phone.replace(/[^\d+]/g, ''))}" aria-label="Call">${I.phone}</a>` : ''}</div></div>`).join('')
        : `<div class="empty"><p class="muted">No halal places are tagged on the map near you yet. Try a bigger radius.</p></div>`}
      <p class="faint small" style="text-align:center;margin:14px 8px">Halal status comes from OpenStreetMap — please confirm with the restaurant.<br>Map data © OpenStreetMap contributors</p>`;
    $$('[data-km]', p).forEach(b => b.onclick = () => { km = +b.dataset.km; LS.set('halalKm', km); load(); });
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
