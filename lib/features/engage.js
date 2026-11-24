// Feature: engage — app-wide habit layer: activity streak (with freezes), XP & levels, daily gift box, badges, frames,
// achievements page data, honest social proof (trending / watching now) and re-engagement pushes.
// Activity is DERIVED from tables the app already writes (feed views, dhikr, prayers, journal, istighfar, sunnah,
// barakah, challenges), so every page counts toward the streak without extra client hooks.
module.exports = function engage(ctx) {
  const { app, q, auth, wrap, todayFor, localParts } = ctx;
  let ready;
  const ensure = () => ready ||= (async () => {
    await q(`CREATE TABLE IF NOT EXISTS engage_state (user_id INT PRIMARY KEY, xp INT NOT NULL DEFAULT 0, freezes INT NOT NULL DEFAULT 0, frozen JSONB NOT NULL DEFAULT '[]'::jsonb,
      badges JSONB NOT NULL DEFAULT '[]'::jsonb, frames JSONB NOT NULL DEFAULT '[]'::jsonb, frame TEXT, milestones JSONB NOT NULL DEFAULT '[]'::jsonb, last_level INT NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS engage_rewards (user_id INT NOT NULL, day DATE NOT NULL, kind TEXT NOT NULL, value TEXT, xp INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(user_id, day))`);
    await q(`CREATE TABLE IF NOT EXISTS engage_xp (user_id INT NOT NULL, day DATE NOT NULL, source TEXT NOT NULL, xp INT NOT NULL DEFAULT 0, PRIMARY KEY(user_id, day, source))`);
    await q(`CREATE TABLE IF NOT EXISTS engage_push_log (user_id INT NOT NULL, day DATE NOT NULL, kind TEXT NOT NULL, PRIMARY KEY(user_id, day, kind))`);
  })().catch(e => { ready = null; throw e; });
  const rows = (sql, a) => q(sql, a).then(r => r.rows).catch(() => []);
  const addDays = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  // ---------- levels ----------
  const TITLES = ['Seed', 'Sprout', 'Sapling', 'Young tree', 'Tree', 'Fruit tree', 'Garden', 'Orchard', 'Oasis', 'River garden', 'Valley of light', 'Firdaws seeker'];
  const levelOf = xp => { let lv = 1, need = 100, acc = 0; while (xp >= acc + need) { acc += need; lv++; need = Math.round(need * 1.35); } return { level: lv, title: TITLES[Math.min(lv - 1, TITLES.length - 1)], into: xp - acc, need }; };

  // ---------- badges & frames ----------
  const BADGES = [
    ['streak3', 'Getting started', '3-day streak', 'flame'], ['streak7', 'One week strong', '7-day streak', 'flame'], ['streak30', 'Steadfast', '30-day streak', 'flame'], ['streak100', 'Unshakeable', '100-day streak', 'flame'],
    ['lv5', 'Growing', 'Reach level 5', 'leaf'], ['lv10', 'Flourishing', 'Reach level 10', 'leaf'],
    ['gift7', 'Grateful heart', 'Open 7 daily gifts', 'gift'], ['early', 'Early riser', 'Rare gift', 'sun'], ['night', 'Night worshipper', 'Rare gift', 'moon'], ['pearl', 'Hidden pearl', 'Rare gift', 'gem'],
    ['watch100', 'Seeker of knowledge', 'Finish 100 videos', 'play'], ['dhikr1k', 'Remembrance', '1,000 dhikr', 'beads'], ['dhikr10k', 'Tongue moist with dhikr', '10,000 dhikr', 'beads'],
  ];
  const FRAMES = [['gold', 'Gold'], ['emerald', 'Emerald'], ['rose', 'Rose'], ['night', 'Night sky'], ['pearl', 'Pearl'], ['sunset', 'Sunset']];

  // ---------- activity (derived) ----------
  async function activeDays(uid, since) {
    const srcs = [
      [`SELECT DISTINCT to_char(day,'YYYY-MM-DD') d FROM fyp_views WHERE user_id=$1 AND day >= $2 AND watched_ms >= 5000`],
      [`SELECT DISTINCT to_char(day,'YYYY-MM-DD') d FROM dhikr_logs WHERE user_id=$1 AND day >= $2`],
      [`SELECT DISTINCT to_char(day,'YYYY-MM-DD') d FROM prayer_logs WHERE user_id=$1 AND day >= $2`],
      [`SELECT DISTINCT to_char(day,'YYYY-MM-DD') d FROM entries WHERE user_id=$1 AND day >= $2`],
      [`SELECT DISTINCT to_char(day,'YYYY-MM-DD') d FROM day_logs WHERE user_id=$1 AND day >= $2 AND quran_pages > 0`],
      [`SELECT DISTINCT to_char(day,'YYYY-MM-DD') d FROM wp_istighfar WHERE user_id=$1 AND day >= $2 AND n > 0`],
      [`SELECT DISTINCT period d FROM wp_sunnah WHERE user_id=$1 AND period >= $2 AND period ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`],
      [`SELECT DISTINCT to_char(day,'YYYY-MM-DD') d FROM bw_barakah WHERE user_id=$1 AND day >= $2 AND jsonb_array_length(items) > 0`],
      [`SELECT DISTINCT to_char(day,'YYYY-MM-DD') d FROM sp2_challenge_done WHERE user_id=$1 AND day >= $2`],
      [`SELECT DISTINCT to_char(day,'YYYY-MM-DD') d FROM engage_rewards WHERE user_id=$1 AND day >= $2`],
    ];
    const set = new Set(); for (const [sql] of srcs) for (const r of await rows(sql, [uid, since])) set.add(r.d); return set;
  }
  async function getState(uid) {
    await q('INSERT INTO engage_state(user_id) VALUES($1) ON CONFLICT DO NOTHING', [uid]);
    return (await q('SELECT * FROM engage_state WHERE user_id=$1', [uid])).rows[0];
  }
  // Streak counts consecutive active days ending today (or yesterday). Freezes fill single missed days automatically.
  async function compute(user, { award = true } = {}) {
    await ensure(); const uid = user.id, today = todayFor(user), since = addDays(today, -400);
    let st = await getState(uid);
    const act = await activeDays(uid, since); const frozen = new Set(st.frozen || []);
    const isOn = d => act.has(d) || frozen.has(d);
    let freezes = st.freezes, d = act.has(today) ? today : addDays(today, -1), streak = 0, usedNow = [];
    for (let guard = 0; guard < 400; guard++) {
      if (isOn(d)) { streak++; d = addDays(d, -1); continue; }
      // a single missed day between active days can be covered by a freeze
      if (freezes > 0 && streak > 0 && isOn(addDays(d, -1)) && d !== today) { freezes--; frozen.add(d); usedNow.push(d); streak++; d = addDays(d, -1); continue; }
      break;
    }
    const cal = []; for (let i = 29; i >= 0; i--) { const dd = addDays(today, -i); cal.push({ d: dd, on: act.has(dd), frozen: frozen.has(dd) }); }
    // XP: watched videos (1 per completed, cap 50/day) + challenges + istighfar goal days + gifts + milestones (stored)
    const vids = await rows(`SELECT to_char(day,'YYYY-MM-DD') d, LEAST(count(*) FILTER (WHERE completed),50)::int n FROM fyp_views WHERE user_id=$1 GROUP BY day`, [uid]);
    const watchXp = vids.reduce((s, r) => s + r.n, 0);
    const chXp = (await rows('SELECT COALESCE(sum(xp),0)::int x FROM sp2_challenge_done WHERE user_id=$1', [uid]))[0]?.x || 0;
    const dh = (await rows('SELECT COALESCE(sum(count),0)::int n FROM dhikr_logs WHERE user_id=$1', [uid]))[0]?.n || 0;
    const dhXp = Math.min(Math.floor(dh / 100), 2000);
    const bonus = (await rows('SELECT COALESCE(sum(xp),0)::int x FROM engage_xp WHERE user_id=$1', [uid]))[0]?.x || 0;
    const xp = watchXp + chXp + dhXp + bonus;
    const lv = levelOf(xp);
    const badges = new Set(st.badges || []); const newBadges = [];
    const give = id => { if (!badges.has(id)) { badges.add(id); newBadges.push(id); } };
    const best = Math.max(streak, ...(st.milestones || []).map(Number).filter(Boolean), 0);
    if (best >= 3) give('streak3'); if (best >= 7) give('streak7'); if (best >= 30) give('streak30'); if (best >= 100) give('streak100');
    if (lv.level >= 5) give('lv5'); if (lv.level >= 10) give('lv10');
    const completed = vids.reduce((s, r) => s + r.n, 0); if (completed >= 100) give('watch100'); if (dh >= 1000) give('dhikr1k'); if (dh >= 10000) give('dhikr10k');
    const gifts = (await rows('SELECT count(*)::int n FROM engage_rewards WHERE user_id=$1', [uid]))[0]?.n || 0; if (gifts >= 7) give('gift7');
    // streak milestones: XP + a freeze every 7 days of streak
    const MS = [3, 7, 14, 30, 60, 100, 200, 365]; const ms = new Set((st.milestones || []).map(Number)); let milestone = null;
    if (award) for (const m of MS) if (streak >= m && !ms.has(m)) { ms.add(m); milestone = m; await q(`INSERT INTO engage_xp(user_id,day,source,xp) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [uid, today, 'ms' + m, m * 5]); }
    let newFreeze = false;
    if (award && streak > 0 && streak % 7 === 0 && freezes < 2 && !(st.frozen || []).includes('earn:' + today)) { freezes++; newFreeze = true; frozen.add('earn:' + today); }
    const levelUp = award && lv.level > (st.last_level || 1);
    if (award && (usedNow.length || newBadges.length || milestone || newFreeze || levelUp))
      await q(`UPDATE engage_state SET freezes=$2, frozen=$3, badges=$4, milestones=$5, last_level=GREATEST(last_level,$6), updated_at=now() WHERE user_id=$1`,
        [uid, freezes, JSON.stringify([...frozen].filter(x => x >= addDays(today, -400) || x.startsWith('earn:')).slice(-400)), JSON.stringify([...badges]), JSON.stringify([...ms]), lv.level]);
    const gift = (await rows(`SELECT kind, value, xp FROM engage_rewards WHERE user_id=$1 AND day=$2`, [uid, today]))[0] || null;
    return { today, xp, level: lv.level, levelTitle: lv.title, into: lv.into, nextAt: lv.need, streak, activeToday: act.has(today), freezes, usedFreeze: usedNow, newFreeze,
      giftReady: !gift, gift, badges: [...badges], newBadges, milestone, levelUp: levelUp ? lv.level : null, frames: st.frames || [], frame: st.frame || null, calendar: cal, dhikr: dh, videos: completed };
  }

  app.get('/api/engage/me', auth, wrap(async (req, res) => res.json(await compute(req.user))));
  app.post('/api/engage/ping', auth, wrap(async (req, res) => res.json(await compute(req.user)))); // activity is derived; ping just refreshes

  // ---------- daily gift ----------
  app.post('/api/engage/gift', auth, wrap(async (req, res) => {
    await ensure(); const uid = req.user.id, today = todayFor(req.user); const st = await getState(uid);
    const roll = Math.random(); let kind = 'xp', value = null, xp = 10 + Math.floor(Math.random() * 41);
    const ownedB = new Set(st.badges || []), ownedF = new Set(st.frames || []);
    const rareB = ['early', 'night', 'pearl'].filter(b => !ownedB.has(b)), fr = FRAMES.map(f => f[0]).filter(f => !ownedF.has(f));
    if (roll > 0.93 && rareB.length) { kind = 'badge'; value = rareB[Math.floor(Math.random() * rareB.length)]; xp = 25; }
    else if (roll > 0.8 && fr.length) { kind = 'frame'; value = fr[Math.floor(Math.random() * fr.length)]; xp = 15; }
    const r = await q(`INSERT INTO engage_rewards(user_id,day,kind,value,xp) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING kind`, [uid, today, kind, value, xp]);
    if (!r.rows.length) return res.status(409).json({ error: 'You’ve opened today’s gift — come back tomorrow!' });
    await q(`INSERT INTO engage_xp(user_id,day,source,xp) VALUES($1,$2,'gift',$3) ON CONFLICT(user_id,day,source) DO UPDATE SET xp=$3`, [uid, today, xp]);
    if (kind === 'badge') await q(`UPDATE engage_state SET badges = badges || $2::jsonb WHERE user_id=$1`, [uid, JSON.stringify([value])]);
    if (kind === 'frame') await q(`UPDATE engage_state SET frames = frames || $2::jsonb WHERE user_id=$1`, [uid, JSON.stringify([value])]);
    res.json({ reward: { kind, value, xp, label: kind === 'badge' ? BADGES.find(b => b[0] === value)?.[1] : kind === 'frame' ? FRAMES.find(f => f[0] === value)?.[1] + ' profile frame' : `${xp} XP` }, me: await compute(req.user) });
  }));
  app.put('/api/engage/frame', auth, wrap(async (req, res) => {
    await ensure(); const st = await getState(req.user.id), f = req.body?.frame || null;
    if (f && !(st.frames || []).includes(f)) return res.status(400).json({ error: 'You haven’t unlocked that frame yet' });
    await q('UPDATE engage_state SET frame=$2 WHERE user_id=$1', [req.user.id, f]); res.json({ frame: f });
  }));
  app.get('/api/engage/catalog', auth, (req, res) => res.json({ badges: BADGES.map(([id, name, how, icon]) => ({ id, name, how, icon })), frames: FRAMES.map(([id, name]) => ({ id, name })), titles: TITLES }));

  // ---------- honest social proof ----------
  let trendCache = { t: 0, ids: [], watching: {} };
  app.get('/api/engage/social', auth, wrap(async (req, res) => {
    if (Date.now() - trendCache.t > 60000) {
      const tr = await rows(`WITH v AS (SELECT lesson_id, count(*) n FROM fyp_views WHERE last_seen_at > now() - interval '24 hours' GROUP BY lesson_id)
        SELECT lesson_id FROM v WHERE n >= 5 AND n >= (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY n) FROM v) ORDER BY n DESC LIMIT 30`);
      const w = await rows(`SELECT lesson_id, count(DISTINCT user_id)::int n FROM fyp_views WHERE last_seen_at > now() - interval '5 minutes' GROUP BY lesson_id HAVING count(DISTINCT user_id) >= 3`);
      trendCache = { t: Date.now(), ids: tr.map(r => r.lesson_id), watching: Object.fromEntries(w.map(r => [r.lesson_id, r.n])) };
    }
    let friendsLiked = {};
    const ids = String(req.query.ids || '').split(',').filter(Boolean).slice(0, 30);
    if (ids.length && (await rows(`SELECT to_regclass('sp2_friends') t`))[0]?.t) {
      const fr = await rows(`SELECT f.lesson_id, count(*)::int n FROM fyp_progress f WHERE f.liked AND f.lesson_id = ANY($2::text[]) AND f.user_id IN (
        SELECT CASE WHEN requester=$1 THEN addressee ELSE requester END FROM sp2_friends WHERE status='accepted' AND (requester=$1 OR addressee=$1)) GROUP BY f.lesson_id`, [req.user.id, ids]);
      friendsLiked = Object.fromEntries(fr.map(r => [r.lesson_id, r.n]));
    }
    res.json({ trending: trendCache.ids, watching: trendCache.watching, friendsLiked });
  }));

  // ---------- re-engagement pushes ----------
  const inQuiet = (s, hh, mm) => { const r = s.reminders || {}; if (!r.quietOn) return false; const m = hh * 60 + mm, f = (r.quietFrom || '23:00').split(':').map(Number), t = (r.quietTo || '05:00').split(':').map(Number); const a = f[0] * 60 + f[1], b = t[0] * 60 + t[1]; return a <= b ? m >= a && m < b : m >= a || m < b; };
  async function once(uid, day, kind) { const r = await q(`INSERT INTO engage_push_log(user_id,day,kind) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING 1`, [uid, day, kind]); return r.rows.length > 0; }
  async function tick() {
    if (!ctx.pushUser || (ctx.pushReady && !ctx.pushReady())) return;
    await ensure();
    const users = await rows(`SELECT DISTINCT u.id, u.settings FROM users u JOIN push_subs p ON p.user_id=u.id LIMIT 20000`);
    for (const u of users) {
      try {
        const s = u.settings || {}; if (s.engage?.pushOff) continue;
        const lp = localParts(s.tz); if (inQuiet(s, lp.hh, lp.mm)) continue;
        const user = { id: u.id, settings: s };
        if (lp.hh === 20 && lp.mm < 5) {
          const m = await compute(user, { award: false });
          if (m.streak >= 2 && !m.activeToday && await once(u.id, lp.day, 'streak')) await ctx.pushUser(u.id, { title: `🔥 Your ${m.streak}-day streak ends tonight`, body: 'A minute of dhikr, a video or a prayer log keeps it alive.', url: '/#/dhikr', tag: 'engage-streak' });
        }
        if (lp.hh === 12 && lp.mm < 5) {
          const g = (await rows('SELECT 1 FROM engage_rewards WHERE user_id=$1 AND day=$2', [u.id, lp.day]))[0];
          if (!g && await once(u.id, lp.day, 'gift')) await ctx.pushUser(u.id, { title: '🎁 Your daily gift is waiting', body: 'Open it for XP — and maybe a rare badge.', url: '/#/achievements', tag: 'engage-gift' });
        }
        if (lp.hh === 18 && lp.mm < 5) {
          const idle = (await rows(`SELECT 1 FROM fyp_views WHERE user_id=$1 AND last_seen_at > now() - interval '24 hours' LIMIT 1`, [u.id]))[0];
          if (!idle) { const n = (await rows(`SELECT count(*)::int n FROM fyp_publications p JOIN follows f ON f.followee=p.user_id WHERE f.follower=$1 AND p.published_at > now() - interval '24 hours'`, [u.id]))[0]?.n || 0;
            if (n > 0 && await once(u.id, lp.day, 'new')) await ctx.pushUser(u.id, { title: `${n} new video${n > 1 ? 's' : ''} from people you follow`, body: 'Catch up on your Following feed.', url: '/#/fyp?tab=following', tag: 'engage-new' }); }
        }
      } catch {}
    }
  }
  if (process.env.NODE_ENV !== 'test') setInterval(() => tick().catch(e => console.log('engage tick', e.message)), 5 * 60000).unref?.();

  // ---------- Alim connector ----------
  ctx.alimData = ctx.alimData || {};
  ctx.alimData.streak_xp = async user => { const m = await compute(user, { award: false }); return { streakDays: m.streak, activeToday: m.activeToday, freezes: m.freezes, xp: m.xp, level: m.level, levelTitle: m.levelTitle, badges: m.badges.length, giftReady: m.giftReady, page: '/achievements' }; };
};
