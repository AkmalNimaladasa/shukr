// Knowledge+ : Ayah finder, Tafsir (AI summary of classical tafsir, cached), Seerah & history timeline.
import { $, $$, esc, escAttr, I, api, toast, vibrate, shell, bindGo, go, loadJSON, askAlim, loadingHTML, recordAudio, transcribe } from '../core.js';

let QD = null;
async function quran() {
  if (QD) return QD;
  const [ar, en, meta] = await Promise.all([loadJSON('/data/quran-ar.json'), loadJSON('/data/quran-en-pickthall.json'), loadJSON('/data/quran-meta.json')]);
  return (QD = { ar, en, meta: meta.surahs });
}
const clean = s => String(s || '').replace(/^\uFEFF/, '');
// Arabic normalisation: drop diacritics/tatweel/Quranic marks, unify alef/hamza/ya/ta marbuta forms.
const norm = s => clean(s).replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '').replace(/[إأآٱا]/g, 'ا').replace(/[ؤ]/g, 'و').replace(/[ئى]/g, 'ي').replace(/ة/g, 'ه').replace(/ء/g, '').replace(/\s+/g, ' ').trim();
const lat = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[‘’'`ʿʾ\-]/g, '').replace(/\s+/g, ' ').trim();
const NAMED = { kursi: [2, 255], 'ayatul kursi': [2, 255], 'ayat al kursi': [2, 255], fatiha: [1, 1], nur: [24, 35], 'light verse': [24, 35], 'last two of baqarah': [2, 285], 'amana rasul': [2, 285], ikhlas: [112, 1], falaq: [113, 1], nas: [114, 1], yasin: [36, 1], kahf: [18, 1], mulk: [67, 1], rahman: [55, 1] };

function card(v, why) {
  return `<div class="kp-card"><div class="kp-ref"><b>${esc(v.surahTr || v.surah)}</b> <span>${v.s}:${v.a}</span></div>${why ? `<div class="kp-why">${esc(why)}</div>` : ''}
    <div class="ar kp-ar" lang="ar">${esc(v.ar)}</div><p class="kp-en">${esc(v.en)}</p>
    <div class="kp-acts"><a class="chip" href="#/quran/${v.s}?a=${v.a}">${I.quran} Read</a><a class="chip" href="#/tafsir/${v.s}/${v.a}">${I.book} Tafsir</a>
      <button class="chip" data-copy="${v.s}:${v.a}">${I.copy} Copy</button><button class="chip" data-askv="${v.s}:${v.a}">${I.chat} Ask</button></div></div>`;
}
function bindCards(root, Q) {
  $$('[data-copy]', root).forEach(b => b.onclick = async () => { const [s, a] = b.dataset.copy.split(':').map(Number); const t = `${clean(Q.ar[s - 1][a - 1])}\n\n${clean(Q.en[s - 1][a - 1])}\n— Quran ${s}:${a} (Pickthall)`;
    try { await navigator.clipboard.writeText(t); toast('Copied'); } catch { toast('Couldn’t copy'); } });
  $$('[data-askv]', root).forEach(b => b.onclick = () => askAlim(`Explain Quran ${b.dataset.askv} — its meaning, context and lessons.`));
}
const V = (Q, s, a) => ({ s, a, surah: Q.meta[s - 1].en, surahTr: Q.meta[s - 1].en + ' · ' + Q.meta[s - 1].tr, ar: clean(Q.ar[s - 1][a - 1]), en: clean(Q.en[s - 1][a - 1]) });

// ================= AYAH FINDER =================
export async function viewAyahFinder(q) {
  const p = shell('Ayah finder');
  p.innerHTML = loadingHTML();
  const Q = await quran();
  let mode = 'words';
  p.innerHTML = `
    <div class="kp-hero"><div class="kp-k">Find any verse</div><div class="kp-big">By words, reference, topic — or recite it</div>
      <div class="kp-search"><span>${I.search}</span><input id="kpQ" placeholder="e.g. 2:255, “patience”, رحمة" autocomplete="off" enterkeyhint="search"><button class="kp-mic" id="kpMic" aria-label="Recite to find">${I.mic}</button></div>
      <div class="kp-modes">${[['words', 'Words & refs'], ['topic', 'Topic (AI)']].map(([m, l]) => `<button data-mode="${m}" class="${m === mode ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div id="kpOut"><div class="kp-tips"><b>Try:</b>${['2:255', 'kahf 10', 'patience', 'لا يكلف الله نفسا', 'verses about hope after hardship', 'the ayah about not losing hope in Allah’s mercy'].map(t => `<button class="chip" data-try="${escAttr(t)}">${esc(t)}</button>`).join('')}</div></div>`;
  const out = $('#kpOut'), inp = $('#kpQ');
  function local(term) {
    const t = term.trim(); if (!t) return [];
    const m = t.match(/^(\d{1,3})\s*[:.\s]\s*(\d{1,3})$/);
    if (m) { const s = +m[1], a = +m[2]; return s >= 1 && s <= 114 && a >= 1 && a <= Q.meta[s - 1].ayahs ? [V(Q, s, a)] : []; }
    const L = lat(t), named = NAMED[L]; if (named) return [V(Q, ...named)];
    const sm = L.match(/^(?:surah\s+)?(?:al\s?)?([a-z ]+?)\s*(\d{1,3})?$/);
    if (sm) { const nm = sm[1].replace(/\s/g, ''); const si = Q.meta.findIndex(x => lat(x.en).replace(/\s/g, '').replace(/^al/, '').startsWith(nm.replace(/^al/, '')) && nm.length >= 3);
      if (si >= 0) { const a = +sm[2] || 1; if (a <= Q.meta[si].ayahs) return [V(Q, si + 1, a)]; } }
    const res = [];
    if (/[\u0600-\u06FF]/.test(t)) { const n = norm(t); for (let s = 0; s < 114 && res.length < 50; s++) for (let a = 0; a < Q.ar[s].length && res.length < 50; a++) if (norm(Q.ar[s][a]).includes(n)) res.push(V(Q, s + 1, a + 1)); }
    else { const words = L.split(' ').filter(w => w.length > 1); if (!words.length) return [];
      for (let s = 0; s < 114 && res.length < 50; s++) for (let a = 0; a < Q.en[s].length && res.length < 50; a++) { const e = lat(Q.en[s][a]); if (words.every(w => e.includes(w))) res.push(V(Q, s + 1, a + 1)); } }
    return res;
  }
  async function run(term) {
    term = (term ?? inp.value).trim(); if (!term) return;
    if (mode === 'topic') {
      out.innerHTML = loadingHTML('Searching the Quran by meaning…');
      try { const r = await api('/kp/find', { body: { query: term } });
        out.innerHTML = r.results.length ? `<div class="kp-note">${I.sparkle} AI-suggested verses — every reference and text is checked against the Quran.</div>` + r.results.map(v => card(v, v.why)).join('') : `<div class="empty"><p class="muted">No verses found for that topic. Try other words.</p></div>`;
        bindCards(out, Q); } catch (e) { out.innerHTML = `<div class="empty"><p class="muted">${esc(e.message)}</p></div>`; }
      return;
    }
    const r = local(term);
    out.innerHTML = r.length ? `<div class="faint small" style="margin:4px">${r.length}${r.length === 50 ? '+' : ''} result${r.length === 1 ? '' : 's'}</div>` + r.map(v => card(v)).join('')
      : `<div class="empty"><p class="muted">No exact match. Try “Topic (AI)” to search by meaning.</p><button class="btn accent" id="kpTopic">${I.sparkle} Search by meaning</button></div>`;
    bindCards(out, Q); const tb = $('#kpTopic'); if (tb) tb.onclick = () => { mode = 'topic'; paintModes(); run(term); };
  }
  const paintModes = () => $$('[data-mode]', p).forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  $$('[data-mode]', p).forEach(b => b.onclick = () => { mode = b.dataset.mode; paintModes(); inp.placeholder = mode === 'topic' ? 'Describe the verse or topic…' : 'e.g. 2:255, “patience”, رحمة'; if (inp.value) run(); });
  let t = null; inp.oninput = () => { if (mode !== 'words') return; clearTimeout(t); t = setTimeout(() => run(), 300); };
  inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); run(); } };
  $$('[data-try]', p).forEach(b => b.onclick = () => { const v = b.dataset.try; mode = /about|ayah about/.test(v) ? 'topic' : 'words'; paintModes(); inp.value = v; run(v); });
  let rec = null;
  $('#kpMic').onclick = async () => {
    const b = $('#kpMic');
    if (rec) { b.classList.remove('rec'); const blob = await rec.stop(); rec = null; out.innerHTML = loadingHTML('Listening to your recitation…');
      try { const text = await transcribe(blob, 'ar', 'تلاوة القرآن الكريم'); inp.value = text; mode = 'words'; paintModes();
        const words = norm(text).split(' '); let found = []; for (let k = Math.min(words.length, 6); k >= 2 && !found.length; k--) for (let i = 0; i + k <= words.length && !found.length; i++) found = local(words.slice(i, i + k).join(' '));
        out.innerHTML = found.length ? `<div class="kp-note">${I.mic} Heard: <span class="ar" lang="ar">${esc(text)}</span></div>` + found.slice(0, 20).map(v => card(v)).join('') : `<div class="empty"><p class="muted">Couldn’t match that recitation. Try reciting a little more, clearly.</p></div>`; bindCards(out, Q);
      } catch (e) { out.innerHTML = `<div class="empty"><p class="muted">${esc(e.message)}</p></div>`; }
      return; }
    try { rec = await recordAudio({ voice: true, maxMs: 20000 }); b.classList.add('rec'); vibrate(15); toast('Recite now — tap the mic again when done'); rec.done.then(() => { if (rec) b.click(); }); }
    catch (e) { toast(e.message); }
  };
  if (q?.get('q')) { inp.value = q.get('q'); run(); }
}

// ================= TAFSIR =================
export async function viewTafsir(s, a) {
  const p = shell('Tafsir');
  p.innerHTML = loadingHTML();
  const Q = await quran();
  if (!s) {
    p.innerHTML = `<div class="kp-hero kp-taf"><div class="kp-k">Understand the Quran</div><div class="kp-big">Tafsir — what the verses mean</div><p class="small" style="opacity:.9;margin:4px 0 0">Choose a surah and ayah for a summary of what the classical scholars said about it.</p></div>
      <div class="card"><label class="faint small">Surah</label><select class="input" id="kpS">${Q.meta.map((m, i) => `<option value="${i + 1}">${i + 1}. ${esc(m.en)} — ${esc(m.tr)}</option>`).join('')}</select>
        <label class="faint small" style="display:block;margin-top:8px">Ayah</label><input class="input" id="kpA" type="number" min="1" value="1">
        <button class="btn accent block" id="kpGo" style="margin-top:12px">${I.book} Open tafsir</button></div>
      <div class="card"><h3>Popular verses</h3><div class="chips wrap">${[[1, 1], [2, 255], [2, 286], [3, 190], [13, 28], [24, 35], [39, 53], [65, 3], [94, 5], [112, 1]].map(([x, y]) => `<a class="chip" href="#/tafsir/${x}/${y}">${esc(Q.meta[x - 1].en)} ${x}:${y}</a>`).join('')}</div></div>`;
    $('#kpS').onchange = () => { $('#kpA').max = Q.meta[+$('#kpS').value - 1].ayahs; };
    $('#kpGo').onclick = () => { const ss = +$('#kpS').value, aa = Math.min(Math.max(1, +$('#kpA').value || 1), Q.meta[ss - 1].ayahs); go(`/tafsir/${ss}/${aa}`); };
    return;
  }
  s = +s; a = +a;
  if (!(s >= 1 && s <= 114 && a >= 1 && a <= Q.meta[s - 1].ayahs)) { p.innerHTML = '<div class="empty"><p class="muted">That verse doesn’t exist.</p></div>'; return; }
  const v = V(Q, s, a), prev = a > 1 ? [s, a - 1] : s > 1 ? [s - 1, Q.meta[s - 2].ayahs] : null, next = a < Q.meta[s - 1].ayahs ? [s, a + 1] : s < 114 ? [s + 1, 1] : null;
  const body = t => `<div class="card kp-tafbody"><div class="kp-label">${I.sparkle} AI summary of classical tafsir — verify with a scholar</div>
      <p>${esc(t.summary)}</p>${t.context ? `<h4>Context</h4><p class="muted">${esc(t.context)}</p>` : ''}
      ${t.lessons?.length ? `<h4>Lessons</h4><ul>${t.lessons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${t.words?.length ? `<h4>Key words</h4><div class="kp-words">${t.words.map(w => `<div><span class="ar" lang="ar">${esc(w.ar)}</span><small>${esc(w.meaning)}</small></div>`).join('')}</div>` : ''}
      ${t.note ? `<p class="faint small" style="margin-top:10px">${esc(t.note)}</p>` : ''}</div>`;
  p.innerHTML = `
    <div class="kp-hero kp-taf"><div class="kp-k">${esc(Q.meta[s - 1].en)} · ${esc(Q.meta[s - 1].tr)}</div><div class="kp-big">Ayah ${s}:${a}</div>
      <div class="ar kp-ar kp-ar-hero" lang="ar">${esc(v.ar)}</div><p class="kp-en-hero">${esc(v.en)}</p><div class="kp-k" style="opacity:.7">Pickthall translation</div></div>
    <div id="kpT">${loadingHTML('Looking for the tafsir…')}</div>
    <div class="kp-nav">${prev ? `<a class="btn ghost" href="#/tafsir/${prev[0]}/${prev[1]}">${I.back} ${prev[0]}:${prev[1]}</a>` : '<span></span>'}<a class="btn ghost" href="#/quran/${s}?a=${a}">${I.quran}</a>${next ? `<a class="btn ghost kp-nx" href="#/tafsir/${next[0]}/${next[1]}">${next[0]}:${next[1]} ${I.back}</a>` : '<span></span>'}</div>
    <button class="btn ghost block" id="kpAsk" style="margin-top:8px">${I.chat} Ask Alim a question about this verse</button>`;
  $('#kpAsk').onclick = () => askAlim(`I’m reading Quran ${s}:${a}. `);
  const box = $('#kpT');
  try {
    const r = await api(`/kp/tafsir/${s}/${a}`);
    if (r.tafsir) { box.innerHTML = body(r.tafsir); return; }
    box.innerHTML = `<div class="card" style="text-align:center"><p class="muted">This verse hasn’t been explained yet. Prepare a summary of what Ibn Kathir, al-Tabari, al-Qurtubi and as-Sa‘di said?</p><button class="btn accent" id="kpGen">${I.sparkle} Explain this verse</button></div>`;
    $('#kpGen').onclick = async () => { box.innerHTML = loadingHTML('Preparing the tafsir… this takes a few seconds'); try { const g = await api('/kp/tafsir', { body: { s, a } }); if (location.hash === `#/tafsir/${s}/${a}`) box.innerHTML = body(g.tafsir); } catch (e) { box.innerHTML = `<div class="empty"><p class="muted">${esc(e.message)}</p></div>`; } };
  } catch (e) { box.innerHTML = `<div class="empty"><p class="muted">${esc(e.message)}</p></div>`; }
}

// ================= SEERAH =================
export async function viewSeerah() {
  const p = shell('Seerah & history');
  p.innerHTML = loadingHTML();
  const D = await loadJSON('/data/kp-seerah.json');
  let era = 'all', open = null;
  function paint() {
    const list = D.events.filter(e => era === 'all' || e.era === era);
    p.innerHTML = `
      <div class="kp-hero kp-seer"><div class="kp-k">The life of the Prophet ﷺ & beyond</div><div class="kp-big">Seerah & Islamic history</div><p class="small" style="opacity:.9;margin:4px 0 0">${D.events.length} key moments, from the Year of the Elephant to the modern age. Dates marked ~ are approximate.</p></div>
      ${D.trials ? `<a class="sr-trials-cta" href="#/seerah/trials"><span class="sr-tic">${I.heart}</span><span class="grow"><b>His trials ﷺ</b><small>Orphaned, bereaved, stoned, starved — and still mercy to all. ${D.trials.groups.reduce((n, g) => n + g.items.length, 0)} authentic accounts.</small></span>${I.fwd || '›'}</a>` : ''}
      <div class="chips"><button class="chip ${era === 'all' ? 'on' : ''}" data-era="all">All</button>${D.eras.map(([id, l]) => `<button class="chip ${era === id ? 'on' : ''}" data-era="${id}">${esc(l)}</button>`).join('')}</div>
      <div class="kp-tl">${list.map((e, i) => { const k = D.events.indexOf(e); return `<div class="kp-ev kp-${e.era} ${open === k ? 'open' : ''}"><i></i><button class="kp-evh" data-ev="${k}"><span class="kp-y">${esc(e.y)}</span><b>${esc(e.t)}</b><span class="faint small">${I.pin} ${esc(e.p)}</span></button>
        ${open === k ? `<div class="kp-evb"><p>${esc(e.s)}</p><div class="kp-lesson">${I.bulb} ${esc(e.l)}</div><div class="faint small">Sources & further reading: ${esc(e.r)}</div>
          <button class="chip" data-askev="${k}">${I.chat} Ask Alim about this</button></div>` : ''}</div>`; }).join('')}</div>
      <div class="card"><h3>The ten promised Paradise</h3><p class="muted small">The Prophet ﷺ named ten companions as people of Jannah in one hadith (Jami‘ at-Tirmidhi 3747).</p>
        ${D.ten.map(([n, b]) => `<div class="list-item"><span class="kp-ten">${I.star}</span><div class="grow"><b>${esc(n)}</b><div class="muted small">${esc(b)}</div></div></div>`).join('')}</div>`;
    $$('[data-era]', p).forEach(b => b.onclick = () => { era = b.dataset.era; open = null; paint(); });
    $$('[data-ev]', p).forEach(b => b.onclick = () => { const k = +b.dataset.ev; open = open === k ? null : k; paint(); if (open != null) b.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
    $$('[data-askev]', p).forEach(b => b.onclick = () => { const e = D.events[+b.dataset.askev]; askAlim(`Tell me more about this event in Islamic history: ${e.t} (${e.y}). What lessons can I take from it?`); });
  }
  paint();
}

export async function viewTrials() {
  const p = shell('His trials', { back: '/seerah' });
  p.innerHTML = loadingHTML();
  const D = await loadJSON('/data/kp-seerah.json'); const T = D.trials;
  let tab = 'all', open = null;
  const paint = () => {
    const groups = T.groups.filter(g => tab === 'all' || g.id === tab);
    p.innerHTML = `
    <div class="sr-hero"><small>The life of the best of creation</small><h2>He was tested more than anyone</h2><p>${esc(T.intro)}</p></div>
    <div class="sr-stats">${T.stats.map(([n, l]) => `<div><b>${esc(n)}</b><small>${esc(l)}</small></div>`).join('')}</div>
    <div class="chips sr-tabs"><button class="chip ${tab === 'all' ? 'on' : ''}" data-tb="all">All trials</button>${T.groups.map(g => `<button class="chip ${tab === g.id ? 'on' : ''}" data-tb="${g.id}">${esc(g.title)}</button>`).join('')}</div>
    ${groups.map(g => `<h3 class="sr-gh">${I[g.icon] || I.star} ${esc(g.title)}</h3><div class="sr-tl">${g.items.map((x, i) => { const k = g.id + i; return `
      <div class="sr-it ${open === k ? 'open' : ''}"><i></i><button class="sr-ih" data-it="${k}"><span class="sr-age">${esc(x.age)}</span><b>${esc(x.t)}</b></button>
        <div class="sr-ib"><p>${esc(x.s)}</p><div class="sr-you"><span>Compare</span>${esc(x.you)}</div><div class="sr-src">${I.book} ${esc(x.src)}</div></div></div>`; }).join('')}</div>`).join('')}
    <div class="sr-card sr-deeds"><h3>${I.star} And yet — his character</h3>${T.deeds.map(([h, t]) => `<div class="sr-d"><b>${esc(h)}</b><p>${esc(t)}</p></div>`).join('')}</div>
    <div class="sr-card sr-forus"><h3>${I.heart} What he did for you</h3>${T.forus.map(([h, t]) => `<div class="sr-d"><b>${esc(h)}</b><p>${esc(t)}</p></div>`).join('')}</div>
    <div class="sr-reflect"><p>${esc(T.reflect)}</p><button class="btn accent block" id="srSal">ﷺ Send salawat now</button><button class="btn ghost block" id="srAsk" style="margin-top:8px">${I.chat} Ask Alim about his patience</button></div>
    <p class="faint small" style="text-align:center;margin:12px 0 24px">Sources: Sahih al-Bukhari, Sahih Muslim, Jamiʿ at-Tirmidhi, Sunan Ibn Majah (standard sunnah.com numbering), the Qur’an, and the classical seerah of Ibn Hisham, Ibn Saʿd and Ibn Kathir.</p>`;
    $$('[data-tb]', p).forEach(b => b.onclick = () => { tab = b.dataset.tb; open = null; paint(); });
    $$('[data-it]', p).forEach(b => b.onclick = () => { open = open === b.dataset.it ? null : b.dataset.it; paint(); const el = $(`[data-it="${b.dataset.it}"]`, p); el && el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
    $('#srSal', p).onclick = () => { try { location.hash = '#/dhikr?phrase=salawat'; } catch {} };
    $('#srAsk', p).onclick = () => askAlim('How did the Prophet ﷺ stay patient through losing his parents, his wife Khadijah, his uncle and six of his children? What can I learn for my own grief?');
  };
  paint();
}

export const routes = [
  [/^\/seerah\/trials$/, () => viewTrials(), 'seerah'],
  [/^\/ayah-finder$/, (m, q) => viewAyahFinder(q), 'ayahfinder'],
  [/^\/tafsir$/, () => viewTafsir(), 'tafsir'],
  [/^\/tafsir\/(\d{1,3})\/(\d{1,3})$/, m => viewTafsir(m[1], m[2]), 'tafsir'],
  [/^\/seerah$/, () => viewSeerah(), 'seerah'],
];
