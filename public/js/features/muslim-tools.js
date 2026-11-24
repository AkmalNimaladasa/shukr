// Muslim tools: Hajj & Umrah guide, Ramadan hub, monthly prayer timetable, greeting cards.
import { $, $$, esc, escAttr, I, api, state, toast, vibrate, shell, bindGo, LS, computeTimes, hijriParts, fmtTime, localDay, askAlim, loadingHTML, onCleanup, confirmSheet } from '../core.js';

const noLoc = () => !(state.user?.settings?.lat != null && state.user?.settings?.lng != null);
const locCard = () => `<div class="empty"><div class="e">${I.pin}</div><h3>Set your location</h3><p class="muted">Prayer and fasting times need your location.</p><button class="btn accent" id="mtLoc">Use my location</button></div>`;
const bindLoc = (p, again) => { const b = $('#mtLoc', p); if (b) b.onclick = async () => { try { await (await import('../views-worship.js')).locate(); again(); } catch (e) { toast(e.message); } }; };
const dayAt = (base, n) => { const d = new Date(base); d.setDate(d.getDate() + n); return d; };

// ================= HAJJ & UMRAH =================
const TALBIYAH = { ar: 'لَبَّيْكَ اللَّهُمَّ لَبَّيْكَ، لَبَّيْكَ لَا شَرِيكَ لَكَ لَبَّيْكَ، إِنَّ الْحَمْدَ وَالنِّعْمَةَ لَكَ وَالْمُلْكَ، لَا شَرِيكَ لَكَ',
  tr: 'Labbayk Allahumma labbayk, labbayka la sharika laka labbayk. Innal-hamda wan-ni‘mata laka wal-mulk, la sharika lak.',
  en: 'Here I am, O Allah, here I am. Here I am — You have no partner — here I am. All praise, all blessing and all dominion belong to You. You have no partner.', ref: 'Sahih al-Bukhari 1549; Sahih Muslim 1184' };
const UMRAH = [
  ['ihram', 'Ihram & intention', 'Before crossing the miqat, bathe, wear ihram (two plain white sheets for men; modest everyday clothes for women), and make the intention for umrah. Begin the talbiyah.', 'talbiyah'],
  ['tawaf', 'Tawaf — 7 circuits', 'Enter al-Masjid al-Haram with your right foot. Start at the Black Stone (touch, kiss or point to it and say “Allahu akbar”), keep the Ka‘bah on your left and walk 7 circuits. Men uncover the right shoulder (idtiba‘) for this tawaf. Between the Yemeni corner and the Black Stone say: “Rabbana atina fid-dunya hasanah, wa fil-akhirati hasanah, wa qina ‘adhaban-nar” (Quran 2:201; Abu Dawud 1892). Any dua or dhikr is fine elsewhere.', 'counter'],
  ['maqam', 'Two rak‘at behind Maqam Ibrahim', 'Pray two rak‘at behind the Station of Ibrahim if you can, otherwise anywhere in the mosque. It is sunnah to recite al-Kafirun and al-Ikhlas (Sahih Muslim 1218).'],
  ['zamzam', 'Drink Zamzam', 'Drink Zamzam water and make dua — “Zamzam water is for whatever it is drunk for” (Ibn Majah 3062, graded hasan by many scholars).'],
  ['sai', 'Sa‘i — 7 laps', 'Go to Safa, face the Ka‘bah, praise Allah and make dua. Walk to Marwah (one lap), then back to Safa (two) — finishing at Marwah on the 7th. Men jog lightly between the green lights. Recite at Safa: “Innas-Safa wal-Marwata min sha‘a’irillah” (Quran 2:158).', 'counter'],
  ['halq', 'Shave or trim', 'Men shave the head (best) or shorten the hair evenly; women cut a fingertip’s length. Your umrah is complete and ihram restrictions end.'],
];
const HAJJ = [
  ['8 Dhul Hijjah — Yawm at-Tarwiyah', 'Enter ihram for Hajj (if doing tamattu‘) and go to Mina. Pray Dhuhr, Asr, Maghrib, Isha and the next Fajr there, shortening the 4-rak‘ah prayers.'],
  ['9 Dhul Hijjah — Day of ‘Arafah', 'The heart of Hajj: “Hajj is ‘Arafah” (Tirmidhi 889). After sunrise go to ‘Arafah, pray Dhuhr and Asr shortened and combined, and spend the afternoon in dua until sunset. The best dua is that of ‘Arafah (Tirmidhi 3585).'],
  ['Night of 10th — Muzdalifah', 'After sunset go to Muzdalifah, pray Maghrib and Isha combined, sleep there and pray Fajr. Collect small pebbles for the Jamarat.'],
  ['10 Dhul Hijjah — Day of Sacrifice', 'Stone Jamrat al-‘Aqabah with 7 pebbles, saying “Allahu akbar” with each. Offer the sacrifice (hady), shave or trim, then perform Tawaf al-Ifadah and sa‘i. Most ihram restrictions end after the stoning and shaving.'],
  ['11–13 Dhul Hijjah — Days of Tashriq', 'Stay in Mina. Each day after midday stone all three Jamarat — small, middle, then large — with 7 pebbles each. You may leave on the 12th before sunset (Quran 2:203).'],
  ['Farewell — Tawaf al-Wada‘', 'Before leaving Makkah, make a farewell tawaf as your last act (Sahih Muslim 1327). Women in menses are excused.'],
];
const IHRAM_NO = ['Cutting hair or nails', 'Using perfume or scented products', 'Marriage contracts or proposals', 'Sexual relations and intimacy', 'Hunting land animals', 'Men: sewn, fitted clothing and covering the head', 'Women: face veil (niqab) and gloves'];
export function viewHajj() {
  const p = shell('Hajj & Umrah');
  const done = new Set(LS.get('mt.hajj.done', []));
  const save = () => LS.set('mt.hajj.done', [...done]);
  const counters = LS.get('mt.hajj.count', { tawaf: 0, sai: 0 });
  const step = (id, h, body, extra, i) => `<div class="mt-step ${done.has(id) ? 'done' : ''}"><button class="mt-tick" data-tick="${escAttr(id)}" aria-label="Mark done">${done.has(id) ? I.check : i + 1}</button>
    <div class="grow"><b>${esc(h)}</b><p class="muted small">${esc(body)}</p>
    ${extra === 'talbiyah' ? `<div class="mt-dua"><div class="ar mt-ar" lang="ar">${TALBIYAH.ar}</div><div class="mt-tl">${esc(TALBIYAH.tr)}</div><div class="mt-en">${esc(TALBIYAH.en)}</div><div class="mt-ref">${TALBIYAH.ref}</div></div>` : ''}
    ${extra === 'counter' ? `<button class="mt-count" data-count="${id}"><b id="mtc-${id}">${counters[id] || 0}</b><span>/ 7 ${id === 'tawaf' ? 'circuits' : 'laps'}</span><small>Tap after each ${id === 'tawaf' ? 'circuit' : 'lap'} · long-press to reset</small></button>` : ''}</div></div>`;
  function paint() {
    p.innerHTML = `
      <div class="mt-hero mt-hajj"><div class="mt-k">Your pilgrimage companion</div><div class="mt-big">Hajj & Umrah, step by step</div>
        <p class="small" style="opacity:.92;margin:4px 0 0">Tick each step as you go. Details differ slightly between the schools of law — follow your group’s scholar.</p></div>
      <h3 class="mt-h">Umrah</h3>${UMRAH.map(([id, h, b, x], i) => step(id, h, b, x, i)).join('')}
      <h3 class="mt-h">Hajj days</h3>${HAJJ.map(([h, b], i) => step('h' + i, h, b, null, i)).join('')}
      <div class="card"><h3>Types of Hajj</h3>
        <div class="list-item"><div class="grow"><b>Tamattu‘</b><div class="muted small">Umrah in the Hajj months, leave ihram, then a new ihram for Hajj. A sacrifice is due. Most pilgrims from abroad do this.</div></div></div>
        <div class="list-item"><div class="grow"><b>Qiran</b><div class="muted small">Umrah and Hajj together in one ihram. A sacrifice is due.</div></div></div>
        <div class="list-item"><div class="grow"><b>Ifrad</b><div class="muted small">Hajj only, without umrah. No sacrifice is required.</div></div></div></div>
      <div class="card"><h3>Not allowed in ihram</h3><ul class="mt-ul">${IHRAM_NO.map(x => `<li>${esc(x)}</li>`).join('')}</ul><div class="mt-ref">Quran 2:196–197, 5:95; Sahih al-Bukhari 1542</div></div>
      <div class="grid2"><button class="btn ghost" id="mtReset">${I.retry} Reset ticks</button><button class="btn ghost" data-go="/scholars">${I.cap} Ask a scholar</button></div>
      <button class="btn ghost block" id="mtAsk" style="margin-top:8px">${I.chat} Ask Alim about Hajj</button>`;
    bindGo(p);
    $$('[data-tick]', p).forEach(b => b.onclick = () => { const id = b.dataset.tick; done.has(id) ? done.delete(id) : done.add(id); save(); vibrate(12); paint(); });
    $$('[data-count]', p).forEach(b => {
      const id = b.dataset.count; let t = null;
      b.onpointerdown = () => { t = setTimeout(() => { t = 'long'; counters[id] = 0; LS.set('mt.hajj.count', counters); vibrate(40); $('#mtc-' + id).textContent = 0; }, 700); };
      b.onpointerup = b.onpointerleave = () => { if (t && t !== 'long') clearTimeout(t); };
      b.onclick = () => { if (t === 'long') { t = null; return; } counters[id] = Math.min(7, (counters[id] || 0) + 1); LS.set('mt.hajj.count', counters); $('#mtc-' + id).textContent = counters[id];
        vibrate(counters[id] === 7 ? [30, 60, 30] : 15); if (counters[id] === 7) { toast(id === 'tawaf' ? 'Tawaf complete — pray two rak‘at' : 'Sa‘i complete'); done.add(id); save(); paint(); } };
    });
    $('#mtReset').onclick = async () => { if (!await confirmSheet('Reset progress?', 'All ticks and counters go back to zero.', 'Reset', true)) return; done.clear(); save(); LS.set('mt.hajj.count', { tawaf: 0, sai: 0 }); counters.tawaf = counters.sai = 0; paint(); };
    $('#mtAsk').onclick = () => askAlim('Guide me through performing Hajj and Umrah, with the key duas.');
  }
  paint();
}

// ================= RAMADAN =================
function findRamadan() { // returns {start: Date of 1 Ramadan, hyear} for the current or next Ramadan
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const h = hijriParts(today);
  if (h.m === 9) return { start: dayAt(today, -(h.d - 1)), hyear: h.y, now: h.d };
  for (let i = 1; i < 400; i++) { const d = dayAt(today, i), x = hijriParts(d); if (x.m === 9 && x.d === 1) return { start: d, hyear: x.y, now: 0 }; }
  return null;
}
const GOALS = [['fast', 'Fasted', 'fast'], ['taraweeh', 'Taraweeh', 'moon'], ['quran', 'Read Quran', 'quran'], ['sadaqah', 'Gave sadaqah', 'gift'], ['dhikr', 'Dhikr & dua', 'beads']];
export async function viewRamadan() {
  const p = shell('Ramadan');
  const again = () => viewRamadan();
  if (noLoc()) { p.innerHTML = locCard(); bindLoc(p, again); return; }
  const R = findRamadan(); if (!R) { p.innerHTML = '<div class="empty"><p class="muted">Couldn’t work out the Ramadan dates.</p></div>'; return; }
  p.innerHTML = loadingHTML();
  const st = await api('/muslim-tools/ramadan?hyear=' + R.hyear).catch(() => ({ days: {}, juz: [] }));
  const inR = R.now > 0, rows = Array.from({ length: 30 }, (_, i) => { const d = dayAt(R.start, i), h = hijriParts(d); return h.m === 9 ? { i: i + 1, d, t: computeTimes(d) } : null; }).filter(Boolean);
  const today = new Date(), t = computeTimes(today);
  const daysTo = Math.ceil((R.start - today) / 864e5);
  let juz = new Set(st.juz || []);
  const goalsHTML = rd => { const g = st.days[rd] || {}; return `<div class="mt-goals">${GOALS.map(([k, l, ic]) => `<button class="mt-goal ${g[k] ? 'on' : ''}" data-goal="${k}" data-rd="${rd}">${I[ic]}<span>${l}</span></button>`).join('')}</div>`; };
  p.innerHTML = `
    <div class="mt-hero mt-ram">${inR ? `<div class="mt-k">Ramadan ${R.now} · ${R.hyear} AH</div><div class="mt-big" id="mtCd">—</div><div class="mt-sub" id="mtCdL"></div>
      <div class="mt-times"><div><small>Suhoor ends</small><b>${fmtTime(t?.fajr)}</b></div><div><small>Iftar</small><b>${fmtTime(t?.maghrib)}</b></div></div>`
      : `<div class="mt-k">Ramadan ${R.hyear} AH</div><div class="mt-big">${daysTo} day${daysTo === 1 ? '' : 's'} to go</div><div class="mt-sub">Expected to begin ${R.start.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}, subject to moon sighting</div>`}</div>
    ${inR ? `<div class="card"><h3>Today’s goals</h3>${goalsHTML(R.now)}</div>` : ''}
    <div class="card"><h3>Iftar dua</h3><div class="ar mt-ar" lang="ar">ذَهَبَ الظَّمَأُ وَابْتَلَّتِ الْعُرُوقُ وَثَبَتَ الْأَجْرُ إِنْ شَاءَ اللَّهُ</div>
      <div class="mt-tl">Dhahaba adh-dhama’u wabtallatil-‘uruqu wa thabatal-ajru in sha’ Allah</div><div class="mt-en">The thirst has gone, the veins are moistened, and the reward is assured, if Allah wills.</div><div class="mt-ref">Sunan Abi Dawud 2357</div></div>
    <div class="card"><div class="row between" style="align-items:center"><h3 style="margin:0">Quran khatm</h3><span class="badge">${juz.size}/30 juz</span></div>
      <div class="mt-juz">${Array.from({ length: 30 }, (_, i) => `<button class="${juz.has(i + 1) ? 'on' : ''}" data-juz="${i + 1}">${i + 1}</button>`).join('')}</div></div>
    <div class="card"><h3>Timetable · ${esc(state.user.settings.city || 'your location')}</h3>
      <table class="mt-tt"><tr><th>Day</th><th>Date</th><th>Suhoor</th><th>Iftar</th><th></th></tr>${rows.map(r => `<tr class="${inR && r.i === R.now ? 'today' : ''} ${r.i > 20 ? 'last10' : ''}"><td><b>${r.i}</b></td><td>${r.d.toLocaleDateString([], { day: 'numeric', month: 'short' })}</td><td>${fmtTime(r.t?.fajr)}</td><td>${fmtTime(r.t?.maghrib)}</td><td>${Object.values(st.days[r.i] || {}).some(v => v === true) ? I.check : ''}</td></tr>`).join('')}</table>
      <p class="faint small">Suhoor ends at Fajr. Many people stop eating a few minutes earlier to be safe. Dates depend on moon sighting.</p></div>
    <div class="card mt-last10"><h3>${I.star} The last ten nights</h3><p class="muted small">Laylat al-Qadr is better than a thousand months (Quran 97:3). Seek it in the odd nights of the last ten (Sahih al-Bukhari 2017). ‘A’ishah asked what to say if she found it; the Prophet ﷺ taught:</p>
      <div class="ar mt-ar" lang="ar">اللَّهُمَّ إِنَّكَ عَفُوٌّ تُحِبُّ الْعَفْوَ فَاعْفُ عَنِّي</div><div class="mt-tl">Allahumma innaka ‘afuwwun tuhibbul-‘afwa fa‘fu ‘anni</div><div class="mt-en">O Allah, You are Pardoning and love to pardon, so pardon me.</div><div class="mt-ref">Jami‘ at-Tirmidhi 3513</div></div>
    <div class="card"><h3>Zakat al-Fitr</h3><p class="muted small">Due from every Muslim who can afford it, paid before the Eid prayer — a sa‘ of staple food per person (Sahih al-Bukhari 1503). Many scholars allow its value in money; ask your local mosque for the amount.</p><button class="btn ghost block" data-go="/zakat">${I.coin} Zakat calculator</button></div>`;
  bindGo(p);
  if (inR) {
    const tick = () => { const now = new Date(), tt = computeTimes(now); if (!tt) return; const target = now < tt.fajr ? ['Suhoor ends in', tt.fajr] : now < tt.maghrib ? ['Iftar in', tt.maghrib] : ['Suhoor ends in', computeTimes(dayAt(now, 1))?.fajr];
      const ms = Math.max(0, target[1] - now), h = Math.floor(ms / 36e5), m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
      const el = $('#mtCd'); if (!el) return; el.textContent = `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`; $('#mtCdL').textContent = target[0]; };
    tick(); const iv = setInterval(tick, 1000); onCleanup(() => clearInterval(iv));
  }
  $$('[data-goal]', p).forEach(b => b.onclick = async () => { const k = b.dataset.goal, rd = +b.dataset.rd, on = !b.classList.contains('on'); b.classList.toggle('on', on); vibrate(12);
    try { const r = await api('/muslim-tools/ramadan/day', { method: 'PUT', body: { hyear: R.hyear, rday: rd, goals: { [k]: on } } }); st.days[rd] = r.goals; } catch (e) { toast(e.message); b.classList.toggle('on', !on); } });
  $$('[data-juz]', p).forEach(b => b.onclick = async () => { const n = +b.dataset.juz; juz.has(n) ? juz.delete(n) : juz.add(n); b.classList.toggle('on', juz.has(n)); vibrate(10);
    $('.mt-juz', p).previousElementSibling.querySelector('.badge').textContent = `${juz.size}/30 juz`;
    if (juz.size === 30) toast('Khatm complete — MashaAllah!');
    try { await api('/muslim-tools/ramadan/juz', { method: 'PUT', body: { hyear: R.hyear, juz: [...juz] } }); } catch (e) { toast(e.message); } });
}

// ================= MONTHLY TIMETABLE =================
export function viewTimetable(q) {
  const p = shell('Monthly timetable');
  if (noLoc()) { p.innerHTML = locCard(); bindLoc(p, () => viewTimetable(q)); return; }
  let base = new Date(); base.setDate(1); base.setHours(12, 0, 0, 0);
  function paint() {
    const y = base.getFullYear(), m = base.getMonth(), n = new Date(y, m + 1, 0).getDate(), today = localDay();
    const rows = Array.from({ length: n }, (_, i) => { const d = new Date(y, m, i + 1, 12); return { d, h: hijriParts(d), t: computeTimes(d) }; });
    const KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
    p.innerHTML = `
      <div class="mt-tthead"><button class="iconbtn" id="mtPrev" aria-label="Previous month">${I.back}</button><div style="text-align:center"><b>${base.toLocaleDateString([], { month: 'long', year: 'numeric' })}</b><div class="faint small">${esc(state.user.settings.city || '')}</div></div><button class="iconbtn mt-flip" id="mtNext" aria-label="Next month">${I.back}</button></div>
      <div class="mt-ttwrap"><table class="mt-tt mt-full"><tr><th>Date</th><th>Hijri</th><th>Fajr</th><th>Sunrise</th><th>Dhuhr</th><th>Asr</th><th>Maghrib</th><th>Isha</th></tr>
        ${rows.map(r => { const ld = localDay(r.d); return `<tr class="${ld === today ? 'today' : ''} ${r.d.getDay() === 5 ? 'fri' : ''}"><td><b>${r.d.getDate()}</b> <small>${r.d.toLocaleDateString([], { weekday: 'short' })}</small></td><td><small>${r.h.d}/${r.h.m}</small></td>${KEYS.map(k => `<td>${fmtTime(r.t?.[k]).replace(/\s?[AP]M/i, '')}</td>`).join('')}</tr>`; }).join('')}</table></div>
      <p class="faint small">Fridays are highlighted. Method: ${esc(state.user.settings.method || 'default')} · ${esc(state.user.settings.madhab || '')} Asr. Change in Prayer settings.</p>
      <div class="grid2 mt-noprint"><button class="btn ghost" id="mtPrint">${I.download} Print / PDF</button><button class="btn ghost" id="mtCsv">${I.download} Download CSV</button></div>`;
    $('#mtPrev').onclick = () => { base = new Date(y, m - 1, 1, 12); paint(); }; $('#mtNext').onclick = () => { base = new Date(y, m + 1, 1, 12); paint(); };
    $('#mtPrint').onclick = () => window.print();
    $('#mtCsv').onclick = () => { const csv = ['Date,Hijri,' + KEYS.join(',')].concat(rows.map(r => [localDay(r.d), `${r.h.y}-${r.h.m}-${r.h.d}`, ...KEYS.map(k => fmtTime(r.t?.[k]))].map(v => `"${v}"`).join(','))).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `prayer-times-${y}-${String(m + 1).padStart(2, '0')}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  }
  paint();
}

// ================= GREETING CARDS =================
const OCC = [
  ['eid', 'Eid Mubarak', 'عِيدٌ مُبَارَكٌ', 'Taqabbal Allahu minna wa minkum — may Allah accept from us and from you.'],
  ['ramadan', 'Ramadan Kareem', 'رَمَضَانُ كَرِيمٌ', 'Wishing you a blessed month of mercy, forgiveness and light.'],
  ['jumuah', 'Jumu‘ah Mubarak', 'جُمُعَةٌ مُبَارَكَةٌ', 'May this Friday bring you peace and accepted duas.'],
  ['jazak', 'JazakAllahu khayran', 'جَزَاكَ اللَّهُ خَيْرًا', 'May Allah reward you with goodness. Thank you!'],
  ['nikah', 'Barakallahu lakuma', 'بَارَكَ اللَّهُ لَكُمَا', 'May Allah bless you both and unite you in goodness. (Abu Dawud 2130)'],
  ['baby', 'Welcome, little one', 'بَارَكَ اللَّهُ لَكَ فِي الْمَوْهُوبِ لَكَ', 'May Allah bless the gift He has given you, and make them a joy for your eyes.'],
  ['hajj', 'Hajj Mabrur', 'حَجٌّ مَبْرُورٌ', 'May your Hajj be accepted and your sins forgiven.'],
  ['condolence', 'Inna lillahi wa inna ilayhi raji‘un', 'إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ', 'To Allah belongs what He took and what He gave. May He grant you patience. (Bukhari 1284)'],
  ['custom', 'Your message', 'بِسْمِ اللَّهِ', ''],
];
const BG = [
  ['Midnight gold', ['#0B1A3A', '#1E3A8A'], '#F5C76B', 'stars'], ['Emerald', ['#064E3B', '#059669'], '#FDE68A', 'girih'], ['Rose dawn', ['#831843', '#F472B6'], '#FFF1F2', 'arches'],
  ['Desert sun', ['#7C2D12', '#F59E0B'], '#FFFBEB', 'girih'], ['Royal violet', ['#2E1065', '#7C3AED'], '#FDE68A', 'stars'], ['Ocean', ['#0C4A6E', '#06B6D4'], '#ECFEFF', 'arches'],
  ['Ivory', ['#FFFBF0', '#F3E8D2'], '#7C5A1E', 'girih'], ['Night sky', ['#020617', '#312E81'], '#E0E7FF', 'moon'], ['Olive', ['#1A2E05', '#65A30D'], '#FEF9C3', 'stars'],
  ['Crimson', ['#450A0A', '#DC2626'], '#FEF3C7', 'arches'], ['Mint', ['#ECFDF5', '#A7F3D0'], '#065F46', 'moon'], ['Charcoal', ['#111827', '#374151'], '#FCD34D', 'girih'],
];
function drawPattern(c, kind, color, W, H) {
  c.save(); c.globalAlpha = 0.14; c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 2;
  if (kind === 'girih') { const s = 90; for (let y = 0; y < H + s; y += s) for (let x = 0; x < W + s; x += s) { c.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, r = k % 2 ? s * 0.22 : s * 0.42; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); c.stroke(); } }
  else if (kind === 'stars') { for (let i = 0; i < 70; i++) { const x = (i * 137.5) % W, y = (i * 241.3) % H, r = 2 + (i % 4); c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); } }
  else if (kind === 'arches') { for (let x = -60; x < W + 120; x += 180) { c.beginPath(); c.moveTo(x, H); c.lineTo(x, H * 0.55); c.quadraticCurveTo(x + 90, H * 0.3, x + 180, H * 0.55); c.lineTo(x + 180, H); c.stroke(); } }
  else if (kind === 'moon') { c.globalAlpha = 0.22; c.beginPath(); c.arc(W * 0.78, H * 0.17, 90, 0, 7); c.fill(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(W * 0.78 + 38, H * 0.17 - 22, 82, 0, 7); c.fill(); }
  c.restore();
  c.save(); c.globalAlpha = 0.5; c.strokeStyle = color; c.lineWidth = 3; c.strokeRect(40, 40, W - 80, H - 80); c.globalAlpha = 0.25; c.strokeRect(56, 56, W - 112, H - 112); c.restore();
}
function wrapText(c, text, x, y, maxW, lh) { const words = String(text).split(/\s+/); let line = '', lines = []; for (const w of words) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; } if (line) lines.push(line); lines.forEach((l, i) => c.fillText(l, x, y + i * lh)); return lines.length * lh; }
export async function viewCards() {
  const p = shell('Greeting cards');
  let occ = LS.get('mt.card.occ', 'eid'), bg = LS.get('mt.card.bg', 0), to = '', from = state.user?.name || '', msg = '';
  try { const f = new FontFace('AmiriCard', 'url(/fonts/Amiri-Bold.ttf)'); await f.load(); document.fonts.add(f); } catch {}
  const W = 1080, H = 1350;
  p.innerHTML = `
    <canvas id="mtCv" width="${W}" height="${H}" class="mt-cv"></canvas>
    <div class="chips" style="margin-top:12px">${OCC.map(o => `<button class="chip" data-occ="${o[0]}">${esc(o[1].split(' ').slice(0, 2).join(' '))}</button>`).join('')}</div>
    <div class="mt-bgs">${BG.map((b, i) => `<button data-bg="${i}" title="${escAttr(b[0])}" style="background:linear-gradient(135deg,${b[1][0]},${b[1][1]})"></button>`).join('')}</div>
    <div class="card"><label class="small faint">To</label><input class="input" id="mtTo" maxlength="40" placeholder="e.g. Aisha">
      <label class="small faint" style="margin-top:8px;display:block">Message</label><textarea class="input" id="mtMsg" rows="3" maxlength="220" placeholder="Leave blank for the default message"></textarea>
      <label class="small faint" style="margin-top:8px;display:block">From</label><input class="input" id="mtFrom" maxlength="40" value="${escAttr(from)}"></div>
    <div class="grid2"><button class="btn accent" id="mtShare">${I.share} Share</button><button class="btn ghost" id="mtSave">${I.download} Save image</button></div>`;
  const cv = $('#mtCv'), c = cv.getContext('2d');
  function draw() {
    const o = OCC.find(x => x[0] === occ) || OCC[0], [, cols, ink, pat] = BG[bg];
    const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]); c.fillStyle = g; c.fillRect(0, 0, W, H);
    drawPattern(c, pat, ink, W, H);
    c.fillStyle = ink; c.textAlign = 'center';
    if (to) { c.font = '600 44px Figtree, sans-serif'; c.globalAlpha = .9; c.fillText('Dear ' + to, W / 2, 230); c.globalAlpha = 1; }
    c.font = '110px AmiriCard, Amiri, serif'; c.direction = 'rtl'; wrapText(c, o[2], W / 2, 520, W - 200, 150); c.direction = 'ltr';
    c.font = '800 76px Figtree, sans-serif'; const hh = wrapText(c, occ === 'custom' ? '' : o[1], W / 2, 760, W - 200, 90);
    c.font = '400 42px Figtree, sans-serif'; c.globalAlpha = .92; wrapText(c, msg || o[3], W / 2, 780 + hh + 40, W - 240, 60); c.globalAlpha = 1;
    if (from) { c.font = '600 40px Figtree, sans-serif'; c.fillText('— ' + from, W / 2, H - 170); }
    c.font = '500 26px Figtree, sans-serif'; c.globalAlpha = .55; c.fillText('Made with Shukr', W / 2, H - 92); c.globalAlpha = 1;
    $$('[data-occ]', p).forEach(b => b.classList.toggle('on', b.dataset.occ === occ)); $$('[data-bg]', p).forEach(b => b.classList.toggle('on', +b.dataset.bg === bg));
  }
  draw();
  $$('[data-occ]', p).forEach(b => b.onclick = () => { occ = b.dataset.occ; LS.set('mt.card.occ', occ); draw(); });
  $$('[data-bg]', p).forEach(b => b.onclick = () => { bg = +b.dataset.bg; LS.set('mt.card.bg', bg); draw(); });
  $('#mtTo').oninput = e => { to = e.target.value.trim(); draw(); }; $('#mtMsg').oninput = e => { msg = e.target.value.trim(); draw(); }; $('#mtFrom').oninput = e => { from = e.target.value.trim(); draw(); };
  const blob = () => new Promise(r => cv.toBlob(r, 'image/png'));
  $('#mtSave').onclick = async () => { const b = await blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `shukr-${occ}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  $('#mtShare').onclick = async () => { const b = await blob(), f = new File([b], `shukr-${occ}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f], title: 'A card for you' }); } catch {} } else $('#mtSave').click(); };
}

export const routes = [
  [/^\/hajj$/, () => viewHajj(), 'hajj'],
  [/^\/ramadan$/, () => viewRamadan(), 'ramadan'],
  [/^\/timetable$/, (m, q) => viewTimetable(q), 'timetable'],
  [/^\/cards$/, () => viewCards(), 'cards'],
];
