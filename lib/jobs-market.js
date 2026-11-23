// Jobs + Marketplace. Paid access: job seekers $2/mo, hiring managers $8/mo; listing fees: house $100, vehicle $10, other $1.
const crypto = require('crypto');
const FEES = { property: +(process.env.FEE_PROPERTY || 100), vehicles: +(process.env.FEE_VEHICLE || 10), other: +(process.env.FEE_ITEM || 1) };
const JOB_PLANS = { 'jobs-seek': +(process.env.JOBS_SEEK_USD || 2), 'jobs-hire': +(process.env.JOBS_HIRE_USD || 8) };
const CATS = ['vehicles', 'property', 'tuition', 'services', 'electronics', 'phones', 'home', 'appliances', 'clothing', 'modest-fashion', 'beauty', 'family', 'hobbies', 'books', 'islamic', 'sports', 'garden', 'pets', 'food', 'tickets', 'business', 'toys', 'free', 'other'];
const SCHEMA = [
`CREATE TABLE IF NOT EXISTS job_access (user_id INT REFERENCES users(id) ON DELETE CASCADE, plan TEXT, until TIMESTAMPTZ NOT NULL, PRIMARY KEY(user_id, plan))`,
`CREATE TABLE IF NOT EXISTS jobs (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, company TEXT NOT NULL, location TEXT, remote BOOLEAN DEFAULT false,
  type TEXT DEFAULT 'full-time', salary TEXT, description TEXT NOT NULL, apply_email TEXT, apply_url TEXT, status TEXT NOT NULL DEFAULT 'open', created_at TIMESTAMPTZ DEFAULT now())`,
`CREATE TABLE IF NOT EXISTS job_applications (id SERIAL PRIMARY KEY, job_id INT REFERENCES jobs(id) ON DELETE CASCADE, user_id INT REFERENCES users(id) ON DELETE CASCADE, note TEXT, cv_url TEXT,
  status TEXT NOT NULL DEFAULT 'sent', created_at TIMESTAMPTZ DEFAULT now(), UNIQUE(job_id, user_id))`,
`CREATE TABLE IF NOT EXISTS job_saved (user_id INT, job_id INT REFERENCES jobs(id) ON DELETE CASCADE, PRIMARY KEY(user_id, job_id))`,
`CREATE TABLE IF NOT EXISTS listings (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, price NUMERIC(14,2) NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'USD',
  category TEXT NOT NULL, condition TEXT, description TEXT, location TEXT, lat DOUBLE PRECISION, lng DOUBLE PRECISION, photos JSONB NOT NULL DEFAULT '[]'::jsonb, details JSONB NOT NULL DEFAULT '{}'::jsonb,
  delivery TEXT DEFAULT 'pickup', status TEXT NOT NULL DEFAULT 'unpaid', views INT NOT NULL DEFAULT 0, fee_usd NUMERIC(8,2) NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`,
`CREATE INDEX IF NOT EXISTS idx_listings_cat ON listings(category, status, created_at DESC)`,
`CREATE TABLE IF NOT EXISTS listing_saved (user_id INT, listing_id INT REFERENCES listings(id) ON DELETE CASCADE, PRIMARY KEY(user_id, listing_id))`,
`CREATE TABLE IF NOT EXISTS listing_reports (id SERIAL PRIMARY KEY, listing_id INT REFERENCES listings(id) ON DELETE CASCADE, user_id INT, reason TEXT, created_at TIMESTAMPTZ DEFAULT now())`
];
const clean = (v, n) => typeof v === 'string' ? v.replace(/[<>\u0000-\u0008]/g, '').trim().slice(0, n) : '';
const feeFor = cat => cat === 'property' ? FEES.property : cat === 'vehicles' ? FEES.vehicles : cat === 'free' ? 0 : FEES.other;

module.exports = function jobsMarket(ctx) {
  const { app, q, auth, wrap } = ctx; const isAdmin = u => !!(u && ctx.isAdmin?.(u));
  let ready = null; const ensure = () => ready || (ready = SCHEMA.reduce((p, s) => p.then(() => q(s)), Promise.resolve()).catch(e => { ready = null; throw e; }));
  const fail = (res, s, e) => res.status(s).json({ error: e });
  const access = async (uid, plan) => !!(await q('SELECT 1 FROM job_access WHERE user_id=$1 AND plan=$2 AND until>now()', [uid, plan])).rows[0];
  const pay = async (req, kind, ref, usd, label) => ctx.createCheckout ? ctx.createCheckout(req, req.user, kind, ref, usd, label) : null;
  ctx.onPaid = ctx.onPaid || {};
  for (const plan of Object.keys(JOB_PLANS)) ctx.onPaid[plan] = async (ref, p) => { await ensure(); await q(`INSERT INTO job_access(user_id,plan,until) VALUES($1,$2,now()+interval '31 days') ON CONFLICT(user_id,plan) DO UPDATE SET until=GREATEST(job_access.until,now())+interval '31 days'`, [p.user_id, plan]); };
  ctx.onPaid.listing = async ref => { await ensure(); await q(`UPDATE listings SET status='active',updated_at=now() WHERE id=$1 AND status='unpaid'`, [+ref]); };

  // ---------- Jobs ----------
  app.get('/api/jobs/me', auth, wrap(async (req, res) => { await ensure();
    res.json({ prices: JOB_PLANS, seeker: isAdmin(req.user) || await access(req.user.id, 'jobs-seek'), hiring: isAdmin(req.user) || await access(req.user.id, 'jobs-hire') }); }));
  app.post('/api/jobs/subscribe', auth, wrap(async (req, res) => { await ensure(); const plan = req.body?.plan;
    if (!JOB_PLANS[plan]) return fail(res, 400, 'Choose a plan.');
    res.json({ checkout: await pay(req, plan, req.user.id, JOB_PLANS[plan], plan === 'jobs-seek' ? 'Shukr Jobs — job seeker' : 'Shukr Jobs — hiring') }); }));
  app.get('/api/jobs', auth, wrap(async (req, res) => { await ensure();
    if (!isAdmin(req.user) && !await access(req.user.id, 'jobs-seek')) return res.status(402).json({ error: 'Job search needs a Job Seeker membership.', locked: true, preview: (await q(`SELECT title,company,location,type FROM jobs WHERE status='open' ORDER BY created_at DESC LIMIT 5`)).rows });
    const t = clean(req.query.q, 80), loc = clean(req.query.loc, 80), type = clean(req.query.type, 20);
    const rows = (await q(`SELECT j.*, EXISTS(SELECT 1 FROM job_saved s WHERE s.job_id=j.id AND s.user_id=$4) saved, EXISTS(SELECT 1 FROM job_applications a WHERE a.job_id=j.id AND a.user_id=$4) applied
      FROM jobs j WHERE j.status='open' AND ($1='' OR j.title ILIKE '%'||$1||'%' OR j.company ILIKE '%'||$1||'%' OR j.description ILIKE '%'||$1||'%')
      AND ($2='' OR j.location ILIKE '%'||$2||'%' OR (j.remote AND $2 ILIKE 'remote')) AND ($3='' OR j.type=$3) ORDER BY j.created_at DESC LIMIT 60`, [t, loc, type, req.user.id])).rows;
    res.json({ jobs: rows }); }));
  app.post('/api/jobs', auth, wrap(async (req, res) => { await ensure();
    if (!isAdmin(req.user) && !await access(req.user.id, 'jobs-hire')) return fail(res, 402, 'Posting jobs needs a Hiring membership.');
    const b = req.body || {}, title = clean(b.title, 100), company = clean(b.company, 100), description = clean(b.description, 5000);
    if (!title || !company || description.length < 30) return fail(res, 400, 'Add a title, company and a description (30+ characters).');
    const email = clean(b.applyEmail, 120), url = clean(b.applyUrl, 300);
    if (url && !/^https:\/\//.test(url)) return fail(res, 400, 'Application link must start with https://');
    const r = await q(`INSERT INTO jobs(user_id,title,company,location,remote,type,salary,description,apply_email,apply_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [req.user.id, title, company, clean(b.location, 100), !!b.remote, ['full-time', 'part-time', 'contract', 'internship', 'volunteer'].includes(b.type) ? b.type : 'full-time', clean(b.salary, 60), description, email || null, url || null]);
    res.json({ id: r.rows[0].id }); }));
  app.get('/api/jobs/mine', auth, wrap(async (req, res) => { await ensure();
    res.json({ posted: (await q(`SELECT j.*, (SELECT count(*)::int FROM job_applications a WHERE a.job_id=j.id) applicants FROM jobs j WHERE user_id=$1 ORDER BY created_at DESC`, [req.user.id])).rows,
      applied: (await q(`SELECT a.status,a.created_at,j.id,j.title,j.company FROM job_applications a JOIN jobs j ON j.id=a.job_id WHERE a.user_id=$1 ORDER BY a.created_at DESC`, [req.user.id])).rows,
      saved: (await q(`SELECT j.* FROM job_saved s JOIN jobs j ON j.id=s.job_id WHERE s.user_id=$1`, [req.user.id])).rows }); }));
  app.get('/api/jobs/:id/applicants', auth, wrap(async (req, res) => { await ensure();
    const j = (await q('SELECT user_id FROM jobs WHERE id=$1', [+req.params.id])).rows[0]; if (!j || j.user_id !== req.user.id) return fail(res, 404, 'Job not found.');
    res.json({ applicants: (await q(`SELECT a.id,a.note,a.cv_url,a.status,a.created_at,u.name,u.email,p.username FROM job_applications a JOIN users u ON u.id=a.user_id LEFT JOIN profiles p ON p.user_id=a.user_id WHERE a.job_id=$1 ORDER BY a.created_at DESC`, [+req.params.id])).rows }); }));
  app.post('/api/jobs/:id/apply', auth, wrap(async (req, res) => { await ensure();
    if (!isAdmin(req.user) && !await access(req.user.id, 'jobs-seek')) return fail(res, 402, 'Applying needs a Job Seeker membership.');
    const j = (await q(`SELECT id,user_id FROM jobs WHERE id=$1 AND status='open'`, [+req.params.id])).rows[0]; if (!j) return fail(res, 404, 'This job is closed.');
    const cv = clean(req.body?.cvUrl, 300); if (cv && !/^(https:\/\/|\/ugc\/)/.test(cv)) return fail(res, 400, 'Invalid CV link.');
    await q('INSERT INTO job_applications(job_id,user_id,note,cv_url) VALUES($1,$2,$3,$4) ON CONFLICT(job_id,user_id) DO UPDATE SET note=EXCLUDED.note,cv_url=EXCLUDED.cv_url', [j.id, req.user.id, clean(req.body?.note, 2000), cv || null]);
    ctx.notify?.(j.user_id, req.user.id, 'job', String(j.id), 'applied to your job');
    res.json({ ok: true }); }));
  app.post('/api/jobs/:id/save', auth, wrap(async (req, res) => { await ensure();
    const on = req.body?.save !== false; await q(on ? 'INSERT INTO job_saved VALUES($1,$2) ON CONFLICT DO NOTHING' : 'DELETE FROM job_saved WHERE user_id=$1 AND job_id=$2', [req.user.id, +req.params.id]); res.json({ saved: on }); }));
  app.put('/api/jobs/:id', auth, wrap(async (req, res) => { await ensure();
    const st = ['open', 'closed'].includes(req.body?.status) ? req.body.status : null; if (!st) return fail(res, 400, 'Bad status');
    const r = await q('UPDATE jobs SET status=$3 WHERE id=$1 AND user_id=$2', [+req.params.id, req.user.id, st]); r.rowCount ? res.json({ ok: true }) : fail(res, 404, 'Job not found.'); }));
  app.delete('/api/jobs/:id', auth, wrap(async (req, res) => { await ensure(); await q('DELETE FROM jobs WHERE id=$1 AND (user_id=$2 OR $3)', [+req.params.id, req.user.id, isAdmin(req.user)]); res.json({ ok: true }); }));

  // ---------- Marketplace ----------
  app.get('/api/market/meta', auth, (req, res) => res.json({ categories: CATS, fees: { property: FEES.property, vehicles: FEES.vehicles, other: FEES.other, free: 0 } }));
  app.get('/api/market', auth, wrap(async (req, res) => { await ensure();
    const t = clean(req.query.q, 80), cat = CATS.includes(req.query.cat) ? req.query.cat : '', loc = clean(req.query.loc, 80), cond = clean(req.query.cond, 20);
    const min = +req.query.min || 0, max = +req.query.max || 0, sort = { new: 'l.created_at DESC', low: 'l.price ASC', high: 'l.price DESC' }[req.query.sort] || 'l.created_at DESC';
    const lat = +req.query.lat, lng = +req.query.lng, km = Math.min(500, +req.query.km || 0);
    const geo = km && isFinite(lat) && isFinite(lng) ? ` AND l.lat IS NOT NULL AND (6371*acos(LEAST(1,cos(radians(${lat}))*cos(radians(l.lat))*cos(radians(l.lng)-radians(${lng}))+sin(radians(${lat}))*sin(radians(l.lat)))))<=${km}` : '';
    const rows = (await q(`SELECT l.id,l.title,l.price,l.currency,l.category,l.condition,l.location,l.photos,l.created_at,l.user_id,
      EXISTS(SELECT 1 FROM listing_saved s WHERE s.listing_id=l.id AND s.user_id=$7) saved FROM listings l
      WHERE l.status='active' AND ($1='' OR l.title ILIKE '%'||$1||'%' OR l.description ILIKE '%'||$1||'%') AND ($2='' OR l.category=$2) AND ($3='' OR l.location ILIKE '%'||$3||'%')
      AND ($4='' OR l.condition=$4) AND ($5=0 OR l.price>=$5) AND ($6=0 OR l.price<=$6)${geo} ORDER BY ${sort} LIMIT 60`, [t, cat, loc, cond, min, max, req.user.id])).rows;
    res.json({ listings: rows }); }));
  app.get('/api/market/mine', auth, wrap(async (req, res) => { await ensure();
    res.json({ selling: (await q(`SELECT l.*, (SELECT count(*)::int FROM listing_saved s WHERE s.listing_id=l.id) saves FROM listings l WHERE user_id=$1 AND status<>'deleted' ORDER BY created_at DESC`, [req.user.id])).rows,
      saved: (await q(`SELECT l.* FROM listing_saved s JOIN listings l ON l.id=s.listing_id WHERE s.user_id=$1 AND l.status='active'`, [req.user.id])).rows }); }));
  app.get('/api/market/:id', auth, wrap(async (req, res) => { await ensure();
    const l = (await q(`SELECT l.*, p.username, COALESCE(p.display_name,u.name) seller_name, u.created_at seller_since,
      (SELECT count(*)::int FROM listings x WHERE x.user_id=l.user_id AND x.status IN ('active','sold')) seller_listings,
      EXISTS(SELECT 1 FROM listing_saved s WHERE s.listing_id=l.id AND s.user_id=$2) saved
      FROM listings l JOIN users u ON u.id=l.user_id LEFT JOIN profiles p ON p.user_id=l.user_id WHERE l.id=$1 AND (l.status IN ('active','sold') OR l.user_id=$2)`, [+req.params.id, req.user.id])).rows[0];
    if (!l) return fail(res, 404, 'Listing not found.');
    if (l.user_id !== req.user.id) await q('UPDATE listings SET views=views+1 WHERE id=$1', [l.id]);
    const similar = (await q(`SELECT id,title,price,currency,photos FROM listings WHERE category=$1 AND status='active' AND id<>$2 ORDER BY created_at DESC LIMIT 6`, [l.category, l.id])).rows;
    res.json({ listing: l, similar, mine: l.user_id === req.user.id }); }));
  const listingBody = b => {
    const category = CATS.includes(b.category) ? b.category : 'other';
    const photos = (Array.isArray(b.photos) ? b.photos : []).filter(u => typeof u === 'string' && /^\/ugc\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(u)).slice(0, 10);
    const d = b.details && typeof b.details === 'object' ? b.details : {};
    const details = {}; for (const k of ['make', 'model', 'year', 'mileage', 'fuel', 'transmission', 'bedrooms', 'bathrooms', 'size', 'listingType', 'propertyType', 'brand', 'size_label', 'subject', 'level', 'mode', 'rate', 'service', 'area', 'availability'])
      if (d[k] != null && String(d[k]).trim()) details[k] = clean(String(d[k]), 60);
    return { title: clean(b.title, 100), price: Math.max(0, Math.min(1e11, +b.price || 0)), currency: /^[A-Z]{3}$/.test(b.currency) ? b.currency : 'USD', category,
      condition: ['new', 'like-new', 'good', 'fair'].includes(b.condition) ? b.condition : null, description: clean(b.description, 5000), location: clean(b.location, 100),
      lat: isFinite(+b.lat) && b.lat !== '' && b.lat != null ? +b.lat : null, lng: isFinite(+b.lng) && b.lng !== '' && b.lng != null ? +b.lng : null,
      photos, details, delivery: ['pickup', 'shipping', 'both'].includes(b.delivery) ? b.delivery : 'pickup' };
  };
  app.post('/api/market', auth, wrap(async (req, res) => { await ensure(); const x = listingBody(req.body || {});
    if (x.title.length < 3) return fail(res, 400, 'Add a title.'); if (!x.photos.length) return fail(res, 400, 'Add at least one photo.');
    const recent = (await q(`SELECT count(*)::int n FROM listings WHERE user_id=$1 AND created_at>now()-interval '1 day'`, [req.user.id])).rows[0].n; if (recent >= 20) return fail(res, 429, 'Daily listing limit reached.');
    const fee = feeFor(x.category), free = fee === 0;
    const r = await q(`INSERT INTO listings(user_id,title,price,currency,category,condition,description,location,lat,lng,photos,details,delivery,status,fee_usd) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [req.user.id, x.title, x.category === 'free' ? 0 : x.price, x.currency, x.category, x.condition, x.description, x.location, x.lat, x.lng, JSON.stringify(x.photos), JSON.stringify(x.details), x.delivery, free ? 'active' : 'unpaid', fee]);
    const id = r.rows[0].id;
    res.json({ id, fee, checkout: free ? null : await pay(req, 'listing', id, fee, `Listing: ${x.title}`) }); }));
  app.post('/api/market/:id/pay', auth, wrap(async (req, res) => { await ensure();
    const l = (await q(`SELECT id,title,fee_usd FROM listings WHERE id=$1 AND user_id=$2 AND status='unpaid'`, [+req.params.id, req.user.id])).rows[0]; if (!l) return fail(res, 404, 'Nothing to pay.');
    res.json({ checkout: await pay(req, 'listing', l.id, +l.fee_usd, `Listing: ${l.title}`) }); }));
  app.put('/api/market/:id', auth, wrap(async (req, res) => { await ensure(); const b = req.body || {};
    const l = (await q('SELECT * FROM listings WHERE id=$1 AND user_id=$2', [+req.params.id, req.user.id])).rows[0]; if (!l) return fail(res, 404, 'Listing not found.');
    if (b.status) { if (!['active', 'sold', 'pending'].includes(b.status) || l.status === 'unpaid') return fail(res, 400, 'Bad status'); await q('UPDATE listings SET status=$2,updated_at=now() WHERE id=$1', [l.id, b.status]); return res.json({ ok: true }); }
    const x = listingBody({ ...l, ...b, category: l.category }); // category can't change (fee depends on it)
    await q(`UPDATE listings SET title=$2,price=$3,currency=$4,condition=$5,description=$6,location=$7,photos=$8,details=$9,delivery=$10,updated_at=now() WHERE id=$1`,
      [l.id, x.title || l.title, x.price, x.currency, x.condition, x.description, x.location, JSON.stringify(x.photos.length ? x.photos : l.photos), JSON.stringify(x.details), x.delivery]);
    res.json({ ok: true }); }));
  app.delete('/api/market/:id', auth, wrap(async (req, res) => { await ensure(); await q(`UPDATE listings SET status='deleted' WHERE id=$1 AND (user_id=$2 OR $3)`, [+req.params.id, req.user.id, isAdmin(req.user)]); res.json({ ok: true }); }));
  app.post('/api/market/:id/save', auth, wrap(async (req, res) => { await ensure(); const on = req.body?.save !== false;
    await q(on ? 'INSERT INTO listing_saved VALUES($1,$2) ON CONFLICT DO NOTHING' : 'DELETE FROM listing_saved WHERE user_id=$1 AND listing_id=$2', [req.user.id, +req.params.id]); res.json({ saved: on }); }));
  app.post('/api/market/:id/report', auth, wrap(async (req, res) => { await ensure(); await q('INSERT INTO listing_reports(listing_id,user_id,reason) VALUES($1,$2,$3)', [+req.params.id, req.user.id, clean(req.body?.reason, 300) || 'Reported']); res.json({ ok: true }); }));
  // Message seller: opens (or reuses) a DM and sends a listing card.
  app.post('/api/market/:id/message', auth, wrap(async (req, res) => { await ensure();
    const l = (await q(`SELECT l.id,l.title,l.price,l.currency,l.photos,l.user_id FROM listings l WHERE l.id=$1 AND l.status='active'`, [+req.params.id])).rows[0]; if (!l) return fail(res, 404, 'Listing not found.');
    if (l.user_id === req.user.id) return fail(res, 400, 'This is your listing.');
    if (!ctx.openDm) return fail(res, 503, 'Messaging unavailable.');
    const cid = await ctx.openDm(req.user.id, l.user_id);
    await ctx.sendDm(cid, req.user.id, { kind: 'listing', body: clean(req.body?.text, 500) || 'Is this still available?', media: { id: l.id, title: l.title, price: +l.price, currency: l.currency, photo: l.photos?.[0] || null } });
    res.json({ conversationId: cid }); }));
};
module.exports.FEES = FEES; module.exports.JOB_PLANS = JOB_PLANS;
