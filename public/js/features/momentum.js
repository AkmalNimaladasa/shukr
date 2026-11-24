// Momentum UI: daily XP goal ring + Double-XP boost chip in the feed header, combo toasts while swiping,
// auto-claimed "Daily goal met" celebration, and the /goal page (pick goal, 7-day goal streak, off switch).
import { $, $$, esc, I, api, toast, shell, loadingHTML, LS } from '../core.js';
import { celebrate, haptic } from '../engage.js';

const NAMES = { 10: 'Gentle', 20: 'Steady', 50: 'Serious', 100: 'Intense', 200: 'Devoted' };
const mins = ms => Math.max(1, Math.ceil(ms / 60000));
let last = LS.get('mo.cache', null), claiming = false, boostTimer = null;

export async function load() { const s = await api('/momentum'); const prev = last; last = s; LS.set('mo.cache', s); return { s, prev }; }

function chipHTML(s) {
  if (!s || s.off) return '';
  const pct = Math.min(1, s.xp / s.goal), boost = s.boostLeft > 0;
  return `<a class="mo-chip ${s.goalMet ? 'met' : ''}" href="#/goal" aria-label="Daily goal ${Math.min(s.xp, s.goal)} of ${s.goal} XP">
    <svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" class="mo-bg"/><circle cx="18" cy="18" r="15.5" class="mo-fg" style="stroke-dasharray:${pct * 97.4} 97.4"/></svg>
    <span>${s.goalMet ? I.check : Math.round(pct * 100) + '%'}</span></a>${boost ? `<a class="mo-boost" href="#/goal" aria-label="Double XP active">2× <b>${mins(s.boostLeft)}m</b></a>` : ''}`;
}
function paintChip(host, s) {
  let el = host.querySelector('.mo-host'); if (!el) { el = document.createElement('span'); el.className = 'mo-host'; host.append(el); }
  el.innerHTML = chipHTML(s);
  clearInterval(boostTimer);
  if (s && s.boostLeft > 0) { const end = Date.now() + s.boostLeft; boostTimer = setInterval(() => { const b = el.querySelector('.mo-boost b'), left = end - Date.now(); if (!b || left <= 0) { clearInterval(boostTimer); el.querySelector('.mo-boost')?.remove(); return; } b.textContent = mins(left) + 'm'; }, 30000); }
}

// Feed header hook (called from engage.feedHeader).
export async function goalChip(host) {
  if (!host) return; if (last) paintChip(host, last);
  try { const { s } = await load(); paintChip(host, s); maybeClaim(host, s); } catch {}
}

// Duolingo moment: as soon as the goal is reached, claim it and celebrate (once a day).
async function maybeClaim(host, s) {
  if (!s || s.off || !s.goalMet || s.goalClaimed || claiming) return;
  claiming = true;
  try {
    const r = await api('/momentum/claim', { body: {} }); last = r; LS.set('mo.cache', r);
    if (r.justClaimed) { haptic(40); celebrate('Daily goal met!', `${r.goalStreak}-day goal streak · Double XP for ${r.boostMin} minutes`); }
    if (host) paintChip(host, r);
  } catch {} finally { claiming = false; }
}

// Feed hook: after a video is seen, refresh (debounced) and pay out combo / goal feedback.
let pend = null;
export function onSwipe(host) {
  clearTimeout(pend);
  pend = setTimeout(async () => {
    try {
      const { s, prev } = await load();
      if (s.off) return paintChip(host, s);
      if (prev && prev.day === s.day && s.comboXp > prev.comboXp) { haptic(20); toast(`Combo! ${s.finishedToday} videos today · +${s.comboXp - prev.comboXp} XP`); }
      else if (s.toNextCombo === 1 && !(prev && prev.toNextCombo === 1)) toast('1 more video for a combo bonus');
      if (prev && prev.day === s.day && !prev.goalMet && !s.goalMet && s.goal - s.xp <= 5) toast(`Just ${s.goal - s.xp} XP to your daily goal`);
      paintChip(host, s); maybeClaim(host, s);
    } catch {}
  }, 2600);
}

// ================= /goal =================
export async function viewGoal() {
  const p = shell('Daily goal'); p.innerHTML = loadingHTML();
  let s = (await load()).s;
  const paint = () => {
    const pct = Math.min(100, Math.round(s.xp / s.goal * 100));
    p.innerHTML = `
      <div class="mo-hero"><div class="mo-big" style="--p:${pct}"><b>${Math.min(s.xp, s.goal)}</b><small>/ ${s.goal} XP</small></div>
        <div><b class="mo-ht">${s.goalMet ? 'Goal met today' : `${s.goal - s.xp} XP to go`}</b>
        <small>${s.goalStreak ? `${s.goalStreak}-day goal streak` : 'Meet your goal to start a goal streak'}</small>
        ${s.boostLeft > 0 ? `<span class="mo-boost on">2× XP · ${mins(s.boostLeft)} min left</span>` : `<small class="mo-tip">Meeting the goal unlocks ${s.boostMin} minutes of Double XP on videos</small>`}</div></div>
      <div class="card"><h3>This week</h3><div class="mo-week">${s.week.map(w => `<span class="${w.met ? 'on' : ''} ${w.d === s.day ? 'today' : ''}"><i>${w.met ? I.check : ''}</i><small>${'SMTWTFS'[new Date(w.d + 'T12:00').getDay()]}</small></span>`).join('')}</div></div>
      <div class="card"><h3>Combo</h3><p class="faint small">Every ${s.comboEvery} videos you finish in a day pays +${s.comboStep} XP (up to ${s.comboCap} a day).</p>
        <div class="mo-combo"><b>${s.finishedToday}</b><small>finished today · +${s.comboXp} combo XP${s.toNextCombo ? ` · ${s.toNextCombo} to the next combo` : ' · max reached'}</small></div></div>
      <div class="card"><h3>Pick your daily goal</h3><div class="mo-goals">${s.goals.map(g => `<button class="mo-g ${g === s.goal ? 'on' : ''}" data-g="${g}"><b>${NAMES[g]}</b><small>${g} XP a day</small></button>`).join('')}</div>
        <p class="faint small">XP comes from finishing videos, dhikr, Arabic lessons, quests, challenges and your daily gift.</p></div>
      <div class="card row between" style="align-items:center"><div><b>Goal ring and nudges</b><div class="faint small">Turn off to hide the ring and the evening reminder</div></div>
        <button class="btn ${s.off ? 'accent' : 'ghost'} sm" id="moOff">${s.off ? 'Turn on' : 'Turn off'}</button></div>`;
    $$('[data-g]', p).forEach(b => b.onclick = async () => { try { s = await api('/momentum/goal', { method: 'PUT', body: { goal: +b.dataset.g } }); last = s; LS.set('mo.cache', s); haptic(10); toast(`Daily goal: ${NAMES[s.goal]} (${s.goal} XP)`); paint(); maybeClaim(null, s); } catch (e) { toast(e.message); } });
    $('#moOff').onclick = async () => { try { s = await api('/momentum/off', { method: 'PUT', body: { off: !s.off } }); last = s; LS.set('mo.cache', s); paint(); } catch (e) { toast(e.message); } };
  };
  paint(); maybeClaim(null, s);
}

export const routes = [[/^\/goal$/, () => viewGoal()]];
