// Feature: learn-arabic — gamified Qur'anic vocabulary (frequency-ordered lemmas → % of the Qur'an understood).
module.exports = function learnArabic(ctx) {
  const { app, q, auth, wrap, todayFor } = ctx;
  let ready;
  const ensure = () => ready ||= (async () => {
    await q(`CREATE TABLE IF NOT EXISTS la_state (user_id INT PRIMARY KEY, xp INT NOT NULL DEFAULT 0, hearts INT NOT NULL DEFAULT 5, hearts_at TIMESTAMPTZ DEFAULT now(), units JSONB NOT NULL DEFAULT '{}'::jsonb, grammar JSONB NOT NULL DEFAULT '[]'::jsonb, goal INT NOT NULL DEFAULT 30, updated_at TIMESTAMPTZ DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS la_words (user_id INT NOT NULL, word INT NOT NULL, box INT NOT NULL DEFAULT 1, due DATE NOT NULL, seen INT NOT NULL DEFAULT 1, wrong INT NOT NULL DEFAULT 0, PRIMARY KEY(user_id, word))`);
    await q(`CREATE TABLE IF NOT EXISTS la_meta (k TEXT PRIMARY KEY, v TEXT)`);
    if (!(await q(`SELECT 1 FROM la_meta WHERE k='data' AND v='2'`).catch(() => ({ rows: [] }))).rows.length) { // word ids changed with the verified v2 data
      await q('DELETE FROM la_words').catch(() => {}); await q(`UPDATE la_state SET units='{}'::jsonb`).catch(() => {});
      await q(`INSERT INTO la_meta(k,v) VALUES('data','2') ON CONFLICT(k) DO UPDATE SET v='2'`); }
    await q(`CREATE TABLE IF NOT EXISTS la_days (user_id INT NOT NULL, day DATE NOT NULL, xp INT NOT NULL DEFAULT 0, PRIMARY KEY(user_id, day))`);
  })().catch(e => { ready = null; throw e; });
  const rows = (s, a) => q(s, a).then(r => r.rows);
  const addDays = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const BOX = [0, 1, 3, 7, 16, 35, 90];
  const MAXH = 5, REGEN = 20 * 60000; // a heart every 20 min
  async function st(user) {
    const uid = user.id, today = todayFor(user);
    let s = (await rows('SELECT xp, hearts, extract(epoch from hearts_at)*1000 ha, units, grammar, goal FROM la_state WHERE user_id=$1', [uid]))[0];
    if (!s) { await q('INSERT INTO la_state(user_id) VALUES($1) ON CONFLICT DO NOTHING', [uid]); s = { xp: 0, hearts: MAXH, ha: Date.now(), units: {}, grammar: [], goal: 30 }; }
    let hearts = s.hearts, ha = +s.ha; if (hearts < MAXH) { const g = Math.floor((Date.now() - ha) / REGEN); if (g > 0) { hearts = Math.min(MAXH, hearts + g); ha = hearts >= MAXH ? Date.now() : ha + g * REGEN; await q('UPDATE la_state SET hearts=$2, hearts_at=to_timestamp($3/1000.0) WHERE user_id=$1', [uid, hearts, ha]); } }
    const known = await rows('SELECT word, box FROM la_words WHERE user_id=$1', [uid]);
    const due = (await rows('SELECT count(*)::int n FROM la_words WHERE user_id=$1 AND due <= $2', [uid, today]))[0].n;
    const days = await rows(`SELECT to_char(day,'YYYY-MM-DD') d, xp FROM la_days WHERE user_id=$1 AND day > $2::date - 60 ORDER BY day`, [uid, today]);
    const by = Object.fromEntries(days.map(d => [d.d, d.xp]));
    let streak = 0; for (let d = by[today] ? today : addDays(today, -1); by[d]; d = addDays(d, -1)) streak++;
    const lb = await rows(`SELECT COALESCE(p.display_name, p.username, u.name) name, s.xp, s.user_id = $1 AS you FROM la_state s JOIN users u ON u.id=s.user_id LEFT JOIN profiles p ON p.user_id=s.user_id WHERE s.xp > 0 ORDER BY s.xp DESC LIMIT 10`, [uid]).catch(() => []);
    return { xp: s.xp, hearts, nextHeart: hearts < MAXH ? ha + REGEN : null, units: s.units || {}, grammar: s.grammar || [], goal: s.goal, todayXp: by[today] || 0, streak, week: Array.from({ length: 7 }, (_, i) => { const d = addDays(today, i - 6); return { d, xp: by[d] || 0 }; }), known: known.map(k => [k.word, k.box]), due, board: lb };
  }
  app.get('/api/arabic', auth, wrap(async (req, res) => { await ensure(); res.json(await st(req.user)); }));
  // Finish a lesson / review: words answered [{id, ok}], xp earned, unit result.
  app.post('/api/arabic/result', auth, wrap(async (req, res) => {
    await ensure(); const uid = req.user.id, today = todayFor(req.user), b = req.body || {};
    const answers = (Array.isArray(b.answers) ? b.answers : []).slice(0, 200).map(a => ({ id: Math.max(1, Math.min(2000, +a.id | 0)), ok: !!a.ok })).filter(a => a.id);
    const xp = Math.max(0, Math.min(200, +b.xp | 0)), lost = Math.max(0, Math.min(5, +b.heartsLost | 0));
    for (const a of answers) {
      const cur = (await rows('SELECT box FROM la_words WHERE user_id=$1 AND word=$2', [uid, a.id]))[0];
      const box = a.ok ? Math.min(6, Math.max(2, (cur?.box || 0) + 1)) : 1;
      await q(`INSERT INTO la_words(user_id,word,box,due,seen,wrong) VALUES($1,$2,$3,$4,1,$5) ON CONFLICT(user_id,word) DO UPDATE SET box=$3, due=$4, seen=la_words.seen+1, wrong=la_words.wrong+$5`, [uid, a.id, box, addDays(today, a.ok ? BOX[box] : 0), a.ok ? 0 : 1]);
    }
    const u = +b.unit | 0;
    if (u > 0 && u <= 100 && b.passed) { const stars = Math.max(1, Math.min(3, +b.stars | 0)); await q(`UPDATE la_state SET units = jsonb_set(units, $2, to_jsonb(GREATEST(COALESCE((units->>$3)::int,0), $4::int))) WHERE user_id=$1`, [uid, `{${u}}`, String(u), stars]); }
    if (b.grammar && /^g-[a-z]+$/.test(b.grammar)) await q(`UPDATE la_state SET grammar = CASE WHEN grammar ? $2 THEN grammar ELSE grammar || to_jsonb($2::text) END WHERE user_id=$1`, [uid, b.grammar]);
    await q(`UPDATE la_state SET xp=xp+$2, hearts=GREATEST(0,hearts-$3), hearts_at=CASE WHEN hearts>=5 AND $3>0 THEN now() ELSE hearts_at END, updated_at=now() WHERE user_id=$1`, [uid, xp, lost]);
    if (xp) await q(`INSERT INTO la_days(user_id,day,xp) VALUES($1,$2,$3) ON CONFLICT(user_id,day) DO UPDATE SET xp=la_days.xp+$3`, [uid, today, xp]);
    res.json(await st(req.user));
  }));
  app.post('/api/arabic/refill', auth, wrap(async (req, res) => { // practise (review) refills hearts: earned, not bought
    await ensure(); await q('UPDATE la_state SET hearts=LEAST(5, hearts+1) WHERE user_id=$1', [req.user.id]); res.json(await st(req.user));
  }));
  app.get('/api/arabic/review', auth, wrap(async (req, res) => {
    await ensure(); res.json({ ids: (await rows('SELECT word FROM la_words WHERE user_id=$1 AND due <= $2 ORDER BY box, random() LIMIT 20', [req.user.id, todayFor(req.user)])).map(r => r.word) });
  }));
  app.put('/api/arabic/goal', auth, wrap(async (req, res) => { await ensure(); await q('UPDATE la_state SET goal=$2 WHERE user_id=$1', [req.user.id, [10, 20, 30, 50, 80].includes(+req.body?.goal) ? +req.body.goal : 30]); res.json(await st(req.user)); }));
  ctx.alimData = ctx.alimData || {};
  ctx.alimData.arabic = async user => { await ensure(); const s = await st(user); return { xp: s.xp, streakDays: s.streak, wordsLearned: s.known.length, unitsDone: Object.keys(s.units).length, reviewsDue: s.due, page: '/arabic' }; };
};
