// Feature: muslim-tools — Ramadan daily goals + juz tracker.
// Hajj guide, monthly timetable and greeting cards are client-only (no server state).
module.exports = function muslimTools(ctx) {
  const { app, q, auth, wrap, todayFor } = ctx;

  let ready;
  const ensure = () => ready ||= (async () => {
    await q(`CREATE TABLE IF NOT EXISTS mt_ramadan_day (user_id INT NOT NULL, hyear INT NOT NULL, rday INT NOT NULL, data JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(user_id, hyear, rday))`);
    await q(`CREATE TABLE IF NOT EXISTS mt_ramadan_year (user_id INT NOT NULL, hyear INT NOT NULL, juz JSONB NOT NULL DEFAULT '[]'::jsonb, updated_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(user_id, hyear))`);
    await q(`CREATE TABLE IF NOT EXISTS mt_qada (user_id INT NOT NULL, prayer TEXT NOT NULL, owed INT NOT NULL DEFAULT 0, done INT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(user_id, prayer))`);
    await q(`CREATE TABLE IF NOT EXISTS mt_qada_log (user_id INT NOT NULL, day DATE NOT NULL, n INT NOT NULL DEFAULT 0, PRIMARY KEY(user_id, day))`);
  })().catch(e => { ready = null; throw e; });

  const QP = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'witr'];
  const MAX_OWED = 200000;
  const int = (v, lo, hi) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };
  const hyearOk = v => int(v, 1400, 1600);

  // ---------- QIBLA (GPS + magnetic declination, WMM) ----------
  let GEO = null; try { GEO = require('geomagnetism'); } catch {}
  const KAABA = [21.422487, 39.826206];
  app.get('/api/qibla', auth, wrap(async (req, res) => {
    const lat = +req.query.lat, lng = +req.query.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return res.status(400).json({ error: 'Bad location' });
    const r = x => x * Math.PI / 180, d = x => x * 180 / Math.PI, [kl, kg] = KAABA;
    const bearing = (d(Math.atan2(Math.sin(r(kg - lng)), Math.cos(r(lat)) * Math.tan(r(kl)) - Math.sin(r(lat)) * Math.cos(r(kg - lng)))) + 360) % 360;
    const h = Math.sin(r(kl - lat) / 2) ** 2 + Math.cos(r(lat)) * Math.cos(r(kl)) * Math.sin(r(kg - lng) / 2) ** 2;
    let declination = 0; try { if (GEO) declination = GEO.model(new Date()).point([lat, lng]).decl; } catch {}
    res.set('Cache-Control', 'private, max-age=3600').json({ bearing, distanceKm: 2 * 6371.0088 * Math.asin(Math.sqrt(h)), declination, model: GEO ? 'WMM' : 'none' });
  }));
  // ---------- RAMADAN ----------
  function cleanDay(b) {
    const d = {};
    for (const k of ['fast', 'taraweeh', 'sadaqah', 'dhikr', 'quran', 'dua']) if (b[k] !== undefined) d[k] = b[k] === true;
    if (b.dhikrCount !== undefined) { const n = int(b.dhikrCount, 0, 100000); if (n == null) throw Object.assign(new Error('Bad dhikr count'), { status: 400 }); d.dhikrCount = n; }
    if (b.pages !== undefined) { const n = int(b.pages, 0, 604); if (n == null) throw Object.assign(new Error('Bad pages'), { status: 400 }); d.pages = n; }
    if (b.note !== undefined) d.note = String(b.note).slice(0, 280);
    return d;
  }
  async function ramadanState(uid, hyear) {
    const days = (await q('SELECT rday, data FROM mt_ramadan_day WHERE user_id=$1 AND hyear=$2 ORDER BY rday', [uid, hyear])).rows;
    const y = (await q('SELECT juz FROM mt_ramadan_year WHERE user_id=$1 AND hyear=$2', [uid, hyear])).rows[0];
    return { hyear, days: Object.fromEntries(days.map(r => [r.rday, r.data])), juz: y?.juz || [] };
  }
  app.get('/api/muslim-tools/ramadan', auth, wrap(async (req, res) => {
    await ensure(); const hy = hyearOk(req.query.hyear); if (!hy) return res.status(400).json({ error: 'Bad Hijri year' });
    res.json(await ramadanState(req.user.id, hy));
  }));
  app.put('/api/muslim-tools/ramadan/day', auth, wrap(async (req, res) => {
    await ensure(); const b = req.body || {};
    const hy = hyearOk(b.hyear), rd = int(b.rday, 1, 30); if (!hy || !rd) return res.status(400).json({ error: 'Bad day' });
    if (typeof b.goals !== 'object' || !b.goals || Array.isArray(b.goals)) return res.status(400).json({ error: 'Goals required' });
    let d; try { d = cleanDay(b.goals); } catch (e) { return res.status(400).json({ error: e.message }); }
    const r = await q(`INSERT INTO mt_ramadan_day(user_id,hyear,rday,data) VALUES($1,$2,$3,$4::jsonb)
      ON CONFLICT(user_id,hyear,rday) DO UPDATE SET data = mt_ramadan_day.data || $4::jsonb, updated_at=now() RETURNING data`, [req.user.id, hy, rd, JSON.stringify(d)]);
    res.json({ rday: rd, goals: r.rows[0].data });
  }));
  app.put('/api/muslim-tools/ramadan/juz', auth, wrap(async (req, res) => {
    await ensure(); const b = req.body || {};
    const hy = hyearOk(b.hyear); if (!hy) return res.status(400).json({ error: 'Bad Hijri year' });
    if (!Array.isArray(b.juz) || b.juz.length > 30) return res.status(400).json({ error: 'Bad juz list' });
    const juz = [...new Set(b.juz.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 30))].sort((a, b) => a - b);
    await q(`INSERT INTO mt_ramadan_year(user_id,hyear,juz) VALUES($1,$2,$3::jsonb) ON CONFLICT(user_id,hyear) DO UPDATE SET juz=$3::jsonb, updated_at=now()`, [req.user.id, hy, JSON.stringify(juz)]);
    res.json({ hyear: hy, juz });
  }));



  // ---------- Alim readers (small per-user summaries) ----------
  ctx.alimData = ctx.alimData || {};
  ctx.alimData.ramadan = async (user, { brief } = {}) => {
    await ensure();
    const y = (await q('SELECT MAX(hyear) h FROM (SELECT hyear FROM mt_ramadan_day WHERE user_id=$1 UNION SELECT hyear FROM mt_ramadan_year WHERE user_id=$1) t', [user.id])).rows[0]?.h;
    if (!y) return { tracked: false };
    const s = await ramadanState(user.id, y); const days = Object.values(s.days);
    const cnt = k => days.filter(d => d[k]).length;
    const out = { hijriYear: y, daysLogged: days.length, fasts: cnt('fast'), taraweeh: cnt('taraweeh'), sadaqahDays: cnt('sadaqah'), dhikrDays: cnt('dhikr'), juzRead: s.juz.length };
    if (!brief) { out.juzList = s.juz; out.lastDays = Object.entries(s.days).slice(-5).map(([d, g]) => ({ day: +d, fast: !!g.fast, taraweeh: !!g.taraweeh, sadaqah: !!g.sadaqah, dhikr: !!g.dhikr })); }
    return out;
  };
};
