// Feature: worship-plus — Istighfar counter, Sunnah tracker, Halal food near me (OSM Overpass).
// The salah guide is static client content (no server routes).
const fs = require('fs');
const path = require('path');

module.exports = function worshipPlus(ctx) {
  const { app, q, auth, wrap, todayFor } = ctx;
  const SUN = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'data', 'wp-sunnah.json')));
  const IST = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'data', 'wp-istighfar.json')));
  const TABS = { daily: SUN.daily, weekly: SUN.weekly, monthly: SUN.monthly };
  const ITEM = {}; for (const t of Object.keys(TABS)) for (const it of TABS[t]) ITEM[it.id] = { tab: t, target: it.target || 1 };
  const PHRASES = new Set(IST.formulas.map(f => f.id));
  const TARGETS = [33, 70, 100, 1000];

  let ready;
  const ensure = () => ready ||= (async () => {
    await q(`CREATE TABLE IF NOT EXISTS wp_istighfar (user_id INT NOT NULL, day DATE NOT NULL, n INT NOT NULL DEFAULT 0, target INT NOT NULL DEFAULT 100, PRIMARY KEY(user_id, day))`);
    await q(`CREATE TABLE IF NOT EXISTS wp_sunnah (user_id INT NOT NULL, period TEXT NOT NULL, item TEXT NOT NULL, n INT NOT NULL DEFAULT 1, at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(user_id, period, item))`);
    await q(`CREATE TABLE IF NOT EXISTS wp_prefs (user_id INT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}'::jsonb)`);
  })().catch(e => { ready = null; throw e; });

  // ---------- date helpers ----------
  const addDays = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  function isoWeek(day) { // 'YYYY-Www'
    const d = new Date(day + 'T00:00:00Z'); const dow = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - dow);
    const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); const w = Math.ceil(((d - y0) / 864e5 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(w).padStart(2, '0')}`;
  }
  const keysFor = day => ({ daily: day, weekly: isoWeek(day), monthly: day.slice(0, 7) });

  async function prefs(uid) { const r = await q('SELECT data FROM wp_prefs WHERE user_id=$1', [uid]); return r.rows[0]?.data || {}; }
  const cleanPrefs = p => ({ istTarget: TARGETS.includes(+p.istTarget) ? +p.istTarget : 100, phrase: PHRASES.has(p.phrase) ? p.phrase : 'atub', hidden: Array.isArray(p.hidden) ? p.hidden.filter(id => ITEM[id]) : [] });

  app.put('/api/worship-plus/prefs', auth, wrap(async (req, res) => {
    await ensure(); const b = req.body || {}; const cur = cleanPrefs(await prefs(req.user.id));
    if (b.istTarget !== undefined) { if (!TARGETS.includes(+b.istTarget)) return res.status(400).json({ error: 'Target must be 33, 70, 100 or 1000' }); cur.istTarget = +b.istTarget; }
    if (b.phrase !== undefined) { if (!PHRASES.has(b.phrase)) return res.status(400).json({ error: 'Unknown phrase' }); cur.phrase = b.phrase; }
    if (b.hidden !== undefined) { if (!Array.isArray(b.hidden) || b.hidden.length > 60) return res.status(400).json({ error: 'Bad hidden list' }); cur.hidden = [...new Set(b.hidden.filter(id => typeof id === 'string' && ITEM[id]))]; }
    await q(`INSERT INTO wp_prefs(user_id,data) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET data=$2`, [req.user.id, JSON.stringify(cur)]);
    if (b.istTarget !== undefined) await q(`INSERT INTO wp_istighfar(user_id,day,n,target) VALUES($1,$2,0,$3) ON CONFLICT(user_id,day) DO UPDATE SET target=$3`, [req.user.id, todayFor(req.user), cur.istTarget]);
    res.json({ prefs: cur });
  }));

  // ---------- ISTIGHFAR ----------
  async function istState(user) {
    const uid = user.id, today = todayFor(user), p = cleanPrefs(await prefs(uid));
    const rows = (await q(`SELECT to_char(day,'YYYY-MM-DD') d, n, target FROM wp_istighfar WHERE user_id=$1 AND day >= $2 ORDER BY day`, [uid, addDays(today, -400)])).rows;
    const by = Object.fromEntries(rows.map(r => [r.d, r]));
    const met = d => by[d] && by[d].n >= by[d].target;
    let streak = 0, d = met(today) ? today : addDays(today, -1); while (met(d)) { streak++; d = addDays(d, -1); }
    let best = 0, run = 0, prev = null; for (const r of rows) { if (r.n >= r.target) { run = prev && addDays(prev, 1) === r.d ? run + 1 : 1; prev = r.d; best = Math.max(best, run); } else { run = 0; prev = null; } }
    const history = []; for (let i = 29; i >= 0; i--) { const dd = addDays(today, -i); history.push({ d: dd, n: by[dd]?.n || 0, target: by[dd]?.target || p.istTarget }); }
    const total = (await q('SELECT COALESCE(sum(n),0)::int t FROM wp_istighfar WHERE user_id=$1', [uid])).rows[0].t;
    return { today, count: by[today]?.n || 0, target: p.istTarget, phrase: p.phrase, streak, best, total, history };
  }
  app.get('/api/worship-plus/istighfar', auth, wrap(async (req, res) => { await ensure(); res.json(await istState(req.user)); }));
  app.post('/api/worship-plus/istighfar', auth, wrap(async (req, res) => {
    await ensure(); const b = req.body || {}, uid = req.user.id, today = todayFor(req.user);
    const p = cleanPrefs(await prefs(uid));
    if (b.reset === true) await q(`INSERT INTO wp_istighfar(user_id,day,n,target) VALUES($1,$2,0,$3) ON CONFLICT(user_id,day) DO UPDATE SET n=0`, [uid, today, p.istTarget]);
    else {
      const add = Math.trunc(+b.add);
      if (!Number.isFinite(add) || add < 1 || add > 1000) return res.status(400).json({ error: 'add must be 1–1000' });
      await q(`INSERT INTO wp_istighfar(user_id,day,n,target) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,day) DO UPDATE SET n=LEAST(wp_istighfar.n+$3, 100000), target=$4`, [uid, today, add, p.istTarget]);
    }
    res.json(await istState(req.user));
  }));

  // ---------- SUNNAH ----------
  async function sunState(user) {
    const uid = user.id, today = todayFor(user), keys = keysFor(today), p = cleanPrefs(await prefs(uid));
    const rows = (await q('SELECT period, item, n FROM wp_sunnah WHERE user_id=$1 AND period = ANY($2)', [uid, [keys.daily, keys.weekly, keys.monthly]])).rows;
    const done = { daily: {}, weekly: {}, monthly: {} };
    for (const r of rows) { const it = ITEM[r.item]; if (it && keys[it.tab] === r.period) done[it.tab][r.item] = r.n; }
    const hidden = new Set(p.hidden);
    const visDaily = SUN.daily.filter(i => !hidden.has(i.id)).map(i => i.id);
    const since = addDays(today, -400);
    const dayRows = (await q(`SELECT period d, array_agg(item) items FROM wp_sunnah WHERE user_id=$1 AND period ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND period >= $2 GROUP BY period`, [uid, since])).rows;
    const byDay = Object.fromEntries(dayRows.map(r => [r.d, new Set(r.items)]));
    const cnt = d => visDaily.filter(id => byDay[d]?.has(id)).length;
    const full = d => visDaily.length > 0 && cnt(d) === visDaily.length;
    let streak = 0, d = full(today) ? today : addDays(today, -1); while (full(d)) { streak++; d = addDays(d, -1); }
    const history = []; for (let i = 13; i >= 0; i--) { const dd = addDays(today, -i); history.push({ d: dd, done: cnt(dd), total: visDaily.length }); }
    return { today, keys, done, hidden: p.hidden, streak, history };
  }
  app.get('/api/worship-plus/sunnah', auth, wrap(async (req, res) => { await ensure(); res.json(await sunState(req.user)); }));
  app.post('/api/worship-plus/sunnah', auth, wrap(async (req, res) => {
    await ensure(); const b = req.body || {}, it = ITEM[b.item];
    if (typeof b.item !== 'string' || !it) return res.status(400).json({ error: 'Unknown item' });
    const n = Math.trunc(+b.n);
    if (!Number.isFinite(n) || n < 0 || n > it.target) return res.status(400).json({ error: `n must be 0–${it.target}` });
    const period = keysFor(todayFor(req.user))[it.tab];
    if (n === 0) await q('DELETE FROM wp_sunnah WHERE user_id=$1 AND period=$2 AND item=$3', [req.user.id, period, b.item]);
    else await q(`INSERT INTO wp_sunnah(user_id,period,item,n) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,period,item) DO UPDATE SET n=$4, at=now()`, [req.user.id, period, b.item, n]);
    res.json(await sunState(req.user));
  }));

  // ---------- HALAL PLACES (OpenStreetMap Overpass) ----------
  // Speed: one 10 km search per ~1 km grid cell serves every radius (1/3/5/10 km are filtered locally), results are cached in
  // memory + the database (survives restarts), stale results are served instantly while refreshing in the background,
  // and the Overpass mirrors are raced with a short server-side timeout.
  const MAXR = 10000, FRESH = 24 * 3600e3, STALE = 14 * 86400e3;
  const cache = new Map(); const lastMiss = new Map(); const inflight = new Map();
  const toRad = x => x * Math.PI / 180;
  const dist = (a, b, c, d) => { const R = 6371e3, p = toRad(c - a), l = toRad(d - b); const h = Math.sin(p / 2) ** 2 + Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(l / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const cellOf = (lat, lng) => `${(Math.round(lat * 100) / 100).toFixed(2)},${(Math.round(lng * 100) / 100).toFixed(2)}`; // ~1 km grid
  let hReady; const hEnsure = () => hReady ||= q(`CREATE TABLE IF NOT EXISTS halal_cache (cell TEXT PRIMARY KEY, data JSONB NOT NULL, fetched_at TIMESTAMPTZ NOT NULL DEFAULT now())`).catch(e => { hReady = null; throw e; });
  async function getCell(cell) {
    const m = cache.get(cell); if (m) return m;
    try { await hEnsure(); const r = (await q('SELECT data, extract(epoch from fetched_at)*1000 t FROM halal_cache WHERE cell=$1', [cell])).rows[0]; if (r) { const v = { t: +r.t, d: r.data }; cache.set(cell, v); return v; } } catch {}
    return null;
  }
  async function fetchCell(cell) {
    const [lat, lng] = cell.split(',').map(Number);
    const A = `(around:${MAXR},${lat},${lng})`, AM = '["amenity"~"^(restaurant|fast_food|cafe|butcher|food_court|ice_cream)$"]', SH = '["shop"~"^(butcher|deli|supermarket|convenience|bakery)$"]';
    const DH = '["diet:halal"~"^(yes|only)$"]', CH = '["cuisine"~"halal",i]';
    const ql = `[out:json][timeout:50];(nwr${AM}${DH}${A};nwr${AM}${CH}${A};nwr${SH}${DH}${A};nwr["amenity"="butcher"]${CH}${A};nwr["shop"="butcher"]${CH}${A};);out tags center 400;`;
    const eps = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
    const ctl = new AbortController();
    const j = await Promise.any(eps.map(ep => fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ShukrApp/2.0 (Muslim companion PWA)' }, body: 'data=' + encodeURIComponent(ql), signal: AbortSignal.any([ctl.signal, AbortSignal.timeout(55000)]) })
      .then(r => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); }).then(x => { if (x.remark && /runtime error|timed out/i.test(x.remark) && !(x.elements || []).length) throw new Error('timeout'); return x; }))).catch(() => null);
    ctl.abort();
    if (!j) throw new Error('Map service is busy, please try again in a minute');
    const seen = new Set();
    const d = (j.elements || []).map(e => {
      const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon, t = e.tags || {};
      const kind = t.shop === 'butcher' || t.amenity === 'butcher' ? 'butcher' : t.shop ? 'shop' : t.amenity === 'food_court' ? 'restaurant' : t.amenity === 'ice_cream' ? 'cafe' : t.amenity;
      return { id: e.type + e.id, name: String(t.name || t['name:en'] || ({ butcher: 'Halal butcher', cafe: 'Halal café', fast_food: 'Halal fast food', shop: 'Halal shop' }[kind] || 'Halal restaurant')).slice(0, 120),
        kind, lat: la == null ? null : +la.toFixed(6), lng: lo == null ? null : +lo.toFixed(6),
        cuisine: t.cuisine ? String(t.cuisine).split(';').map(s => s.trim().replace(/_/g, ' ')).filter(c => c && !/^halal$/i.test(c)).slice(0, 4) : [],
        halal: t['diet:halal'] === 'only' ? 'only' : 'yes',
        hours: t.opening_hours ? String(t.opening_hours).slice(0, 160) : null,
        address: [t['addr:housenumber'], t['addr:street'], t['addr:city']].filter(Boolean).join(', ').slice(0, 160),
        phone: t.phone || t['contact:phone'] || null, website: t.website || t['contact:website'] || null };
    }).filter(p => p.lat != null && !seen.has(p.id) && seen.add(p.id));
    const v = { t: Date.now(), d }; cache.set(cell, v); if (cache.size > 800) cache.delete(cache.keys().next().value);
    hEnsure().then(() => q(`INSERT INTO halal_cache(cell,data,fetched_at) VALUES($1,$2::jsonb,now()) ON CONFLICT(cell) DO UPDATE SET data=$2::jsonb, fetched_at=now()`, [cell, JSON.stringify(d)])).catch(() => {});
    return v;
  }
  const refresh = cell => { let job = inflight.get(cell); if (!job) { job = fetchCell(cell).finally(() => setTimeout(() => inflight.delete(cell), 500)); inflight.set(cell, job); job.catch(() => {}); } return job; };
  const shape = (v, lat, lng, km) => v.d.map(p => ({ ...p, dist: Math.round(dist(lat, lng, p.lat, p.lng)) })).filter(p => p.dist <= km * 1000).sort((a, b) => a.dist - b.dist).slice(0, 200);
  app.get('/api/worship-plus/halal', auth, wrap(async (req, res) => {
    const s = req.user.settings || {};
    const lat = req.query.lat !== undefined ? +req.query.lat : (s.lat == null ? NaN : +s.lat);
    const lng = req.query.lng !== undefined ? +req.query.lng : (s.lng == null ? NaN : +s.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return res.status(400).json({ error: 'Set your location first', needLocation: true });
    const km = Math.min(10, Math.max(1, Math.round(+req.query.km || 3)));
    const cell = cellOf(lat, lng), hit = await getCell(cell), age = hit ? Date.now() - hit.t : Infinity;
    if (hit && age < STALE) { if (age > FRESH) refresh(cell); return res.json({ places: shape(hit, lat, lng, km), cached: true, km, center: { lat, lng }, updated: hit.t }); }
    if (!inflight.has(cell)) { const lm = lastMiss.get(req.user.id) || 0; if (Date.now() - lm < 2000) return res.status(429).json({ error: 'Please wait a moment and try again' }); lastMiss.set(req.user.id, Date.now()); if (lastMiss.size > 5000) lastMiss.clear(); }
    const r = await Promise.race([refresh(cell).catch(e => ({ error: e.message })), new Promise(ok => setTimeout(() => ok({ pending: true }), 4000))]);
    if (r.pending) return res.json({ pending: true, places: [], km, center: { lat, lng } });
    if (r.error) return res.status(502).json({ error: r.error });
    res.json({ places: shape(r, lat, lng, km), km, center: { lat, lng }, updated: r.t });
  }));
  // Warm the cache for a user's saved location (called when the menu opens) so the page is instant.
  app.post('/api/worship-plus/halal/warm', auth, wrap(async (req, res) => {
    const s = req.user.settings || {}; if (s.lat == null || s.lng == null) return res.json({ ok: false });
    const cell = cellOf(+s.lat, +s.lng), hit = await getCell(cell); if (!hit || Date.now() - hit.t > FRESH) refresh(cell);
    res.json({ ok: true });
  }));

  // ---------- Alim connector (small per-user summaries) ----------
  ctx.alimData = ctx.alimData || {};
  ctx.alimData.istighfar = async user => {
    await ensure(); const s = await istState(user); const f = IST.formulas.find(x => x.id === s.phrase);
    return { today: s.today, countToday: s.count, dailyTarget: s.target, activePhrase: f ? f.short : s.phrase, streakDays: s.streak, bestStreak: s.best, lifetimeTotal: s.total,
      last7: s.history.slice(-7).map(h => `${h.d.slice(5)}:${h.n}`).join(' '), page: '/istighfar' };
  };
  ctx.alimData.sunnah = async user => {
    await ensure(); const s = await sunState(user); const hid = new Set(s.hidden);
    const sum = tab => { const vis = TABS[tab].filter(i => !hid.has(i.id)); return { done: vis.filter(i => (s.done[tab][i.id] || 0) >= (i.target || 1)).map(i => i.t.slice(0, 40)), notYet: vis.filter(i => (s.done[tab][i.id] || 0) < (i.target || 1)).map(i => i.t.slice(0, 40)), of: vis.length }; };
    const d = sum('daily'), w = sum('weekly'), m = sum('monthly');
    const out = { today: s.today, dailyStreak: s.streak, daily: { done: d.done, notYet: d.notYet }, weekly: { done: w.done, of: w.of }, monthly: { done: m.done, of: m.of },
      last7: s.history.slice(-7).map(h => `${h.d.slice(5)}:${h.done}/${h.total}`).join(' '), page: '/sunnah' };
    while (JSON.stringify(out).length > 1450 && (out.daily.notYet.length || out.daily.done.length)) { if (out.daily.notYet.length) out.daily.notYet.pop(); else out.daily.done.pop(); }
    return out;
  };
};
