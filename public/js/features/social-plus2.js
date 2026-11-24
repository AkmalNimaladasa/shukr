// Social+ : Creator analytics (TikTok-Studio style) and Challenges (daily challenges, friends, dhikr leaderboard).
import { $, $$, esc, escAttr, I, api, toast, vibrate, shell, bindGo, go, loadingHTML, confirmSheet, sheet } from '../core.js';

const fmt = n => n == null ? '—' : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K' : String(n);
const dur = ms => { const s = Math.round((ms || 0) / 1000); if (s < 60) return s + 's'; const m = Math.floor(s / 60); if (m < 60) return `${m}m ${s % 60}s`; const h = Math.floor(m / 60); return `${h}h ${m % 60}m`; };
const avatar = (u, size = 40) => u.avatar ? `<img class="sp2-av" style="width:${size}px;height:${size}px" src="${escAttr(u.avatar)}" alt="">` : `<span class="sp2-av sp2-av-l" style="width:${size}px;height:${size}px">${esc((u.username || u.name || '?')[0].toUpperCase())}</span>`;

// ================= CREATOR ANALYTICS =================
function lineChart(pts, key, color) {
  const W = 340, H = 120, n = pts.length, max = Math.max(1, ...pts.map(p => p[key])), min = key === 'followers' ? Math.min(...pts.map(p => p[key])) : 0;
  const span = Math.max(1, max - min);
  const xy = pts.map((p, i) => [n > 1 ? i / (n - 1) * W : W / 2, H - 8 - (p[key] - min) / span * (H - 20)]);
  const path = xy.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="sp2-chart" preserveAspectRatio="none"><defs><linearGradient id="g${key}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="${path} L${W} ${H} L0 ${H} Z" fill="url(#g${key})"/><path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>
    <div class="sp2-axis"><span>${esc(pts[0]?.d.slice(5) || '')}</span><span>${esc(pts[n - 1]?.d.slice(5) || '')}</span></div>`;
}
export async function viewCreatorAnalytics(q) {
  const p = shell('Creator analytics', { back: '/creator' });
  let days = [7, 28, 60].includes(+q?.get('days')) ? +q.get('days') : 28, chart = 'views';
  async function load() {
    p.innerHTML = loadingHTML();
    let a; try { a = await api('/sp2/analytics?days=' + days); } catch (e) { p.innerHTML = `<div class="empty"><p class="muted">${esc(e.message)}</p></div>`; return; }
    const k = a.kpis;
    const kpi = (label, v, delta, sub) => `<div class="sp2-kpi"><div class="sp2-kl">${label}</div><div class="sp2-kv">${v}</div>${delta != null ? `<div class="sp2-kd ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta > 0 ? '▲' : delta < 0 ? '▼' : ''} ${Math.abs(delta)}%</div>` : sub ? `<div class="sp2-kd">${sub}</div>` : ''}</div>`;
    const empty = !k.posts.value;
    p.innerHTML = `
      <div class="sp2-hero"><div class="sp2-hk">Last ${days} days</div><div class="sp2-hv">${fmt(k.views.value)} <small>views</small></div>
        <div class="sp2-hrow"><span>${I.users} ${fmt(k.followers.value)} followers</span><span>${I.heart} ${k.engagementRate.value ?? 0}% engagement</span></div></div>
      <div class="seg" style="margin:12px 0">${[7, 28, 60].map(d => `<button data-days="${d}" class="${d === days ? 'on' : ''}">${d} days</button>`).join('')}</div>
      ${empty ? `<div class="card sp2-start"><h3>Post your first video</h3><p class="muted">Your views, watch time and followers will appear here as soon as people start watching.</p><button class="btn accent" data-go="/create">${I.plus} Create</button></div>` : ''}
      <div class="sp2-grid">
        ${kpi('Views', fmt(k.views.value), k.views.delta)}${kpi('Watch time', dur(k.watchMs.value))}
        ${kpi('Avg. watch', dur(k.avgWatchMs.value))}${kpi('Completion', k.completionRate.value == null ? '—' : k.completionRate.value + '%')}
        ${kpi('Likes', fmt(k.likes.value), k.likes.delta)}${kpi('Comments', fmt(k.comments.value), k.comments.delta)}
        ${kpi('Shares', fmt(k.shares.value), k.shares.delta)}${kpi('New followers', fmt(k.newFollowers.value), k.newFollowers.delta)}
        ${kpi('Unique viewers', fmt(k.viewers.value))}${kpi('Saves', fmt(k.savesAllTime.value), null, 'all time')}
        ${k.stories.value ? kpi('Story views', fmt(k.storyViews.value), null, `${k.stories.value} stories`) : ''}${kpi('Posts', fmt(k.postsInRange.value), null, `${fmt(k.posts.value)} all time`)}
      </div>
      <div class="card"><div class="row between" style="align-items:center"><h3 style="margin:0">Trend</h3>
        <div class="chips" style="padding:0">${[['views', 'Views'], ['followers', 'Followers'], ['watch', 'Watch']].map(([id, l]) => `<button class="chip ${id === chart ? 'on' : ''}" data-chart="${id}">${l}</button>`).join('')}</div></div>
        <div id="spChart" style="margin-top:10px"></div></div>
      ${a.heatmap ? `<div class="card"><h3>When your viewers watch</h3><div class="sp2-heat">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((dn, di) => `<div class="sp2-hr"><span>${dn}</span>${Array.from({ length: 24 }, (_, h) => { const c = a.heatmap.find(x => x[0] === di + 1 && x[1] === h)?.[2] || 0; const mx = Math.max(...a.heatmap.map(x => x[2])); return `<i style="opacity:${c ? 0.2 + 0.8 * c / mx : 0.06}" title="${h}:00 · ${c}"></i>`; }).join('')}</div>`).join('')}<div class="sp2-axis"><span>12am</span><span>12pm</span><span>11pm</span></div></div></div>` : ''}
      <div class="card"><h3>Top posts</h3>${a.top.length ? a.top.map(t => `<a class="sp2-top" href="#/fyp?post=${encodeURIComponent(t.id)}">
          <div class="sp2-th">${t.thumb ? `<img src="${escAttr(t.thumb)}" alt="" loading="lazy">` : I.play}</div>
          <div class="grow"><b>${esc(t.title)}</b><div class="sp2-ts">${I.eye} ${fmt(t.views)} · ${dur(t.avgWatchMs)} avg${t.completion != null ? ` · ${t.completion}% finish` : ''}</div>
          <div class="sp2-ts">${I.heart} ${fmt(t.likes)} · ${I.chat} ${fmt(t.comments)} · ${I.share} ${fmt(t.shares)}${t.er != null ? ` · <b>${t.er}% ER</b>` : ''}</div></div></a>`).join('') : '<p class="muted small">No posts yet.</p>'}</div>
      <div class="card sp2-tips"><h3>${I.bulb} Grow faster</h3><ul class="sp2-ul">
        <li>Hook viewers in the first 2 seconds — completion rate drives reach.</li><li>Post at the hours your viewers are most active.</li><li>Reply to comments within the first hour.</li></ul>
        <div class="grid2"><button class="btn ghost" data-go="/university">${I.cap} Creator University</button><button class="btn ghost" data-go="/creator/quests">${I.flame} Quests</button></div></div>
      <p class="faint small" style="text-align:center">Engagement rate = (likes + comments + shares) ÷ views. Your own views aren’t counted.</p>`;
    bindGo(p);
    const paintChart = () => { const s = a.series.map(x => ({ ...x, watch: Math.round(x.watchMs / 60000) }));
      $('#spChart').innerHTML = lineChart(s, chart, chart === 'followers' ? '#7C3AED' : chart === 'watch' ? '#0EA5E9' : '#E3164E'); $$('[data-chart]', p).forEach(b => b.classList.toggle('on', b.dataset.chart === chart)); };
    paintChart();
    $$('[data-chart]', p).forEach(b => b.onclick = () => { chart = b.dataset.chart; paintChart(); });
    $$('[data-days]', p).forEach(b => b.onclick = () => { days = +b.dataset.days; load(); });
  }
  load();
}

// ================= CHALLENGES =================
// Kept for other modules: the leaderboard reads the dhikr counter's own server logs (dhikr_logs), so no extra reporting is needed.
export function reportDhikr() {}

// Invite friends to race on the dhikr board: share a link (with referral code), or find & add people right here.
async function inviteSheet(onChange) {
  let code = ''; try { code = (await api('/referrals')).code || ''; } catch {}
  const link = location.origin + '/?ref=' + encodeURIComponent(code) + '#/challenges?tab=board';
  const msg = `Join me on Shukr — let’s race on the dhikr leaderboard! 📿 ${link}`;
  sheet(`<div class="sp2-invite"><h3>Invite friends</h3><p class="muted small" style="margin-top:-4px">Compete together on the dhikr leaderboard. Every SubhanAllah counts.</p>
      <div class="sp2-share">
        <a class="sp2-sh wa" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener"><span>${I.chat}</span>WhatsApp</a>
        <button class="sp2-sh nat" id="ivShare"><span>${I.share}</span>Share</button>
        <button class="sp2-sh cp" id="ivCopy"><span>${I.copy || I.link || I.share}</span>Copy link</button>
        <a class="sp2-sh sms" href="sms:?&body=${encodeURIComponent(msg)}"><span>${I.phone}</span>SMS</a>
      </div>
      <div class="sp2-search" style="margin-top:14px"><span>${I.search}</span><input id="ivQ" placeholder="Already on Shukr? Find by name or @username" autocomplete="off" autocapitalize="off"></div>
      <div id="ivRes" class="sp2-ivres"></div></div>`, (el, close) => {
    $('#ivCopy', el).onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Invite link copied'); vibrate(10); } catch { prompt('Copy this link', link); } };
    $('#ivShare', el).onclick = async () => { if (navigator.share) { try { await navigator.share({ title: 'Shukr', text: msg, url: link }); } catch {} } else { try { await navigator.clipboard.writeText(msg); toast('Invite copied — paste it anywhere'); } catch { prompt('Copy this invite', msg); } } };
    let st; $('#ivQ', el).oninput = e => { clearTimeout(st); const v = e.target.value.trim(); st = setTimeout(async () => {
      const box = $('#ivRes', el); if (v.replace('@', '').length < 2) { box.innerHTML = ''; return; }
      box.innerHTML = '<p class="faint small" style="padding:6px 4px">Searching…</p>';
      let r; try { r = await api('/sp2/friends/search?q=' + encodeURIComponent(v)); } catch (er) { box.innerHTML = `<p class="muted small">${esc(er.message)}</p>`; return; }
      box.innerHTML = r.people.length ? r.people.map(u => `<div class="sp2-row">${avatar(u, 38)}<div class="grow"><b>${esc(u.name || u.username)}</b><div class="faint small">@${esc(u.username || '')}</div></div>${u.state === 'friends' ? '<span class="badge green">Friends</span>' : u.state === 'sent' ? '<span class="badge">Sent</span>' : u.state === 'incoming' ? `<button class="btn sm accent" data-acc="${u.id}">Accept</button>` : `<button class="btn sm accent" data-add="${escAttr(u.username)}" data-uid="${u.id}">${I.plus} Add</button>`}</div>`).join('') : '<p class="muted small" style="padding:6px 4px">No one found — send them an invite link above.</p>';
      $$('[data-add]', box).forEach(b => b.onclick = async () => { b.disabled = true; try { const x = await api('/sp2/friends/request', { body: { username: b.dataset.add, userId: +b.dataset.uid } }); vibrate(15); b.outerHTML = `<span class="badge ${x.state === 'friends' ? 'green' : ''}">${x.state === 'friends' ? 'Friends' : 'Request sent'}</span>`; toast(x.state === 'friends' ? 'You’re now friends' : 'Friend request sent'); onChange?.(); } catch (er) { toast(er.message); b.disabled = false; } });
      $$('[data-acc]', box).forEach(b => b.onclick = async () => { await api('/sp2/friends/respond', { body: { userId: +b.dataset.acc, accept: true } }); b.outerHTML = '<span class="badge green">Friends</span>'; toast('Friend added'); onChange?.(); });
    }, 250); };
  });
}

export async function viewChallenges(q) {
  const p = shell('Challenges');
  let tab = ['today', 'friends', 'board'].includes(q?.get('tab')) ? q.get('tab') : 'today', period = 'today', scope = 'friends';
  const tabs = () => `<div class="seg" style="margin-bottom:12px">${[['today', 'Today'], ['board', 'Leaderboard'], ['friends', 'Friends']].map(([id, l]) => `<button data-tab="${id}" class="${id === tab ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const bindTabs = () => $$('[data-tab]', p).forEach(b => b.onclick = () => { tab = b.dataset.tab; history.replaceState(null, '', '#/challenges?tab=' + tab); render(); });
  async function render() { p.innerHTML = tabs() + loadingHTML(); bindTabs(); try { await (tab === 'today' ? today() : tab === 'board' ? board() : friends()); } catch (e) { p.innerHTML = tabs() + `<div class="empty"><p class="muted">${esc(e.message)}</p></div>`; bindTabs(); } }

  async function today() {
    const s = await api('/sp2/challenges');
    p.innerHTML = tabs() + `
      <div class="sp2-ch-hero"><div class="row between" style="align-items:center"><div><div class="sp2-hk">Level ${s.level.level}</div><div class="sp2-hv">${fmt(s.xp)} <small>XP</small></div></div>
        <div class="sp2-flame">${I.flame}<b>${s.streak}</b><small>day streak</small></div></div>
        <div class="sp2-lvbar"><i style="width:${Math.round(s.level.into / s.level.need * 100)}%"></i></div><div class="sp2-hk" style="margin-top:4px">${s.level.need - s.level.into} XP to level ${s.level.level + 1}</div>
        <div class="sp2-week">${s.week.map(w => `<span class="${w.done ? 'on' : ''}">${new Date(w.d + 'T12:00').toLocaleDateString([], { weekday: 'narrow' })}</span>`).join('')}</div></div>
      <h3 style="margin:14px 4px 8px">Today’s 3 challenges ${s.allDone ? '<span class="badge green">All done!</span>' : ''}</h3>
      ${s.challenges.map(c => `<div class="sp2-ch ${c.done ? 'done' : ''}"><span class="sp2-ch-ic">${I[c.icon] || I.star}</span><div class="grow"><b>${esc(c.title)}</b>
          <div class="faint small">+${c.xp} XP${c.goal ? ` · ${c.progress}/${c.goal}` : ''}</div>${c.goal ? `<div class="sp2-pb"><i style="width:${Math.min(100, c.progress / c.goal * 100)}%"></i></div>` : ''}</div>
          ${c.done ? `<button class="sp2-ok" data-undo="${escAttr(c.id)}" aria-label="Undo">${I.check}</button>` : c.goal && c.progress < c.goal && c.go ? `<button class="btn sm accent" data-go="${escAttr(c.go)}">Go</button>` : `<button class="btn sm" data-done="${escAttr(c.id)}">Done</button>`}</div>`).join('')}
      <p class="muted small" style="text-align:center;margin-top:10px">Finish all three for a +25 XP bonus. New challenges every day.</p>`;
    bindTabs(); bindGo(p);
    $$('[data-done]', p).forEach(b => b.onclick = async () => { b.disabled = true; try { const r = await api(`/sp2/challenges/${encodeURIComponent(b.dataset.done)}/done`, { body: {} }); vibrate([20, 40, 20]); if (r.allDone) toast('All 3 done — MashaAllah! +25 bonus XP'); today(); } catch (e) { toast(e.message); b.disabled = false; } });
    $$('[data-undo]', p).forEach(b => b.onclick = async () => { if (!await confirmSheet('Undo this challenge?', 'Its XP will be removed.', 'Undo')) return; await api(`/sp2/challenges/${encodeURIComponent(b.dataset.undo)}/done`, { body: { done: false } }); today(); });
  }

  async function board() {
    const r = await api(`/sp2/leaderboard?period=${period}&scope=${scope}`);
    const t3 = r.top.slice(0, 3), rest = r.top.slice(3);
    const name = u => u.you ? 'You' : (u.name || '@' + (u.username || 'someone'));
    const ch = c => c == null ? '<span class="sp2-new">new</span>' : c > 0 ? `<span class="sp2-up">▲${c}</span>` : c < 0 ? `<span class="sp2-down">▼${-c}</span>` : '<span class="faint">–</span>';
    const pod = (u, place) => u ? `<div class="sp2-pod p${place}">${avatar(u, place === 1 ? 64 : 52)}<b>${esc(name(u))}</b><span>${fmt(u.total)}</span><div class="sp2-step">${place}</div></div>` : `<div class="sp2-pod p${place} empty"><button class="sp2-inv" data-invite aria-label="Invite friends">${I.plus}</button><small>Invite</small><div class="sp2-step">${place}</div></div>`;
    p.innerHTML = tabs() + `
      <div class="sp2-board-hero"><div class="sp2-hk">Dhikr leaderboard</div>
        <div class="row" style="gap:6px;margin:8px 0 4px;justify-content:center"><div class="seg sp2-seg">${[['today', 'Today'], ['week', 'Week']].map(([id, l]) => `<button data-period="${id}" class="${id === period ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="seg sp2-seg">${[['friends', 'Friends'], ['global', 'Global']].map(([id, l]) => `<button data-scope="${id}" class="${id === scope ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <div class="sp2-podium">${pod(t3[1], 2)}${pod(t3[0], 1)}${pod(t3[2], 3)}</div></div>
      ${scope === 'friends' && !r.friendsCount ? `<div class="card" style="text-align:center"><p class="muted">Add friends to compete together.</p><button class="btn accent" data-invite>${I.users} Invite friends</button></div>` : ''}
      <div class="sp2-rows">${rest.map(u => `<div class="sp2-row ${u.you ? 'me' : ''}"><span class="sp2-rk">${u.rank}</span>${avatar(u, 36)}<b class="grow">${esc(name(u))}</b>${ch(u.change)}<span class="sp2-tot">${fmt(u.total)}</span></div>`).join('')}</div>
      ${r.top.length ? '' : `<div class="empty"><p class="muted">No dhikr counted ${period === 'today' ? 'today' : 'this week'} yet. Be the first!</p></div>`}
      <div class="sp2-row me sp2-pin"><span class="sp2-rk">${r.me.rank || '–'}</span>${avatar(r.me, 36)}<b class="grow">You${r.me.hidden ? ' <small class="faint">(hidden from global)</small>' : ''}</b>${r.me.rank ? ch(r.me.change) : ''}<span class="sp2-tot">${fmt(r.me.total)}</span></div>
      <div class="grid2" style="margin-top:10px"><button class="btn accent" data-go="/dhikr">${I.beads} Count dhikr</button><button class="btn ghost" data-invite>${I.users} Invite</button></div>
      ${scope === 'global' ? `<label class="list-item" style="margin-top:10px"><div class="grow">Hide me from the global board</div><span class="toggle"><input type="checkbox" id="spHide" ${r.prefs.hideGlobal ? 'checked' : ''}><span></span></span></label>` : ''}
      <p class="faint small" style="text-align:center">Counts come from your dhikr counter. Up to ${fmt(r.cap)} a day count toward the leaderboard.</p>`;
    bindTabs(); bindGo(p);
    $$('[data-period]', p).forEach(b => b.onclick = () => { period = b.dataset.period; board(); });
    $$('[data-scope]', p).forEach(b => b.onclick = () => { scope = b.dataset.scope; board(); });
    $$('[data-tab2]', p).forEach(b => b.onclick = () => { tab = 'friends'; render(); });
    $$('[data-invite]', p).forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); inviteSheet(() => board()); });
    const h = $('#spHide'); if (h) h.onchange = async () => { await api('/sp2/prefs', { method: 'PUT', body: { hideGlobal: h.checked } }); toast(h.checked ? 'Hidden from global board' : 'Visible on global board'); board(); };
  }

  async function friends() {
    const r = await api('/sp2/friends');
    const person = (u, actions) => `<div class="sp2-row">${avatar(u, 40)}<div class="grow"><b>${esc(u.name || u.username)}</b><div class="faint small">@${esc(u.username || '')}${u.via === 'mutual' ? ' · follow each other' : ''}</div></div>${actions}</div>`;
    p.innerHTML = tabs() + `
      <button class="btn accent block" data-invite style="margin-bottom:10px">${I.share} Invite friends to Shukr</button>
      <div class="sp2-search"><span>${I.search}</span><input id="spQ" placeholder="Find people by name or @username" autocomplete="off" autocapitalize="off"></div><div id="spRes"></div>
      ${r.incoming.length ? `<h3 class="sp2-h">Friend requests</h3>${r.incoming.map(u => person(u, `<button class="btn sm accent" data-acc="${u.id}">Accept</button><button class="iconbtn" data-dec="${u.id}" aria-label="Decline">${I.x}</button>`)).join('')}` : ''}
      <h3 class="sp2-h">Friends <span class="faint">${r.friends.length}</span></h3>
      ${r.friends.length ? r.friends.map(u => person(u, `<button class="iconbtn" data-prof="${escAttr(u.username)}" aria-label="Profile">${I.user}</button>${u.via === 'friend' ? `<button class="iconbtn" data-rm="${u.id}" aria-label="Remove">${I.x}</button>` : ''}`)).join('') : '<p class="muted small" style="padding:0 4px">Search above to add friends — then race each other on the dhikr board.</p>'}
      ${r.outgoing.length ? `<h3 class="sp2-h">Sent</h3>${r.outgoing.map(u => person(u, `<button class="btn sm ghost" data-rm="${u.id}">Cancel</button>`)).join('')}` : ''}
      <label class="list-item" style="margin-top:12px"><div class="grow">Count people I follow who follow me back as friends</div><span class="toggle"><input type="checkbox" id="spMut" ${r.prefs.mutualFriends ? 'checked' : ''}><span></span></span></label>`;
    bindTabs();
    let st = null;
    $('#spQ').oninput = e => { clearTimeout(st); const v = e.target.value.trim(); st = setTimeout(async () => {
      if (v.replace('@', '').length < 2) { $('#spRes').innerHTML = ''; return; }
      $('#spRes').innerHTML = '<p class="faint small" style="padding:6px 4px">Searching…</p>';
      let s; try { s = await api('/sp2/friends/search?q=' + encodeURIComponent(v)); } catch (e) { $('#spRes').innerHTML = `<p class="muted small" style="padding:6px 4px">${esc(e.message)}</p>`; return; }
      $('#spRes').innerHTML = s.people.length ? s.people.map(u => person(u, u.state === 'friends' ? '<span class="badge green">Friends</span>' : u.state === 'sent' ? '<span class="badge">Sent</span>' : u.state === 'incoming' ? `<button class="btn sm accent" data-acc="${u.id}">Accept</button>` : `<button class="btn sm accent" data-add="${escAttr(u.username)}" data-uid="${u.id}">${I.plus} Add</button>`)).join('') : '<p class="muted small" style="padding:6px 4px">No one found.</p>';
      bindActions($('#spRes')); }, 250); };
    function bindActions(root) {
      $$('[data-add]', root).forEach(b => b.onclick = async () => { b.disabled = true; try { const x = await api('/sp2/friends/request', { body: { username: b.dataset.add, userId: +b.dataset.uid || undefined } }); vibrate(15); toast(x.state === 'friends' ? 'You’re now friends' : 'Request sent'); b.outerHTML = `<span class="badge">${x.state === 'friends' ? 'Friends' : 'Sent'}</span>`; } catch (e) { toast(e.message); b.disabled = false; } });
      $$('[data-acc]', root).forEach(b => b.onclick = async () => { await api('/sp2/friends/respond', { body: { userId: +b.dataset.acc, accept: true } }); vibrate(15); toast('Friend added'); friends(); });
      $$('[data-dec]', root).forEach(b => b.onclick = async () => { await api('/sp2/friends/respond', { body: { userId: +b.dataset.dec, accept: false } }); friends(); });
      $$('[data-rm]', root).forEach(b => b.onclick = async () => { if (!await confirmSheet('Remove?', 'You can add them again later.', 'Remove', true)) return; await api('/sp2/friends/remove', { body: { userId: +b.dataset.rm } }); friends(); });
      $$('[data-prof]', root).forEach(b => b.onclick = () => go('/u/' + b.dataset.prof));
    }
    bindActions(p);
    $$('[data-invite]', p).forEach(b => b.onclick = () => inviteSheet(() => friends()));
    $('#spMut').onchange = async e => { await api('/sp2/prefs', { method: 'PUT', body: { mutualFriends: e.target.checked } }); friends(); };
  }
  render();
}

export const routes = [
  [/^\/creator\/analytics$/, (m, q) => viewCreatorAnalytics(q)],
  [/^\/challenges$/, (m, q) => viewChallenges(q), 'challenges'],
];
