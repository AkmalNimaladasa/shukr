// Knowledge: Quran (reader, translations, audio, auto-tracking, gems, bookmarks), Hadith, Hifz, Tajweed, Learn, Audiobooks
import { $, escAttr, $$, esc, LS, I, api, loadJSON, state, toast, vibrate, shell, bindGo, go, sheet, confirmSheet, md, localDay, dayIndex, every, askAlim, empty, loadingHTML,
  onCleanup, recordAudio, ring, duckNasheed } from './core.js';

const RECITERS = [['ar.alafasy', 'Mishary Alafasy', 128], ['ar.husary', 'Mahmoud Khalil Al-Husary', 128], ['ar.husarymujawwad', 'Al-Husary (Mujawwad)', 128], ['ar.minshawi', 'Al-Minshawi', 128],
  ['ar.mahermuaiqly', 'Maher Al-Muaiqly', 128], ['ar.abdurrahmaansudais', 'Abdur-Rahman As-Sudais', 64], ['ar.saoodshuraym', 'Saud Ash-Shuraim', 64], ['ar.abdulbasitmurattal', 'Abdul Basit (Murattal)', 64]];
export const GEMS = [[18, 'Al-Kahf', 'Light between two Fridays'], [36, 'Ya-Sin', 'The heart of the Quran'], [55, 'Ar-Rahman', 'Which favours will you deny?'], [56, 'Al-Waqi‘ah', 'Read every night'],
  [67, 'Al-Mulk', 'Protection in the grave'], [2, 'Al-Baqarah', 'Shaytan flees the house'], [1, 'Al-Fatihah', 'The Mother of the Book'], [32, 'As-Sajdah', 'Read before sleep'],
  [112, 'Al-Ikhlas', 'Equal to a third of the Quran'], [113, 'Al-Falaq', 'Seeking refuge'], [114, 'An-Nas', 'Seeking refuge'], [73, 'Al-Muzzammil', 'Night prayer'], [48, 'Al-Fath', 'The clear victory'], [19, 'Maryam', 'Story of Maryam'], [12, 'Yusuf', 'The best of stories'], [3, 'Al ‘Imran', 'The family of ‘Imran']];
const GEM_SPOTS = [['2:255', 'Ayat al-Kursi', 'The greatest ayah'], ['2:285', 'Last two ayat of Al-Baqarah', 'Sufficient for the night'], ['3:190', 'Ayat for night reflection', 'Last ayat of Al ‘Imran']];
const QMETA = () => loadJSON('/data/quran-meta.json');
const stripBOM = s => s.replace(/^\uFEFF/, '');
const BISM = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
const bare = t => t.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');
function arAyah(s, a, txt) {
  txt = stripBOM(txt);
  if (a === 1 && s !== 1 && s !== 9) { const w = txt.split(' '); if (w.length > 4 && bare(w.slice(0, 4).join(' ')) === bare(BISM)) txt = w.slice(4).join(' '); }
  return txt;
}
const AR_DIGITS = n => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
let globalIdx = null;
async function ayahGlobal(s, a) { if (!globalIdx) { const m = await QMETA(); globalIdx = [0]; m.surahs.forEach(x => globalIdx.push(globalIdx[globalIdx.length - 1] + x.ayahs)); } return globalIdx[s - 1] + a; }
const reciter = () => { const id = LS.get('reciter', 'ar.alafasy'); return RECITERS.find(r => r[0] === id) || RECITERS[0]; };
// Reciter recordings are copyrighted: only available when we hold written permission (server flag), never by default.
export const recitationOn = () => !!state.flags?.recitation;
export async function ayahAudioUrl(s, a) { if (!recitationOn()) throw new Error('Recitation audio is coming soon, in sha Allah.'); const r = reciter(); return `https://cdn.islamic.network/quran/audio/${r[2]}/${r[0]}/${await ayahGlobal(s, a)}.mp3`; }

// Translations: only public-domain / freely licensed editions. Pickthall (1930, public domain) is bundled.
export const SAFE_TR = ['en.pickthall'];
const trCache = {};
async function translation(ed, s) {
  if (ed === 'en.pickthall' || !SAFE_TR.includes(ed)) { const all = await loadJSON('/data/quran-en-pickthall.json'); return all[s - 1]; }
  const k = ed + ':' + s; if (trCache[k]) return trCache[k];
  const ls = LS.get('tr.' + k, null); if (ls) return (trCache[k] = ls);
  let arr;
  if (ed.startsWith('fawaz:')) {
    const catalog = await loadJSON('/data/quran-translations.json');
    const entry = catalog.find(t => t.id === ed && t.source === 'fawaz');
    if (!entry || !/^[a-z0-9-]+$/.test(entry.edition)) throw new Error('Unknown translation edition');
    const suffix = `/editions/${entry.edition}/${s}.min.json`;
    for (const base of ['https://cdn.jsdelivr.net/gh/fawazahmed0/quran-api@1', 'https://raw.githubusercontent.com/fawazahmed0/quran-api/1']) {
      try {
        const r = await fetch(base + suffix); if (!r.ok) continue;
        const j = await r.json();
        if (!Array.isArray(j.chapter) || !j.chapter.length || j.chapter.some(v => v.chapter !== s || !Number.isInteger(v.verse) || typeof v.text !== 'string')) continue;
        const verses = [...j.chapter].sort((a,b) => a.verse - b.verse);
        if (verses.some((v,i) => v.verse !== i + 1)) continue;
        arr = verses.map(v => v.text); break;
      } catch {}
    }
    if (!arr) throw new Error('Translation unavailable — check your connection');
  } else {
    const r = await fetch(`https://api.alquran.cloud/v1/surah/${s}/${ed}`); if (!r.ok) throw new Error('Translation unavailable');
    const j = await r.json(); arr = j.data.ayahs.map(x => x.text);
  }
  trCache[k] = arr; try { LS.set('tr.' + k, arr); } catch {} return arr;
}
async function tajweedText(s) {
  const k = 'tj:' + s; if (trCache[k]) return trCache[k];
  const r = await fetch(`https://api.alquran.cloud/v1/surah/${s}/quran-tajweed`); if (!r.ok) throw new Error('Tajweed text unavailable');
  const j = await r.json(); return (trCache[k] = j.data.ayahs.map(x => x.text));
}
const tajweedHTML = t => esc(t).replace(/\[([a-z])(?::\d+)?\[([^\]]*)\]/g, '<span class="tj-$1">$2</span>');

// ================= QURAN HOME =================
export async function viewQuran() {
  const p = shell('Quran', { right: `<button class="iconbtn" id="qSearch" aria-label="Search">${I.search}</button>` });
  const meta = await QMETA(); let tab = LS.get('qTab', 'surah');
  p.innerHTML = `<div id="qprog">${loadingHTML()}</div><div class="seg" style="margin:4px 0 10px">${[['surah', 'Surahs'], ['juz', 'Juz'], ['gems', 'Gems'], ['saved', 'Saved']].map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="qlist"></div>`;
  $('#qSearch').onclick = () => searchSheet(meta);
  let prog = null;
  const drawList = async () => {
    const el = $('#qlist'); const by = prog?.bySurah || {};
    if (tab === 'surah') el.innerHTML = meta.surahs.map(s => { const r = by[s.n] || 0; return `<div class="surah-row" data-go="/quran/${s.n}"><div class="surah-num">${I.ayahStar}<span>${s.n}</span></div><div class="grow"><div style="font-weight:500">${esc(s.tr)}</div><div class="faint small">${esc(s.en)} · ${s.ayahs} ayat · ${s.type}${r ? ` · <span style="color:var(--accent)">${r === s.ayahs ? 'read' : Math.round(r / s.ayahs * 100) + '%'}</span>` : ''}</div></div><div class="surah-ar">${esc(s.ar.replace('سُورَةُ ', ''))}</div></div>`; }).join('');
    if (tab === 'juz') el.innerHTML = meta.juz.map(j => `<div class="surah-row" data-go="/quran/${j.s}?a=${j.a}"><div class="surah-num">${I.ayahStar}<span>${j.n}</span></div><div class="grow"><div style="font-weight:500">Juz ${j.n}</div><div class="faint small">Starts ${esc(meta.surahs[j.s - 1].tr)} ${j.s}:${j.a}</div></div>${I.fwd}</div>`).join('');
    if (tab === 'gems') el.innerHTML = `<div class="gems">${GEMS.map(([n, nm, d]) => `<div class="gem" data-go="/quran/${n}"><div class="gar">${esc(meta.surahs[n - 1].ar.replace('سُورَةُ ', ''))}</div><div class="gn">${nm}</div><div class="gd">${d}</div>${by[n] ? `<div class="progressbar" style="margin-top:6px"><div style="width:${by[n] / meta.surahs[n - 1].ayahs * 100}%"></div></div>` : ''}</div>`).join('')}</div>
      <h3 style="margin:16px 0 8px;font-size:17px">Special ayat</h3>${GEM_SPOTS.map(([r, nm, d]) => `<div class="surah-row" data-go="/quran/${r.split(':')[0]}?a=${r.split(':')[1]}"><div class="grow"><div style="font-weight:500">${nm}</div><div class="faint small">${d} · ${r}</div></div>${I.fwd}</div>`).join('')}`;
    if (tab === 'saved') { el.innerHTML = loadingHTML(); const { bookmarks } = await api('/bookmarks?kind=ayah'); el.innerHTML = bookmarks.length ? bookmarks.map(b => `<div class="surah-row" data-go="/quran/${b.ref.split(':')[0]}?a=${b.ref.split(':')[1]}"><span style="width:20px;height:20px;color:var(--accent)">${I.saveFill}</span><div class="grow"><div style="font-weight:500">${esc(b.title || b.ref)}</div><div class="faint small">${b.ref}${b.note ? ' · ' + esc(b.note) : ''}</div></div>${I.fwd}</div>`).join('') : empty('save', 'Bookmark ayat while reading to find them here.'); }
    bindGo(el);
  };
  $$('[data-t]', p).forEach(b => b.onclick = () => { tab = b.dataset.t; LS.set('qTab', tab); $$('[data-t]', p).forEach(x => x.classList.toggle('on', x === b)); drawList(); });
  drawList();
  try {
    prog = await api('/quran/progress'); const P = prog.progress, goal = P.daily_goal || 5;
    const last = meta.surahs[(P.last_surah || 1) - 1];
    $('#qprog').innerHTML = `<div class="card"><div class="row" style="gap:14px">${ring(prog.pct / 100, 76, 7, Math.round(prog.pct) + '%')}<div class="grow"><div style="font-weight:600">Khatam ${P.khatam_count + 1} progress</div><div class="muted small">${prog.cycleRead.toLocaleString()} / 6,236 ayat${P.khatam_count ? ` · ${P.khatam_count} khatam completed` : ''}</div>
      <div class="small" style="margin-top:4px">Today <b>${prog.todayPages}/${goal}</b> pages · ${prog.streak ? `<span style="color:var(--accent)">${prog.streak}-day streak</span>` : 'start a streak'}</div></div></div>
      <div class="progressbar" style="margin:12px 0 4px"><div style="width:${Math.min(100, prog.todayPages / goal * 100)}%"></div></div>
      <div class="row" style="margin-top:12px"><button class="btn accent grow" data-go="/quran/${P.last_surah || 1}?a=${P.last_ayah || 1}">${I.play} Continue · ${esc(last.tr)} ${P.last_surah || 1}:${P.last_ayah || 1}</button><button class="btn ghost sm" id="goalBtn" aria-label="Daily goal">${I.target}</button></div>
      <div class="faint small" style="margin-top:8px">Reading is tracked automatically as ayat scroll past or are played.</div></div>`;
    bindGo($('#qprog')); drawList();
    $('#goalBtn').onclick = () => sheet(`<h3>Daily Quran goal</h3><div class="chips wrap">${[1, 2, 4, 5, 10, 20].map(n => `<button class="chip ${n === goal ? 'on' : ''}" data-g="${n}">${n} page${n > 1 ? 's' : ''}</button>`).join('')}</div><div class="faint small">20 pages a day completes the Quran in a month.</div>`, (sh, close) => $$('[data-g]', sh).forEach(b => b.onclick = async () => { await api('/quran/prefs', { method: 'PUT', body: { daily_goal: +b.dataset.g } }); close(); viewQuran(); }));
  } catch (e) { $('#qprog').innerHTML = ''; }
}
function searchSheet(meta) {
  sheet(`<h3>Search the Quran</h3><form id="qsf" class="row"><input class="input" id="qsi" placeholder="e.g. patience, 2:255, Yasin" autofocus><button class="btn accent">${I.search}</button></form><div id="qsr" style="margin-top:10px"></div>`, (sh, close) => {
    $('#qsf', sh).onsubmit = async e => { e.preventDefault(); const v = $('#qsi', sh).value.trim(); if (!v) return; const out = $('#qsr', sh);
      const ref = v.match(/^(\d{1,3})(?::(\d{1,3}))?$/); if (ref) { close(); return go(`/quran/${ref[1]}${ref[2] ? '?a=' + ref[2] : ''}`); }
      const nm = meta.surahs.filter(s => (s.tr + ' ' + s.en).toLowerCase().replace(/[-‘'’ ]/g, '').includes(v.toLowerCase().replace(/[-‘'’ ]/g, '')));
      out.innerHTML = nm.map(s => `<div class="surah-row" data-n="${s.n}"><div class="grow"><b>${esc(s.tr)}</b> <span class="faint small">${s.n} · ${esc(s.en)}</span></div></div>`).join('') + loadingHTML('Searching translations…');
      $$('[data-n]', out).forEach(b => b.onclick = () => { close(); go('/quran/' + b.dataset.n); });
      try { const r = await fetch(`https://api.alquran.cloud/v1/search/${encodeURIComponent(v)}/all/en.pickthall`); const j = r.ok ? await r.json() : null; const ms = j?.data?.matches || [];
        out.querySelector('.loading')?.remove();
        out.insertAdjacentHTML('beforeend', ms.length ? `<div class="faint small" style="margin:8px 0">${j.data.count} ayat mention “${esc(v)}”</div>` + ms.slice(0, 40).map(m => `<div class="list-item tap" data-r="${m.surah.number}:${m.numberInSurah}"><div><div class="small" style="color:var(--accent);font-weight:600">${esc(m.surah.englishName)} ${m.surah.number}:${m.numberInSurah}</div><div style="font-family:var(--serif)">${esc(m.text)}</div></div></div>`).join('') : '<div class="faint small">No ayat found in translation.</div>');
        $$('[data-r]', out).forEach(b => b.onclick = () => { const [s, a] = b.dataset.r.split(':'); close(); go(`/quran/${s}?a=${a}`); });
      } catch { out.querySelector('.loading')?.remove(); }
    };
  });
}

// ================= QURAN READER =================
export async function viewSurah(s, startAyah) {
  s = +s; const meta = await QMETA(); const sm = meta.surahs[s - 1]; if (!sm) return go('/quran');
  const p = shell(esc(sm.tr), { back: '/quran', right: `<button class="iconbtn" id="rOpts" aria-label="Reading options">${I.sliders}</button>` });
  const opts = () => ({ tr: LS.get('qTr', 'en.pickthall'), tr2: LS.get('qTr2', ''), showTr: LS.get('qShowTr', true), tajweed: LS.get('qTajweed', false) });
  p.innerHTML = loadingHTML();
  const qar = await loadJSON('/data/quran-ar.json'); const ar = qar[s - 1];
  let trs = [], tr2 = [], tj = null; const o = opts();
  try { trs = o.showTr ? await translation(o.tr, s) : []; } catch (e) { toast(e.message + ' — showing Pickthall'); trs = await translation('en.pickthall', s); }
  try { if (o.showTr && o.tr2) tr2 = await translation(o.tr2, s); } catch {}
  try { if (o.tajweed) tj = await tajweedText(s); } catch (e) { toast(e.message); }
  const trList = await loadJSON('/data/quran-translations.json'); const trName = id => 'Marmaduke Pickthall (public domain)';
  const { bookmarks } = await api('/bookmarks?kind=ayah').catch(() => ({ bookmarks: [] })); const bm = new Set(bookmarks.map(b => b.ref));
  p.innerHTML = `<div style="text-align:center;padding:10px 0 4px"><div class="ar" style="text-align:center;font-size:30px">${esc(sm.ar)}</div><div class="muted small">${esc(sm.en)} · ${sm.ayahs} ayat · ${sm.type}</div>${o.showTr ? `<div class="faint small">${esc(trName(o.tr))}${o.tr2 ? ' + ' + esc(trName(o.tr2)) : ''}</div>` : ''}</div>
    ${o.tajweed ? `<div class="tj-legend card soft" style="padding:10px 12px"><span class="tj-g">Ghunnah</span><span class="tj-q">Qalqalah</span><span class="tj-f">Ikhfa</span><span class="tj-i">Iqlab</span><span class="tj-a">Idgham</span><span class="tj-m">Madd</span><span class="tj-l">Silent</span></div>` : ''}
    ${s !== 1 && s !== 9 ? `<div class="bismillah">${BISM}</div>` : ''}
    <div id="ayat">${ar.map((t, i) => { const a = i + 1, ref = `${s}:${a}`; return `<div class="ayah" id="a${a}" data-a="${a}"><div class="tools"><span class="num">${ref}</span>
      <button data-play="${a}" aria-label="Play ayah">${I.play}</button><button data-bm="${a}" class="${bm.has(ref) ? 'on' : ''}" aria-label="Bookmark">${bm.has(ref) ? I.saveFill : I.save}</button><button data-more="${a}" aria-label="More">${I.more}</button></div>
      <div class="ar">${o.tajweed && tj ? tajweedHTML(a === 1 && s !== 1 && s !== 9 && arAyah(s, a, t) !== stripBOM(t) ? tj[i].split(' ').slice(4).join(' ') : tj[i]) : esc(arAyah(s, a, t))} <span class="ayah-end">﴿${AR_DIGITS(a)}﴾</span></div>
      ${o.showTr && trs[i] ? `<div class="tr">${esc(trs[i])}</div>` : ''}${o.showTr && tr2[i] ? `<div class="tr2">${esc(tr2[i])}</div>` : ''}</div>`; }).join('')}</div>
    <div class="row" style="justify-content:space-between;margin:18px 0">${s > 1 ? `<button class="btn ghost sm" data-go="/quran/${s - 1}">${I.back} ${esc(meta.surahs[s - 2].tr)}</button>` : '<span></span>'}${s < 114 ? `<button class="btn ghost sm" data-go="/quran/${s + 1}">${esc(meta.surahs[s].tr)} ${I.fwd}</button>` : ''}</div>
    <div class="player" id="player"><button class="iconbtn" id="pPrev" aria-label="Previous ayah">${I.prev}</button><button class="pbtn" id="pPlay" aria-label="Play">${I.play}</button><button class="iconbtn" id="pNext" aria-label="Next ayah">${I.next}</button>
      <div class="pinfo"><b id="pTitle">${esc(sm.tr)}</b><span class="faint" id="pSub">${esc(reciter()[1])}</span></div><button class="iconbtn" id="pRep" aria-label="Repeat ayah">${I.repeat}</button></div>`;
  bindGo(p);
  // ---- auto-tracking: ayah counted when visible ≥ 2.5s, or played ----
  const seen = new Map(), queued = new Set(); let sendT = null;
  const flush = () => { if (!queued.size) return; const ayat = [...queued].map(a => [s, a]); queued.clear(); api('/quran/read', { body: { ayat } }).then(r => { if (r.khatam) toast('Khatam complete! May Allah accept it'); }).catch(() => {}); };
  const mark = a => { if (seen.get(a) === 'done') return; seen.set(a, 'done'); queued.add(a); clearTimeout(sendT); sendT = setTimeout(flush, 3000); };
  // dwell-time tracker: every second, any ayah ≥60% visible accumulates time; ≥2s (or ≥1s per 40 chars for long ayat, max 8s) counts as read
  let lastPos = null; const dwell = new Map(); const els = $$('.ayah', p);
  const tick = () => { const main = $('#main'); if (!main || document.hidden) return; const vh = main.getBoundingClientRect(); let mid = null;
    for (const el of els) { const r = el.getBoundingClientRect(); if (r.bottom < vh.top || r.top > vh.bottom) continue;
      const vis = (Math.min(r.bottom, vh.bottom) - Math.max(r.top, vh.top)) / Math.min(r.height, vh.height); const a = +el.dataset.a;
      if (vis >= 0.6) { const need = Math.min(8, Math.max(2, Math.round((ar[a - 1] || '').length / 40))); const t = (dwell.get(a) || 0) + 1; dwell.set(a, t); if (t >= need) mark(a); }
      if (mid == null && r.top >= vh.top - 20) mid = a; }
    if (mid) lastPos = mid; };
  const dwellT = setInterval(tick, 1000); onCleanup(() => clearInterval(dwellT));
  const savePos = () => { if (lastPos) api('/quran/prefs', { method: 'PUT', body: { last_surah: s, last_ayah: lastPos } }).catch(() => {}); };
  const posT = setInterval(savePos, 15000); onCleanup(() => { clearInterval(posT); savePos(); flush(); });
  // ---- audio ----
  const audio = new Audio(); audio.preload = 'auto'; let cur = null, repeat = false, playing = false;
  const setBtn = () => { $('#pPlay').innerHTML = playing ? I.pause : I.play; $$('[data-play]', p).forEach(b => b.innerHTML = playing && +b.dataset.play === cur ? I.pause : I.play); };
  async function playAyah(a) {
    if (a < 1 || a > sm.ayahs) { playing = false; setBtn(); duckNasheed(false); return; }
    cur = a; $$('.ayah.playing', p).forEach(x => x.classList.remove('playing')); const el = $('#a' + a); el?.classList.add('playing'); el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    try { audio.src = await ayahAudioUrl(s, a); } catch (e) { toast(e.message); return; } playing = true; setBtn(); duckNasheed(true);
    $('#pTitle').textContent = `${sm.tr} ${s}:${a}`; $('#pSub').textContent = reciter()[1];
    try { await audio.play(); } catch (e) { playing = false; setBtn(); toast('Could not play audio — check your connection'); }
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: `${sm.tr} ${s}:${a}`, artist: reciter()[1], album: 'Quran' });
  }
  audio.onended = () => { mark(cur); if (repeat) playAyah(cur); else playAyah(cur + 1); };
  audio.onerror = () => { if (playing) { toast('Audio unavailable for this reciter — try another'); playing = false; setBtn(); } };
  $('#pPlay').onclick = () => { if (playing) { audio.pause(); playing = false; setBtn(); duckNasheed(false); } else if (cur && audio.src) { audio.play(); playing = true; setBtn(); } else playAyah(lastPos || 1); };
  $('#pNext').onclick = () => playAyah((cur || 0) + 1); $('#pPrev').onclick = () => playAyah(Math.max(1, (cur || 2) - 1));
  $('#pRep').onclick = () => { repeat = !repeat; $('#pRep').style.color = repeat ? 'var(--accent)' : ''; toast(repeat ? 'Repeating this ayah' : 'Repeat off'); };
  if ('mediaSession' in navigator) { navigator.mediaSession.setActionHandler('nexttrack', () => playAyah((cur || 0) + 1)); navigator.mediaSession.setActionHandler('previoustrack', () => playAyah(Math.max(1, (cur || 2) - 1))); }
  onCleanup(() => { audio.pause(); audio.src = ''; duckNasheed(false); });
  $$('[data-play]', p).forEach(b => b.onclick = () => { const a = +b.dataset.play; if (playing && cur === a) { audio.pause(); playing = false; setBtn(); } else playAyah(a); });
  $$('[data-bm]', p).forEach(b => b.onclick = async () => { const a = +b.dataset.bm, ref = `${s}:${a}`; const r = await api('/bookmarks', { body: { kind: 'ayah', ref, title: `${sm.tr} ${ref}`, toggle: true } }); const on = !r.removed; b.classList.toggle('on', on); b.innerHTML = on ? I.saveFill : I.save; vibrate(10); toast(on ? 'Bookmarked' : 'Bookmark removed'); });
  $$('[data-more]', p).forEach(b => b.onclick = () => { const a = +b.dataset.more, ref = `${s}:${a}`; const text = `${arAyah(s, a, ar[a - 1])}\n\n${trs[a - 1] || ''}\n— Quran ${ref} (${sm.tr})`;
    sheet(`<h3>${esc(sm.tr)} ${ref}</h3>
      <button class="opt" id="oTafsir"><span class="e">${I.khatam}</span><div><div>Explain with Alim</div><div class="d">Tafsir from Ibn Kathir & classical sources</div></div></button>
      <button class="opt" id="oHifz"><span class="e">${I.brain}</span><div><div>Add to Hifz</div><div class="d">Memorise this ayah with spaced repetition</div></div></button>
      <button class="opt" id="oTaj"><span class="e">${I.mic}</span><div><div>Practise recitation</div><div class="d">Record and get tajweed feedback</div></div></button>
      <button class="opt" id="oCopy"><span class="e">${I.copy}</span><div>Copy</div></button><button class="opt" id="oShare"><span class="e">${I.share}</span><div>Share</div></button>`, (sh, close) => {
      $('#oTafsir', sh).onclick = () => { close(); askAlim(`Explain Quran ${ref} (${sm.tr}) — the meaning, context of revelation if known, and lessons, citing tafsir Ibn Kathir or other classical tafsir. Then tell me how I can apply it.`, 'teach'); };
      $('#oHifz', sh).onclick = async () => { await api('/hifz/add', { body: { surah: s, from: a, to: a } }); close(); toast('Added to Hifz'); };
      $('#oTaj', sh).onclick = () => { close(); go(`/tajweed/practice?s=${s}&a=${a}`); };
      $('#oCopy', sh).onclick = async () => { try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { toast('Copy failed'); } close(); };
      $('#oShare', sh).onclick = async () => { close(); try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast('Copied to share'); } } catch {} };
    }); });
  $('#rOpts').onclick = () => readerOptions(trList, () => viewSurah(s, lastPos));
  if (startAyah > 1) setTimeout(() => { const el = $('#a' + startAyah); if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('playing'); setTimeout(() => el.classList.remove('playing'), 2000); } }, 60);
}
export function translationGroups(all, query = '', selected = []) {
  const q = query.trim().toLowerCase();
  const langs = new Map();
  all.filter(t => selected.includes(t.id) || `${t.lang} ${t.name} ${t.id}`.toLowerCase().includes(q)).forEach(t => {
    if (!langs.has(t.lang)) langs.set(t.lang, []);
    langs.get(t.lang).push(t);
  });
  return [...langs].sort(([a], [b]) => a.localeCompare(b)).map(([lang, items]) => ({lang, items}));
}
function readerOptions(trList, reload) {
  const o = { tr: LS.get('qTr', 'en.pickthall'), tr2: LS.get('qTr2', ''), showTr: LS.get('qShowTr', true), tajweed: LS.get('qTajweed', false) };
  const all = [{ id: 'en.pickthall', lang: 'English', name: 'Marmaduke Pickthall (public domain)' }];
  const opt = (sel, query = '', selected = []) => translationGroups(all, query, selected).map(g => `<optgroup label="${escAttr(g.lang)}">${g.items.map(t => `<option value="${escAttr(t.id)}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)}${t.source === 'fawaz' ? ' · Quran API' : ''}</option>`).join('')}</optgroup>`).join('');
  sheet(`<h3>Reading options</h3>
    <div class="list-item"><div class="grow">Show translation</div><label class="toggle"><input type="checkbox" id="oShow" ${o.showTr ? 'checked' : ''}><span></span></label></div>
    <div class="list-item"><div class="grow">Colour-coded tajweed</div><label class="toggle"><input type="checkbox" id="oTj" ${o.tajweed ? 'checked' : ''}><span></span></label></div>
    <label class="lbl" for="oTrSearch">Find a translation</label><input class="input" id="oTrSearch" type="search" placeholder="Search language or translator"><div class="faint small">Grouped by language. Selected editions stay visible. Yusuf Ali is bundled offline; other editions need internet on first load.</div>
    <label class="lbl">Translation (${all.length} available)</label><select class="input" id="oTr">${opt(o.tr)}</select>
    <label class="lbl">Second translation (optional)</label><select class="input" id="oTr2"><option value="">None</option>${opt(o.tr2)}</select>
    ${recitationOn() ? '' : '<div hidden>'}<label class="lbl">Reciter</label><select class="input" id="oRec">${RECITERS.map(r => `<option value="${r[0]}" ${r[0] === reciter()[0] ? 'selected' : ''}>${r[1]}</option>`).join('')}</select>${recitationOn() ? '' : '</div>'}
    <label class="lbl">Arabic size</label><input type="range" id="oSize" min="20" max="44" value="${state.user.settings.arabicSize || 28}" style="width:100%">
    <button class="btn accent block" id="oApply" style="margin-top:14px">Apply</button>`, (sh, close) => {
    $('#oTrSearch', sh).oninput = e => {
      const first = $('#oTr', sh).value, second = $('#oTr2', sh).value;
      $('#oTr', sh).innerHTML = opt(first, e.target.value, [first, second]);
      $('#oTr2', sh).innerHTML = '<option value="">None</option>' + opt(second, e.target.value, [first, second]);
      $('#oTr', sh).value = first; $('#oTr2', sh).value = second;
    };
    $('#oSize', sh).oninput = e => document.documentElement.style.setProperty('--ar-size', e.target.value + 'px');
    $('#oApply', sh).onclick = async () => { LS.set('qShowTr', $('#oShow', sh).checked); LS.set('qTajweed', $('#oTj', sh).checked); LS.set('qTr', $('#oTr', sh).value); LS.set('qTr2', $('#oTr2', sh).value); LS.set('reciter', $('#oRec', sh).value);
      const { saveSettings } = await import('./core.js'); saveSettings({ arabicSize: +$('#oSize', sh).value }).catch(() => {}); api('/quran/prefs', { method: 'PUT', body: { translation: $('#oTr', sh).value, reciter: $('#oRec', sh).value } }).catch(() => {}); close(); reload(); };
  });
}

// ================= HADITH =================
export async function viewHadithHome() {
  const p = shell('Hadith', { right: `<button class="iconbtn" id="hSaved" aria-label="Saved hadith">${I.save}</button>` });
  const books = await loadJSON('/data/hadith-books.json'); const h40 = await loadJSON('/data/hadith40.json');
  const today = h40.nawawi[dayIndex(h40.nawawi.length, 7)];
  p.innerHTML = `<form id="hsf" class="row" style="margin:8px 0 12px"><input class="input" id="hsi" placeholder="Search hadith…" type="search"><button class="btn accent" aria-label="Search">${I.search}</button></form><div id="hres"></div>
    <div class="card soft"><div class="faint small">Hadith of the day · 40 Hadith an-Nawawi #${today.n}</div><div style="font-family:var(--serif);font-size:16px;line-height:1.6;margin-top:6px;white-space:pre-wrap">${esc(today.en)}</div></div>
    <h3 style="margin:16px 0 8px;font-size:17px">Collections</h3>
    ${books.map(b => `<div class="surah-row" data-go="/hadith/${b.id}"><div class="surah-num">${I.ayahStar}<span style="font-size:11px">${b.id.slice(0, 2).toUpperCase()}</span></div><div class="grow"><div style="font-weight:500">${esc(b.name)}</div><div class="faint small">${Number(b.count).toLocaleString()} hadith${b.sections.length > 1 ? ` · ${b.sections.length} books` : ''}</div></div>${I.fwd}</div>`).join('')}
    <div class="faint small" style="margin:12px 0">English translations via the open hadith-api (fawazahmed0), numbering as on sunnah.com. Gradings: Bukhari & Muslim are sahih; check gradings for other collections.</div>`;
  bindGo(p);
  $('#hSaved').onclick = async () => { const { bookmarks } = await api('/bookmarks?kind=hadith'); sheet(`<h3>Saved hadith</h3>${bookmarks.map(b => `<div class="hadith"><div class="hn">${esc(b.title || b.ref)}</div><div class="ht">${esc(b.note || '')}</div></div>`).join('') || '<div class="faint">Nothing saved yet.</div>'}`); };
  $('#hsf').onsubmit = async e => { e.preventDefault(); const v = $('#hsi').value.trim(); if (!v) return; const out = $('#hres'); out.innerHTML = loadingHTML('Searching…');
    try { const { results } = await api('/hadith/search?q=' + encodeURIComponent(v)); out.innerHTML = results.length ? `<div class="card">${results.map(h => hadithHTML(h.ref, '', h.text, h.ref + (h.grade ? ' · ' + h.grade : ''))).join('')}</div>` : '<div class="faint small" style="margin-bottom:10px">No hadith found. Try a simpler word.</div>'; bindHadith(out); }
    catch (er) { out.innerHTML = `<div class="faint small">${esc(er.message)}</div>`; } };
}
function hadithHTML(book, n, text, bookName, ar) {
  return `<div class="hadith"><div class="hn">${esc(bookName)} ${n}<span style="margin-left:auto;display:flex;gap:2px"><button class="iconbtn sm" data-hs="${escAttr(book)}|${n}" aria-label="Save">${I.save}</button><button class="iconbtn sm" data-ha="${escAttr(book)}|${n}" aria-label="Ask Alim">${I.chat}</button><button class="iconbtn sm" data-hc="1" aria-label="Copy">${I.copy}</button></span></div>${ar ? `<div class="ar">${esc(ar)}</div>` : ''}<div class="ht">${esc(text)}</div></div>`;
}
function bindHadith(root) {
  $$('[data-hs]', root).forEach(b => b.onclick = async () => { const [bk, n] = b.dataset.hs.split('|'); const t = b.closest('.hadith').querySelector('.ht').textContent; await api('/bookmarks', { body: { kind: 'hadith', ref: n ? `${bk}:${n}` : bk, title: b.closest('.hn').firstChild.textContent.trim(), note: t.slice(0, 1500), toggle: true } }); b.innerHTML = I.saveFill; toast('Saved'); });
  $$('[data-ha]', root).forEach(b => b.onclick = () => { const t = b.closest('.hadith').querySelector('.ht').textContent; askAlim(`Explain this hadith (${b.closest('.hn').firstChild.textContent.trim()}): its authenticity, meaning, and how to apply it today.\n\n"${t.slice(0, 1200)}"`, 'teach'); });
  $$('[data-hc]', root).forEach(b => b.onclick = async () => { const h = b.closest('.hadith'); try { await navigator.clipboard.writeText(h.querySelector('.ht').textContent + '\n— ' + h.querySelector('.hn').firstChild.textContent.trim()); toast('Copied'); } catch {} });
}
export async function viewHadithBook(id, sec) {
  const books = await loadJSON('/data/hadith-books.json'); const b = books.find(x => x.id === id); if (!b) return go('/hadith');
  if (id === 'nawawi' || id === 'qudsi') {
    const p = shell(esc(b.name), { back: '/hadith' }); const h40 = await loadJSON('/data/hadith40.json');
    p.innerHTML = h40[id].map(h => hadithHTML(id, h.n, h.en, b.name, h.ar)).join(''); bindHadith(p); return;
  }
  if (!sec && b.sections.length > 1) {
    const p = shell(esc(b.name), { back: '/hadith' });
    p.innerHTML = b.sections.map(s => `<div class="surah-row" data-go="/hadith/${id}/${s.n}"><div class="surah-num">${I.ayahStar}<span>${s.n}</span></div><div class="grow"><div style="font-weight:500">${esc(s.t || 'Book ' + s.n)}</div><div class="faint small">Hadith ${s.f}–${s.l}</div></div>${I.fwd}</div>`).join(''); bindGo(p); return;
  }
  const secN = sec || b.sections[0]?.n || 1; const sObj = b.sections.find(x => String(x.n) === String(secN));
  const p = shell(esc(sObj?.t || b.name), { back: b.sections.length > 1 ? '/hadith/' + id : '/hadith' }); p.innerHTML = loadingHTML('Loading — first open of a chapter translates it…');
  try {
    // Arabic text is public domain; English is Shukr's own translation (publisher translations are copyrighted).
    const [arr, tr] = await Promise.all([fetch(`https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/${b.ara}/sections/${secN}.min.json`).then(r => r.json()), api(`/hadith/tr?book=${encodeURIComponent(id)}&sec=${secN}`).catch(() => ({ items: {} }))]);
    const arMap = new Map((arr?.hadiths || []).map(h => [h.hadithnumber, h.text]));
    const list = (arr?.hadiths || []).filter(h => h.text && h.text.trim()).map(h => ({ ...h, text: tr.items?.[h.hadithnumber] || '' }));
    p.innerHTML = `<div class="faint small" style="margin:6px 0">${esc(b.name)} · ${list.length} hadith</div>` + list.map(h => hadithHTML(id, h.hadithnumber, h.text || '(English translation is being prepared — Arabic shown above.)', b.name, (LS.get('hadithAr', true) || !h.text) ? arMap.get(h.hadithnumber) : '') + (h.grades?.length ? `<div class="faint small" style="margin:-8px 0 8px">Grade: ${h.grades.map(g => esc(g.grade + ' (' + g.name + ')')).join(', ')}</div>` : '')).join('')
      + `<div class="row" style="justify-content:space-between;margin:16px 0">${+secN > b.sections[0].n ? `<button class="btn ghost sm" data-go="/hadith/${id}/${+secN - 1}">${I.back} Previous</button>` : '<span></span>'}${+secN < b.sections[b.sections.length - 1].n ? `<button class="btn ghost sm" data-go="/hadith/${id}/${+secN + 1}">Next ${I.fwd}</button>` : ''}</div>
      <div class="list-item"><div class="grow small">Show Arabic text</div><label class="toggle"><input type="checkbox" id="hAr" ${LS.get('hadithAr', true) ? 'checked' : ''}><span></span></label></div>`;
    bindGo(p); bindHadith(p); $('#hAr').onchange = e => { LS.set('hadithAr', e.target.checked); viewHadithBook(id, sec); };
  } catch (e) { p.innerHTML = empty('alert', 'Could not load hadith. Check your connection.'); }
}

// ================= HIFZ =================
export async function viewHifz() {
  const p = shell('Hifz'); const meta = await QMETA(); p.innerHTML = loadingHTML();
  const h = await api('/hifz');
  const surahs = Object.entries(h.bySurah).map(([n, v]) => ({ n: +n, ...v })).sort((a, b) => a.n - b.n);
  p.innerHTML = `<div class="card"><div class="row" style="gap:14px">${ring(h.memorised / 6236, 84, 8, h.pctQuran + '%')}<div class="grow"><div style="font-weight:600">${h.memorised.toLocaleString()} ayat memorised</div><div class="muted small">${h.added} in your hifz plan · ${surahs.filter(x => x.memorised === x.total).length} complete surahs</div>
    <div class="small" style="margin-top:4px">${h.dueCount ? `<b style="color:var(--accent)">${h.dueCount} due for review today</b>` : h.added ? 'No reviews due today — well done' : 'Add a surah to begin'}</div></div></div>
    <div class="row" style="margin-top:12px">${h.dueCount ? `<button class="btn accent grow" data-go="/hifz/review">${I.retry} Review ${h.dueCount}</button>` : ''}<button class="btn ${h.dueCount ? 'ghost' : 'accent'} grow" id="addH">${I.plus} Add surah</button></div></div>
    <div class="card soft small muted"><b>How it works:</b> add ayat you are learning. Each day, review due ayat: listen, recite from memory, reveal, and grade yourself. Spaced repetition (SM-2) schedules the next review — ayat become “memorised” after consistent recall over 2+ weeks. You can also test your recitation with the mic.</div>
    ${surahs.length ? `<h3 style="margin:14px 0 6px;font-size:17px">Your surahs</h3>${surahs.map(x => `<div class="surah-row" data-go="/hifz/surah/${x.n}"><div class="surah-num">${I.ayahStar}<span>${x.n}</span></div><div class="grow"><div style="font-weight:500">${esc(meta.surahs[x.n - 1].tr)}</div><div class="progressbar" style="margin-top:6px"><div style="width:${x.memorised / x.total * 100}%"></div></div><div class="faint small" style="margin-top:3px">${x.memorised}/${x.total} memorised · ${x.added} in plan</div></div>${I.fwd}</div>`).join('')}`
    : empty('brain', 'Start with a short surah like Al‑Ikhlas, Al‑Falaq or An‑Nas — or one you already know.')}
    <h3 style="margin:16px 0 6px;font-size:17px">Already memorised?</h3><div class="faint small" style="margin-bottom:8px">Mark whole surahs you already know so your tracker is accurate.</div><button class="btn ghost block" id="markKnown">Mark surahs as memorised</button>`;
  bindGo(p);
  const pick = (title, cb) => sheet(`<h3>${title}</h3><select class="input" id="hs">${meta.surahs.map(s => `<option value="${s.n}" ${s.n === 112 ? 'selected' : ''}>${s.n}. ${esc(s.tr)} (${s.ayahs})</option>`).join('')}</select>
    <div class="grid2" style="margin-top:8px"><div><label class="lbl">From ayah</label><input class="input" id="hf" type="number" value="1" min="1"></div><div><label class="lbl">To ayah</label><input class="input" id="ht" type="number" value="4" min="1"></div></div>
    <button class="btn accent block" id="hgo" style="margin-top:14px">Save</button>`, (sh, close) => {
    const upd = () => { const s = meta.surahs[$('#hs', sh).value - 1]; $('#ht', sh).value = s.ayahs; $('#ht', sh).max = s.ayahs; $('#hf', sh).max = s.ayahs; }; $('#hs', sh).onchange = upd; upd();
    $('#hgo', sh).onclick = async () => { await cb(+$('#hs', sh).value, +$('#hf', sh).value, +$('#ht', sh).value); close(); viewHifz(); }; });
  $('#addH').onclick = () => pick('Add to hifz plan', async (s, f, t) => { const r = await api('/hifz/add', { body: { surah: s, from: f, to: t } }); toast(`${r.added} ayat added`); });
  $('#markKnown').onclick = () => pick('Mark as memorised', async (s, f, t) => { await api('/hifz/add', { body: { surah: s, from: f, to: t } }); for (let a = f; a <= t; a++) await api('/hifz/set', { body: { surah: s, ayah: a, status: 'memorised' } }); toast('Marked as memorised'); });
}
export async function viewHifzSurah(s) {
  s = +s; const meta = await QMETA(); const sm = meta.surahs[s - 1]; const p = shell(esc(sm.tr), { back: '/hifz' });
  const [h, qar] = await Promise.all([api('/hifz'), loadJSON('/data/quran-ar.json')]); const items = h.items.filter(i => i.surah === s);
  const lbl = { memorised: ['green', 'Memorised'], learning: ['', 'Learning'], needs_review: ['gold', 'Needs review'], new: ['gray', 'New'] };
  p.innerHTML = `<div class="row" style="margin:8px 0 12px"><button class="btn accent grow" data-go="/hifz/review?s=${s}">${I.retry} Practise this surah</button><button class="btn danger sm" id="rmS">${I.trash}</button></div>
    ${items.map(i => `<div class="ayah"><div class="tools"><span class="num">${s}:${i.ayah}</span><span class="badge ${lbl[i.status][0]}">${lbl[i.status][1]}</span>${i.due ? `<span class="faint small" style="margin-left:8px">next ${i.due <= localDay() ? 'today' : i.due}</span>` : ''}</div><div class="ar">${esc(arAyah(s, i.ayah, qar[s - 1][i.ayah - 1]))}</div></div>`).join('')}`;
  bindGo(p);
  $('#rmS').onclick = async () => { if (await confirmSheet('Remove from hifz?', `Removes ${esc(sm.tr)} and its review history from your hifz plan.`, 'Remove', true)) { await api('/hifz/' + s, { method: 'DELETE' }); go('/hifz'); } };
}
export async function viewHifzReview(onlySurah) {
  const p = shell('Hifz review', { back: '/hifz' }); const meta = await QMETA();
  const [h, qar] = await Promise.all([api('/hifz'), loadJSON('/data/quran-ar.json')]);
  let queue = onlySurah ? h.items.filter(i => i.surah === +onlySurah) : h.due;
  if (!queue.length) { p.innerHTML = empty('check', 'Nothing due right now. Alhamdulillah!', `<div style="margin-top:14px"><button class="btn" data-go="/hifz">Back to Hifz</button></div>`); bindGo(p); return; }
  let i = 0, mode = LS.get('hifzMode', 'first'), audio = new Audio(), rec = null; onCleanup(() => { audio.pause(); rec?.cancel(); });
  function draw() {
    if (i >= queue.length) { p.innerHTML = `<div class="empty"><div class="big">${I.check}</div><h2 style="margin-bottom:8px">Session complete</h2>You reviewed ${queue.length} ayat. May Allah make the Quran firm in your heart.</div><button class="btn accent block" data-go="/hifz">Done</button>`; bindGo(p); vibrate([30, 60, 30]); return; }
    const it = queue[i], words = arAyah(it.surah, it.ayah, qar[it.surah - 1][it.ayah - 1]).split(' ');
    p.innerHTML = `<div class="row between small faint" style="margin:6px 0"><span>${i + 1} / ${queue.length}</span><span>${esc(meta.surahs[it.surah - 1].tr)} ${it.surah}:${it.ayah}</span></div><div class="progressbar"><div style="width:${i / queue.length * 100}%"></div></div>
      <div class="seg" style="margin:12px 0">${[['first', 'First word'], ['hidden', 'All hidden'], ['shown', 'Shown']].map(([k, l]) => `<button data-m="${k}" class="${mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="card"><div class="ar" style="line-height:2.4">${words.map((w, j) => `<span class="hw ${mode === 'hidden' || (mode === 'first' && j > 0) ? 'hid' : ''}">${esc(w)}</span>`).join(' ')}</div><div class="faint small" style="text-align:center;margin-top:6px">Tap a hidden word to peek</div></div>
      <div class="row" style="justify-content:center;gap:10px;margin:8px 0 14px"><button class="btn ghost sm" id="hPlay">${I.play} Listen</button><button class="btn ghost sm" id="hReveal">${I.eye} Reveal</button><button class="btn ghost sm" id="hRec">${I.mic} Test me</button></div>
      <div id="hFb"></div>
      <div class="faint small" style="text-align:center;margin-bottom:6px">How well did you recall it?</div>
      <div class="grid2" style="grid-template-columns:repeat(4,1fr);gap:6px">${[[0, 'Forgot', 'danger'], [3, 'Hard', 'ghost'], [4, 'Good', 'soft'], [5, 'Easy', 'accent']].map(([g, l, c]) => `<button class="btn ${c} sm" data-g="${g}">${l}</button>`).join('')}</div>`;
    $$('.hw', p).forEach(w => w.onclick = () => w.classList.remove('hid'));
    $$('[data-m]', p).forEach(b => b.onclick = () => { mode = b.dataset.m; LS.set('hifzMode', mode); draw(); });
    $('#hReveal').onclick = () => $$('.hw', p).forEach(w => w.classList.remove('hid'));
    $('#hPlay').onclick = async () => { try { audio.src = await ayahAudioUrl(it.surah, it.ayah); } catch (e) { return toast(e.message); } audio.play().catch(() => toast('Audio unavailable')); };
    $('#hRec').onclick = async () => { const b = $('#hRec');
      if (rec) { b.innerHTML = '<span class="spin"></span>'; const blob = await rec.stop(); rec = null; try { const r = await assess(blob, it.surah, it.ayah); $('#hFb').innerHTML = assessHTML(r, false); $$('.hw', p).forEach(w => w.classList.remove('hid')); } catch (e) { toast(e.message); } b.innerHTML = `${I.mic} Test me`; return; }
      try { rec = await recordAudio({ maxMs: 60000 }); b.innerHTML = '<span class="recdot"></span> Stop'; } catch (e) { toast(e.message || 'Microphone permission denied'); } };
    $$('[data-g]', p).forEach(b => b.onclick = async () => { await api('/hifz/review', { body: { surah: it.surah, ayah: it.ayah, grade: +b.dataset.g } }).catch(e => toast(e.message)); vibrate(12); i++; draw(); });
  }
  draw();
}

// ================= TAJWEED =================
const RULES = [
  { k: 'Noon sakinah & tanween', items: [['Izhar', 'Pronounce noon clearly before the throat letters ء ه ع ح غ خ.', 'مِنْ عِلْمٍ'], ['Idgham', 'Merge noon into the next letter if it is one of ي ر م ل و ن (with ghunnah for ي ن م و).', 'مَن يَقُولُ'], ['Iqlab', 'Noon becomes a hidden meem before ب, with ghunnah.', 'مِنۢ بَعْدِ'], ['Ikhfa', 'Hide the noon with ghunnah before the remaining 15 letters.', 'مِن قَبْلِ']] },
  { k: 'Meem sakinah', items: [['Ikhfa shafawi', 'Hide the meem before ب with ghunnah.', 'تَرْمِيهِم بِحِجَارَةٍ'], ['Idgham shafawi', 'Merge meem into a following meem with ghunnah.', 'لَهُم مَّا'], ['Izhar shafawi', 'Pronounce meem clearly before all other letters.', 'لَهُمْ فِيهَا']] },
  { k: 'Qalqalah', items: [['Qalqalah', 'An echoing bounce on ق ط ب ج د when they carry sukoon; stronger at the end of an ayah.', 'أَحَدٌ ۝ ٱلصَّمَدُ']] },
  { k: 'Madd (elongation)', items: [['Madd tabee‘i', 'Natural 2-count elongation on ا و ي.', 'قَالَ'], ['Madd muttasil', 'Madd letter followed by hamzah in the same word: 4–5 counts (obligatory).', 'جَآءَ'], ['Madd munfasil', 'Madd letter at word end, hamzah at the next word: 2–5 counts.', 'إِنَّآ أَنزَلْنَٰهُ'], ['Madd lazim', 'Madd followed by a permanent sukoon/shaddah: 6 counts.', 'ٱلضَّآلِّينَ'], ['Madd ‘arid', 'Stopping on a word after a madd letter: 2, 4 or 6 counts.', 'ٱلْعَٰلَمِينَ']] },
  { k: 'Ghunnah & others', items: [['Ghunnah', 'Nasal sound of 2 counts on نّ and مّ (with shaddah).', 'إِنَّ'], ['Lam of Allah', 'Heavy (tafkheem) after fatha/damma, light after kasra.', 'قَالَ ٱللَّهُ / بِسْمِ ٱللَّهِ'], ['Ra heavy/light', 'Ra is heavy with fatha/damma, light with kasra.', 'رَبِّ / رِزْقًا']] }
];
export async function viewTajweed() {
  const p = shell('Tajweed');
  const hist = await api('/tajweed/history').catch(() => ({ attempts: [] })); const meta = await QMETA();
  const avg = hist.attempts.length ? Math.round(hist.attempts.reduce((a, x) => a + x.score, 0) / hist.attempts.length) : null;
  p.innerHTML = `<div class="card"><div class="row"><div class="big-mic" style="width:56px;height:56px;margin:0">${I.mic}</div><div class="grow"><div style="font-weight:600">Recite & get feedback</div><div class="muted small">Record an ayah; AI compares your recitation word-by-word and points out tajweed rules to check.</div></div></div>
    <div class="row" style="margin-top:12px"><button class="btn accent grow" data-go="/tajweed/practice?s=1&a=1">Start with Al-Fatihah</button><button class="btn ghost grow" id="pickA">Choose ayah</button></div>
    ${avg != null ? `<div class="faint small" style="margin-top:10px">${hist.attempts.length} attempts · average accuracy ${avg}%</div>` : ''}</div>
    <h3 style="margin:16px 0 8px;font-size:17px">Learn the rules</h3>
    ${RULES.map(g => `<div class="card flat"><div style="font-weight:600;margin-bottom:6px">${g.k}</div>${g.items.map(([n, d, ex]) => `<div class="list-item" style="align-items:flex-start"><div class="grow"><div style="font-weight:500">${n}</div><div class="muted small">${d}</div></div><div class="ar" style="font-size:22px;line-height:1.7;max-width:45%">${ex}</div></div>`).join('')}</div>`).join('')}
    <div class="card soft small muted">Tip: turn on <b>colour-coded tajweed</b> in the Quran reader’s options to see these rules highlighted in every ayah. Automated feedback is an aid — a qualified teacher (with ijazah) is the best way to perfect your recitation.</div>
    ${hist.attempts.length ? `<h3 style="margin:16px 0 8px;font-size:17px">Recent attempts</h3>${hist.attempts.slice(0, 15).map(a => `<div class="list-item tap" data-go="/tajweed/practice?s=${a.surah}&a=${a.ayah}"><div class="grow">${esc(meta.surahs[a.surah - 1].tr)} ${a.surah}:${a.ayah}<div class="faint small">${new Date(a.created_at).toLocaleDateString()}</div></div><span class="badge ${a.score >= 85 ? 'green' : a.score >= 60 ? 'gold' : ''}">${a.score}%</span></div>`).join('')}` : ''}`;
  bindGo(p);
  $('#pickA').onclick = () => sheet(`<h3>Choose an ayah</h3><select class="input" id="ts">${meta.surahs.map(s => `<option value="${s.n}">${s.n}. ${esc(s.tr)}</option>`).join('')}</select><label class="lbl">Ayah</label><input class="input" id="ta" type="number" value="1" min="1"><button class="btn accent block" id="tgo" style="margin-top:14px">Practise</button>`, (sh, close) => { $('#tgo', sh).onclick = () => { close(); go(`/tajweed/practice?s=${$('#ts', sh).value}&a=${Math.max(1, +$('#ta', sh).value)}`); }; });
}
async function assess(blob, s, a) {
  const r = await fetch(`/api/tajweed/assess?surah=${s}&ayah=${a}`, { method: 'POST', headers: { 'Content-Type': blob.type || 'audio/webm' }, body: blob, credentials: 'same-origin' });
  const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.error || 'We couldn’t check that recording. Please try again.'); e.code = j.code; throw e; } return j;
}
const TJ_LABEL = { ok: 'Correct', close: 'Mispronounced', wrong: 'Wrong word', missed: 'Skipped', extra: 'Added', tajweed: 'Tajweed' };
function assessHTML(r, full = true) {
  const issues = r.ops.filter(o => o.t !== 'ok');
  const grade = r.score >= 90 ? ['Excellent', 'green'] : r.score >= 75 ? ['Very good', 'green'] : r.score >= 55 ? ['Getting there', 'gold'] : ['Keep practising', 'red'];
  let n = 0; const num = new Map(); issues.forEach(o => num.set(o, ++n));
  return `<div class="card tj-result"><div class="tj-score ${grade[1]}"><div class="tj-ring" style="--p:${r.score}"><b>${r.score}%</b></div><div><b>${grade[0]}</b><div class="faint small">${r.words} word${r.words === 1 ? '' : 's'} · ${issues.length ? issues.length + ' to review' : 'no mistakes found'}</div></div></div>
    <div class="ar tj-words" dir="rtl">${r.ops.map(o => o.t === 'extra' ? `<span class="diff-word extra" data-n="${num.get(o)}">+${esc(o.s)}<sup>${num.get(o)}</sup></span>` : `<span class="diff-word ${o.t}" ${o.t !== 'ok' ? `data-n="${num.get(o)}"` : ''}>${esc(o.w)}${o.t !== 'ok' ? `<sup>${num.get(o)}</sup>` : ''}</span>`).join(' ')}</div>
    <div class="tj-key small"><span class="diff-word ok">correct</span><span class="diff-word close">mispronounced</span><span class="diff-word wrong">wrong word</span><span class="diff-word missed">skipped</span><span class="diff-word extra">added</span></div>
    ${issues.length ? `<h4 class="tj-h">What to fix</h4><ol class="tj-issues">${issues.map(o => `<li id="tji${num.get(o)}"><div class="tj-ih"><span class="tj-n">${num.get(o)}</span><span class="tj-tag ${o.t}">${TJ_LABEL[o.t]}</span>${o.rule ? `<span class="tj-rule">${esc(o.rule)}</span>` : ''}</div>
      <div class="tj-cmp"><span class="ar" dir="rtl">${o.t === 'extra' ? '—' : esc(o.w)}</span>${o.t === 'close' || o.t === 'wrong' ? `<span class="faint small">you said</span><span class="ar heard" dir="rtl">${esc(o.s || '—')}</span>` : o.t === 'extra' ? `<span class="faint small">you added</span><span class="ar heard" dir="rtl">${esc(o.s)}</span>` : ''}</div>
      ${o.note ? `<p>${esc(o.note)}</p>` : `<p class="muted">${o.t === 'missed' ? 'This word was skipped — recite it with the ayah.' : 'Listen to the reciter for this word and repeat it slowly.'}</p>`}</li>`).join('')}</ol>` : ''}
    ${r.focus ? `<div class="tj-focus"><b>Focus next</b><p>${esc(r.focus)}</p></div>` : ''}
    ${r.rules && r.rules.length ? `<h4 class="tj-h">Tajweed rules in this ayah — check yourself</h4><ul class="tj-rules">${r.rules.map(x => `<li><span class="ar" dir="rtl">${esc(x.word)}</span><b>${esc(x.rule)}</b><span>${esc(x.how)}</span></li>`).join('')}</ul>` : ''}
    ${r.strengths && r.strengths.length ? `<p class="tj-good">${I.check} ${esc(r.strengths[0])}</p>` : ''}
    ${r.encouragement ? `<p class="faint small" style="margin-top:6px">${esc(r.encouragement)}</p>` : ''}
    ${full ? `<details class="small faint" style="margin-top:8px"><summary>What we heard</summary><div class="ar" dir="rtl" style="font-size:20px">${esc(r.transcript || '—')}</div></details>` : ''}
    <p class="faint small" style="margin-top:8px">Automatic checking catches skipped, added and mispronounced words. For madd lengths and ghunnah, compare with the reciter — and recite to a qualified teacher when you can.</p></div>`;
}
export async function viewTajweedPractice(s, a) {
  s = +s || 1; a = +a || 1; const meta = await QMETA(); const sm = meta.surahs[s - 1]; if (!sm) return go('/tajweed'); a = Math.min(a, sm.ayahs);
  const p = shell('Recitation practice', { back: '/tajweed' }); const qar = await loadJSON('/data/quran-ar.json'); let tj = null;
  try { tj = (await tajweedText(s))[a - 1]; } catch {}
  const tr = (await translation('en.pickthall', s))[a - 1];
  let rec = null; const audio = new Audio(); onCleanup(() => { audio.pause(); rec?.cancel(); });
  p.innerHTML = `<div class="row between" style="margin:6px 0"><button class="iconbtn" data-go="/tajweed/practice?s=${a > 1 ? s : Math.max(1, s - 1)}&a=${a > 1 ? a - 1 : (s > 1 ? meta.surahs[s - 2].ayahs : 1)}" aria-label="Previous">${I.back}</button><div style="text-align:center"><b>${esc(sm.tr)}</b><div class="faint small">${s}:${a}</div></div><button class="iconbtn" data-go="/tajweed/practice?s=${a < sm.ayahs ? s : Math.min(114, s + 1)}&a=${a < sm.ayahs ? a + 1 : 1}" aria-label="Next">${I.fwd}</button></div>
    <div class="card"><div class="ar">${tj ? tajweedHTML(arAyah(s, a, tj)) : esc(arAyah(s, a, qar[s - 1][a - 1]))}</div><div class="tr" style="font-family:var(--serif);margin-top:6px">${esc(tr)}</div>
    <div class="tj-legend" style="margin-top:10px"><span class="tj-g">Ghunnah</span><span class="tj-q">Qalqalah</span><span class="tj-f">Ikhfa</span><span class="tj-i">Iqlab</span><span class="tj-a">Idgham</span><span class="tj-m">Madd</span></div></div>
    <div style="text-align:center"><button class="btn ghost sm" id="listen">${I.headphones} Listen to ${esc(reciter()[1])}</button></div>
    <button class="big-mic" id="rec" aria-label="Record">${I.mic}</button><div style="text-align:center" class="muted small" id="rstat">Tap the mic, recite the ayah, then tap again</div>
    <div id="res" style="margin-top:12px"></div>`;
  bindGo(p);
  $('#listen').onclick = async () => { try { audio.src = await ayahAudioUrl(s, a); } catch (e) { return toast(e.message); } duckNasheed(true); audio.play().catch(() => toast('Audio unavailable')); audio.onended = () => duckNasheed(false); };
  $('#rec').onclick = async () => { const b = $('#rec');
    if (rec) { b.classList.remove('rec'); b.innerHTML = '<span class="spin" style="border-top-color:#fff"></span>'; $('#rstat').textContent = 'Listening to your recitation…'; const blob = await rec.stop(); rec = null;
      try { if (blob.size < 4000) throw new Error('That was too short — hold the mic, recite the whole ayah, then tap again.');
        const r = await assess(blob, s, a); $('#res').innerHTML = assessHTML(r); vibrate(r.score >= 85 ? [30, 50, 30] : 20); $('#rstat').textContent = r.score >= 85 ? 'Excellent — ma sha Allah!' : 'Tap a numbered word to see how to fix it';
        $$('[data-n]', $('#res')).forEach(w => w.onclick = () => { const li = $('#tji' + w.dataset.n); if (li) { li.scrollIntoView({ behavior: 'smooth', block: 'center' }); li.classList.add('flash'); setTimeout(() => li.classList.remove('flash'), 900); } }); }
      catch (e) { $('#res').innerHTML = `<div class="card tj-err"><b>${e.code === 'unclear' ? 'We couldn’t hear you clearly' : 'Let’s try that again'}</b><p>${esc(e.message)}</p><ul class="small muted"><li>Find a quiet spot and turn off fans or music</li><li>Hold the phone 15–20 cm from your mouth</li><li>Recite at a steady, clear pace — one ayah at a time</li></ul></div>`; $('#rstat').textContent = 'Tap the mic to try again'; }
      b.innerHTML = I.mic; duckNasheed(false); return; }
    try { duckNasheed(true); audio.pause(); rec = await recordAudio({ maxMs: 90000, hq: true }); b.classList.add('rec'); $('#rstat').textContent = 'Recording… tap to finish'; vibrate(15); } catch (e) { toast(e.message || 'Microphone permission denied'); } };
}

// ================= LEARN =================
const TOPICS = ['Gratitude (shukr)', 'Patience (sabr)', 'Tawakkul (trust in Allah)', 'The Prophet’s ﷺ character', 'Stories of the Prophets', 'Pillars of Iman', 'Salah with khushu‘', 'Dua etiquette', 'Names of Allah', 'Tazkiyah (purifying the heart)', 'Seerah', 'The Sahabah', 'Women of early Islam', 'Halal earning', 'Good character with family', 'Repentance (tawbah)', 'The Hereafter', 'Understanding Surah al-Fatihah', 'Arabic for Quran (basics)', 'Islamic history'];
export async function viewLearn() {
  const p = shell('Learn'); const { lessons } = await api('/lessons');
  p.innerHTML = `<div class="sub" style="margin-top:10px">Alim builds bite-sized lessons on what you’ve already learned, with a quiz to lock it in. Completed lessons become part of Alim’s memory so it can keep teaching you.</div>
    <div class="card"><h3>New lesson</h3><div class="chips wrap" style="margin-top:8px">${TOPICS.map(t => `<button class="chip" data-t="${escAttr(t)}">${esc(t)}</button>`).join('')}</div><form id="tf" class="row"><input class="input" id="ti" placeholder="Or any topic…"><button class="btn accent">Go</button></form></div>
    ${lessons.length ? `<h3 style="margin:14px 0 6px;font-size:17px">Your lessons</h3>${lessons.map(l => `<div class="list-item tap" data-go="/learn/${l.id}"><span style="width:20px;height:20px;color:${l.completed ? 'var(--green)' : 'var(--text-3)'}">${l.completed ? I.check : I.cap}</span><div class="grow"><div>${esc(l.title)}</div><div class="faint small">${esc(l.topic)}${l.completed ? ` · ${l.score}/3` : ''}</div></div>${I.fwd}</div>`).join('')}` : ''}`;
  bindGo(p);
  const gen = async topic => { p.innerHTML = loadingHTML('Alim is preparing your lesson…'); try { const { lesson } = await api('/lesson', { body: { topic } }); go('/learn/' + lesson.id); } catch (e) { toast(e.message); viewLearn(); } };
  $$('[data-t]', p).forEach(b => b.onclick = () => gen(b.dataset.t)); $('#tf').onsubmit = e => { e.preventDefault(); const v = $('#ti').value.trim(); if (v) gen(v); };
}
export async function viewLesson(id) {
  const p = shell('Lesson', { back: '/learn' }); const { lesson: l } = await api('/lessons/' + id); if (!l) return go('/learn');
  const quiz = typeof l.quiz === 'string' ? JSON.parse(l.quiz) : (l.quiz || []); const ans = {};
  p.innerHTML = `<h1 style="font-size:26px;margin:10px 0 4px">${esc(l.title)}</h1><div class="faint small" style="margin-bottom:12px">${esc(l.topic)}</div><div class="md msg assistant">${md(l.content)}</div>
    <h3 style="margin:20px 0 8px">Quiz</h3>${quiz.map((q, i) => `<div class="card flat" data-q="${i}"><div style="font-weight:600;margin-bottom:6px">${i + 1}. ${esc(q.q)}</div>${q.options.map((o, j) => `<button class="quiz-opt" data-o="${j}">${esc(o)}</button>`).join('')}<div class="ex small muted" style="margin-top:6px"></div></div>`).join('')}
    <div id="qdone"></div><button class="btn ghost block" style="margin-top:10px" id="askMore">Ask Alim about this</button>`;
  $$('[data-q]', p).forEach(c => $$('[data-o]', c).forEach(b => b.onclick = async () => { const i = +c.dataset.q; if (ans[i] != null) return; const q = quiz[i]; ans[i] = +b.dataset.o;
    $$('[data-o]', c).forEach(x => { if (+x.dataset.o === q.answer) x.classList.add('right'); }); if (ans[i] !== q.answer) b.classList.add('wrong'); vibrate(ans[i] === q.answer ? 15 : [20, 40, 20]);
    $('.ex', c).textContent = q.explain || '';
    if (Object.keys(ans).length === quiz.length) { const sc = quiz.filter((q, k) => ans[k] === q.answer).length; await api(`/lessons/${id}/complete`, { body: { score: sc } }); $('#qdone').innerHTML = `<div class="card" style="text-align:center"><div style="font-family:var(--serif);font-size:28px">${sc}/${quiz.length}</div><div class="muted">${sc === quiz.length ? 'Excellent — ma sha Allah!' : 'Good effort. Alim will revisit this with you.'}</div></div>`; } }));
  $('#askMore').onclick = () => askAlim(`I just studied the lesson "${l.title}". Can you go deeper and test my understanding?`, 'teach');
}

// ================= AUDIOBOOKS =================
export async function viewAudiobooks(bookId) {
  const books = await loadJSON('/data/audiobooks.json'); const prog = Object.fromEntries(((await api('/audiobooks/progress').catch(() => ({ progress: [] }))).progress || []).map(x => [x.book, x]));
  if (!bookId) {
    const p = shell('Audiobooks');
    p.innerHTML = `<div class="sub" style="margin-top:10px">Free public-domain recordings from LibriVox (archive.org). Your place is saved automatically.</div>
      ${books.map(b => `<div class="book" data-go="/audiobooks/${b.id}"><img src="${escAttr(b.cover)}" alt="" loading="lazy"><div class="grow"><div style="font-weight:600">${esc(b.title)}</div><div class="muted small">${esc(b.author)} · ${b.tracks.length} parts</div>${prog[b.id] ? `<div class="small" style="color:var(--accent)">Continue part ${prog[b.id].track + 1}</div>` : ''}</div>${I.fwd}</div>`).join('')}
      <div class="card soft small muted" style="margin-top:14px">Looking for Quran recitation? Open any surah in the <a href="#/quran">Quran</a> and press play — choose from 8 reciters.</div>`;
    bindGo(p); return;
  }
  const b = books.find(x => x.id === bookId); if (!b) return go('/audiobooks');
  const p = shell(esc(b.title), { back: '/audiobooks' }); let t = prog[b.id]?.track || 0; const audio = new Audio(); audio.preload = 'metadata';
  let saveT = null; const save = () => api('/audiobooks/progress', { body: { book: b.id, track: t, pos: Math.floor(audio.currentTime || 0) } }).catch(() => {});
  onCleanup(() => { save(); audio.pause(); duckNasheed(false); clearInterval(saveT); });
  p.innerHTML = `<div class="row" style="gap:14px;margin:10px 0"><img src="${escAttr(b.cover)}" alt="" style="width:96px;height:96px;border-radius:14px;object-fit:cover"><div><div style="font-family:var(--serif);font-size:20px">${esc(b.title)}</div><div class="muted">${esc(b.author)}</div></div></div>
    <div class="faint small">${esc(b.desc || '')}</div>
    <div class="card" style="margin-top:12px"><div style="font-weight:600" id="abT"></div><input type="range" id="abSeek" min="0" max="100" value="0" style="width:100%;margin:10px 0"><div class="row between small faint"><span id="abC">0:00</span><span id="abD">--</span></div>
      <div class="row" style="justify-content:center;gap:14px;margin-top:8px"><button class="iconbtn" id="abPrev">${I.prev}</button><button class="iconbtn" id="abBack" style="font-size:12px;font-weight:600">-15</button><button class="pbtn" id="abPlay" style="width:56px;height:56px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center">${I.play}</button><button class="iconbtn" id="abFwd" style="font-size:12px;font-weight:600">+30</button><button class="iconbtn" id="abNext">${I.next}</button></div>
      <div class="chips" style="justify-content:center;margin-top:8px">${[0.8, 1, 1.25, 1.5, 2].map(r => `<button class="chip ${r === 1 ? 'on' : ''}" data-rate="${r}">${r}×</button>`).join('')}</div></div>
    <div id="abList">${b.tracks.map((x, i) => `<div class="track" data-t="${i}"><span class="faint" style="width:26px">${i + 1}</span><span class="grow">${esc(x.t)}</span><span class="faint small">${esc(x.d || '')}</span></div>`).join('')}</div>`;
  const fmt = s => isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '--';
  const load = (i, pos = 0, autoplay = false) => { t = i; audio.src = b.tracks[i].u; $('#abT').textContent = `${i + 1}. ${b.tracks[i].t}`; $$('.track').forEach(x => x.classList.toggle('on', +x.dataset.t === i));
    audio.onloadedmetadata = () => { if (pos) audio.currentTime = pos; $('#abD').textContent = fmt(audio.duration); }; if (autoplay) audio.play().catch(() => {}); save(); };
  audio.ontimeupdate = () => { $('#abC').textContent = fmt(audio.currentTime); if (audio.duration) $('#abSeek').value = audio.currentTime / audio.duration * 100; };
  audio.onplay = () => { $('#abPlay').innerHTML = I.pause; duckNasheed(true); }; audio.onpause = () => { $('#abPlay').innerHTML = I.play; save(); };
  audio.onended = () => { if (t < b.tracks.length - 1) load(t + 1, 0, true); };
  $('#abPlay').onclick = () => audio.paused ? audio.play().catch(() => toast('Could not play')) : audio.pause();
  $('#abBack').onclick = () => audio.currentTime = Math.max(0, audio.currentTime - 15); $('#abFwd').onclick = () => audio.currentTime += 30;
  $('#abPrev').onclick = () => t > 0 && load(t - 1, 0, true); $('#abNext').onclick = () => t < b.tracks.length - 1 && load(t + 1, 0, true);
  $('#abSeek').oninput = e => { if (audio.duration) audio.currentTime = e.target.value / 100 * audio.duration; };
  $$('[data-rate]').forEach(c => c.onclick = () => { audio.playbackRate = +c.dataset.rate; $$('[data-rate]').forEach(x => x.classList.toggle('on', x === c)); });
  $$('.track').forEach(x => x.onclick = () => load(+x.dataset.t, 0, true));
  load(t, prog[b.id]?.pos || 0); saveT = setInterval(() => { if (!audio.paused) save(); }, 20000);
}
