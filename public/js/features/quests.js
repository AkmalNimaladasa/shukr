// Daily quests + weekly league UI. Quest ring lives in the feed header next to the streak flame.
import { $, $$, esc, I, api, toast, vibrate, shell, go, loadingHTML, LS } from '../core.js';
import { celebrate } from '../engage.js';

const TIER_C = ['#C2793D', '#94A3B8', '#F5B301', '#10B981', '#E2D5F8', '#38BDF8'];
const fmtLeft = ms => { const h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000); return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h ? `${h}h ${m}m` : `${m}m`; };

export function questRing(host) { // small progress ring for headers
  if (!host) return; const c = LS.get('q.cache', null);
  const paint = s => { const done = s.quests.filter(x => x.claimed).length, ready = s.quests.some(x => x.done && !x.claimed) || (s.allClaimed && !s.chest);
    host.innerHTML = `<a class="qr ${ready ? 'ready' : ''}" href="#/quests" aria-label="Daily quests ${done} of 3"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" class="qr-bg"/><circle cx="18" cy="18" r="15.5" class="qr-fg" style="stroke-dasharray:${done / 3 * 97.4} 97.4"/></svg><span>${s.allClaimed && s.chest ? I.check : done + '/3'}</span>${ready ? '<i></i>' : ''}</a>`; };
  if (c && c.day) paint(c);
  api('/quests').then(s => { LS.set('q.cache', s); paint(s); }).catch(() => {});
}

export async function viewQuests() {
  const p = shell('Quests & league'); p.classList.add('q-page'); p.innerHTML = loadingHTML();
  const [s, L] = await Promise.all([api('/quests'), api('/league').catch(() => null)]); LS.set('q.cache', s);
  const done = s.quests.filter(x => x.claimed).length;
  p.innerHTML = `
    <div class="q-hero"><div><small>Daily quests</small><b>${done}/3 complete</b><span>New quests in ${fmtLeft(s.resetsIn)}</span></div>
      <div class="q-perfect">${I.flame}<b>${s.perfect}</b><small>perfect day${s.perfect === 1 ? '' : 's'}</small></div></div>
    <div class="q-list">${s.quests.map(x => `<div class="q-card ${x.claimed ? 'claimed' : x.done ? 'done' : ''}">
      <div class="q-ic">${I[x.icon] || I.star}</div>
      <div class="grow"><b>${esc(x.title)}</b><div class="q-bar"><i style="width:${x.n / x.goal * 100}%"></i></div><small>${x.n}/${x.goal}${x.unit ? ' ' + x.unit : ''} · +${x.xp} XP</small></div>
      ${x.claimed ? `<span class="q-ok">${I.check}</span>` : x.done ? `<button class="btn accent sm q-claim" data-claim="${x.id}">Claim</button>` : `<button class="btn ghost sm" data-go="${x.url}">Go</button>`}</div>`).join('')}</div>
    <button class="q-chest ${s.allClaimed && !s.chest ? 'ready' : ''} ${s.chest ? 'open' : ''}" id="qChest" ${s.allClaimed && !s.chest ? '' : 'disabled'}>
      <span class="q-chest-ic">${s.chest ? '🎉' : '🎁'}</span><span class="grow"><b>${s.chest ? 'Chest opened — see you tomorrow!' : s.allClaimed ? 'Open your bonus chest!' : 'Bonus chest'}</b><small>${s.chest ? 'Keep your perfect-day streak going' : 'Finish all 3 quests · XP, jackpots or a streak freeze'}</small></span></button>
    ${L ? leagueHTML(L) : ''}`;
  $$('[data-go]', p).forEach(b => b.onclick = () => go(b.dataset.go));
  $$('[data-claim]', p).forEach(b => b.onclick = async () => { b.disabled = true; try { const n = await api('/quests/claim', { body: { id: b.dataset.claim } }); vibrate([15, 40, 15]); const x = n.quests.find(z => z.id === b.dataset.claim); toast(`+${x.xp} XP`); LS.set('q.cache', n); viewQuests(); } catch (e) { toast(e.message); b.disabled = false; } });
  const ch = $('#qChest'); if (ch && !ch.disabled) ch.onclick = async () => { ch.disabled = true; ch.classList.add('shake'); const r = await api('/quests/chest', { body: {} }); LS.set('q.cache', r);
    setTimeout(() => { const w = r.reward; if (w) celebrate(w.kind === 'freeze' ? 'Streak freeze!' : w.xp >= 100 ? 'JACKPOT! +100 XP' : `+${w.xp} XP`, w.kind === 'freeze' ? 'It protects your streak on a missed day · +20 XP' : 'All 3 quests done — come back tomorrow'); viewQuests(); }, 700); };
}
function leagueHTML(L) {
  const c = TIER_C[L.tier];
  return `<div class="card q-league" style="--tc:${c}"><div class="row between" style="align-items:center"><div class="q-tier"><span class="q-shield">${I.shield || I.star}</span><div><b>${esc(L.tierName)} League</b><small>Ends in ${fmtLeft(L.endsAt - Date.now())}</small></div></div><div class="q-myxp"><b>${L.myXp}</b><small>XP this week</small></div></div>
    ${L.lastResult === 'promoted' ? `<div class="q-res up">${I.arrowUp || '▲'} Promoted last week — MashaAllah!</div>` : L.lastResult === 'demoted' ? `<div class="q-res down">Moved down a league — climb back this week</div>` : ''}
    <p class="faint small" style="margin:8px 0">${L.nextTier ? `Top ${L.promoteN} move up to <b>${esc(L.nextTier)}</b> on Monday.` : 'You’re in the top league — stay in the top to keep it.'} Earn XP from quests, dhikr, videos and Arabic.</p>
    <div class="q-board">${L.board.map((b, i) => `${i === L.promoteN ? '<div class="q-zone">▲ promotion zone ▲</div>' : ''}<div class="q-row ${b.you ? 'me' : ''}"><span class="q-rk">${i + 1}</span><b class="grow">${esc(b.you ? 'You' : b.name)}</b><span>${b.xp} XP</span></div>`).join('')}</div></div>`;
}
export const routes = [[/^\/quests$/, () => viewQuests(), 'quests']];
