// Ummah hub: community mosque database (Jummah times, khutbah languages, imam), mosque map, Jummah alerts.
// Mosque base data: OpenStreetMap (ODbL, credited). Jummah details: added & confirmed by the community.
const LANGS = ['Arabic', 'English', 'Urdu', 'Bengali', 'Turkish', 'Malay', 'Indonesian', 'Somali', 'French', 'Persian', 'Tamil', 'Sinhala', 'Swahili', 'Hausa', 'Pashto', 'Bosnian', 'Albanian', 'German', 'Dutch', 'Spanish', 'Kurdish', 'Russian', 'Uzbek', 'Gujarati', 'Malayalam', 'Hindi', 'Punjabi', 'Amharic', 'Yoruba', 'Chinese'];
const toRad = x => x * Math.PI / 180;
const dist = (a, b, c, d) => { const R = 6371e3, p = toRad(c - a), l = toRad(d - b); const h = Math.sin(p / 2) ** 2 + Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(l / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const hhmm = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : null;
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

module.exports = function ummah(ctx) {
  const { app, q, auth, wrap } = ctx;
  let ready = null;
  const ensure = () => ready ||= (async () => {
    await q(`CREATE TABLE IF NOT EXISTS ummah_mosques (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_ar TEXT, lat DOUBLE PRECISION NOT NULL, lng DOUBLE PRECISION NOT NULL,
      address TEXT, phone TEXT, website TEXT, osm BOOLEAN DEFAULT true, imam TEXT, jummah JSONB DEFAULT '[]', langs JSONB DEFAULT '[]', facilities JSONB DEFAULT '{}', notes TEXT,
      verified INT DEFAULT 0, updated_by INT, updated_at TIMESTAMPTZ DEFAULT now(), created_at TIMESTAMPTZ DEFAULT now())`);
    await q('CREATE INDEX IF NOT EXISTS ummah_mosques_geo ON ummah_mosques(lat, lng)');
    await q(`CREATE TABLE IF NOT EXISTS ummah_mosque_edits (id SERIAL PRIMARY KEY, mosque_id TEXT, user_id INT, data JSONB, created_at TIMESTAMPTZ DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS ummah_mosque_votes (mosque_id TEXT, user_id INT, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(mosque_id, user_id))`);
    await q(`CREATE TABLE IF NOT EXISTS ummah_fav (user_id INT, mosque_id TEXT, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(user_id, mosque_id))`);
    await q(`CREATE TABLE IF NOT EXISTS ummah_checkins (user_id INT, mosque_id TEXT, day TEXT, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(user_id, day))`);
  })().catch(e => { ready = null; throw e; });
  ctx.ummahEnsure = ensure;

  const row = (m, lat, lng, extra = {}) => ({ id: m.id, name: m.name, nameAr: m.name_ar, lat: m.lat, lng: m.lng, address: m.address, phone: m.phone, website: m.website,
    imam: m.imam, jummah: m.jummah || [], langs: m.langs || [], facilities: m.facilities || {}, notes: m.notes, verified: m.verified || 0, updatedAt: m.updated_at,
    dist: lat != null ? Math.round(dist(lat, lng, m.lat, m.lng)) : null, ...extra });

  // OSM import through the existing /api/mosques fetcher (cached) — upsert base facts, keep community fields.
  const imported = new Map(); // area cell -> last import time
  async function ensureArea(lat, lng, rad) {
    const cell = `${lat.toFixed(2)},${lng.toFixed(2)},${rad > 8000 ? 'w' : 'n'}`; const last = imported.get(cell);
    if (last && Date.now() - last < 24 * 3600e3) return;
    const have = (await nearby(lat, lng, rad, 5)).length;
    const job = importOsm(lat, lng, rad).then(() => imported.set(cell, Date.now())).catch(() => {});
    if (!have) await Promise.race([job, new Promise(r => setTimeout(r, 25000))]);
  }
  async function importOsm(lat, lng, rad) {
    if (!ctx.fetchOsmMosques) return;
    let list = []; try { list = await ctx.fetchOsmMosques(lat, lng, rad); } catch { return; }
    for (const m of list) {
      await q(`INSERT INTO ummah_mosques(id,name,name_ar,lat,lng,address,phone,website,osm) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true)
        ON CONFLICT (id) DO UPDATE SET name=CASE WHEN ummah_mosques.osm THEN EXCLUDED.name ELSE ummah_mosques.name END, lat=EXCLUDED.lat, lng=EXCLUDED.lng,
        address=COALESCE(NULLIF(ummah_mosques.address,''),EXCLUDED.address), phone=COALESCE(ummah_mosques.phone,EXCLUDED.phone), website=COALESCE(ummah_mosques.website,EXCLUDED.website)`,
        [m.id, m.name, m.nameAr, m.lat, m.lng, m.address || null, m.phone, m.website]).catch(() => {});
    }
  }
  async function nearby(lat, lng, rad, limit = 120) {
    const dLat = rad / 111320, dLng = rad / (111320 * Math.max(.05, Math.cos(toRad(lat))));
    const rows = (await q('SELECT * FROM ummah_mosques WHERE lat BETWEEN $1 AND $2 AND lng BETWEEN $3 AND $4 LIMIT 600', [lat - dLat, lat + dLat, lng - dLng, lng + dLng])).rows;
    return rows.map(m => row(m, lat, lng)).filter(m => m.dist <= rad).sort((a, b) => a.dist - b.dist).slice(0, limit);
  }
  ctx.ummahNearby = async (lat, lng, rad) => { await ensure(); await ensureArea(lat, lng, rad).catch(() => {}); return nearby(lat, lng, rad, 20); };

  app.get('/api/ummah/mosques', auth, wrap(async (req, res) => { await ensure();
    const lat = +req.query.lat, lng = +req.query.lng, rad = Math.min(Math.max(+req.query.r || 5000, 500), 30000);
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return res.status(400).json({ error: 'Location required' });
    if (req.query.refresh !== '0') await ensureArea(lat, lng, Math.min(rad, 15000));
    let list = await nearby(lat, lng, rad);
    if (req.query.jummah === '1') list = list.filter(m => m.jummah.length);
    if (req.query.lang) list = list.filter(m => m.langs.includes(req.query.lang));
    const favs = new Set((await q('SELECT mosque_id FROM ummah_fav WHERE user_id=$1', [req.user.id])).rows.map(r => r.mosque_id));
    list.forEach(m => { m.fav = favs.has(m.id); });
    res.json({ mosques: list, langs: LANGS, credit: '© OpenStreetMap contributors' });
  }));
  app.get('/api/ummah/mosques/:id', auth, wrap(async (req, res) => { await ensure();
    const m = (await q('SELECT * FROM ummah_mosques WHERE id=$1', [req.params.id])).rows[0]; if (!m) return res.status(404).json({ error: 'Mosque not found' });
    const fav = !!(await q('SELECT 1 FROM ummah_fav WHERE user_id=$1 AND mosque_id=$2', [req.user.id, m.id])).rows[0];
    const voted = !!(await q('SELECT 1 FROM ummah_mosque_votes WHERE user_id=$1 AND mosque_id=$2', [req.user.id, m.id])).rows[0];
    const s = req.user.settings || {};
    const goers = +(await q(`SELECT count(*)::int n FROM ummah_checkins WHERE mosque_id=$1 AND created_at > now() - interval '8 days'`, [m.id])).rows[0].n;
    res.json({ mosque: row(m, s.lat != null ? +s.lat : null, s.lng != null ? +s.lng : null, { fav, voted, goers }), langs: LANGS });
  }));
  // Add a mosque that isn't on the map
  const edits = new Map();
  const limited = id => { const now = Date.now(), h = (edits.get(id) || []).filter(t => now - t < 3600e3); if (h.length >= 30) return true; h.push(now); edits.set(id, h); return false; };
  function parseInfo(b) {
    const jummah = (Array.isArray(b.jummah) ? b.jummah : []).slice(0, 4).map(j => ({ khutbah: hhmm(j.khutbah), salah: hhmm(j.salah), lang: LANGS.includes(j.lang) ? j.lang : null })).filter(j => j.khutbah || j.salah);
    const langs = [...new Set([...(Array.isArray(b.langs) ? b.langs : []).filter(l => LANGS.includes(l)), ...jummah.map(j => j.lang).filter(Boolean)])].slice(0, 8);
    const fac = {}; for (const k of ['women', 'wudu', 'parking', 'wheelchair', 'kids', 'eid']) if (b.facilities?.[k] != null) fac[k] = !!b.facilities[k];
    return { imam: clean(b.imam, 80) || null, jummah, langs, facilities: fac, notes: clean(b.notes, 300) || null, phone: clean(b.phone, 30) || null, website: /^https?:\/\/[^\s]{3,200}$/.test(b.website || '') ? b.website : null };
  }
  app.post('/api/ummah/mosques', auth, wrap(async (req, res) => { await ensure(); if (limited(req.user.id)) return res.status(429).json({ error: 'Too many edits — try again later.' });
    const b = req.body || {}; const name = clean(b.name, 90), lat = +b.lat, lng = +b.lng;
    if (name.length < 3 || !isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return res.status(400).json({ error: 'Name and map position are required' });
    const near = (await nearby(lat, lng, 60, 3)).find(m => m.name.toLowerCase() === name.toLowerCase());
    if (near) return res.status(409).json({ error: 'This mosque is already listed', id: near.id });
    const info = parseInfo(b); const id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await q(`INSERT INTO ummah_mosques(id,name,lat,lng,address,phone,website,osm,imam,jummah,langs,facilities,notes,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,false,$8,$9,$10,$11,$12,$13)`,
      [id, name, lat, lng, clean(b.address, 160) || null, info.phone, info.website, info.imam, JSON.stringify(info.jummah), JSON.stringify(info.langs), JSON.stringify(info.facilities), info.notes, req.user.id]);
    await q('INSERT INTO ummah_mosque_edits(mosque_id,user_id,data) VALUES($1,$2,$3)', [id, req.user.id, { created: true, name, ...info }]);
    res.status(201).json({ id });
  }));
  // Community update of Jummah times / imam / languages
  app.put('/api/ummah/mosques/:id', auth, wrap(async (req, res) => { await ensure(); if (limited(req.user.id)) return res.status(429).json({ error: 'Too many edits — try again later.' });
    const m = (await q('SELECT * FROM ummah_mosques WHERE id=$1', [req.params.id])).rows[0]; if (!m) return res.status(404).json({ error: 'Mosque not found' });
    const info = parseInfo(req.body || {});
    await q(`UPDATE ummah_mosques SET imam=$2, jummah=$3, langs=$4, facilities=$5, notes=$6, phone=COALESCE($7,phone), website=COALESCE($8,website), verified=0, updated_by=$9, updated_at=now() WHERE id=$1`,
      [m.id, info.imam, JSON.stringify(info.jummah), JSON.stringify(info.langs), JSON.stringify(info.facilities), info.notes, info.phone, info.website, req.user.id]);
    await q('DELETE FROM ummah_mosque_votes WHERE mosque_id=$1', [m.id]);
    await q('INSERT INTO ummah_mosque_edits(mosque_id,user_id,data) VALUES($1,$2,$3)', [m.id, req.user.id, info]);
    ctx.creatorQuestEvent?.(req.user.id, 'mosque_edit');
    res.json({ ok: true });
  }));
  app.post('/api/ummah/mosques/:id/confirm', auth, wrap(async (req, res) => { await ensure();
    const m = (await q('SELECT updated_by FROM ummah_mosques WHERE id=$1', [req.params.id])).rows[0]; if (!m) return res.status(404).json({ error: 'Mosque not found' });
    if (m.updated_by === req.user.id) return res.status(400).json({ error: 'Someone else needs to confirm your update' });
    const r = await q('INSERT INTO ummah_mosque_votes(mosque_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.params.id, req.user.id]);
    if (r.rowCount) await q('UPDATE ummah_mosques SET verified=verified+1 WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  }));
  app.post('/api/ummah/mosques/:id/fav', auth, wrap(async (req, res) => { await ensure();
    if (req.body?.on === false) await q('DELETE FROM ummah_fav WHERE user_id=$1 AND mosque_id=$2', [req.user.id, req.params.id]);
    else { const n = +(await q('SELECT count(*)::int n FROM ummah_fav WHERE user_id=$1', [req.user.id])).rows[0].n; if (n >= 20) return res.status(400).json({ error: 'You can follow up to 20 mosques' });
      await q('INSERT INTO ummah_fav(user_id,mosque_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.user.id, req.params.id]); }
    res.json({ ok: true });
  }));
  // "I'm going to Jummah here" — builds mosque hotspots
  app.post('/api/ummah/mosques/:id/going', auth, wrap(async (req, res) => { await ensure();
    const d = new Date(); const fri = new Date(d); fri.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7)); const day = fri.toISOString().slice(0, 10);
    if (req.body?.on === false) await q('DELETE FROM ummah_checkins WHERE user_id=$1 AND day=$2', [req.user.id, day]);
    else await q('INSERT INTO ummah_checkins(user_id,mosque_id,day) VALUES($1,$2,$3) ON CONFLICT (user_id,day) DO UPDATE SET mosque_id=$2, created_at=now()', [req.user.id, req.params.id, day]);
    res.json({ ok: true, day });
  }));
  // Ummah home stats: hotspots near the user
  app.get('/api/ummah/hotspots', auth, wrap(async (req, res) => { await ensure();
    const lat = +req.query.lat, lng = +req.query.lng; if (!isFinite(lat) || !isFinite(lng)) return res.json({ hotspots: [] });
    await ensureArea(lat, lng, 10000);
    const near = await nearby(lat, lng, 25000, 300); if (!near.length) return res.json({ hotspots: [], total: 0 });
    const ids = near.map(m => m.id);
    const counts = (await q(`SELECT mosque_id, count(*)::int n FROM ummah_checkins WHERE created_at > now() - interval '8 days' AND mosque_id = ANY($1) GROUP BY mosque_id`, [ids])).rows;
    const cm = new Map(counts.map(r => [r.mosque_id, r.n]));
    const hot = near.map(m => ({ ...m, goers: cm.get(m.id) || 0 })).filter(m => m.goers || m.jummah.length).sort((a, b) => (b.goers - a.goers) || (a.dist - b.dist)).slice(0, 10);
    const mine = (await q(`SELECT mosque_id FROM ummah_checkins WHERE user_id=$1 AND created_at > now() - interval '8 days' ORDER BY created_at DESC LIMIT 1`, [req.user.id])).rows[0]?.mosque_id || null;
    res.json({ hotspots: hot, total: near.length, withJummah: near.filter(m => m.jummah.length).length, going: mine });
  }));
  app.get('/api/ummah/langs', (req, res) => res.json({ langs: LANGS }));
  // Developer-only: licences & permissions checklist (base list in lib/data, status/notes overrides in app_kv)
  const LIC = require('./data/licences.json');
  app.get('/api/admin/licences', auth, wrap(async (req, res) => { if (!ctx.isAdmin?.(req.user)) return res.status(403).json({ error: 'Developer only' });
    await q('CREATE TABLE IF NOT EXISTS app_kv (k TEXT PRIMARY KEY, v JSONB NOT NULL)');
    const ov = (await q(`SELECT v FROM app_kv WHERE k='licences'`)).rows[0]?.v || {};
    res.json({ items: LIC.map(x => ({ ...x, ...(ov[x.id] || {}) })) }); }));
  app.put('/api/admin/licences/:id', auth, wrap(async (req, res) => { if (!ctx.isAdmin?.(req.user)) return res.status(403).json({ error: 'Developer only' });
    if (!LIC.some(x => x.id === req.params.id)) return res.status(404).json({ error: 'Unknown item' });
    const st = ['needed', 'condition', 'done'].includes(req.body?.status) ? req.body.status : null; const note = String(req.body?.note ?? '').slice(0, 500);
    await q('CREATE TABLE IF NOT EXISTS app_kv (k TEXT PRIMARY KEY, v JSONB NOT NULL)');
    const ov = (await q(`SELECT v FROM app_kv WHERE k='licences'`)).rows[0]?.v || {};
    ov[req.params.id] = { ...(ov[req.params.id] || {}), ...(st ? { status: st } : {}), note, updatedAt: new Date().toISOString() };
    await q(`INSERT INTO app_kv(k,v) VALUES('licences',$1) ON CONFLICT (k) DO UPDATE SET v=$1`, [ov]);
    res.json({ ok: true }); }));
  // Prayer log history for the calendar (status per prayer per day)
  app.get('/api/prayers/history', auth, wrap(async (req, res) => {
    const days = Math.min(Math.max(+req.query.days || 120, 7), 400);
    const rows = (await q(`SELECT to_char(day,'YYYY-MM-DD') d, prayer, status FROM prayer_logs WHERE user_id=$1 AND day > CURRENT_DATE - ($2::int) ORDER BY day`, [req.user.id, days])).rows;
    const out = {}; for (const r of rows) (out[r.d] ||= { day: r.d })[r.prayer] = r.status;
    res.json({ days: Object.values(out) });
  }));

  // ---------- Hadith: Shukr's own English translation of the public-domain Arabic text, cached per section ----------
  const BOOKS = new Set(['bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah', 'malik', 'nawawi', 'qudsi', 'dehlawi']);
  const pending = new Map();
  app.get('/api/hadith/tr', auth, wrap(async (req, res) => {
    const book = String(req.query.book || ''), sec = String(+req.query.sec || 1);
    if (!/^[a-z]{3,12}$/.test(book)) return res.status(400).json({ error: 'Unknown book' });
    await q('CREATE TABLE IF NOT EXISTS hadith_tr (book TEXT, sec TEXT, items JSONB, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(book, sec))');
    const c = (await q('SELECT items FROM hadith_tr WHERE book=$1 AND sec=$2', [book, sec])).rows[0]; if (c) return res.json({ items: c.items });
    const key = book + ':' + sec;
    if (!pending.has(key)) pending.set(key, (async () => {
      const ed = { qudsi: 'ara-qudsi', nawawi: 'ara-nawawi', dehlawi: 'ara-dehlawi' }[book] || 'ara-' + book;
      const r = await fetch(`https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/${ed}/sections/${sec}.min.json`); if (!r.ok) throw new Error('Source unavailable');
      const hs = ((await r.json()).hadiths || []).filter(h => h.text && h.text.trim()).slice(0, 400);
      const items = {};
      const chunks = []; for (let i = 0; i < hs.length; i += 8) chunks.push(hs.slice(i, i + 8));
      let next = 0;
      const worker = async () => { while (next < chunks.length) { const chunk = chunks[next++];
        const prompt = 'Translate each hadith (Arabic) into clear, faithful modern English. Write your OWN translation — do not reproduce any published English translation. Keep the narrator chain brief (e.g. "Narrated Abu Hurayrah:"). Use (ﷺ) after the Prophet. Return JSON {"t":{"<number>":"English", ...}}.\n\n'
          + chunk.map(h => `#${h.hadithnumber}: ${h.text.slice(0, 3000)}`).join('\n\n');
        try { const out = ctx.parseJson(await ctx.aiChat([{ role: 'user', content: prompt }], { model: ctx.FAST_MODEL, json: true, max_tokens: 5000, temperature: 0.2 })); Object.assign(items, out?.t || {}); } catch (e) { console.log('hadith tr', e.message); } } };
      await Promise.all(Array.from({ length: Math.min(6, chunks.length) }, worker));
      // Retry anything the model skipped, one hadith at a time.
      const missing = hs.filter(h => !items[h.hadithnumber]);
      await Promise.all(missing.slice(0, 40).map(async h => { try { const out = ctx.parseJson(await ctx.aiChat([{ role: 'user', content: 'Translate this hadith (Arabic) into clear, faithful modern English in your OWN words (not a published translation). Brief narrator chain, (ﷺ) after the Prophet. Return JSON {"t":"English"}.\n\n' + h.text.slice(0, 4000) }], { model: ctx.FAST_MODEL, json: true, max_tokens: 3000, temperature: 0.2 })); if (out?.t) items[h.hadithnumber] = String(out.t); } catch {} }));
      if (Object.keys(items).length >= hs.length) await q('INSERT INTO hadith_tr(book,sec,items) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [book, sec, items]);
      return items;
    })().finally(() => setTimeout(() => pending.delete(key), 1000)));
    try { res.json({ items: await pending.get(key) }); } catch (e) { res.json({ items: {} }); }
  }));
};
module.exports.LANGS = LANGS;
module.exports.dist = dist;
