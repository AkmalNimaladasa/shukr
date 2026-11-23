// Earn: wallet + referrals + tips, digital products, memberships, services (affiliate links), freelance marketplace (clipping/editing etc.),
// verified crowdfunding, paid communities. All money flows through ctx.createCheckout → ctx.onPaid[kind]; recipients are credited to the wallet.
// Platform share and referral rate are server-side only (env) and never sent to clients.
const crypto = require('crypto');
const TAKE = +(process.env.EARN_PLATFORM_PCT || 20) / 100;      // hidden
const REF_RATE = +(process.env.REFERRAL_PCT || 10) / 100;       // of each payment by a referred user, paid from platform share; hidden
const REF_MONTHS = +(process.env.REFERRAL_MONTHS || 12);
const MIN_CASHOUT = +(process.env.MIN_CASHOUT_USD || 10);
const GIG_CATS = ['clipping', 'video-editing', 'design', 'writing', 'social-media', 'translation', 'tutoring', 'development', 'voice-over', 'other'];
const SCHEMA = [
`CREATE TABLE IF NOT EXISTS wallet_tx (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, amount_usd NUMERIC(12,2) NOT NULL, kind TEXT NOT NULL, ref TEXT, note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
`CREATE INDEX IF NOT EXISTS idx_wallet_user ON wallet_tx(user_id, created_at DESC)`,
`CREATE TABLE IF NOT EXISTS ref_codes (user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, code TEXT UNIQUE NOT NULL)`,
`CREATE TABLE IF NOT EXISTS referrals (user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, referrer INT REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
`CREATE TABLE IF NOT EXISTS ref_clicks (code TEXT, day DATE DEFAULT CURRENT_DATE, n INT NOT NULL DEFAULT 0, PRIMARY KEY(code, day))`,
`CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, title TEXT NOT NULL, description TEXT, price_usd NUMERIC(10,2) NOT NULL,
  cover TEXT, file_url TEXT, perks JSONB NOT NULL DEFAULT '[]'::jsonb, delivery_days INT, category TEXT, affiliate BOOLEAN NOT NULL DEFAULT false, active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ DEFAULT now())`,
`CREATE TABLE IF NOT EXISTS purchases (id SERIAL PRIMARY KEY, product_id INT REFERENCES products(id) ON DELETE CASCADE, buyer INT REFERENCES users(id) ON DELETE CASCADE, seller INT, amount_usd NUMERIC(10,2),
  affiliate INT, note TEXT, status TEXT NOT NULL DEFAULT 'pending', until TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now())`,
`CREATE TABLE IF NOT EXISTS campaigns (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, story TEXT NOT NULL, goal_usd NUMERIC(12,2) NOT NULL, raised_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  donors INT NOT NULL DEFAULT 0, cover TEXT, category TEXT, evidence TEXT, status TEXT NOT NULL DEFAULT 'pending', review_note TEXT, created_at TIMESTAMPTZ DEFAULT now(), ends_at TIMESTAMPTZ)`,
`CREATE TABLE IF NOT EXISTS donations (id SERIAL PRIMARY KEY, campaign_id INT REFERENCES campaigns(id) ON DELETE CASCADE, user_id INT, amount_usd NUMERIC(10,2), anonymous BOOLEAN DEFAULT false, message TEXT, status TEXT DEFAULT 'pending', created_at TIMESTAMPTZ DEFAULT now())`,
`CREATE TABLE IF NOT EXISTS communities (id SERIAL PRIMARY KEY, owner INT REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT, price_usd NUMERIC(10,2) NOT NULL, cover TEXT, perks JSONB NOT NULL DEFAULT '[]'::jsonb, created_at TIMESTAMPTZ DEFAULT now())`,
`CREATE TABLE IF NOT EXISTS community_members (community_id INT REFERENCES communities(id) ON DELETE CASCADE, user_id INT REFERENCES users(id) ON DELETE CASCADE, until TIMESTAMPTZ NOT NULL, PRIMARY KEY(community_id, user_id))`,
`CREATE TABLE IF NOT EXISTS community_posts (id SERIAL PRIMARY KEY, community_id INT REFERENCES communities(id) ON DELETE CASCADE, user_id INT REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL, image TEXT, created_at TIMESTAMPTZ DEFAULT now())`,
`CREATE TABLE IF NOT EXISTS gigs (id SERIAL PRIMARY KEY, client INT REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, budget_usd NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', hired_bid INT, created_at TIMESTAMPTZ DEFAULT now())`,
`CREATE TABLE IF NOT EXISTS gig_bids (id SERIAL PRIMARY KEY, gig_id INT REFERENCES gigs(id) ON DELETE CASCADE, freelancer INT REFERENCES users(id) ON DELETE CASCADE, amount_usd NUMERIC(10,2) NOT NULL, days INT, note TEXT,
  portfolio TEXT, delivery TEXT, status TEXT NOT NULL DEFAULT 'sent', created_at TIMESTAMPTZ DEFAULT now(), UNIQUE(gig_id, freelancer))`
];
const clean = (v, n) => typeof v === 'string' ? v.replace(/[<>\u0000-\u0008]/g, '').trim().slice(0, n) : '';
const money = n => Math.round(n * 100) / 100;
const usd = (v, min = 1, max = 100000) => { const n = Math.round(+v * 100) / 100; return isFinite(n) && n >= min && n <= max ? n : null; };
const urlOk = u => !u || /^https:\/\/[^\s]+$/.test(u) || /^\/ugc\/[a-f0-9-]{36}\.[a-z0-9]{3,4}$/.test(u);

module.exports = function earn(ctx) {
  const { app, q, auth, wrap } = ctx; const isAdmin = u => !!(u && ctx.isAdmin?.(u));
  let ready = null; const ensure = () => ready || (ready = Promise.resolve(ctx.monetizeReady?.()).then(() => SCHEMA.reduce((p, s) => p.then(() => q(s)), Promise.resolve())).catch(e => { ready = null; throw e; }));
  const fail = (res, s, e) => res.status(s).json({ error: e });
  const credit = async (userId, amount, kind, ref, note) => { if (!userId || !(amount > 0)) return; await q('INSERT INTO wallet_tx(user_id,amount_usd,kind,ref,note) VALUES($1,$2,$3,$4,$5)', [userId, money(amount), kind, ref ? String(ref) : null, note || null]); ctx.notify?.(userId, userId, 'earn', null, `You earned $${money(amount).toFixed(2)}`); };
  const balance = async uid => +(await q('SELECT COALESCE(sum(amount_usd),0)::float b FROM wallet_tx WHERE user_id=$1', [uid])).rows[0].b;
  const pay = (req, kind, ref, amount, label) => ctx.createCheckout(req, req.user, kind, ref, amount, label);
  ctx.onPaid = ctx.onPaid || {}; ctx.walletCredit = credit;

  // ---------- Referral: every paid payment by a referred user credits the referrer (hidden rate). ----------
  ctx.afterPaid = async p => { try { await ensure();
    const r = (await q(`SELECT referrer FROM referrals WHERE user_id=$1 AND created_at>now()-($2||' months')::interval`, [p.user_id, String(REF_MONTHS)])).rows[0];
    if (r && r.referrer !== p.user_id) await credit(r.referrer, +p.amount_usd * REF_RATE, 'referral', p.order_id, 'A friend you invited made a purchase'); } catch (e) { console.log('referral', e.message); } };
  const codeFor = async uid => { await ensure(); let c = (await q('SELECT code FROM ref_codes WHERE user_id=$1', [uid])).rows[0]?.code; if (c) return c;
    const base = ((await q('SELECT username FROM profiles WHERE user_id=$1', [uid])).rows[0]?.username || 'shukr').replace(/[^a-z0-9]/gi, '').slice(0, 10).toLowerCase();
    for (let i = 0; i < 5 && !c; i++) { const t = base + crypto.randomBytes(2).toString('hex'); try { await q('INSERT INTO ref_codes(user_id,code) VALUES($1,$2)', [uid, t]); c = t; } catch {} } return c; };
  ctx.attachReferral = async (newUserId, code) => { try { await ensure(); if (!code) return; const r = (await q('SELECT user_id FROM ref_codes WHERE code=$1', [String(code).toLowerCase().slice(0, 40)])).rows[0];
    if (r && r.user_id !== newUserId) { await q('INSERT INTO referrals(user_id,referrer) VALUES($1,$2) ON CONFLICT DO NOTHING', [newUserId, r.user_id]); ctx.notify?.(r.user_id, newUserId, 'referral', null, 'joined Shukr with your invite link'); } } catch {} };
  app.post('/api/ref/click', wrap(async (req, res) => { await ensure(); const c = clean(req.body?.code, 40).toLowerCase(); if (c) await q('INSERT INTO ref_clicks(code) VALUES($1) ON CONFLICT(code,day) DO UPDATE SET n=ref_clicks.n+1', [c]); res.json({ ok: true }); }));
  app.get('/api/referrals', auth, wrap(async (req, res) => { const uid = req.user.id, code = await codeFor(uid);
    const invited = (await q(`SELECT r.created_at, COALESCE(p.display_name,u.name) name, p.username, p.avatar, EXISTS(SELECT 1 FROM payments x WHERE x.user_id=r.user_id AND x.status='paid') paid
      FROM referrals r JOIN users u ON u.id=r.user_id LEFT JOIN profiles p ON p.user_id=r.user_id WHERE r.referrer=$1 ORDER BY r.created_at DESC LIMIT 200`, [uid]).catch(() => ({ rows: [] }))).rows;
    const earned = +(await q(`SELECT COALESCE(sum(amount_usd),0)::float s FROM wallet_tx WHERE user_id=$1 AND kind='referral'`, [uid])).rows[0].s;
    const clicks = +(await q('SELECT COALESCE(sum(n),0)::int n FROM ref_clicks WHERE code=$1', [code])).rows[0].n;
    const top = (await q(`SELECT COALESCE(p.display_name,u.name) name, p.username, count(*)::int n FROM referrals r JOIN users u ON u.id=r.referrer LEFT JOIN profiles p ON p.user_id=r.referrer WHERE r.created_at>now()-interval '30 days' GROUP BY 1,2 ORDER BY n DESC LIMIT 5`)).rows;
    res.json({ code, invited, earned: money(earned), clicks, paying: invited.filter(x => x.paid).length, top }); }));

  // ---------- Wallet ----------
  app.get('/api/wallet', auth, wrap(async (req, res) => { await ensure(); const uid = req.user.id;
    const tx = (await q('SELECT amount_usd::float amount, kind, note, created_at FROM wallet_tx WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [uid])).rows;
    const pending = +(await q(`SELECT COALESCE(sum(b.amount_usd),0)::float s FROM gig_bids b JOIN gigs g ON g.id=b.gig_id WHERE b.freelancer=$1 AND b.status IN ('hired','delivered')`, [uid])).rows[0].s * (1 - TAKE);
    const payouts = (await q('SELECT amount_usd::float amount, status, created_at FROM payouts WHERE user_id=$1 ORDER BY id DESC LIMIT 20', [uid]).catch(() => ({ rows: [] }))).rows;
    res.json({ balance: money(await balance(uid)), pending: money(pending), minCashout: MIN_CASHOUT, tx, payouts }); }));
  app.post('/api/wallet/cashout', auth, wrap(async (req, res) => { await ensure(); const uid = req.user.id, b = await balance(uid), amt = usd(req.body?.amount, MIN_CASHOUT, 100000), method = clean(req.body?.method, 30), details = clean(req.body?.details, 400);
    if (!amt) return fail(res, 400, `Minimum cash out is $${MIN_CASHOUT}.`); if (amt > b + 0.001) return fail(res, 400, 'That’s more than your balance.');
    if (!['bank', 'paypal', 'payoneer', 'wise', 'mobile-money'].includes(method) || details.length < 6) return fail(res, 400, 'Choose a payout method and add your account details.');
    if ((await q(`SELECT 1 FROM payouts WHERE user_id=$1 AND status='requested'`, [uid])).rows[0]) return fail(res, 409, 'You already have a cash out in progress.');
    await q('INSERT INTO payouts(user_id,amount_usd,details) VALUES($1,$2,$3)', [uid, amt, `${method}: ${details}`]);
    await q('INSERT INTO wallet_tx(user_id,amount_usd,kind,note) VALUES($1,$2,$3,$4)', [uid, -amt, 'cashout', `Cash out to ${method}`]);
    ctx.sec?.log?.('payout-requested', req, { amt }); res.json({ ok: true }); }));

  // ---------- Tips ----------
  app.post('/api/tip', auth, wrap(async (req, res) => { await ensure(); const to = (await q('SELECT user_id FROM profiles WHERE lower(username)=lower($1)', [clean(req.body?.username, 40)])).rows[0];
    const amt = usd(req.body?.amount, 1, 500); if (!to || to.user_id === req.user.id) return fail(res, 400, 'Choose who to tip.'); if (!amt) return fail(res, 400, 'Tips are $1–$500.');
    res.json({ checkout: await pay(req, 'tip', `${to.user_id}:${req.user.id}`, amt, 'Tip on Shukr') }); }));
  ctx.onPaid.tip = async (ref, p) => { await ensure(); const [to] = String(ref).split(':'); await credit(+to, +p.amount_usd * (1 - TAKE), 'tip', p.order_id, 'You received a tip'); };

  // ---------- Products: digital, membership (monthly perks), service ----------
  const prodBody = b => ({ kind: ['digital', 'membership', 'service'].includes(b.kind) ? b.kind : 'digital', title: clean(b.title, 100), description: clean(b.description, 4000),
    price: usd(b.price, 1, 10000), cover: urlOk(b.cover) ? clean(b.cover, 300) : '', file: urlOk(b.fileUrl) ? clean(b.fileUrl, 500) : '', perks: (Array.isArray(b.perks) ? b.perks : []).map(x => clean(String(x), 120)).filter(Boolean).slice(0, 8),
    days: Math.max(0, Math.min(90, +b.deliveryDays || 0)), category: clean(b.category, 30), affiliate: !!b.affiliate });
  app.post('/api/products', auth, wrap(async (req, res) => { await ensure(); const x = prodBody(req.body || {});
    if (x.title.length < 3 || !x.price) return fail(res, 400, 'Add a title and a price ($1+).'); if (x.kind === 'digital' && !x.file) return fail(res, 400, 'Add the download link or file buyers will receive.');
    const r = await q(`INSERT INTO products(user_id,kind,title,description,price_usd,cover,file_url,perks,delivery_days,category,affiliate) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [req.user.id, x.kind, x.title, x.description, x.price, x.cover || null, x.file || null, JSON.stringify(x.perks), x.days || null, x.category || null, x.affiliate]); res.json({ id: r.rows[0].id }); }));
  app.put('/api/products/:id', auth, wrap(async (req, res) => { await ensure(); if (req.body?.active !== undefined) { await q('UPDATE products SET active=$3 WHERE id=$1 AND user_id=$2', [+req.params.id, req.user.id, !!req.body.active]); return res.json({ ok: true }); }
    const x = prodBody(req.body || {}); await q(`UPDATE products SET title=COALESCE(NULLIF($3,''),title),description=$4,price_usd=COALESCE($5,price_usd),cover=$6,perks=$7,affiliate=$8 WHERE id=$1 AND user_id=$2`, [+req.params.id, req.user.id, x.title, x.description, x.price, x.cover || null, JSON.stringify(x.perks), x.affiliate]); res.json({ ok: true }); }));
  const prodList = async (where, args, me) => (await q(`SELECT pr.id,pr.kind,pr.title,pr.description,pr.price_usd::float price,pr.cover,pr.perks,pr.delivery_days,pr.category,pr.affiliate,pr.active,pr.user_id,
      p.username, COALESCE(p.display_name,u.name) seller, (SELECT count(*)::int FROM purchases x WHERE x.product_id=pr.id AND x.status<>'pending') sales,
      EXISTS(SELECT 1 FROM purchases x WHERE x.product_id=pr.id AND x.buyer=${+me} AND x.status<>'pending' AND (x.until IS NULL OR x.until>now())) owned
      FROM products pr JOIN users u ON u.id=pr.user_id LEFT JOIN profiles p ON p.user_id=pr.user_id WHERE ${where} ORDER BY pr.created_at DESC LIMIT 80`, args)).rows;
  app.get('/api/products', auth, wrap(async (req, res) => { await ensure(); const k = ['digital', 'membership', 'service'].includes(req.query.kind) ? req.query.kind : null, t = clean(req.query.q, 60), u = clean(req.query.user, 40);
    res.json({ products: await prodList(`pr.active AND ($1::text IS NULL OR pr.kind=$1) AND ($2='' OR pr.title ILIKE '%'||$2||'%') AND ($3='' OR lower(p.username)=lower($3))`, [k, t, u], req.user.id) }); }));
  app.get('/api/products/mine', auth, wrap(async (req, res) => { await ensure();
    res.json({ selling: await prodList('pr.user_id=$1', [req.user.id], req.user.id),
      bought: (await q(`SELECT x.id, x.status, x.until, x.created_at, pr.id product_id, pr.kind, pr.title, pr.file_url, pr.perks, p.username FROM purchases x JOIN products pr ON pr.id=x.product_id LEFT JOIN profiles p ON p.user_id=pr.user_id WHERE x.buyer=$1 AND x.status<>'pending' ORDER BY x.created_at DESC`, [req.user.id])).rows,
      orders: (await q(`SELECT x.id, x.status, x.note, x.created_at, x.amount_usd::float amount, pr.title, pr.kind, COALESCE(p.display_name,u.name) buyer_name, p.username buyer FROM purchases x JOIN products pr ON pr.id=x.product_id JOIN users u ON u.id=x.buyer LEFT JOIN profiles p ON p.user_id=x.buyer WHERE x.seller=$1 AND x.status<>'pending' ORDER BY x.created_at DESC LIMIT 100`, [req.user.id])).rows }); }));
  app.post('/api/products/:id/buy', auth, wrap(async (req, res) => { await ensure(); const pr = (await q('SELECT * FROM products WHERE id=$1 AND active', [+req.params.id])).rows[0];
    if (!pr) return fail(res, 404, 'Not available.'); if (pr.user_id === req.user.id) return fail(res, 400, 'This is yours.');
    let aff = null; if (pr.affiliate && req.body?.aff) { const a = (await q('SELECT user_id FROM ref_codes WHERE code=$1', [clean(req.body.aff, 40).toLowerCase()])).rows[0]; if (a && a.user_id !== req.user.id && a.user_id !== pr.user_id) aff = a.user_id; }
    const r = await q('INSERT INTO purchases(product_id,buyer,seller,amount_usd,affiliate,note) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [pr.id, req.user.id, pr.user_id, pr.price_usd, aff, clean(req.body?.note, 1000) || null]);
    res.json({ checkout: await pay(req, 'product', r.rows[0].id, +pr.price_usd, pr.title) }); }));
  ctx.onPaid.product = async (ref, p, renewal) => { await ensure(); const x = (await q(`SELECT x.*, pr.kind, pr.title FROM purchases x JOIN products pr ON pr.id=x.product_id WHERE x.id=$1`, [+ref])).rows[0]; if (!x) return;
    await q(`UPDATE purchases SET status=$2, until=CASE WHEN $3 THEN GREATEST(COALESCE(until,now()),now())+interval '31 days' ELSE until END WHERE id=$1`, [x.id, x.kind === 'service' ? 'paid' : 'delivered', x.kind === 'membership']);
    const amt = +p.amount_usd, affCut = x.affiliate ? amt * 0.1 : 0; // affiliate gets a share of the sale (from the seller's side)
    await credit(x.seller, amt * (1 - TAKE) - affCut, 'sale', p.order_id, `Sold: ${x.title}`); if (x.affiliate) await credit(x.affiliate, affCut, 'affiliate', p.order_id, `Affiliate sale: ${x.title}`);
    ctx.notify?.(x.seller, x.buyer, 'sale', String(x.id), x.kind === 'service' ? `ordered your service “${x.title}”` : `bought “${x.title}”`); };
  app.post('/api/purchases/:id/deliver', auth, wrap(async (req, res) => { await ensure(); const r = await q(`UPDATE purchases SET status='delivered', note=COALESCE(note,'')||$3 WHERE id=$1 AND seller=$2 AND status='paid' RETURNING buyer`, [+req.params.id, req.user.id, '\n— Delivered: ' + clean(req.body?.message, 1000)]);
    if (!r.rows[0]) return fail(res, 404, 'Order not found.'); ctx.notify?.(r.rows[0].buyer, req.user.id, 'delivered', req.params.id, 'delivered your order'); res.json({ ok: true }); }));
  app.get('/api/products/:id', auth, wrap(async (req, res) => { await ensure(); const p = (await prodList('pr.id=$1', [+req.params.id], req.user.id))[0]; if (!p) return fail(res, 404, 'Not found');
    if (p.owned && p.kind === 'digital') p.file_url = (await q('SELECT file_url FROM products WHERE id=$1', [p.id])).rows[0].file_url; res.json({ product: p, affCode: p.affiliate ? await codeFor(req.user.id) : null }); }));

  // ---------- Freelance (clients post projects, freelancers bid; escrow on hire; release on approval) ----------
  app.get('/api/gigs', auth, wrap(async (req, res) => { await ensure(); const c = GIG_CATS.includes(req.query.cat) ? req.query.cat : '', t = clean(req.query.q, 60);
    res.json({ categories: GIG_CATS, gigs: (await q(`SELECT g.id,g.title,g.description,g.category,g.budget_usd::float budget,g.status,g.created_at,g.client,COALESCE(p.display_name,u.name) client_name,p.username,
      (SELECT count(*)::int FROM gig_bids b WHERE b.gig_id=g.id) bids, EXISTS(SELECT 1 FROM gig_bids b WHERE b.gig_id=g.id AND b.freelancer=$3) bid
      FROM gigs g JOIN users u ON u.id=g.client LEFT JOIN profiles p ON p.user_id=g.client WHERE g.status='open' AND ($1='' OR g.category=$1) AND ($2='' OR g.title ILIKE '%'||$2||'%' OR g.description ILIKE '%'||$2||'%') ORDER BY g.created_at DESC LIMIT 60`, [c, t, req.user.id])).rows }); }));
  app.post('/api/gigs', auth, wrap(async (req, res) => { await ensure(); const b = req.body || {}, title = clean(b.title, 120), desc = clean(b.description, 4000), budget = usd(b.budget, 5, 50000);
    if (title.length < 5 || desc.length < 20 || !budget) return fail(res, 400, 'Add a title, a clear brief (20+ characters) and a budget ($5+).');
    const r = await q('INSERT INTO gigs(client,title,description,category,budget_usd) VALUES($1,$2,$3,$4,$5) RETURNING id', [req.user.id, title, desc, GIG_CATS.includes(b.category) ? b.category : 'other', budget]); res.json({ id: r.rows[0].id }); }));
  app.get('/api/gigs/mine', auth, wrap(async (req, res) => { await ensure(); const u = req.user.id;
    res.json({ posted: (await q(`SELECT g.*, g.budget_usd::float budget, (SELECT json_agg(json_build_object('id',b.id,'amount',b.amount_usd::float,'days',b.days,'note',b.note,'portfolio',b.portfolio,'delivery',b.delivery,'status',b.status,'name',COALESCE(p.display_name,uu.name),'username',p.username) ORDER BY b.created_at)
        FROM gig_bids b JOIN users uu ON uu.id=b.freelancer LEFT JOIN profiles p ON p.user_id=b.freelancer WHERE b.gig_id=g.id) bids FROM gigs g WHERE g.client=$1 ORDER BY g.created_at DESC`, [u])).rows,
      bids: (await q(`SELECT b.id,b.amount_usd::float amount,b.status,b.delivery,g.title,g.id gig_id,g.status gig_status FROM gig_bids b JOIN gigs g ON g.id=b.gig_id WHERE b.freelancer=$1 ORDER BY b.created_at DESC`, [u])).rows }); }));
  app.post('/api/gigs/:id/bid', auth, wrap(async (req, res) => { await ensure(); const g = (await q(`SELECT client FROM gigs WHERE id=$1 AND status='open'`, [+req.params.id])).rows[0];
    if (!g) return fail(res, 404, 'This project is closed.'); if (g.client === req.user.id) return fail(res, 400, 'This is your project.');
    const amt = usd(req.body?.amount, 5, 50000); if (!amt) return fail(res, 400, 'Enter your price ($5+).'); const pf = clean(req.body?.portfolio, 300); if (pf && !urlOk(pf)) return fail(res, 400, 'Portfolio link must start with https://');
    await q(`INSERT INTO gig_bids(gig_id,freelancer,amount_usd,days,note,portfolio) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(gig_id,freelancer) DO UPDATE SET amount_usd=EXCLUDED.amount_usd,days=EXCLUDED.days,note=EXCLUDED.note,portfolio=EXCLUDED.portfolio`,
      [+req.params.id, req.user.id, amt, Math.max(1, Math.min(90, +req.body?.days || 3)), clean(req.body?.note, 2000), pf || null]);
    ctx.notify?.(g.client, req.user.id, 'bid', req.params.id, 'sent a proposal for your project'); res.json({ ok: true }); }));
  app.post('/api/gigs/bids/:bid/hire', auth, wrap(async (req, res) => { await ensure(); const b = (await q(`SELECT b.*, g.client, g.title FROM gig_bids b JOIN gigs g ON g.id=b.gig_id WHERE b.id=$1 AND g.status='open'`, [+req.params.bid])).rows[0];
    if (!b || b.client !== req.user.id) return fail(res, 404, 'Proposal not found.'); res.json({ checkout: await pay(req, 'gig', b.id, +b.amount_usd, `Project: ${b.title}`) }); }));
  ctx.onPaid.gig = async ref => { await ensure(); const b = (await q(`UPDATE gig_bids SET status='hired' WHERE id=$1 RETURNING gig_id, freelancer`, [+ref])).rows[0]; if (!b) return;
    await q(`UPDATE gigs SET status='hired', hired_bid=$2 WHERE id=$1`, [b.gig_id, +ref]); ctx.notify?.(b.freelancer, b.freelancer, 'hired', String(b.gig_id), 'You were hired! Payment is held safely until delivery.'); };
  app.post('/api/gigs/bids/:bid/deliver', auth, wrap(async (req, res) => { await ensure(); const link = clean(req.body?.delivery, 500); if (!link) return fail(res, 400, 'Add your delivery link or message.');
    const r = await q(`UPDATE gig_bids SET status='delivered', delivery=$3 WHERE id=$1 AND freelancer=$2 AND status='hired' RETURNING gig_id`, [+req.params.bid, req.user.id, link]); if (!r.rows[0]) return fail(res, 404, 'Not found');
    const g = (await q('SELECT client FROM gigs WHERE id=$1', [r.rows[0].gig_id])).rows[0]; ctx.notify?.(g.client, req.user.id, 'delivered', String(r.rows[0].gig_id), 'delivered your project — review and approve'); res.json({ ok: true }); }));
  app.post('/api/gigs/bids/:bid/approve', auth, wrap(async (req, res) => { await ensure(); const b = (await q(`SELECT b.*, g.client, g.title FROM gig_bids b JOIN gigs g ON g.id=b.gig_id WHERE b.id=$1 AND b.status='delivered'`, [+req.params.bid])).rows[0];
    if (!b || b.client !== req.user.id) return fail(res, 404, 'Nothing to approve.');
    await q(`UPDATE gig_bids SET status='done' WHERE id=$1`, [b.id]); await q(`UPDATE gigs SET status='done' WHERE id=$1`, [b.gig_id]);
    await credit(b.freelancer, +b.amount_usd * (1 - TAKE), 'freelance', 'gig-' + b.gig_id, `Project paid: ${b.title}`); res.json({ ok: true }); }));

  // ---------- Crowdfunding (verified by the Shukr team before it goes live) ----------
  app.get('/api/campaigns', auth, wrap(async (req, res) => { await ensure();
    res.json({ campaigns: (await q(`SELECT c.id,c.title,left(c.story,220) story,c.goal_usd::float goal,c.raised_usd::float raised,c.donors,c.cover,c.category,c.created_at,COALESCE(p.display_name,u.name) owner,p.username FROM campaigns c JOIN users u ON u.id=c.user_id LEFT JOIN profiles p ON p.user_id=c.user_id WHERE c.status='verified' ORDER BY c.created_at DESC LIMIT 60`)).rows,
      mine: (await q(`SELECT id,title,status,review_note,goal_usd::float goal,raised_usd::float raised FROM campaigns WHERE user_id=$1 ORDER BY created_at DESC`, [req.user.id])).rows }); }));
  app.get('/api/campaigns/:id', auth, wrap(async (req, res) => { await ensure(); const c = (await q(`SELECT c.*,c.goal_usd::float goal,c.raised_usd::float raised,COALESCE(p.display_name,u.name) owner,p.username FROM campaigns c JOIN users u ON u.id=c.user_id LEFT JOIN profiles p ON p.user_id=c.user_id WHERE c.id=$1 AND (c.status='verified' OR c.user_id=$2 OR $3)`, [+req.params.id, req.user.id, isAdmin(req.user)])).rows[0];
    if (!c) return fail(res, 404, 'Not found'); if (!isAdmin(req.user) && c.user_id !== req.user.id) delete c.evidence;
    c.recent = (await q(`SELECT CASE WHEN d.anonymous THEN 'Anonymous' ELSE COALESCE(p.display_name,u.name) END name, d.amount_usd::float amount, d.message, d.created_at FROM donations d JOIN users u ON u.id=d.user_id LEFT JOIN profiles p ON p.user_id=d.user_id WHERE d.campaign_id=$1 AND d.status='paid' ORDER BY d.created_at DESC LIMIT 20`, [c.id])).rows; res.json({ campaign: c }); }));
  app.post('/api/campaigns', auth, wrap(async (req, res) => { await ensure(); const b = req.body || {}, title = clean(b.title, 120), story = clean(b.story, 6000), goal = usd(b.goal, 50, 1000000), evidence = clean(b.evidence, 2000);
    if (title.length < 5 || story.length < 80 || !goal) return fail(res, 400, 'Add a title, your full story (80+ characters) and a goal ($50+).'); if (evidence.length < 10) return fail(res, 400, 'Add proof for our verification team (documents, links, contacts).');
    const r = await q('INSERT INTO campaigns(user_id,title,story,goal_usd,cover,category,evidence,ends_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval \'60 days\') RETURNING id', [req.user.id, title, story, goal, urlOk(b.cover) ? clean(b.cover, 300) : null, clean(b.category, 30), evidence]);
    ctx.securityAlert?.('low', 'campaign-review', `New fundraiser waiting for verification: ${title}`); res.json({ id: r.rows[0].id, status: 'pending' }); }));
  app.post('/api/campaigns/:id/donate', auth, wrap(async (req, res) => { await ensure(); const c = (await q(`SELECT id,title,user_id FROM campaigns WHERE id=$1 AND status='verified'`, [+req.params.id])).rows[0];
    const amt = usd(req.body?.amount, 1, 50000); if (!c) return fail(res, 404, 'This fundraiser isn’t open.'); if (!amt) return fail(res, 400, 'Donations are $1 or more.');
    const d = await q('INSERT INTO donations(campaign_id,user_id,amount_usd,anonymous,message) VALUES($1,$2,$3,$4,$5) RETURNING id', [c.id, req.user.id, amt, !!req.body?.anonymous, clean(req.body?.message, 300) || null]);
    res.json({ checkout: await pay(req, 'donation', d.rows[0].id, amt, `Donation: ${c.title}`) }); }));
  ctx.onPaid.donation = async (ref, p) => { await ensure(); const d = (await q(`UPDATE donations SET status='paid' WHERE id=$1 AND status<>'paid' RETURNING campaign_id`, [+ref])).rows[0]; if (!d) return;
    const c = (await q('UPDATE campaigns SET raised_usd=raised_usd+$2, donors=donors+1 WHERE id=$1 RETURNING user_id,title', [d.campaign_id, +p.amount_usd])).rows[0];
    await credit(c.user_id, +p.amount_usd * (1 - TAKE / 2), 'fundraiser', p.order_id, `Donation to “${c.title}”`); };
  app.get('/api/admin/campaigns', auth, wrap(async (req, res) => { if (!isAdmin(req.user)) return fail(res, 403, 'Developers only'); await ensure();
    res.json({ campaigns: (await q(`SELECT c.*, c.goal_usd::float goal, u.email, COALESCE(p.display_name,u.name) owner FROM campaigns c JOIN users u ON u.id=c.user_id LEFT JOIN profiles p ON p.user_id=c.user_id ORDER BY (c.status='pending') DESC, c.created_at DESC LIMIT 100`)).rows }); }));
  app.post('/api/admin/campaigns/:id', auth, wrap(async (req, res) => { if (!isAdmin(req.user)) return fail(res, 403, 'Developers only'); await ensure(); const st = ['verified', 'rejected', 'closed'].includes(req.body?.status) ? req.body.status : null;
    if (!st) return fail(res, 400, 'Bad status'); const c = (await q('UPDATE campaigns SET status=$2, review_note=$3 WHERE id=$1 RETURNING user_id,title', [+req.params.id, st, clean(req.body?.note, 500) || null])).rows[0];
    if (c) ctx.notify?.(c.user_id, req.user.id, 'campaign', req.params.id, st === 'verified' ? `Your fundraiser “${c.title}” is verified and live` : `Your fundraiser “${c.title}” was ${st}`); res.json({ ok: true }); }));

  // ---------- Paid communities ----------
  app.get('/api/communities', auth, wrap(async (req, res) => { await ensure();
    res.json({ communities: (await q(`SELECT c.id,c.name,c.description,c.price_usd::float price,c.cover,c.perks,c.owner,COALESCE(p.display_name,u.name) owner_name,p.username,
      (SELECT count(*)::int FROM community_members m WHERE m.community_id=c.id AND m.until>now()) members, EXISTS(SELECT 1 FROM community_members m WHERE m.community_id=c.id AND m.user_id=$1 AND m.until>now()) joined
      FROM communities c JOIN users u ON u.id=c.owner LEFT JOIN profiles p ON p.user_id=c.owner ORDER BY members DESC, c.created_at DESC LIMIT 60`, [req.user.id])).rows }); }));
  app.post('/api/communities', auth, wrap(async (req, res) => { await ensure(); const b = req.body || {}, name = clean(b.name, 80), price = usd(b.price, 1, 500);
    if (name.length < 3 || !price) return fail(res, 400, 'Add a name and a monthly price ($1+).');
    const r = await q('INSERT INTO communities(owner,name,description,price_usd,cover,perks) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [req.user.id, name, clean(b.description, 2000), price, urlOk(b.cover) ? clean(b.cover, 300) : null, JSON.stringify((Array.isArray(b.perks) ? b.perks : []).map(x => clean(String(x), 120)).filter(Boolean).slice(0, 8))]);
    await q(`INSERT INTO community_members VALUES($1,$2,'2999-01-01')`, [r.rows[0].id, req.user.id]); res.json({ id: r.rows[0].id }); }));
  const member = async (cid, uid) => !!(await q('SELECT 1 FROM community_members WHERE community_id=$1 AND user_id=$2 AND until>now()', [cid, uid])).rows[0];
  app.post('/api/communities/:id/join', auth, wrap(async (req, res) => { await ensure(); const c = (await q('SELECT * FROM communities WHERE id=$1', [+req.params.id])).rows[0]; if (!c) return fail(res, 404, 'Not found');
    if (await member(c.id, req.user.id)) return res.json({ joined: true }); res.json({ checkout: await pay(req, 'community', `${c.id}:${req.user.id}`, +c.price_usd, `Join ${c.name}`) }); }));
  ctx.onPaid.community = async (ref, p) => { await ensure(); const [cid, uid] = String(ref).split(':').map(Number);
    await q(`INSERT INTO community_members VALUES($1,$2,now()+interval '31 days') ON CONFLICT(community_id,user_id) DO UPDATE SET until=GREATEST(community_members.until,now())+interval '31 days'`, [cid, uid]);
    const c = (await q('SELECT owner,name FROM communities WHERE id=$1', [cid])).rows[0]; if (c) await credit(c.owner, +p.amount_usd * (1 - TAKE), 'community', p.order_id, `New member in ${c.name}`); };
  app.get('/api/communities/:id/posts', auth, wrap(async (req, res) => { await ensure(); const cid = +req.params.id; if (!await member(cid, req.user.id)) return fail(res, 402, 'Join this community to see posts.');
    res.json({ posts: (await q(`SELECT cp.id,cp.body,cp.image,cp.created_at,COALESCE(p.display_name,u.name) name,p.username,p.avatar FROM community_posts cp JOIN users u ON u.id=cp.user_id LEFT JOIN profiles p ON p.user_id=cp.user_id WHERE cp.community_id=$1 ORDER BY cp.created_at DESC LIMIT 100`, [cid])).rows }); }));
  app.post('/api/communities/:id/posts', auth, wrap(async (req, res) => { await ensure(); const cid = +req.params.id; if (!await member(cid, req.user.id)) return fail(res, 402, 'Join this community first.');
    const body = clean(req.body?.body, 3000), img = urlOk(req.body?.image) ? clean(req.body?.image, 300) : null; if (!body) return fail(res, 400, 'Write something.');
    await q('INSERT INTO community_posts(community_id,user_id,body,image) VALUES($1,$2,$3,$4)', [cid, req.user.id, body, img]); res.json({ ok: true }); }));

  // Earn hub summary
  app.get('/api/earn/summary', auth, wrap(async (req, res) => { await ensure(); const u = req.user.id;
    const one = async (s, a = [u]) => +(await q(s, a).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n;
    res.json({ balance: money(await balance(u)), products: await one('SELECT count(*)::int n FROM products WHERE user_id=$1 AND active'), communities: await one('SELECT count(*)::int n FROM communities WHERE owner=$1'),
      invited: await one('SELECT count(*)::int n FROM referrals WHERE referrer=$1'), gigs: await one(`SELECT count(*)::int n FROM gigs WHERE status='open'`, []), campaigns: await one(`SELECT count(*)::int n FROM campaigns WHERE status='verified'`, []) }); }));
};
module.exports.GIG_CATS = GIG_CATS;
