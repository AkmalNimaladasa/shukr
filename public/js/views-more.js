// Insights (stats + ML + AI patterns from chats), Ummah (profiles, feed, follow, report, admin), Settings (themes, sections, reminders, prayer)
import { hasMemoryPlan, $, escAttr, $$, esc, LS, I, api, state, toast, vibrate, shell, bindGo, go, sheet, confirmSheet, md, localDay, daysAgo, empty, loadingHTML, askAlim, SECTIONS, saveSettings, refreshDrawer,
  METHODS, guessMethod, locationPatch, TZ, applyPrefs, startNasheed, stopNasheed, canVibrate } from './core.js';
import { catColor } from './views-daily.js';
import { locate } from './views-worship.js';

// ================= INSIGHTS =================
export async function viewInsights() {
  const p = shell('Insights', { right: `<button class="iconbtn" id="iRef" aria-label="Refresh">${I.retry}</button>` });
  p.innerHTML = loadingHTML('Analysing your journey…');
  const s = await api('/stats');
  const st = s.streaks, w = s.week, pw = s.prevWeek;
  const delta = (a, b) => a === b ? '<span class="faint">same</span>' : a > b ? `<span class="up">▲ ${a - b}</span>` : `<span class="down">▼ ${b - a}</span>`;
  const ser = s.series; const W = 320, H = 110;
  const moodPts = ser.map((d, i) => d.mood != null ? [i * (W / (ser.length - 1 || 1)), H - 10 - (d.mood - 1) / 4 * (H - 24)] : null);
  const path = moodPts.reduce((a, pt) => pt ? a + (a && !a.endsWith('M') ? ' L' : 'M') + pt[0].toFixed(1) + ',' + pt[1].toFixed(1) : a, '');
  const maxD = Math.max(1, ...ser.map(d => d.dhikr));
  p.innerHTML = `
    <div class="streaks" style="grid-template-columns:repeat(3,1fr)">${[['journal', 'Journal'], ['morning', 'Morning'], ['evening', 'Evening'], ['prayers', 'All 5 prayers'], ['dhikr', 'Dhikr goal'], ['active', 'Active days']].map(([k, l]) => `<div class="streak ${st[k].doneToday ? 'done' : ''}"><div class="n">${st[k].current}${st[k].current ? I.flame : ''}</div><div class="l">${l}</div><div class="faint" style="font-size:11px">best ${st[k].best}</div></div>`).join('')}</div>
    <div class="card" id="aiCard"><div class="loading"><span class="spin"></span>Alim is reading your patterns…</div></div>
    <div class="card"><div class="card-head"><h3>This week</h3><span class="faint small">vs last week</span></div>
      ${[['journal', 'Journal days'], ['blessings', 'Blessings'], ['morning', 'Morning adhkar'], ['evening', 'Evening adhkar'], ['prayers', 'Prayers logged'], ['dhikr', 'Dhikr']].map(([k, l]) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid var(--border)"><span class="muted">${l}</span><span><b>${w[k].toLocaleString()}</b> <span class="small">${delta(w[k], pw[k])}</span></span></div>`).join('')}</div>
    <div class="card"><div class="card-head"><h3>Mood · 30 days</h3><span class="faint small">${s.moodTrend == null ? '' : s.moodTrend > 0.03 ? '<span class="up">rising</span>' : s.moodTrend < -0.03 ? '<span class="down">falling</span>' : 'steady'}</span></div>
      ${path ? `<svg class="chart" viewBox="0 0 ${W} ${H}"><path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${moodPts.filter(Boolean).map(pt => `<circle cx="${pt[0]}" cy="${pt[1]}" r="3" fill="var(--accent)"/>`).join('')}</svg>` : '<div class="faint small">Pick a mood when you journal to see this chart.</div>'}
      <div class="faint small" style="margin-top:8px">Dhikr per day</div><svg class="chart" viewBox="0 0 ${W} 50">${ser.map((d, i) => `<rect x="${i * (W / ser.length) + 1}" y="${50 - d.dhikr / maxD * 46}" width="${W / ser.length - 2}" height="${d.dhikr / maxD * 46}" rx="2" fill="var(--accent)" opacity="${d.dhikr ? 0.85 : 0}"/>`).join('')}</svg>
      <div class="faint small" style="margin-top:8px">Activity heatmap (last 30 days)</div><div class="heat" style="margin-top:6px">${ser.map(d => { const v = d.journal + d.morning + d.evening + Math.min(1, d.prayers / 5) + (d.dhikr ? 1 : 0); return `<div title="${d.d}" style="background:color-mix(in srgb, var(--accent) ${Math.round(v / 5 * 100)}%, var(--bg-2))"></div>`; }).join('')}</div></div>
    ${s.model ? `<div class="card"><div class="card-head"><h3>What lifts your days</h3><span class="badge gray">ML · ${Math.round(s.model.accuracy * 100)}% acc · n=${s.model.n}</span></div><div class="faint small" style="margin-bottom:8px">A logistic-regression model trained on your own days learns which habits predict a good-mood day.</div>
      ${s.model.weights.map(x => `<div class="bar-row"><span class="lab">${esc(x.feature)}</span><span class="track">${x.weight >= 0 ? `<span class="fill" style="width:${Math.min(100, Math.abs(x.weight) / Math.max(...s.model.weights.map(y => Math.abs(y.weight)), 0.01) * 100)}%"></span>` : `<span class="fill neg" style="width:${Math.min(100, Math.abs(x.weight) / Math.max(...s.model.weights.map(y => Math.abs(y.weight)), 0.01) * 100)}%"></span>`}</span><span class="val">${x.weight > 0 ? '+' : ''}${x.weight}</span></div>`).join('')}</div>`
    : s.correlations.length ? `<div class="card"><h3>Mood correlations</h3>${s.correlations.map(c => `<div class="bar-row"><span class="lab">${esc(c.label)}</span><span class="track"><span class="fill ${c.r < 0 ? 'neg' : ''}" style="width:${Math.abs(c.r) * 100}%"></span></span><span class="val">${c.r}</span></div>`).join('')}</div>` : `<div class="card soft small muted">Log your mood in at least 10 journal entries and the on-device model will learn which habits lift your days.</div>`}
    ${s.categories.length ? `<div class="card"><h3>What you’re grateful for</h3>${s.categories.slice(0, 8).map(c => `<div class="bar-row"><span class="lab"><span class="cat-dot" style="margin:0 6px 0 0;background:${catColor(c.category)}"></span>${esc(c.category)}</span><span class="track"><span class="fill" style="width:${c.count / s.categories[0].count * 100}%;background:${catColor(c.category)}"></span></span><span class="val">${c.count}</span></div>`).join('')}</div>` : ''}
    <div class="card"><h3>Consistency by weekday</h3>${s.weekday.map(x => `<div class="bar-row"><span class="lab">${x.day}</span><span class="track"><span class="fill" style="width:${x.rate * 100}%"></span></span><span class="val">${Math.round(x.rate * 100)}%</span></div>`).join('')}</div>
    ${Object.keys(s.prayerBreakdown).length ? `<div class="card"><h3>Prayers · 30 days</h3>${['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].filter(k => s.prayerBreakdown[k]).map(k => { const b = s.prayerBreakdown[k], t = (b.ontime || 0) + (b.jamaah || 0) + (b.late || 0) + (b.missed || 0) || 1; return `<div class="bar-row"><span class="lab" style="text-transform:capitalize">${k}</span><span class="track"><span class="fill" style="width:${(b.jamaah || 0) / t * 100}%;background:var(--blue);border-radius:0"></span><span class="fill" style="width:${(b.ontime || 0) / t * 100}%;background:var(--green);border-radius:0"></span><span class="fill" style="width:${(b.late || 0) / t * 100}%;background:var(--gold);border-radius:0"></span><span class="fill" style="width:${(b.missed || 0) / t * 100}%;background:var(--danger);border-radius:0"></span></span><span class="val">${Math.round(((b.ontime || 0) + (b.jamaah || 0)) / t * 100)}%</span></div>`; }).join('')}<div class="row wrap small faint" style="gap:10px;margin-top:6px"><span style="color:var(--blue)">■ jama‘ah</span><span style="color:var(--green)">■ on time</span><span style="color:var(--gold)">■ late</span><span style="color:var(--danger)">■ missed</span></div></div>` : ''}
    <div class="card" id="patCard"><div class="card-head"><h3>Your patterns, from your own words</h3></div><div class="loading"><span class="spin"></span>Reading your chats and journal…</div></div>
    <div class="card" id="weekCard"><div class="card-head"><h3>Weekly review</h3><button class="link" id="wGen">Generate</button></div><div class="faint small">A warm summary of your week with three goals for the next.</div></div>
    <div class="grid3" style="margin-bottom:12px"><div class="kpi"><div class="n">${s.totals.entries}</div><div class="l">Journal days</div></div><div class="kpi"><div class="n">${s.totals.blessings}</div><div class="l">Blessings</div></div><div class="kpi"><div class="n">${s.totals.dhikrAll.toLocaleString()}</div><div class="l">Dhikr</div></div></div>`;
  const loadAI = async (refresh) => {
    if (!state.ai) { $('#aiCard').innerHTML = '<div class="faint small">AI insights are not configured.</div>'; return; }
    try { const d = await api('/insights/ai' + (refresh ? '?refresh=1' : '')); if (!$('#aiCard')) return;
      const ic = { pattern: 'chart', win: 'star', nudge: 'bulb', warning: 'alert' };
      $('#aiCard').innerHTML = `<div style="font-family:var(--serif);font-size:19px;line-height:1.35;margin-bottom:6px">${esc(d.headline || '')}</div>${(d.insights || []).map(x => `<div class="insight"><div class="ic">${I[ic[x.type]] || I.sparkle}</div><div><div class="tt">${esc(x.title)}</div><div class="bd">${esc(x.body)}</div></div></div>`).join('')}
        ${d.focus ? `<div class="reflection"><b>Focus for tomorrow:</b> ${esc(d.focus)}</div>` : ''}${d.ayah?.text ? `<div class="faint small" style="margin-top:10px;font-style:italic">“${esc(d.ayah.text)}” — ${esc(d.ayah.ref)}</div>` : ''}
        <button class="btn soft sm" style="margin-top:12px" id="discuss">Discuss with Alim</button>`;
      $('#discuss').onclick = () => askAlim(`Let’s talk about my insights: "${d.headline}". ${d.focus ? 'My focus: ' + d.focus : ''} What should I work on first?`, 'coach');
    } catch (e) { if ($('#aiCard')) $('#aiCard').innerHTML = `<div class="faint small">${esc(e.message)}</div>`; }
  };
  const loadPat = async (refresh) => {
    if (!state.ai) { $('#patCard')?.remove(); return; }
    try { const d = await api('/insights/patterns' + (refresh ? '?refresh=1' : ''));
      const el = $('#patCard'); if (!el) return;
      if (d.empty) { el.innerHTML = `<h3>Your patterns</h3><div class="faint small" style="margin-top:6px">${esc(d.note || 'Chat with Alim and journal for a few days — your personal patterns will appear here.')}</div>`; return; }
      const trendI = t => t === 'rising' ? '<span class="up">▲</span>' : t === 'falling' ? '<span class="down">▼</span>' : '<span class="faint">–</span>';
      el.innerHTML = `<div class="card-head"><h3>Your patterns, from your own words</h3></div><div style="font-family:var(--serif);font-size:16px;line-height:1.55">${esc(d.summary || '')}</div>
        ${d.emotions?.length ? `<div class="faint small" style="margin:12px 0 4px;font-weight:600">Emotional currents</div>${d.emotions.map(e => `<div class="insight"><div class="ic">${I.heart}</div><div><div class="tt">${esc(e.name)} ${trendI(e.trend)}</div>${e.evidence ? `<div class="ev">“${esc(e.evidence)}”</div>` : ''}</div></div>`).join('')}` : ''}
        ${d.triggers?.length ? `<div class="faint small" style="margin:12px 0 4px;font-weight:600">Triggers & effects</div>${d.triggers.map(t => `<div class="insight"><div class="ic">${I.target}</div><div><div class="tt">${esc(t.trigger)}</div><div class="bd">${esc(t.effect)}</div>${t.evidence ? `<div class="ev">“${esc(t.evidence)}”</div>` : ''}</div></div>`).join('')}` : ''}
        ${d.strengths?.length ? `<div class="faint small" style="margin:12px 0 4px;font-weight:600">Strengths</div>${d.strengths.map(t => `<div class="insight"><div class="ic" style="background:var(--green-soft);color:var(--green)">${I.star}</div><div><div class="tt">${esc(t.name)}</div>${t.evidence ? `<div class="ev">“${esc(t.evidence)}”</div>` : ''}</div></div>`).join('')}` : ''}
        ${d.growth_areas?.length ? `<div class="faint small" style="margin:12px 0 4px;font-weight:600">To grow into a better you</div>${d.growth_areas.map(g => `<div class="insight"><div class="ic" style="background:var(--gold-soft);color:var(--gold)">${I.leaf}</div><div><div class="tt">${esc(g.area)}</div><div class="bd">${esc(g.why)}</div>${g.practice ? `<div class="bd" style="margin-top:4px"><b>Practice:</b> ${esc(g.practice)}</div>` : ''}${g.source ? `<div class="faint small">${esc(g.source)}</div>` : ''}</div></div>`).join('')}` : ''}
        ${d.character?.virtue_to_build ? `<div class="reflection"><b>Virtue to build: ${esc(d.character.virtue_to_build)}</b>${(d.character.plan || []).map((x, i) => `<div>${i + 1}. ${esc(x)}</div>`).join('')}</div>` : ''}
        ${d.progress ? `<div class="faint small" style="margin-top:10px">${esc(d.progress)}</div>` : ''}
        <div class="row" style="margin-top:12px"><button class="btn soft sm" id="patTalk">Coach me on this</button><span class="faint small" style="margin-left:auto">Updated ${d.generated ? new Date(d.generated).toLocaleDateString() : ''}</span></div>`;
      $('#patTalk').onclick = () => askAlim(`You analysed my patterns: "${d.summary}". Coach me on the most important growth area — one step at a time.`, 'coach');
    } catch (e) { const el = $('#patCard'); if (el) el.innerHTML = `<h3>Your patterns</h3><div class="faint small">${esc(e.message)}</div>`; }
  };
  loadAI(); loadPat();
  $('#iRef').onclick = () => { $('#aiCard').innerHTML = loadingHTML('Refreshing…'); $('#patCard').innerHTML = loadingHTML('Refreshing…'); loadAI(true); loadPat(true); };
  $('#wGen').onclick = async () => { const el = $('#weekCard'); el.innerHTML = loadingHTML('Writing your weekly review…'); try { const r = await api('/insights/weekly'); el.innerHTML = `<h3>Weekly review</h3><div class="md" style="font-family:var(--serif);margin-top:6px">${md(r.review || '')}</div>`; } catch (e) { el.innerHTML = esc(e.message); } };
}

// ================= UMMAH =================
const KINDS = [['post', 'Post'], ['blessing', 'Blessing'], ['dua', 'Dua request'], ['reminder', 'Reminder'], ['question', 'Question']];
const avatarHTML = (p, cls = '') => `<div class="avatar ${cls}">${p.avatar ? `<img src="${escAttr(p.avatar)}" alt="">` : esc((p.display_name || p.username || '?')[0].toUpperCase())}</div>`;
const ago = t => { const s = (Date.now() - new Date(t)) / 1000; return s < 60 ? 'now' : s < 3600 ? Math.floor(s / 60) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd'; };
export async function viewUmmah(sub) {
  const { profile: me } = await api('/ummah/me');
  if (!me || sub === 'edit') return editProfile(me);
  const p = shell('Ummah', { right: `<button class="iconbtn" id="uSearch" aria-label="Find people">${I.search}</button>` });
  let tab = LS.get('ummahTab', 'all');
  p.innerHTML = `<div class="card" style="padding:12px"><div class="row" style="align-items:flex-start">${avatarHTML(me)}<div class="grow"><textarea class="input" id="pBody" rows="2" placeholder="Share a blessing, a reminder, or ask for dua…" style="min-height:56px;resize:none" maxlength="2000"></textarea>
      <div class="row" style="margin-top:8px"><select class="input" id="pKind" style="width:auto;min-height:36px;padding:6px 10px;font-size:14px">${KINDS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><button class="iconbtn sm" id="pImg" aria-label="Add image">${I.image}</button><span id="pImgN" class="faint small"></span><button class="btn accent sm" id="pPost" style="margin-left:auto">Post</button></div></div></div><input type="file" id="pFile" accept="image/*" hidden></div>
    <div class="um-pulse" id="pulse"></div>
    <div class="seg um-tabs" style="margin-bottom:10px">${[['all', 'Everyone'], ['following', 'Following'], ['duas', 'Dua requests'], ['people', 'People']].map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div id="circle"></div>
    <div id="feed">${loadingHTML()}</div>
    <div class="row" style="justify-content:center;gap:8px;margin:12px 0"><button class="btn ghost sm" data-go="/ummah/u/${esc(me.username)}">${I.user} My profile</button>${state.user.developer ? `<button class="btn ghost sm" data-go="/ummah/admin">${I.shield} Moderation</button>` : ''}</div>
    <div class="faint small" style="text-align:center">Be kind. Posts are checked by AI moderation; report anything harmful.</div>`;
  bindGo(p);
  let img = null;
  $('#pImg').onclick = () => $('#pFile').click();
  $('#pFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; img = await shrink(f, 1100); $('#pImgN').textContent = '1 image'; };
  $('#pPost').onclick = async () => { const body = $('#pBody').value.trim(); if (!body) return toast('Write something first'); const b = $('#pPost'); b.disabled = true;
    try { const r = await api('/ummah/posts', { body: { body, kind: $('#pKind').value, image: img } }); if (r.held) toast(r.message, 4000); else toast('Posted'); $('#pBody').value = ''; img = null; $('#pImgN').textContent = ''; loadFeed(); } catch (e) { toast(e.message); } b.disabled = false; };
  $$('[data-t]', p).forEach(b => b.onclick = () => { tab = b.dataset.t; LS.set('ummahTab', tab); $$('[data-t]', p).forEach(x => x.classList.toggle('on', x === b)); loadFeed(); });
  $('#uSearch').onclick = () => sheet(`<h3>Find people</h3><input class="input" id="us" placeholder="Username or name" type="search"><div id="ur" style="margin-top:8px"></div>`, (sh, close) => {
    let t = null; $('#us', sh).oninput = e => { clearTimeout(t); t = setTimeout(async () => { const { users } = await api('/ummah/search?q=' + encodeURIComponent(e.target.value)); $('#ur', sh).innerHTML = users.map(u => `<div class="list-item tap" data-u="${escAttr(u.username)}">${avatarHTML(u)}<div class="grow"><b>${esc(u.display_name || u.username)}</b><div class="faint small">@${esc(u.username)}</div></div></div>`).join('') || '<div class="faint small">No one found</div>'; $$('[data-u]', sh).forEach(x => x.onclick = () => { close(); go('/ummah/u/' + x.dataset.u); }); }, 250); };
  });
  let people = null;
  const getPeople = async (fresh) => (people && !fresh) ? people : (people = await api('/ummah/people'));
  const personRow = u => `<div class="um-person" data-u="${escAttr(u.username)}">${avatarHTML(u)}<div class="grow"><b>${esc(u.display_name || u.username)}</b><small>@${esc(u.username)}${u.follows_you ? ' · <span class="um-mutual">Follows you</span>' : ''}</small>${u.bio ? `<span class="um-bio">${esc(u.bio.slice(0, 80))}</span>` : ''}</div><button class="btn sm ${u.is_following ? 'ghost' : 'accent'}" data-fol="${escAttr(u.username)}">${u.is_following ? 'Following' : u.follows_you ? 'Follow back' : 'Follow'}</button></div>`;
  const bindPeople = box => {
    $$('[data-u]', box).forEach(b => b.onclick = e => { if (e.target.closest('[data-fol]')) return; go('/ummah/u/' + b.dataset.u); });
    $$('[data-fol]', box).forEach(b => b.onclick = async e => { e.stopPropagation(); b.disabled = true; try { const r = await api('/ummah/follow/' + b.dataset.fol, { body: {} }); b.textContent = r.following ? 'Following' : 'Follow'; b.className = 'btn sm ' + (r.following ? 'ghost' : 'accent'); people = null; if (r.following) toast('Following @' + b.dataset.fol); } catch (er) { toast(er.message); } b.disabled = false; });
  };
  async function loadCircle() {
    const box = $('#circle'); if (!box) return; box.innerHTML = '';
    if (tab !== 'following') return;
    const d = await getPeople(); if (!$('#circle')) return;
    box.innerHTML = `<div class="um-circle"><div class="row between"><b>Your circle · ${d.following.length}</b><button class="link small" data-allfol>See all</button></div>
      ${d.following.length ? `<div class="um-stories">${d.following.slice(0, 20).map(u => `<button class="um-story ${u.last_post && Date.now() - new Date(u.last_post) < 864e5 ? 'fresh' : ''}" data-u="${escAttr(u.username)}">${avatarHTML(u)}<span>${esc((u.display_name || u.username).split(' ')[0])}</span></button>`).join('')}</div>` : `<p class="muted small" style="margin:6px 0 0">You’re not following anyone yet. Follow brothers and sisters below to fill your feed with their blessings and duas.</p>`}</div>
      ${d.suggested.length ? `<div class="um-suggest"><b>People to follow</b><div class="um-cards">${d.suggested.slice(0, 10).map(u => `<div class="um-card" data-u="${escAttr(u.username)}">${avatarHTML(u, 'lg')}<b>${esc(u.display_name || u.username)}</b><small>${u.followers} followers</small><button class="btn sm accent" data-fol="${escAttr(u.username)}">Follow</button></div>`).join('')}</div></div>` : ''}`;
    bindPeople(box);
    $('[data-allfol]', box).onclick = () => { tab = 'people'; LS.set('ummahTab', tab); $$('[data-t]', p).forEach(x => x.classList.toggle('on', x.dataset.t === 'people')); loadFeed(); };
  }
  async function loadPeople() {
    const d = await getPeople(true); const el = $('#feed'); if (!el) return;
    let sub = LS.get('ummahPeople', 'following');
    const draw = () => { const list = d[sub] || []; el.innerHTML = `<div class="seg sm" style="margin-bottom:8px">${[['following', `Following ${d.following.length}`], ['followers', `Followers ${d.followers.length}`], ['suggested', 'Suggested']].map(([k, l]) => `<button data-ps="${k}" class="${sub === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${list.length ? `<div class="um-list">${list.map(personRow).join('')}</div>` : empty('users', sub === 'following' ? 'You’re not following anyone yet. Check Suggested to find people.' : sub === 'followers' ? 'No followers yet. Share a blessing to start connecting.' : 'No suggestions right now.')}`;
      $$('[data-ps]', el).forEach(b => b.onclick = () => { sub = b.dataset.ps; LS.set('ummahPeople', sub); draw(); }); bindPeople(el); };
    draw();
  }
  async function loadFeed() {
    loadCircle();
    if (tab === 'people') { $('#feed').innerHTML = loadingHTML(); return loadPeople(); }
    const { posts } = await api('/ummah/feed?tab=' + tab); if ($('#feed')) renderPosts($('#feed'), posts, me, loadFeed);
  }
  api('/ummah/pulse').then(d => { const el = $('#pulse'); if (!el) return; const pl = (n, a, b) => `<div><b>${n.toLocaleString()}</b><span>${n === 1 ? a : b}</span></div>`; el.innerHTML = pl(d.members, 'member', 'members') + pl(d.posts_today, 'shared today', 'shared today') + pl(d.duas_week, 'dua made this week', 'duas made this week') + pl(d.open_duas, 'asking for dua', 'asking for dua'); }).catch(() => {});
  loadFeed();
}
function renderPosts(el, posts, me, reload) {
  el.innerHTML = posts.length ? posts.map(x => `<div class="post" data-id="${x.id}"><div class="ph"><span data-u="${escAttr(x.username)}" style="cursor:pointer">${avatarHTML(x)}</span><div class="who" data-u="${escAttr(x.username)}"><b>${esc(x.display_name || x.username)}</b> <span>@${esc(x.username)} · ${ago(x.created_at)}</span></div>${x.kind !== 'post' ? `<span class="kind-tag">${esc(KINDS.find(k => k[0] === x.kind)?.[1] || x.kind)}</span>` : ''}<button class="iconbtn sm" data-more="${x.id}" aria-label="More">${I.more}</button></div>
    <div class="pb">${esc(x.body)}</div>${x.image ? `<img class="pimg" src="${escAttr(x.image)}" alt="" loading="lazy">` : ''}
    <div class="pa"><button data-like="${x.id}" class="${x.liked ? 'on' : ''}">${x.liked ? I.heartFill : I.heart}<span>${x.likes || ''}</span></button>${x.kind === 'dua' ? `<button data-dua="${x.id}" class="${x.duad ? 'on' : ''}">${I.hands}<span>${x.duad ? 'Made dua' : 'Ameen'} · ${x.dua_count || 0}</span></button>` : ''}<button data-com="${x.id}">${I.chat}<span>${x.comments || ''}</span></button></div><div class="comments" id="c${x.id}"></div></div>`).join('')
    : empty('users', 'No posts yet. Be the first to share a blessing!');
  $$('[data-u]', el).forEach(b => b.onclick = () => go('/ummah/u/' + b.dataset.u));
  $$('[data-like]', el).forEach(b => b.onclick = async () => { try { const r = await api(`/ummah/posts/${b.dataset.like}/react`, { body: { kind: 'like' } }); const n = +(b.querySelector('span').textContent || 0) + (r.on ? 1 : -1); b.classList.toggle('on', r.on); b.innerHTML = (r.on ? I.heartFill : I.heart) + `<span>${n || ''}</span>`; vibrate(10); } catch (e) { toast(e.message); } });
  $$('[data-dua]', el).forEach(b => b.onclick = async () => { if (b.classList.contains('on')) return; try { await api(`/ummah/posts/${b.dataset.dua}/react`, { body: { kind: 'dua' } }); b.classList.add('on'); const n = +(b.textContent.match(/\d+/) || [0])[0] + 1; b.innerHTML = `${I.hands}<span>Made dua · ${n}</span>`; vibrate(15); toast('May Allah answer it — Ameen'); } catch (e) { toast(e.message); } });
  $$('[data-com]', el).forEach(b => b.onclick = async () => { const id = b.dataset.com, box = $('#c' + id); if (box.innerHTML) { box.innerHTML = ''; return; }
    const draw = async () => { const { comments } = await api(`/ummah/posts/${id}/comments`); box.innerHTML = `<div style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px">${comments.map(c => `<div class="row" style="align-items:flex-start;margin:6px 0">${avatarHTML(c)}<div class="grow" style="font-size:14.5px"><b>${esc(c.display_name || c.username)}</b> <span class="faint small">${ago(c.created_at)}</span><div>${esc(c.body)}</div></div></div>`).join('')}
      <form class="row" style="margin-top:6px"><input class="input" placeholder="Write a comment…" maxlength="800" style="min-height:40px;padding:8px 12px"><button class="btn accent sm">Send</button></form></div>`;
      $('form', box).onsubmit = async e => { e.preventDefault(); const v = $('input', box).value.trim(); if (!v) return; try { const r = await api(`/ummah/posts/${id}/comments`, { body: { body: v } }); if (r.held) toast(r.message, 4000); draw(); } catch (er) { toast(er.message); } }; };
    draw(); });
  $$('[data-more]', el).forEach(b => b.onclick = () => { const x = posts.find(y => y.id == b.dataset.more); const mine = me && x.user_id === me.user_id; const admin = me?.is_admin || state.user.isAdmin;
    sheet(`<h3>Post</h3>${mine || admin ? `<button class="opt" id="pDel" style="color:var(--danger)"><span class="e" style="color:var(--danger)">${I.trash}</span><div>Delete post</div></button>` : ''}
      ${!mine ? `<button class="opt" id="pRep"><span class="e">${I.flag}</span><div>Report post</div></button><button class="opt" id="pBlk"><span class="e">${I.block}</span><div>Block @${esc(x.username)}</div></button>` : ''}
      <button class="opt" id="pCopy"><span class="e">${I.copy}</span><div>Copy text</div></button>`, (sh, close) => {
      $('#pDel', sh) && ($('#pDel', sh).onclick = async () => { close(); await api('/ummah/posts/' + x.id, { method: 'DELETE' }); toast('Deleted'); reload(); });
      $('#pRep', sh) && ($('#pRep', sh).onclick = async () => { close(); const reason = prompt('Why are you reporting this post?') || ''; await api('/ummah/report', { body: { kind: 'post', id: x.id, reason } }); toast('Reported — thank you'); });
      $('#pBlk', sh) && ($('#pBlk', sh).onclick = async () => { close(); if (await confirmSheet('Block @' + x.username + '?', 'You won’t see each other’s posts.', 'Block', true)) { await api('/ummah/block/' + x.username, { body: {} }); reload(); } });
      $('#pCopy', sh).onclick = async () => { close(); try { await navigator.clipboard.writeText(x.body); toast('Copied'); } catch {} };
    }); });
}
async function shrink(f, max) { const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); }); const img = new Image(); img.src = url; await img.decode().catch(() => {}); const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.8); }
function editProfile(me) {
  const p = shell(me ? 'Edit profile' : 'Join the Ummah', { back: me ? '/ummah' : null }); let avatar = null;
  p.innerHTML = `${!me ? `<div class="sub" style="margin-top:10px">Connect with Muslims around the world: share blessings, ask for dua, and remind each other of good. Choose a username to begin.</div>` : ''}
    <div style="text-align:center;margin:12px 0"><div id="avPrev" style="display:inline-block">${avatarHTML(me || { username: state.user.name || '?' }, 'lg')}</div><div><button class="link" id="avBtn">Change photo</button></div><input type="file" id="avIn" accept="image/*" hidden></div>
    <label class="lbl">Username</label><input class="input" id="un" value="${escAttr(me?.username || '')}" placeholder="e.g. akmal_n" autocapitalize="off" maxlength="20">
    <label class="lbl">Display name</label><input class="input" id="dn" value="${escAttr(me?.display_name || state.user.name || '')}" maxlength="50">
    <label class="lbl">Bio</label><textarea class="input" id="bio" rows="3" maxlength="300" style="min-height:80px">${esc(me?.bio || '')}</textarea>
    <label class="lbl">Location (optional)</label><input class="input" id="loc" value="${escAttr(me?.location || '')}" maxlength="60">
    <div class="list-item"><div class="grow">Private profile<div class="faint small">Only followers see your posts</div></div><label class="toggle"><input type="checkbox" id="pv" ${me?.private ? 'checked' : ''}><span></span></label></div>
    <button class="btn accent block" id="save" style="margin-top:14px">${me ? 'Save' : 'Create profile'}</button><div class="err" id="err"></div>`;
  $('#avBtn').onclick = () => $('#avIn').click();
  $('#avIn').onchange = async e => { const f = e.target.files[0]; if (!f) return; avatar = await shrink(f, 256); $('#avPrev').innerHTML = `<div class="avatar lg"><img src="${avatar}" alt=""></div>`; };
  $('#save').onclick = async () => { try { await api('/ummah/profile', { body: { username: $('#un').value.trim(), display_name: $('#dn').value.trim(), bio: $('#bio').value.trim(), location: $('#loc').value.trim(), private: $('#pv').checked, avatar } }); toast('Profile saved'); go('/ummah'); } catch (e) { $('#err').textContent = e.message; } };
}
export async function viewUmmahUser(username) {
  const p = shell('@' + esc(username), { back: '/ummah' }); p.innerHTML = loadingHTML();
  try {
    const [{ profile: u }, { profile: me }, { posts }] = await Promise.all([api('/ummah/users/' + encodeURIComponent(username)), api('/ummah/me'), api('/ummah/feed?user=' + encodeURIComponent(username))]);
    p.innerHTML = `<div style="text-align:center;padding:14px 0">${avatarHTML(u, 'lg').replace('class="avatar lg"', 'class="avatar lg" style="margin:0 auto"')}<div style="font-family:var(--serif);font-size:22px;margin-top:8px">${esc(u.display_name || u.username)}</div><div class="faint">@${esc(u.username)}${u.location ? ' · ' + esc(u.location) : ''}</div>
      ${u.bio ? `<div style="margin:10px auto;max-width:420px">${esc(u.bio)}</div>` : ''}<div class="row" style="justify-content:center;gap:22px;margin:10px 0"><div><b>${u.posts}</b> <span class="faint small">posts</span></div><div><b id="fc">${u.followers}</b> <span class="faint small">followers</span></div><div><b>${u.following}</b> <span class="faint small">following</span></div></div>
      ${u.me ? `<button class="btn ghost sm" data-go="/ummah/edit">Edit profile</button>` : `<button class="btn ${u.is_following ? 'ghost' : 'accent'} sm" id="fol">${u.is_following ? 'Following' : 'Follow'}</button>`}</div><div id="up"></div>`;
    bindGo(p); renderPosts($('#up'), posts, me, () => viewUmmahUser(username));
    $('#fol')?.addEventListener('click', async () => { try { const r = await api('/ummah/follow/' + username, { body: {} }); $('#fol').textContent = r.following ? 'Following' : 'Follow'; $('#fol').className = 'btn sm ' + (r.following ? 'ghost' : 'accent'); $('#fc').textContent = +$('#fc').textContent + (r.following ? 1 : -1); } catch (e) { toast(e.message); } });
  } catch (e) { p.innerHTML = empty('user', esc(e.message)); }
}
export async function viewUmmahAdmin() {
  const p = shell('Moderation', { back: '/ummah' }); p.innerHTML = loadingHTML();
  try {
    const d = await api('/ummah/admin/queue');
    p.innerHTML = `<h3 style="margin:10px 0 6px;font-size:17px">Held posts (${d.held.length})</h3>${d.held.map(x => `<div class="post"><div class="faint small">@${esc(x.username)} · ${esc(x.mod_reason || '')}</div><div class="pb">${esc(x.body)}</div><div class="row" style="margin-top:8px"><button class="btn accent sm" data-a="approve|post|${x.id}">Approve</button><button class="btn danger sm" data-a="remove|post|${x.id}">Remove</button><button class="btn ghost sm" data-ban="${escAttr(x.username)}">Ban user</button></div></div>`).join('') || '<div class="faint small">None</div>'}
      <h3 style="margin:14px 0 6px;font-size:17px">Held comments (${d.heldComments.length})</h3>${d.heldComments.map(x => `<div class="post"><div class="faint small">@${esc(x.username)}</div><div class="pb">${esc(x.body)}</div><div class="row" style="margin-top:8px"><button class="btn accent sm" data-a="approve|comment|${x.id}">Approve</button><button class="btn danger sm" data-a="remove|comment|${x.id}">Remove</button></div></div>`).join('') || '<div class="faint small">None</div>'}
      <h3 style="margin:14px 0 6px;font-size:17px">Reports (${d.reports.length})</h3>${d.reports.map(x => `<div class="post"><div class="faint small">${esc(x.target_kind)} #${x.target_id} · by @${esc(x.reporter || '?')}</div><div class="pb">${esc(x.reason || '(no reason)')}</div><div class="row" style="margin-top:8px">${x.target_kind === 'post' ? `<button class="btn danger sm" data-a="remove|post|${x.target_id}">Remove post</button>` : ''}<button class="btn ghost sm" data-a="resolve|report|${x.id}">Dismiss</button></div></div>`).join('') || '<div class="faint small">None</div>'}`;
    $$('[data-a]', p).forEach(b => b.onclick = async () => { const [action, kind, id] = b.dataset.a.split('|'); await api('/ummah/admin/action', { body: { action, kind, id: +id } }); toast('Done'); viewUmmahAdmin(); });
    $$('[data-ban]', p).forEach(b => b.onclick = async () => { if (await confirmSheet('Ban @' + b.dataset.ban + '?', 'They will no longer be able to post or comment.', 'Ban', true)) { await api('/ummah/admin/action', { body: { action: 'ban', username: b.dataset.ban } }); viewUmmahAdmin(); } });
  } catch (e) { p.innerHTML = empty('shield', esc(e.message)); }
}

// ================= SETTINGS =================
const PALETTES = [['cream', 'Shukr', '#E3164E', '#FF6B3D'], ['emerald', 'Zamzam', '#00866F', '#1CC9A6'], ['sand', 'Saffron', '#D9480F', '#FFB000'], ['ocean', 'Midnight', '#2747E8', '#00B4F0'], ['rose', 'Orchid', '#C2129A', '#7B2CF0'], ['contrast', 'High contrast', '#000000', '#B0002E']];
export function pushTestMessage(sent) {
  return Number.isInteger(sent) && sent > 0
    ? `Accepted for ${sent} device${sent === 1 ? '' : 's'} by the push service. Phone delivery and sound are not confirmed — check your notifications.`
    : 'No notification sent. Enable notifications on this device, then try again.';
}
export async function viewSettings() {
  const p = shell('Settings'); const s = state.user.settings; const r = s.reminders || {};
  const tog = (id, on, label, sub = '') => `<div class="list-item"><div class="grow">${label}${sub ? `<div class="faint small">${sub}</div>` : ''}</div><label class="toggle"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span></span></label></div>`;
  const allSections = SECTIONS.flatMap(g => g.items).filter(i => i[3]);
  const pushOn = 'serviceWorker' in navigator && 'PushManager' in window;
  const subNow = pushOn ? await Promise.race([navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription()), new Promise(resolve => setTimeout(() => resolve(null), 2000))]).catch(() => null) : null;
  const permission = typeof Notification === 'undefined' ? 'unavailable' : Notification.permission;
  const pushStatus = permission === 'denied' ? 'Blocked. Allow notifications in browser site settings and phone Settings → Notifications → Shukr, then reopen the app.' : !pushOn ? 'Unavailable here. On iPhone (iOS 16.4+): Safari → Share → Add to Home Screen, then open Shukr from its icon.' : subNow ? 'Subscribed on this device. Delivery depends on browser, network and phone settings.' : 'Not enabled on this device. Tap Enable notifications below.';
  p.innerHTML = `
    <div class="card soft" style="border:1px solid var(--accent)"><h3>Gratitude notifications</h3>
      <div class="small muted">Pause, remember Allah’s gifts, and say Alhamdulillah. Receive a blessing from your journal; before your first entry, receive a Quran-based gratitude prompt.</div>
      <div class="small" id="pushState" role="status" style="margin:10px 0">${esc(pushStatus)}</div>
      <div class="row wrap" style="gap:8px">${pushOn ? `<button class="btn ${subNow ? 'ghost' : 'accent'} sm" id="pushBtn">${subNow ? 'Disable notifications' : 'Enable notifications'}</button>` : ''}<button class="btn ghost sm" data-test="blessing">Test gratitude notification</button></div>
      <div id="pushTestResult" class="small muted" role="status" aria-live="polite" style="margin-top:8px"></div>
      ${tog('r_blessings', r.blessings !== false, 'Gratitude reminders', 'Your schedule is saved separately from device notification permission.')}
      <div class="small faint">Choose 1–5 distinct times in your saved timezone: ${esc(s.tz || TZ)}. Save after changing the schedule.</div>
      <div class="row wrap" style="gap:6px;margin-top:8px">${Array.from({length:5}, (_, i) => `<input class="input" type="time" data-blessing-time aria-label="Gratitude reminder time ${i + 1}" value="${escAttr((r.blessingTimes || ['13:00'])[i] || '')}" style="width:125px;min-height:38px;padding:6px 10px">`).join('')}</div>
      <button class="btn soft sm" id="saveBlessingTimes" style="margin-top:8px">Save gratitude schedule</button><div class="small" id="blessingScheduleStatus" role="status"></div>
      <div class="faint small" style="margin-top:10px">On iPhone: use iOS 16.4+ and open the installed Home Screen app before enabling. If blocked, allow notifications in browser site settings and phone Settings → Notifications → Shukr. Notification sound, no adhan. Sound is controlled by your phone’s notification, mute and Focus settings; Shukr cannot force it.</div>
    </div>
    <div class="card"><h3>Language</h3><div class="list-item"><div class="grow">App language<div class="faint small">Menus and buttons. Quran, du’a and posts stay in their original language.</div></div><button class="btn ghost sm" id="langBtn">${I.globe || ''} <span id="langName">English</span></button></div></div>
    <div class="card"><h3>Appearance</h3>
      <label class="lbl">Mode</label><div class="seg" id="themeSeg">${[['auto', 'Auto (match phone)'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button data-th="${k}" class="${(s.theme || 'aight') === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <label class="lbl">Theme</label><div class="grid3" id="palGrid">${PALETTES.map(([k, l, bg, ac]) => `<button data-pal="${k}" class="kpi" style="text-align:left;${(s.palette || 'cream') === k ? 'border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft)' : ''}"><div style="display:flex;gap:4px;margin-bottom:6px"><span style="width:38px;height:18px;border-radius:999px;background:linear-gradient(118deg,${bg},${ac})"></span></div><div style="font-size:13px">${l}</div></button>`).join('')}</div>
      <label class="lbl">Arabic text size</label><input type="range" id="arSize" min="20" max="44" value="${s.arabicSize || 28}" style="width:100%"><div class="ar" id="arPrev" style="font-size:${s.arabicSize || 28}px">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>
      ${tog('showTl', s.showTranslit !== false, 'Show transliteration in adhkar')}
      ${tog('haptics', s.haptics !== false, 'Vibration on taps', canVibrate() ? 'Dhikr, adhkar and buttons buzz' : 'This browser can’t vibrate (iPhone); a soft tick sound is used instead')}
    </div>
    <div class="card"><h3>Background nasheed</h3>
      ${tog('nasheed', s.nasheed !== false && !LS.get('nasheedMuted', false), 'Play a soft nasheed when the app opens', '“Alhamdulillah” (vocals only) by Jawad Syed · CC BY 3.0')}
      <label class="lbl">Volume</label><input type="range" id="nVol" min="0.05" max="0.8" step="0.05" value="${s.nasheedVolume ?? 0.25}" style="width:100%"></div>
    <div class="card"><h3>Sections</h3><div class="faint small">Show or hide sections in the menu.</div>${allSections.map(([path, l, ic, k]) => tog('sec_' + k, s.sections?.[k] !== false, l)).join('')}</div>
    <div class="card"><h3>Prayer times</h3>
      <label class="lbl">Location</label><div class="row"><input class="input" id="cityQ" placeholder="Search city" value="${escAttr(s.city || '')}"><button class="btn ghost sm" id="gps" aria-label="Use my location">${I.pin}</button></div><div id="cityR"></div>
      <label class="lbl">Calculation method (fallback)</label><select class="input" id="method">${Object.entries(METHODS).map(([k, l]) => `<option value="${k}" ${s.method === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <div id="customM" ${s.method === 'Custom' ? '' : 'hidden'}><label class="lbl">Custom angles</label><div class="grid3">
        <div><div class="faint small">Fajr °</div><input class="input" type="number" step="0.1" data-cu="fajr" value="${s.custom?.fajr ?? 18}"></div>
        <div><div class="faint small">Isha °</div><input class="input" type="number" step="0.1" data-cu="isha" value="${s.custom?.isha ?? 17}"></div>
        <div><div class="faint small">or Isha min after Maghrib</div><input class="input" type="number" data-cu="ishaMin" value="${s.custom?.ishaMin ?? ''}" placeholder="—"></div>
        <div><div class="faint small">Maghrib ° (Shia, optional)</div><input class="input" type="number" step="0.1" data-cu="maghrib" value="${s.custom?.maghrib ?? ''}" placeholder="0"></div></div></div>
      <div id="shafaqW" ${s.method === 'MoonsightingCommittee' ? '' : 'hidden'}><label class="lbl">Isha twilight (Moonsighting)</label><div class="seg">${[['General', 'General'], ['Ahmer', 'Red (Ahmer)'], ['Abyad', 'White (Abyad)']].map(([k, l]) => `<button data-sh="${k}" class="${(s.shafaq || 'General') === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <label class="lbl">High-latitude rule</label><select class="input" id="highLat">${[['auto', 'Automatic (recommended)'], ['MiddleOfTheNight', 'Middle of the night'], ['SeventhOfTheNight', 'One-seventh of the night'], ['TwilightAngle', 'Angle-based (twilight angle)']].map(([k, l]) => `<option value="${k}" ${(s.highLat || 'auto') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <label class="lbl">Asr</label><div class="seg">${[['Shafi', 'Standard (Shafi‘i, Maliki, Hanbali)'], ['Hanafi', 'Hanafi']].map(([k, l]) => `<button data-mad="${k}" class="${(s.madhab || 'Shafi') === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <label class="lbl">Adjust minutes (to match your mosque)</label><div class="grid3">${['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].map(k => `<div><div class="faint small" style="text-transform:capitalize">${k}</div><input class="input" type="number" inputmode="numeric" data-adj="${k}" value="${s.adjust?.[k] || 0}" style="min-height:40px;padding:8px"></div>`).join('')}</div>
      <label class="lbl">Hijri date adjustment</label><div class="seg">${[-2, -1, 0, 1, 2].map(n => `<button data-hj="${n}" class="${(s.hijriAdj || 0) === n ? 'on' : ''}">${n > 0 ? '+' + n : n}</button>`).join('')}</div></div>
    <div class="card"><h3>Reminders & notifications</h3>
      <div class="row wrap" style="gap:6px;margin:8px 0"><button class="btn ghost sm" data-test="prayer">Test prayer notification</button><button class="btn ghost sm" data-test="akhirah">Test akhirah</button></div>
      <div class="faint small" style="margin:6px 0 2px;font-weight:600">Prayer times · adhan sound is set on <a href="#/prayer">Prayer times</a></div>
      ${tog('r_prayers', r.prayers !== false, 'Prayer time notifications')}
      <div class="chips wrap">${['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].map(k => `<button class="chip ${r.prayerList?.[k] !== false ? 'on' : ''}" data-pl="${k}" style="text-transform:capitalize">${k}</button>`).join('')}</div>
      <a class="list-item" href="#/prayer"><div class="grow">Adhan sound per prayer<div class="faint small">${esc(({ adhan: 'Adhan', sound: 'Notification tone', silent: 'Silent' })[r.adhanMode || 'sound'])}</div></div>${I.fwd || '›'}</a>
      ${tog('r_iqamah', !!r.iqamah, 'Jamaah reminder', 'Time to head to the masjid, after each adhan')}
      <div class="seg sm" id="iqW" ${r.iqamah ? '' : 'hidden'}>${[5, 10, 15, 20].map(n => `<button data-iq="${n}" class="${(r.iqamahAfter || 10) === n ? 'on' : ''}">${n} min after</button>`).join('')}</div>
      ${tog('r_missed', !!r.missed, 'Missed-prayer check', '30 min before a prayer time ends, if not marked')}
      ${tog('r_sunrise', r.sunrise !== false, 'Sunrise warning', '10 minutes before Fajr time ends')}
      ${tog('r_duha', !!r.duha, 'Duha prayer', 'Mid-morning, well after sunrise')}
      ${tog('r_tahajjud', !!r.tahajjud, 'Tahajjud', 'At the start of the last third of the night')}
      ${tog('r_fastMonThu', !!r.fastMonThu, 'Monday & Thursday fasts', 'Reminder the evening before + suhoor before Fajr')}
      <label class="lbl">Notify before prayer</label><div class="seg">${[0, 5, 10, 15].map(n => `<button data-pre="${n}" class="${(r.preAdhanMin || 0) === n ? 'on' : ''}">${n ? n + ' min' : 'At time'}</button>`).join('')}</div>
      ${tog('r_journal', r.journal !== false, 'Daily journal reminder')}<div class="row"><span class="small muted grow">Time</span><input class="input" type="time" id="jt" value="${r.journalTime || '21:00'}" style="width:auto;min-height:38px;padding:6px 10px"></div>
      ${tog('r_streak', r.streak !== false, 'Warn me when a streak is at risk')}
      <div class="faint small" style="margin:12px 0 2px;font-weight:600">Jummah & mosques</div>
      
      ${tog('r_kahfThu', r.kahfThu !== false, 'Thursday night: Surah al-Kahf', 'At Maghrib on Thursday')}
      ${tog('r_fridayHour', r.fridayHour !== false, 'Last hour of Friday', 'Hour of accepted dua, before Maghrib')}
      ${tog('r_mosqueUpdates', r.mosqueUpdates !== false, 'My mosques’ updates', 'When a mosque you follow changes its Jummah info')}
      <a class="list-item" href="#/jummah"><div class="grow">Jummah settings & sunnahs</div>${I.fwd || '›'}</a>
      <div class="faint small" style="margin:12px 0 2px;font-weight:600">Islamic calendar</div>
      ${tog('r_events', r.events !== false, 'Special days', 'Ramadan, Eid, ‘Arafah, ‘Ashura, white days, new year — the evening before')}
      <div class="faint small" style="margin:12px 0 2px;font-weight:600">Quiet hours</div>
      ${tog('r_quietOn', !!r.quietOn, 'Pause non-prayer notifications at night', 'Adhan and prayer alerts still come through')}
      <div class="row" id="qW" ${r.quietOn ? '' : 'hidden'} style="gap:8px"><span class="small muted grow">From</span><input class="input" type="time" id="qf" value="${r.quietFrom || '23:00'}" style="width:auto;min-height:38px;padding:6px 10px"><span class="small muted">to</span><input class="input" type="time" id="qt" value="${r.quietTo || '05:00'}" style="width:auto;min-height:38px;padding:6px 10px"></div>
      <div class="faint small" style="margin:12px 0 2px;font-weight:600">Remembrance</div>
      ${tog('r_morning', r.morning !== false, 'Morning adhkar (after Fajr)')}${tog('r_evening', r.evening !== false, 'Evening adhkar (after Asr)')}${tog('r_sleep', !!r.sleep, 'Before-sleep adhkar')}${tog('r_friday', r.friday !== false, 'Jumu‘ah: Surah al-Kahf & salawat')}${tog('r_jummah', r.jummah !== false, 'Jummah alert', 'Closest mosques, khutbah times & languages')}
      <div class="faint small" style="margin:12px 0 2px;font-weight:600">The Hereafter</div>
      ${tog('r_akhirah', r.akhirah !== false, 'Reminders of the grave, Qiyamah, Sirat, Jannah & Jahannam')}
      <div class="chips wrap">${[['qabr', 'Grave'], ['qiyamah', 'Qiyamah'], ['sirat', 'Sirat'], ['jannah', 'Jannah'], ['jahannam', 'Jahannam']].map(([k, l]) => `<button class="chip ${s.akhirahTopics?.[k] !== false ? 'on' : ''}" data-ak="${k}">${l}</button>`).join('')}</div>
      <div class="row"><span class="small muted grow">Time</span><input class="input" type="time" id="akt" value="${(r.akhirahTimes || ['20:00'])[0]}" style="width:auto;min-height:38px;padding:6px 10px"></div>
      <div class="faint small" style="margin:12px 0 2px;font-weight:600">Quran</div>
      ${tog('r_quran', r.quran !== false, 'Daily Quran goal reminder')}${tog('r_hifz', r.hifz !== false, 'Hifz reviews due')}
    </div>
    <div class="card"><h3>Alim</h3>
      <label class="lbl">Coaching tone</label><div class="seg">${[['gentle', 'Gentle'], ['balanced', 'Balanced'], ['direct', 'Direct']].map(([k, l]) => `<button data-tone="${k}" class="${(s.coachTone || 'gentle') === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <label class="lbl">Voice</label><select class="input" id="voice">${['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].map(v => `<option ${s.alimVoice === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
      ${tog('deep', !!s.alimDeep, 'Deep thinking by default', 'Longer, more thorough answers')}
      <label class="lbl">Daily dhikr goal</label><input class="input" type="number" id="dgoal" value="${s.dhikrGoal || 100}" inputmode="numeric">
      <button class="btn ghost block" data-go="/memory" style="margin-top:12px">${I.layers} ${hasMemoryPlan() ? 'Manage Alim’s memory' : 'Alim’s memory 🔒 Premium'}</button></div>
    <div class="card"><h3>Account</h3><label class="lbl">Name</label><input class="input" id="nm" value="${escAttr(state.user.name || '')}"><div class="faint small" style="margin-top:6px">${esc(state.user.email)}</div>
      <div class="row" style="margin-top:12px"><a class="btn ghost grow" href="/api/export" download>${I.download} Export data</a><button class="btn ghost grow" id="logout">Sign out</button></div>
      <a class="btn ghost block" href="#/sounds/credits" style="margin-top:8px">${I.info} Credits & licences</a>
      <button class="btn danger block" id="delAcc" style="margin-top:10px">Delete account</button></div>
    <div class="faint small" style="text-align:center;margin:8px 0 20px">Shukr v2 · Adhkar from Hisnul Muslim · Quran text Tanzil/alquran.cloud · Hadith via hadith-api · Maps © OpenStreetMap</div>`;
  bindGo(p);
  const save = async (patch, extra) => { try { await saveSettings(patch, extra); } catch (e) { toast(e.message); } };
  import('./i18n.js').then(async ({ languages, currentLang }) => { const L = (await languages()).find(l => l.code === currentLang()); const n = $('#langName'); if (n && L) n.textContent = L.native; });
  $('#langBtn').onclick = () => languageSheet();
  const saveR = patch => save({ reminders: patch });
  $$('[data-th]').forEach(b => b.onclick = () => { $$('[data-th]').forEach(x => x.classList.toggle('on', x === b)); save({ theme: b.dataset.th, themeChosen: true }); });
  $$('[data-pal]').forEach(b => b.onclick = async () => { await save({ palette: b.dataset.pal }); viewSettings(); });
  $('#arSize').oninput = e => { $('#arPrev').style.fontSize = e.target.value + 'px'; }; $('#arSize').onchange = e => save({ arabicSize: +e.target.value });
  $('#showTl').onchange = e => save({ showTranslit: e.target.checked }); $('#haptics').onchange = e => { save({ haptics: e.target.checked }); if (e.target.checked) vibrate(30); };
  $('#nasheed').onchange = e => { LS.set('nasheedMuted', !e.target.checked); save({ nasheed: e.target.checked }).then(() => e.target.checked ? startNasheed() : stopNasheed()); };
  $('#nVol').onchange = e => save({ nasheedVolume: +e.target.value });
  allSections.forEach(([, , , k]) => $('#sec_' + k).onchange = async e => { await save({ sections: { [k]: e.target.checked } }); refreshDrawer(); });
  // location
  let ct = null; $('#cityQ').oninput = e => { clearTimeout(ct); ct = setTimeout(async () => { const v = e.target.value.trim(); if (v.length < 2) return ($('#cityR').innerHTML = ''); const { results } = await api('/geocode?q=' + encodeURIComponent(v)); $('#cityR').innerHTML = results.map((c, i) => `<div class="list-item tap" data-ci="${i}"><div class="grow">${esc(c.name)}<div class="faint small">${esc([c.admin, c.country].filter(Boolean).join(', '))}</div></div></div>`).join('');
    $$('[data-ci]').forEach(b => b.onclick = async () => { const c = results[+b.dataset.ci]; const patch = locationPatch(c, state.user.settings); await saveSettings(patch); toast('Location set: ' + c.name); viewSettings(); }); }, 300); };
  $('#gps').onclick = () => locate().then(viewSettings).catch(() => {});
  $('#method').onchange = e => { save({ method: e.target.value, methodChosen: true }); $('#customM').hidden = e.target.value !== 'Custom'; $('#shafaqW').hidden = e.target.value !== 'MoonsightingCommittee'; };
  $('#highLat').onchange = e => save({ highLat: e.target.value });
  $$('[data-sh]').forEach(b => b.onclick = () => { $$('[data-sh]').forEach(x => x.classList.toggle('on', x === b)); save({ shafaq: b.dataset.sh }); });
  $$('[data-cu]').forEach(i => i.onchange = () => { const cu = { ...(state.user.settings.custom || {}) }; const v = i.value === '' ? null : Math.max(0, Math.min(i.dataset.cu === 'ishaMin' ? 180 : 30, +i.value));
    cu[i.dataset.cu] = v; if (i.dataset.cu === 'ishaMin') cu.ishaMode = v ? 'interval' : 'angle'; if (i.dataset.cu === 'isha' && v) cu.ishaMode = 'angle'; save({ custom: cu }); });
  $$('[data-mad]').forEach(b => b.onclick = () => { $$('[data-mad]').forEach(x => x.classList.toggle('on', x === b)); save({ madhab: b.dataset.mad }); });
  $$('[data-adj]').forEach(i => i.onchange = () => save({ adjust: { [i.dataset.adj]: Math.max(-60, Math.min(60, +i.value || 0)) } }));
  $$('[data-hj]').forEach(b => b.onclick = () => { $$('[data-hj]').forEach(x => x.classList.toggle('on', x === b)); save({ hijriAdj: +b.dataset.hj }); });
  // reminders
  $('#pushBtn')?.addEventListener('click', async () => { const b = $('#pushBtn'); b.disabled = true; try { if (subNow) { await subNow.unsubscribe(); await api('/push/unsubscribe', { body: { endpoint: subNow.endpoint } }); toast('Notifications off'); } else { await enablePush(); toast('Notifications on'); } } catch (e) { toast(e.message); } viewSettings(); });
  $$('[data-test]').forEach(b => b.onclick = async () => { b.disabled = true; const el = $('#pushTestResult'); try { const result = await api('/push/test', { body: { kind: b.dataset.test } }); const message = pushTestMessage(result.sent); if (el) el.textContent = message; toast(message, 7000); } catch (e) { if (el) el.textContent = 'Test failed: ' + e.message; toast(e.message); } finally { b.disabled = false; } });
  ['prayers', 'sunrise', 'duha', 'tahajjud', 'fastMonThu', 'blessings', 'journal', 'streak', 'morning', 'evening', 'sleep', 'friday', 'jummah', 'iqamah', 'missed', 'kahfThu', 'fridayHour', 'mosqueUpdates', 'events', 'quietOn', 'akhirah', 'quran', 'hifz'].forEach(k => $('#r_' + k).onchange = e => saveR({ [k]: e.target.checked }));
  $$('[data-pl]').forEach(b => b.onclick = () => { b.classList.toggle('on'); saveR({ prayerList: { ...(r.prayerList || {}), [b.dataset.pl]: b.classList.contains('on') } }); r.prayerList = { ...(r.prayerList || {}), [b.dataset.pl]: b.classList.contains('on') }; });
  $('#r_iqamah').addEventListener('change', e => { $('#iqW').hidden = !e.target.checked; });
  $('#r_quietOn').addEventListener('change', e => { $('#qW').hidden = !e.target.checked; });
  $$('[data-iq]').forEach(b => b.onclick = () => { $$('[data-iq]').forEach(x => x.classList.toggle('on', x === b)); saveR({ iqamahAfter: +b.dataset.iq }); });
  $('#qf').onchange = e => saveR({ quietFrom: e.target.value }); $('#qt').onchange = e => saveR({ quietTo: e.target.value });
  $$('[data-pre]').forEach(b => b.onclick = () => { $$('[data-pre]').forEach(x => x.classList.toggle('on', x === b)); saveR({ preAdhanMin: +b.dataset.pre }); });
  $('#saveBlessingTimes').onclick = async () => {
    const times = $$('[data-blessing-time]', p).map(el => el.value).filter(Boolean);
    const message = $('#blessingScheduleStatus');
    if (!times.length || times.length > 5 || new Set(times).size !== times.length || times.some(t => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t))) { message.textContent = 'Choose 1–5 unique times (00:00–23:59).'; return; }
    const b = $('#saveBlessingTimes'); b.disabled = true;
    try { await saveSettings({ reminders: { blessingTimes: times.sort() } }); message.textContent = 'Gratitude schedule saved. ' + (subNow ? 'Check phone notification settings for delivery.' : 'Enable notifications on this device to receive reminders.'); }
    catch (e) { message.textContent = e.message; } finally { b.disabled = false; }
  };
  $('#jt').onchange = e => saveR({ journalTime: e.target.value }); $('#akt').onchange = e => saveR({ akhirahTimes: [e.target.value] });
  $$('[data-ak]').forEach(b => b.onclick = () => { b.classList.toggle('on'); save({ akhirahTopics: { [b.dataset.ak]: b.classList.contains('on') } }); });
  // alim
  $$('[data-tone]').forEach(b => b.onclick = () => { $$('[data-tone]').forEach(x => x.classList.toggle('on', x === b)); save({ coachTone: b.dataset.tone }); });
  $('#voice').onchange = e => save({ alimVoice: e.target.value }); $('#deep').onchange = e => save({ alimDeep: e.target.checked });
  $('#dgoal').onchange = e => save({ dhikrGoal: Math.max(1, +e.target.value || 100) });
  $('#nm').onchange = e => save({}, { name: e.target.value.trim() }).then(refreshDrawer);
  $('#logout').onclick = async () => { await api('/logout', { body: {} }); state.user = null; location.hash = ''; location.reload(); };
  $('#delAcc').onclick = () => deleteAccountSheet();
}
const b64 = s => { const pad = '='.repeat((4 - s.length % 4) % 4); const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...raw].map(c => c.charCodeAt(0))); };
export async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Push is not supported here. On iPhone, add Shukr to your Home Screen first.');
  if (!state.vapid) throw new Error('Notifications are not configured on the server');
  if (typeof Notification === 'undefined') throw new Error('Notifications need the installed app. On iPhone: Share → Add to Home Screen, then open Shukr from the icon.');
  const perm = await Notification.requestPermission(); if (perm !== 'granted') throw new Error('Notifications not allowed. Enable them in browser site settings and phone Settings → Notifications → Shukr. On iPhone, open the installed Home Screen app (iOS 16.4+).');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(state.vapid) });
  await api('/push/subscribe', { body: { subscription: sub.toJSON() } });
}

export async function languageSheet() {
  const { languages, setLanguage, currentLang } = await import('./i18n.js');
  const list = await languages(), cur = currentLang();
  sheet(`<h3>App language</h3><input class="input" id="langQ" placeholder="Search languages" autocomplete="off"><div class="lang-list" data-no-i18n>${list.map(l => `<button class="ep-choice ${l.code === cur ? 'on' : ''}" data-lang="${l.code}" data-s="${escAttr((l.name + ' ' + l.native).toLowerCase())}"><span><b>${esc(l.native)}</b> <small class="faint">${esc(l.name)}</small></span><i></i></button>`).join('')}</div>`, (sh, close) => {
    $('#langQ', sh).oninput = e => { const v = e.target.value.toLowerCase().trim(); $$('[data-lang]', sh).forEach(b => b.hidden = v && !b.dataset.s.includes(v)); };
    $$('[data-lang]', sh).forEach(b => b.onclick = async () => { close(); await setLanguage(b.dataset.lang); const n = $('#langName'); if (n) n.textContent = list.find(l => l.code === b.dataset.lang).native; toast(b.dataset.lang === 'en' ? 'Language: English' : '✓'); });
  });
}
export function deleteAccountSheet() {
  sheet(`<h3>Delete your account?</h3><p class="muted small">This permanently deletes your profile, videos, journal, blessings, chats, memories and all data. This cannot be undone.</p>
    <form id="delForm"><label class="lbl">Enter your password to confirm</label><input class="input" type="password" name="pw" autocomplete="current-password" required>
    <button class="btn danger block" style="margin-top:14px">Delete forever</button><p class="err"></p></form>`, (sh) => {
    $('#delForm', sh).onsubmit = async e => { e.preventDefault(); const b = e.target.querySelector('button'); b.disabled = true;
      try { await api('/account', { method: 'DELETE', body: { password: e.target.pw.value } }); localStorage.clear(); location.hash = ''; location.reload(); }
      catch (er) { $('.err', sh).textContent = er.message; b.disabled = false; } };
  });
}
