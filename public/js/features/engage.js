// Engagement layer UI: Achievements page (streak calendar, level, badges, frames), daily gift box, level-up & milestone celebrations,
// honest social proof on the feed ("Trending today", "N watching now", "X friends liked").
import { $, $$, esc, escAttr, I, api, toast, shell, bindGo, loadingHTML } from '../core.js';
import { celebrate, haptic } from '../engage.js';
import { questRing } from './quests.js';
const SNOW = `<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round'><path d='M12 2v20M4.9 7l14.2 10M4.9 17L19.1 7M9 4l3 2 3-2M9 20l3-2 3 2'/></svg>`;

let cache = null, cacheT = 0, catalog = null;
export async function me(force) { if (!force && cache && Date.now() - cacheT < 30000) return cache; cache = await api('/engage/me'); cacheT = Date.now(); try { localStorage.setItem('shukr.eg', JSON.stringify({ s: cache.streak, g: cache.giftReady, l: cache.level })); } catch {} react(cache); return cache; }
export const cached = () => { try { return JSON.parse(localStorage.getItem('shukr.eg') || '{}'); } catch { return {}; } };
export const giftDot = () => cached().g ? '<span class="eg-dot" aria-label="Gift waiting"></span>' : '';

// Celebrate anything new the server reports (milestones, freezes, level-ups, badges).
function react(m) {
  if (m.levelUp) setTimeout(() => levelUp(m), 300);
  else if (m.milestone) setTimeout(() => celebrate(`${m.milestone}-day streak!`, `+${m.milestone * 5} XP · come back tomorrow`), 600);
  if (m.newFreeze) setTimeout(() => toast('You earned a streak freeze — it protects one missed day'), 2600);
  if (m.usedFreeze?.length) setTimeout(() => toast('A streak freeze saved your streak'), 1400);
  if (m.newBadges?.length && !m.levelUp && !m.milestone) setTimeout(() => toast('New badge unlocked — see Streaks & rewards'), 1800);
}
function levelUp(m) {
  const el = document.createElement('div'); el.className = 'eg-lvup';
  el.innerHTML = `<div class="eg-lvcard"><div class="eg-lvglow"></div><small>LEVEL UP</small><b>${m.level}</b><span>${esc(m.levelTitle)}</span><button class="btn accent">Alhamdulillah</button></div>`;
  for (let i = 0; i < 30; i++) { const c = document.createElement('i'); c.style.cssText = `--x:${(Math.random() - .5) * 420}px;--y:${-150 - Math.random() * 320}px;--r:${Math.random() * 720}deg;background:${['#FFC21A', '#FF2D55', '#20D5B5', '#6B3CF6'][i % 4]};animation-delay:${Math.random() * 150}ms`; el.append(c); }
  document.body.append(el); haptic(40); requestAnimationFrame(() => el.classList.add('in'));
  const close = () => { el.classList.remove('in'); setTimeout(() => el.remove(), 300); }; el.onclick = close;
}

// Feed header: server-backed streak flame + gift button.
export async function feedHeader(host) {
  if (!host) return;
  const paint = m => { host.innerHTML = `<a class="eg-flame ${m.activeToday ? 'on' : ''}" href="#/achievements" aria-label="${m.streak}-day streak">${I.flame}<b>${m.streak || 0}</b></a>${m.giftReady ? `<a class="eg-giftbtn" href="#/achievements?gift=1" aria-label="Open your daily gift">${I.gift}</a>` : ''}`; };
  const c = cached(); if (c.s != null) paint({ streak: c.s, giftReady: c.g, activeToday: false });
  try { paint(await me()); } catch {}
  const qh = document.createElement('span'); qh.className = 'qr-host'; host.append(qh); questRing(qh);
}
// Feed: after the 3rd watched video refresh the streak (activity is recorded by the view tracker on the server).
let watchedN = 0; export function onFeedWatch(host) { watchedN++; if (watchedN === 3 || watchedN % 10 === 0) setTimeout(() => me(true).then(() => feedHeader(host)).catch(() => {}), 2500); }
// Feed: honest social-proof badges.
export async function socialProof(root, items) {
  try {
    const ids = items.filter(x => !x.sponsored).map(x => x.id).slice(0, 30);
    const s = await api('/engage/social?ids=' + encodeURIComponent(ids.join(',')));
    const tr = new Set(s.trending);
    $$('[data-lesson]', root).forEach(el => {
      const id = el.dataset.lesson, cap = $('.fyp-caption', el); if (!cap || $('.eg-proof', el)) return;
      const bits = []; if (tr.has(id)) bits.push(`<span class="eg-tag">${I.flame} Trending today</span>`);
      if (s.watching[id]) bits.push(`<span class="eg-tag live"><i></i>${s.watching[id]} watching now</span>`);
      if (s.friendsLiked[id]) bits.push(`<span class="eg-tag">${I.heart} ${s.friendsLiked[id]} friend${s.friendsLiked[id] > 1 ? 's' : ''} liked</span>`);
      if (bits.length) cap.insertAdjacentHTML('afterbegin', `<div class="eg-proof">${bits.join('')}</div>`);
    });
  } catch {}
}

// ================= ACHIEVEMENTS =================
export async function viewAchievements(q) {
  const p = shell('Streaks & rewards');
  p.innerHTML = loadingHTML();
  [catalog] = await Promise.all([catalog || api('/engage/catalog')]);
  let m = await me(true);
  function paint() {
    const owned = new Set(m.badges), pct = Math.round(m.into / m.nextAt * 100);
    p.innerHTML = `
      <div class="eg-hero"><div class="eg-hstreak"><span class="eg-bigflame ${m.activeToday ? 'on' : ''}">${I.flame}</span><div><b>${m.streak}</b><small>day streak</small></div></div>
        <div class="eg-hsub">${m.activeToday ? 'You’re active today — streak safe ✓' : m.streak ? 'Do any good deed in the app today to keep it going' : 'Start your streak today'}</div>
        <div class="eg-freeze">${Array.from({ length: 2 }, (_, i) => `<span class="${i < m.freezes ? 'on' : ''}">${SNOW}</span>`).join('')}<small>${m.freezes} streak freeze${m.freezes === 1 ? '' : 's'} · earn 1 every 7 days</small></div></div>
      <div class="eg-gift ${m.giftReady ? 'ready' : ''}" id="egGift">${m.giftReady ? `<div class="eg-box">${I.gift}</div><div class="grow"><b>Your daily gift is ready</b><small>Tap to open — XP, a frame or a rare badge</small></div>` : `<div class="eg-box open">${I.sparkle}</div><div class="grow"><b>Today’s gift: ${esc(m.gift?.kind === 'xp' ? `${m.gift.xp} XP` : m.gift?.kind === 'badge' ? 'a rare badge!' : 'a new profile frame!')}</b><small>Come back tomorrow for another</small></div>`}</div>
      <div class="card eg-level"><div class="row between" style="align-items:center"><div><div class="eg-k">Level ${m.level}</div><b class="eg-lt">${esc(m.levelTitle)}</b></div><div class="eg-xp">${m.xp.toLocaleString()} XP</div></div>
        <div class="eg-lbar"><i style="width:${pct}%"></i></div><div class="faint small">${(m.nextAt - m.into).toLocaleString()} XP to level ${m.level + 1} · earn XP by finishing videos, dhikr, challenges and daily gifts</div></div>
      <div class="card"><div class="row between"><h3>Last 30 days</h3><span class="faint small">${(n => `${n} active day${n === 1 ? '' : 's'}`)(m.calendar.filter(c => c.on).length)}</span></div><div class="eg-calhd">${['S','M','T','W','T','F','S'].join('</span><span>').replace(/^/,'<span>')}</span></div><div class="eg-cal">${'<span class="pad"></span>'.repeat(new Date(m.calendar[0].d + 'T12:00').getDay())}${m.calendar.map(c => `<span class="${c.on ? 'on' : c.frozen ? 'fz' : 'miss'}${c.d === m.today ? ' today' : ''}" title="${esc(c.d)}">${c.frozen && !c.on ? SNOW : new Date(c.d + 'T12:00').getDate() === 1 ? new Date(c.d + 'T12:00').toLocaleDateString([], { month: 'short' }) : new Date(c.d + 'T12:00').getDate()}</span>`).join('')}</div></div>
      <div class="card"><h3>Badges <span class="faint">${owned.size}/${catalog.badges.length}</span></h3><div class="eg-badges">${catalog.badges.map(b => `<div class="eg-badge ${owned.has(b.id) ? 'on' : ''}"><span>${I[b.icon] || I.star}</span><b>${esc(b.name)}</b><small>${esc(b.how)}</small></div>`).join('')}</div></div>
      <div class="card"><h3>Profile frames</h3><p class="faint small">Unlock frames from daily gifts.</p><div class="eg-frames"><button class="eg-fr none ${!m.frame ? 'on' : ''}" data-frame="">None</button>${catalog.frames.map(f => `<button class="eg-fr fr-${f.id} ${m.frames.includes(f.id) ? '' : 'locked'} ${m.frame === f.id ? 'on' : ''}" data-frame="${f.id}" ${m.frames.includes(f.id) ? '' : 'disabled'}><i></i><small>${m.frames.includes(f.id) ? esc(f.name) : I.lock}</small></button>`).join('')}</div></div>
      <div class="grid2"><button class="btn ghost" data-go="/challenges">${I.flame} Daily challenges</button><button class="btn ghost" data-go="/challenges?tab=board">${I.users} Leaderboard</button></div>`;
    bindGo(p);
    const g = $('#egGift'); if (m.giftReady) g.onclick = openGift;
    $$('[data-frame]', p).forEach(b => b.onclick = async () => { try { await api('/engage/frame', { method: 'PUT', body: { frame: b.dataset.frame || null } }); m.frame = b.dataset.frame || null; toast('Frame updated'); paint(); } catch (e) { toast(e.message); } });
  }
  async function openGift() {
    const g = $('#egGift'); g.onclick = null; g.classList.add('shake'); haptic(20);
    try { const r = await api('/engage/gift', { body: {} }); await new Promise(res => setTimeout(res, 900));
      celebrate(r.reward.kind === 'xp' ? `+${r.reward.xp} XP` : r.reward.kind === 'badge' ? 'Rare badge!' : 'New frame!', r.reward.label); m = r.me; cache = m; cacheT = Date.now(); react(m); paint(); }
    catch (e) { toast(e.message); m = await me(true); paint(); }
  }
  paint();
  if (q?.get('gift') === '1' && m.giftReady) setTimeout(openGift, 400);
}

export const routes = [[/^\/achievements$/, (m, q) => viewAchievements(q)]];
