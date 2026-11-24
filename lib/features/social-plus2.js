// social-plus2: Creator analytics (/api/sp2/analytics), daily challenges, friends and dhikr leaderboard.
// Reads existing tables only (fyp_publications, fyp_views, fyp_progress, fyp_comments, fyp_shares, follows,
// social_stories, story_views, profiles, dhikr_logs). Owns: sp2_challenge_done, sp2_friends, sp2_prefs.
const DAY_CAP = 20000; // anti-cheat: max dhikr counted per user per day on leaderboards

// ~40 daily challenges. kind 'dhikr' challenges show live progress from dhikr_logs (phrase keys from the dhikr page).
const CHALLENGES = [
  { id: 'subhanallah100', t: 'Say SubhanAllah 100 times', icon: 'beads', xp: 20, dhikr: ['subhanallah', 'subhanallahwabihamdihi'], goal: 100, go: '/dhikr' },
  { id: 'istighfar100', t: 'Say Astaghfirullah 100 times', icon: 'leaf', xp: 20, dhikr: ['astaghfirullah'], goal: 100, go: '/dhikr' },
  { id: 'salawat50', t: 'Send salawat on the Prophet ﷺ 50 times', icon: 'heart', xp: 20, dhikr: ['salawat'], goal: 50, go: '/dhikr' },
  { id: 'alhamdulillah100', t: 'Say Alhamdulillah 100 times', icon: 'sparkle', xp: 20, dhikr: ['alhamdulillah'], goal: 100, go: '/dhikr' },
  { id: 'tahlil100', t: 'Say La ilaha illallah 100 times', icon: 'beads', xp: 20, dhikr: ['tahlil'], goal: 100, go: '/dhikr' },
  { id: 'takbir100', t: 'Say Allahu Akbar 100 times', icon: 'beads', xp: 20, dhikr: ['allahuakbar'], goal: 100, go: '/dhikr' },
  { id: 'hawqala33', t: 'Say La hawla wa la quwwata illa billah 33 times', icon: 'shield', xp: 15, dhikr: ['hawqala'], goal: 33, go: '/dhikr' },
  { id: 'dhikr500', t: 'Reach 500 dhikr in total today', icon: 'flame', xp: 30, dhikr: ['*'], goal: 500, go: '/dhikr' },
  { id: 'pray5', t: 'Pray all 5 prayers on time', icon: 'mosque', xp: 40, go: '/prayer' },
  { id: 'fajrmasjid', t: 'Pray Fajr on time', icon: 'sun', xp: 20, go: '/prayer' },
  { id: 'sunnahrawatib', t: 'Pray the sunnah prayers before or after a fard', icon: 'hands', xp: 20 },
  { id: 'duha', t: 'Pray two rak‘ahs of Duha', icon: 'sun', xp: 20 },
  { id: 'witr', t: 'Pray Witr before you sleep', icon: 'moon', xp: 20 },
  { id: 'quran1', t: 'Read 1 page of Quran', icon: 'quran', xp: 15, go: '/quran' },
  { id: 'quran5', t: 'Read 5 pages of Quran', icon: 'quran', xp: 30, go: '/quran' },
  { id: 'kahf', t: 'Read or listen to a passage you love from the Quran', icon: 'headphones', xp: 15, go: '/quran' },
  { id: 'memorise', t: 'Memorise or revise one ayah', icon: 'brain', xp: 20, go: '/hifz' },
  { id: 'tafsir', t: 'Learn the meaning of one ayah', icon: 'book', xp: 15, go: '/tafsir' },
  { id: 'sadaqah', t: 'Give any sadaqah, even a little', icon: 'gift', xp: 25 },
  { id: 'feed', t: 'Feed someone or share food', icon: 'bag', xp: 25 },
  { id: 'relative', t: 'Call or message a relative', icon: 'phone', xp: 20 },
  { id: 'parents', t: 'Do something kind for your parents', icon: 'heart', xp: 25 },
  { id: 'salam5', t: 'Smile and greet 5 people with salam', icon: 'smile', xp: 15 },
  { id: 'morning', t: 'Say the morning adhkar', icon: 'sun', xp: 15, go: '/adhkar' },
  { id: 'evening', t: 'Say the evening adhkar', icon: 'moon', xp: 15, go: '/adhkar' },
  { id: 'sleepadhkar', t: 'Say the adhkar before sleeping', icon: 'moon', xp: 15, go: '/adhkar' },
  { id: 'gratitude3', t: 'Write down 3 blessings', icon: 'gem', xp: 15, go: '/journal' },
  { id: 'dua3', t: 'Make dua for 3 other people by name', icon: 'dua', xp: 15 },
  { id: 'nobackbite', t: 'Go the whole day without backbiting', icon: 'shield', xp: 25 },
  { id: 'nocomplain', t: 'Go the whole day without complaining', icon: 'smile', xp: 20 },
  { id: 'forgive', t: 'Forgive someone who wronged you', icon: 'hands', xp: 25 },
  { id: 'visit', t: 'Visit or check on someone who is ill or alone', icon: 'users', xp: 25 },
  { id: 'hadith1', t: 'Learn one hadith and share it', icon: 'scroll', xp: 15, go: '/hadith' },
  { id: 'name99', t: 'Learn one of the 99 Names of Allah', icon: 'star', xp: 15, go: '/names' },
  { id: 'wudu', t: 'Stay in wudu as long as you can today', icon: 'leaf', xp: 15 },
  { id: 'lessphone', t: 'Spend 30 minutes off your phone in reflection', icon: 'hourglass', xp: 20 },
  { id: 'clean', t: 'Tidy a shared space without being asked', icon: 'home', xp: 15 },
  { id: 'teach', t: 'Teach someone something good', icon: 'cap', xp: 20 },
  { id: 'fast', t: 'Fast a voluntary fast (Mon/Thu or any day)', icon: 'fast', xp: 40, go: '/fasting' },
  { id: 'sunnahsmile', t: 'Help someone with a task today', icon: 'hands', xp: 20 },
  { id: 'water', t: 'Give someone water or a drink', icon: 'gift', xp: 15 }
];
const LEVEL_XP = 200; // simple linear levels for challenge XP

module.exports = function socialPlus2(ctx) {
  const { app, q, auth, wrap, todayFor } = ctx;
  let ready;
  const ensure = () => ready ||= [
    `CREATE TABLE IF NOT EXISTS sp2_challenge_done (user_id INT REFERENCES users(id) ON DELETE CASCADE, day DATE NOT NULL, cid TEXT NOT NULL, xp INT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(user_id, day, cid))`,
    `CREATE TABLE IF NOT EXISTS sp2_friends (requester INT REFERENCES users(id) ON DELETE CASCADE, addressee INT REFERENCES users(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), responded_at TIMESTAMPTZ, PRIMARY KEY(requester, addressee), CHECK(requester<>addressee))`,
    `CREATE INDEX IF NOT EXISTS sp2_friends_addr ON sp2_friends(addressee, status)`,
    `CREATE TABLE IF NOT EXISTS sp2_prefs (user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, hide_global BOOLEAN NOT NULL DEFAULT false, mutual_friends BOOLEAN NOT NULL DEFAULT true, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`
  ].reduce((p, s) => p.then(() => q(s)), Promise.resolve()).catch(e => { ready = null; throw e; });

  const safeTz = tz => { try { if (tz && typeof tz === 'string' && tz.length < 64) { new Intl.DateTimeFormat('en', { timeZone: tz }); return tz; } } catch {} return 'UTC'; };
  const addDays = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const ymd = d => d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  const rows = (sql, a) => q(sql, a).then(r => r.rows).catch(e => { console.log('sp2 query error:', e.message, String(sql).slice(0, 120)); return []; });
  const one = async (sql, a) => (await rows(sql, a))[0] || {};

  // Simple in-memory rate limiter per user+bucket.
  const hits = new Map();
  const limited = (key, max, windowMs) => { const now = Date.now(); const a = (hits.get(key) || []).filter(t => now - t < windowMs); a.push(now); hits.set(key, a);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k); return a.length > max; };

  // ================= Creator analytics =================
  app.get('/api/sp2/analytics', auth, wrap(async (req, res) => {
    const uid = req.user.id, days = [7, 28, 60].includes(+req.query.days) ? +req.query.days : 28, tz = safeTz(req.user.settings?.tz);
    // Tz-aware day buckets; fall back to UTC if the DB lacks tz data.
    let TZ = tz; try { await q(`SELECT now() AT TIME ZONE $1`, [TZ]); } catch { TZ = 'UTC'; }
    const today = todayFor(req.user), start = addDays(today, -(days - 1)), prevStart = addDays(start, -days);
    const VIEW = `FROM fyp_views v JOIN fyp_publications p ON p.id=v.lesson_id WHERE p.user_id=$1 AND (v.user_id IS NULL OR v.user_id<>$1) AND v.watched_ms >= 2000`;
    const vk = await one(`SELECT count(*) FILTER (WHERE v.day >= $2)::int views, COALESCE(sum(v.watched_ms) FILTER (WHERE v.day >= $2),0)::float watch_ms,
        count(*) FILTER (WHERE v.day >= $2 AND v.completed)::int completed, count(DISTINCT v.user_id) FILTER (WHERE v.day >= $2)::int viewers,
        count(*) FILTER (WHERE v.day >= $3 AND v.day < $2)::int prev_views ${VIEW}`, [uid, start, prevStart]);
    const lk = await one(`SELECT count(*) FILTER (WHERE f.liked AND f.liked_at >= $2::date)::int likes, count(*) FILTER (WHERE f.liked AND f.liked_at >= $3::date AND f.liked_at < $2::date)::int prev_likes,
        count(*) FILTER (WHERE f.saved)::int saves_all, count(*) FILTER (WHERE f.reposted AND f.reposted_at >= $2::date)::int reposts
        FROM fyp_progress f JOIN fyp_publications p ON p.id=f.lesson_id WHERE p.user_id=$1 AND f.user_id<>$1`, [uid, start, prevStart]);
    const cm = await one(`SELECT count(*) FILTER (WHERE c.created_at >= $2::date)::int comments, count(*) FILTER (WHERE c.created_at >= $3::date AND c.created_at < $2::date)::int prev_comments
        FROM fyp_comments c JOIN fyp_publications p ON p.id=c.lesson_id WHERE p.user_id=$1 AND c.user_id<>$1 AND NOT c.hidden`, [uid, start, prevStart]);
    const sh = await one(`SELECT count(*) FILTER (WHERE s.day >= $2)::int shares, count(*) FILTER (WHERE s.day >= $3 AND s.day < $2)::int prev_shares
        FROM fyp_shares s JOIN fyp_publications p ON p.id=s.lesson_id WHERE p.user_id=$1 AND s.user_id<>$1`, [uid, start, prevStart]);
    const fo = await one(`SELECT count(*)::int total, count(*) FILTER (WHERE created_at >= $2::date)::int gained, count(*) FILTER (WHERE created_at >= $3::date AND created_at < $2::date)::int prev_gained FROM follows WHERE followee=$1`, [uid, start, prevStart]);
    const st = await one(`SELECT count(DISTINCT s.id)::int stories, count(v.user_id) FILTER (WHERE v.user_id<>$1)::int story_views, count(v.reaction) FILTER (WHERE v.user_id<>$1)::int story_reactions
        FROM social_stories s LEFT JOIN story_views v ON v.story_id=s.id WHERE s.user_id=$1 AND s.created_at >= $2::date`, [uid, start]);
    const pc = await one(`SELECT count(*)::int total, count(*) FILTER (WHERE published_at >= $2::date)::int in_range FROM fyp_publications WHERE user_id=$1`, [uid, start]);

    // Daily series
    const dv = await rows(`SELECT to_char(v.day,'YYYY-MM-DD') d, count(*)::int n, COALESCE(sum(v.watched_ms),0)::float w ${VIEW} AND v.day >= $2 GROUP BY v.day`, [uid, start]);
    const df = await rows(`SELECT to_char((created_at AT TIME ZONE $3)::date,'YYYY-MM-DD') d, count(*)::int n FROM follows WHERE followee=$1 AND created_at >= $2::date - 1 GROUP BY 1`, [uid, start, TZ]);
    const dvm = Object.fromEntries(dv.map(r => [r.d, r])), dfm = Object.fromEntries(df.map(r => [r.d, r.n]));
    const series = []; let fRun = (fo.total || 0) - (fo.gained || 0);
    for (let i = 0; i < days; i++) { const d = addDays(start, i); fRun += dfm[d] || 0; series.push({ d, views: dvm[d]?.n || 0, watchMs: dvm[d]?.w || 0, newFollowers: dfm[d] || 0, followers: fRun }); }

    // Top posts (by views in range)
    const top = await rows(`SELECT p.id, p.content->>'title' title, p.content->>'format' format, p.content->'media' media, p.published_at,
        count(v.*)::int views, COALESCE(avg(v.watched_ms),0)::float avg_ms, count(v.*) FILTER (WHERE v.completed)::int completed,
        (SELECT count(*) FROM fyp_progress f WHERE f.lesson_id=p.id AND f.liked AND f.user_id<>$1)::int likes,
        (SELECT count(*) FROM fyp_progress f WHERE f.lesson_id=p.id AND f.saved AND f.user_id<>$1)::int saves,
        (SELECT count(*) FROM fyp_comments c WHERE c.lesson_id=p.id AND NOT c.hidden AND c.user_id<>$1)::int comments,
        (SELECT count(*) FROM fyp_shares s WHERE s.lesson_id=p.id AND s.user_id<>$1)::int shares
      FROM fyp_publications p LEFT JOIN fyp_views v ON v.lesson_id=p.id AND v.day >= $2 AND (v.user_id IS NULL OR v.user_id<>$1) AND v.watched_ms >= 2000
      WHERE p.user_id=$1 GROUP BY p.id ORDER BY views DESC, p.published_at DESC LIMIT 10`, [uid, start]);
    const thumb = m => m ? (m.poster || (m.slides && m.slides[0]?.src) || (/\.(jpe?g|png|webp|gif)$/i.test(m.src || '') ? m.src : null) || null) : null;

    // Active hours heatmap (weekday × hour, viewer's activity in creator's tz)
    const hm = await rows(`SELECT extract(isodow FROM (v.started_at AT TIME ZONE $3))::int dow, extract(hour FROM (v.started_at AT TIME ZONE $3))::int h, count(*)::int n ${VIEW} AND v.day >= $2 GROUP BY 1,2`, [uid, start, TZ]);

    const views = vk.views || 0, likes = lk.likes || 0, comments = cm.comments || 0, shares = sh.shares || 0;
    const pct = (a, b) => b ? Math.round(1000 * a / b) / 10 : null;
    const delta = (a, b) => b ? Math.round(100 * (a - b) / b) : (a ? null : 0);
    res.json({
      days, start, end: today, tz: TZ,
      kpis: {
        views: { value: views, delta: delta(views, vk.prev_views || 0) },
        watchMs: { value: vk.watch_ms || 0 },
        avgWatchMs: { value: views ? Math.round((vk.watch_ms || 0) / views) : 0 },
        completionRate: { value: pct(vk.completed || 0, views) },
        viewers: { value: vk.viewers || 0 },
        likes: { value: likes, delta: delta(likes, lk.prev_likes || 0) },
        comments: { value: comments, delta: delta(comments, cm.prev_comments || 0) },
        shares: { value: shares, delta: delta(shares, sh.prev_shares || 0) },
        reposts: { value: lk.reposts || 0 },
        savesAllTime: { value: lk.saves_all || 0 }, // saves have no timestamp → lifetime only
        newFollowers: { value: fo.gained || 0, delta: delta(fo.gained || 0, fo.prev_gained || 0) },
        followers: { value: fo.total || 0 },
        engagementRate: { value: pct(likes + comments + shares, views) }, // saves excluded: not time-stamped
        stories: { value: st.stories || 0 }, storyViews: { value: st.story_views || 0 }, storyReactions: { value: st.story_reactions || 0 },
        posts: { value: pc.total || 0 }, postsInRange: { value: pc.in_range || 0 }
      },
      untracked: ['profileVisits', 'trafficSource'],
      series,
      top: top.map(r => ({ id: r.id, title: r.title || 'Untitled', format: r.format, thumb: thumb(r.media), publishedAt: r.published_at, views: r.views, avgWatchMs: Math.round(r.avg_ms),
        completion: pct(r.completed, r.views), likes: r.likes, comments: r.comments, shares: r.shares, saves: r.saves, er: pct(r.likes + r.comments + r.shares, r.views) })),
      heatmap: hm.length ? hm.map(r => [r.dow, r.h, r.n]) : null
    });
  }));

  // ================= Challenges =================
  const hash = s => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
  const pickFor = day => { const idx = CHALLENGES.map((c, i) => [hash(day + ':' + c.id), i]).sort((a, b) => a[0] - b[0]).slice(0, 3).map(x => x[1]); return idx.map(i => CHALLENGES[i]); };
  const DHIKR_KEYS = new Set(CHALLENGES.flatMap(c => c.dhikr || []).filter(k => k !== '*'));

  async function challengeState(user) {
    await ensure(); const uid = user.id, day = todayFor(user), list = pickFor(day);
    const done = new Set((await rows('SELECT cid FROM sp2_challenge_done WHERE user_id=$1 AND day=$2', [uid, day])).map(r => r.cid));
    const dh = await rows('SELECT phrase, count FROM dhikr_logs WHERE user_id=$1 AND day=$2', [uid, day]);
    const dmap = {}; let dTotal = 0; for (const r of dh) { dmap[r.phrase] = (dmap[r.phrase] || 0) + r.count; dTotal += r.count; }
    const prog = c => !c.dhikr ? null : Math.min(c.goal, c.dhikr.includes('*') ? dTotal : c.dhikr.reduce((a, k) => a + (dmap[k] || 0), 0));
    const xpRow = await one('SELECT COALESCE(sum(xp),0)::int xp, count(*)::int n FROM sp2_challenge_done WHERE user_id=$1', [uid]);
    const dset = new Set((await rows(`SELECT DISTINCT to_char(day,'YYYY-MM-DD') d FROM sp2_challenge_done WHERE user_id=$1 AND day > $2::date - 400`, [uid, day])).map(r => r.d));
    let streak = 0, s0 = dset.has(day) ? 0 : dset.has(addDays(day, -1)) ? 1 : -1; if (s0 >= 0) while (dset.has(addDays(day, -(s0 + streak)))) streak++;
    let best = 0, run = 0, prev = null; for (const d of [...dset].sort()) { run = prev && addDays(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; }
    const xp = xpRow.xp || 0;
    const week = []; for (let i = 6; i >= 0; i--) { const d = addDays(day, -i); week.push({ d, done: dset.has(d) }); }
    return { day, challenges: list.map(c => ({ id: c.id, title: c.t, icon: c.icon, xp: c.xp, go: c.go || null, goal: c.goal || null, progress: prog(c), done: done.has(c.id) })),
      xp, completed: xpRow.n || 0, level: { level: 1 + Math.floor(xp / LEVEL_XP), into: xp % LEVEL_XP, need: LEVEL_XP }, streak, best: Math.max(best, streak), week, allDone: list.every(c => done.has(c.id)) };
  }
  app.get('/api/sp2/challenges', auth, wrap(async (req, res) => res.json(await challengeState(req.user))));
  app.post('/api/sp2/challenges/:id/done', auth, wrap(async (req, res) => {
    await ensure(); if (ctx.ensureProfile) ctx.ensureProfile(req.user).catch(() => {}); if (limited('ch:' + req.user.id, 30, 60000)) return res.status(429).json({ error: 'Slow down a little' });
    const day = todayFor(req.user), c = pickFor(day).find(x => x.id === String(req.params.id));
    if (!c) return res.status(404).json({ error: 'That challenge is not on today’s list' });
    const undo = req.body?.done === false;
    if (undo) await q('DELETE FROM sp2_challenge_done WHERE user_id=$1 AND day=$2 AND cid=$3', [req.user.id, day, c.id]);
    else {
      if (c.dhikr) { const s = await challengeState(req.user); const x = s.challenges.find(z => z.id === c.id); if (x && x.progress < c.goal) return res.status(400).json({ error: `Count ${c.goal - x.progress} more on the dhikr counter first` }); }
      const all = pickFor(day), had = (await rows('SELECT cid FROM sp2_challenge_done WHERE user_id=$1 AND day=$2', [req.user.id, day])).length;
      const bonus = had === all.length - 1 ? 25 : 0; // finish all 3 → bonus
      await q('INSERT INTO sp2_challenge_done(user_id,day,cid,xp) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [req.user.id, day, c.id, c.xp + bonus]);
    }
    res.json(await challengeState(req.user));
  }));

  // ================= Friends =================
  const PROF = `u.id, p.username, COALESCE(p.display_name, p.username, u.name) AS name, p.avatar`;
  const notBlocked = `NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker=$1 AND b.blocked=u.id) OR (b.blocker=u.id AND b.blocked=$1))`;
  const prefsOf = async uid => { await ensure(); const r = await one('SELECT hide_global, mutual_friends FROM sp2_prefs WHERE user_id=$1', [uid]); return { hideGlobal: !!r.hide_global, mutualFriends: r.mutual_friends !== false }; };
  async function friendIds(uid) {
    await ensure(); const pr = await prefsOf(uid);
    const ids = new Set((await rows(`SELECT CASE WHEN requester=$1 THEN addressee ELSE requester END id FROM sp2_friends WHERE status='accepted' AND (requester=$1 OR addressee=$1)`, [uid])).map(r => r.id));
    if (pr.mutualFriends) for (const r of await rows(`SELECT a.followee id FROM follows a JOIN follows b ON b.follower=a.followee AND b.followee=a.follower WHERE a.follower=$1`, [uid])) ids.add(r.id);
    ids.delete(uid); return [...ids];
  }
  const hasBlocks = async () => !!(await one(`SELECT to_regclass('user_blocks') t`)).t;
  app.get('/api/sp2/friends', auth, wrap(async (req, res) => {
    await ensure(); const uid = req.user.id; if (ctx.ensureProfile) await ctx.ensureProfile(req.user).catch(() => {});
    const ids = await friendIds(uid), nb = await hasBlocks() ? 'AND ' + notBlocked : '';
    const explicit = new Set((await rows(`SELECT CASE WHEN requester=$1 THEN addressee ELSE requester END id FROM sp2_friends WHERE status='accepted' AND (requester=$1 OR addressee=$1)`, [uid])).map(r => r.id));
    const friends = ids.length ? await rows(`SELECT ${PROF} FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id = ANY($2::int[]) AND u.id <> $1::int AND NOT COALESCE(p.banned,false) ${nb} ORDER BY lower(COALESCE(p.username,u.name))`, [uid, ids]) : [];
    const incoming = await rows(`SELECT ${PROF}, f.created_at FROM sp2_friends f JOIN users u ON u.id=f.requester LEFT JOIN profiles p ON p.user_id=u.id WHERE f.addressee=$1 AND f.status='pending' ${nb} ORDER BY f.created_at DESC LIMIT 50`, [uid]);
    const outgoing = await rows(`SELECT ${PROF}, f.created_at FROM sp2_friends f JOIN users u ON u.id=f.addressee LEFT JOIN profiles p ON p.user_id=u.id WHERE f.requester=$1 AND f.status='pending' ORDER BY f.created_at DESC LIMIT 50`, [uid]);
    res.json({ friends: friends.map(f => ({ ...f, via: explicit.has(f.id) ? 'friend' : 'mutual' })), incoming, outgoing, prefs: await prefsOf(uid) });
  }));
  app.get('/api/sp2/friends/search', auth, wrap(async (req, res) => {
    await ensure(); if (ctx.ensureProfile) await ctx.ensureProfile(req.user).catch(() => {}); const uid = req.user.id, term = String(req.query.q || '').trim().replace(/^@/, '').toLowerCase().slice(0, 30);
    if (term.length < 2) return res.json({ people: [] });
    const nb = await hasBlocks() ? 'AND ' + notBlocked : '';
    const esc_ = term.replace(/[\\%_]/g, '\\$&'), pre = esc_ + '%', any = '%' + esc_ + '%';
    // Give users who never opened the social side a profile, so everyone can be found and added.
    const missing = await rows(`SELECT u.id, u.name FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE p.user_id IS NULL AND u.id<>$1 AND lower(COALESCE(u.name,'')) LIKE $2 LIMIT 20`, [uid, any]);
    if (ctx.ensureProfile) for (const m of missing) await ctx.ensureProfile(m).catch(() => {});
    const people = await rows(`SELECT ${PROF},
        (SELECT status FROM sp2_friends f WHERE (f.requester=$1 AND f.addressee=u.id) OR (f.requester=u.id AND f.addressee=$1) LIMIT 1) status,
        (SELECT requester FROM sp2_friends f WHERE (f.requester=$1 AND f.addressee=u.id) OR (f.requester=u.id AND f.addressee=$1) LIMIT 1) requester
      FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.id<>$1 AND NOT COALESCE(p.banned,false)
        AND (lower(p.username) LIKE $3 OR lower(COALESCE(p.display_name,'')) LIKE $3 OR lower(COALESCE(u.name,'')) LIKE $3) ${nb}
      ORDER BY (lower(p.username)=$2) DESC, (lower(p.username) LIKE $4) DESC, length(p.username) LIMIT 20`, [uid, term, any, pre]);
    res.json({ people: people.map(p => ({ id: p.id, username: p.username, name: p.name, avatar: p.avatar, state: p.status === 'accepted' ? 'friends' : p.status === 'pending' ? (p.requester === uid ? 'sent' : 'incoming') : 'none' })) });
  }));
  app.post('/api/sp2/friends/request', auth, wrap(async (req, res) => {
    await ensure(); const uid = req.user.id; if (ctx.ensureProfile) await ctx.ensureProfile(req.user).catch(() => {}); if (limited('fr:' + uid, 30, 3600000)) return res.status(429).json({ error: 'Too many requests — try again later' });
    const uname = String(req.body?.username || '').trim().replace(/^@/, '').toLowerCase().slice(0, 30);
    const byId = parseInt(req.body?.userId, 10);
    const t = byId ? (await rows('SELECT u.id user_id FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id=$1 AND NOT COALESCE(p.banned,false)', [byId]))[0]
      : (await rows('SELECT user_id FROM profiles WHERE lower(username)=$1 AND NOT COALESCE(banned,false)', [uname]))[0];
    if (!t) return res.status(404).json({ error: 'No one with that username' });
    if (t.user_id === uid) return res.status(400).json({ error: 'That’s you!' });
    if (await hasBlocks() && (await rows('SELECT 1 FROM user_blocks WHERE (blocker=$1 AND blocked=$2) OR (blocker=$2 AND blocked=$1)', [uid, t.user_id])).length) return res.status(404).json({ error: 'No one with that username' });
    const ex = (await rows('SELECT requester, status FROM sp2_friends WHERE (requester=$1 AND addressee=$2) OR (requester=$2 AND addressee=$1)', [uid, t.user_id]))[0];
    if (ex?.status === 'accepted') return res.json({ state: 'friends' });
    if (ex && ex.requester === t.user_id) { // they already asked us → accept
      await q(`UPDATE sp2_friends SET status='accepted', responded_at=now() WHERE requester=$1 AND addressee=$2`, [t.user_id, uid]);
      ctx.notify?.(t.user_id, uid, 'friend', null, `${req.user.name || 'Someone'} accepted your friend request`); return res.json({ state: 'friends' });
    }
    if (ex) return res.json({ state: 'sent' });
    await q('INSERT INTO sp2_friends(requester,addressee) VALUES($1,$2) ON CONFLICT DO NOTHING', [uid, t.user_id]).catch(e => { console.log('sp2 insert', e.message); throw e; });
    ctx.notify?.(t.user_id, uid, 'friend', null, `${req.user.name || 'Someone'} sent you a friend request`);
    res.json({ state: 'sent' });
  }));
  app.post('/api/sp2/friends/respond', auth, wrap(async (req, res) => {
    await ensure(); const uid = req.user.id, from = parseInt(req.body?.userId, 10), accept = !!req.body?.accept;
    if (!from) return res.status(400).json({ error: 'Missing user' });
    const r = accept ? await q(`UPDATE sp2_friends SET status='accepted', responded_at=now() WHERE requester=$1 AND addressee=$2 AND status='pending' RETURNING 1`, [from, uid])
      : await q(`DELETE FROM sp2_friends WHERE requester=$1 AND addressee=$2 AND status='pending' RETURNING 1`, [from, uid]);
    if (!r.rows.length) return res.status(404).json({ error: 'Request not found' });
    if (accept) ctx.notify?.(from, uid, 'friend', null, `${req.user.name || 'Someone'} accepted your friend request`);
    res.json({ ok: true, state: accept ? 'friends' : 'none' });
  }));
  app.post('/api/sp2/friends/remove', auth, wrap(async (req, res) => { // unfriend or cancel own request
    await ensure(); const uid = req.user.id, other = parseInt(req.body?.userId, 10); if (!other) return res.status(400).json({ error: 'Missing user' });
    await q('DELETE FROM sp2_friends WHERE (requester=$1 AND addressee=$2) OR (requester=$2 AND addressee=$1)', [uid, other]); res.json({ ok: true });
  }));
  app.put('/api/sp2/prefs', auth, wrap(async (req, res) => {
    await ensure(); const cur = await prefsOf(req.user.id), b = req.body || {};
    const hg = typeof b.hideGlobal === 'boolean' ? b.hideGlobal : cur.hideGlobal, mf = typeof b.mutualFriends === 'boolean' ? b.mutualFriends : cur.mutualFriends;
    await q(`INSERT INTO sp2_prefs(user_id,hide_global,mutual_friends) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET hide_global=$2, mutual_friends=$3, updated_at=now()`, [req.user.id, hg, mf]);
    res.json({ prefs: await prefsOf(req.user.id) });
  }));

  // ================= Dhikr leaderboard =================
  // Source: dhikr_logs (written by the existing dhikr counter via POST /api/dhikr). Capped per user-day at read time.
  async function totals(from, to, ids) { // ids null → global
    const filter = ids ? 'AND d.user_id = ANY($3::int[])' : '';
    return rows(`SELECT user_id, sum(c)::int total FROM (SELECT d.user_id, d.day, LEAST(sum(GREATEST(d.count,0)), ${DAY_CAP}) c FROM dhikr_logs d
      WHERE d.day >= $1 AND d.day <= $2 ${filter} GROUP BY d.user_id, d.day) t GROUP BY user_id HAVING sum(c) > 0 ORDER BY total DESC, user_id LIMIT 500`, ids ? [from, to, ids] : [from, to]);
  }
  const av = a => a && a.length <= 160000 ? a : null; // keep leaderboard payloads light
  const rankMap = list => new Map(list.map((r, i) => [r.user_id, i + 1]));
  app.get('/api/sp2/leaderboard', auth, wrap(async (req, res) => {
    await ensure(); const uid = req.user.id, period = req.query.period === 'week' ? 'week' : 'today', scope = req.query.scope === 'global' ? 'global' : 'friends';
    if (ctx.ensureProfile) await ctx.ensureProfile(req.user).catch(() => {});
    const day = todayFor(req.user), span = period === 'week' ? 7 : 1;
    const from = addDays(day, -(span - 1)), pFrom = addDays(from, -span), pTo = addDays(from, -1);
    const prefs = await prefsOf(uid);
    let ids = null;
    if (scope === 'friends') ids = [...await friendIds(uid), uid];
    const hidden = scope === 'global' ? new Set((await rows('SELECT user_id FROM sp2_prefs WHERE hide_global')).map(r => r.user_id)) : new Set();
    const banned = new Set((await rows('SELECT user_id FROM profiles WHERE COALESCE(banned,false)')).map(r => r.user_id));
    const keep = r => !banned.has(r.user_id) && (scope !== 'global' || !hidden.has(r.user_id) || r.user_id === uid);
    const cur = (await totals(from, day, ids)).filter(keep), prev = (await totals(pFrom, pTo, ids)).filter(keep);
    // Global: only people with a public username appear; the viewer always sees their own row.
    const profs = new Map((await rows(`SELECT p.user_id, p.username, p.display_name, p.avatar FROM profiles p WHERE p.user_id = ANY($1::int[])`, [[...new Set([...cur.map(r => r.user_id), uid])]])).map(r => [r.user_id, r]));
    const list = cur.filter(r => profs.has(r.user_id) && (r.user_id === uid || scope !== 'global' || !hidden.has(r.user_id)));
    const ranked = list.filter(r => scope !== 'global' || !hidden.has(r.user_id)); // hidden self doesn't occupy a public rank
    const prevRank = rankMap(prev.filter(r => profs.has(r.user_id)));
    const row = (r, i) => { const p = profs.get(r.user_id) || {}; const pr = prevRank.get(r.user_id);
      return { rank: i + 1, username: p.username || null, name: scope === 'global' ? null : (p.display_name || p.username), avatar: av(p.avatar), total: r.total, you: r.user_id === uid, change: pr ? pr - (i + 1) : null, isNew: !pr }; };
    const top = ranked.slice(0, 50).map(row);
    const myIdx = ranked.findIndex(r => r.user_id === uid);
    const myTotal = (cur.find(r => r.user_id === uid) || {}).total || 0;
    const me = { rank: myIdx >= 0 ? myIdx + 1 : null, total: myTotal, username: profs.get(uid)?.username || null, avatar: av(profs.get(uid)?.avatar), you: true,
      hidden: scope === 'global' && prefs.hideGlobal, change: myIdx >= 0 && prevRank.get(uid) ? prevRank.get(uid) - (myIdx + 1) : null, of: ranked.length };
    res.json({ period, scope, from, to: day, cap: DAY_CAP, top, me, prefs, friendsCount: ids ? ids.length - 1 : null });
  }));

  // ---------- Alim connector ----------
  ctx.alimData = ctx.alimData || {};
  ctx.alimData.challenges = async user => { const s = await challengeState(user);
    return { today: s.challenges.map(c => ({ title: c.title, done: c.done, progress: c.progress, goal: c.goal })), xp: s.xp, level: s.level.level, streakDays: s.streak, page: '/challenges' }; };
  ctx.alimData.creator = async user => { const uid = user.id;
    const p = await one('SELECT count(*)::int posts FROM fyp_publications WHERE user_id=$1', [uid]);
    const f = await one('SELECT count(*)::int followers FROM follows WHERE followee=$1', [uid]);
    const v = await one(`SELECT count(*)::int views FROM fyp_views v JOIN fyp_publications p ON p.id=v.lesson_id WHERE p.user_id=$1 AND v.day > CURRENT_DATE - 28 AND (v.user_id IS NULL OR v.user_id<>$1)`, [uid]);
    return { posts: p.posts || 0, followers: f.followers || 0, views28d: v.views || 0, page: '/creator/analytics' }; };
};
module.exports.CHALLENGES = CHALLENGES;
