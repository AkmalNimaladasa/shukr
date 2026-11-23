// Premium (Memory $8 / No ads $5 / coins), Creator earnings, Advertise, Developer dashboard.
import { $, $$, esc, escAttr, I, api, state, shell, go, sheet, toast, onCleanup } from './core.js';
import { mountSocialTabbar } from './views-social-hub.js';

const usd = n => '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = n => (Number(n) || 0).toLocaleString();
const day = d => d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

// Starts a checkout. Live: posts a PayHere form. Demo: developer can complete it; others see a "coming soon" note.
export async function checkout(r, onDone) {
  if (r.action && r.fields) {
    const f = document.createElement('form'); f.method = 'POST'; f.action = r.action;
    for (const [k, v] of Object.entries(r.fields)) { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; f.append(i); }
    document.body.append(f); f.submit(); return;
  }
  sheet(`<h3>${esc(r.items || 'Checkout')}</h3><div class="pay-amt">${usd(r.amount)}</div>
    ${r.canComplete ? `<p class="muted small">Payments are in <b>demo mode</b> until PayHere keys are added. As the developer you can complete this test order.</p><button class="btn accent block" id="payDemo">Complete test payment</button>`
      : `<p class="muted">Card payments are being switched on. You haven’t been charged. We’ll let you know as soon as checkout opens.</p><button class="btn ghost block" data-close>OK</button>`}`, (sh, close) => {
    $('[data-close]', sh)?.addEventListener('click', close);
    const b = $('#payDemo', sh); if (b) b.onclick = async () => { b.disabled = true; try { await api('/pay/demo/complete', { body: { orderId: r.orderId } }); close(); toast('Payment completed'); onDone && onDone(); } catch (e) { toast(e.message); b.disabled = false; } };
  });
}

export async function viewPremium(query) {
  const p = shell('Shukr Premium', { back: '/profile' }); p.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  const [cfg, me] = await Promise.all([api('/pay/config'), api('/me/plans')]);
  const plans = me.plans || {};
  const card = (key, title, price, perks, color) => {
    const on = plans[key];
    return `<section class="plan ${on ? 'on' : ''}" style="--pc:${color}"><div class="plan-top"><div><h3>${title}</h3><div class="plan-price"><b>$${price}</b> / month</div></div>${on ? `<span class="badge green">Active</span>` : ''}</div>
      <ul>${perks.map(x => `<li>${I.check} ${x}</li>`).join('')}</ul>
      ${on ? (on.admin ? '<p class="faint small">Included for the developer account.</p>' : `<p class="faint small">${on.cancelAtEnd ? 'Ends' : 'Renews'} ${day(on.until)}</p>${on.cancelAtEnd ? '' : `<button class="btn ghost block" data-cancel="${key}">Cancel at period end</button>`}`)
        : `<button class="btn accent block" data-sub="${key}">Get ${title} · $${price}/mo</button>`}</section>`;
  };
  p.innerHTML = `<div class="prem-hero"><span class="prem-ic">${I.star}</span><h1>Shukr Premium</h1><p>Let Alim remember you, coach you toward your goals, and scroll without ads.</p></div>
    <h2 class="prem-h">Alim memory & coaching</h2>
    ${card('memory', 'Alim Memory', cfg.prices.memory, ['Alim remembers up to 300 things about you', 'Your goals, struggles and wins carry across chats', 'Searches your recent chats & journal', 'Without memory, each chat starts fresh'], 'var(--violet)')}
    ${card('memory_plus', 'Memory Plus', cfg.prices.memory_plus, ['Everything in Alim Memory', 'Remembers up to 2,000 things — much deeper context', 'Goal tracking with gentle check-ins', 'Weekly progress reflections', 'Recalls more past chats in every answer'], 'var(--accent)')}
    ${card('mentor', 'Life Mentor', cfg.prices.mentor, ['Everything in Memory Plus', 'Remembers up to 20,000 things — your full journey', 'Pattern recognition across your journal, moods, habits & chats', 'Coaching built on psychology: CBT reframes, motivational interviewing, habit science, values work', 'Spots your triggers and what actually helps you', 'Holds you accountable to your goals, rooted in your deen', 'Always uses Alim’s most capable model'], 'var(--sun)')}
    ${card('noads', 'No Ads', cfg.prices.noads, ['No sponsored posts in your feed', 'Creators still get paid from the platform', 'Cancel any time'], 'var(--teal)')}
    <section class="plan" id="coins" style="--pc:var(--sun)"><div class="plan-top"><div><h3>Coins</h3><div class="plan-price">Balance: <b>${num(me.coins)}</b></div></div></div><p class="muted small">Send gifts to creators you love. Gifts turn into creator earnings.</p>
      <div class="coin-grid">${cfg.coinPacks.map(([c, price]) => `<button class="coin" data-coins="${c}"><b>${num(c)}</b><small>$${price}</small></button>`).join('')}</div></section>
    ${me.demo ? '<p class="faint small" style="text-align:center">Payments are being set up — prices are final, checkout opens soon.</p>' : ''}`;
  $$('[data-sub]', p).forEach(b => b.onclick = async () => { b.disabled = true; try { checkout(await api('/pay/subscribe', { body: { plan: b.dataset.sub } }), () => viewPremium()); } catch (e) { toast(e.message); } finally { b.disabled = false; } });
  $$('[data-cancel]', p).forEach(b => b.onclick = async () => { try { await api('/pay/subscription/cancel', { body: { plan: b.dataset.cancel } }); toast('Cancelled — it stays active until the period ends'); viewPremium(); } catch (e) { toast(e.message); } });
  $$('[data-coins]', p).forEach(b => b.onclick = async () => { try { checkout(await api('/pay/coins', { body: { coins: +b.dataset.coins } }), () => viewPremium()); } catch (e) { toast(e.message); } });
  if (query?.get('coins')) $('#coins', p)?.scrollIntoView({ block: 'center' });
  if (query?.get('paid')) toast('Thank you! Your purchase will be active in a moment.');
}

export async function viewCreator() {
  const p = shell('Creator', { back: '/profile' }); p.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  const c = await api('/creator');
  const prog = (v, t) => `<div class="progressbar"><div style="width:${Math.min(100, 100 * v / Math.max(1, t))}%"></div></div>`;
  p.innerHTML = `<a class="card cq-teaser" href="#/creator/quests"><span class="cq-teaser-ic">${I.flame}</span><div class="grow"><b>Creator Quests</b><div class="muted small">Daily & weekly challenges · level up · earn badges</div></div><span class="badge">Play</span></a>
    <a class="card cq-teaser" href="#/university"><span class="cq-teaser-ic">🎓</span><div class="grow"><b>Creator University</b><div class="muted small">Learn to grow followers & earn on Shukr</div></div><span class="badge">Learn</span></a>
    <div class="earn-hero"><div class="faint small">Estimated earnings</div><div class="earn-big">${usd(c.earned)}</div><div class="earn-row"><span>Available <b>${usd(c.available)}</b></span><span>Paid out <b>${usd(c.paidOut)}</b></span></div></div>
    <div class="grid2"><div class="kpi"><div class="n">${usd(c.adUsd)}</div><div class="l">Ad revenue · ${num(c.adImpressions)} ad views</div></div><div class="kpi"><div class="n">${usd(c.giftUsd)}</div><div class="l">Gifts · ${num(c.giftCoins)} coins</div></div></div>
    ${c.joined ? `<div class="card"><h3>Creator Rewards: active</h3><p class="muted small">You’re earning from ads on your posts and from gifts.</p></div>`
      : `<div class="card"><h3>Join Creator Rewards</h3><p class="muted small">Earn money from your posts once you meet the requirements below.</p>
        <div class="req"><span>${c.followers >= c.minFollowers ? I.check : '○'} ${num(c.minFollowers)} followers</span><b>${num(c.followers)}</b></div>${prog(c.followers, c.minFollowers)}
        <div class="req"><span>${c.views28 >= c.minViews28 ? I.check : '○'} ${num(c.minViews28)} views in the last 28 days</span><b>${num(c.views28 || 0)}</b></div>${prog(c.views28 || 0, c.minViews28)}
        <button class="btn accent block" id="join" ${c.eligible ? '' : 'disabled'} style="margin-top:12px">${c.eligible || state.user.developer ? 'Join now' : 'Keep posting to unlock'}</button></div>`}
    <div class="card"><h3>Withdraw</h3><p class="muted small">Minimum ${usd(c.minPayout)}. Payouts are reviewed and sent by bank transfer.</p>
      <textarea class="input" id="pd" rows="3" placeholder="Bank name, account name, account number, branch / SWIFT">${esc(c.payoutDetails || '')}</textarea>
      <button class="btn accent block" id="po" style="margin-top:10px" ${c.available >= c.minPayout ? '' : 'disabled'}>Request ${usd(c.available)}</button></div>
    ${c.payouts.length ? `<div class="card"><h3>Payout history</h3>${c.payouts.map(x => `<div class="list-item"><div class="grow">${usd(x.amount_usd)}<div class="faint small">${day(x.created_at)}${x.reference ? ' · ' + esc(x.reference) : ''}</div></div><span class="badge ${x.status === 'paid' ? 'green' : x.status === 'rejected' ? 'gray' : 'gold'}">${esc(x.status)}</span></div>`).join('')}</div>` : ''}
    <a class="btn ghost block" href="#/advertise">${I.send} Promote a post / advertise</a>`;
  $('#join', p)?.addEventListener('click', async () => { try { await api('/creator/join', { body: {} }); toast('Welcome to Creator Rewards'); viewCreator(); } catch (e) { toast(e.message); } });
  $('#po', p).onclick = async () => { try { await api('/creator/payout', { body: { details: $('#pd', p).value } }); toast('Payout requested'); viewCreator(); } catch (e) { toast(e.message); } };
}

export async function viewAdvertise() {
  const p = shell('Advertise', { back: '/profile' }); p.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  const [cfg, mine] = await Promise.all([api('/pay/config'), api('/ads/campaigns')]);
  let media = null, poster = null;
  p.innerHTML = `<div class="prem-hero ad"><span class="prem-ic">${I.send}</span><h1>Reach the Shukr community</h1><p>Full-screen ads in the For You feed. ${usd(cfg.cpm)} per 1,000 views.</p></div>
    <form id="adf" class="card"><h3>New campaign</h3>
      <label class="ad-pick" id="adPick"><input type="file" accept="image/*,video/*" hidden id="adFile"><span>${I.plus}<b>Add a 9:16 video or image</b><small>Vertical works best</small></span></label>
      <label class="lbl">Brand / business name</label><input class="input" name="brand" maxlength="60" required>
      <label class="lbl">Headline</label><input class="input" name="headline" maxlength="150" required placeholder="What should people know?">
      <label class="lbl">Website link</label><input class="input" name="link" type="url" required placeholder="https://">
      <label class="lbl">Button</label><select class="input" name="cta">${['Learn more', 'Shop now', 'Sign up', 'Download', 'Book now', 'Donate'].map(x => `<option>${x}</option>`).join('')}</select>
      <label class="lbl">Budget (USD)</label><input class="input" name="budget" type="number" min="10" step="1" value="50" required>
      <div class="ad-est" id="adEst"></div>
      <label class="create-rights"><input type="checkbox" required> <span>My ad is halal, truthful and follows the advertising policy. Ads are reviewed before they run.</span></label>
      <button class="btn accent block" style="margin-top:12px">Continue to payment</button><p class="err"></p></form>
    <h3 style="margin:18px 0 8px">Your campaigns</h3>
    ${mine.campaigns.length ? mine.campaigns.map(c => `<div class="card camp"><div class="row between"><div class="grow"><b>${esc(c.brand)}</b><div class="faint small">${esc(c.headline)}</div></div><span class="badge ${c.status === 'active' ? 'green' : c.status === 'rejected' ? 'gray' : 'gold'}">${esc(c.status === 'review' ? 'in review' : c.status)}</span></div>
      <div class="camp-stats"><span><b>${num(c.impressions)}</b> views</span><span><b>${num(c.clicks)}</b> clicks</span><span><b>${usd(c.spent_usd)}</b> of ${usd(c.budget_usd)}</span></div>
      <div class="progressbar"><div style="width:${Math.min(100, 100 * c.spent_usd / c.budget_usd)}%"></div></div>
      ${c.status === 'unpaid' ? `<button class="btn accent sm" data-pay="${escAttr(c.id)}" style="margin-top:10px">Pay ${usd(c.budget_usd)}</button>` : ['active', 'paused'].includes(c.status) ? `<button class="btn ghost sm" data-pause="${escAttr(c.id)}" style="margin-top:10px">${c.status === 'active' ? 'Pause' : 'Resume'}</button>` : ''}
      ${c.review_note ? `<p class="faint small">${esc(c.review_note)}</p>` : ''}</div>`).join('') : '<p class="muted small">No campaigns yet.</p>'}`;
  const est = () => { const b = +$('[name=budget]', p).value || 0; $('#adEst', p).innerHTML = `≈ <b>${num(Math.floor(b / cfg.cpm * 1000))}</b> full-screen views`; };
  $('[name=budget]', p).oninput = est; est();
  const up = (blob, meta = {}) => new Promise((res, rej) => { const x = new XMLHttpRequest(); x.open('POST', '/api/social/media'); x.setRequestHeader('Content-Type', blob.type); if (meta.w) x.setRequestHeader('X-Media-Width', meta.w); if (meta.h) x.setRequestHeader('X-Media-Height', meta.h); x.onload = () => { const d = JSON.parse(x.responseText || '{}'); x.status < 300 ? res(d.media) : rej(new Error(d.error || 'Upload failed')); }; x.onerror = () => rej(new Error('Network error')); x.send(blob); });
  $('#adFile', p).onchange = async e => {
    const f = e.target.files[0]; if (!f) return; const pick = $('#adPick span', p); pick.innerHTML = '<span class="spin"></span> Uploading…';
    try {
      const url = URL.createObjectURL(f);
      if (f.type.startsWith('video/')) {
        const v = document.createElement('video'); v.muted = true; v.src = url; await new Promise(r => { v.onloadeddata = r; v.onerror = r; setTimeout(r, 5000); });
        media = await up(f, { w: v.videoWidth, h: v.videoHeight });
        try { v.currentTime = .5; await new Promise(r => { v.onseeked = r; setTimeout(r, 2000); }); const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0); const b = await new Promise(r => c.toBlob(r, 'image/jpeg', .85)); if (b) poster = await up(b); } catch {}
        pick.innerHTML = `<video src="${url}" muted autoplay loop playsinline></video>`;
      } else { media = await up(f); pick.innerHTML = `<img src="${url}" alt="">`; }
    } catch (er) { pick.innerHTML = `${I.plus}<b>${esc(er.message)}</b><small>Tap to try again</small>`; }
  };
  $('#adf', p).onsubmit = async e => {
    e.preventDefault(); const f = e.target, err = $('.err', f); err.textContent = '';
    if (!media) { err.textContent = 'Add a photo or video for your ad.'; return; }
    try { const r = await api('/ads/campaigns', { body: { brand: f.brand.value, headline: f.headline.value, link: f.link.value, cta: f.cta.value, budgetUsd: +f.budget.value, mediaId: media.id, posterId: poster?.id } }); checkout(r.checkout, () => viewAdvertise()); }
    catch (er) { err.textContent = er.message; }
  };
  $$('[data-pay]', p).forEach(b => b.onclick = async () => { try { checkout(await api(`/ads/campaigns/${encodeURIComponent(b.dataset.pay)}/checkout`, { body: {} }), () => viewAdvertise()); } catch (e) { toast(e.message); } });
  $$('[data-pause]', p).forEach(b => b.onclick = async () => { try { await api(`/ads/campaigns/${encodeURIComponent(b.dataset.pause)}/pause`, { body: {} }); viewAdvertise(); } catch (e) { toast(e.message); } });
}

export async function viewAdmin(query) {
  if (!state.user?.developer) { go('/fyp'); return; }
  const p = shell('Developer', { back: '/profile' }); p.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  let d; try { d = await api('/admin/dashboard' + (query?.get('demo') ? '?demo=1' : '')); } catch (e) { p.innerHTML = `<div class="empty"><h2>Developer access only</h2><p>${esc(e.message)}</p></div>`; return; }
  const max = Math.max(1, ...d.series.map(x => x.n));
  const subN = k => d.subs.find(s => s.plan === k)?.n || 0;
  const secP = api('/admin/security').catch(() => null);
  p.innerHTML = `<div class="adm-head"><h1>Dashboard</h1><span class="badge ${d.pay.live ? 'green' : 'gold'}">${d.pay.live ? 'Payments live' : 'Payments: demo mode'}</span></div>
    <a class="btn ghost block" href="#/admin/scholars" style="margin:8px 0">${I.shield || ''} Scholar verification queue</a>
    <section class="sec-panel" id="secPanel"><div class="loading"><span class="spin"></span></div></section>
    <section class="card lic-panel" id="licPanel"><div class="loading"><span class="spin"></span></div></section>
    <div class="adm-grid">
      <div class="kpi big"><div class="l">Total users</div><div class="n">${num(d.users.total)}</div><div class="delta up">+${num(d.users.d1)} today · +${num(d.users.d7)} this week</div></div>
      <div class="kpi big"><div class="l">Revenue (all time)</div><div class="n">${usd(d.revenue.total)}</div><div class="delta">${usd(d.revenue.last30)} last 30 days</div></div>
      <div class="kpi"><div class="l">Paying subscribers</div><div class="n">${num(d.revenue.payers)}</div></div>
      <div class="kpi"><div class="l">Memory plan</div><div class="n">${num(subN('memory'))}</div></div>
      <div class="kpi"><div class="l">No-ads plan</div><div class="n">${num(subN('noads'))}</div></div>
      <div class="kpi"><div class="l">Active today</div><div class="n">${num(d.users.active1)}</div><div class="delta">${num(d.users.active7)} this week</div></div>
      <div class="kpi"><div class="l">Subscriptions $</div><div class="n">${usd(d.revenue.subs)}</div></div>
      <div class="kpi"><div class="l">Ad sales $</div><div class="n">${usd(d.revenue.ads)}</div></div>
      <div class="kpi"><div class="l">Coin sales $</div><div class="n">${usd(d.revenue.coins)}</div></div>
      <div class="kpi"><div class="l">Owed to creators</div><div class="n">${usd(d.creatorsOwed)}</div><div class="delta">${usd(d.creatorsPaid)} paid</div></div>
      <div class="kpi"><div class="l">Ad views / clicks</div><div class="n">${num(d.ads.impressions)}</div><div class="delta">${num(d.ads.clicks)} clicks</div></div>
      <div class="kpi"><div class="l">Posts</div><div class="n">${num(d.content.posts)}</div><div class="delta">+${num(d.content.posts7)} this week</div></div>
      <div class="kpi"><div class="l">Watch hours</div><div class="n">${(+d.content.watch_hours || 0).toFixed(1)}</div></div>
      <div class="kpi"><div class="l">Creators</div><div class="n">${num(d.content.creators)}</div></div>
      <div class="kpi"><div class="l">Open reports</div><div class="n">${num(d.content.open_reports)}</div><div class="delta"><a href="#/rights">Review</a></div></div>
    </div>
    <div class="card"><h3>Sign-ups · last 30 days</h3><div class="adm-bars">${d.series.map(x => `<i title="${x.day}: ${x.n}" style="height:${Math.max(3, 100 * x.n / max)}%"></i>`).join('')}</div></div>
    <div class="card"><h3>Ads awaiting review</h3>${d.campaigns.filter(c => c.status === 'review').map(c => `<div class="adm-camp"><div class="grow"><b>${esc(c.brand)}</b> · ${usd(c.budget_usd)}<div class="small">${esc(c.headline)}</div><a class="small" href="${escAttr(c.link)}" target="_blank" rel="noopener">${esc(c.link)}</a><div class="faint small">${esc(c.email || '')}</div>${c.media?.src ? (c.media.kind === 'video' ? `<video src="${escAttr(c.media.src)}" muted playsinline controls preload="metadata"></video>` : `<img src="${escAttr(c.media.src)}" alt="">`) : ''}</div><div class="col"><button class="btn accent sm" data-camp="${escAttr(c.id)}" data-a="approve">Approve</button><button class="btn danger sm" data-camp="${escAttr(c.id)}" data-a="reject">Reject</button></div></div>`).join('') || '<p class="muted small">Nothing to review.</p>'}
      ${d.campaigns.filter(c => c.status !== 'review').length ? `<details><summary class="small">All campaigns (${d.campaigns.length})</summary>${d.campaigns.map(c => `<div class="list-item"><div class="grow">${esc(c.brand)}<div class="faint small">${usd(c.spent_usd)} / ${usd(c.budget_usd)} · ${esc(c.email || '')}</div></div><span class="badge gray">${esc(c.status)}</span>${c.status === 'active' ? `<button class="btn ghost sm" data-camp="${escAttr(c.id)}" data-a="pause">Pause</button>` : ''}</div>`).join('')}</details>` : ''}</div>
    <div class="card"><h3>Creator payouts</h3>${d.payouts.length ? d.payouts.map(x => `<div class="list-item"><div class="grow"><b>${usd(x.amount_usd)}</b> · ${esc(x.name || x.email)}<div class="faint small">${esc(x.details)}</div><div class="faint small">${day(x.created_at)}</div></div>${x.status === 'requested' ? `<div class="col"><button class="btn accent sm" data-po="${x.id}" data-s="paid">Mark paid</button><button class="btn ghost sm" data-po="${x.id}" data-s="rejected">Reject</button></div>` : `<span class="badge ${x.status === 'paid' ? 'green' : 'gray'}">${esc(x.status)}</span>`}</div>`).join('') : '<p class="muted small">No payout requests.</p>'}</div>
    <div class="card"><h3>Top creators by watch time</h3>${d.topCreators.map(c => `<div class="list-item"><div class="grow">${esc(c.name || 'Member')}<div class="faint small">${num(c.followers)} followers · ${num(c.posts)} posts</div></div><b>${(+c.watch_hours).toFixed(1)} h</b></div>`).join('') || '<p class="muted small">No creators yet.</p>'}</div>
    <div class="card"><h3>Newest users</h3>${d.recentUsers.map(u => `<div class="list-item"><div class="grow">${esc(u.name || '—')}<div class="faint small">${esc(u.email)} · ${day(u.created_at)}</div></div>${u.plans ? `<span class="badge green">${esc(u.plans)}</span>` : ''}</div>`).join('')}</div>
    <div class="card"><h3>Recent payments</h3>${d.payments.map(x => `<div class="list-item"><div class="grow">${usd(x.amount_usd)} · ${esc(x.kind === 'sub' ? 'Subscription: ' + x.ref_id : x.kind)}<div class="faint small">${esc(x.email || '')} · ${day(x.paid_at)} · ${esc(x.provider)}</div></div><span class="badge ${x.status === 'paid' ? 'green' : 'gray'}">${esc(x.status)}</span></div>`).join('') || '<p class="muted small">No payments yet.</p>'}
      ${d.pay.live ? '' : `<p class="faint small">Demo payments are excluded from revenue. <a href="#/admin?demo=1">Include demo</a></p>`}</div>
    <p class="faint small">Prices: Memory $${d.pay.prices.memory}/mo · No ads $${d.pay.prices.noads}/mo · Ads $${d.pay.cpm} CPM · Ad revenue: Shukr ${d.platformAdSharePct}% / creators ${d.creatorSharePct}% · Scholar commission ${d.scholarCommissionPct}% · <a href="#/admin/fundraisers">Verify fundraisers</a>% of ad revenue.</p>`;
  $$('[data-camp]', p).forEach(b => b.onclick = async () => { const note = b.dataset.a === 'reject' ? prompt('Reason (shown to advertiser)') || '' : ''; try { await api('/admin/campaigns/' + encodeURIComponent(b.dataset.camp), { body: { action: b.dataset.a, note } }); toast('Updated'); viewAdmin(query); } catch (e) { toast(e.message); } });
  $$('[data-po]', p).forEach(b => b.onclick = async () => { const ref = b.dataset.s === 'paid' ? prompt('Transfer reference (optional)') || '' : ''; try { await api('/admin/payouts/' + b.dataset.po, { body: { status: b.dataset.s, reference: ref } }); toast('Updated'); viewAdmin(query); } catch (e) { toast(e.message); } });
  secP.then(s => { const box = $('#secPanel', p); if (box) { if (s) renderSecurity(box, s); else box.remove(); } });
  renderLicences($('#licPanel', p));
}

// ---------- Developer: security alerts ----------
const SEV = { critical: ['Critical', '#E5484D'], high: ['High', '#F76B15'], medium: ['Medium', '#E0A100'], low: ['Low', '#8A8A8A'] };
const ago = d => { const s = (Date.now() - new Date(d)) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' d ago'; };
export async function renderSecurity(box, data) {
  const d = data || await api('/admin/security');
  const open = d.alerts.filter(a => !a.acknowledged_at);
  const worst = open.find(a => a.severity === 'critical') ? 'critical' : open.find(a => a.severity === 'high') ? 'high' : open.length ? 'medium' : null;
  box.innerHTML = `<div class="sec-head ${worst || 'ok'}"><div><b>${worst ? `${open.length} security alert${open.length === 1 ? '' : 's'} need review` : 'No security alerts'}</b>
      <small>${d.push ? 'Phone alerts on' : 'Turn on notifications in Settings to get phone alerts'} · ${d.email ? 'Email alerts on' : 'Email alerts need SMTP set in Roar'}</small></div>
      <button class="btn ghost sm" data-sec="test">Send test</button></div>
    ${d.alerts.length ? `<div class="sec-list">${d.alerts.slice(0, 20).map(a => `<div class="sec-alert ${a.acknowledged_at ? 'ack' : ''}" style="--sc:${SEV[a.severity]?.[1] || '#888'}"><div class="row between"><span class="sec-sev">${SEV[a.severity]?.[0] || a.severity}</span><small class="faint">${ago(a.created_at)}</small></div>
      <b>${esc(a.title)}</b>${a.ip ? `<small class="faint">IP ${esc(a.ip)}</small>` : ''}
      ${a.acknowledged_at ? '<small class="faint">Reviewed</small>' : `<button class="btn ghost sm" data-ack="${a.id}">Mark reviewed</button>`}</div>`).join('')}</div>` : ''}
    <details class="sec-more"><summary>Last 24 hours · ${d.counts.reduce((n, c) => n + c.n, 0)} blocked requests</summary>
      ${d.counts.map(c => `<div class="row between small"><span>${esc(c.type.replace(/-/g, ' '))}</span><b>${c.n}</b></div>`).join('') || '<p class="faint small">Nothing blocked.</p>'}
      ${d.topIps.length ? `<p class="small" style="margin:8px 0 2px"><b>Top sources</b></p>${d.topIps.map(x => `<div class="row between small"><span>${esc(x.ip || '?')}</span><b>${x.n}</b></div>`).join('')}` : ''}
      <button class="btn danger block sm" style="margin-top:12px" data-sec="revoke">Emergency: sign out all users</button></details>`;
  $$('[data-ack]', box).forEach(b => b.onclick = async () => { await api(`/admin/security/${b.dataset.ack}/ack`, { body: {} }); renderSecurity(box); });
  $('[data-sec="test"]', box).onclick = async () => { await api('/admin/security/test', { body: {} }); toast('Test alert sent'); renderSecurity(box); };
  $('[data-sec="revoke"]', box).onclick = async () => { const c = prompt('This signs out every user except you. Type SIGN OUT EVERYONE to confirm.'); if (c !== 'SIGN OUT EVERYONE') return; try { const r = await api('/admin/security/revoke-all', { body: { confirm: c } }); toast(`Signed out ${r.revoked} sessions`); renderSecurity(box); } catch (e) { toast(e.message); } };
}

// ---------- Developer: licences & permissions checklist ----------
async function renderLicences(box) {
  if (!box) return; let d; try { d = await api('/admin/licences'); } catch (e) { box.remove(); return; }
  const L = { needed: ['Needed', 'red'], condition: ['Keep conditions', 'gold'], done: ['Cleared', 'green'] };
  const groups = [...new Set(d.items.map(x => x.group))];
  const cnt = k => d.items.filter(x => x.status === k).length;
  box.innerHTML = `<h3>Licences & permissions</h3><div class="faint small" style="margin-bottom:8px">Everything the app needs to stay copyright-safe. Only you can see this.</div>
    <div class="lic-sum"><span class="lic-b red">${cnt('needed')} needed</span><span class="lic-b gold">${cnt('condition')} keep conditions</span><span class="lic-b green">${cnt('done')} cleared</span></div>
    ${groups.map(g => `<h4 class="lic-g">${esc(g)}</h4>${d.items.filter(x => x.group === g).map(x => `<details class="lic-i" data-lic="${escAttr(x.id)}"><summary><span class="lic-dot ${L[x.status][1]}"></span><span class="grow">${esc(x.title)}</span><span class="lic-b ${L[x.status][1]}">${L[x.status][0]}</span></summary>
      <div class="lic-body"><div class="small"><b>What’s needed:</b> ${esc(x.need)}</div><div class="small" style="margin-top:4px"><b>Now:</b> ${esc(x.state)}</div>
      ${x.updatedAt ? `<div class="faint small" style="margin-top:4px">Updated ${new Date(x.updatedAt).toLocaleDateString()}</div>` : ''}
      <textarea class="input" rows="2" placeholder="Notes (who you contacted, licence received…)" maxlength="500" style="margin-top:8px">${esc(x.note || '')}</textarea>
      <div class="seg sm" style="margin-top:6px">${Object.entries(L).map(([k, [l]]) => `<button data-st="${k}" class="${x.status === k ? 'on' : ''}">${l}</button>`).join('')}</div></div></details>`).join('')}`).join('')}`;
  $$('[data-lic]', box).forEach(el => { const id = el.dataset.lic; const save = async (st) => { try { await api('/admin/licences/' + encodeURIComponent(id), { method: 'PUT', body: { status: st, note: $('textarea', el).value } }); toast('Saved'); if (st) renderLicences(box); } catch (e) { toast(e.message); } };
    $$('[data-st]', el).forEach(b => b.onclick = () => save(b.dataset.st)); $('textarea', el).onchange = () => save(null); });
}
