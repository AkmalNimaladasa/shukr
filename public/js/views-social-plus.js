// Instagram-style stories, notifications, people search, send-to-DM, Jobs, Marketplace.
import { $, $$, esc, escAttr, I, api, state, shell, go, sheet, toast, onCleanup } from './core.js';
import { checkout } from './views-money.js';

const av = (x, cls = '') => `<span class="sx-av ${cls}">${x?.avatar ? `<img src="${escAttr(x.avatar)}" alt="">` : esc(((x?.name || x?.username || '?')[0] || '?').toUpperCase())}</span>`;
const ago = t => { const s = (Date.now() - new Date(t)) / 1000; return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : s < 604800 ? Math.floor(s / 86400) + 'd' : Math.floor(s / 604800) + 'w'; };
const money = (n, c = 'USD') => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: c, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n); } catch { return c + ' ' + n; } };
async function uploadFile(f) { const r = await fetch('/api/social/media', { method: 'POST', headers: { 'Content-Type': f.type }, body: f, credentials: 'same-origin' }); const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Upload failed'); return j.media; }

// ================= STORIES =================
export async function storiesTrayHTML() {
  let d; try { d = await api('/stories/tray'); } catch { return ''; }
  const me = state.user || {};
  const mine = d.mine ? `<button class="st-item" data-story-user="${escAttr(d.mine.username)}"><span class="st-ring ${d.mine.allSeen ? 'seen' : ''}">${av(d.mine)}</span><small>Your story</small></button>`
    : `<a class="st-item" href="#/create?type=story"><span class="st-ring add">${av({ name: me.name })}<i class="st-plus">+</i></span><small>Your story</small></a>`;
  return `<div class="st-tray" role="list">${mine}${d.tray.map(g => `<button class="st-item" data-story-user="${escAttr(g.username)}"><span class="st-ring ${g.allSeen ? 'seen' : ''}">${av(g)}</span><small>${esc(g.username || g.name)}</small></button>`).join('')}</div>`;
}
export function bindStoryTray(root, onDone) {
  const users = $$('[data-story-user]', root).map(b => b.dataset.storyUser);
  $$('[data-story-user]', root).forEach(b => b.onclick = () => openStories(users, users.indexOf(b.dataset.storyUser), onDone));
}
export async function openStories(usernames, startIdx = 0, onDone) {
  let ui = 0, si = 0, g = null, timer = null, t0 = 0, elapsed = 0, paused = false, dur = 5000;
  const ov = document.createElement('div'); ov.className = 'sv'; document.body.append(ov); document.documentElement.classList.add('sv-open');
  const close = () => { clearTimeout(timer); cancelAnimationFrame(raf); ov.remove(); document.documentElement.classList.remove('sv-open'); onDone && onDone(); };
  let raf = 0;
  const load = async i => { ui = i; if (ui < 0 || ui >= usernames.length) return close(); try { g = (await api('/stories/user/' + encodeURIComponent(usernames[ui]))).group; } catch { g = null; } if (!g) return load(ui + 1); si = Math.max(0, g.stories.findIndex(s => !s.seen)); if (si < 0) si = 0; show(); };
  const tick = () => { if (!paused) { const p = Math.min(1, (elapsed + performance.now() - t0) / dur); const bar = $('.sv-bars i.on b', ov); if (bar) bar.style.width = p * 100 + '%'; if (p >= 1) return next(); } raf = requestAnimationFrame(tick); };
  const next = () => { cancelAnimationFrame(raf); if (si < g.stories.length - 1) { si++; show(); } else load(ui + 1); };
  const prev = () => { cancelAnimationFrame(raf); if (si > 0) { si--; show(); } else if (ui > 0) load(ui - 1); else show(); };
  const pause = on => { if (on === paused) return; paused = on; const v = $('video', ov); if (on) { elapsed += performance.now() - t0; v?.pause(); } else { t0 = performance.now(); v?.play().catch(() => {}); } };
  function show() {
    cancelAnimationFrame(raf); const s = g.stories[si], m = s.media || {}, mine = g.userId === state.user?.id;
    const src = m.src || m.slides?.[0]?.src, isVid = s.format === 'reel' || /\.(mp4|webm|mov)$/.test(src || '');
    ov.innerHTML = `<div class="sv-card"><div class="sv-bars">${g.stories.map((_, k) => `<i class="${k < si ? 'done' : k === si ? 'on' : ''}"><b></b></i>`).join('')}</div>
      <div class="sv-top">${av(g)}<b>${esc(g.username || g.name)}</b><small>${ago(s.createdAt)}</small><span class="grow"></span>${isVid ? `<button class="sv-btn" data-sv="mute" aria-label="Sound">${I.volume || '🔊'}</button>` : ''}<button class="sv-btn" data-sv="close" aria-label="Close">${I.x}</button></div>
      <div class="sv-media">${isVid ? `<video src="${escAttr(src)}" playsinline autoplay ${state.svMuted ? 'muted' : ''}></video>` : `<img src="${escAttr(src)}" alt="">`}</div>
      ${s.caption && s.caption !== 'New post' ? `<div class="sv-cap">${esc(s.caption)}</div>` : ''}
      <div class="sv-tap l"></div><div class="sv-tap r"></div>
      <div class="sv-foot">${mine ? `<button class="sv-viewers" data-sv="viewers">${I.eye || '👁'} Viewers</button><button class="sv-btn" data-sv="del" aria-label="Delete story">${I.trash}</button>`
        : `<input class="sv-reply" placeholder="Reply to ${escAttr(g.username || '')}…" maxlength="500"><div class="sv-rx">${['❤️', '🤲', '🔥'].map(e => `<button data-rx="${e}">${e}</button>`).join('')}</div><button class="sv-btn" data-sv="send" aria-label="Share">${I.send}</button>`}</div></div>`;
    api(`/stories/${encodeURIComponent(s.id)}/seen`, { body: {} }).catch(() => {}); s.seen = true;
    elapsed = 0; t0 = performance.now(); paused = false;
    const v = $('video', ov); if (v) { dur = 15000; v.onloadedmetadata = () => { dur = Math.min(60000, (v.duration || 15) * 1000); }; v.play().catch(() => { v.muted = true; state.svMuted = true; v.play().catch(() => {}); }); }
    else dur = 5000;
    raf = requestAnimationFrame(tick);
    $('.sv-tap.l', ov).onclick = prev; $('.sv-tap.r', ov).onclick = next;
    const card = $('.sv-card', ov); let hold, sy = 0;
    card.onpointerdown = e => { sy = e.clientY; if (e.target.closest('input,button')) return; hold = setTimeout(() => pause(true), 180); };
    card.onpointerup = e => { clearTimeout(hold); if (e.clientY - sy > 90) return close(); if (paused && !document.activeElement?.classList.contains('sv-reply')) setTimeout(() => pause(false), 0); };
    let sx = 0; card.ontouchstart = e => { sx = e.touches[0].clientX; }; card.ontouchend = e => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 70) { dx < 0 ? load(ui + 1) : load(ui - 1); } };
    $$('[data-sv]', ov).forEach(b => b.onclick = async e => { e.stopPropagation(); const k = b.dataset.sv;
      if (k === 'close') close();
      if (k === 'mute') { const v = $('video', ov); v.muted = !v.muted; state.svMuted = v.muted; }
      if (k === 'del') { await api('/stories/' + encodeURIComponent(s.id), { method: 'DELETE' }); toast('Story deleted'); g.stories.splice(si, 1); if (!g.stories.length) close(); else { si = Math.min(si, g.stories.length - 1); show(); } }
      if (k === 'viewers') { pause(true); const r = await api(`/stories/${encodeURIComponent(s.id)}/viewers`); sheet(`<h3>${r.viewers.length} viewer${r.viewers.length === 1 ? '' : 's'}</h3>${r.viewers.map(x => `<div class="sx-row">${av(x)}<span class="grow"><b>${esc(x.username || x.name)}</b></span>${x.reaction || ''}</div>`).join('') || '<p class="muted">No views yet.</p>'}`); }
      if (k === 'send') { pause(true); sendToSheet(s.id); }
    });
    const inp = $('.sv-reply', ov); if (inp) { inp.onfocus = () => pause(true); inp.onblur = () => { if (!inp.value) pause(false); };
      inp.onkeydown = async e => { if (e.key !== 'Enter' || !inp.value.trim()) return; const text = inp.value.trim(); inp.value = ''; inp.blur();
        try { await api('/share/dm', { body: { to: [g.userId], postId: s.id, text } }); toast('Reply sent'); } catch (er) { toast(er.message); } pause(false); }; }
    $$('[data-rx]', ov).forEach(b => b.onclick = async e => { e.stopPropagation(); b.classList.add('pop'); await api(`/stories/${encodeURIComponent(s.id)}/seen`, { body: { reaction: b.dataset.rx } }).catch(() => {}); toast('Sent ' + b.dataset.rx); });
  }
  const esc_ = e => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') prev(); };
  document.addEventListener('keydown', esc_); const obs = new MutationObserver(() => { if (!document.body.contains(ov)) { document.removeEventListener('keydown', esc_); obs.disconnect(); } }); obs.observe(document.body, { childList: true });
  load(startIdx);
}

// ================= SEND TO (DM share sheet) =================
export async function sendToSheet(postId) {
  let users = []; try { users = (await api('/share/targets')).users; } catch {}
  const picked = new Set();
  sheet(`<h3>Send to</h3><input class="input sx-find" placeholder="Search" id="sxF"><div class="sx-grid" id="sxG"></div>
    <input class="input" id="sxT" placeholder="Write a message…" maxlength="500" style="margin-top:10px"><button class="btn accent block" id="sxS" disabled>Send</button>`, (sh, close) => {
    const draw = (list) => { $('#sxG', sh).innerHTML = list.map(u => `<button class="sx-pick ${picked.has(u.id) ? 'on' : ''}" data-u="${u.id}">${av(u)}<small>${esc(u.name || u.username)}</small><i>✓</i></button>`).join('') || '<p class="muted small">Follow people to share with them.</p>';
      $$('[data-u]', sh).forEach(b => b.onclick = () => { const id = +b.dataset.u; picked.has(id) ? picked.delete(id) : picked.add(id); b.classList.toggle('on'); $('#sxS', sh).disabled = !picked.size; $('#sxS', sh).textContent = picked.size > 1 ? `Send separately (${picked.size})` : 'Send'; }); };
    draw(users);
    let t; $('#sxF', sh).oninput = e => { clearTimeout(t); const v = e.target.value.trim(); t = setTimeout(async () => { if (!v) return draw(users); try { draw((await api('/search/people?q=' + encodeURIComponent(v))).users); } catch {} }, 250); };
    $('#sxS', sh).onclick = async () => { try { await api('/share/dm', { body: { to: [...picked], postId, text: $('#sxT', sh).value } }); close(); toast('Sent'); } catch (e) { toast(e.message); } };
  });
}

// ================= NOTIFICATIONS =================
const NTXT = { like: 'liked your post.', comment: 'commented:', follow: 'started following you.', tag: 'tagged you in a post.', mention: 'mentioned you.', 'story-react': '', job: 'applied to your job.' };
export async function viewNotifications() {
  const p = shell('Inbox'); p.classList.add('nt-page', 'social-hub');
  const { mountSocialTabbar, inboxSegHTML, inboxBadge } = await import('./views-social-hub.js'); mountSocialTabbar('notifications');
  const seg = inboxSegHTML('notifications');
  p.innerHTML = seg + '<div class="loading"><span class="spin"></span></div>';
  let d; try { d = await api('/notifications'); } catch (e) { p.innerHTML = seg + `<p class="muted">${esc(e.message)}</p>`; return; }
  api('/notifications/seen', { body: {} }).then(() => inboxBadge(document.querySelector('.social-tabbar'))).catch(() => {}); document.querySelectorAll('.nt-badge').forEach(b => b.remove());
  const day = 864e5, now = Date.now(), groups = [['New', x => x.unread], ['Today', x => now - new Date(x.created_at) < day], ['This week', x => now - new Date(x.created_at) < 7 * day], ['This month', x => now - new Date(x.created_at) < 30 * day], ['Earlier', () => true]];
  const used = new Set(), sections = [];
  for (const [label, f] of groups) { const items = d.items.filter((x, i) => !used.has(i) && f(x) && used.add(i)); if (items.length) sections.push([label, items]); }
  const row = x => { const w = x.who || {}, link = w.username ? `#/u/${escAttr(w.username)}` : '#/notifications';
    const txt = x.kind === 'story-react' ? esc(x.text || 'reacted to your story') : `${NTXT[x.kind] || esc(x.text || '')}${x.kind === 'comment' && x.text ? ' ' + esc(x.text.slice(0, 80)) : ''}`;
    const right = x.kind === 'follow' ? (w.following ? `<a class="btn ghost sm" href="${link}">Following</a>` : `<button class="btn accent sm" data-fb="${escAttr(w.username || '')}">Follow back</button>`)
      : x.thumb ? `<a href="#/fyp?post=${encodeURIComponent(x.ref)}"><img class="nt-th" src="${escAttr(x.thumb)}" alt=""></a>` : '';
    return `<div class="nt-row ${x.unread ? 'unread' : ''}"><a href="${link}">${av(w)}</a><p><a href="${link}"><b>${esc(w.username || w.name || 'Someone')}</b></a> ${txt} <small>${ago(x.created_at)}</small></p>${right}</div>`; };
  p.innerHTML = seg + (sections.length ? sections.map(([l, it]) => `<h4 class="nt-h">${l}</h4>${it.map(row).join('')}`).join('')
    : `<div class="ib-empty"><div class="ib-empty-art">${I.heart}</div><b>No notifications yet</b><p>Likes, comments, tags, new followers and messages show up here — post a video to get things going.</p><a class="btn accent" href="#/create">Post a video</a></div>`);
  $$('[data-fb]', p).forEach(b => b.onclick = async () => { b.disabled = true; try { await api('/social/follow/' + encodeURIComponent(b.dataset.fb), { body: { follow: true } }); b.textContent = 'Following'; b.className = 'btn ghost sm'; } catch (e) { toast(e.message); b.disabled = false; } });
}
export async function notifBadge(el) { try { const { count } = await api('/notifications/count'); if (count && el && !el.querySelector('.nt-badge')) el.insertAdjacentHTML('beforeend', `<i class="nt-badge">${count > 99 ? '99+' : count}</i>`); } catch {} }

// ================= SEARCH (people) =================
export function peopleSearchHTML() { return `<div class="ps-box"><span>${I.search}</span><input id="psQ" type="search" placeholder="Search people" autocomplete="off" aria-label="Search people by username or name"><button id="psX" hidden aria-label="Clear">${I.x}</button></div><div id="psR"></div>`; }
export function bindPeopleSearch(root, { onEmpty } = {}) {
  const q = $('#psQ', root), r = $('#psR', root), x = $('#psX', root); let t, seq = 0;
  const row = (u, recent) => `<a class="sx-row ps-row" href="#/u/${escAttr(u.username)}" data-pid="${u.id}">${av(u)}<span class="grow"><b>${esc(u.username)}</b><small>${esc(u.name || '')}${u.followers != null ? ` · ${u.followers} follower${u.followers === 1 ? '' : 's'}` : ''}${u.following ? ' · Following' : ''}</small></span>${recent ? `<button class="iconbtn sm" data-rm="${u.id}" aria-label="Remove">${I.x}</button>` : ''}</a>`;
  const run = async () => { const v = q.value.trim(), n = ++seq; x.hidden = !v;
    try { const d = await api('/search/people?q=' + encodeURIComponent(v)); if (n !== seq) return;
      if (!v) { r.innerHTML = d.recent.length ? `<div class="ps-h"><b>Recent</b><button class="link" id="psClr">Clear all</button></div>${d.recent.map(u => row(u, true)).join('')}` : ''; onEmpty && onEmpty(!d.recent.length); }
      else { onEmpty && onEmpty(false); r.innerHTML = d.users.map(u => row(u)).join('') || `<p class="muted ps-none">No accounts found for “${esc(v)}”.</p>`; }
      $$('[data-pid]', r).forEach(a => a.addEventListener('click', e => { if (e.target.closest('[data-rm]')) { e.preventDefault(); api('/search/recent', { body: { id: +a.dataset.pid, remove: true } }).then(run); return; } api('/search/recent', { body: { id: +a.dataset.pid } }).catch(() => {}); }));
      $('#psClr', r)?.addEventListener('click', () => api('/search/recent', { body: { clear: true } }).then(run));
    } catch {} };
  q.oninput = () => { clearTimeout(t); t = setTimeout(run, 200); }; x.onclick = () => { q.value = ''; run(); q.focus(); };
  q.onfocus = () => { if (!q.value) run(); };
}

// ================= JOBS =================
export async function viewJobs(query) {
  const tab = query?.get?.('tab') || 'seek'; const p = shell('Jobs');
  const me = await api('/jobs/me').catch(() => ({ prices: { 'jobs-seek': 2, 'jobs-hire': 8 } }));
  const head = `<nav class="social-seg mk-seg"><a href="#/jobs?tab=seek" ${tab === 'seek' ? 'aria-current="page"' : ''}>Find a job</a><a href="#/jobs?tab=hire" ${tab === 'hire' ? 'aria-current="page"' : ''}>Hiring</a><a href="#/jobs?tab=mine" ${tab === 'mine' ? 'aria-current="page"' : ''}>My jobs</a></nav>`;
  const paywall = (plan, title, perks) => `<div class="card jb-pay"><div class="jb-ic">${I.briefcase || I.star}</div><h3>${title}</h3><div class="jb-price">$${me.prices[plan]}<small>/month</small></div><ul>${perks.map(x => `<li>${I.check} ${x}</li>`).join('')}</ul><button class="btn accent block" data-sub="${plan}">Subscribe</button><p class="faint small">Cancel anytime.</p></div>`;
  const bindSub = () => $$('[data-sub]', p).forEach(b => b.onclick = async () => { b.disabled = true; try { const r = await api('/jobs/subscribe', { body: { plan: b.dataset.sub } }); checkout(r.checkout, () => viewJobs(query)); } catch (e) { toast(e.message); } b.disabled = false; });
  if (tab === 'seek') {
    if (!me.seeker) { let prev = []; try { await api('/jobs'); } catch (e) { prev = e.data?.preview || []; }
      p.innerHTML = head + paywall('jobs-seek', 'Job Seeker membership', ['Search every job on Shukr', 'Apply in one tap with your CV', 'Save jobs and track applications', 'Halal-friendly employers']) + (prev.length ? `<h4 class="nt-h">Recently posted</h4>${prev.map(j => `<div class="jb-card blur"><b>${esc(j.title)}</b><small>${esc(j.company)} · ${esc(j.location || 'Remote')}</small></div>`).join('')}` : ''); return bindSub(); }
    p.innerHTML = head + `<form class="mk-search" id="jf"><input class="input" name="q" placeholder="Job title, company or skill" value="${escAttr(query?.get?.('q') || '')}"><input class="input" name="loc" placeholder="City or ‘remote’"><select class="input" name="type"><option value="">Any type</option>${['full-time', 'part-time', 'contract', 'internship', 'volunteer'].map(t => `<option>${t}</option>`).join('')}</select><button class="btn accent">Search</button></form><div id="jl"><div class="loading"><span class="spin"></span></div></div>`;
    const load = async () => { const f = $('#jf', p); const d = await api(`/jobs?q=${encodeURIComponent(f.q.value)}&loc=${encodeURIComponent(f.loc.value)}&type=${encodeURIComponent(f.type.value)}`);
      $('#jl', p).innerHTML = d.jobs.map(j => `<div class="jb-card" data-j="${j.id}"><div class="row between"><b>${esc(j.title)}</b><button class="iconbtn sm" data-save="${j.id}" aria-label="Save">${j.saved ? I.bookmarkFill || '★' : I.bookmark || '☆'}</button></div><small>${esc(j.company)} · ${esc(j.location || '')}${j.remote ? ' · Remote' : ''} · ${esc(j.type)}${j.salary ? ' · ' + esc(j.salary) : ''}</small><p>${esc(j.description.slice(0, 160))}…</p>${j.applied ? '<span class="pill">Applied</span>' : `<button class="btn accent sm" data-apply="${j.id}">Apply</button>`}</div>`).join('') || '<p class="muted">No jobs match yet.</p>';
      $$('[data-save]', p).forEach(b => b.onclick = async () => { await api(`/jobs/${b.dataset.save}/save`, { body: {} }); toast('Saved'); });
      $$('[data-apply]', p).forEach(b => b.onclick = () => { const j = d.jobs.find(x => x.id == b.dataset.apply);
        sheet(`<h3>${esc(j.title)}</h3><p class="muted small">${esc(j.company)}</p><p style="white-space:pre-wrap">${esc(j.description)}</p><label class="lbl">Note to employer</label><textarea class="input" id="an" rows="3" maxlength="2000"></textarea><label class="lbl">CV (PDF or image)</label><input type="file" id="acv" accept="image/*,.pdf" class="input"><label class="lbl">…or link to CV / LinkedIn</label><input class="input" id="acl" placeholder="https://"><button class="btn accent block" id="asub">Send application</button>${j.apply_url ? `<a class="btn ghost block" href="${escAttr(j.apply_url)}" target="_blank" rel="noopener">Apply on company site</a>` : ''}`, (sh, close) => {
          $('#asub', sh).onclick = async () => { let cv = $('#acl', sh).value.trim(); const f = $('#acv', sh).files[0]; try { if (f && f.type.startsWith('image/')) cv = (await uploadFile(f)).url; await api(`/jobs/${j.id}/apply`, { body: { note: $('#an', sh).value, cvUrl: cv } }); close(); toast('Application sent'); load(); } catch (e) { toast(e.message); } }; }); });
    };
    $('#jf', p).onsubmit = e => { e.preventDefault(); load(); }; return load();
  }
  if (tab === 'hire') {
    if (!me.hiring) { p.innerHTML = head + paywall('jobs-hire', 'Hiring membership', ['Post unlimited jobs', 'Receive applications and CVs', 'Reach the Shukr community', 'Close or reopen roles anytime']); return bindSub(); }
    p.innerHTML = head + `<form class="card" id="jp"><h3>Post a job</h3><input class="input" name="title" placeholder="Job title" required maxlength="100"><input class="input" name="company" placeholder="Company" required maxlength="100"><div class="grid2"><input class="input" name="location" placeholder="Location"><select class="input" name="type">${['full-time', 'part-time', 'contract', 'internship', 'volunteer'].map(t => `<option>${t}</option>`).join('')}</select></div><label class="row"><input type="checkbox" name="remote"> Remote OK</label><input class="input" name="salary" placeholder="Salary (optional)" maxlength="60"><textarea class="input" name="description" rows="6" placeholder="Describe the role, requirements and benefits" required minlength="30" maxlength="5000"></textarea><input class="input" name="applyUrl" placeholder="External apply link (optional, https://)"><button class="btn accent block">Publish job</button></form>`;
    $('#jp', p).onsubmit = async e => { e.preventDefault(); const f = e.target; try { await api('/jobs', { body: { title: f.title.value, company: f.company.value, location: f.location.value, type: f.type.value, remote: f.remote.checked, salary: f.salary.value, description: f.description.value, applyUrl: f.applyUrl.value } }); toast('Job published'); go('/jobs?tab=mine'); } catch (er) { toast(er.message); } }; return;
  }
  const d = await api('/jobs/mine');
  p.innerHTML = head + `<h4 class="nt-h">Jobs you posted</h4>${d.posted.map(j => `<div class="jb-card"><b>${esc(j.title)}</b><small>${esc(j.company)} · ${j.status} · ${j.applicants} applicant${j.applicants === 1 ? '' : 's'}</small><div class="row"><button class="btn ghost sm" data-ap="${j.id}">Applicants</button><button class="btn ghost sm" data-st="${j.id}" data-v="${j.status === 'open' ? 'closed' : 'open'}">${j.status === 'open' ? 'Close' : 'Reopen'}</button></div></div>`).join('') || '<p class="muted small">None yet.</p>'}
    <h4 class="nt-h">Applications</h4>${d.applied.map(a => `<div class="jb-card"><b>${esc(a.title)}</b><small>${esc(a.company)} · applied ${ago(a.created_at)} ago</small></div>`).join('') || '<p class="muted small">None yet.</p>'}
    <h4 class="nt-h">Saved</h4>${d.saved.map(j => `<div class="jb-card"><b>${esc(j.title)}</b><small>${esc(j.company)}</small></div>`).join('') || '<p class="muted small">None yet.</p>'}`;
  $$('[data-st]', p).forEach(b => b.onclick = async () => { await api('/jobs/' + b.dataset.st, { method: 'PUT', body: { status: b.dataset.v } }); viewJobs(query); });
  $$('[data-ap]', p).forEach(b => b.onclick = async () => { const r = await api(`/jobs/${b.dataset.ap}/applicants`); sheet(`<h3>Applicants</h3>${r.applicants.map(a => `<div class="jb-card"><b>${esc(a.name)}</b> ${a.username ? `<a href="#/u/${escAttr(a.username)}">@${esc(a.username)}</a>` : ''}<small>${esc(a.email)}</small>${a.note ? `<p>${esc(a.note)}</p>` : ''}${a.cv_url ? `<a class="btn ghost sm" href="${escAttr(a.cv_url)}" target="_blank" rel="noopener">View CV</a>` : ''}</div>`).join('') || '<p class="muted">No applicants yet.</p>'}`); });
}

// ================= MARKETPLACE =================
const CAT = { vehicles: ['Vehicles', '🚗'], property: ['Property', '🏠'], tuition: ['Tuition & classes', '🎓'], services: ['Services', '🛠️'], electronics: ['Electronics', '💻'], phones: ['Phones', '📱'], home: ['Home & furniture', '🛋️'], appliances: ['Appliances', '🧺'], clothing: ['Clothing', '👕'], 'modest-fashion': ['Modest fashion', '🧕'], beauty: ['Health & beauty', '💄'], family: ['Family & baby', '🍼'], hobbies: ['Hobbies', '🎨'], books: ['Books', '📚'], islamic: ['Islamic items', '📿'], sports: ['Sports', '⚽'], garden: ['Garden', '🌿'], pets: ['Pets', '🐈'], food: ['Food & halal', '🍯'], tickets: ['Tickets & events', '🎟️'], business: ['Business & industrial', '🏭'], toys: ['Toys', '🧸'], free: ['Free stuff', '🎁'], other: ['Other', '📦'] };
const card = l => `<a class="mk-card" href="#/market/${l.id}"><div class="mk-img">${l.photos?.[0] ? `<img src="${escAttr(l.photos[0])}" alt="" loading="lazy">` : ''}${l.status === 'sold' ? '<i class="mk-sold">Sold</i>' : ''}</div><b>${l.category === 'free' ? 'Free' : money(+l.price, l.currency)}</b><span>${esc(l.title)}</span><small>${esc(l.location || '')}</small></a>`;
export async function viewMarket(query) {
  const p = shell('Marketplace'); p.classList.add('mk-page');
  const cat = query?.get?.('cat') || '', qs = query?.get?.('q') || '', tab = query?.get?.('tab') || 'browse';
  p.innerHTML = `<nav class="social-seg mk-seg"><a href="#/market" ${tab === 'browse' ? 'aria-current="page"' : ''}>Browse</a><a href="#/market?tab=sell" ${tab === 'sell' ? 'aria-current="page"' : ''}>Sell</a><a href="#/market?tab=mine" ${tab === 'mine' ? 'aria-current="page"' : ''}>Your listings</a></nav><div id="mkb"></div>`;
  const b = $('#mkb', p);
  if (tab === 'sell') return sellForm(b);
  if (tab === 'mine') { const d = await api('/market/mine'); b.innerHTML = `<h4 class="nt-h">Selling</h4>${d.selling.map(l => `<div class="mk-mine">${l.photos?.[0] ? `<img src="${escAttr(l.photos[0])}" alt="">` : '<span></span>'}<div class="grow"><b>${esc(l.title)}</b><small>${money(+l.price, l.currency)} · ${l.status === 'unpaid' ? '<b class="warn">Awaiting listing fee</b>' : l.status} · ${l.views} views · ${l.saves} saves</small><div class="row">${l.status === 'unpaid' ? `<button class="btn accent sm" data-pay="${l.id}">Pay $${(+l.fee_usd).toFixed(0)} to publish</button>` : `<button class="btn ghost sm" data-ms="${l.id}" data-v="${l.status === 'sold' ? 'active' : 'sold'}">${l.status === 'sold' ? 'Mark available' : 'Mark sold'}</button>`}<button class="btn ghost sm" data-del="${l.id}">Delete</button></div></div></div>`).join('') || '<p class="muted small">Nothing listed yet.</p>'}<h4 class="nt-h">Saved</h4><div class="mk-grid">${d.saved.map(card).join('') || '<p class="muted small">Tap ♡ on a listing to save it.</p>'}</div>`;
    $$('[data-pay]', b).forEach(x => x.onclick = async () => { const r = await api(`/market/${x.dataset.pay}/pay`, { body: {} }); checkout(r.checkout, () => viewMarket(query)); });
    $$('[data-ms]', b).forEach(x => x.onclick = async () => { await api('/market/' + x.dataset.ms, { method: 'PUT', body: { status: x.dataset.v } }); viewMarket(query); });
    $$('[data-del]', b).forEach(x => x.onclick = async () => { if (!confirm('Delete this listing?')) return; await api('/market/' + x.dataset.del, { method: 'DELETE' }); viewMarket(query); }); return; }
  b.innerHTML = `<form class="mk-search" id="mf"><input class="input" name="q" type="search" placeholder="Search Marketplace" value="${escAttr(qs)}"><button class="iconbtn" type="button" id="mfx" aria-label="Filters">${I.sliders}</button></form>
    <div class="mk-filters" id="mff" hidden><div class="grid2"><input class="input" name="min" type="number" min="0" placeholder="Min price" form="mf"><input class="input" name="max" type="number" min="0" placeholder="Max price" form="mf"></div><div class="grid2"><select class="input" name="cond" form="mf"><option value="">Any condition</option><option value="new">New</option><option value="like-new">Like new</option><option value="good">Good</option><option value="fair">Fair</option></select><select class="input" name="sort" form="mf"><option value="new">Newest</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option></select></div><div class="grid2"><input class="input" name="loc" placeholder="Location" form="mf"><select class="input" name="km" form="mf"><option value="">Any distance</option><option value="5">Within 5 km</option><option value="20">Within 20 km</option><option value="60">Within 60 km</option><option value="200">Within 200 km</option></select></div></div>
    <div class="mk-cats">${Object.entries(CAT).map(([k, [l, e]]) => `<a class="mk-cat ${cat === k ? 'on' : ''}" href="#/market?cat=${cat === k ? '' : k}"><span>${e}</span>${l}</a>`).join('')}</div>
    <h4 class="nt-h">${cat ? CAT[cat][0] : 'Today’s picks'}</h4><div class="mk-grid" id="mg"><div class="loading"><span class="spin"></span></div></div>`;
  $('#mfx', b).onclick = () => { $('#mff', b).hidden = !$('#mff', b).hidden; };
  const load = async () => { const f = $('#mf', b), fd = new FormData(f); const params = new URLSearchParams({ cat, q: fd.get('q') || '', min: fd.get('min') || '', max: fd.get('max') || '', cond: fd.get('cond') || '', sort: fd.get('sort') || 'new', loc: fd.get('loc') || '', km: fd.get('km') || '' });
    if (fd.get('km') && state.user?.settings?.lat) { params.set('lat', state.user.settings.lat); params.set('lng', state.user.settings.lng); }
    const d = await api('/market?' + params); $('#mg', b).innerHTML = d.listings.map(card).join('') || '<p class="muted">No listings yet — be the first to sell something.</p>'; };
  $('#mf', b).onsubmit = e => { e.preventDefault(); load(); }; $$('#mff select,#mff input', b).forEach(x => x.onchange = load); load();
}
async function sellForm(b) {
  const meta = await api('/market/meta'); let photos = [];
  b.innerHTML = `<form class="card mk-sell" id="sf"><h3>Create listing</h3>
    <div class="mk-ph" id="sph"><label class="mk-add">${I.camera}<span>Add photos</span><small>Up to 10</small><input type="file" accept="image/*" multiple hidden id="sfp"></label><label class="mk-add">${I.camera}<span>Take photo</span><small>Camera</small><input type="file" accept="image/*" capture="environment" hidden id="sfc2"></label></div>
    <label class="lbl">Category</label><select class="input" name="category" id="sfc">${meta.categories.map(c => `<option value="${c}">${CAT[c][1]} ${CAT[c][0]}</option>`).join('')}</select>
    <input class="input" name="title" placeholder="Title" required maxlength="100"><div class="grid2"><input class="input" name="price" type="number" min="0" step="0.01" placeholder="Price" id="sfpr"><select class="input" name="currency">${['USD', 'LKR', 'GBP', 'EUR', 'AED', 'SAR', 'PKR', 'INR', 'MYR', 'IDR', 'TRY', 'AUD', 'CAD'].map(c => `<option>${c}</option>`).join('')}</select></div>
    <div id="sfd"></div>
    <select class="input" name="condition"><option value="">Condition</option><option value="new">New</option><option value="like-new">Used – like new</option><option value="good">Used – good</option><option value="fair">Used – fair</option></select>
    <textarea class="input" name="description" rows="4" placeholder="Description" maxlength="5000"></textarea>
    <div class="grid2"><input class="input" name="location" placeholder="Location" maxlength="100"><select class="input" name="delivery"><option value="pickup">Local pickup</option><option value="shipping">Shipping</option><option value="both">Pickup or shipping</option></select></div>
    <div class="mk-fee" id="sff"></div><button class="btn accent block">Publish</button></form>`;
  const f = $('#sf', b);
  const fields = { vehicles: [['make', 'Make'], ['model', 'Model'], ['year', 'Year'], ['mileage', 'Mileage (km)'], ['fuel', 'Fuel'], ['transmission', 'Transmission']], property: [['listingType', 'For sale / For rent'], ['propertyType', 'House, apartment, land…'], ['bedrooms', 'Bedrooms'], ['bathrooms', 'Bathrooms'], ['size', 'Size (sq ft)']], tuition: [['subject', 'Subject (e.g. Maths, Quran, Arabic)'], ['level', 'Level / grade'], ['mode', 'Online / in person'], ['rate', 'Rate (per hour / month)']], services: [['service', 'Service type'], ['area', 'Area served'], ['availability', 'Availability']] };
  const upd = () => { const c = f.category.value, fee = meta.fees[c] ?? meta.fees.other; $('#sfd', b).innerHTML = (fields[c] || []).map(([k, l]) => `<input class="input" data-det="${k}" placeholder="${l}" maxlength="60">`).join('');
    $('#sff', b).innerHTML = fee ? `Listing fee: <b>$${fee}</b> <small>(one-time, paid when you publish)</small>` : 'Free to list'; $('#sfpr', b).disabled = c === 'free'; };
  f.category.onchange = upd; upd();
  const drawPh = () => { $$('.mk-thumb', b).forEach(x => x.remove()); $('#sph', b).insertAdjacentHTML('afterbegin', photos.map((u, i) => `<div class="mk-thumb"><img src="${escAttr(u)}" alt=""><button type="button" data-rmph="${i}">${I.x}</button></div>`).join(''));
    $$('[data-rmph]', b).forEach(x => x.onclick = () => { photos.splice(+x.dataset.rmph, 1); drawPh(); }); };
  $('#sfc2', b).onchange = e => $('#sfp', b).onchange(e);
  $('#sfp', b).onchange = async e => { for (const file of [...e.target.files].slice(0, 10 - photos.length)) { try { photos.push((await uploadFile(file)).url); drawPh(); } catch (er) { toast(er.message); } } };
  f.onsubmit = async e => { e.preventDefault(); const details = {}; $$('[data-det]', b).forEach(i => { if (i.value) details[i.dataset.det] = i.value; });
    const btn = $('button.accent', f); btn.disabled = true;
    try { const r = await api('/market', { body: { title: f.title.value, price: f.price.value, currency: f.currency.value, category: f.category.value, condition: f.condition.value, description: f.description.value, location: f.location.value, delivery: f.delivery.value, photos, details, lat: state.user?.settings?.lat, lng: state.user?.settings?.lng } });
      if (r.checkout) checkout(r.checkout, () => go('/market?tab=mine')); else { toast('Listed!'); go('/market/' + r.id); } } catch (er) { toast(er.message); } btn.disabled = false; };
}
export async function viewListing(id) {
  const p = shell('Marketplace', { back: '/market' }); p.classList.add('mk-page');
  let d; try { d = await api('/market/' + id); } catch (e) { p.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
  const l = d.listing, det = Object.entries(l.details || {});
  p.innerHTML = `<div class="mk-gal">${(l.photos || []).map(u => `<img src="${escAttr(u)}" alt="">`).join('')}</div>${l.photos?.length > 1 ? `<div class="mk-dots">${l.photos.map(() => '<i></i>').join('')}</div>` : ''}
    <h2 class="mk-t">${esc(l.title)}</h2><div class="mk-p">${l.category === 'free' ? 'Free' : money(+l.price, l.currency)}${l.status === 'sold' ? ' <span class="pill">Sold</span>' : ''}</div><small class="muted">Listed ${ago(l.created_at)} ago${l.location ? ' in ' + esc(l.location) : ''}</small>
    ${d.mine ? `<div class="row" style="margin:12px 0"><a class="btn ghost" href="#/market?tab=mine">Manage listing</a></div>` : `<div class="mk-msg"><input class="input" id="lm" value="Hi, is this still available?" maxlength="500"><button class="btn accent" id="lms">Send</button></div>
    <div class="mk-acts"><button data-a="save">${l.saved ? I.heartFill || '♥' : I.heart}<span>Save</span></button><button data-a="share">${I.send}<span>Share</span></button><button data-a="report">${I.flag}<span>Report</span></button></div>`}
    ${det.length ? `<h4 class="nt-h">Details</h4><dl class="mk-det">${det.map(([k, v]) => `<dt>${esc(k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()))}</dt><dd>${esc(v)}</dd>`).join('')}${l.condition ? `<dt>Condition</dt><dd>${esc(l.condition)}</dd>` : ''}<dt>Delivery</dt><dd>${esc(l.delivery)}</dd></dl>` : ''}
    ${l.description ? `<h4 class="nt-h">Description</h4><p class="mk-desc">${esc(l.description)}</p>` : ''}
    ${l.location ? `<a class="btn ghost block" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.location)}">${I.pin || '📍'} View area on map</a>` : ''}
    <h4 class="nt-h">Seller</h4><a class="sx-row" href="${l.username ? '#/u/' + escAttr(l.username) : '#'}">${av({ name: l.seller_name })}<span class="grow"><b>${esc(l.seller_name)}</b><small>Joined ${new Date(l.seller_since).getFullYear()} · ${l.seller_listings} listing${l.seller_listings === 1 ? '' : 's'}</small></span></a>
    <p class="faint small mk-safe">${I.shield || ''} Meet in a public place, inspect before paying, and never send money in advance.</p>
    ${d.similar.length ? `<h4 class="nt-h">Similar listings</h4><div class="mk-grid">${d.similar.map(card).join('')}</div>` : ''}`;
  $('#lms', p)?.addEventListener('click', async () => { try { const r = await api(`/market/${l.id}/message`, { body: { text: $('#lm', p).value } }); go('/messages?id=' + encodeURIComponent(r.conversationId)); } catch (e) { toast(e.message); } });
  $$('[data-a]', p).forEach(b => b.onclick = async () => { const a = b.dataset.a;
    if (a === 'save') { l.saved = !l.saved; await api(`/market/${l.id}/save`, { body: { save: l.saved } }); b.firstChild.outerHTML; toast(l.saved ? 'Saved' : 'Removed'); }
    if (a === 'share') { const url = location.origin + '/#/market/' + l.id; navigator.share ? navigator.share({ title: l.title, url }).catch(() => {}) : (navigator.clipboard?.writeText(url), toast('Link copied')); }
    if (a === 'report') { const reason = prompt('Why are you reporting this listing?'); if (reason) { await api(`/market/${l.id}/report`, { body: { reason } }); toast('Reported. Thank you.'); } } });
}
