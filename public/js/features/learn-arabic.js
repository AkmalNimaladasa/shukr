// Learn Qur'anic Arabic — a game. 2,000 words in frequency order (≈91% of the Qur'an's words) + 12 grammar keys.
// Every lesson shows the % of the Qur'an you now understand. Exercises: meet the word, pick the meaning, pick the Arabic,
// listen & choose, match pairs, and read it inside a real ayah. Hearts, XP, streak, spaced review (Leitner).
import { $, $$, esc, escAttr, I, api, toast, vibrate, shell, LS, onCleanup, loadingHTML, sheet, go, confirmSheet } from '../core.js';

let DATA = null;
const load = () => DATA ||= fetch('/data/quran-arabic.json', { cache: 'force-cache' }).then(r => r.json());
const AU = p => p ? 'https://audio.qurancdn.com/' + p : '';
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const POS = { N: 'noun', V: 'verb', P: 'particle', PN: 'proper name', PRON: 'pronoun', ADJ: 'adjective' };
const ayahHTML = e => `<div class="ar ar-ay" dir="rtl">${e.ay.split(' ').map((t, i, a) => { const s = i + 1 === e.w ? `<mark>${esc(t)}</mark>` : esc(t); return (i === 0 && e.pre ? '…\u00a0' : '') + s + (i === a.length - 1 && e.post ? '\u00a0…' : ''); }).join(' ')}</div>`;
let sfx = null; const ding = ok => { try { sfx ||= new (window.AudioContext || window.webkitAudioContext)(); const o = sfx.createOscillator(), g = sfx.createGain(); o.type = 'sine';
  const t = sfx.currentTime; (ok ? [660, 880] : [300, 220]).forEach((f, k) => o.frequency.setValueAtTime(f, t + k * 0.09)); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  o.connect(g).connect(sfx.destination); o.start(t); o.stop(t + 0.32); } catch {} vibrate(ok ? 10 : [40, 40, 40]); };
const playWord = w => { if (!w?.au || LS.get('ar.mute', false)) return; try { const a = new Audio(AU(w.au)); a.play().catch(() => {}); } catch {} };

function coverage(D, s) { // % of Qur'an tokens covered by words the user has learned
  const k = new Set(s.known.filter(x => x[1] >= 2).map(x => x[0])); let n = 0; for (const w of D.words) if (k.has(w.id)) n += w.n; return Math.round(n / D.total * 1000) / 10; }

export async function viewArabic() {
  const p = shell('Learn Qur’anic Arabic'); p.classList.add('ar-page'); p.innerHTML = loadingHTML('Opening your journey…');
  const [D, s] = await Promise.all([load(), api('/arabic')]);
  const cov = coverage(D, s), done = s.units, nextUnit = (D.units.find(u => !done[u.n]) || D.units[D.units.length - 1]).n;
  const lvlOf = n => D.levels.find(l => n >= l.from && n <= l.to);
  const gFor = n => D.grammar.filter(g => g.after === n);
  const heartsHTML = `<span class="ar-hearts">${Array.from({ length: 5 }, (_, i) => `<i class="${i < s.hearts ? 'on' : ''}">${I.heart}</i>`).join('')}</span>`;
  p.innerHTML = `
    <div class="ar-hero"><div class="ar-top"><span class="ar-chip">${I.flame} ${s.streak}</span><span class="ar-chip">${I.star} ${s.xp.toLocaleString()} XP</span>${heartsHTML}</div>
      <div class="ar-cov"><div class="ar-ring" style="--p:${Math.min(100, cov) * 3.6}deg"><div><b>${cov}%</b><small>of the Qur’an</small></div></div>
        <div class="grow"><div class="ar-k">You understand</div><div class="ar-big">${s.known.filter(x => x[1] >= 2).length.toLocaleString()} words</div><div class="ar-sub">Learn 2,000 words + 12 grammar keys and you’ll recognise <b>9 out of every 10 words</b> in the Qur’an.</div></div></div>
      <div class="ar-goal"><span>Daily goal</span><div class="ar-gbar"><i style="width:${Math.min(100, s.todayXp / s.goal * 100)}%"></i></div><b>${s.todayXp}/${s.goal} XP</b></div>
      <div class="row" style="gap:8px;margin-top:12px"><button class="btn ar-go grow" data-unit="${nextUnit}">${I.play} ${s.known.length ? 'Continue' : 'Start'} · Lesson ${nextUnit}</button>${s.due ? `<button class="btn ar-rev" id="arRev">${I.retry} Review ${s.due}</button>` : ''}</div></div>
    <div class="ar-map">${D.levels.map(L => `<div class="ar-level"><div class="ar-lh"><b>${esc(L.name)}</b><small>${esc(L.sub)} · lessons ${L.from}–${L.to}</small></div>
      <div class="ar-path">${D.units.filter(u => u.n >= L.from && u.n <= L.to).map((u, k) => { const st = done[u.n] || 0, open = u.n <= nextUnit, cur = u.n === nextUnit;
        return `${gFor(u.n - 1).filter(g => g.after > 0).map(g => `<button class="ar-gnode ${s.grammar.includes(g.id) ? 'done' : ''} ${open || u.n - 1 < nextUnit ? '' : 'lock'}" data-g="${g.id}" style="--x:${[0, 34, 0, -34][(k + 2) % 4]}px"><span>${I.key || I.sparkle}</span><small>${esc(g.title.split(' — ')[0].split(':')[0])}</small></button>`).join('')}
          <button class="ar-node ${st ? 'done' : ''} ${cur ? 'cur' : ''} ${open ? '' : 'lock'}" data-unit="${u.n}" style="--x:${[0, 34, 0, -34][k % 4]}px" ${open ? '' : 'disabled'}>
          <span>${st ? I.check : open ? u.n : I.lock || '🔒'}</span>${st ? `<em>${'★'.repeat(st)}${'☆'.repeat(3 - st)}</em>` : ''}${cur ? '<i class="ar-start">START</i>' : ''}<small>${Math.round(u.cov)}%</small></button>`; }).join('')}</div></div>`).join('')}</div>
    <div class="card"><h3>${I.users} This week’s top learners</h3>${s.board.map((b, i) => `<div class="ar-lb ${b.you ? 'me' : ''}"><span>${i + 1}</span><b class="grow">${esc(b.you ? 'You' : b.name || 'Learner')}</b><span>${b.xp.toLocaleString()} XP</span></div>`).join('') || '<p class="muted small">Be the first on the board!</p>'}</div>
    <div class="row" style="gap:8px"><button class="btn ghost grow" id="arWords">${I.book} My words</button><button class="btn ghost grow" id="arGoal">${I.sliders || I.gear} Goal</button><button class="btn ghost" id="arMute" aria-label="Sound">${LS.get('ar.mute', false) ? I.mute : I.speaker}</button></div>
    <p class="faint small" style="text-align:center;margin:12px 8px 24px">${esc(D.source)}</p>`;
  $$('[data-unit]', p).forEach(b => b.onclick = () => { if (b.disabled) return; if (s.hearts <= 0) return noHearts(s); go('/arabic/lesson/' + b.dataset.unit); });
  $$('[data-g]', p).forEach(b => b.onclick = () => grammarSheet(D.grammar.find(g => g.id === b.dataset.g)));
  const rv = $('#arRev'); if (rv) rv.onclick = () => go('/arabic/review');
  $('#arWords').onclick = () => wordsSheet(D, s);
  $('#arGoal').onclick = () => sheet(`<h3>Daily goal</h3><div class="ar-goals">${[[10, 'Casual'], [20, 'Regular'], [30, 'Serious'], [50, 'Intense'], [80, 'Hafiz mode']].map(([g, l]) => `<button class="${g === s.goal ? 'on' : ''}" data-gl="${g}"><b>${l}</b><span>${g} XP a day</span></button>`).join('')}</div>`, (el, close) => $$('[data-gl]', el).forEach(b => b.onclick = async () => { await api('/arabic/goal', { method: 'PUT', body: { goal: +b.dataset.gl } }); close(); viewArabic(); }));
  $('#arMute').onclick = () => { LS.set('ar.mute', !LS.get('ar.mute', false)); viewArabic(); };
  requestAnimationFrame(() => $('.ar-node.cur', p)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
}

function noHearts(s) {
  const mins = s.nextHeart ? Math.max(1, Math.ceil((s.nextHeart - Date.now()) / 60000)) : 20;
  sheet(`<div style="text-align:center"><div class="ar-bigheart">${I.heart}</div><h3>Out of hearts</h3><p class="muted">A new heart arrives in ${mins} min. Or earn one now by practising words you already know.</p>
    <button class="btn accent block" id="nhP">${I.retry} Practise to earn a heart</button><button class="btn ghost block" data-close style="margin-top:8px">Later</button></div>`, (el, close) => { $('[data-close]', el).onclick = close; $('#nhP', el).onclick = () => { close(); go('/arabic/review?refill=1'); }; });
}
function grammarSheet(g) {
  if (!g) return;
  sheet(`<div class="ar-gram"><div class="ar-gk">${I.key || I.sparkle} Grammar key</div><h3>${esc(g.title)}</h3><div class="ar ar-gar">${esc(g.ar)}</div><p>${esc(g.text)}</p>
    <div id="gq"></div></div>`, (el, close) => {
    let i = 0, ok = 0;
    const step = () => { if (i >= g.q.length) { $('#gq', el).innerHTML = `<div class="ar-gdone">${I.check} Key unlocked! +10 XP</div><button class="btn accent block" id="gD">Continue</button>`;
        api('/arabic/result', { body: { grammar: g.id, xp: 10 + ok * 2, answers: [] } }).catch(() => {}); $('#gD', el).onclick = () => { close(); viewArabic(); }; return; }
      const [ar, ans, opts] = g.q[i];
      $('#gq', el).innerHTML = `<div class="ar-qq">Quick check ${i + 1}/${g.q.length}</div><div class="ar ar-qar">${esc(ar)}</div><div class="ar-opts">${shuffle(opts).map(o => `<button data-o="${escAttr(o)}">${esc(o)}</button>`).join('')}</div>`;
      $$('[data-o]', el).forEach(b => b.onclick = () => { const good = b.dataset.o === ans; ding(good); if (good) ok++; b.classList.add(good ? 'good' : 'bad'); $$('[data-o]', el).forEach(x => { x.disabled = true; if (x.dataset.o === ans) x.classList.add('good'); }); setTimeout(() => { i++; step(); }, 800); }); };
    step();
  });
}
function wordsSheet(D, s) {
  const box = new Map(s.known); const L = D.words.filter(w => box.has(w.id));
  sheet(`<h3>My words · ${L.length}</h3><input class="input" id="wq" placeholder="Search Arabic or English"><div class="ar-wl" id="wl"></div>`, el => {
    const draw = t => { const x = t ? L.filter(w => (w.m + ' ' + w.t + ' ' + w.f.join(' ') + ' ' + w.ar).toLowerCase().includes(t.toLowerCase())) : L;
      $('#wl', el).innerHTML = x.slice(0, 300).map(w => `<button class="ar-wr" data-w="${w.id}"><span class="ar ar-wa">${esc(w.ar)}</span><span class="grow"><b>${esc(w.m)}</b><small>${esc(w.t)} · ${POS[w.pos] || ''} · ${w.n}× in the Qur’an</small></span><i class="ar-box b${box.get(w.id)}">${box.get(w.id)}</i></button>`).join('') || '<p class="muted small">No words yet — start Lesson 1!</p>';
      $$('[data-w]', el).forEach(b => b.onclick = () => playWord(D.words[+b.dataset.w - 1])); };
    draw(''); $('#wq', el).oninput = e => draw(e.target.value.trim());
  });
}

// ---------- Lesson engine ----------
export async function viewLesson(unitN, mode) {
  const p = shell(mode === 'review' ? 'Review' : 'Lesson ' + unitN); p.classList.add('ar-page', 'ar-lesson-page');
  p.innerHTML = loadingHTML();
  const [D, s0] = await Promise.all([load(), api('/arabic')]); let s = s0;
  const refill = mode === 'review' && /refill=1/.test(location.hash);
  if (mode !== 'review' && s.hearts <= 0) { viewArabic(); return noHearts(s); }
  let words, newIds = [];
  if (mode === 'review') { const r = await api('/arabic/review'); let ids = r.ids; if (!ids.length) ids = shuffle(s.known.map(k => k[0])).slice(0, 12); if (!ids.length) { toast('Learn a lesson first'); return go('/arabic'); } words = ids.map(i => D.words[i - 1]); }
  else { const u = D.units[unitN - 1]; if (!u) return go('/arabic'); words = u.w.map(i => D.words[i - 1]); const known = new Set(s.known.map(k => k[0])); newIds = words.filter(w => !known.has(w.id)).map(w => w.id); }
  let pool = D.words.slice(0, Math.max(200, (words[words.length - 1]?.id || 0) + 40)).filter(x => !(x.lem === 'اللَّه' || x.lem === 'رَبّ'));
  const SACRED = /^(allah|lord|god|the lord|ar-rahman|the most merciful)/i;
  const isSacred = x => x.lem === 'اللَّه' || x.lem === 'رَبّ' || x.lem === 'إِلٰه' || SACRED.test(x.m);
  const distract = (w, k = 3, f = x => x.m) => { if (isSacred(w)) pool = pool.filter(x => x.pos !== 'PN' && !/(shaytan|satan|devil|iblis|firaun|pharaoh|idol|taghut)/i.test(x.m)); return _distract(w, k, f); };
  const _distract = (w, k = 3, f = x => x.m) => { const seen = new Set([norm(f(w))]); const out = []; for (const x of shuffle(pool.filter(x => x.id !== w.id && x.pos === w.pos)).concat(shuffle(pool.filter(x => x.id !== w.id)))) { const key = norm(f(x)); if (seen.has(key) || clash(x, w) || out.some(o => clash(o, x))) continue; seen.add(key); out.push(x); if (out.length >= k) break; } return out; };
  // Build exercise queue: lesson = 4 chunks of 5 words; each chunk: intro cards → recognise → choose arabic → listen → match; finish with ayah reading.
  const norm = s => String(s).toLowerCase().replace(/^to /, '').replace(/[^a-z\u0600-\u06ff ]/g, '').trim();
  const parts = m => norm(m).split('/').map(x => x.trim()).filter(Boolean); const NEG = /^(not|no|never|will not|did not|is not|nor)\b/;
  const clash = (a, b) => { const A = parts(a.m), B = parts(b.m); return A.some(x => B.includes(x)) || (A.some(x => NEG.test(x)) && B.some(x => NEG.test(x))) || A[0].split(' ')[0] === B[0].split(' ')[0]; };
  const Q = [];
  const chunkSize = 5;
  for (let c = 0; c < words.length; c += chunkSize) {
    const ch = words.slice(c, c + chunkSize);
    if (mode !== 'review') ch.forEach(w => { if (newIds.includes(w.id)) Q.push({ t: 'intro', w }); });
    shuffle(ch).forEach(w => Q.push({ t: 'mean', w }));
    shuffle(ch).slice(0, 3).forEach(w => Q.push({ t: 'arab', w }));
    shuffle(ch).filter(w => w.au).slice(0, 2).forEach(w => Q.push({ t: 'listen', w }));
    { const ms = []; for (const w of ch) if (!ms.some(o => clash(o, w))) ms.push(w); if (ms.length >= 3) Q.push({ t: 'match', ws: ms.slice(0, 4) }); }
  }
  shuffle(words.filter(w => w.ex?.length && w.ex[0].g)).slice(0, mode === 'review' ? 2 : 3).forEach(w => Q.push({ t: 'ayah', w }));
  const total = Q.length; let i = 0, xp = 0, combo = 0, lost = 0, hearts = s.hearts, mistakes = 0; const answers = new Map(); const retry = [];
  const fin = async () => {
    const passed = mode === 'review' || hearts > 0, stars = mistakes === 0 ? 3 : mistakes <= 3 ? 2 : 1;
    const before = coverage(D, s);
    s = await api('/arabic/result', { body: { unit: mode === 'review' ? 0 : unitN, passed, stars, xp: xp + (passed && mode !== 'review' ? 15 : 0), heartsLost: lost, answers: [...answers].map(([id, ok]) => ({ id, ok })) } }).catch(() => s);
    if (refill && mistakes <= 2) s = await api('/arabic/refill', { body: {} }).catch(() => s);
    const after = coverage(D, s);
    p.innerHTML = `<div class="ar-end ${passed ? 'win' : 'lose'}"><div class="ar-endic">${passed ? I.check : I.heart}</div><h2>${passed ? (mode === 'review' ? 'Review complete!' : 'Lesson complete!') : 'Out of hearts'}</h2>
      ${passed && mode !== 'review' ? `<div class="ar-stars">${'★'.repeat(stars)}<span>${'★'.repeat(3 - stars)}</span></div>` : ''}
      <div class="ar-endk"><div><b>+${xp + (passed && mode !== 'review' ? 15 : 0)}</b><small>XP</small></div><div><b>${after}%</b><small>of the Qur’an${after > before ? ` <em>+${Math.round((after - before) * 10) / 10}</em>` : ''}</small></div><div><b>${Math.round((answers.size ? [...answers.values()].filter(Boolean).length / answers.size : 1) * 100)}%</b><small>accuracy</small></div></div>
      ${refill && mistakes <= 2 ? '<p class="small">You earned a heart back ❤</p>' : ''}
      <p class="muted small">${passed ? 'Words you got wrong come back sooner in Review.' : 'Hearts refill over time — or practise to earn one.'}</p>
      <button class="btn accent block" id="eN">${passed && mode !== 'review' && unitN < 100 ? 'Next lesson' : 'Back to map'}</button>${passed ? '' : '<button class="btn ghost block" id="eR" style="margin-top:8px">Try again</button>'}</div>`;
    vibrate(passed ? [20, 60, 20, 60, 40] : 80);
    $('#eN').onclick = () => go(passed && mode !== 'review' && unitN < 100 ? '/arabic/lesson/' + (unitN + 1) : '/arabic');
    const er = $('#eR'); if (er) er.onclick = () => viewLesson(unitN);
  };
  const header = () => `<div class="ar-lh2"><button class="iconbtn" id="lX" aria-label="Quit">${I.x}</button><div class="ar-pb"><i style="width:${i / total * 100}%"></i></div>${mode === 'review' ? '' : `<span class="ar-hp">${I.heart}<b>${hearts}</b></span>`}</div>${combo >= 3 ? `<div class="ar-combo">${I.flame} ${combo} in a row!</div>` : ''}`;
  const answer = (ok, w, el, correctSel) => {
    if (w) { const prev = answers.get(w.id); answers.set(w.id, prev === false ? false : ok); }
    ding(ok); if (ok) { combo++; xp += combo >= 5 ? 3 : 2; } else { combo = 0; mistakes++; if (mode !== 'review') { hearts--; lost++; } if (w) retry.push({ t: 'mean', w }); }
    const bar = document.createElement('div'); bar.className = 'ar-fb ' + (ok ? 'ok' : 'no');
    bar.innerHTML = `<div class="grow"><b>${ok ? ['Excellent!', 'MashaAllah!', 'Correct!', 'Great!'][Math.floor(Math.random() * 4)] : 'Not quite'}</b>${w ? `<div><span class="ar">${esc(w.ar)}</span> = ${esc(w.m)}</div>` : ''}</div><button class="btn ${ok ? 'accent' : 'danger'}" id="fbN">Continue</button>`;
    p.appendChild(bar); if (w && !ok) playWord(w);
    $('#fbN', bar).onclick = () => { bar.remove(); if (mode !== 'review' && hearts <= 0) return fin(); i++; if (i >= Q.length && retry.length) { Q.push(...retry.splice(0)); } step(); };
  };
  const step = () => {
    if (i >= Q.length) return fin();
    pool = D.words.slice(0, Math.max(200, (words[words.length - 1]?.id || 0) + 40)).filter(x => !(x.lem === 'اللَّه' || x.lem === 'رَبّ'));
    const x = Q[i], w = x.w;
    let body = '';
    if (x.t === 'intro') body = `<div class="ar-qt">New word</div><div class="ar-card"><button class="ar-say" id="say">${I.speaker}</button><div class="ar ar-w">${esc(w.ar)}</div><div class="ar-tr">${esc(w.t)}</div><div class="ar-m">${esc(w.m)}</div>
        <div class="ar-meta"><span>${POS[w.pos] || ''}</span>${w.root ? `<span>root <b class="ar">${esc([...w.root].join(' '))}</b></span>` : ''}<span>appears ${w.n.toLocaleString()}× in the Qur’an</span></div>
        ${w.f.length > 1 ? `<div class="ar-forms">${w.f.slice(0, 5).map(f => `<span class="ar">${esc(f)}</span>`).join('')}</div>` : ''}
        ${w.ex[0] ? `<div class="ar-ex">${ayahHTML(w.ex[0])}<div>“${esc(w.ex[0].g)}” <small>Qur’an ${w.ex[0].k}</small></div></div>` : ''}</div><button class="btn accent block ar-cont" id="iN">Got it</button>`;
    else if (x.t === 'mean' || x.t === 'listen') { const opts = shuffle([w, ...distract(w)]); body = `<div class="ar-qt">${x.t === 'listen' ? 'Listen — what does it mean?' : 'What does this mean?'}</div>
        <div class="ar-prompt">${x.t === 'listen' ? `<button class="ar-bigsay" id="say">${I.speaker}</button>` : `<div class="ar ar-w">${esc(w.ar)}</div><button class="ar-say sm" id="say">${I.speaker}</button>`}</div>
        <div class="ar-opts">${opts.map(o => `<button data-id="${o.id}">${esc(o.m)}</button>`).join('')}</div>`; }
    else if (x.t === 'arab') { const opts = shuffle([w, ...distract(w, 3, y => y.ar)]); body = `<div class="ar-qt">Which word means…</div><div class="ar-prompt"><div class="ar-mq">“${esc(w.m)}”</div></div><div class="ar-opts ar-opts-ar">${opts.map(o => `<button class="ar" data-id="${o.id}">${esc(o.ar)}</button>`).join('')}</div>`; }
    else if (x.t === 'match') { body = `<div class="ar-qt">Match the pairs</div><div class="ar-match"><div>${shuffle(x.ws).map(o => `<button class="ar" data-ma="${o.id}">${esc(o.ar)}</button>`).join('')}</div><div>${shuffle(x.ws).map(o => `<button data-mb="${o.id}">${esc(o.m)}</button>`).join('')}</div></div>`; }
    else if (x.t === 'ayah') { const ex = w.ex[Math.floor(Math.random() * w.ex.length)]; const others = distract(w, 3).map(y => y.ex?.[0]?.g || y.m); const opts = shuffle([ex.g, ...others.filter(o => norm(o) !== norm(ex.g))].slice(0, 4));
      body = `<div class="ar-qt">What does the highlighted word mean here?</div><div class="ar-prompt ar-ayah">${ayahHTML(ex)}<small class="faint">Qur’an ${ex.k}</small></div><div class="ar-opts">${opts.map(o => `<button data-tx="${escAttr(o)}">${esc(o)}</button>`).join('')}</div>`; x.ans = ex.g; }
    p.innerHTML = header() + `<div class="ar-ex-wrap">${body}</div>`;
    $('#lX').onclick = async () => { if (await confirmSheet('Quit this lesson?', 'Your progress in this lesson will be lost.', 'Quit', true)) go('/arabic'); };
    const sy = $('#say'); if (sy) sy.onclick = () => playWord(w);
    if (x.t === 'intro') { playWord(w); $('#iN').onclick = () => { answers.set(w.id, answers.get(w.id) ?? true); i++; step(); }; }
    if (x.t === 'listen') playWord(w);
    if (x.t === 'mean' || x.t === 'listen' || x.t === 'arab') $$('[data-id]', p).forEach(b => b.onclick = () => { const ok = +b.dataset.id === w.id; $$('[data-id]', p).forEach(z => { z.disabled = true; if (+z.dataset.id === w.id) z.classList.add('good'); }); if (!ok) b.classList.add('bad'); answer(ok, w); });
    if (x.t === 'ayah') $$('[data-tx]', p).forEach(b => b.onclick = () => { const ok = b.dataset.tx === x.ans; $$('[data-tx]', p).forEach(z => { z.disabled = true; if (z.dataset.tx === x.ans) z.classList.add('good'); }); if (!ok) b.classList.add('bad'); answer(ok, w); });
    if (x.t === 'match') { let a = null, left = x.ws.length, bad = 0;
      const pick = () => { if (!a || !a.b) return; const ok = a.a.dataset.ma === a.b.dataset.mb; if (ok) { [a.a, a.b].forEach(z => { z.classList.add('good'); z.disabled = true; }); ding(true); left--; xp += 1; if (left === 0) setTimeout(() => answer(bad === 0, null), 250); } else { bad++; [a.a, a.b].forEach(z => { z.classList.add('bad'); setTimeout(() => z.classList.remove('bad', 'sel'), 450); }); ding(false); } a = null; };
      $$('[data-ma]', p).forEach(b => b.onclick = () => { $$('[data-ma]', p).forEach(z => z.classList.remove('sel')); b.classList.add('sel'); a = { a: b, b: a?.b }; playWord(D.words[+b.dataset.ma - 1]); pick(); });
      $$('[data-mb]', p).forEach(b => b.onclick = () => { $$('[data-mb]', p).forEach(z => z.classList.remove('sel')); b.classList.add('sel'); a = { a: a?.a, b }; pick(); }); }
  };
  step();
}

export const routes = [
  [/^\/arabic$/, () => viewArabic(), 'arabic'],
  [/^\/arabic\/lesson\/(\d+)$/, m => viewLesson(+m[1]), 'arabic'],
  [/^\/arabic\/review$/, () => viewLesson(0, 'review'), 'arabic'],
];
