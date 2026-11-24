// Study: hub, Pomodoro, Deep focus, Tasks & exams, Flashcards (spaced repetition), Stats.
// Timers are wall-clock based (endsAt in localStorage) so they stay accurate when the screen sleeps or the tab is backgrounded.
import { $, $$, esc, escAttr, I, api, toast, vibrate, shell, LS, onCleanup, loadingHTML, confirmSheet, sheet, localDay, go } from '../core.js';

const pad = n => String(n).padStart(2, '0');
const mmss = s => `${pad(Math.floor(Math.max(0, s) / 60))}:${pad(Math.floor(Math.max(0, s) % 60))}`;
const hm = m => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ' ' + (m % 60) + 'm' : ''}` : `${m}m`;
const daysTo = d => Math.round((new Date(d + 'T12:00') - new Date(localDay() + 'T12:00')) / 864e5);
const DUA = { ar: 'رَبِّ زِدْنِي عِلْمًا', tr: 'Rabbi zidni ‘ilma', en: '“My Lord, increase me in knowledge.”', ref: 'Qur’an 20:114' };
const DUA2 = { ar: 'اللَّهُمَّ انْفَعْنِي بِمَا عَلَّمْتَنِي، وَعَلِّمْنِي مَا يَنْفَعُنِي، وَزِدْنِي عِلْمًا', en: '“O Allah, benefit me by what You have taught me, teach me what will benefit me, and increase me in knowledge.”', ref: 'Sunan Ibn Majah 251; Jami‘ at-Tirmidhi 3599' };
const tabs = cur => `<div class="st-tabs">${[['/study', 'Hub', 'home'], ['/study/pomodoro', 'Pomodoro', 'clock'], ['/study/focus', 'Focus', 'brain'], ['/study/tasks', 'Tasks', 'check'], ['/study/cards', 'Cards', 'book'], ['/study/stats', 'Stats', 'chart']].map(([h, l, ic]) => `<button class="${h === cur ? 'on' : ''}" data-st="${h}">${I[ic] || ''}<span>${l}</span></button>`).join('')}</div>`;
const bindTabs = p => { $$('[data-st]', p).forEach(b => b.onclick = () => go(b.dataset.st)); const on = $('.st-tabs .on', p); if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' }); };

// ---------- shared timer engine ----------
const T_KEY = 'study.timer';
const timerGet = () => LS.get(T_KEY, null);
const timerSet = t => { if (t) LS.set(T_KEY, t); else try { localStorage.removeItem('shukr.' + T_KEY); } catch {} };
let wakeLock = null;
const keepAwake = async on => { try { if (on && 'wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); else { await wakeLock?.release(); wakeLock = null; } } catch {} };
function chime() { try { const a = new (window.AudioContext || window.webkitAudioContext)(); const o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.value = 660; g.gain.setValueAtTime(0.0001, a.currentTime); g.gain.exponentialRampToValueAtTime(0.25, a.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 1.2); o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + 1.25); } catch {} vibrate([200, 100, 200]); }
async function notifyDone(title, body) { try { if (document.hidden && Notification?.permission === 'granted') { const r = await navigator.serviceWorker?.getRegistration(); r ? r.showNotification(title, { body, tag: 'study', icon: '/icons/icon-192.png' }) : new Notification(title, { body }); } } catch {} }
const ring = (pct, inner, color = 'var(--accent)') => `<div class="st-ring" style="--p:${Math.max(0, Math.min(1, pct)) * 360}deg;--c:${color}"><div>${inner}</div></div>`;
async function logSession(kind, minutes, subject, extra = {}) { if (minutes < 1) return null; try { return await api('/study/session', { body: { kind, minutes, subject, ...extra } }); } catch (e) { toast(e.message); return null; } }
const subjectPicker = (prefs, cur) => `<select class="input" id="stSub"><option value="">General</option>${(prefs.subjects || []).map(s => `<option ${s === cur ? 'selected' : ''}>${esc(s)}</option>`).join('')}<option value="__new">+ Add subject…</option></select>`;
async function bindSubject(p, prefs, onChange) {
  const sel = $('#stSub', p); if (!sel) return;
  sel.onchange = async () => {
    if (sel.value !== '__new') return onChange?.(sel.value);
    const n = (prompt('New subject (e.g. Maths, Biology, Arabic)') || '').trim().slice(0, 30); if (!n) { sel.value = ''; return; }
    const r = await api('/study/prefs', { method: 'PUT', body: { ...prefs, subjects: [...(prefs.subjects || []), n] } }); Object.assign(prefs, r.prefs);
    sel.outerHTML = subjectPicker(prefs, n); bindSubject(p, prefs, onChange); onChange?.(n);
  };
}

// ================= HUB =================
export async function viewStudy() {
  const p = shell('Study'); p.innerHTML = tabs('/study') + loadingHTML(); bindTabs(p);
  let s; try { s = await api('/study'); } catch (e) { p.innerHTML = tabs('/study') + `<div class="empty"><p class="muted">${esc(e.message)}</p></div>`; bindTabs(p); return; }
  const run = timerGet(), pct = s.todayMin / (s.prefs.goal || 120), maxW = Math.max(1, ...s.week.map(w => w.m));
  p.innerHTML = tabs('/study') + `
    <div class="st-hero"><div class="st-hrow">${ring(pct, `<b>${hm(s.todayMin)}</b><small>of ${hm(s.prefs.goal)}</small>`, '#fff')}
      <div class="grow"><div class="st-k">Today</div><div class="st-big">${pct >= 1 ? 'Goal reached — MashaAllah!' : `${hm(Math.max(0, s.prefs.goal - s.todayMin))} to go`}</div>
      <div class="st-chips"><span>${I.flame} ${s.streak} day streak</span><span>${I.star} best ${s.best}</span></div></div></div>
      <div class="st-week">${s.week.map(w => `<div><i style="height:${Math.max(4, w.m / maxW * 100)}%" class="${w.m >= s.prefs.goal ? 'hit' : ''}"></i><span>${new Date(w.d + 'T12:00').toLocaleDateString([], { weekday: 'narrow' })}</span></div>`).join('')}</div></div>
    ${run ? `<button class="card st-running" data-st="${run.page}"><span class="st-dot"></span><div class="grow"><b>${run.kind === 'focus' ? 'Deep focus' : run.phase === 'focus' ? 'Pomodoro · focus' : 'Pomodoro · break'} running</b><small id="stRunT">${mmss((run.endsAt - Date.now()) / 1000)} left</small></div>${I.back}</button>` : ''}
    <div class="st-grid">
      <button class="st-tile t1" data-st="/study/pomodoro">${I.clock}<b>Pomodoro</b><small>${s.prefs.focus}/${s.prefs.short} min cycles</small></button>
      <button class="st-tile t2" data-st="/study/focus">${I.brain}<b>Deep focus</b><small>Long, distraction-free</small></button>
      <button class="st-tile t3" data-st="/study/tasks">${I.check}<b>Tasks & exams</b><small>${s.openTasks} open${s.nextExam ? ` · exam in ${daysTo(s.nextExam.due)}d` : ''}</small></button>
      <button class="st-tile t4" data-st="/study/cards">${I.book}<b>Flashcards</b><small>${s.dueCards} due today</small></button>
    </div>
    ${s.nextExam ? `<div class="card st-exam"><div class="st-k">Next exam</div><b>${esc(s.nextExam.title)}</b><div class="st-cd">${daysTo(s.nextExam.due) === 0 ? 'Today — bismillah!' : daysTo(s.nextExam.due) + ' days'}</div><small class="faint">${new Date(s.nextExam.due + 'T12:00').toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}${s.nextExam.subject ? ' · ' + esc(s.nextExam.subject) : ''}</small></div>` : ''}
    <div class="card st-dua"><div class="ar">${DUA2.ar}</div><p>${DUA2.en}</p><small class="faint">${DUA2.ref}</small></div>
    <div class="row" style="gap:8px"><button class="btn ghost grow" id="stLog">${I.plus} Log study time</button><button class="btn ghost" id="stGoal">${I.sliders || I.gear} Goal</button></div>`;
  bindTabs(p);
  if (run) { const t = setInterval(() => { const el = $('#stRunT'); if (!el) return clearInterval(t); el.textContent = mmss((run.endsAt - Date.now()) / 1000) + ' left'; }, 1000); onCleanup(() => clearInterval(t)); }
  $('#stLog').onclick = () => sheet(`<h3>Log study time</h3><label class="faint small">Minutes</label><input class="input" id="lgM" type="number" min="1" max="600" inputmode="numeric" placeholder="45"><label class="faint small" style="margin-top:8px;display:block">Subject</label>${subjectPicker(s.prefs, '')}<button class="btn accent block" id="lgS" style="margin-top:12px">Save</button>`, (el, close) => {
    bindSubject(el, s.prefs); $('#lgS', el).onclick = async () => { const r = await logSession('manual', +$('#lgM', el).value, $('#stSub', el).value === '__new' ? '' : $('#stSub', el).value); if (r) { close(); toast('Logged'); viewStudy(); } }; });
  $('#stGoal').onclick = () => sheet(`<h3>Daily study goal</h3><div class="chips">${[30, 60, 90, 120, 180, 240, 300, 360].map(m => `<button class="chip ${m === s.prefs.goal ? 'on' : ''}" data-g="${m}">${hm(m)}</button>`).join('')}</div>`, (el, close) => {
    $$('[data-g]', el).forEach(b => b.onclick = async () => { await api('/study/prefs', { method: 'PUT', body: { ...s.prefs, goal: +b.dataset.g } }); close(); viewStudy(); }); });
}

// ================= POMODORO =================
export async function viewPomodoro() {
  const p = shell('Pomodoro'); p.innerHTML = tabs('/study/pomodoro') + loadingHTML(); bindTabs(p);
  let s; try { s = await api('/study'); } catch { s = { prefs: { focus: 25, short: 5, long: 15, rounds: 4, subjects: [] } }; }
  const P = s.prefs; let subject = LS.get('study.subject', '');
  let t = timerGet(); if (t && t.kind !== 'pomodoro') t = null;
  const dur = ph => (ph === 'focus' ? P.focus : ph === 'long' ? P.long : P.short) * 60;
  const draw = () => {
    t = timerGet(); if (t && t.kind !== 'pomodoro') t = null;
    const phase = t?.phase || 'focus', total = dur(phase), left = t ? (t.paused ? t.left : (t.endsAt - Date.now()) / 1000) : total, round = t?.round || 1;
    const col = phase === 'focus' ? 'var(--accent)' : '#10B981';
    p.innerHTML = tabs('/study/pomodoro') + `
      <div class="st-pomo ${phase}"><div class="st-phase">${phase === 'focus' ? 'Focus' : phase === 'long' ? 'Long break' : 'Short break'} · round ${round} of ${P.rounds}</div>
        <div class="st-bigring">${ring(1 - left / total, `<b id="pmT">${mmss(left)}</b><small>${t ? (t.paused ? 'paused' : phase === 'focus' ? 'stay with it' : 'rest your eyes') : 'ready'}</small>`, col)}</div>
        <div class="st-rounds">${Array.from({ length: P.rounds }, (_, i) => `<i class="${i < round - 1 || (i === round - 1 && phase !== 'focus') ? 'done' : i === round - 1 ? 'cur' : ''}"></i>`).join('')}</div>
        <div class="st-ctrl">${t ? `<button class="iconbtn" id="pmReset" aria-label="Reset">${I.x}</button><button class="st-go" id="pmGo">${t.paused ? I.play : I.pause}</button><button class="iconbtn" id="pmSkip" aria-label="Skip">${I.back}</button>` : `<button class="st-go" id="pmGo">${I.play}</button>`}</div></div>
      ${t ? '' : `<div class="card"><label class="faint small">Subject</label>${subjectPicker(P, subject)}
        <div class="grid2" style="margin-top:10px">${[['focus', 'Focus', 5, 120], ['short', 'Short break', 1, 30], ['long', 'Long break', 5, 60], ['rounds', 'Rounds', 2, 8]].map(([k, l, lo, hi]) => `<label class="st-num"><span>${l}</span><div><button data-dec="${k}">−</button><b id="pv_${k}">${P[k]}</b><button data-inc="${k}">+</button></div><small data-lo="${lo}" data-hi="${hi}"></small></label>`).join('')}</div>
        <div class="chips" style="margin-top:10px">${[[25, 5, 15], [50, 10, 20], [45, 15, 30], [90, 20, 30]].map(([f, sh, lg]) => `<button class="chip sm" data-pre="${f},${sh},${lg}">${f}/${sh}</button>`).join('')}</div></div>`}
      <div class="card soft small muted">${phase === 'focus' ? 'Put your phone face-down. When the timer ends, take a real break — stand up, drink water, look far away.' : 'Break time: make wudu, stretch, or say a quick dhikr. Avoid starting a video.'} Keep this screen open for the alarm; the timer stays accurate even if your screen turns off.</div>`;
    bindTabs(p); bindSubject(p, P, v => { subject = v; LS.set('study.subject', v); });
    $$('[data-dec],[data-inc]', p).forEach(b => b.onclick = async () => { const k = b.dataset.dec || b.dataset.inc, step = k === 'rounds' ? 1 : k === 'focus' ? 5 : 1, lim = { focus: [5, 120], short: [1, 30], long: [5, 60], rounds: [2, 8] }[k];
      P[k] = Math.min(lim[1], Math.max(lim[0], P[k] + (b.dataset.inc ? step : -step))); $('#pv_' + k).textContent = P[k]; savePrefs(); });
    $$('[data-pre]', p).forEach(b => b.onclick = () => { const [f, sh, lg] = b.dataset.pre.split(',').map(Number); Object.assign(P, { focus: f, short: sh, long: lg }); savePrefs(); draw(); });
    $('#pmGo').onclick = () => { if (!t) start('focus', 1); else if (t.paused) { t.endsAt = Date.now() + t.left * 1000; t.paused = false; timerSet(t); keepAwake(true); draw(); } else { t.left = (t.endsAt - Date.now()) / 1000; t.paused = true; timerSet(t); keepAwake(false); draw(); } };
    const r = $('#pmReset'); if (r) r.onclick = async () => { if (!await confirmSheet('Stop this session?', t.phase === 'focus' ? 'Minutes you’ve already focused will still be saved.' : '', 'Stop')) return; if (t.phase === 'focus') await saveFocus(true); timerSet(null); keepAwake(false); draw(); };
    const sk = $('#pmSkip'); if (sk) sk.onclick = () => finish(true);
  };
  let pst; const savePrefs = () => { clearTimeout(pst); pst = setTimeout(() => api('/study/prefs', { method: 'PUT', body: P }).catch(() => {}), 500); };
  const start = (phase, round) => { if (Notification?.permission === 'default') Notification.requestPermission().catch(() => {}); t = { kind: 'pomodoro', page: '/study/pomodoro', phase, round, startedAt: Date.now(), endsAt: Date.now() + dur(phase) * 1000, subject }; timerSet(t); keepAwake(true); vibrate(15); draw(); };
  const saveFocus = async partial => { const mins = Math.round((partial ? (Date.now() - t.startedAt) : dur('focus') * 1000) / 60000); if (mins >= 1) { await logSession('pomodoro', Math.min(mins, P.focus), t.subject || ''); } };
  async function finish(skipped) {
    t = timerGet(); if (!t) return;
    if (t.phase === 'focus') { if (!skipped) { chime(); notifyDone('Focus done — take a break', `Round ${t.round} complete.`); } await saveFocus(skipped);
      const long = t.round >= P.rounds; start(long ? 'long' : 'short', t.round); if (!skipped) toast(long ? 'Great work! Long break' : 'Nice — short break'); }
    else { if (!skipped) { chime(); notifyDone('Break over', 'Back to focus — bismillah.'); }
      if (t.phase === 'long') { timerSet(null); keepAwake(false); toast('Cycle complete — MashaAllah!'); draw(); } else start('focus', t.round + 1); }
  }
  const tick = setInterval(() => { const tt = timerGet(); if (!tt || tt.kind !== 'pomodoro' || tt.paused) return; const left = (tt.endsAt - Date.now()) / 1000; const el = $('#pmT'); if (el) el.textContent = mmss(left); const rg = $('.st-bigring .st-ring'); if (rg) rg.style.setProperty('--p', (1 - left / dur(tt.phase)) * 360 + 'deg'); document.title = mmss(left) + ' · ' + (tt.phase === 'focus' ? 'Focus' : 'Break'); if (left <= 0) finish(false); }, 500);
  onCleanup(() => { clearInterval(tick); document.title = 'Shukr'; });
  if (t && !t.paused) keepAwake(true);
  draw();
}

// ================= DEEP FOCUS =================
export async function viewFocus() {
  const p = shell('Deep focus'); p.innerHTML = tabs('/study/focus') + loadingHTML(); bindTabs(p);
  let s; try { s = await api('/study'); } catch { s = { prefs: { subjects: [] } }; }
  let subject = LS.get('study.subject', ''), mins = LS.get('study.focusMins', 60), strict = LS.get('study.strict', true), leaves = 0;
  const draw = () => {
    let t = timerGet(); if (t && t.kind !== 'focus') t = null;
    if (!t) {
      p.innerHTML = tabs('/study/focus') + `
        <div class="st-fhero"><div class="st-k">Deep focus</div><h2>One task. No distractions.</h2><p>Phones are built to pull you away. Pick a length, start, and Shukr will hold you to it.</p></div>
        <div class="card"><label class="faint small">How long?</label><div class="chips">${[30, 45, 60, 90, 120, 180].map(m => `<button class="chip ${m === mins ? 'on' : ''}" data-m="${m}">${hm(m)}</button>`).join('')}</div>
          <label class="faint small" style="margin-top:10px;display:block">Subject</label>${subjectPicker(s.prefs, subject)}
          <label class="faint small" style="margin-top:10px;display:block">What exactly will you do?</label><input class="input" id="fcGoal" maxlength="120" placeholder="e.g. Finish chapter 4 practice questions" value="${escAttr(LS.get('study.focusGoal', ''))}">
          <label class="list-item" style="margin-top:10px"><div class="grow">Strict mode<div class="faint small">Counts every time you leave the app and asks before quitting</div></div><span class="toggle"><input type="checkbox" id="fcStrict" ${strict ? 'checked' : ''}><span></span></span></label>
          <button class="btn accent block" id="fcGo" style="margin-top:12px">${I.play} Bismillah — start</button></div>
        <div class="card st-dua"><div class="ar">${DUA.ar}</div><p><i>${DUA.tr}</i> — ${DUA.en}</p><small class="faint">${DUA.ref}</small></div>`;
      bindTabs(p); bindSubject(p, s.prefs, v => { subject = v; LS.set('study.subject', v); });
      $$('[data-m]', p).forEach(b => b.onclick = () => { mins = +b.dataset.m; LS.set('study.focusMins', mins); $$('[data-m]', p).forEach(x => x.classList.toggle('on', x === b)); });
      $('#fcStrict').onchange = e => { strict = e.target.checked; LS.set('study.strict', strict); };
      $('#fcGo').onclick = () => { const goal = $('#fcGoal').value.trim(); LS.set('study.focusGoal', goal); if (Notification?.permission === 'default') Notification.requestPermission().catch(() => {});
        timerSet({ kind: 'focus', page: '/study/focus', startedAt: Date.now(), endsAt: Date.now() + mins * 60000, mins, subject, goal, strict, leaves: 0 }); keepAwake(true); vibrate(20); try { document.documentElement.requestFullscreen?.(); } catch {} draw(); };
      return;
    }
    const left = (t.endsAt - Date.now()) / 1000, total = t.mins * 60;
    p.innerHTML = `<div class="st-zen"><div class="st-k">${esc(t.subject || 'Deep focus')}</div>${t.goal ? `<div class="st-zgoal">${esc(t.goal)}</div>` : ''}
      <div class="st-bigring">${ring(1 - left / total, `<b id="fcT">${mmss(left)}</b><small>remaining</small>`, '#A78BFA')}</div>
      <div class="st-zmeta" id="fcLeaves">${t.strict ? (t.leaves ? `You left the app ${t.leaves} time${t.leaves > 1 ? 's' : ''}` : 'Fully focused so far') : ''}</div>
      <div class="ar st-zdua">${DUA.ar}</div>
      <button class="btn ghost" id="fcStop">End session</button></div>`;
    $('#fcStop').onclick = async () => {
      const done = Math.round((Date.now() - t.startedAt) / 60000);
      if (t.strict && left > 60 && !await confirmSheet('Leave deep focus?', `You have ${mmss(left)} left. ${done >= 1 ? `The ${done} min you’ve done will still count.` : ''}`, 'End anyway', true)) return;
      await endFocus(false);
    };
  };
  async function endFocus(completed) {
    const t = timerGet(); if (!t || t.kind !== 'focus') return;
    const done = completed ? t.mins : Math.round((Date.now() - t.startedAt) / 60000);
    timerSet(null); keepAwake(false); try { if (document.fullscreenElement) document.exitFullscreen(); } catch {}
    if (completed) { chime(); notifyDone('Deep focus complete', `${hm(t.mins)} done — MashaAllah!`); }
    if (done >= 1) await logSession('focus', done, t.subject || '', { note: t.goal || '' });
    sheet(`<div style="text-align:center"><div class="st-done">${I.check}</div><h3>${completed ? 'Session complete!' : 'Session ended'}</h3><p class="muted">${hm(done)} of focused study${t.strict ? ` · left the app ${t.leaves || 0}×` : ''}</p><p class="small">“Alhamdulillah” — say it, and ask Allah to put barakah in what you learned.</p><button class="btn accent block" data-close>Done</button></div>`, (el, close) => { $('[data-close]', el).onclick = () => { close(); draw(); }; });
    draw();
  }
  const vis = () => { const t = timerGet(); if (!t || t.kind !== 'focus' || !t.strict) return; if (document.hidden) { t.leaves = (t.leaves || 0) + 1; timerSet(t); } else { const el = $('#fcLeaves'); if (el && t.leaves) { el.textContent = `You left the app ${t.leaves} time${t.leaves > 1 ? 's' : ''} — come back to it`; vibrate(60); } } };
  document.addEventListener('visibilitychange', vis);
  const before = e => { const t = timerGet(); if (t?.kind === 'focus' && t.strict) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', before);
  const tick = setInterval(() => { const t = timerGet(); if (!t || t.kind !== 'focus') return; const left = (t.endsAt - Date.now()) / 1000; const el = $('#fcT'); if (el) el.textContent = mmss(left); const rg = $('.st-zen .st-ring'); if (rg) rg.style.setProperty('--p', (1 - left / (t.mins * 60)) * 360 + 'deg'); document.title = mmss(left) + ' · Focus'; if (left <= 0) endFocus(true); }, 500);
  onCleanup(() => { clearInterval(tick); document.removeEventListener('visibilitychange', vis); window.removeEventListener('beforeunload', before); document.title = 'Shukr'; });
  if (timerGet()?.kind === 'focus') keepAwake(true);
  draw();
}

// ================= TASKS & EXAMS =================
export async function viewTasks() {
  const p = shell('Tasks & exams'); p.innerHTML = tabs('/study/tasks') + loadingHTML(); bindTabs(p);
  let tasks = [], prefs = { subjects: [] }, filter = 'open';
  try { [tasks, prefs] = await Promise.all([api('/study/tasks').then(r => r.tasks), api('/study').then(r => r.prefs)]); } catch (e) { toast(e.message); }
  const draw = () => {
    const open = tasks.filter(t => !t.done), exams = open.filter(t => t.exam && t.due).sort((a, b) => a.due.localeCompare(b.due));
    const L = filter === 'exams' ? exams : filter === 'done' ? tasks.filter(t => t.done) : open.filter(t => !t.exam);
    const groups = {}; for (const t of L) { const d = t.due ? daysTo(t.due) : null; const g = t.done ? 'Done' : d == null ? 'No date' : d < 0 ? 'Overdue' : d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d <= 7 ? 'This week' : 'Later'; (groups[g] ||= []).push(t); }
    const order = ['Overdue', 'Today', 'Tomorrow', 'This week', 'Later', 'No date', 'Done'];
    p.innerHTML = tabs('/study/tasks') + `
      ${exams.length ? `<div class="st-exams">${exams.slice(0, 6).map(e => { const d = daysTo(e.due); return `<button class="st-ex ${d <= 3 ? 'soon' : ''}" data-edit="${e.id}"><b>${d <= 0 ? 'Today' : d}</b><small>${d <= 0 ? '' : d === 1 ? 'day' : 'days'}</small><span>${esc(e.title)}</span></button>`; }).join('')}</div>` : ''}
      <div class="st-add"><input class="input" id="tkT" maxlength="120" placeholder="Add a task… e.g. Revise chapter 3"><button class="btn accent" id="tkAdd" aria-label="Add">${I.plus}</button></div>
      <div class="seg" style="margin:10px 0">${[['open', 'Tasks'], ['exams', 'Exams'], ['done', 'Done']].map(([k, l]) => `<button class="${k === filter ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
      ${order.filter(g => groups[g]).map(g => `<h3 class="st-gh ${g === 'Overdue' ? 'bad' : ''}">${g}</h3>${groups[g].map(t => `<div class="st-task ${t.done ? 'done' : ''}"><button class="st-chk" data-tog="${t.id}" aria-label="Done">${t.done ? I.check : ''}</button><button class="grow st-tt" data-edit="${t.id}"><b>${esc(t.title)}</b><small>${[t.subject, t.exam ? 'Exam' : '', t.due ? new Date(t.due + 'T12:00').toLocaleDateString([], { day: 'numeric', month: 'short' }) : '', t.est ? hm(t.est) : ''].filter(Boolean).map(esc).join(' · ')}</small></button>${!t.done && !t.exam ? `<button class="iconbtn" data-focus="${t.id}" aria-label="Focus on this">${I.play}</button>` : ''}</div>`).join('')}`).join('') || `<div class="empty"><p class="muted">${filter === 'exams' ? 'No exams yet — add one with a date to get a countdown.' : filter === 'done' ? 'Nothing finished in the last 3 days.' : 'No tasks — add one above.'}</p></div>`}
      <button class="btn ghost block" id="tkExam" style="margin-top:10px">${I.cal || I.clock} Add an exam</button>`;
    bindTabs(p);
    $$('[data-f]', p).forEach(b => b.onclick = () => { filter = b.dataset.f; draw(); });
    const add = async () => { const v = $('#tkT').value.trim(); if (!v) return; tasks = (await api('/study/tasks', { body: { title: v } })).tasks; vibrate(10); draw(); $('#tkT')?.focus(); };
    $('#tkAdd').onclick = add; $('#tkT').onkeydown = e => { if (e.key === 'Enter') add(); };
    $$('[data-tog]', p).forEach(b => b.onclick = async () => { tasks = (await api('/study/tasks', { body: { id: +b.dataset.tog, toggle: true } })).tasks; vibrate(12); draw(); });
    $$('[data-edit]', p).forEach(b => b.onclick = () => edit(tasks.find(t => t.id === +b.dataset.edit)));
    $$('[data-focus]', p).forEach(b => b.onclick = () => { const t = tasks.find(x => x.id === +b.dataset.focus); LS.set('study.focusGoal', t.title); if (t.subject) LS.set('study.subject', t.subject); go('/study/focus'); });
    $('#tkExam').onclick = () => edit({ exam: true });
  };
  const edit = (t = {}) => sheet(`<h3>${t.id ? 'Edit' : 'New'} ${t.exam ? 'exam' : 'task'}</h3><input class="input" id="eT" maxlength="120" value="${escAttr(t.title || '')}" placeholder="${t.exam ? 'e.g. Biology final' : 'Task'}">
      <div class="grid2" style="margin-top:8px"><div><label class="faint small">Date</label><input class="input" type="date" id="eD" value="${t.due || ''}"></div><div><label class="faint small">Estimate (min)</label><input class="input" type="number" id="eE" min="0" max="600" value="${t.est || ''}"></div></div>
      <label class="faint small" style="margin-top:8px;display:block">Subject</label>${subjectPicker(prefs, t.subject || '')}
      <label class="list-item" style="margin-top:8px"><div class="grow">This is an exam</div><span class="toggle"><input type="checkbox" id="eX" ${t.exam ? 'checked' : ''}><span></span></span></label>
      <div class="row" style="gap:8px;margin-top:12px">${t.id ? `<button class="btn ghost" id="eDel">${I.trash}</button>` : ''}<button class="btn accent grow" id="eS">Save</button></div>`, (el, close) => {
    bindSubject(el, prefs);
    $('#eS', el).onclick = async () => { try { const sub = $('#stSub', el).value; tasks = (await api('/study/tasks', { body: { id: t.id, title: $('#eT', el).value, due: $('#eD', el).value, est: $('#eE', el).value, subject: sub === '__new' ? '' : sub, exam: $('#eX', el).checked } })).tasks; close(); draw(); } catch (e) { toast(e.message); } };
    const d = $('#eDel', el); if (d) d.onclick = async () => { tasks = (await api('/study/tasks/' + t.id, { method: 'DELETE' })).tasks; close(); draw(); };
  });
  draw();
}

// ================= FLASHCARDS =================
export async function viewCards(q) {
  const p = shell('Flashcards'); p.innerHTML = tabs('/study/cards') + loadingHTML(); bindTabs(p);
  let decks = [];
  const load = async () => { decks = (await api('/study/decks')).decks; };
  const list = () => {
    p.innerHTML = tabs('/study/cards') + `
      <div class="st-fhero cards"><div class="st-k">Spaced repetition</div><h2>${decks.reduce((a, d) => a + d.due, 0)} cards due</h2><p>Review a little every day. Cards you know come back later; ones you miss come back sooner.</p></div>
      <div class="st-decks">${decks.map(d => `<div class="st-deck"><button class="grow" data-rev="${d.id}"><b>${esc(d.name)}</b><small>${d.cards} cards · ${d.mastered} mastered</small><div class="st-dbar"><i style="width:${d.cards ? d.mastered / d.cards * 100 : 0}%"></i></div></button>${d.due ? `<span class="badge">${d.due} due</span>` : ''}<button class="iconbtn" data-man="${d.id}" aria-label="Edit deck">${I.edit || I.gear}</button></div>`).join('') || '<div class="empty"><p class="muted">No decks yet. Create one for each subject.</p></div>'}</div>
      <button class="btn accent block" id="dkNew" style="margin-top:10px">${I.plus} New deck</button>`;
    bindTabs(p);
    $('#dkNew').onclick = async () => { const n = (prompt('Deck name (e.g. Arabic vocab, Chemistry)') || '').trim(); if (!n) return; decks = (await api('/study/decks', { body: { name: n } })).decks; list(); };
    $$('[data-rev]', p).forEach(b => b.onclick = () => review(+b.dataset.rev));
    $$('[data-man]', p).forEach(b => b.onclick = () => manage(+b.dataset.man));
  };
  async function review(id) {
    const r = await api(`/study/decks/${id}/cards`); let cards = r.cards, i = 0, flipped = false, stats = { again: 0, good: 0 };
    if (!cards.length) { const all = await api(`/study/decks/${id}/cards?all=1`); if (!all.cards.length) return manage(id); toast('Nothing due — here’s a practice round'); cards = all.cards.sort(() => Math.random() - 0.5).slice(0, 20); }
    const draw = () => {
      if (i >= cards.length) { p.innerHTML = tabs('/study/cards') + `<div class="st-fhero cards" style="text-align:center"><h2>Review done!</h2><p>${stats.good} remembered · ${stats.again} to practise again</p></div><button class="btn accent block" id="rvBack">Back to decks</button>`; bindTabs(p); $('#rvBack').onclick = async () => { await load(); list(); }; return; }
      const c = cards[i];
      p.innerHTML = tabs('/study/cards') + `<div class="row between small faint" style="margin-bottom:6px"><span>${esc(r.deck.name)}</span><span>${i + 1} / ${cards.length}</span></div><div class="st-pb"><i style="width:${(i + (flipped ? 0.5 : 0)) / cards.length * 100}%"></i></div>
        <button class="st-card ${flipped ? 'flip' : ''}" id="rvCard"><div class="st-face front">${esc(c.front)}</div><div class="st-face back">${esc(c.back)}</div></button>
        ${flipped ? `<div class="st-grade"><button data-g="again" class="g0">Again<small>today</small></button><button data-g="hard" class="g1">Hard<small>1 day</small></button><button data-g="good" class="g2">Good<small>later</small></button><button data-g="easy" class="g3">Easy<small>much later</small></button></div>` : `<button class="btn accent block" id="rvShow">Show answer</button>`}
        <button class="btn ghost block" id="rvQuit" style="margin-top:8px">Stop review</button>`;
      bindTabs(p);
      $('#rvCard').onclick = () => { flipped = !flipped; draw(); }; const sh = $('#rvShow'); if (sh) sh.onclick = () => { flipped = true; draw(); };
      $$('[data-g]', p).forEach(b => b.onclick = async () => { const g = b.dataset.g; api(`/study/cards/${c.id}/review`, { body: { grade: g } }).catch(() => {}); if (g === 'again') { stats.again++; cards.push(c); } else stats.good++; vibrate(8); i++; flipped = false; draw(); });
      $('#rvQuit').onclick = async () => { await load(); list(); };
    };
    draw();
  }
  async function manage(id) {
    const r = await api(`/study/decks/${id}/cards?all=1`);
    p.innerHTML = tabs('/study/cards') + `<div class="row between" style="align-items:center"><h3 style="margin:0">${esc(r.deck.name)}</h3><button class="btn sm ghost" id="mgBack">${I.back} Decks</button></div>
      <div class="card"><input class="input" id="cF" maxlength="500" placeholder="Front (question / word)"><textarea class="input" id="cB" maxlength="1000" rows="2" placeholder="Back (answer)" style="margin-top:6px"></textarea><button class="btn accent block" id="cAdd" style="margin-top:8px">${I.plus} Add card</button>
        <details style="margin-top:10px"><summary class="small faint">Paste many at once</summary><textarea class="input" id="cBulk" rows="5" placeholder="One card per line: front ; back" style="margin-top:6px"></textarea><button class="btn ghost block" id="cBulkAdd" style="margin-top:6px">Import</button></details></div>
      <div class="st-clist">${r.cards.map(c => `<div class="st-crow"><div class="grow"><b>${esc(c.front)}</b><small>${esc(c.back)}</small></div><span class="faint small">box ${c.box}</span><button class="iconbtn" data-del="${c.id}" aria-label="Delete">${I.trash}</button></div>`).join('') || '<p class="muted small">No cards yet.</p>'}</div>
      <div class="row" style="gap:8px;margin-top:10px"><button class="btn ghost grow" id="dkRen">Rename</button><button class="btn ghost grow" id="dkDel" style="color:#DC2626">Delete deck</button></div>`;
    bindTabs(p);
    $('#mgBack').onclick = async () => { await load(); list(); };
    $('#cAdd').onclick = async () => { try { await api(`/study/decks/${id}/cards`, { body: { front: $('#cF').value, back: $('#cB').value } }); vibrate(8); manage(id); } catch (e) { toast(e.message); } };
    $('#cBulkAdd').onclick = async () => { const cards = $('#cBulk').value.split('\n').map(l => l.split(/\s*[;\t|]\s*/)).filter(x => x.length >= 2).map(([front, ...b]) => ({ front, back: b.join(' ; ') })); if (!cards.length) return toast('Use: front ; back — one per line'); try { const x = await api(`/study/decks/${id}/cards`, { body: { cards } }); toast(`Added ${x.added} cards`); manage(id); } catch (e) { toast(e.message); } };
    $$('[data-del]', p).forEach(b => b.onclick = async () => { await api('/study/cards/' + b.dataset.del, { method: 'DELETE' }); manage(id); });
    $('#dkRen').onclick = async () => { const n = (prompt('Deck name', r.deck.name) || '').trim(); if (!n) return; await api('/study/decks', { body: { id, name: n } }); manage(id); };
    $('#dkDel').onclick = async () => { if (!await confirmSheet('Delete this deck?', `All ${r.cards.length} cards will be deleted.`, 'Delete', true)) return; decks = (await api('/study/decks/' + id, { method: 'DELETE' })).decks; list(); };
  }
  try { await load(); } catch (e) { toast(e.message); }
  list();
}

// ================= STATS =================
export async function viewStats() {
  const p = shell('Study stats'); p.innerHTML = tabs('/study/stats') + loadingHTML(); bindTabs(p);
  const [s, h] = await Promise.all([api('/study'), api('/study/sessions')]);
  const mx = Math.max(1, ...s.heat), lvl = m => !m ? 0 : m < mx * 0.25 ? 1 : m < mx * 0.5 ? 2 : m < mx * 0.75 ? 3 : 4;
  const totSub = s.subjects.reduce((a, x) => a + x.m, 0) || 1, COLS = ['#7C3AED', '#2563EB', '#059669', '#D97706', '#DC2626', '#DB2777', '#0891B2', '#65A30D'];
  const hrs = Array(24).fill(0); s.hours.forEach(x => hrs[x.h] = x.m); const hmax = Math.max(1, ...hrs), peak = hrs.indexOf(Math.max(...hrs));
  const last30 = s.heat.slice(-30).reduce((a, b) => a + b, 0), days30 = s.heat.slice(-30).filter(Boolean).length;
  p.innerHTML = tabs('/study/stats') + `
    <div class="st-kpis"><div><b>${hm(s.total.m)}</b><small>all time</small></div><div><b>${hm(last30)}</b><small>last 30 days</small></div><div><b>${days30 ? hm(Math.round(last30 / days30)) : '—'}</b><small>avg / study day</small></div><div><b>${s.streak}</b><small>day streak · best ${s.best}</small></div></div>
    <div class="card"><h3>Last 12 weeks</h3><div class="st-heat">${s.heat.map((m, i) => `<i class="l${lvl(m)}" title="${m} min"></i>`).join('')}</div><div class="row small faint" style="gap:4px;justify-content:flex-end;align-items:center;margin-top:6px">Less ${[0, 1, 2, 3, 4].map(l => `<i class="st-hl l${l}"></i>`).join('')} More</div></div>
    ${s.subjects.length ? `<div class="card"><h3>Subjects · 30 days</h3><div class="st-sbar">${s.subjects.map((x, i) => `<i style="width:${x.m / totSub * 100}%;background:${COLS[i % 8]}"></i>`).join('')}</div>${s.subjects.map((x, i) => `<div class="st-srow"><span style="background:${COLS[i % 8]}"></span><b class="grow">${esc(x.s)}</b><span>${hm(x.m)}</span><small class="faint">${Math.round(x.m / totSub * 100)}%</small></div>`).join('')}</div>` : ''}
    ${s.hours.length ? `<div class="card"><h3>When you focus best</h3><div class="st-hours">${hrs.map((m, i) => `<i style="height:${Math.max(3, m / hmax * 100)}%" class="${i === peak ? 'pk' : ''}"></i>`).join('')}</div><div class="row between small faint"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span></div><p class="small" style="margin:8px 0 0">Your peak is around <b>${peak % 12 || 12}${peak < 12 ? 'am' : 'pm'}</b>. Try to put your hardest work there.</p></div>` : ''}
    <div class="card"><h3>Recent sessions</h3>${h.sessions.length ? h.sessions.slice(0, 20).map(x => `<div class="st-srow"><span class="st-kind ${x.kind}">${x.kind === 'focus' ? I.brain : x.kind === 'pomodoro' ? I.clock : I.edit || I.plus}</span><div class="grow"><b>${esc(x.subject || 'General')}</b><small class="faint">${new Date(x.day + 'T12:00').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}${x.note ? ' · ' + esc(x.note) : ''}</small></div><span>${hm(x.minutes)}</span><button class="iconbtn" data-dels="${x.id}" aria-label="Delete">${I.x}</button></div>`).join('') : '<p class="muted small">No sessions yet — start a Pomodoro!</p>'}</div>`;
  bindTabs(p);
  $$('[data-dels]', p).forEach(b => b.onclick = async () => { if (!await confirmSheet('Delete this session?', '', 'Delete', true)) return; await api('/study/session/' + b.dataset.dels, { method: 'DELETE' }); viewStats(); });
}

export const routes = [
  [/^\/study$/, () => viewStudy(), 'study'],
  [/^\/study\/pomodoro$/, () => viewPomodoro(), 'study'],
  [/^\/study\/focus$/, () => viewFocus(), 'study'],
  [/^\/study\/tasks$/, () => viewTasks(), 'study'],
  [/^\/study\/cards$/, (m, q) => viewCards(q), 'study'],
  [/^\/study\/stats$/, () => viewStats(), 'study'],
];
