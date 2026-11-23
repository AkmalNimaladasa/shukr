// Monetisation: subscriptions (Memory $8/mo, No-ads $5/mo), advertiser campaigns (CPM), creator ad-revenue share,
// coins & gifts, creator payouts and the developer (admin) dashboard.
// Payments go through PayHere when PAYHERE_MERCHANT_ID/SECRET are set. Without keys the checkout is a clearly
// labelled DEMO that only administrators can complete, so nobody receives paid features for free.
const crypto = require('crypto');

const SCHEMA = [
`CREATE TABLE IF NOT EXISTS payments (
 order_id TEXT PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE SET NULL, kind TEXT NOT NULL, ref_id TEXT,
 amount_usd NUMERIC(12,2) NOT NULL, status TEXT NOT NULL DEFAULT 'pending', provider TEXT NOT NULL, provider_ref TEXT, sub_id TEXT,
 raw JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), paid_at TIMESTAMPTZ)`,
`CREATE TABLE IF NOT EXISTS subscriptions (
 user_id INT REFERENCES users(id) ON DELETE CASCADE, plan TEXT NOT NULL, active_until TIMESTAMPTZ NOT NULL,
 cancel_at_end BOOLEAN NOT NULL DEFAULT false, sub_id TEXT, started_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(user_id,plan))`,
`CREATE TABLE IF NOT EXISTS ad_campaigns (
 id TEXT PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, brand TEXT NOT NULL, headline TEXT NOT NULL,
 cta TEXT NOT NULL DEFAULT 'Learn more', link TEXT NOT NULL, media JSONB NOT NULL, budget_usd NUMERIC(12,2) NOT NULL,
 cpm_usd NUMERIC(8,2) NOT NULL, spent_usd NUMERIC(12,4) NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'unpaid',
 review_note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
`CREATE TABLE IF NOT EXISTS ad_impressions (
 id BIGSERIAL PRIMARY KEY, campaign_id TEXT REFERENCES ad_campaigns(id) ON DELETE CASCADE, viewer INT REFERENCES users(id) ON DELETE SET NULL,
 creator_id INT REFERENCES users(id) ON DELETE SET NULL, day DATE NOT NULL, cost_usd NUMERIC(12,6) NOT NULL, creator_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
 clicked BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(campaign_id,viewer,day))`,
`CREATE INDEX IF NOT EXISTS ad_impr_creator ON ad_impressions(creator_id)`,
`CREATE TABLE IF NOT EXISTS coin_wallets (user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, coins INT NOT NULL DEFAULT 0 CHECK(coins>=0))`,
`CREATE TABLE IF NOT EXISTS gifts (
 id BIGSERIAL PRIMARY KEY, sender INT REFERENCES users(id) ON DELETE SET NULL, recipient INT REFERENCES users(id) ON DELETE CASCADE,
 post_id TEXT, gift TEXT NOT NULL, coins INT NOT NULL, creator_usd NUMERIC(12,4) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
`CREATE TABLE IF NOT EXISTS creators (
 user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, joined_at TIMESTAMPTZ NOT NULL DEFAULT now(), payout_details TEXT, status TEXT NOT NULL DEFAULT 'active')`,
`CREATE TABLE IF NOT EXISTS payouts (
 id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, amount_usd NUMERIC(12,2) NOT NULL, details TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'requested', reference TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), paid_at TIMESTAMPTZ)`
];
const GIFTS = [['rose', 'Rose', '🌹', 1], ['dates', 'Dates', '🌴', 5], ['lantern', 'Lantern', '🏮', 20], ['moon', 'Crescent', '🌙', 99], ['kaaba', 'Mosque', '🕌', 299]];
const COIN_PACKS = [[70, 0.99], [350, 4.99], [700, 9.99], [1400, 19.99], [3500, 49.99]];

module.exports = function registerMonetize(ctx) {
  const { app, q, auth, wrap } = ctx;
  const MID = process.env.PAYHERE_MERCHANT_ID || '', SECRET = process.env.PAYHERE_MERCHANT_SECRET || '';
  const LIVE = !!(MID && SECRET), SANDBOX = process.env.PAYHERE_SANDBOX !== '0';
  const PRICES = { memory: +(process.env.MEMORY_USD || 8), memory_plus: +(process.env.MEMORY_PLUS_USD || 20), mentor: +(process.env.MENTOR_USD || 200), noads: +(process.env.NOADS_USD || 5) };
  // Alim memory tiers: 0 none · 1 Memory ($8) · 2 Memory Plus ($20) · 3 Life Mentor ($200)
  const TIER_OF = { memory: 1, memory_plus: 2, mentor: 3 };
  const PLAN_NAMES = { memory: 'Alim Memory', memory_plus: 'Alim Memory Plus', mentor: 'Alim Life Mentor', noads: 'No Ads' };
  const CPM = +(process.env.AD_CPM_USD || 5), CREATOR_SHARE = +(process.env.CREATOR_SHARE_PCT || 30) / 100; // creators get 30% of ad revenue, Shukr keeps 70% (never shown to users)
  const COIN_USD = +(process.env.COIN_VALUE_USD || 0.005); // creator value per gifted coin (platform keeps the rest of the coin price)
  const MIN_FOLLOWERS = +(process.env.CREATOR_MIN_FOLLOWERS || 5000), MIN_VIEWS_28D = +(process.env.CREATOR_MIN_VIEWS_28D || 150000), MIN_POSTS = +(process.env.CREATOR_MIN_POSTS || 3), MIN_PAYOUT = +(process.env.MIN_PAYOUT_USD || 10);
  const AD_EVERY = +(process.env.AD_EVERY || 6);
  const ADMINS = (process.env.NODE_ENV === 'test' && process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.toLowerCase().split(',').map(s => s.trim()) : ['akmal.yasaz@gmail.com']); // the only developer account (dashboard, demo payments, moderation)
  const isAdmin = u => !!u && ADMINS.includes(String(u.email || '').toLowerCase());
  ctx.isAdmin = isAdmin; ctx.adminEmails = ADMINS;
  const fail = (res, s, error) => res.status(s).json({ error });
  const md5U = s => crypto.createHash('md5').update(s).digest('hex').toUpperCase();
  const money = n => Math.round(+n * 100) / 100;
  let ready = null;
  const ensure = () => ready || (ready = SCHEMA.reduce((p, sql) => p.then(() => q(sql)), Promise.resolve()).catch(e => { ready = null; throw e; }));
  ctx.monetizeReady = ensure;

  async function plans(user) {
    if (!user) return {};
    // Premium is only for people who paid. The developer gets it only when DEV_PREMIUM=1 (for testing).
    if (isAdmin(user) && process.env.DEV_PREMIUM === '1') return Object.fromEntries(Object.keys(PRICES).map(k => [k, { until: null, admin: true }]));
    await ensure();
    const rows = (await q('SELECT plan,active_until,cancel_at_end FROM subscriptions WHERE user_id=$1 AND active_until>now()', [user.id])).rows;
    return Object.fromEntries(rows.map(r => [r.plan, { until: r.active_until, cancelAtEnd: r.cancel_at_end }]));
  }
  const userById = async id => (await q('SELECT id,email,name FROM users WHERE id=$1', [id])).rows[0];
  ctx.memoryTier = async userOrId => { const u = typeof userOrId === 'object' ? userOrId : await userById(userOrId); const p = await plans(u); return Math.max(0, ...Object.keys(p).map(k => TIER_OF[k] || 0)); };
  // 'memory' means "any memory tier"; other names are exact.
  ctx.hasPlan = async (userOrId, plan) => { if (TIER_OF[plan]) return (await ctx.memoryTier(userOrId)) >= TIER_OF[plan]; const u = typeof userOrId === 'object' ? userOrId : await userById(userOrId); return !!(await plans(u))[plan]; };
  ctx.userPlans = plans;

  // ---------- Checkout ----------
  // Generic one-off/subscription checkout used by Jobs + Marketplace; ctx.onPaid[kind](refId) fires when paid.
  ctx.onPaid = ctx.onPaid || {};
  ctx.monetizeReady = () => ensure();
  ctx.createCheckout = async (req, user, kind, refId, usd, items) => { await ensure(); const orderId = await createOrder(user, kind, usd, String(refId), {}); return checkoutFor(req, user, orderId, items, usd, /^(jobs-seek|jobs-hire)$/.test(kind)); };
  ctx.createConsultationCheckout = async (req, user, consultId, usd, items) => { const orderId = await createOrder(user, 'consult', usd, String(consultId), { consultId }); return checkoutFor(req, user, orderId, items, usd, false); };
  async function createOrder(user, kind, usd, ref, meta) {
    const orderId = 'SH' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(3).toString('hex').toUpperCase();
    await q('INSERT INTO payments(order_id,user_id,kind,ref_id,amount_usd,provider,raw) VALUES($1,$2,$3,$4,$5,$6,$7)', [orderId, user.id, kind, ref || null, money(usd), LIVE ? 'payhere' : 'demo', JSON.stringify(meta || {})]);
    return orderId;
  }
  function checkoutFor(req, user, orderId, items, usd, recurring) {
    // PAYMENTS_OPEN=1 turns real checkout on. Until then (testing phase) nobody is charged; only the developer can complete test orders.
    if (!LIVE || process.env.PAYMENTS_OPEN !== '1') return { demo: true, orderId, amount: money(usd), currency: 'USD', items, canComplete: isAdmin(user) };
    const origin = (process.env.APP_PUBLIC_URL || (req.protocol + '://' + req.get('host'))).replace(/\/$/, '');
    const [first, ...rest] = (user.name || 'Shukr Member').split(' ');
    const fields = { merchant_id: MID, return_url: origin + '/#/premium?paid=' + orderId, cancel_url: origin + '/#/premium?cancel=' + orderId, notify_url: origin + '/api/pay/payhere/notify',
      order_id: orderId, items, currency: 'USD', amount: money(usd).toFixed(2), first_name: first, last_name: rest.join(' ') || '-', email: user.email, phone: '0000000000', address: '-', city: '-', country: 'Sri Lanka' };
    if (recurring) { fields.recurrence = '1 Month'; fields.duration = 'Forever'; }
    fields.hash = md5U(MID + orderId + fields.amount + 'USD' + md5U(SECRET));
    return { action: SANDBOX ? 'https://sandbox.payhere.lk/pay/checkout' : 'https://www.payhere.lk/pay/checkout', fields, orderId };
  }
  async function markPaid(orderId, { providerRef, subId, raw } = {}) {
    const p = (await q('SELECT * FROM payments WHERE order_id=$1', [orderId])).rows[0]; if (!p) return null;
    const renewal = p.status === 'paid';
    if (ctx.afterPaid) setTimeout(() => ctx.afterPaid({ ...p, amount_usd: p.amount_usd }).catch?.(() => {}), 0);
    if (renewal) {
      if (p.kind !== 'sub') return p;
      await q(`INSERT INTO payments(order_id,user_id,kind,ref_id,amount_usd,status,provider,provider_ref,sub_id,raw,paid_at) VALUES($1,$2,$3,$4,$5,'paid',$6,$7,$8,$9,now())`,
        [p.order_id + '-R' + Date.now().toString(36), p.user_id, p.kind, p.ref_id, p.amount_usd, p.provider, providerRef || null, subId || p.sub_id, JSON.stringify(raw || {})]);
    } else await q(`UPDATE payments SET status='paid',paid_at=now(),provider_ref=$2,sub_id=$3 WHERE order_id=$1`, [orderId, providerRef || null, subId || null]);
    if (p.kind === 'sub') {
      await q(`INSERT INTO subscriptions(user_id,plan,active_until,sub_id) VALUES($1,$2,now()+interval '1 month',$3)
        ON CONFLICT(user_id,plan) DO UPDATE SET active_until=GREATEST(subscriptions.active_until,now())+interval '1 month',cancel_at_end=false,sub_id=COALESCE($3,subscriptions.sub_id)`, [p.user_id, p.ref_id, subId || null]);
      // Upgrading the Alim tier: lower memory tiers stop renewing so nobody pays twice.
      if (TIER_OF[p.ref_id]) await q(`UPDATE subscriptions SET cancel_at_end=true WHERE user_id=$1 AND plan = ANY($2)`, [p.user_id, Object.keys(TIER_OF).filter(k => TIER_OF[k] < TIER_OF[p.ref_id])]);
    } else if (p.kind === 'ad' && !renewal) {
      await q(`UPDATE ad_campaigns SET status=CASE WHEN status='unpaid' THEN 'review' ELSE status END WHERE id=$1`, [p.ref_id]);
    } else if (p.kind === 'consult' && !renewal) {
      if (ctx.onConsultationPaid) await ctx.onConsultationPaid(+p.ref_id);
    } else if (ctx.onPaid && ctx.onPaid[p.kind]) { await ctx.onPaid[p.kind](p.ref_id, p, renewal);
    } else if (p.kind === 'coins' && !renewal) {
      const coins = +(p.raw?.coins || 0);
      await q('INSERT INTO coin_wallets(user_id,coins) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET coins=coin_wallets.coins+$2', [p.user_id, coins]);
    }
    return p;
  }
  app.get('/api/pay/config', (req, res) => res.json({ provider: 'payhere', live: LIVE, demo: !LIVE, prices: PRICES, cpm: CPM, coinPacks: COIN_PACKS, gifts: GIFTS, minFollowers: MIN_FOLLOWERS, minPosts: MIN_POSTS, minPayout: MIN_PAYOUT }));
  app.get('/api/me/plans', auth, wrap(async (req, res) => { await ensure(); const w = (await q('SELECT coins FROM coin_wallets WHERE user_id=$1', [req.user.id])).rows[0]; res.json({ plans: await plans(req.user), tier: await ctx.memoryTier(req.user), coins: w?.coins || 0, admin: isAdmin(req.user), prices: PRICES, demo: !LIVE }); }));
  app.post('/api/pay/subscribe', auth, wrap(async (req, res) => {
    await ensure(); const plan = req.body?.plan; if (!PRICES[plan]) return fail(res, 400, 'Unknown plan');
    const items = `Shukr ${PLAN_NAMES[plan]} (monthly)`;
    const orderId = await createOrder(req.user, 'sub', PRICES[plan], plan, { plan });
    res.json(checkoutFor(req, req.user, orderId, items, PRICES[plan], true));
  }));
  app.post('/api/pay/subscription/cancel', auth, wrap(async (req, res) => {
    await ensure(); const plan = req.body?.plan; if (!PRICES[plan]) return fail(res, 400, 'Unknown plan');
    await q('UPDATE subscriptions SET cancel_at_end=true WHERE user_id=$1 AND plan=$2', [req.user.id, plan]);
    res.json({ plans: await plans(req.user) });
  }));
  app.post('/api/pay/coins', auth, wrap(async (req, res) => {
    await ensure(); const pack = COIN_PACKS.find(p => p[0] === +req.body?.coins); if (!pack) return fail(res, 400, 'Choose a coin pack');
    const orderId = await createOrder(req.user, 'coins', pack[1], null, { coins: pack[0] });
    res.json(checkoutFor(req, req.user, orderId, `${pack[0]} Shukr coins`, pack[1], false));
  }));
  app.post('/api/pay/demo/complete', auth, wrap(async (req, res) => {
    if (LIVE) return fail(res, 400, 'Live payments are enabled');
    if (!isAdmin(req.user)) return fail(res, 403, 'Payments are being set up. Checkout will open soon.');
    const p = (await q('SELECT * FROM payments WHERE order_id=$1 AND user_id=$2', [req.body?.orderId, req.user.id])).rows[0];
    if (!p) return fail(res, 404, 'Order not found');
    if (p.status !== 'paid') await markPaid(p.order_id, { providerRef: 'DEMO-' + Date.now() });
    res.json({ ok: true });
  }));
  app.post('/api/pay/payhere/notify', wrap(async (req, res) => {
    const b = req.body || {}; if (!LIVE) return res.status(400).end();
    const sig = md5U((b.merchant_id || '') + (b.order_id || '') + (b.payhere_amount || '') + (b.payhere_currency || '') + (b.status_code || '') + md5U(SECRET));
    if (b.merchant_id !== MID || sig !== b.md5sig) return res.status(400).end();
    const p = (await q('SELECT * FROM payments WHERE order_id=$1', [b.order_id])).rows[0]; if (!p) return res.status(404).end();
    if (b.status_code === '2') {
      if (Math.abs(+b.payhere_amount - +p.amount_usd) > 0.01 || b.payhere_currency !== 'USD') return res.status(400).end();
      await markPaid(b.order_id, { providerRef: b.payment_id, subId: b.subscription_id, raw: b });
    } else if (p.status !== 'paid') await q('UPDATE payments SET status=$2 WHERE order_id=$1', [b.order_id, { '0': 'pending', '-1': 'cancelled', '-2': 'failed', '-3': 'chargeback' }[b.status_code] || 'failed']);
    res.status(200).end();
  }));
  // Subscriptions marked cancel_at_end simply lapse; expired rows are ignored by plans().

  // ---------- Advertisers ----------
  const safeLink = s => { try { const u = new URL(String(s)); return /^https?:$/.test(u.protocol) ? u.href.slice(0, 500) : null; } catch { return null; } };
  const clean = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : '';
  app.post('/api/ads/campaigns', auth, wrap(async (req, res) => {
    await ensure(); if (ctx.socialUploadsReady) await ctx.socialUploadsReady();
    const b = req.body || {}, brand = clean(b.brand, 60), headline = clean(b.headline, 150), link = safeLink(b.link), cta = ['Learn more', 'Shop now', 'Sign up', 'Download', 'Book now', 'Donate'].includes(b.cta) ? b.cta : 'Learn more';
    const budget = money(b.budgetUsd);
    if (brand.length < 2 || headline.length < 5) return fail(res, 400, 'Add a brand name and a headline (5+ characters).');
    if (!link) return fail(res, 400, 'Add a valid website link (https://…).');
    if (!(budget >= 10 && budget <= 100000)) return fail(res, 400, 'Budget must be between $10 and $100,000.');
    const m = (await q('SELECT * FROM social_media WHERE id=$1 AND user_id=$2', [b.mediaId, req.user.id])).rows[0];
    if (!m) return fail(res, 400, 'Upload a photo or video for your ad.');
    const poster = b.posterId ? (await q('SELECT file FROM social_media WHERE id=$1 AND user_id=$2 AND kind=$3', [b.posterId, req.user.id, 'image'])).rows[0] : null;
    await q('UPDATE social_media SET used=true WHERE id = ANY($1::text[])', [[m.id, b.posterId].filter(Boolean)]);
    const media = { kind: m.kind, src: '/ugc/' + m.file, poster: poster ? '/ugc/' + poster.file : null, width: m.width, height: m.height, ugc: true };
    const id = 'ad-' + crypto.randomUUID();
    await q('INSERT INTO ad_campaigns(id,user_id,brand,headline,cta,link,media,budget_usd,cpm_usd) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, req.user.id, brand, headline, cta, link, JSON.stringify(media), budget, CPM]);
    const orderId = await createOrder(req.user, 'ad', budget, id, { campaign: id });
    res.status(201).json({ campaignId: id, impressions: Math.floor(budget / CPM * 1000), checkout: checkoutFor(req, req.user, orderId, `Ad campaign: ${brand}`, budget, false) });
  }));
  // Boost an existing post (Facebook-style). Shown in the app as "Advertise". Paid campaigns serve the post itself as a sponsored item.
  app.post('/api/ads/boost', auth, wrap(async (req, res) => {
    await ensure(); const b = req.body || {};
    const pub = (await q('SELECT p.id, p.user_id, p.content, pr.username, pr.display_name FROM fyp_publications p LEFT JOIN profiles pr ON pr.user_id=p.user_id WHERE p.id=$1', [String(b.postId || '')])).rows[0];
    if (!pub || pub.user_id !== req.user.id) return fail(res, 404, 'You can only advertise your own posts.');
    const c = pub.content || {}, md = c.media || {}, src = md.src || md.slides?.[0]?.src; if (!src) return fail(res, 400, 'This post has no photo or video.');
    const days = [1, 3, 7, 14, 30].includes(+b.days) ? +b.days : 7, daily = money(b.dailyUsd);
    if (!(daily >= 2 && daily <= 1000)) return fail(res, 400, 'Daily budget must be between $2 and $1,000.');
    const goal = ['views', 'profile', 'website', 'messages'].includes(b.goal) ? b.goal : 'views';
    const link = goal === 'website' ? safeLink(b.link) : `${(req.headers['x-forwarded-proto'] || 'https')}://${req.headers.host}/#/${goal === 'profile' ? 'u/' + encodeURIComponent(pub.username || '') : goal === 'messages' ? 'u/' + encodeURIComponent(pub.username || '') + '?msg=1' : 'fyp?post=' + encodeURIComponent(pub.id)}`;
    if (!link) return fail(res, 400, 'Add a valid website link (https://…).');
    const cta = { views: 'Watch more', profile: 'Visit profile', website: 'Learn more', messages: 'Send message' }[goal];
    const budget = money(days * daily), brand = pub.display_name || pub.username || 'Shukr creator', headline = String(c.hook || c.title || c.caption || 'Check this out').slice(0, 150);
    const media = { kind: c.format === 'reel' || /video|\.mp4/.test(String(md.mime || src)) ? 'video' : 'image', src, poster: md.poster || null, width: md.width, height: md.height, ugc: true };
    const id = 'ad-' + crypto.randomUUID();
    await q('INSERT INTO ad_campaigns(id,user_id,brand,headline,cta,link,media,budget_usd,cpm_usd) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, req.user.id, brand.slice(0, 60), headline.length >= 5 ? headline : headline + ' — on Shukr', cta, link, JSON.stringify({ ...media, boostOf: pub.id, audience: { countries: Array.isArray(b.countries) ? b.countries.slice(0, 10).map(x => String(x).slice(0, 2).toUpperCase()) : [], ages: String(b.ages || '18+').slice(0, 10) }, days }), budget, CPM]);
    const orderId = await createOrder(req.user, 'ad', budget, id, { campaign: id, boost: pub.id });
    const reach = Math.floor(budget / CPM * 1000);
    res.status(201).json({ campaignId: id, budget, reachLow: Math.round(reach * 0.7), reachHigh: reach, checkout: checkoutFor(req, req.user, orderId, `Advertise post · ${days} day${days > 1 ? 's' : ''}`, budget, false) });
  }));
  app.get('/api/ads/campaigns', auth, wrap(async (req, res) => {
    await ensure();
    const rows = (await q(`SELECT c.*,(SELECT count(*)::int FROM ad_impressions i WHERE i.campaign_id=c.id) impressions,(SELECT count(*) FILTER(WHERE clicked)::int FROM ad_impressions i WHERE i.campaign_id=c.id) clicks
      FROM ad_campaigns c WHERE user_id=$1 ORDER BY created_at DESC`, [req.user.id])).rows;
    res.json({ campaigns: rows, cpm: CPM });
  }));
  app.post('/api/ads/campaigns/:id/pause', auth, wrap(async (req, res) => {
    const r = await q(`UPDATE ad_campaigns SET status=CASE WHEN status='active' THEN 'paused' WHEN status='paused' THEN 'active' ELSE status END WHERE id=$1 AND user_id=$2 RETURNING status`, [req.params.id, req.user.id]);
    if (!r.rows[0]) return fail(res, 404, 'Campaign not found'); res.json(r.rows[0]);
  }));
  app.post('/api/ads/campaigns/:id/checkout', auth, wrap(async (req, res) => {
    const c = (await q(`SELECT * FROM ad_campaigns WHERE id=$1 AND user_id=$2 AND status='unpaid'`, [req.params.id, req.user.id])).rows[0];
    if (!c) return fail(res, 404, 'Nothing to pay for');
    const orderId = await createOrder(req.user, 'ad', c.budget_usd, c.id, { campaign: c.id });
    res.json(checkoutFor(req, req.user, orderId, `Ad campaign: ${c.brand}`, c.budget_usd, false));
  }));

  // Ad for the feed: rotates active campaigns with budget left; one impression per viewer per campaign per day.
  ctx.pickAds = async (user, n) => {
    if (n < 1 || await ctx.hasPlan(user, 'noads')) return [];
    await ensure();
    const rows = (await q(`SELECT id,brand,headline,cta,link,media FROM ad_campaigns c WHERE status='active' AND spent_usd < budget_usd
      AND NOT EXISTS(SELECT 1 FROM ad_impressions i WHERE i.campaign_id=c.id AND i.viewer=$1 AND i.day=CURRENT_DATE) ORDER BY random() LIMIT $2`, [user.id, n])).rows;
    return rows.map(c => ({ id: c.id, sponsored: true, format: c.media.kind === 'video' ? 'reel' : 'image', title: c.headline, hook: c.headline, author: { name: c.brand, username: c.brand }, ad: { brand: c.brand, cta: c.cta, link: c.link }, media: { ...c.media, alt: c.headline } }));
  };
  ctx.adEvery = AD_EVERY;
  app.post('/api/ads/:id/impression', auth, wrap(async (req, res) => {
    await ensure(); const c = (await q(`SELECT * FROM ad_campaigns WHERE id=$1 AND status='active'`, [req.params.id])).rows[0]; if (!c) return res.json({ ok: false });
    const creatorPost = clean(req.body?.nextTo, 80);
    let creator = null;
    if (creatorPost) { const p = (await q('SELECT user_id FROM fyp_publications WHERE id=$1', [creatorPost])).rows[0]; if (p && p.user_id !== req.user.id && (await q('SELECT 1 FROM creators WHERE user_id=$1 AND status=$2', [p.user_id, 'active'])).rows[0]) creator = p.user_id; }
    const cost = +c.cpm_usd / 1000, creatorUsd = creator ? cost * CREATOR_SHARE : 0;
    const r = await q(`INSERT INTO ad_impressions(campaign_id,viewer,creator_id,day,cost_usd,creator_usd) VALUES($1,$2,$3,CURRENT_DATE,$4,$5) ON CONFLICT DO NOTHING RETURNING id`, [c.id, req.user.id, creator, cost, creatorUsd]);
    if (r.rows[0]) await q(`UPDATE ad_campaigns SET spent_usd=spent_usd+$2, status=CASE WHEN spent_usd+$2>=budget_usd THEN 'completed' ELSE status END WHERE id=$1`, [c.id, cost]);
    res.json({ ok: true });
  }));
  app.post('/api/ads/:id/click', auth, wrap(async (req, res) => {
    await q('UPDATE ad_impressions SET clicked=true WHERE campaign_id=$1 AND viewer=$2 AND day=CURRENT_DATE', [req.params.id, req.user.id]); res.json({ ok: true });
  }));

  // ---------- Creators: eligibility, earnings, gifts, payouts ----------
  async function creatorStats(userId) {
    const f = (await q('SELECT count(*)::int n FROM follows WHERE followee=$1', [userId])).rows[0].n;
    const posts = (await q('SELECT count(*)::int n FROM fyp_publications WHERE user_id=$1', [userId])).rows[0].n;
    const ads = (await q('SELECT COALESCE(sum(creator_usd),0)::float s, count(*)::int n FROM ad_impressions WHERE creator_id=$1', [userId])).rows[0];
    const gifts = (await q('SELECT COALESCE(sum(creator_usd),0)::float s, COALESCE(sum(coins),0)::int c FROM gifts WHERE recipient=$1', [userId])).rows[0];
    const pay = (await q(`SELECT COALESCE(sum(amount_usd) FILTER(WHERE status='paid'),0)::float paid, COALESCE(sum(amount_usd) FILTER(WHERE status='requested'),0)::float requested FROM payouts WHERE user_id=$1`, [userId])).rows[0];
    // Qualified views: distinct viewer sessions on this creator's posts in the past 28 days, excluding the creator and
    // views shorter than 2 s (the same rule TikTok uses so self-views and scroll-pasts don't count).
    const views28 = (await q(`SELECT count(*)::int n FROM fyp_views v JOIN fyp_publications p ON p.id=v.lesson_id
      WHERE p.user_id=$1 AND v.started_at > now() - interval '28 days' AND (v.user_id IS NULL OR v.user_id<>$1) AND v.watched_ms >= 2000`, [userId]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n;
    const scholarUsd = ctx.scholarEarnings ? await ctx.scholarEarnings(userId).catch(() => 0) : 0;
    const earned = ads.s + gifts.s + scholarUsd;
    return { followers: f, posts, views28, adUsd: money(ads.s), adImpressions: ads.n, giftUsd: money(gifts.s), giftCoins: gifts.c, consultUsd: money(scholarUsd), earned: money(earned), paidOut: money(pay.paid), requested: money(pay.requested), available: money(earned - pay.paid - pay.requested) };
  }
  app.get('/api/creator', auth, wrap(async (req, res) => {
    await ensure(); const s = await creatorStats(req.user.id), c = (await q('SELECT * FROM creators WHERE user_id=$1', [req.user.id])).rows[0];
    const payouts = (await q('SELECT id,amount_usd,status,reference,created_at,paid_at FROM payouts WHERE user_id=$1 ORDER BY id DESC LIMIT 20', [req.user.id])).rows;
    res.json({ ...s, joined: !!c && c.status === 'active', payoutDetails: c?.payout_details || '', eligible: s.followers >= MIN_FOLLOWERS && s.views28 >= MIN_VIEWS_28D && s.posts >= MIN_POSTS, minFollowers: MIN_FOLLOWERS, minViews28: MIN_VIEWS_28D, minPosts: MIN_POSTS, minPayout: MIN_PAYOUT, payouts });
  }));
  app.post('/api/creator/join', auth, wrap(async (req, res) => {
    await ensure(); const s = await creatorStats(req.user.id);
    if ((s.followers < MIN_FOLLOWERS || s.views28 < MIN_VIEWS_28D || s.posts < MIN_POSTS)) return fail(res, 403, `You need ${MIN_FOLLOWERS.toLocaleString('en')} followers and ${MIN_VIEWS_28D.toLocaleString('en')} views in the last 28 days to join.`);
    await q(`INSERT INTO creators(user_id) VALUES($1) ON CONFLICT(user_id) DO UPDATE SET status='active'`, [req.user.id]); res.json({ ok: true });
  }));
  app.post('/api/creator/payout', auth, wrap(async (req, res) => {
    await ensure(); const details = clean(req.body?.details, 500);
    if (details.length < 8) return fail(res, 400, 'Add your bank or payout details.');
    const s = await creatorStats(req.user.id); if (s.available < MIN_PAYOUT) return fail(res, 400, `Minimum payout is $${MIN_PAYOUT}.`);
    await q('INSERT INTO creators(user_id,payout_details) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET payout_details=$2', [req.user.id, details]);
    await q('INSERT INTO payouts(user_id,amount_usd,details) VALUES($1,$2,$3)', [req.user.id, s.available, details]);
    res.json(await creatorStats(req.user.id));
  }));
  app.post('/api/gifts', auth, wrap(async (req, res) => {
    await ensure(); const g = GIFTS.find(x => x[0] === req.body?.gift); if (!g) return fail(res, 400, 'Choose a gift');
    const post = (await q('SELECT user_id FROM fyp_publications WHERE id=$1', [clean(req.body?.postId, 80)])).rows[0];
    if (!post) return fail(res, 404, 'Gifts can be sent on members’ posts.');
    if (post.user_id === req.user.id) return fail(res, 400, 'You can’t gift your own post.');
    const w = await q('UPDATE coin_wallets SET coins=coins-$2 WHERE user_id=$1 AND coins>=$2 RETURNING coins', [req.user.id, g[3]]);
    if (!w.rows[0]) return fail(res, 402, 'Not enough coins. Top up to send gifts.');
    await q('INSERT INTO gifts(sender,recipient,post_id,gift,coins,creator_usd) VALUES($1,$2,$3,$4,$5,$6)', [req.user.id, post.user_id, req.body.postId, g[0], g[3], g[3] * COIN_USD]);
    res.json({ coins: w.rows[0].coins, gift: { id: g[0], name: g[1], emoji: g[2] } });
  }));

  // ---------- Developer dashboard ----------
  const adminOnly = (req, res, next) => isAdmin(req.user) ? next() : res.status(403).json({ error: 'Developer access only' });
  app.get('/api/admin/dashboard', auth, adminOnly, wrap(async (req, res) => {
    await ensure(); if (ctx.socialUploadsReady) await ctx.socialUploadsReady();
    const one = async (sql, p = []) => (await q(sql, p)).rows[0];
    const users = await one(`SELECT count(*)::int total, count(*) FILTER(WHERE created_at>now()-interval '1 day')::int d1, count(*) FILTER(WHERE created_at>now()-interval '7 days')::int d7, count(*) FILTER(WHERE created_at>now()-interval '30 days')::int d30 FROM users`);
    const active = await one(`SELECT count(DISTINCT user_id)::int d1 FROM fyp_views WHERE last_seen_at>now()-interval '1 day'`).catch(() => ({ d1: 0 }));
    const active7 = await one(`SELECT count(DISTINCT user_id)::int n FROM fyp_views WHERE last_seen_at>now()-interval '7 days'`).catch(() => ({ n: 0 }));
    const series = (await q(`SELECT to_char(g.d::date,'YYYY-MM-DD') AS "day", (SELECT count(*)::int FROM users WHERE created_at::date=g.d::date) AS n FROM generate_series(CURRENT_DATE-interval '29 days',CURRENT_DATE,interval '1 day') AS g(d)`)).rows;
    const subs = (await q(`SELECT plan, count(*)::int n FROM subscriptions WHERE active_until>now() GROUP BY plan`)).rows;
    const demoToo = req.query.demo === '1';
    const rev = await one(`SELECT COALESCE(sum(amount_usd) FILTER(WHERE kind='sub'),0)::float subs, COALESCE(sum(amount_usd) FILTER(WHERE kind='ad'),0)::float ads, COALESCE(sum(amount_usd) FILTER(WHERE kind='coins'),0)::float coins,
      COALESCE(sum(amount_usd) FILTER(WHERE paid_at>now()-interval '30 days'),0)::float last30, count(DISTINCT user_id) FILTER(WHERE kind='sub')::int payers FROM payments WHERE status='paid' AND (provider<>'demo' OR $1)`, [demoToo]);
    const owed = await one(`SELECT (SELECT COALESCE(sum(creator_usd),0) FROM ad_impressions)::float + (SELECT COALESCE(sum(creator_usd),0) FROM gifts)::float earned, (SELECT COALESCE(sum(amount_usd),0) FROM payouts WHERE status='paid')::float paid`);
    const adSpend = await one(`SELECT COALESCE(sum(cost_usd),0)::float spent, COALESCE(sum(creator_usd),0)::float creator, count(*)::int impressions, count(*) FILTER(WHERE clicked)::int clicks FROM ad_impressions`);
    const content = await one(`SELECT (SELECT count(*)::int FROM fyp_publications) posts, (SELECT count(*)::int FROM fyp_publications WHERE published_at>now()-interval '7 days') posts7, (SELECT count(*)::int FROM fyp_comments) comments, (SELECT COALESCE(sum(watched_ms),0)::float/3600000 FROM fyp_views) watch_hours, (SELECT count(*)::int FROM social_reports WHERE status='open') open_reports, (SELECT count(*)::int FROM creators WHERE status='active') creators`);
    const campaigns = (await q(`SELECT c.id,c.brand,c.headline,c.link,c.media,c.budget_usd,c.spent_usd,c.status,c.created_at,u.email FROM ad_campaigns c LEFT JOIN users u ON u.id=c.user_id ORDER BY (c.status='review') DESC, c.created_at DESC LIMIT 50`)).rows;
    const payouts = (await q(`SELECT p.*,u.email,u.name FROM payouts p JOIN users u ON u.id=p.user_id ORDER BY (p.status='requested') DESC, p.id DESC LIMIT 50`)).rows;
    const recentUsers = (await q(`SELECT u.id,u.email,u.name,u.created_at,(SELECT string_agg(plan,',') FROM subscriptions s WHERE s.user_id=u.id AND s.active_until>now()) plans FROM users u ORDER BY u.id DESC LIMIT 25`)).rows;
    const payments = (await q(`SELECT p.order_id,p.kind,p.ref_id,p.amount_usd,p.status,p.provider,p.paid_at,u.email FROM payments p LEFT JOIN users u ON u.id=p.user_id WHERE p.status<>'pending' ORDER BY p.created_at DESC LIMIT 30`)).rows;
    const topCreators = (await q(`SELECT u.id,u.name,(SELECT count(*)::int FROM follows f WHERE f.followee=u.id) followers,(SELECT count(*)::int FROM fyp_publications p WHERE p.user_id=u.id) posts,
      (SELECT COALESCE(sum(v.watched_ms),0)::float/3600000 FROM fyp_views v JOIN fyp_publications p ON p.id=v.lesson_id WHERE p.user_id=u.id) watch_hours FROM users u WHERE EXISTS(SELECT 1 FROM fyp_publications p WHERE p.user_id=u.id) ORDER BY watch_hours DESC LIMIT 10`)).rows;
    res.json({ creatorSharePct: CREATOR_SHARE * 100, platformAdSharePct: Math.round((1 - CREATOR_SHARE) * 100), scholarCommissionPct: +(process.env.SCHOLAR_COMMISSION_PCT || process.env.SCHOLAR_FEE_PCT || 20), users: { ...users, active1: active.d1, active7: active7.n }, series, subs, revenue: { ...rev, total: money(rev.subs + rev.ads + rev.coins) }, creatorsOwed: money(owed.earned - owed.paid), creatorsPaid: money(owed.paid), ads: adSpend, content, campaigns, payouts, recentUsers, payments, topCreators, pay: { live: LIVE, demo: !LIVE, prices: PRICES, cpm: CPM, creatorSharePct: CREATOR_SHARE * 100 } });
  }));
  app.post('/api/admin/campaigns/:id', auth, adminOnly, wrap(async (req, res) => {
    const action = req.body?.action, map = { approve: 'active', reject: 'rejected', pause: 'paused' };
    if (!map[action]) return fail(res, 400, 'Invalid action');
    const r = await q(`UPDATE ad_campaigns SET status=$2, review_note=$3 WHERE id=$1 AND status<>'unpaid' RETURNING status`, [req.params.id, map[action], clean(req.body?.note, 300) || null]);
    if (!r.rows[0]) return fail(res, 404, 'Campaign not found or unpaid'); res.json(r.rows[0]);
  }));
  app.post('/api/admin/payouts/:id', auth, adminOnly, wrap(async (req, res) => {
    const status = req.body?.status === 'rejected' ? 'rejected' : 'paid';
    await q(`UPDATE payouts SET status=$2, reference=$3, paid_at=CASE WHEN $2='paid' THEN now() ELSE paid_at END WHERE id=$1 AND status='requested'`, [+req.params.id, status, clean(req.body?.reference, 120) || null]);
    res.json({ ok: true });
  }));
};
module.exports.SCHEMA = SCHEMA;
module.exports.GIFTS = GIFTS;
