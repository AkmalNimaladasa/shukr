// Daily: Home, Journal, Blessings, Dhikr (rebuilt), Adhkar & Duas, Akhirah, 99 Names
import { hasMemoryPlan, $, escAttr, $$, esc, LS, I, api, loadJSON, state, toast, vibrate, shell, bindGo, go, sheet, confirmSheet, md, localDay, localHour, hijri, daysAgo, dayIndex,
  computeTimes, loadMP, nextPrayer, PRAYERS, fmtTime, cd, every, askAlim, empty, loadingHTML, sectionOn, onCleanup, saveSettings } from './core.js';

// ================= HOME =================
const GREET = () => { const h = localHour(); return h < 4 ? 'Peaceful night' : h < 12 ? 'Sabah al-khayr' : h < 17 ? 'Good afternoon' : 'Masa’ al-khayr'; };
export async function viewHome() {
  const p = shell('Shukr', { right: sectionOn('alim') ? `<button class="iconbtn" data-go="/chat/new" aria-label="New chat with Alim">${I.edit}</button>` : '' });
  bindGo($('#topbar'));
  const [ayat, names, hd] = await Promise.all([loadJSON('/data/ayat.json'), loadJSON('/data/names.json'), loadJSON('/data/hadith40.json')]);
  const name = (state.user.name || '').split(' ')[0];
  const ay = ayat[dayIndex(ayat.length)], nm = names[dayIndex(99)], h40 = hd.nawawi[dayIndex(hd.nawawi.length, 7)];
  p.innerHTML = `
    <div class="greet">${I.khatam}<span>${GREET()}${name ? ', ' + esc(name) : ''}</span></div>
    <div class="sub">${new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', timeZone: state.user.settings.tz })} · ${esc(hijri())}</div>
    ${sectionOn('prayer') ? '<div id="hero"></div>' : ''}
    <div class="streaks" id="streaks">${['Journal', 'Morning', 'Evening'].map(l => `<div class="streak"><div class="n">–</div><div class="l">${l}</div></div>`).join('')}</div>
    <div class="card"><div class="card-head"><h3>Today</h3><span class="faint small" id="todayPct"></span></div><div id="checklist">${loadingHTML()}</div></div>
    ${sectionOn('blessings') ? `<div class="card"><div class="card-head"><h3>Count a blessing</h3><a class="link" href="#/blessings">See all</a></div>
      <form id="qbForm" class="row"><input class="input" id="qbInput" placeholder="Alhamdulillah for…" autocomplete="off" maxlength="300"><button class="btn accent" aria-label="Save blessing" style="padding:12px 14px">${I.plus}</button></form></div>` : ''}
    ${sectionOn('alim') ? `<div class="card tap" data-go="/chat/new"><div class="row"><span style="width:28px;height:28px;color:var(--accent)">${I.khatam}</span><div class="grow"><div style="font-weight:600">Talk to Alim</div><div class="muted small" id="alimNudge">${hasMemoryPlan() ? 'Your companion remembers your journey, searches the web, cites Quran & Sunnah, and talks by voice.' : 'Your companion answers questions, searches the web, cites Quran & Sunnah, and talks by voice.'}</div></div>${I.fwd}</div></div>` : ''}
    <div class="card soft tap" data-go="/quran/${ay.ref.split(':')[0]}?a=${ay.ref.split(':')[1]}">
      <div class="faint small" style="margin-bottom:4px">Ayah of the day · ${esc(ay.surah)} ${esc(ay.ref)}</div>
      <div class="ar">${esc(ay.ar)}</div><div style="font-family:var(--serif);font-size:16.5px;margin-top:6px">${esc(ay.en)}</div></div>
    ${sectionOn('hadith') ? `<div class="card soft tap" data-go="/hadith/nawawi"><div class="faint small" style="margin-bottom:4px">Hadith of the day · 40 Hadith an-Nawawi #${h40.n}</div><div style="font-family:var(--serif);font-size:15.5px;line-height:1.55">${esc(h40.en.length > 420 ? h40.en.slice(0, 420) + '…' : h40.en)}</div></div>` : ''}
    ${sectionOn('names') ? `<div class="card soft tap" data-go="/names"><div class="faint small">Name of Allah for today · ${nm.n}/99</div>
      <div class="row between"><div><div style="font-family:var(--serif);font-size:20px">${esc(nm.tl)}</div><div class="muted small">${esc(nm.en)}</div></div><div class="ar" style="font-size:34px">${esc(nm.ar)}</div></div></div>` : ''}
    ${sectionOn('akhirah') ? '<div id="akCard"></div>' : ''}
    <div id="installCard"></div>`;
  bindGo(p);
  if (sectionOn('prayer')) heroCard($('#hero'));
  $('#qbForm')?.addEventListener('submit', async e => { e.preventDefault(); const v = $('#qbInput').value.trim(); if (!v) return; $('#qbInput').value = ''; try { await api('/blessings', { body: { text: v } }); vibrate(15); toast('Alhamdulillah — blessing saved'); } catch (er) { toast(er.message); } });
  installCard($('#installCard'));
  if (sectionOn('akhirah')) loadJSON('/data/akhirah.json').then(ak => { const it = ak.items[dayIndex(ak.items.length, 3)]; const el = $('#akCard'); if (!el) return;
    el.innerHTML = `<div class="card soft tap" data-go="/akhirah"><div class="faint small" style="margin-bottom:4px">Reminder of the Hereafter · ${esc(ak.topics[it.topic])}</div><div style="font-family:var(--serif);font-size:15.5px;line-height:1.55">${esc(it.en.length > 300 ? it.en.slice(0, 300) + '…' : it.en)}</div><div class="small" style="color:var(--accent);margin-top:6px;font-weight:600">${esc(it.ref)}</div></div>`; bindGo(el); });
  try {
    const [t, qp] = await Promise.all([api('/today'), sectionOn('quran') ? api('/quran/progress').catch(() => null) : null]);
    const st = t.streaks;
    $('#streaks').innerHTML = [['journal', 'Journal', '/journal/new'], ['morning', 'Morning', '/adhkar/morning'], ['evening', 'Evening', '/adhkar/evening']].map(([k, l, g]) => `<div class="streak ${st[k].doneToday ? 'done' : ''}" data-go="${g}"><div class="n">${st[k].current}${st[k].current ? I.flame : ''}</div><div class="l">${l} streak</div></div>`).join('');
    bindGo($('#streaks'));
    const prayed = Object.values(t.prayers).filter(s => s !== 'missed').length;
    const dhikr = t.dhikr.reduce((a, d) => a + d.count, 0), goal = state.user.settings.dhikrGoal || 100;
    const ad = k => t.adhkar.find(a => a.kind === k); const times = computeTimes(new Date(), await loadMP());
    const now = new Date();
    const items = [
      sectionOn('journal') && ['/journal/new', 'Gratitude journal', t.entries > 0, t.entries ? t.entries + ' entr' + (t.entries > 1 ? 'ies' : 'y') : 'Write 3 blessings'],
      sectionOn('adhkar') && ['/adhkar/morning', 'Morning adhkar', !!ad('morning')?.completed, ad('morning') ? `${ad('morning').done}/${ad('morning').total}` : (times && now > times.fajr && now < times.dhuhr ? 'Due now' : 'After Fajr')],
      sectionOn('adhkar') && ['/adhkar/evening', 'Evening adhkar', !!ad('evening')?.completed, ad('evening') ? `${ad('evening').done}/${ad('evening').total}` : (times && now > times.asr ? 'Due now' : 'After Asr')],
      sectionOn('prayer') && ['/prayer', 'Five daily prayers', prayed >= 5, `${prayed}/5 logged`],
      sectionOn('dhikr') && ['/dhikr', 'Dhikr goal', dhikr >= goal, `${dhikr}/${goal}`],
      sectionOn('quran') && ['/quran', 'Quran reading', qp ? qp.todayPages >= (qp.progress.daily_goal || 5) : (t.daylog.quran_pages || 0) > 0, qp ? `${qp.todayPages}/${qp.progress.daily_goal || 5} pages` : (t.daylog.quran_pages || 0) + ' pages']
    ].filter(Boolean);
    const done = items.filter(i => i[2]).length;
    $('#todayPct').textContent = `${done}/${items.length} done`;
    $('#checklist').innerHTML = items.map(([g, l, on, m]) => `<button class="check ${on ? 'on' : ''}" data-go="${g}"><span class="box">${on ? I.check : ''}</span><span class="t">${l}</span><span class="meta">${m}</span></button>`).join('');
    bindGo($('#checklist'));
    if (st.journal.current >= 3 && $('#alimNudge')) $('#alimNudge').textContent = `${st.journal.current} days of gratitude in a row — ask Alim what patterns it sees.`;
  } catch (e) { $('#checklist').textContent = e.message; }
}
export async function heroCard(el) {
  if (!el) return;
  const mp = await loadMP();
  const draw = () => {
    const np = nextPrayer(mp);
    if (!np) { el.innerHTML = `<div class="card"><div class="row between"><div><div style="font-weight:600">Set your location</div><div class="muted small">For accurate prayer times, qibla and reminders.</div></div><button class="btn accent" id="locBtn">Locate</button></div></div>`; $('#locBtn').onclick = () => import('./views-worship.js').then(m => m.locate().then(() => heroCard(el))); return false; }
    const t = np.times;
    el.innerHTML = `<div class="hero" data-go="/prayer"><svg class="moon" viewBox="0 0 64 64" fill="#fff"><path d="M40 52A22 22 0 1 1 30.5 10.2 18 18 0 1 0 52 37.5 22 22 0 0 1 40 52Z"/></svg>
      <div class="k">Next prayer${np.tomorrow ? ' (tomorrow)' : ''} · ${esc(state.user.settings.city || '')}</div><div class="v">${np.name} <span style="opacity:.8">${fmtTime(np.time)}</span></div>
      <div class="cd" id="cdown">in ${cd(np.time - new Date())}</div>
      <div class="ptimes">${PRAYERS.filter(p => p[0] !== 'sunrise').map(([k, n]) => `<span class="${k === np.key && !np.tomorrow ? 'on' : ''}">${n}<b>${fmtTime(t[k]).replace(/\s?[AP]M/i, '')}</b></span>`).join('')}</div>
      <div class="src">${'Calculated · ' + esc(state.user.settings.method || '')}</div></div>`;
    bindGo(el); return np;
  };
  let np = draw();
  if (np) every(1000, () => { const c = $('#cdown'); if (!c) return; if (np.time - new Date() <= 0) { np = draw(); return; } c.textContent = 'in ' + cd(np.time - new Date()); });
}
function installCard(el) {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone || LS.get('hideInstall', false) || !el) return;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  el.innerHTML = `<div class="card"><div class="install-banner">${I.install}<div class="grow"><div style="font-weight:600">Install Shukr</div><div class="muted small">${ios ? 'In Safari tap <b>Share</b> → <b>Add to Home Screen</b>.' : 'Add it to your home screen — no app store needed.'}</div></div>${!ios && state.deferredPrompt ? '<button class="btn accent sm" id="instBtn">Install</button>' : ''}<button class="iconbtn sm" id="instX" aria-label="Dismiss">${I.x}</button></div></div>`;
  $('#instBtn')?.addEventListener('click', async () => { state.deferredPrompt.prompt(); await state.deferredPrompt.userChoice; state.deferredPrompt = null; el.innerHTML = ''; });
  $('#instX').onclick = () => { LS.set('hideInstall', true); el.innerHTML = ''; };
}

// ================= JOURNAL =================
const PROMPTS = ['What are three blessings from today, big or small?', 'Who made your day easier today? How can you thank them?', 'What ease came after a difficulty recently?', 'Which ability of your body are you grateful for today?',
  'What prayer of yours did Allah answer — perhaps in a way you didn’t expect?', 'What did you learn today that brought you closer to Allah?', 'Describe a moment today where you felt at peace.', 'What is a hidden blessing you usually overlook?',
  'What harm were you protected from?', 'What provision (rizq) arrived today — food, money, time, knowledge?', 'Which person in your family are you most grateful for right now, and why?', 'What about your faith are you thankful for today?',
  'What made you smile today?', 'What hardship has made you stronger?', 'Which beautiful thing in nature did you notice today?', 'How did you show gratitude through action today?'];
const MOOD_LABELS = ['Heavy', 'Low', 'Okay', 'Good', 'Grateful'];
export async function viewJournalNew() {
  const p = shell('New entry', { back: '/journal' });
  let mood = null, prompt = PROMPTS[dayIndex(PROMPTS.length)], recH = null;
  p.innerHTML = `
    <div class="prompt-card"><span id="promptTxt">${esc(prompt)}</span><button id="shuffle" aria-label="Another prompt">${I.retry}</button></div>
    <label class="lbl">How is your heart today?</label>
    <div class="moods">${I.moodIcons.map((m, i) => `<button class="mood" data-m="${i + 1}" aria-label="${MOOD_LABELS[i]}">${m}${MOOD_LABELS[i]}</button>`).join('')}</div>
    <div class="row between"><label class="lbl">Your blessings</label><button class="btn ghost sm" id="dictate">${I.mic} Dictate</button></div>
    <textarea class="textarea" id="jtext" placeholder="Alhamdulillah for…\n1. \n2. \n3. " maxlength="6000">${esc(LS.get('draft', ''))}</textarea>
    <button class="btn accent block" id="saveEntry" style="margin-top:12px">Save entry</button>
    <div class="faint small" style="margin-top:8px;text-align:center">Alim gathers each blessing into your Blessings jar and offers a reflection.</div>
    <div id="result"></div>`;
  $$('.mood').forEach(b => b.onclick = () => { mood = +b.dataset.m; $$('.mood').forEach(x => x.classList.toggle('on', x === b)); vibrate(10); });
  $('#shuffle').onclick = () => { prompt = PROMPTS[Math.floor(Math.random() * PROMPTS.length)]; $('#promptTxt').textContent = prompt; };
  $('#jtext').addEventListener('input', e => LS.set('draft', e.target.value));
  const { recordAudio, transcribe } = await import('./core.js');
  $('#dictate').onclick = async () => {
    const b = $('#dictate');
    if (recH) { b.disabled = true; b.innerHTML = '<span class="spin"></span> Transcribing'; try { const blob = await recH.stop(); recH = null; const t = await transcribe(blob); const ta = $('#jtext'); ta.value = (ta.value ? ta.value.trimEnd() + '\n' : '') + t; LS.set('draft', ta.value); } catch (e) { toast(e.message); } b.disabled = false; b.innerHTML = `${I.mic} Dictate`; return; }
    try { recH = await recordAudio(); b.innerHTML = `<span class="recdot"></span> Stop`; vibrate(15); onCleanup(() => recH && recH.cancel()); } catch (e) { toast(e.message || 'Microphone permission denied'); }
  };
  $('#saveEntry').onclick = async () => {
    const text = $('#jtext').value.trim(); if (!text) return toast('Write at least one blessing');
    const b = $('#saveEntry'); b.disabled = true; b.innerHTML = '<span class="spin"></span> Reflecting…';
    try {
      const r = await api('/entries', { body: { text, mood, prompt } }); LS.set('draft', ''); vibrate([20, 40, 20]);
      $('#result').innerHTML = `<div class="card" style="margin-top:16px"><div class="card-head"><h3>Alhamdulillah</h3><span class="badge">${r.blessings.length} blessing${r.blessings.length === 1 ? '' : 's'}</span></div>
        ${r.blessings.map(x => `<div class="row" style="align-items:flex-start;margin:6px 0"><span class="cat-dot" style="background:${catColor(x.category)}"></span><span style="font-family:var(--serif)">${esc(x.text)}</span></div>`).join('')}
        ${r.entry.ai_reflection ? `<div class="reflection md">${md(r.entry.ai_reflection)}</div>` : ''}
        <div class="row" style="margin-top:14px"><button class="btn ghost grow" data-go="/blessings">Blessings jar</button><button class="btn grow" id="talk">Talk to Alim</button></div></div>`;
      bindGo($('#result')); $('#talk').onclick = () => askAlim(`I just wrote this gratitude entry:\n\n${text}\n\nWhat do you notice?`, 'coach');
      b.innerHTML = 'Saved'; $('#main').scrollTo({ top: 99999, behavior: 'smooth' });
    } catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Save entry'; }
  };
}
export async function viewJournal() {
  const p = shell('Journal', { right: `<button class="iconbtn" data-go="/journal/new" aria-label="New entry">${I.edit}</button>` }); bindGo($('#topbar'));
  p.innerHTML = `<button class="btn accent block" data-go="/journal/new" style="margin:8px 0 14px">${I.plus} Write today’s blessings</button><div id="entries">${loadingHTML()}</div>`;
  bindGo(p);
  const { entries } = await api('/entries?limit=200');
  if (!entries.length) { $('#entries').innerHTML = empty('book', 'Your journal is empty.<br>Start with three things you’re grateful for.'); return; }
  $('#entries').innerHTML = entries.map(e => `<div class="entry"><div class="d">${daysAgo(e.day)}${e.mood ? ' · ' + MOOD_LABELS[e.mood - 1] : ''}${(e.tags || []).slice(0, 3).map(t => `<span class="badge">${esc(t)}</span>`).join('')}<span style="margin-left:auto"><button data-del="${e.id}" class="iconbtn sm faint" aria-label="Delete entry">${I.trash}</button></span></div>
    <div class="t">${esc(e.text)}</div>${e.ai_reflection ? `<div class="reflection md">${md(e.ai_reflection)}</div>` : ''}</div>`).join('');
  $$('[data-del]').forEach(b => b.onclick = async () => { if (!(await confirmSheet('Delete entry?', 'This entry and the blessings gathered from it will be removed.', 'Delete', true))) return; await api('/entries/' + b.dataset.del, { method: 'DELETE' }); viewJournal(); });
}

// ================= BLESSINGS =================
const CATS = { faith: '#C96442', family: '#B8862F', health: '#4E7D5B', people: '#3E6A8F', provision: '#8A6BB0', nature: '#5E9B6F', knowledge: '#2F7F8F', work: '#7A6E5D', home: '#A7724B', ease: '#6F8FAF', protection: '#9C5A5A', growth: '#7E9A3D', 'small joys': '#D08A3E', other: '#8F8D86' };
export const catColor = c => CATS[c] || CATS.other;
export async function viewBlessings() {
  const p = shell('Blessings'); let filter = 'all', q = '', all = [];
  p.innerHTML = `<div class="jar">${I.gem}<div class="n" id="bn">–</div><div class="muted">blessings recorded</div><div class="faint small" style="margin-top:6px">“And if you should count the favours of Allah, you could not enumerate them.” — An-Nahl 16:18</div></div>
    <div id="resurface"></div>
    <form id="addB" class="row" style="margin-bottom:10px"><input class="input" id="bIn" placeholder="Add a blessing…" maxlength="300"><button class="btn accent" style="padding:12px 14px" aria-label="Add">${I.plus}</button></form>
    <input class="input" id="bSearch" placeholder="Search blessings" style="margin-bottom:10px" type="search">
    <div class="chips" id="bChips"></div><div id="bList">${loadingHTML()}</div>`;
  function draw() {
    $('#bn').textContent = all.length;
    const cats = {}; all.forEach(b => cats[b.category] = (cats[b.category] || 0) + 1);
    $('#bChips').innerHTML = [['all', all.length], ['fav', all.filter(b => b.favorite).length], ...Object.entries(cats).sort((a, b) => b[1] - a[1])].map(([c, n]) => `<button class="chip ${filter === c ? 'on' : ''}" data-c="${escAttr(c)}">${c === 'all' ? 'All' : c === 'fav' ? 'Favourites' : `<span class="cat-dot" style="margin:0;background:${catColor(c)}"></span>${esc(c)}`} <span style="opacity:.6">${n}</span></button>`).join('');
    $$('[data-c]').forEach(b => b.onclick = () => { filter = b.dataset.c; draw(); });
    let list = all.filter(b => filter === 'all' || (filter === 'fav' ? b.favorite : b.category === filter));
    if (q) list = list.filter(b => b.text.toLowerCase().includes(q));
    if (!all.length) { $('#bList').innerHTML = empty('gem', 'No blessings yet. Every journal entry fills this jar.'); return; }
    let lastDay = null;
    $('#bList').innerHTML = list.map(b => { const h = b.day !== lastDay ? `<div class="faint small" style="margin:14px 2px 6px">${daysAgo(b.day)}</div>` : ''; lastDay = b.day;
      return h + `<div class="bless"><span class="cat-dot" style="background:${catColor(b.category)}"></span><div class="grow"><div class="txt">${esc(b.text)}</div><div class="meta">${esc(b.category)}</div></div><button class="fav ${b.favorite ? 'on' : ''}" data-f="${b.id}" aria-label="Favourite">${b.favorite ? I.starFill : I.star}</button></div>`; }).join('') || empty('search', 'Nothing here.');
    $$('[data-f]').forEach(b => b.onclick = async () => { const x = all.find(y => y.id == b.dataset.f); x.favorite = !x.favorite; draw(); await api('/blessings/' + x.id, { method: 'PATCH', body: { favorite: x.favorite } }).catch(() => {}); });
    const old = all.filter(b => b.day < localDay());
    if (old.length && !$('#resurface').innerHTML) {
      const r = old[Math.floor(Math.random() * old.length)];
      $('#resurface').innerHTML = `<div class="card soft"><div class="faint small">Remember this blessing? · ${daysAgo(r.day)}</div><div style="font-family:var(--serif);font-size:18px;margin:6px 0">“${esc(r.text)}”</div><button class="link" id="reThank">Say Alhamdulillah again</button></div>`;
      $('#reThank').onclick = async () => { await api('/dhikr', { body: { phrase: 'alhamdulillah', add: 1 } }).catch(() => {}); vibrate(15); toast('Alhamdulillah'); };
    }
  }
  $('#addB').onsubmit = async e => { e.preventDefault(); const v = $('#bIn').value.trim(); if (!v) return; $('#bIn').value = ''; try { const { blessing } = await api('/blessings', { body: { text: v } }); all.unshift(blessing); draw(); vibrate(15); } catch (er) { toast(er.message); } };
  $('#bSearch').oninput = e => { q = e.target.value.toLowerCase(); draw(); };
  all = (await api('/blessings')).blessings; draw();
}

// ================= DHIKR (rebuilt: full-screen tap zone, no re-render per tap) =================
const DHIKR = [
  { k: 'subhanallah', ar: 'سُبْحَانَ اللَّهِ', tl: 'SubhanAllah', en: 'Glory be to Allah', t: 33 },
  { k: 'alhamdulillah', ar: 'الْحَمْدُ لِلَّهِ', tl: 'Alhamdulillah', en: 'All praise is for Allah', t: 33 },
  { k: 'allahuakbar', ar: 'اللَّهُ أَكْبَرُ', tl: 'Allahu Akbar', en: 'Allah is the Greatest', t: 34 },
  { k: 'astaghfirullah', ar: 'أَسْتَغْفِرُ اللَّهَ وَأَتُوبُ إِلَيْهِ', tl: 'Astaghfirullah', en: 'I seek Allah’s forgiveness and repent to Him', t: 100 },
  { k: 'tahlil', ar: 'لَا إِلَٰهَ إِلَّا اللَّهُ', tl: 'La ilaha illallah', en: 'There is no god but Allah', t: 100 },
  { k: 'subhanallahwabihamdihi', ar: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ', tl: 'SubhanAllahi wa bihamdihi', en: 'Glory and praise be to Allah', t: 100 },
  { k: 'salawat', ar: 'اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَى نَبِيِّنَا مُحَمَّدٍ', tl: 'Salawat', en: 'O Allah, send prayers and peace upon our Prophet Muhammad ﷺ', t: 100 },
  { k: 'hawqala', ar: 'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ', tl: 'La hawla wa la quwwata illa billah', en: 'There is no power nor might except with Allah', t: 100 },
  { k: 'hasbunallah', ar: 'حَسْبُنَا اللَّهُ وَنِعْمَ الْوَكِيلُ', tl: 'Hasbunallahu wa ni‘mal wakil', en: 'Allah is sufficient for us, the best Disposer of affairs', t: 100 },
  { k: 'yunus', ar: 'لَا إِلَٰهَ إِلَّا أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ', tl: 'Dua of Yunus', en: 'None has the right to be worshipped but You; glory be to You; I was among the wrongdoers (21:87)', t: 100 }
];
export async function viewDhikr() {
  const p = shell('Dhikr', { flush: true, noPad: true });
  const day = localDay();
  const counts = LS.get('dhikrCounts', {}); if (counts._day !== day) { for (const k of Object.keys(counts)) delete counts[k]; counts._day = day; LS.set('dhikrCounts', counts); }
  const custom = LS.get('customDhikr', []); const list = () => [...DHIKR, ...custom];
  let idx = Math.min(LS.get('dhikrIdx', 0), list().length - 1), fatimah = LS.get('fatimah', false);
  const goal = state.user.settings.dhikrGoal || 100;
  let pending = {}, flushT = null;
  const flush = async () => { const p2 = pending; pending = {}; for (const [k, n] of Object.entries(p2)) { if (!n) continue; try { await api('/dhikr', { body: { phrase: k, add: n } }); } catch { pending[k] = (pending[k] || 0) + n; } } };
  onCleanup(() => { clearTimeout(flushT); flush(); });
  window.addEventListener('pagehide', flush);
  onCleanup(() => window.removeEventListener('pagehide', flush));
  p.innerHTML = `<div class="dhikr-page">
    <div class="dhikr-top">
      <div class="chips" id="dChips" style="padding:2px 0 6px"></div>
      <div class="dhikr-tools">
        <label class="row small" style="gap:8px"><span class="toggle" style="transform:scale(.85);transform-origin:left"><input type="checkbox" id="fat"><span></span></span>Tasbih of Fatimah</label>
        <span class="small faint" id="dTotal"></span>
      </div>
      <div class="progressbar" style="height:4px"><div id="dGoal" style="width:0"></div></div>
    </div>
    <div class="dhikr-zone" id="zone" role="button" aria-label="Tap to count" tabindex="0">
      <div class="fill" id="zFill" style="height:0"></div>
      <div class="ztools"><button id="undo" aria-label="Undo">${I.undo}</button><span></span><button id="addCustom" aria-label="Custom dhikr">${I.plus}</button><button id="reset" aria-label="Reset">${I.retry}</button></div>
      <div class="phrase-ar" id="zAr"></div><div class="phrase-tl" id="zTl"></div>
      <div class="count" id="zCount">0</div><div class="target" id="zTarget"></div>
      <div class="hint">Tap anywhere${'vibrate' in navigator ? ' · your phone vibrates on each tap' : ''}</div>
    </div></div>`;
  const zone = $('#zone'), zCount = $('#zCount'), zFill = $('#zFill'), zTarget = $('#zTarget'), dTotal = $('#dTotal'), dGoal = $('#dGoal');
  $('#fat').checked = fatimah;
  const total = () => Object.entries(counts).filter(([k]) => k !== '_day').reduce((a, [, v]) => a + v, 0);
  function chips() {
    $('#dChips').innerHTML = list().map((x, i) => `<button class="chip ${i === idx ? 'on' : ''}" data-i="${i}">${esc(x.tl)}</button>`).join('');
    $$('[data-i]', $('#dChips')).forEach(b => b.onclick = () => { idx = +b.dataset.i; LS.set('dhikrIdx', idx); chips(); phrase(); update(); });
  }
  function phrase() { const d = list()[idx]; $('#zAr').textContent = d.ar || ''; $('#zTl').textContent = d.tl + (d.en ? ' — ' + d.en : ''); }
  function update() {
    const d = list()[idx], c = counts[d.k] || 0, t = d.t || 33;
    const round = c === 0 ? 0 : (c % t === 0 ? t : c % t), rounds = Math.floor((c - 1) / t);
    zCount.textContent = round; zTarget.textContent = `of ${t}${c >= t ? ` · ${Math.floor(c / t)} round${Math.floor(c / t) > 1 ? 's' : ''}` : ''} · total ${c}`;
    zFill.style.height = (round / t * 100) + '%';
    const tt = total(); dTotal.textContent = `Today ${tt}/${goal}`; dGoal.style.width = Math.min(100, tt / goal * 100) + '%';
  }
  // Count on pointerdown for instant response; ignore the synthetic click. Bound once.
  let lastTap = 0;
  const onTap = e => {
    if (e.target.closest && e.target.closest('.ztools')) return;
    if (e.type === 'pointerdown' && e.button !== 0 && e.pointerType === 'mouse') return;
    const now = performance.now(); if (now - lastTap < 60) return; lastTap = now;
    e.preventDefault();
    const d = list()[idx]; counts[d.k] = (counts[d.k] || 0) + 1; LS.set('dhikrCounts', counts);
    pending[d.k] = (pending[d.k] || 0) + 1; clearTimeout(flushT); flushT = setTimeout(flush, 1200);
    const n = counts[d.k], t = d.t || 33;
    zone.classList.add('pressed'); setTimeout(() => zone.classList.remove('pressed'), 90);
    if (n % t === 0) {
      vibrate([60, 60, 120]); zone.classList.remove('pulse'); void zone.offsetWidth; zone.classList.add('pulse');
      if (fatimah && idx < 2) { setTimeout(() => { idx++; LS.set('dhikrIdx', idx); chips(); phrase(); update(); toast('Next: ' + list()[idx].tl); }, 350); }
      else if (fatimah && idx === 2) { toast('Tasbih of Fatimah complete — may Allah accept it'); }
      if (total() === goal) toast('Daily dhikr goal reached. Alhamdulillah!');
    } else vibrate(18);
    update();
  };
  zone.addEventListener('pointerdown', onTap);
  zone.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') onTap(e); });
  zone.addEventListener('contextmenu', e => e.preventDefault());
  $('#fat').onchange = e => { fatimah = e.target.checked; LS.set('fatimah', fatimah); if (fatimah) { idx = 0; LS.set('dhikrIdx', 0); toast('33 SubhanAllah · 33 Alhamdulillah · 34 Allahu Akbar — moves on automatically'); } chips(); phrase(); update(); };
  $('#undo').onclick = () => { const d = list()[idx]; if ((counts[d.k] || 0) > 0) { counts[d.k]--; LS.set('dhikrCounts', counts); if (pending[d.k] > 0) pending[d.k]--; update(); vibrate(8); } };
  $('#reset').onclick = async () => { if (!(await confirmSheet('Reset counter?', 'Resets this phrase’s counter for today. Dhikr already logged stays in your history.', 'Reset'))) return; const d = list()[idx]; counts[d.k] = 0; LS.set('dhikrCounts', counts); update(); };
  $('#addCustom').onclick = () => sheet(`<h3>Custom dhikr</h3><input class="input" id="cAr" placeholder="Arabic (optional)" dir="rtl" style="margin-bottom:8px"><input class="input" id="cTl" placeholder="Words / transliteration" style="margin-bottom:8px" maxlength="80"><input class="input" id="cEn" placeholder="Meaning (optional)" style="margin-bottom:8px" maxlength="160"><input class="input" id="cT" type="number" inputmode="numeric" placeholder="Target" value="100" style="margin-bottom:12px"><button class="btn accent block" id="cSave">Add</button>
    ${custom.length ? `<div class="divider"></div><div class="faint small" style="margin-bottom:6px">Your custom dhikr</div>${custom.map((c, i) => `<div class="list-item"><div class="grow">${esc(c.tl)}</div><button class="iconbtn sm" data-rm="${i}" aria-label="Remove">${I.trash}</button></div>`).join('')}` : ''}`, (sh, close) => {
    $('#cSave', sh).onclick = () => { const tl = $('#cTl', sh).value.trim(); if (!tl) return; custom.push({ k: 'c_' + tl.toLowerCase().replace(/\W+/g, '_').slice(0, 30) + '_' + Date.now() % 1000, ar: $('#cAr', sh).value.trim(), tl, en: $('#cEn', sh).value.trim(), t: Math.max(1, +$('#cT', sh).value || 100) }); LS.set('customDhikr', custom); idx = list().length - 1; LS.set('dhikrIdx', idx); close(); chips(); phrase(); update(); };
    $$('[data-rm]', sh).forEach(b => b.onclick = () => { custom.splice(+b.dataset.rm, 1); LS.set('customDhikr', custom); idx = 0; LS.set('dhikrIdx', 0); close(); chips(); phrase(); update(); });
  });
  try { const t = await api('/today'); t.dhikr.forEach(d => { counts[d.phrase] = Math.max(counts[d.phrase] || 0, d.count); }); LS.set('dhikrCounts', counts); } catch {}
  chips(); phrase(); update();
}

// ================= ADHKAR =================
export async function viewAdhkarList() {
  const p = shell('Adhkar & duas');
  p.innerHTML = loadingHTML();
  const [content, duas, t, mp] = await Promise.all([loadJSON('/data/adhkar.json'), loadJSON('/data/duas.json'), api('/today').catch(() => null), loadMP()]);
  const st = t?.streaks; const now = new Date(), times = computeTimes(now, mp);
  const suggest = times ? (now >= times.fajr && now < times.dhuhr ? 'morning' : now >= times.asr && now < times.isha ? 'evening' : (now >= times.isha || now < times.fajr) ? 'sleep' : null) : null;
  const ic = { morning: 'sun', evening: 'moon', sleep: 'moon', waking: 'sun', salah: 'mosque', istikhara: 'compass', worry: 'heart', anguish: 'hands' };
  p.innerHTML = `<div class="sub" style="margin-top:10px">From <b>Hisnul Muslim</b> (Fortress of the Muslim) by Sa‘id al-Qahtani.</div>
    ${content.categories.map(c => { const ad = t?.adhkar.find(a => a.kind === c.id); return `<div class="card tap" data-go="/adhkar/${c.id}" style="${c.id === suggest ? 'border-color:var(--accent-2)' : ''}">
      <div class="row"><span style="width:26px;height:26px;color:var(--accent)">${I[ic[c.id]] || I.beads}</span><div class="grow"><div class="row wrap" style="gap:8px"><b>${esc(c.title)}</b>${c.id === suggest ? '<span class="badge">Now</span>' : ''}${ad?.completed ? '<span class="badge green">Done</span>' : ''}</div><div class="muted small">${esc(c.subtitle)} · ${c.items.length} ${c.items.length === 1 ? 'dua' : 'adhkar'}</div></div>
      ${st && st[c.id] && st[c.id].current ? `<div style="text-align:right"><div style="font-family:var(--serif);font-size:20px">${st[c.id].current}</div><div class="faint" style="font-size:11px">streak</div></div>` : ''}${I.fwd}</div>
      ${ad && !ad.completed ? `<div class="progressbar" style="margin-top:10px"><div style="width:${ad.done / ad.total * 100}%"></div></div>` : ''}</div>`; }).join('')}
    <h3 style="margin:20px 0 8px">Duas for every occasion</h3>
    ${duas.map(g => `<div class="card flat"><div class="faint small" style="font-weight:600;margin-bottom:4px">${esc(g.group)}</div>${g.chapters.map(c => `<div class="list-item tap" data-go="/duas/${c.id}"><div class="grow">${esc(c.title)}</div><span class="faint small">${c.duas.length}</span>${I.fwd}</div>`).join('')}</div>`).join('')}`;
  bindGo(p);
}
function adhkarItemsHTML(items, prog, opts = {}) {
  const showTl = state.user.settings.showTranslit !== false;
  return items.map((it, i) => { const c = prog[it.id] || 0, fin = c >= it.repeat;
    return `<div class="dhikr-card ${fin ? 'done' : ''}" id="d${it.id}">
      ${opts.evening && /وإذا أمسى|amsaytu|amsayna|In the evening|for the evening/i.test(it.ar + it.en + it.tl) ? '<div class="note">In the evening, say أَمْسَيْنَا / أَمْسَيْتُ (amsayna / amsaytu) in place of أَصْبَحْنَا (asbahna).</div>' : ''}
      ${it.note ? `<div class="note">${esc(it.note)}</div>` : ''}
      <div class="ar">${esc(it.ar)}</div>${showTl && it.tl ? `<div class="tl">${esc(it.tl)}</div>` : ''}<div class="en">${esc(it.en)}</div>
      <div class="foot">${it.audio ? `<button class="iconbtn" data-audio="${i}" aria-label="Play audio" style="background:var(--bg-2)">${I.play}</button>` : ''}<button class="counter-btn" data-c="${i}">${fin ? `${I.check} Done` : `<span>Tap to count</span><span>${c}/${it.repeat}</span>`}</button></div></div>`; }).join('');
}
export async function viewAdhkar(cid) {
  const content = await loadJSON('/data/adhkar.json'); const cat = content.categories.find(c => c.id === cid); if (!cat) return go('/adhkar');
  const p = shell(esc(cat.title), { back: '/adhkar' });
  const key = `adhkar.${cid}.${localDay()}`; const prog = LS.get(key, {});
  try { const t = await api('/today'); const srv = t.adhkar.find(a => a.kind === cid); const localDone = cat.items.filter(it => (prog[it.id] || 0) >= it.repeat).length; if (srv?.completed && localDone < cat.items.length) { cat.items.forEach(it => prog[it.id] = it.repeat); LS.set(key, prog); } } catch {}
  let audio = null;
  const totals = () => ({ total: cat.items.length, done: cat.items.filter(it => (prog[it.id] || 0) >= it.repeat).length });
  let syncT = null; const sync = () => { clearTimeout(syncT); syncT = setTimeout(() => { const { done, total } = totals(); api('/adhkar', { body: { kind: cid, done, total } }).catch(() => {}); }, 700); };
  function draw() {
    const { done, total } = totals();
    p.innerHTML = `<div class="sticky-prog"><div class="row between small" style="margin-bottom:6px"><span class="muted">${done} of ${total} complete</span><button class="link" id="resetAll">Reset</button></div><div class="progressbar"><div style="width:${done / total * 100}%"></div></div></div>
      ${cid === 'istikhara' ? `<div class="card soft small"><b>How to pray Istikharah:</b> pray two voluntary rak‘ahs (not the obligatory prayer), then recite this dua, naming your matter where indicated. Then consult trusted, knowledgeable people and proceed with what Allah makes easy.<div style="margin-top:10px"><button class="btn sm" id="istiChat">Think it through with Alim</button></div></div>` : ''}
      ${adhkarItemsHTML(cat.items, prog, { evening: cid === 'evening' })}
      <div class="faint small" style="text-align:center;padding:10px">Source: ${esc(content.source)}</div>
      ${done === total ? `<div class="card" style="text-align:center"><b>May Allah accept from you</b><div class="muted small">Your ${esc(cat.title.toLowerCase())} are complete.</div></div>` : ''}`;
    $$('[data-c]', p).forEach(b => b.onclick = () => { const it = cat.items[+b.dataset.c]; const c = prog[it.id] || 0; if (c >= it.repeat) return; prog[it.id] = c + 1; LS.set(key, prog); sync();
      if (prog[it.id] >= it.repeat) { vibrate([30, 50, 30]); const y = $('#main').scrollTop; draw(); $('#main').scrollTop = y; const nx = cat.items.find(x => (prog[x.id] || 0) < x.repeat); if (nx) setTimeout(() => $('#d' + nx.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250); }
      else { vibrate(15); b.innerHTML = `<span>Tap to count</span><span>${prog[it.id]}/${it.repeat}</span>`; } });
    $$('[data-audio]', p).forEach(b => b.onclick = () => { const it = cat.items[+b.dataset.audio]; if (audio && audio._i === b.dataset.audio && !audio.paused) { audio.pause(); b.innerHTML = I.play; return; } audio?.pause(); $$('[data-audio]').forEach(x => x.innerHTML = I.play); audio = new Audio(it.audio); audio._i = b.dataset.audio; audio.play().catch(() => toast('Audio unavailable')); b.innerHTML = I.pause; audio.onended = () => b.innerHTML = I.play; });
    $('#resetAll').onclick = () => { for (const k of Object.keys(prog)) delete prog[k]; LS.set(key, prog); sync(); draw(); };
    $('#istiChat')?.addEventListener('click', () => askAlim('I need to make a decision and want to do istikhara properly. Can you help me think it through?', 'istikhara'));
  }
  draw(); onCleanup(() => audio?.pause());
}
export async function viewDuas(chId) {
  const duas = await loadJSON('/data/duas.json'); let ch = null; for (const g of duas) for (const c of g.chapters) if (String(c.id) === String(chId)) ch = c;
  if (!ch) return go('/adhkar');
  const p = shell(esc(ch.title), { back: '/adhkar' }); const prog = {}; let audio = null;
  p.innerHTML = adhkarItemsHTML(ch.duas, prog) + '<div class="faint small" style="text-align:center;padding:10px">Source: Hisnul Muslim (hisnmuslim.com)</div>';
  $$('[data-c]', p).forEach(b => b.onclick = () => { const it = ch.duas[+b.dataset.c]; prog[it.id] = Math.min(it.repeat, (prog[it.id] || 0) + 1); vibrate(15); b.innerHTML = prog[it.id] >= it.repeat ? `${I.check} Done` : `<span>Tap to count</span><span>${prog[it.id]}/${it.repeat}</span>`; if (prog[it.id] >= it.repeat) b.closest('.dhikr-card').classList.add('done'); });
  $$('[data-audio]', p).forEach(b => b.onclick = () => { const it = ch.duas[+b.dataset.audio]; if (audio && !audio.paused && audio._i === b.dataset.audio) { audio.pause(); b.innerHTML = I.play; return; } audio?.pause(); audio = new Audio(it.audio); audio._i = b.dataset.audio; audio.play().catch(() => toast('Audio unavailable')); b.innerHTML = I.pause; audio.onended = () => b.innerHTML = I.play; });
  onCleanup(() => audio?.pause());
}

// ================= AKHIRAH =================
export async function viewAkhirah() {
  const p = shell('Akhirah reminders');
  const ak = await loadJSON('/data/akhirah.json'); let topic = 'all';
  const ic = { qabr: 'moon', qiyamah: 'hourglass', sirat: 'scale', jannah: 'leaf', jahannam: 'flame' };
  function draw() {
    const items = ak.items.filter(i => topic === 'all' || i.topic === topic);
    const today = ak.items[dayIndex(ak.items.length, 3)];
    p.innerHTML = `<div class="sub" style="margin-top:10px">“Remember often the destroyer of pleasures — death.” <span class="faint">(Ibn Majah 4258)</span> Reflections on the grave, the Day of Judgement, the Sirat, Jannah and Jahannam — from the Quran and authentic Sunnah.</div>
      <div class="card" style="border-color:var(--accent-2)"><div class="faint small">Today’s reflection · ${esc(ak.topics[today.topic])}</div>${today.ar ? `<div class="ar" style="margin-top:6px">${esc(today.ar)}</div>` : ''}<div style="font-family:var(--serif);font-size:17px;margin-top:6px;line-height:1.6">${esc(today.en)}</div><div class="ref small" style="color:var(--accent);font-weight:600;margin-top:8px">${esc(today.ref)}</div>
        <button class="btn soft sm" style="margin-top:10px" id="reflect">Reflect with Alim</button></div>
      <div class="chips">${[['all', 'All'], ...Object.entries(ak.topics)].map(([k, l]) => `<button class="chip ${topic === k ? 'on' : ''}" data-t="${k}">${k !== 'all' ? I[ic[k]] : ''}${esc(l)}</button>`).join('')}</div>
      ${items.map(i => `<div class="ak-card"><div class="row small faint" style="gap:6px"><span style="width:16px;height:16px;color:var(--accent)">${I[ic[i.topic]]}</span>${esc(ak.topics[i.topic])} · ${i.type === 'quran' ? 'Quran' : 'Hadith'}</div>${i.ar ? `<div class="ar" style="margin-top:6px">${esc(i.ar)}</div>` : ''}<div style="font-family:var(--serif);font-size:16px;line-height:1.6;margin-top:6px">${esc(i.en)}</div><div class="ref">${esc(i.ref)}</div></div>`).join('')}
      <div class="card soft small muted">Reminders arrive as notifications at the times you choose in <a href="#/settings">Settings → Reminders</a>. Hadith wording is paraphrased from the cited collections (sunnah.com numbering).</div>`;
    $$('[data-t]', p).forEach(b => b.onclick = () => { topic = b.dataset.t; draw(); });
    $('#reflect').onclick = () => askAlim(`Help me reflect on this reminder and how it should change my day: "${today.en}" (${today.ref})`, 'reflect');
  }
  draw();
}

// ================= 99 NAMES =================
export async function viewNames() {
  const p = shell('Asma’ul Husna'); const names = await loadJSON('/data/names.json'); const today = names[dayIndex(99)];
  let mem = new Set(); try { mem = new Set((await api('/names/memorised')).memorised); } catch {}
  let filter = 'all';
  const prog = () => { const n = mem.size, pct = Math.round(n / 99 * 100);
    return `<div class="card nm-prog"><div class="row between"><div><b>${n}</b><span class="muted"> / 99 memorised</span></div><div class="nm-pct">${pct}%</div></div><div class="nm-bar"><i style="width:${pct}%"></i></div>
      <div class="small muted" style="margin-top:6px">${n === 99 ? 'MashaAllah — you’ve memorised all 99! “Whoever enumerates them will enter Paradise.” (Bukhari & Muslim)' : n ? `Next up: <b>${esc(names.find(x => !mem.has(x.n))?.tl || '')}</b> — tap ✓ on a Name once you know it by heart.` : 'Tap ✓ on a Name once you know it by heart. “Allah has ninety-nine Names… whoever enumerates them will enter Paradise.” (Bukhari & Muslim)'}</div>
      <div class="seg nm-seg">${[['all', 'All'], ['todo', 'To learn'], ['done', 'Memorised']].map(([k, l]) => `<button data-nf="${k}" class="${filter === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>`; };
  p.innerHTML = `<div class="card name-card"><div class="faint small">Today’s Name</div><div class="ar" dir="rtl" lang="ar">${esc(today.ar)}</div><div dir="ltr" style="font-family:var(--serif);font-size:22px;margin-top:4px">${esc(today.tl)}</div><div class="muted" dir="ltr">${esc(today.en)}</div>
    <button class="btn ghost" style="margin-top:12px" id="reflectName">Reflect on this Name with Alim</button></div>
    <div id="nmProg"></div>
    <input class="input" id="nq" placeholder="Search names" style="margin-bottom:10px" type="search"><div class="names-grid" id="ng" dir="rtl"></div>`;
  let q = '';
  const draw = () => { $('#nmProg').innerHTML = prog(); $$('[data-nf]').forEach(b => b.onclick = () => { filter = b.dataset.nf; draw(); });
    $('#ng').innerHTML = names.filter(n => (!q || (n.tl + n.en).toLowerCase().includes(q)) && (filter === 'all' || (filter === 'done') === mem.has(n.n))).map(n => `<div class="card name-tile ${mem.has(n.n) ? 'memo' : ''}"><span class="name-n">${n.n}</span><button class="nm-ck" data-mn="${n.n}" aria-pressed="${mem.has(n.n)}" aria-label="${mem.has(n.n) ? 'Memorised — tap to undo' : 'Mark as memorised'}">✓</button><div class="ar" lang="ar">${esc(n.ar)}</div><div class="name-tl" dir="ltr">${esc(n.tl)}</div><div class="muted name-en" dir="ltr">${esc(n.en)}</div></div>`).join('') || '<p class="muted" dir="ltr">Nothing here yet.</p>';
    $$('[data-mn]').forEach(b => b.onclick = async () => { const n = +b.dataset.mn, on = !mem.has(n); on ? mem.add(n) : mem.delete(n); vibrate(on ? [20, 40, 20] : 10); draw();
      try { mem = new Set((await api('/names/memorised', { body: { n, on } })).memorised); if (on && [10, 25, 33, 50, 75, 99].includes(mem.size)) toast(`🌟 ${mem.size} Names memorised — MashaAllah!`); } catch (e) { toast(e.message); } }); };
  draw(); $('#nq').oninput = e => { q = e.target.value.toLowerCase(); draw(); };
  $('#reflectName').onclick = () => askAlim(`Teach me about the Name of Allah ${today.tl} (${today.ar}) — ${today.en}. How can I live by it today and what dua can I make with it?`, 'teach');
}

export function viewFeedback() {
  const p = shell('Send feedback'); let kind = 'idea', rating = 0;
  p.innerHTML = `<div class="card fb-card"><h3>Help us make Shukr better</h3><p class="muted small">Tell us what’s working, what’s broken, or what you’d love to see. The Shukr team reads every message.</p>
    <div class="seg fb-kind">${[['idea', '💡 Idea'], ['bug', '🐞 Problem'], ['content', '📖 Content'], ['praise', '💚 Praise'], ['other', 'Other']].map(([k, l]) => `<button data-k="${k}" class="${kind === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <label class="lbl">How do you like Shukr?</label><div class="fb-stars">${[1, 2, 3, 4, 5].map(n => `<button data-r="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">★</button>`).join('')}</div>
    <textarea class="input" id="fbM" rows="6" maxlength="4000" placeholder="Write your feedback…"></textarea>
    <button class="btn accent block" id="fbS" style="margin-top:10px">Send feedback</button>
    <p class="small faint" style="margin-top:10px">Prefer email? Write to <a href="mailto:akmal@terminusapp.ai?subject=Shukr%20feedback">akmal@terminusapp.ai</a></p></div>`;
  $$('[data-k]').forEach(b => b.onclick = () => { kind = b.dataset.k; $$('[data-k]').forEach(x => x.classList.toggle('on', x === b)); });
  $$('[data-r]').forEach(b => b.onclick = () => { rating = +b.dataset.r; $$('[data-r]').forEach(x => x.classList.toggle('on', +x.dataset.r <= rating)); vibrate(8); });
  $('#fbS').onclick = async () => { const m = $('#fbM').value.trim(); if (m.length < 3) return toast('Please write a little more'); const b = $('#fbS'); b.disabled = true;
    try { await api('/feedback', { body: { kind, rating: rating || null, message: m, page: document.referrer || location.hash } }); p.innerHTML = `<div class="card fb-done"><div style="font-size:44px">💚</div><h3>JazakAllahu khayran!</h3><p class="muted">Your feedback reached the Shukr team.</p><a class="btn ghost" href="#/">Back home</a></div>`; }
    catch (e) { toast(e.message); b.disabled = false; } };
}
