// Quick fard-prayer tracker: a floating button on every main screen → bottom sheet with 5 one-tap ticks.
// Uses existing APIs (/api/today, /api/prayer, /api/prayertimes) — no new server cost.
import { $, $$, I, api, toast, vibrate, sheet, state, computeTimes, go } from '../core.js';

const FARD = [['fajr', 'Fajr', 'الفجر'], ['dhuhr', 'Dhuhr', 'الظهر'], ['asr', 'Asr', 'العصر'], ['maghrib', 'Maghrib', 'المغرب'], ['isha', 'Isha', 'العشاء']];
const isDone = s => s === 'ontime' || s === 'jamaah' || s === 'late';
const toMin = v => { const m = String(v || '').match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
const nowMin = () => Date.now();
const fmt = ms => { try { return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: state.user?.settings?.tz || undefined }).replace(' ', '').toLowerCase(); } catch { return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } };
let cache = { day: null, prayers: {}, times: null, at: 0 };

async function load(force) {
  if (!force && Date.now() - cache.at < 60000 && cache.day) return cache;
  const t = await api('/today'); let times = null;
  try { const c = computeTimes(new Date()); if (c) times = Object.fromEntries(['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].map(k => [k, c[k] instanceof Date ? c[k].getTime() : null])); } catch {}
  cache = { day: t.day, prayers: t.prayers || {}, times, at: Date.now() };
  return cache;
}
function current(c) { // which fard is "now" (started, not ended) and which is next
  const T = c.times; if (!T) return {};
  const m = nowMin(), st = FARD.map(([k]) => typeof T[k] === 'number' ? T[k] : null);
  let cur = null; for (let i = 0; i < 5; i++) if (st[i] != null && m >= st[i]) cur = i;
  const next = st.findIndex(x => x != null && x > m);
  return { cur, next, st };
}

export function renderFab() {
  if (!state.user || document.querySelector('.pq-fab') || document.documentElement.classList.contains('creating')) return;
  const b = document.createElement('button'); b.className = 'pq-fab'; b.setAttribute('aria-label', 'Prayer tracker');
  b.innerHTML = `<svg viewBox="0 0 36 36" class="pq-ring"><circle cx="18" cy="18" r="16"/><circle cx="18" cy="18" r="16" class="pq-ringfg"/></svg><span class="pq-ic">${I.mosque || '🕌'}</span><b class="pq-n">0/5</b><i class="pq-dot" hidden></i>`;
  b.onclick = () => openQuick();
  document.body.append(b); paintFab();
}
async function paintFab() {
  const b = document.querySelector('.pq-fab'); if (!b) return;
  try { const c = await load(); const n = FARD.filter(([k]) => isDone(c.prayers[k])).length, { cur } = current(c);
    b.querySelector('.pq-n').textContent = `${n}/5`; b.querySelector('.pq-ringfg').style.strokeDasharray = `${n / 5 * 100.5} 100.5`;
    const due = cur != null && !isDone(c.prayers[FARD[cur][0]]); b.classList.toggle('due', due); b.querySelector('.pq-dot').hidden = !due; b.classList.toggle('full', n === 5);
  } catch {}
}

export async function openQuick() {
  let c; try { c = await load(true); } catch { return toast('Sign in to track prayers'); }
  sheet(`<div class="pq"><div class="pq-head"><div><small>Today’s fard prayers</small><h3 id="pqTitle"></h3></div><a href="#/prayer" class="pq-more" data-close>Details ›</a></div>
    <div class="pq-bar"><i id="pqBar"></i></div><div id="pqList"></div><p class="pq-foot" id="pqFoot"></p></div>`, (el, close) => {
    const paint = () => {
      const n = FARD.filter(([k]) => isDone(c.prayers[k])).length, { cur, next, st } = current(c);
      $('#pqTitle', el).textContent = n === 5 ? 'All 5 prayed — Alhamdulillah 🤍' : `${n} of 5 prayed`;
      $('#pqBar', el).style.width = n / 5 * 100 + '%';
      $('#pqList', el).innerHTML = FARD.map(([k, en, ar], i) => { const s = c.prayers[k], done = isDone(s), started = !st || st[i] == null || nowMin() >= st[i], isCur = i === cur;
        return `<button class="pq-row ${done ? 'done' : ''} ${isCur && !done ? 'cur' : ''} ${!started ? 'future' : ''}" data-p="${k}" ${!started && !done ? 'aria-disabled="true"' : ''}>
          <span class="pq-tick">${done ? I.check : ''}</span><span class="grow"><b>${en} <span class="pq-ar">${ar}</span></b><small>${st && st[i] != null ? fmt(st[i]) : ''}${done ? ' · ' + (s === 'jamaah' ? 'in jamaʿah' : s === 'late' ? 'prayed' : 'on time') : isCur ? ' · now' : !started ? ' · not yet' : ' · not marked'}</small></span>
          ${done ? '' : started ? `<span class="pq-jm" data-jm="${k}">Jamaʿah</span>` : ''}</button>`; }).join('');
      const nx = next >= 0 ? FARD[next] : null;
      $('#pqFoot', el).innerHTML = !c.times ? 'Set your location to see prayer times and get reminders. <a href="#/settings" class="pq-loc">Set location ›</a>' : cur != null && !isDone(c.prayers[FARD[cur][0]]) ? `Tap ✓ after you pray. We remind you 20 minutes before ${FARD[cur][1]} ends.` : nx ? `Next: ${nx[1]} at ${fmt(st[next])}` : '';
      $$('[data-p]', el).forEach(b => b.onclick = async ev => {
        if (ev.target.closest('[data-jm]')) return; const k = b.dataset.p; if (b.getAttribute('aria-disabled') === 'true') return toast('This prayer hasn’t started yet');
        const was = c.prayers[k]; const to = isDone(was) ? null : (k === FARD[cur]?.[0] ? 'ontime' : 'late');
        c.prayers[k] = to || undefined; paint(); vibrate(to ? [12, 40, 12] : 8);
        try { await api('/prayer', { body: { prayer: k, status: to } }); if (to && FARD.every(([q]) => isDone(c.prayers[q]))) toast('All 5 prayers done today — MashaAllah! 🤍'); }
        catch (e) { c.prayers[k] = was; paint(); toast(e.message); }
        cache.at = 0; paintFab(); });
      $$('[data-jm]', el).forEach(b => b.onclick = async ev => { ev.stopPropagation(); const k = b.dataset.jm; c.prayers[k] = 'jamaah'; paint(); vibrate([12, 40, 12]);
        try { await api('/prayer', { body: { prayer: k, status: 'jamaah' } }); } catch (e) { toast(e.message); } cache.at = 0; paintFab(); });
    };
    $('.pq-more', el).onclick = () => close();
    el.addEventListener('click', ev => { if (ev.target.closest('.pq-loc')) close(); });
    paint();
  });
}
export function initQuickPrayer() {
  const tick = () => { renderFab(); paintFab(); };
  setTimeout(tick, 800); setInterval(() => { cache.at = 0; paintFab(); }, 5 * 60000);
  window.addEventListener('hashchange', () => setTimeout(tick, 300));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { cache.at = 0; paintFab(); } });
  if (/[?&]quick=1/.test(location.hash)) setTimeout(openQuick, 900);
  window.addEventListener('hashchange', () => { if (/[?&]quick=1/.test(location.hash)) setTimeout(openQuick, 400); });
}
