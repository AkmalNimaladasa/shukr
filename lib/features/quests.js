// Feature: quests — daily quests (3 a day, from real activity) + bonus chest, and weekly leagues (Bronze → Diamond).
// XP is written to engage_xp so it feeds the existing level / badge system. No purchases, no fake signals.
module.exports = function quests(ctx) {
  const { app, q, auth, wrap, todayFor } = ctx;
  let ready;
  const ensure = () => ready ||= (async () => {
    await q(`CREATE TABLE IF NOT EXISTS engage_xp (user_id INT NOT NULL, day DATE NOT NULL, source TEXT NOT NULL, xp INT NOT NULL DEFAULT 0, PRIMARY KEY(user_id, day, source))`);
    await q(`CREATE TABLE IF NOT EXISTS la_days (user_id INT NOT NULL, day DATE NOT NULL, xp INT NOT NULL DEFAULT 0, PRIMARY KEY(user_id, day))`);
    await q(`CREATE TABLE IF NOT EXISTS league_state (user_id INT PRIMARY KEY, tier INT NOT NULL DEFAULT 0, week TEXT, last_result TEXT)`);
  })().catch(e => { ready = null; throw e; });
  const rows = (s, a) => q(s, a).then(r => r.rows).catch(() => []);
  const addDays = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const weekStart = day => { const d = new Date(day + 'T00:00:00Z'); const k = (d.getUTCDay() + 6) % 7; return addDays(day, -k); }; // Monday
  const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

  // ---- quest pool: each reads progress from a table the app already writes ----
  const POOL = [
    { id: 'pray5', title: 'Log all 5 prayers', goal: 5, xp: 30, icon: 'mosque', url: '/prayer', sql: `SELECT count(*)::int n FROM prayer_logs WHERE user_id=$1 AND day=$2 AND status NOT IN ('missed','')` },
    { id: 'pray3', title: 'Log 3 prayers', goal: 3, xp: 20, icon: 'mosque', url: '/prayer', sql: `SELECT count(*)::int n FROM prayer_logs WHERE user_id=$1 AND day=$2 AND status NOT IN ('missed','')` },
    { id: 'dhikr100', title: 'Say 100 dhikr', goal: 100, xp: 20, icon: 'beads', url: '/dhikr', sql: `SELECT COALESCE(sum(count),0)::int n FROM dhikr_logs WHERE user_id=$1 AND day=$2` },
    { id: 'dhikr33', title: 'Say SubhanAllah 33×', goal: 33, xp: 10, icon: 'beads', url: '/dhikr', sql: `SELECT COALESCE(sum(count),0)::int n FROM dhikr_logs WHERE user_id=$1 AND day=$2` },
    { id: 'watch3', title: 'Watch 3 videos to the end', goal: 3, xp: 15, icon: 'play', url: '/fyp', sql: `SELECT count(*)::int n FROM fyp_views WHERE user_id=$1 AND day=$2 AND completed` },
    { id: 'arabic', title: 'Finish an Arabic lesson', goal: 15, xp: 25, icon: 'quran', url: '/arabic', sql: `SELECT COALESCE(sum(xp),0)::int n FROM la_days WHERE user_id=$1 AND day=$2`, unit: 'XP' },
    { id: 'istighfar', title: 'Say Astaghfirullah 100×', goal: 100, xp: 20, icon: 'heart', url: '/istighfar', sql: `SELECT COALESCE(sum(n),0)::int n FROM wp_istighfar WHERE user_id=$1 AND day=$2` },
    { id: 'grateful', title: 'Write one thing you’re grateful for', goal: 1, xp: 15, icon: 'pen', url: '/journal', sql: `SELECT count(*)::int n FROM entries WHERE user_id=$1 AND day=$2` },
    { id: 'quran2', title: 'Read 2 pages of Qur’an', goal: 2, xp: 25, icon: 'book', url: '/quran', sql: `SELECT COALESCE(max(quran_pages),0)::int n FROM day_logs WHERE user_id=$1 AND day=$2` },
  ];
  const pick = (uid, day) => { // 3 a day: one prayer/dhikr quest, one learning quest, one wildcard — deterministic per user/day
    const h = hash(uid + ':' + day), A = ['pray5', 'pray3', 'dhikr100', 'istighfar'], B = ['arabic', 'quran2', 'watch3', 'grateful'];
    const a = A[h % A.length], b = B[(h >>> 4) % B.length]; const rest = POOL.filter(p => p.id !== a && p.id !== b && !(a.startsWith('pray') && p.id.startsWith('pray')) && !(a.startsWith('dhikr') && p.id.startsWith('dhikr')));
    return [a, b, rest[(h >>> 9) % rest.length].id].map(id => POOL.find(p => p.id === id));
  };
  async function questState(user) {
    await ensure(); const uid = user.id, day = todayFor(user);
    const claimed = new Set((await rows(`SELECT source FROM engage_xp WHERE user_id=$1 AND day=$2 AND source LIKE 'q:%'`, [uid, day])).map(r => r.source.slice(2)));
    const list = [];
    for (const p of pick(uid, day)) { const n = (await rows(p.sql, [uid, day]))[0]?.n || 0; list.push({ id: p.id, title: p.title, goal: p.goal, xp: p.xp, icon: p.icon, url: p.url, unit: p.unit || '', n: Math.min(n, p.goal), done: n >= p.goal, claimed: claimed.has(p.id) }); }
    const chest = claimed.has('chest');
    // perfect-day streak: consecutive days with the chest opened
    const cd = new Set((await rows(`SELECT to_char(day,'YYYY-MM-DD') d FROM engage_xp WHERE user_id=$1 AND source='q:chest' AND day > $2::date - 120`, [uid, day])).map(r => r.d));
    let perfect = 0; for (let d = cd.has(day) ? day : addDays(day, -1); cd.has(d); d = addDays(d, -1)) perfect++;
    return { day, quests: list, allClaimed: list.every(x => x.claimed), chest, perfect, resetsIn: msToMidnight(user) };
  }
  const msToMidnight = user => { const day = todayFor(user); const now = Date.now(); const off = (new Date(day + 'T00:00:00Z').getTime() + 86400000) - now; return Math.max(0, Math.min(86400000, off)); };
  app.get('/api/quests', auth, wrap(async (req, res) => res.json(await questState(req.user))));
  app.post('/api/quests/claim', auth, wrap(async (req, res) => {
    const s = await questState(req.user), x = s.quests.find(z => z.id === req.body?.id);
    if (!x || !x.done) return res.status(400).json({ error: 'Not finished yet' });
    await q(`INSERT INTO engage_xp(user_id,day,source,xp) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [req.user.id, s.day, 'q:' + x.id, x.xp]);
    res.json(await questState(req.user));
  }));
  app.post('/api/quests/chest', auth, wrap(async (req, res) => {
    const s = await questState(req.user);
    if (!s.allClaimed) return res.status(400).json({ error: 'Finish all 3 quests first' });
    if (s.chest) return res.json({ ...s, reward: null });
    const roll = Math.random(); let reward = { kind: 'xp', xp: 20 + Math.floor(Math.random() * 41) };
    if (roll > 0.85) { // rare: streak freeze (real protection for a missed day)
      const st = (await rows('SELECT freezes FROM engage_state WHERE user_id=$1', [req.user.id]))[0];
      if (st && st.freezes < 2) { await q('UPDATE engage_state SET freezes=freezes+1 WHERE user_id=$1', [req.user.id]); reward = { kind: 'freeze', xp: 20 }; }
    } else if (roll > 0.7) reward = { kind: 'xp', xp: 100 }; // jackpot
    await q(`INSERT INTO engage_xp(user_id,day,source,xp) VALUES($1,$2,'q:chest',$3) ON CONFLICT DO NOTHING`, [req.user.id, s.day, reward.xp]);
    res.json({ ...(await questState(req.user)), reward });
  }));

  // ---- weekly leagues ----
  const TIERS = ['Bronze', 'Silver', 'Gold', 'Emerald', 'Pearl', 'Diamond'];
  const weekXp = async (from, to, uids) => {
    const r = await rows(`SELECT user_id, sum(x)::int xp FROM (
        SELECT user_id, xp x FROM engage_xp WHERE day >= $1 AND day < $2 AND user_id = ANY($3)
        UNION ALL SELECT user_id, xp FROM la_days WHERE day >= $1 AND day < $2 AND user_id = ANY($3)
        UNION ALL SELECT user_id, LEAST(count(*), 50) FROM fyp_views WHERE completed AND day >= $1 AND day < $2 AND user_id = ANY($3) GROUP BY user_id, day
        UNION ALL SELECT user_id, LEAST(sum(count) / 10, 100) FROM dhikr_logs WHERE day >= $1 AND day < $2 AND user_id = ANY($3) GROUP BY user_id, day
      ) t GROUP BY user_id`, [from, to, uids]);
    return new Map(r.map(x => [x.user_id, x.xp]));
  };
  async function league(user) {
    await ensure(); const uid = user.id, day = todayFor(user), wk = weekStart(day), next = addDays(wk, 7);
    await q('INSERT INTO league_state(user_id, tier, week) VALUES($1, 0, $2) ON CONFLICT DO NOTHING', [uid, wk]);
    let st = (await rows('SELECT tier, week, last_result FROM league_state WHERE user_id=$1', [uid]))[0];
    if (st.week !== wk) { // lazy weekly rollover for this user: rank last week within their tier
      const prev = st.week || addDays(wk, -7), peers = (await rows('SELECT user_id FROM league_state WHERE tier=$1', [st.tier])).map(r => r.user_id);
      const xp = await weekXp(prev, addDays(prev, 7), peers); const mine = xp.get(uid) || 0;
      const ranked = peers.map(p => xp.get(p) || 0).sort((a, b) => b - a); const rank = ranked.indexOf(mine) + 1, cut = Math.max(1, Math.ceil(peers.length * 0.2));
      let tier = st.tier, result = 'stayed';
      if (mine > 0 && rank <= cut && tier < TIERS.length - 1) { tier++; result = 'promoted'; }
      else if (mine === 0 && tier > 0) { tier--; result = 'demoted'; }
      await q('UPDATE league_state SET tier=$2, week=$3, last_result=$4 WHERE user_id=$1', [uid, tier, wk, result]); st = { tier, week: wk, last_result: result };
    }
    const peers = (await rows('SELECT user_id FROM league_state WHERE tier=$1', [st.tier])).map(r => r.user_id);
    const xp = await weekXp(wk, next, peers);
    const names = new Map((await rows(`SELECT u.id, COALESCE(p.display_name, p.username, u.name) name, p.username FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id = ANY($1)`, [peers])).map(r => [r.id, r]));
    const board = peers.map(p => ({ id: p, xp: xp.get(p) || 0, name: names.get(p)?.name || 'Learner', username: names.get(p)?.username || null, you: p === uid }))
      .filter(b => b.xp > 0 || b.you).sort((a, b) => b.xp - a.xp || (a.you ? -1 : 1)).slice(0, 30);
    const promoteN = Math.max(1, Math.ceil(Math.max(board.length, 5) * 0.2));
    return { tier: st.tier, tierName: TIERS[st.tier], nextTier: TIERS[st.tier + 1] || null, lastResult: st.last_result, endsAt: new Date(next + 'T00:00:00Z').getTime(), board, promoteN, myXp: xp.get(uid) || 0, myRank: board.findIndex(b => b.you) + 1 };
  }
  app.get('/api/league', auth, wrap(async (req, res) => res.json(await league(req.user))));
  ctx.alimData = ctx.alimData || {};
  ctx.alimData.quests = async user => { const s = await questState(user); return { todaysQuests: s.quests.map(x => `${x.title} (${x.n}/${x.goal})`), perfectDays: s.perfect, page: '/quests' }; };
};
