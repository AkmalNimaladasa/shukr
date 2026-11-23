// Earn hub: referrals, wallet, tips, digital products, memberships, services, freelance, fundraisers (verified), paid communities.
import { $, $$, esc, escAttr, I, api, state, shell, go, sheet, toast } from './core.js';
import { checkout } from './views-money.js';

const $usd = n => '$' + (+n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ago = t => { const s = (Date.now() - new Date(t)) / 1000; return s < 3600 ? Math.max(1, Math.floor(s / 60)) + 'm' : s < 86400 ? Math.floor(s / 3600) + 'h' : Math.floor(s / 86400) + 'd'; };
const back = t => shell(t, { back: '/earn' });
async function upload(f) { const r = await fetch('/api/social/media', { method: 'POST', headers: { 'Content-Type': f.type }, body: f, credentials: 'same-origin' }); const j = await r.json(); if (!r.ok) throw new Error(j.error); return j.media.url; }
const form = (fields, submit) => `<form class="card er-form">${fields}<button class="btn accent block">${submit}</button></form>`;
const buy = async (path, body, done) => { try { const r = await api(path, { body }); if (r.checkout) checkout(r.checkout, done); else done && done(); } catch (e) { toast(e.message); } };

export async function viewEarn() {
  const p = shell('Earn'); p.classList.add('er-page');
  const [s, cr] = await Promise.all([api('/earn/summary').catch(() => ({ balance: 0 })), api('/creator').catch(() => null)]);
  const fN = cr?.minFollowers || 5000, vN = cr?.minViews28 || 150000, fol = cr?.followers || 0, v28 = cr?.views28 || 0;
  const pc = (a, b) => Math.min(100, Math.round(a / b * 100)), nf = n => Number(n).toLocaleString();
  const adCard = `<a class="er-ads ${cr?.eligible ? 'ok' : ''}" href="#/creator"><div class="er-ads-h"><span class="er-ads-ic">${I.play}</span><div><b>Earn from ad revenue</b><small>${cr?.eligible ? (cr.joined ? 'You’re in the Creator Program — ads on your videos earn you money.' : 'You qualify! Tap to join the Creator Program.') : `Unlock with <b>${nf(fN)} followers</b> and <b>${nf(vN)} views in the last 28 days</b>.`}</small></div></div>
    <div class="er-req"><div class="er-req-l"><span>Followers</span><b>${nf(fol)} / ${nf(fN)}</b></div><div class="er-req-bar"><i style="width:${pc(fol, fN)}%"></i></div></div>
    <div class="er-req"><div class="er-req-l"><span>Views · last 28 days</span><b>${nf(v28)} / ${nf(vN)}</b></div><div class="er-req-bar"><i style="width:${pc(v28, vN)}%"></i></div></div></a>`;
  const tile = (href, ic, t, d, tone) => `<a class="er-tile ${tone}" href="#${href}"><span class="er-ic">${I[ic] || I.star}</span><b>${t}</b><small>${d}</small></a>`;
  p.innerHTML = `<a class="er-wallet" href="#/wallet"><div><small>Wallet balance</small><b>${$usd(s.balance)}</b></div><span>Cash out ${I.chevron || '›'}</span></a>
    <a class="er-ref" href="#/referrals"><span class="er-ref-ic">${I.gift}</span><div><b>Invite friends, get paid</b><small>Earn every time someone you invite buys anything on Shukr.${s.invited ? ` ${s.invited} joined so far.` : ''}</small></div><span class="er-go">Invite</span></a>
    ${adCard}
    <h4 class="er-h">Ways to earn</h4><div class="er-grid">
      ${tile('/earn/tips', 'heart', 'Tips', 'Fans send you money', 'pink')}
      ${tile('/earn/products?kind=digital', 'download', 'Digital products', 'eBooks, courses, presets', 'violet')}
      ${tile('/earn/products?kind=membership', 'star', 'Subscriptions', 'Monthly perks for fans', 'gold')}
      ${tile('/earn/products?kind=service', 'briefcase', 'Services', 'Coaching, design, lessons', 'teal')}
      ${tile('/earn/affiliate', 'link', 'Affiliate', 'Share products, earn per sale', 'orange')}
      ${tile('/freelance', 'users', 'Freelance', `${s.gigs || 0} open project${s.gigs === 1 ? '' : 's'}`, 'blue')}
      ${tile('/freelance?cat=clipping', 'play', 'Clipping & editing', 'Edit videos for creators', 'red')}
      ${tile('/fundraisers', 'heart', 'Fundraisers', 'Verified by Shukr', 'green')}
      ${tile('/communities', 'users', 'Paid communities', 'Members-only groups', 'violet')}
      ${tile('/creator', 'chart', 'Creator rewards', 'Earn from your posts', 'pink')}
      ${tile('/market', 'bag', 'Marketplace', 'Sell anything', 'teal')}
      ${tile('/jobs', 'briefcase', 'Jobs', 'Find work or hire', 'gold')}
    </div>`;
}

export async function viewReferrals() {
  const p = shell('Refer & earn', { back: '/earn' }); p.classList.add('er-page');
  const d = await api('/referrals'); const link = `${location.origin}/?ref=${d.code}`;
  p.innerHTML = `<div class="rf-hero"><span class="rf-ic">${I.gift}</span><h2>Get paid to share Shukr</h2><p>Share your link. When someone joins with it and buys anything — Premium, a course, a membership, a listing — you earn real money in your wallet. Every purchase they make for a full year counts.</p></div>
    <div class="rf-link"><input class="input" readonly value="${escAttr(link)}" id="rl"><button class="btn accent" id="rc">Copy</button></div>
    <div class="rf-share">${[['WhatsApp', '#25D366', `https://wa.me/?text=${encodeURIComponent('Join me on Shukr — gratitude, Quran, prayer and a halal community in one app 🤍 ' + link)}`], ['Telegram', '#229ED9', `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Join me on Shukr 🤍')}`], ['Facebook', '#1877F2', `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`], ['X', '#000', `https://x.com/intent/post?text=${encodeURIComponent('Join me on Shukr 🤍 ' + link)}`]].map(([n, c, h]) => `<a href="${escAttr(h)}" target="_blank" rel="noopener" style="--c:${c}">${n}</a>`).join('')}<button id="rs">More…</button></div>
    <div class="rf-stats"><div><b>${d.clicks}</b><small>Link opens</small></div><div><b>${d.invited.length}</b><small>Joined</small></div><div><b>${d.paying}</b><small>Purchased</small></div><div><b>${$usd(d.earned)}</b><small>Earned</small></div></div>
    <h4 class="er-h">How it works</h4><ol class="rf-steps"><li><b>Share</b> your link on WhatsApp, Instagram, TikTok or anywhere.</li><li><b>Friends join</b> Shukr using your link.</li><li><b>You earn</b> every time they buy something — paid into your wallet automatically.</li><li><b>Cash out</b> to your bank, PayPal or mobile money.</li></ol>
    <h4 class="er-h">People you invited</h4>${d.invited.map(x => `<div class="sx-row"><span class="sx-av">${x.avatar ? `<img src="${escAttr(x.avatar)}" alt="">` : esc((x.name || '?')[0])}</span><span class="grow"><b>${esc(x.name || x.username || 'Member')}</b><small>Joined ${ago(x.created_at)} ago</small></span>${x.paid ? '<span class="pill ok">Purchased</span>' : '<span class="pill">Joined</span>'}</div>`).join('') || '<p class="muted small">No one yet — share your link to get started.</p>'}
    ${d.top.length ? `<h4 class="er-h">Top inviters this month</h4>${d.top.map((t, i) => `<div class="sx-row"><b class="rf-rank">${i + 1}</b><span class="grow">${esc(t.name || t.username)}</span><b>${t.n}</b></div>`).join('')}` : ''}`;
  $('#rc', p).onclick = () => { navigator.clipboard?.writeText(link); toast('Link copied'); };
  $('#rs', p).onclick = () => navigator.share ? navigator.share({ title: 'Shukr', text: 'Join me on Shukr 🤍', url: link }).catch(() => {}) : ($('#rc', p).click());
}

export async function viewWallet() {
  const p = shell('Wallet', { back: '/earn' }); p.classList.add('er-page');
  const d = await api('/wallet');
  const label = { tip: 'Tip', sale: 'Sale', affiliate: 'Affiliate', referral: 'Referral', freelance: 'Freelance', fundraiser: 'Fundraiser', community: 'Community', cashout: 'Cash out', creator: 'Creator rewards' };
  p.innerHTML = `<div class="wl-card"><small>Available balance</small><b>${$usd(d.balance)}</b>${d.pending ? `<span>${$usd(d.pending)} on the way from active projects</span>` : ''}<button class="btn" id="co" ${d.balance < d.minCashout ? 'disabled' : ''}>Cash out</button>${d.balance < d.minCashout ? `<small>Cash out from ${$usd(d.minCashout)}</small>` : ''}</div>
    ${d.payouts.length ? `<h4 class="er-h">Cash outs</h4>${d.payouts.map(x => `<div class="wl-row"><span>${new Date(x.created_at).toLocaleDateString()}</span><b>${$usd(x.amount)}</b><span class="pill ${x.status === 'paid' ? 'ok' : ''}">${x.status === 'requested' ? 'Processing' : x.status}</span></div>`).join('')}` : ''}
    <h4 class="er-h">Activity</h4>${d.tx.map(x => `<div class="wl-row"><span class="grow"><b>${label[x.kind] || x.kind}</b><small>${esc(x.note || '')} · ${ago(x.created_at)} ago</small></span><b class="${x.amount < 0 ? 'neg' : 'pos'}">${x.amount < 0 ? '−' : '+'}${$usd(Math.abs(x.amount))}</b></div>`).join('') || '<p class="muted small">Your earnings will show up here.</p>'}`;
  $('#co', p).onclick = () => sheet(`<h3>Cash out</h3><label class="lbl">Amount (USD)</label><input class="input" id="ca" type="number" min="${d.minCashout}" max="${d.balance}" step="0.01" value="${d.balance}">
    <label class="lbl">Send to</label><select class="input" id="cm"><option value="bank">Bank transfer</option><option value="paypal">PayPal</option><option value="wise">Wise</option><option value="payoneer">Payoneer</option><option value="mobile-money">Mobile money</option></select>
    <label class="lbl">Account details</label><textarea class="input" id="cd" rows="3" placeholder="Bank name, account name & number — or your PayPal email"></textarea><button class="btn accent block" id="cs">Request cash out</button><p class="faint small">Cash outs are reviewed and sent within 3–5 business days.</p>`, (sh, close) => {
    $('#cs', sh).onclick = async () => { try { await api('/wallet/cashout', { body: { amount: $('#ca', sh).value, method: $('#cm', sh).value, details: $('#cd', sh).value } }); close(); toast('Cash out requested'); viewWallet(); } catch (e) { toast(e.message); } }; });
}

export async function viewTips() {
  const p = back('Tips'); p.classList.add('er-page'); const me = state.user?.username;
  const link = `${location.origin}/#/u/${me || ''}?tip=1`;
  p.innerHTML = `<div class="rf-hero"><span class="rf-ic">${I.heart}</span><h2>Receive tips</h2><p>Anyone can tip you from your profile or your posts. Share your tip link so fans can support you directly.</p></div>
    <div class="rf-link"><input class="input" readonly value="${escAttr(link)}"><button class="btn accent" id="tc">Copy</button></div>
    <h4 class="er-h">Send a tip</h4>${form('<input class="input" name="u" placeholder="@username" required><input class="input" name="a" type="number" min="1" max="500" placeholder="Amount (USD)" required>', 'Send tip')}`;
  $('#tc', p).onclick = () => { navigator.clipboard?.writeText(link); toast('Copied'); };
  $('form', p).onsubmit = e => { e.preventDefault(); buy('/tip', { username: e.target.u.value.replace(/^@/, ''), amount: e.target.a.value }, () => toast('Thank you!')); };
}
export function tipSheet(username) {
  sheet(`<h3>Tip @${esc(username)}</h3><div class="chips wrap">${[2, 5, 10, 20, 50].map(a => `<button class="chip" data-a="${a}">$${a}</button>`).join('')}</div><input class="input" id="ta" type="number" min="1" max="500" placeholder="Other amount"><button class="btn accent block" id="ts">Send tip</button>`, (sh, close) => {
    $$('[data-a]', sh).forEach(b => b.onclick = () => { $('#ta', sh).value = b.dataset.a; }); $('#ts', sh).onclick = () => { close(); buy('/tip', { username, amount: $('#ta', sh).value }, () => toast('Tip sent 🤍')); }; });
}

const KIND = { digital: ['Digital products', 'Sell eBooks, courses, Quran study guides, presets, templates — delivered instantly.'], membership: ['Subscriptions', 'Fans pay monthly for exclusive perks: bonus content, early access, live Q&As.'], service: ['Services', 'Sell your time: coaching, tutoring, design, editing, consultations.'] };
export async function viewProducts(query) {
  const kind = query?.get?.('kind') || 'digital', [title, sub] = KIND[kind] || KIND.digital; const p = back(title); p.classList.add('er-page');
  const [all, mine] = await Promise.all([api('/products?kind=' + kind), api('/products/mine')]);
  const card = x => `<a class="pd-card" href="#/product/${x.id}">${x.cover ? `<img src="${escAttr(x.cover)}" alt="">` : `<span class="pd-ph">${I[kind === 'membership' ? 'star' : kind === 'service' ? 'briefcase' : 'download']}</span>`}<div><b>${esc(x.title)}</b><small>@${esc(x.username || '')} · ${x.sales} sold</small><span class="pd-price">${$usd(x.price)}${kind === 'membership' ? '/mo' : ''}</span></div></a>`;
  p.innerHTML = `<p class="muted">${sub}</p><button class="btn accent block" id="np">${I.plus} Create ${kind === 'membership' ? 'a subscription' : kind === 'service' ? 'a service' : 'a product'}</button>
    ${mine.selling.filter(x => x.kind === kind).length ? `<h4 class="er-h">Yours</h4>${mine.selling.filter(x => x.kind === kind).map(card).join('')}` : ''}
    ${kind === 'service' && mine.orders.length ? `<h4 class="er-h">Orders</h4>${mine.orders.map(o => `<div class="jb-card"><b>${esc(o.title)}</b><small>@${esc(o.buyer || o.buyer_name)} · ${$usd(o.amount)} · ${o.status}</small>${o.note ? `<p>${esc(o.note)}</p>` : ''}${o.status === 'paid' ? `<button class="btn accent sm" data-dl="${o.id}">Mark delivered</button>` : ''}</div>`).join('')}` : ''}
    ${mine.bought.filter(x => x.kind === kind).length ? `<h4 class="er-h">Purchased</h4>${mine.bought.filter(x => x.kind === kind).map(b => `<a class="jb-card" href="#/product/${b.product_id}"><b>${esc(b.title)}</b><small>${b.status}${b.until ? ' · until ' + new Date(b.until).toLocaleDateString() : ''}</small></a>`).join('')}` : ''}
    <h4 class="er-h">Explore</h4>${all.products.filter(x => x.user_id !== state.user?.id).map(card).join('') || '<p class="muted small">Be the first to sell here.</p>'}`;
  $$('[data-dl]', p).forEach(b => b.onclick = async () => { const m = prompt('Delivery message or link for the buyer'); if (m == null) return; await api(`/purchases/${b.dataset.dl}/deliver`, { body: { message: m } }); viewProducts(query); });
  $('#np', p).onclick = () => sheet(`<h3>New ${kind === 'membership' ? 'subscription' : kind}</h3><input class="input" id="pt" placeholder="Title" maxlength="100"><textarea class="input" id="pdd" rows="3" placeholder="Description" maxlength="4000"></textarea>
    <input class="input" id="pp" type="number" min="1" step="0.01" placeholder="Price (USD)${kind === 'membership' ? ' per month' : ''}">
    ${kind === 'digital' ? '<input class="input" id="pf" placeholder="Download link (https://…) buyers receive">' : ''}${kind !== 'digital' ? '<textarea class="input" id="pk" rows="3" placeholder="Perks / what’s included — one per line"></textarea>' : ''}
    <label class="mk-add" style="width:auto;height:64px;flex-direction:row;gap:8px">${I.camera}<span id="pcl">Cover image</span><input type="file" accept="image/*" hidden id="pc"></label>
    <label class="row"><input type="checkbox" id="pa" checked> Let others promote it as an affiliate</label><button class="btn accent block" id="ps">Publish</button>`, (sh, close) => {
    let cover = ''; $('#pc', sh).onchange = async e => { try { cover = await upload(e.target.files[0]); $('#pcl', sh).textContent = 'Cover added ✓'; } catch (er) { toast(er.message); } };
    $('#ps', sh).onclick = async () => { try { await api('/products', { body: { kind, title: $('#pt', sh).value, description: $('#pdd', sh).value, price: $('#pp', sh).value, fileUrl: $('#pf', sh)?.value, perks: ($('#pk', sh)?.value || '').split('\n'), cover, affiliate: $('#pa', sh).checked } }); close(); toast('Published'); viewProducts(query); } catch (e) { toast(e.message); } }; });
}
export async function viewProduct(id, query) {
  const p = back('Product'); p.classList.add('er-page');
  const { product: x, affCode } = await api('/products/' + id); const aff = query?.get?.('aff');
  p.innerHTML = `${x.cover ? `<img class="pd-hero" src="${escAttr(x.cover)}" alt="">` : ''}<h2>${esc(x.title)}</h2><a href="#/u/${escAttr(x.username || '')}" class="muted">by @${esc(x.username || x.seller)}</a>
    <div class="pd-buy"><b>${$usd(x.price)}${x.kind === 'membership' ? '<small>/month</small>' : ''}</b>${x.owned ? (x.file_url ? `<a class="btn accent" href="${escAttr(x.file_url)}" target="_blank" rel="noopener">${I.download} Download</a>` : '<span class="pill ok">Active</span>') : x.user_id === state.user?.id ? '<span class="pill">Your product</span>' : `<button class="btn accent" id="bb">${x.kind === 'membership' ? 'Subscribe' : x.kind === 'service' ? 'Order' : 'Buy'}</button>`}</div>
    ${x.description ? `<p style="white-space:pre-wrap">${esc(x.description)}</p>` : ''}${(x.perks || []).length ? `<ul class="pd-perks">${x.perks.map(k => `<li>${I.check} ${esc(k)}</li>`).join('')}</ul>` : ''}
    ${affCode && x.user_id !== state.user?.id ? `<div class="card soft"><b>Promote this & earn</b><p class="small muted">Share your affiliate link — you earn on every sale it brings.</p><div class="rf-link"><input class="input" readonly value="${escAttr(`${location.origin}/#/product/${x.id}?aff=${affCode}`)}" id="al"><button class="btn" id="ac">Copy</button></div></div>` : ''}`;
  $('#ac', p)?.addEventListener('click', () => { navigator.clipboard?.writeText($('#al', p).value); toast('Copied'); });
  $('#bb', p)?.addEventListener('click', () => { const go_ = note => buy(`/products/${x.id}/buy`, { aff, note }, () => viewProduct(id, query)); if (x.kind === 'service') { const n = prompt('Tell the seller what you need'); if (n != null) go_(n); } else go_(); });
}
export async function viewAffiliate() {
  const p = back('Affiliate'); p.classList.add('er-page'); const { products } = await api('/products');
  const list = products.filter(x => x.affiliate && x.user_id !== state.user?.id);
  p.innerHTML = `<div class="rf-hero"><span class="rf-ic">${I.link}</span><h2>Earn as an affiliate</h2><p>Pick a product, share your personal link, and earn on every sale it brings — no stock, no delivery.</p></div>
    ${list.map(x => `<a class="pd-card" href="#/product/${x.id}">${x.cover ? `<img src="${escAttr(x.cover)}" alt="">` : `<span class="pd-ph">${I.link}</span>`}<div><b>${esc(x.title)}</b><small>@${esc(x.username || '')} · ${x.sales} sold</small><span class="pd-price">${$usd(x.price)}</span></div></a>`).join('') || '<p class="muted small">No affiliate products yet.</p>'}`;
}

const GC = { clipping: 'Clipping', 'video-editing': 'Video editing', design: 'Design', writing: 'Writing', 'social-media': 'Social media', translation: 'Translation', tutoring: 'Tutoring', development: 'Development', 'voice-over': 'Voice-over', other: 'Other' };
export async function viewFreelance(query) {
  const tab = query?.get?.('tab') || 'find', cat = query?.get?.('cat') || ''; const p = shell('Freelance', { back: '/earn' }); p.classList.add('er-page');
  const seg = `<nav class="social-seg mk-seg"><a href="#/freelance" ${tab === 'find' ? 'aria-current="page"' : ''}>Find work</a><a href="#/freelance?tab=post" ${tab === 'post' ? 'aria-current="page"' : ''}>Hire</a><a href="#/freelance?tab=mine" ${tab === 'mine' ? 'aria-current="page"' : ''}>My projects</a></nav>`;
  if (tab === 'post') { p.innerHTML = seg + form(`<h3>Post a project</h3><input class="input" name="t" placeholder="e.g. Edit 10 short clips from my podcast" required><select class="input" name="c">${Object.entries(GC).map(([k, l]) => `<option value="${k}" ${k === cat ? 'selected' : ''}>${l}</option>`).join('')}</select><textarea class="input" name="d" rows="5" placeholder="Describe what you need, deadline and examples" required></textarea><input class="input" name="b" type="number" min="5" placeholder="Budget (USD)" required><p class="faint small">You only pay when you hire someone. Your payment is held safely and released when you approve the work.</p>`, 'Post project');
    $('form', p).onsubmit = async e => { e.preventDefault(); const f = e.target; try { await api('/gigs', { body: { title: f.t.value, category: f.c.value, description: f.d.value, budget: f.b.value } }); toast('Project posted'); go('/freelance?tab=mine'); } catch (er) { toast(er.message); } }; return; }
  if (tab === 'mine') { const d = await api('/gigs/mine');
    p.innerHTML = seg + `<h4 class="er-h">Projects you posted</h4>${d.posted.map(g => `<div class="jb-card"><b>${esc(g.title)}</b><small>${GC[g.category]} · ${$usd(g.budget)} · ${g.status}</small>${(g.bids || []).map(b => `<div class="fl-bid"><div class="grow"><b>@${esc(b.username || b.name)}</b> · ${$usd(b.amount)} · ${b.days}d<p>${esc(b.note || '')}</p>${b.portfolio ? `<a href="${escAttr(b.portfolio)}" target="_blank" rel="noopener">Portfolio</a>` : ''}${b.delivery ? `<p><b>Delivered:</b> ${esc(b.delivery)}</p>` : ''}</div>${g.status === 'open' ? `<button class="btn accent sm" data-hire="${b.id}">Hire</button>` : b.status === 'delivered' ? `<button class="btn accent sm" data-ok="${b.id}">Approve & pay</button>` : `<span class="pill">${b.status}</span>`}</div>`).join('') || '<p class="muted small">No proposals yet.</p>'}</div>`).join('') || '<p class="muted small">None yet.</p>'}
      <h4 class="er-h">Your proposals</h4>${d.bids.map(b => `<div class="jb-card"><b>${esc(b.title)}</b><small>${$usd(b.amount)} · ${b.status}</small>${b.status === 'hired' ? `<button class="btn accent sm" data-dv="${b.id}">Deliver work</button>` : ''}</div>`).join('') || '<p class="muted small">None yet.</p>'}`;
    $$('[data-hire]', p).forEach(b => b.onclick = () => buy(`/gigs/bids/${b.dataset.hire}/hire`, {}, () => viewFreelance(query)));
    $$('[data-ok]', p).forEach(b => b.onclick = async () => { if (!confirm('Approve the work and release payment?')) return; await api(`/gigs/bids/${b.dataset.ok}/approve`, { body: {} }); toast('Paid — thank you!'); viewFreelance(query); });
    $$('[data-dv]', p).forEach(b => b.onclick = async () => { const l = prompt('Link to your finished work (Google Drive, Dropbox, etc.)'); if (!l) return; try { await api(`/gigs/bids/${b.dataset.dv}/deliver`, { body: { delivery: l } }); toast('Delivered'); viewFreelance(query); } catch (e) { toast(e.message); } }); return; }
  const d = await api('/gigs?cat=' + encodeURIComponent(cat));
  p.innerHTML = seg + `<div class="mk-cats"><a class="mk-cat ${!cat ? 'on' : ''}" href="#/freelance">All</a>${Object.entries(GC).map(([k, l]) => `<a class="mk-cat ${cat === k ? 'on' : ''}" href="#/freelance?cat=${k}">${l}</a>`).join('')}</div>
    ${d.gigs.map(g => `<div class="jb-card"><div class="row between"><b>${esc(g.title)}</b><b>${$usd(g.budget)}</b></div><small>${GC[g.category]} · by @${esc(g.username || g.client_name)} · ${g.bids} proposal${g.bids === 1 ? '' : 's'} · ${ago(g.created_at)} ago</small><p>${esc(g.description.slice(0, 220))}</p>${g.client === state.user?.id ? '<span class="pill">Your project</span>' : g.bid ? '<span class="pill ok">Proposal sent</span>' : `<button class="btn accent sm" data-bid="${g.id}">Send proposal</button>`}</div>`).join('') || `<p class="muted">No open projects${cat ? ' here' : ''} yet. <a href="#/freelance?tab=post">Post one</a>.</p>`}`;
  $$('[data-bid]', p).forEach(b => b.onclick = () => sheet(`<h3>Your proposal</h3><input class="input" id="ba" type="number" min="5" placeholder="Your price (USD)"><input class="input" id="bd" type="number" min="1" max="90" placeholder="Days to deliver"><textarea class="input" id="bn" rows="4" placeholder="Why you’re a great fit"></textarea><input class="input" id="bp" placeholder="Portfolio link (https://…)"><button class="btn accent block" id="bs">Send proposal</button>`, (sh, close) => {
    $('#bs', sh).onclick = async () => { try { await api(`/gigs/${b.dataset.bid}/bid`, { body: { amount: $('#ba', sh).value, days: $('#bd', sh).value, note: $('#bn', sh).value, portfolio: $('#bp', sh).value } }); close(); toast('Proposal sent'); viewFreelance(query); } catch (e) { toast(e.message); } }; }));
}

export async function viewFundraisers() {
  const p = back('Fundraisers'); p.classList.add('er-page'); const d = await api('/campaigns');
  const bar = c => `<div class="cf-bar"><i style="width:${Math.min(100, 100 * c.raised / c.goal)}%"></i></div><small><b>${$usd(c.raised)}</b> raised of ${$usd(c.goal)}</small>`;
  p.innerHTML = `<div class="rf-hero"><span class="rf-ic">${I.heart}</span><h2>Fundraisers</h2><p>Every fundraiser is checked by the Shukr team before it goes live.</p></div><button class="btn accent block" id="nf">${I.plus} Start a fundraiser</button>
    ${d.mine.length ? `<h4 class="er-h">Yours</h4>${d.mine.map(c => `<a class="jb-card" href="#/fundraiser/${c.id}"><b>${esc(c.title)}</b><small>${c.status === 'pending' ? 'Waiting for verification' : c.status}${c.review_note ? ' · ' + esc(c.review_note) : ''}</small></a>`).join('')}` : ''}
    <h4 class="er-h">Verified fundraisers</h4>${d.campaigns.map(c => `<a class="cf-card" href="#/fundraiser/${c.id}">${c.cover ? `<img src="${escAttr(c.cover)}" alt="">` : ''}<div><span class="pill ok">${I.check} Verified</span><b>${esc(c.title)}</b><p>${esc(c.story)}…</p>${bar(c)}</div></a>`).join('') || '<p class="muted small">No fundraisers yet.</p>'}`;
  $('#nf', p).onclick = () => sheet(`<h3>Start a fundraiser</h3><input class="input" id="ft" placeholder="Title" maxlength="120"><select class="input" id="fc">${['Medical', 'Education', 'Masjid', 'Emergency', 'Orphans', 'Water', 'Community', 'Other'].map(x => `<option>${x}</option>`).join('')}</select><textarea class="input" id="fs" rows="5" placeholder="Tell your story: who it helps and how the money will be used"></textarea><input class="input" id="fg" type="number" min="50" placeholder="Goal (USD)">
    <label class="mk-add" style="width:auto;height:64px;flex-direction:row;gap:8px">${I.camera}<span id="fcl">Cover photo</span><input type="file" accept="image/*" hidden id="fp"></label><label class="lbl">Proof for our verification team (private)</label><textarea class="input" id="fe" rows="3" placeholder="Hospital letter, school invoice, masjid registration, contact person…"></textarea><button class="btn accent block" id="fsb">Submit for verification</button>`, (sh, close) => {
    let cover = ''; $('#fp', sh).onchange = async e => { try { cover = await upload(e.target.files[0]); $('#fcl', sh).textContent = 'Photo added ✓'; } catch (er) { toast(er.message); } };
    $('#fsb', sh).onclick = async () => { try { await api('/campaigns', { body: { title: $('#ft', sh).value, category: $('#fc', sh).value, story: $('#fs', sh).value, goal: $('#fg', sh).value, cover, evidence: $('#fe', sh).value } }); close(); toast('Submitted — we’ll review it soon'); viewFundraisers(); } catch (e) { toast(e.message); } }; });
}
export async function viewFundraiser(id) {
  const p = shell('Fundraiser', { back: '/fundraisers' }); p.classList.add('er-page'); const { campaign: c } = await api('/campaigns/' + id);
  p.innerHTML = `${c.cover ? `<img class="pd-hero" src="${escAttr(c.cover)}" alt="">` : ''}${c.status === 'verified' ? `<span class="pill ok">${I.check} Verified by Shukr</span>` : `<span class="pill">${c.status}</span>`}<h2>${esc(c.title)}</h2><small class="muted">by @${esc(c.username || c.owner)}</small>
    <div class="cf-bar big"><i style="width:${Math.min(100, 100 * c.raised / c.goal)}%"></i></div><p><b>${$usd(c.raised)}</b> raised of ${$usd(c.goal)} · ${c.donors} donor${c.donors === 1 ? '' : 's'}</p>
    ${c.status === 'verified' ? `<div class="chips wrap">${[5, 10, 25, 50, 100].map(a => `<button class="chip" data-a="${a}">$${a}</button>`).join('')}</div><input class="input" id="da" type="number" min="1" placeholder="Amount (USD)"><input class="input" id="dm" placeholder="Message (optional)"><label class="row"><input type="checkbox" id="dn"> Donate anonymously</label><button class="btn accent block" id="dd">Donate</button>` : ''}
    <h4 class="er-h">Story</h4><p style="white-space:pre-wrap">${esc(c.story)}</p>${c.evidence ? `<h4 class="er-h">Verification evidence (private)</h4><p class="small">${esc(c.evidence)}</p>` : ''}
    ${c.recent.length ? `<h4 class="er-h">Recent donations</h4>${c.recent.map(r => `<div class="wl-row"><span class="grow"><b>${esc(r.name)}</b><small>${esc(r.message || '')}</small></span><b>${$usd(r.amount)}</b></div>`).join('')}` : ''}`;
  $$('[data-a]', p).forEach(b => b.onclick = () => { $('#da', p).value = b.dataset.a; });
  $('#dd', p)?.addEventListener('click', () => buy(`/campaigns/${c.id}/donate`, { amount: $('#da', p).value, message: $('#dm', p).value, anonymous: $('#dn', p).checked }, () => viewFundraiser(id)));
}
export async function viewCommunities(query) {
  const open = query?.get?.('id'); const p = back(open ? 'Community' : 'Paid communities'); p.classList.add('er-page');
  const { communities } = await api('/communities');
  if (open) { const c = communities.find(x => x.id == open); if (!c) { p.innerHTML = '<p class="muted">Not found.</p>'; return; }
    let posts = null; try { posts = (await api(`/communities/${c.id}/posts`)).posts; } catch {}
    p.innerHTML = `<h2>${esc(c.name)}</h2><p class="muted">${esc(c.description || '')}</p><small>${c.members} member${c.members === 1 ? '' : 's'} · ${$usd(c.price)}/month</small>
      ${posts ? `<form id="cpf" class="card"><textarea class="input" name="b" rows="2" placeholder="Share with the community"></textarea><button class="btn accent sm">Post</button></form>${posts.map(x => `<div class="jb-card"><b>${esc(x.name)}</b> <small>${ago(x.created_at)} ago</small><p style="white-space:pre-wrap">${esc(x.body)}</p></div>`).join('') || '<p class="muted small">No posts yet.</p>'}`
      : `<ul class="pd-perks">${(c.perks || []).map(k => `<li>${I.check} ${esc(k)}</li>`).join('')}</ul><button class="btn accent block" id="cj">Join for ${$usd(c.price)}/month</button>`}`;
    $('#cj', p)?.addEventListener('click', () => buy(`/communities/${c.id}/join`, {}, () => viewCommunities(query)));
    $('#cpf', p)?.addEventListener('submit', async e => { e.preventDefault(); try { await api(`/communities/${c.id}/posts`, { body: { body: e.target.b.value } }); viewCommunities(query); } catch (er) { toast(er.message); } }); return; }
  p.innerHTML = `<div class="rf-hero"><span class="rf-ic">${I.users}</span><h2>Paid communities</h2><p>Create a members-only circle — a halaqa, study group, fitness crew or business mastermind — and earn monthly.</p></div><button class="btn accent block" id="nc">${I.plus} Create a community</button>
    ${communities.map(c => `<a class="pd-card" href="#/communities?id=${c.id}">${c.cover ? `<img src="${escAttr(c.cover)}" alt="">` : `<span class="pd-ph">${I.users}</span>`}<div><b>${esc(c.name)}</b><small>by @${esc(c.username || c.owner_name)} · ${c.members} members</small><span class="pd-price">${c.joined ? 'Joined' : $usd(c.price) + '/mo'}</span></div></a>`).join('') || '<p class="muted small">No communities yet.</p>'}`;
  $('#nc', p).onclick = () => sheet(`<h3>New community</h3><input class="input" id="cn" placeholder="Name"><textarea class="input" id="cd" rows="3" placeholder="What is it about?"></textarea><input class="input" id="cp" type="number" min="1" placeholder="Monthly price (USD)"><textarea class="input" id="ck" rows="3" placeholder="Member perks — one per line"></textarea><button class="btn accent block" id="cs">Create</button>`, (sh, close) => {
    $('#cs', sh).onclick = async () => { try { const r = await api('/communities', { body: { name: $('#cn', sh).value, description: $('#cd', sh).value, price: $('#cp', sh).value, perks: $('#ck', sh).value.split('\n') } }); close(); go('/communities?id=' + r.id); } catch (e) { toast(e.message); } }; });
}
// Developer: verify fundraisers
export async function viewAdminFundraisers() {
  if (!state.user?.developer) { go('/fyp'); return; }
  const p = shell('Verify fundraisers', { back: '/admin' }); const d = await api('/admin/campaigns');
  p.innerHTML = d.campaigns.map(c => `<div class="jb-card"><b>${esc(c.title)}</b><small>${esc(c.owner)} · ${esc(c.email)} · goal $${c.goal} · <b>${c.status}</b></small><p>${esc(c.story.slice(0, 400))}</p><p class="small"><b>Evidence:</b> ${esc(c.evidence || '')}</p>
    <div class="row">${c.status !== 'verified' ? `<button class="btn accent sm" data-v="${c.id}" data-s="verified">Verify</button>` : ''}${c.status !== 'rejected' ? `<button class="btn ghost sm" data-v="${c.id}" data-s="rejected">Reject</button>` : ''}${c.status === 'verified' ? `<button class="btn ghost sm" data-v="${c.id}" data-s="closed">Close</button>` : ''}</div></div>`).join('') || '<p class="muted">Nothing to review.</p>';
  $$('[data-v]', p).forEach(b => b.onclick = async () => { const note = b.dataset.s === 'verified' ? '' : (prompt('Reason (shown to the organiser)') || ''); await api('/admin/campaigns/' + b.dataset.v, { body: { status: b.dataset.s, note } }); viewAdminFundraisers(); });
}
