// Creator Quests — gamified creator dashboard: daily / weekly quests, XP, levels, streaks, badges, University progress.
// All progress is computed live from real activity (posts, stories, views, comments, followers) so it can't be faked.
const LEVELS = [ // [xp needed, title]
  [0, 'Seedling'], [150, 'Sprout'], [400, 'Storyteller'], [800, 'Rising Voice'], [1500, 'Creator'], [2500, 'Trusted Creator'],
  [4000, 'Star Creator'], [6000, 'Influencer'], [9000, 'Ummah Voice'], [13000, 'Legend'], [20000, 'Icon']];
const levelOf = xp => { let i = 0; while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1][0]) i++;
  const [base, title] = LEVELS[i], next = LEVELS[i + 1]; return { level: i + 1, title, xp, base, next: next ? next[0] : null, nextTitle: next ? next[1] : null, pct: next ? Math.round(100 * (xp - base) / (next[0] - base)) : 100 }; };

// Quests: period d = daily, w = weekly, m = milestone (once). metric = key of the stats object, goal, xp reward.
const QUESTS = [
  { id: 'd_post', p: 'd', t: 'Did you post today?', d: 'Share 1 post or video today', m: 'postsToday', g: 1, xp: 20, icon: 'plus' },
  { id: 'd_story2', p: 'd', t: 'Story time', d: 'Add 2 stories today', m: 'storiesToday', g: 2, xp: 20, icon: 'circle' },
  { id: 'd_video', p: 'd', t: 'Lights, camera', d: 'Post 1 video today', m: 'videosToday', g: 1, xp: 25, icon: 'play' },
  { id: 'd_reply', p: 'd', t: 'Talk back', d: 'Reply to 5 comments today', m: 'repliesToday', g: 5, xp: 15, icon: 'chat' },
  { id: 'd_views', p: 'd', t: 'Get noticed', d: 'Reach 100 views today', m: 'viewsToday', g: 100, xp: 25, icon: 'eye' },
  { id: 'd_learn', p: 'd', t: 'Study break', d: 'Finish 1 Creator University lesson', m: 'lessonsToday', g: 1, xp: 15, icon: 'cap' },
  { id: 'w_video3', p: 'w', t: 'Hat-trick', d: 'Post 3 videos this week', m: 'videosWeek', g: 3, xp: 80, icon: 'play' },
  { id: 'w_post7', p: 'w', t: 'Every single day', d: 'Post on 7 different days this week', m: 'postDaysWeek', g: 7, xp: 200, icon: 'flame' },
  { id: 'w_story10', p: 'w', t: 'Story streak', d: 'Add 10 stories this week', m: 'storiesWeek', g: 10, xp: 80, icon: 'circle' },
  { id: 'w_followers', p: 'w', t: 'Growing family', d: 'Gain 25 new followers this week', m: 'followersWeek', g: 25, xp: 120, icon: 'users' },
  { id: 'w_views', p: 'w', t: 'Thousand eyes', d: 'Get 1,000 views this week', m: 'viewsWeek', g: 1000, xp: 120, icon: 'eye' },
  { id: 'w_comments', p: 'w', t: 'Conversation starter', d: 'Get 30 comments this week', m: 'commentsWeek', g: 30, xp: 100, icon: 'chat' },
  { id: 'w_carousel', p: 'w', t: 'Swipe-worthy', d: 'Post 2 photo carousels this week', m: 'carouselsWeek', g: 2, xp: 60, icon: 'layers' },
  { id: 'm_first', p: 'm', t: 'First step', d: 'Publish your first post', m: 'posts', g: 1, xp: 50, icon: 'plus' },
  { id: 'm_10', p: 'm', t: 'Ten down', d: 'Publish 10 posts', m: 'posts', g: 10, xp: 150, icon: 'grid' },
  { id: 'm_50', p: 'm', t: 'Half-century', d: 'Publish 50 posts', m: 'posts', g: 50, xp: 400, icon: 'grid' },
  { id: 'm_daily10', p: 'm', t: 'Machine mode', d: 'Post 10 videos in a single day', m: 'maxVideosDay', g: 10, xp: 300, icon: 'zap' },
  { id: 'm_f100', p: 'm', t: 'First hundred', d: 'Reach 100 followers', m: 'followers', g: 100, xp: 200, icon: 'users' },
  { id: 'm_f1k', p: 'm', t: 'One thousand', d: 'Reach 1,000 followers', m: 'followers', g: 1000, xp: 600, icon: 'users' },
  { id: 'm_f5k', p: 'm', t: 'Creator Rewards ready', d: 'Reach 5,000 followers', m: 'followers', g: 5000, xp: 1500, icon: 'dollar' },
  { id: 'm_v10k', p: 'm', t: 'Ten thousand views', d: 'Get 10,000 views in 28 days', m: 'views28', g: 10000, xp: 400, icon: 'eye' },
  { id: 'm_v150k', p: 'm', t: 'Monetised', d: 'Get 150,000 views in 28 days', m: 'views28', g: 150000, xp: 2000, icon: 'dollar' },
  { id: 'm_streak7', p: 'm', t: 'On fire', d: 'Keep a 7-day posting streak', m: 'bestStreak', g: 7, xp: 250, icon: 'flame' },
  { id: 'm_streak30', p: 'm', t: 'Unstoppable', d: 'Keep a 30-day posting streak', m: 'bestStreak', g: 30, xp: 1000, icon: 'flame' },
  { id: 'm_grad', p: 'm', t: 'Graduate', d: 'Finish every Creator University lesson', m: 'lessonsDone', g: 0, xp: 800, icon: 'cap' }];

module.exports = function creatorQuests(ctx) {
  const { app, q, auth, wrap } = ctx;
  let ready = null;
  const ensure = () => ready || (ready = q(`CREATE TABLE IF NOT EXISTS creator_quest_claims (user_id INT REFERENCES users(id) ON DELETE CASCADE, quest_id TEXT NOT NULL, period TEXT NOT NULL, xp INT NOT NULL, claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(user_id, quest_id, period))`)
    .then(() => q(`CREATE TABLE IF NOT EXISTS creator_lessons (user_id INT REFERENCES users(id) ON DELETE CASCADE, lesson_id TEXT NOT NULL, done_at TIMESTAMPTZ NOT NULL DEFAULT now(), quiz_ok BOOLEAN NOT NULL DEFAULT false, PRIMARY KEY(user_id, lesson_id))`))
    .catch(e => { ready = null; throw e; }));
  const one = async (sql, a) => { try { return (await q(sql, a)).rows[0] || {}; } catch { return {}; } };
  const COURSE = require('../public/js/creator-course.js');
  const LESSON_IDS = COURSE.MODULES.flatMap(m => m.lessons.map(l => l.id));

  async function stats(uid) {
    // Day/week boundaries in UTC (simple, consistent for everyone).
    const p = await one(`SELECT
      count(*) FILTER (WHERE published_at >= date_trunc('day', now()))::int posts_today,
      count(*) FILTER (WHERE published_at >= date_trunc('day', now()) AND content->>'format'='reel')::int videos_today,
      count(*) FILTER (WHERE published_at >= date_trunc('week', now()) AND content->>'format'='reel')::int videos_week,
      count(*) FILTER (WHERE published_at >= date_trunc('week', now()) AND content->>'format'='carousel')::int carousels_week,
      count(DISTINCT date_trunc('day', published_at)) FILTER (WHERE published_at >= date_trunc('week', now()))::int post_days_week,
      count(*)::int posts FROM fyp_publications WHERE user_id=$1`, [uid]);
    const s = await one(`SELECT count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int today, count(*) FILTER (WHERE created_at >= date_trunc('week', now()))::int week FROM social_stories WHERE user_id=$1`, [uid]);
    const v = await one(`SELECT count(*) FILTER (WHERE v.started_at >= date_trunc('day', now()))::int today, count(*) FILTER (WHERE v.started_at >= date_trunc('week', now()))::int week,
      count(*) FILTER (WHERE v.started_at > now() - interval '28 days')::int d28
      FROM fyp_views v JOIN fyp_publications p ON p.id=v.lesson_id WHERE p.user_id=$1 AND (v.user_id IS NULL OR v.user_id<>$1) AND v.watched_ms >= 2000`, [uid]);
    const c = await one(`SELECT count(*) FILTER (WHERE c.created_at >= date_trunc('week', now()) AND c.user_id<>$1)::int week,
      count(*) FILTER (WHERE c.created_at >= date_trunc('day', now()) AND c.user_id=$1)::int replies_today
      FROM fyp_comments c JOIN fyp_publications p ON p.id=c.lesson_id WHERE p.user_id=$1 AND NOT c.hidden`, [uid]);
    const f = await one(`SELECT count(*)::int n FROM follows WHERE followee=$1`, [uid]);
    let fw = await one(`SELECT count(*)::int n FROM follows WHERE followee=$1 AND created_at >= date_trunc('week', now())`, [uid]); if (fw.n == null) fw = { n: 0 };
    const mx = await one(`SELECT COALESCE(max(n),0)::int n FROM (SELECT count(*) n FROM fyp_publications WHERE user_id=$1 AND content->>'format'='reel' GROUP BY date_trunc('day', published_at)) t`, [uid]);
    // posting streak (consecutive days with a post or story, ending today or yesterday)
    const days = (await q(`SELECT DISTINCT (published_at AT TIME ZONE 'UTC')::date d FROM fyp_publications WHERE user_id=$1 AND published_at > now() - interval '400 days'
      UNION SELECT DISTINCT (created_at AT TIME ZONE 'UTC')::date FROM social_stories WHERE user_id=$1 AND created_at > now() - interval '400 days' ORDER BY 1 DESC`, [uid]).catch(() => ({ rows: [] }))).rows.map(r => new Date(r.d).toISOString().slice(0, 10));
    const set = new Set(days), dayStr = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
    let streak = 0, start = set.has(dayStr(0)) ? 0 : set.has(dayStr(1)) ? 1 : -1; if (start >= 0) while (set.has(dayStr(start + streak))) streak++;
    let best = 0, run = 0, prev = null; for (const d of [...set].sort()) { run = prev && (Date.parse(d) - Date.parse(prev)) === 864e5 ? run + 1 : 1; best = Math.max(best, run); prev = d; }
    const L = await one(`SELECT count(*)::int done, count(*) FILTER (WHERE done_at >= date_trunc('day', now()))::int today FROM creator_lessons WHERE user_id=$1`, [uid]);
    return { postsToday: p.posts_today || 0, videosToday: p.videos_today || 0, videosWeek: p.videos_week || 0, carouselsWeek: p.carousels_week || 0, postDaysWeek: p.post_days_week || 0, posts: p.posts || 0,
      storiesToday: s.today || 0, storiesWeek: s.week || 0, viewsToday: v.today || 0, viewsWeek: v.week || 0, views28: v.d28 || 0, commentsWeek: c.week || 0, repliesToday: c.replies_today || 0,
      followers: f.n || 0, followersWeek: fw.n || 0, maxVideosDay: mx.n || 0, streak, bestStreak: Math.max(best, streak), lessonsDone: L.done || 0, lessonsToday: L.today || 0, postedToday: (p.posts_today || 0) + (s.today || 0) > 0 };
  }
  const periodKey = p => { const n = new Date(); if (p === 'd') return n.toISOString().slice(0, 10);
    if (p === 'w') { const d = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return 'w' + d.toISOString().slice(0, 10); } return 'once'; };

  async function board(uid) {
    await ensure(); const st = await stats(uid);
    const claims = (await q('SELECT quest_id, period, xp FROM creator_quest_claims WHERE user_id=$1', [uid])).rows;
    const claimed = new Set(claims.map(c => c.quest_id + '|' + c.period)), xp = claims.reduce((a, c) => a + c.xp, 0);
    const quests = QUESTS.map(x => { const goal = x.id === 'm_grad' ? LESSON_IDS.length : x.g, val = Math.min(goal, st[x.m] || 0), per = periodKey(x.p);
      return { id: x.id, period: x.p, title: x.t, desc: x.d, icon: x.icon, xp: x.xp, goal, value: val, done: val >= goal, claimed: claimed.has(x.id + '|' + per) }; });
    const badges = QUESTS.filter(x => x.p === 'm' && claimed.has(x.id + '|once')).map(x => ({ id: x.id, title: x.t, icon: x.icon }));
    const lessons = (await q('SELECT lesson_id FROM creator_lessons WHERE user_id=$1', [uid])).rows.map(r => r.lesson_id);
    const ready = quests.filter(x => x.done && !x.claimed).length;
    return { stats: st, level: levelOf(xp), quests, badges, lessonsDone: lessons, lessonsTotal: LESSON_IDS.length, ready, levels: LEVELS.map(([x, t], i) => ({ level: i + 1, xp: x, title: t })) };
  }
  ctx.creatorBoard = board;

  app.get('/api/creator/quests', auth, wrap(async (req, res) => res.json(await board(req.user.id))));
  app.post('/api/creator/quests/:id/claim', auth, wrap(async (req, res) => {
    const b = await board(req.user.id), x = b.quests.find(z => z.id === req.params.id);
    if (!x) return res.status(404).json({ error: 'Unknown quest' });
    if (!x.done) return res.status(400).json({ error: 'Not finished yet — keep going!' });
    const before = b.level.level;
    await q('INSERT INTO creator_quest_claims(user_id,quest_id,period,xp) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [req.user.id, x.id, periodKey(x.period), x.xp]);
    const after = await board(req.user.id);
    res.json({ ...after, gained: x.xp, levelUp: after.level.level > before ? after.level : null });
  }));
  app.post('/api/creator/lessons/:id/done', auth, wrap(async (req, res) => {
    await ensure(); const id = String(req.params.id); if (!LESSON_IDS.includes(id)) return res.status(404).json({ error: 'Unknown lesson' });
    await q('INSERT INTO creator_lessons(user_id,lesson_id,quiz_ok) VALUES($1,$2,$3) ON CONFLICT(user_id,lesson_id) DO UPDATE SET quiz_ok = creator_lessons.quiz_ok OR $3', [req.user.id, id, !!req.body?.quizOk]);
    res.json(await board(req.user.id));
  }));
};
module.exports.LEVELS = LEVELS; module.exports.QUESTS = QUESTS; module.exports.levelOf = levelOf;
