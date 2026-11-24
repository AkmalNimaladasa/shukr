// Feature: momentum — Duolingo-style daily XP goal (+ goal streak and a 15-minute Double-XP boost when it's met)
// and a TikTok-style feed combo (every 5 videos finished in a row of the day pays bonus XP).
// All XP is derived from tables the app already writes and banked idempotently into engage_xp, so it feeds
// levels, quests and leagues. No AI calls, no purchases, no real-money randomness.
const GOALS = [10, 20, 50, 100, 200];
const BOOST_MIN = 15, COMBO_EVERY = 5, COMBO_XP = 3, COMBO_CAP = 30, BOOST_CAP = 30, GOAL_XP = 10;
module.exports = function momentum(ctx) {
  const { app, q, auth, wrap, todayFor, localParts } = ctx;
  let ready;
  const ensure = () => ready ||= (async () => {
    await q(`CREATE TABLE IF NOT EXISTS engage_xp (user_id INT NOT NULL, day DATE NOT NULL, source TEXT NOT NULL, xp INT NOT NULL DEFAULT 0, PRIMARY KEY(user_id, day, source))`);
    await q(`CREATE TABLE IF NOT EXISTS la_days (user_id INT NOT NULL, day DATE NOT NULL, xp INT NOT NULL DEFAULT 0, PRIMARY KEY(user_id, day))`);
    await q(`CREATE TABLE IF NOT EXISTS mo_state (user_id INT PRIMARY KEY, goal INT NOT NULL DEFAULT 20, boost_from TIMESTAMPTZ, boost_until TIMESTAMPTZ, off BOOLEAN NOT NULL DEFAULT false)`);
    await q(`CREATE TABLE IF NOT EXISTS engage_push_log (user_id INT NOT NULL, day DATE NOT NULL, kind TEXT NOT NULL, PRIMARY KEY(user_id, day, kind))`);
  })().catch(e => { ready = null; throw e; });
  const rows = (s, a) => q(s, a).then(r => r.rows).catch(() => []);
  const one = async (s, a) => (await rows(s, a))[0]?.n || 0;
  const addDays = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  async function getState(uid) {
    await q('INSERT INTO mo_state(user_id) VALUES($1) ON CONFLICT DO NOTHING', [uid]);
    return (await q('SELECT * FROM mo_state WHERE user_id=$1', [uid])).rows[0];
  }
  // Today's XP — same sources and caps as the weekly league so the two never disagree.
  async function todayXp(uid, day) {
    return (await one(`SELECT COALESCE(sum(xp),0)::int n FROM engage_xp WHERE user_id=$1 AND day=$2`, [uid, day]))
      + (await one(`SELECT COALESCE(sum(xp),0)::int n FROM la_days WHERE user_id=$1 AND day=$2`, [uid, day]))
      + Math.min(await one(`SELECT count(*)::int n FROM fyp_views WHERE user_id=$1 AND day=$2 AND completed`, [uid, day]), 50)
      + Math.min(Math.floor(await one(`SELECT COALESCE(sum(count),0)::int n FROM dhikr_logs WHERE user_id=$1 AND day=$2`, [uid, day]) / 10), 100);
  }
  // Bank combo + boost XP (idempotent: recomputed from real views, stored with GREATEST so it never goes down).
  async function bank(uid, day, st) {
    const done = await one(`SELECT count(*)::int n FROM fyp_views WHERE user_id=$1 AND day=$2 AND completed`, [uid, day]);
    const combo = Math.min(Math.floor(done / COMBO_EVERY) * COMBO_XP, COMBO_CAP);
    if (combo > 0) await q(`INSERT INTO engage_xp(user_id,day,source,xp) VALUES($1,$2,'mo:combo',$3) ON CONFLICT(user_id,day,source) DO UPDATE SET xp=GREATEST(engage_xp.xp,$3)`, [uid, day, combo]);
    if (st.boost_from) {
      const b = Math.min(await one(`SELECT count(*)::int n FROM fyp_views WHERE user_id=$1 AND completed AND last_seen_at >= $2 AND last_seen_at <= $3`, [uid, st.boost_from, st.boost_until]), BOOST_CAP);
      const bday = (await rows(`SELECT to_char(($1::timestamptz)::date,'YYYY-MM-DD') d`, [st.boost_from]))[0]?.d || day;
      if (b > 0) await q(`INSERT INTO engage_xp(user_id,day,source,xp) VALUES($1,$2,'mo:boost',$3) ON CONFLICT(user_id,day,source) DO UPDATE SET xp=GREATEST(engage_xp.xp,$3)`, [uid, bday, b]);
    }
    return { done, combo };
  }
  async function state(user, { doBank = true } = {}) {
    await ensure(); const uid = user.id, day = todayFor(user), st = await getState(uid);
    const b = doBank ? await bank(uid, day, st) : { done: 0, combo: 0 };
    const xp = await todayXp(uid, day);
    const claimedDays = new Set((await rows(`SELECT to_char(day,'YYYY-MM-DD') d FROM engage_xp WHERE user_id=$1 AND source='mo:goal' AND day > $2::date - 400`, [uid, day])).map(r => r.d));
    let goalStreak = 0; for (let d = claimedDays.has(day) ? day : addDays(day, -1); claimedDays.has(d); d = addDays(d, -1)) goalStreak++;
    const week = []; for (let i = 6; i >= 0; i--) { const d = addDays(day, -i); week.push({ d, met: claimedDays.has(d) }); }
    const boostLeft = st.boost_until ? Math.max(0, new Date(st.boost_until).getTime() - Date.now()) : 0;
    const toNext = COMBO_EVERY - (b.done % COMBO_EVERY);
    return { day, goal: st.goal, goals: GOALS, xp, goalMet: xp >= st.goal, goalClaimed: claimedDays.has(day), goalStreak, week,
      boostLeft, boostMin: BOOST_MIN, finishedToday: b.done, comboXp: b.combo, comboCap: COMBO_CAP, toNextCombo: b.combo >= COMBO_CAP ? null : toNext, comboEvery: COMBO_EVERY, comboStep: COMBO_XP, off: !!st.off };
  }
  app.get('/api/momentum', auth, wrap(async (req, res) => res.json(await state(req.user))));
  app.put('/api/momentum/goal', auth, wrap(async (req, res) => {
    await ensure(); const g = Number(req.body?.goal);
    if (!GOALS.includes(g)) return res.status(400).json({ error: 'Pick one of ' + GOALS.join(', ') });
    await getState(req.user.id); await q('UPDATE mo_state SET goal=$2 WHERE user_id=$1', [req.user.id, g]);
    res.json(await state(req.user, { doBank: false }));
  }));
  app.put('/api/momentum/off', auth, wrap(async (req, res) => {
    await ensure(); await getState(req.user.id); await q('UPDATE mo_state SET off=$2 WHERE user_id=$1', [req.user.id, !!req.body?.off]);
    res.json(await state(req.user, { doBank: false }));
  }));
  // Goal met → +10 XP once a day and a 15-minute Double-XP boost on finished videos.
  app.post('/api/momentum/claim', auth, wrap(async (req, res) => {
    const s = await state(req.user);
    if (!s.goalMet) return res.status(400).json({ error: `Earn ${s.goal - s.xp} more XP first` });
    const r = await q(`INSERT INTO engage_xp(user_id,day,source,xp) VALUES($1,$2,'mo:goal',$3) ON CONFLICT DO NOTHING RETURNING 1`, [req.user.id, s.day, GOAL_XP]);
    if (r.rows.length) await q(`UPDATE mo_state SET boost_from=now(), boost_until=now() + interval '${BOOST_MIN} minutes' WHERE user_id=$1`, [req.user.id]);
    res.json({ ...(await state(req.user, { doBank: false })), justClaimed: r.rows.length > 0 });
  }));

  // Evening nudge when close to the goal: once a day, quiet hours and the engage push switch respected.
  const inQuiet = (s, hh, mm) => { const r = s.reminders || {}; if (!r.quietOn) return false; const m = hh * 60 + mm, f = (r.quietFrom || '23:00').split(':').map(Number), t = (r.quietTo || '05:00').split(':').map(Number); const a = f[0] * 60 + f[1], b = t[0] * 60 + t[1]; return a <= b ? m >= a && m < b : m >= a || m < b; };
  async function tick() {
    if (!ctx.pushUser || (ctx.pushReady && !ctx.pushReady())) return; await ensure();
    const users = await rows(`SELECT DISTINCT u.id, u.settings, m.goal FROM users u JOIN push_subs p ON p.user_id=u.id JOIN mo_state m ON m.user_id=u.id WHERE NOT m.off LIMIT 20000`);
    for (const u of users) {
      try {
        const s = u.settings || {}; if (s.engage?.pushOff) continue;
        const lp = localParts(s.tz); if (lp.hh !== 19 || lp.mm >= 5 || inQuiet(s, lp.hh, lp.mm)) continue;
        const xp = await todayXp(u.id, lp.day), left = u.goal - xp;
        if (left > 0 && left <= Math.max(10, u.goal / 2)) {
          const r = await q(`INSERT INTO engage_push_log(user_id,day,kind) VALUES($1,$2,'goal') ON CONFLICT DO NOTHING RETURNING 1`, [u.id, lp.day]);
          if (r.rows.length) await ctx.pushUser(u.id, { title: `Only ${left} XP to your daily goal`, body: 'A few videos or a round of dhikr gets you there, plus 15 minutes of Double XP.', url: '/#/fyp', tag: 'momentum-goal' });
        }
      } catch {}
    }
  }
  if (process.env.NODE_ENV !== 'test') setInterval(() => tick().catch(e => console.log('momentum tick', e.message)), 5 * 60000).unref?.();
  ctx.alimData = ctx.alimData || {};
  ctx.alimData.daily_goal = async user => { const s = await state(user, { doBank: false }); return { dailyGoalXp: s.goal, xpToday: s.xp, goalMet: s.goalMet, goalStreakDays: s.goalStreak, page: '/goal' }; };
  ctx.momentumState = state;
};
module.exports.GOALS = GOALS;
