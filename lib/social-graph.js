// TikTok-style social graph for the feed: profiles with followers/following/likes, follow, Following feed,
// reposts tab with privacy toggles, liked-videos privacy, and public profile pages.
const SCHEMA = [
`CREATE TABLE IF NOT EXISTS social_privacy (user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 show_reposts BOOLEAN NOT NULL DEFAULT true, show_liked BOOLEAN NOT NULL DEFAULT false, private_account BOOLEAN NOT NULL DEFAULT false,
 allow_comments BOOLEAN NOT NULL DEFAULT true)`,
`ALTER TABLE fyp_progress ADD COLUMN IF NOT EXISTS reposted_at TIMESTAMPTZ`,
`ALTER TABLE fyp_progress ADD COLUMN IF NOT EXISTS liked_at TIMESTAMPTZ`,
`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pronouns TEXT`,
`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS website TEXT`,
`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS links JSONB NOT NULL DEFAULT '[]'::jsonb`,
`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS category TEXT`,
`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender TEXT`,
`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birthday DATE`,
`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ`,
`ALTER TABLE social_privacy ADD COLUMN IF NOT EXISTS allow_dms TEXT NOT NULL DEFAULT 'everyone'`,
`ALTER TABLE social_privacy ADD COLUMN IF NOT EXISTS comment_scope TEXT NOT NULL DEFAULT 'everyone'`,
`ALTER TABLE social_privacy ADD COLUMN IF NOT EXISTS allow_downloads BOOLEAN NOT NULL DEFAULT true`,
`ALTER TABLE social_privacy ADD COLUMN IF NOT EXISTS show_following BOOLEAN NOT NULL DEFAULT true`,
`ALTER TABLE social_privacy ADD COLUMN IF NOT EXISTS show_activity BOOLEAN NOT NULL DEFAULT true`,
`ALTER TABLE social_privacy ADD COLUMN IF NOT EXISTS suggest_account BOOLEAN NOT NULL DEFAULT true`,
`ALTER TABLE social_privacy ADD COLUMN IF NOT EXISTS allow_mentions TEXT NOT NULL DEFAULT 'everyone'`,
`ALTER TABLE social_privacy ADD COLUMN IF NOT EXISTS filter_words TEXT NOT NULL DEFAULT ''`,
`ALTER TABLE social_privacy ADD COLUMN IF NOT EXISTS read_receipts BOOLEAN NOT NULL DEFAULT true`,
`ALTER TABLE social_privacy ADD COLUMN IF NOT EXISTS typing_indicator BOOLEAN NOT NULL DEFAULT true`,
`CREATE TABLE IF NOT EXISTS profile_reports (id SERIAL PRIMARY KEY, reporter INT REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, target TEXT NOT NULL, reason TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now(), UNIQUE(reporter,kind,target))`,
`CREATE TABLE IF NOT EXISTS user_blocks (blocker INT REFERENCES users(id) ON DELETE CASCADE, blocked INT REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(blocker,blocked))`
];
const PRIV_DEFAULT = { show_reposts: true, show_liked: false, private_account: false, allow_comments: true, allow_dms: 'everyone', comment_scope: 'everyone', allow_downloads: true, show_following: true, show_activity: true, suggest_account: true, allow_mentions: 'everyone', filter_words: '', read_receipts: true, typing_indicator: true };
const PRIV_BOOL = ['show_reposts', 'show_liked', 'private_account', 'allow_comments', 'allow_downloads', 'show_following', 'show_activity', 'suggest_account', 'read_receipts', 'typing_indicator'];
const PRIV_SCOPE = ['allow_dms', 'comment_scope', 'allow_mentions'];
const SCOPES = ['everyone', 'followers', 'mutual', 'nobody'];
const CATEGORIES = ['', 'Creator', 'Educator', 'Student', 'Imam / Scholar', 'Reciter', 'Nasheed artist', 'Community organisation', 'Mosque', 'Charity', 'Business', 'Brand', 'Writer', 'Artist', 'Coach', 'Other'];
const GENDERS = ['', 'female', 'male', 'prefer_not'];
module.exports = function registerSocialGraph(ctx) {
  const { app, q, auth, wrap } = ctx;
  let ready = null; const ensure = () => ready || (ready = SCHEMA.reduce((p, s) => p.then(() => q(s)), Promise.resolve()).catch(e => { ready = null; throw e; }));
  ctx.socialGraphReady = ensure;
  const fail = (res, s, error) => res.status(s).json({ error });
  const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9_]+/g, '').slice(0, 20);

  // Ensure everyone who posts/follows has a username (auto-generated from their name).
  async function ensureProfile(user) {
    const p = (await q('SELECT * FROM profiles WHERE user_id=$1', [user.id])).rows[0]; if (p) return p;
    let base = slug(user.name) || 'member'; if (base.length < 3) base = base + 'user';
    let name = base, i = 0;
    while ((await q('SELECT 1 FROM profiles WHERE username=$1', [name])).rows[0]) { i++; name = (base.slice(0, 15) + Math.floor(1000 + Math.random() * 9000)).slice(0, 20); if (i > 20) break; }
    await q('INSERT INTO profiles(user_id,username,display_name) VALUES($1,$2,$3) ON CONFLICT(user_id) DO NOTHING', [user.id, name, user.name || null]);
    return (await q('SELECT * FROM profiles WHERE user_id=$1', [user.id])).rows[0];
  }
  ctx.ensureProfile = ensureProfile;
  async function privacy(uid) { await ensure(); const r = (await q('SELECT * FROM social_privacy WHERE user_id=$1', [uid])).rows[0]; return { ...PRIV_DEFAULT, ...(r || {}) }; }
  const blocked = async (a, b) => !!(await q('SELECT 1 FROM user_blocks WHERE (blocker=$1 AND blocked=$2) OR (blocker=$2 AND blocked=$1)', [a, b]).catch(() => ({ rows: [] }))).rows[0];
  ctx.isBlocked = blocked;
  ctx.socialPrivacy = privacy;

  async function profileView(target, viewerId) {
    const uid = target.user_id;
    const one = async (sql) => (await q(sql, [uid])).rows[0].n;
    const followers = await one('SELECT count(*)::int n FROM follows WHERE followee=$1');
    const following = await one('SELECT count(*)::int n FROM follows WHERE follower=$1');
    const likes = await one(`SELECT count(*)::int n FROM fyp_progress f JOIN fyp_publications p ON p.id=f.lesson_id WHERE p.user_id=$1 AND f.liked`);
    const isFollowing = viewerId !== uid && !!(await q('SELECT 1 FROM follows WHERE follower=$1 AND followee=$2', [viewerId, uid])).rows[0];
    const followsYou = viewerId !== uid && !!(await q('SELECT 1 FROM follows WHERE follower=$2 AND followee=$1', [viewerId, uid])).rows[0];
    const pv = await privacy(uid), me = viewerId === uid;
    const youBlocked = !me && !!(await q('SELECT 1 FROM user_blocks WHERE blocker=$1 AND blocked=$2', [viewerId, uid]).catch(() => ({ rows: [] }))).rows[0];
    const out = { userId: uid, username: target.username, name: target.display_name || target.name || target.username, bio: target.bio || '', avatar: target.avatar || null,
      pronouns: target.pronouns || '', website: target.website || '', links: Array.isArray(target.links) ? target.links : [], category: target.category || '',
      followers, following, likes, isFollowing, followsYou, me, youBlocked,
      privacy: me ? pv : { show_reposts: pv.show_reposts, show_liked: pv.show_liked, private_account: pv.private_account, show_following: pv.show_following, allow_dms: pv.allow_dms } };
    if (me) Object.assign(out, { gender: target.gender || '', birthday: target.birthday ? new Date(target.birthday).toISOString().slice(0, 10) : '', usernameChangedAt: target.username_changed_at || null, categories: CATEGORIES.slice(1) });
    return out;
  }
  const postsBy = async uid => (await q('SELECT content FROM fyp_publications WHERE user_id=$1 ORDER BY published_at DESC LIMIT 300', [uid])).rows.map(r => r.content);
  async function contentById(ids) { const all = await ctx.fypContent(); const m = new Map(all.map(x => [x.id, x])); return ids.map(id => m.get(id)).filter(Boolean); }
  const card = x => ({ id: x.id, format: x.format, title: x.title, hook: x.hook, topic: x.topic, media: x.media, ugc: !!x.ugc, author: x.author || null, pinned: !!x.pinned, visibility: x.visibility || 'everyone', allowComments: x.allowComments !== false, allowDownload: x.allowDownload !== false });

  app.get('/api/social/profile/:username?', auth, wrap(async (req, res) => {
    await ensure();
    if (req.params.username && !(await q('SELECT 1 FROM profiles WHERE username=$1', [slug(req.params.username)])).rows[0]) {
      // Older posts carried a guessed handle before the author had a profile: adopt it for that author.
      const owner = (await q(`SELECT user_id FROM fyp_publications WHERE content->'author'->>'username'=$1 ORDER BY published_at LIMIT 1`, [slug(req.params.username)])).rows[0];
      if (owner && !(await q('SELECT 1 FROM profiles WHERE user_id=$1', [owner.user_id])).rows[0]) { const u = (await q('SELECT id,name FROM users WHERE id=$1', [owner.user_id])).rows[0]; if (u) await q('INSERT INTO profiles(user_id,username,display_name) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [u.id, slug(req.params.username), u.name || null]); }
    }
    const target = req.params.username ? (await q(`SELECT p.*,u.name FROM profiles p JOIN users u ON u.id=p.user_id WHERE p.username=$1 AND NOT p.banned`, [slug(req.params.username)])).rows[0]
      : { ...(await ensureProfile(req.user)), name: req.user.name };
    if (!target) return fail(res, 404, 'Account not found');
    if (target.user_id !== req.user.id && (await q('SELECT 1 FROM user_blocks WHERE blocker=$1 AND blocked=$2', [target.user_id, req.user.id]).catch(() => ({ rows: [] }))).rows[0]) return fail(res, 404, 'Account not found');
    const view = await profileView(target, req.user.id), me = view.me;
    const locked = !me && view.privacy.private_account && !view.isFollowing;
    const posts = locked ? [] : (await postsBy(target.user_id)).filter(x => me || !x.visibility || x.visibility === 'everyone' || (x.visibility === 'followers' && view.isFollowing)).map(card);
    const views = posts.length ? (await q(`SELECT lesson_id, count(*)::int n FROM fyp_views WHERE lesson_id = ANY($1) GROUP BY lesson_id`, [posts.map(p => p.id)])).rows : [];
    const vm = new Map(views.map(r => [r.lesson_id, r.n])); posts.forEach(p => p.views = vm.get(p.id) || 0);
    let reposts = null, liked = null, saved = null;
    if (!locked && (me || view.privacy.show_reposts)) reposts = (await contentById((await q('SELECT lesson_id FROM fyp_progress WHERE user_id=$1 AND reposted ORDER BY reposted_at DESC NULLS LAST LIMIT 200', [target.user_id])).rows.map(r => r.lesson_id))).map(card);
    if (!locked && (me || view.privacy.show_liked)) liked = (await contentById((await q('SELECT lesson_id FROM fyp_progress WHERE user_id=$1 AND liked ORDER BY liked_at DESC NULLS LAST LIMIT 200', [target.user_id])).rows.map(r => r.lesson_id))).map(card);
    if (me) saved = (await contentById((await q('SELECT lesson_id FROM fyp_progress WHERE user_id=$1 AND saved LIMIT 200', [target.user_id])).rows.map(r => r.lesson_id))).map(card);
    res.json({ profile: view, locked, posts, reposts, liked, saved });
  }));
  app.put('/api/social/privacy', auth, wrap(async (req, res) => {
    await ensure(); const b = req.body || {}, cur = await privacy(req.user.id), v = { ...cur };
    for (const k of PRIV_BOOL) if (typeof b[k] === 'boolean') v[k] = b[k];
    for (const k of PRIV_SCOPE) if (SCOPES.includes(b[k])) v[k] = b[k];
    if (typeof b.filter_words === 'string') v.filter_words = b.filter_words.replace(/[<>]/g, '').split(',').map(w => w.trim().toLowerCase()).filter(Boolean).slice(0, 50).map(w => w.slice(0, 30)).join(', ');
    const cols = [...PRIV_BOOL, ...PRIV_SCOPE, 'filter_words'];
    await q(`INSERT INTO social_privacy(user_id,${cols.join(',')}) VALUES($1,${cols.map((_, i) => '$' + (i + 2)).join(',')})
      ON CONFLICT(user_id) DO UPDATE SET ${cols.map((c, i) => `${c}=$${i + 2}`).join(',')}`, [req.user.id, ...cols.map(c => v[c])]);
    res.json({ privacy: await privacy(req.user.id) });
  }));
  app.put('/api/social/me', auth, wrap(async (req, res) => {
    await ensure(); const p = await ensureProfile(req.user), b = req.body || {};
    const username = b.username != null ? slug(b.username) : p.username;
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return fail(res, 400, 'Username: 3–20 letters, numbers or _');
    const taken = (await q('SELECT user_id FROM profiles WHERE username=$1', [username])).rows[0]; if (taken && taken.user_id !== req.user.id) return fail(res, 409, 'That username is taken');
    const reserved = ['admin', 'shukr', 'support', 'help', 'official', 'moderator', 'staff', 'system', 'root', 'security', 'api', 'null', 'undefined'];
    if (username !== p.username) {
      if (reserved.some(r => username === r || username.startsWith(r + '_') || username.endsWith('_' + r)) && !ctx.isDeveloper?.(req.user)) return fail(res, 400, 'That username is reserved');
      if (p.username_changed_at && Date.now() - new Date(p.username_changed_at).getTime() < 7 * 86400000) return fail(res, 429, 'You can change your username once every 7 days');
    }
    const clean = (v, n) => String(v).replace(/[<>\u0000-\u001f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
    const name = typeof b.name === 'string' ? clean(b.name, 30) : p.display_name;
    const bio = typeof b.bio === 'string' ? String(b.bio).replace(/[<>\u0000-\u0009\u000b-\u001f\u202a-\u202e]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 150) : p.bio;
    const pronouns = typeof b.pronouns === 'string' ? clean(b.pronouns, 20) : p.pronouns;
    const safeUrl = u => { u = String(u || '').trim(); if (!u) return ''; if (!/^https?:\/\//i.test(u)) u = 'https://' + u; try { const x = new URL(u); if (!['http:', 'https:'].includes(x.protocol) || !x.hostname.includes('.') || u.length > 200) return null; return x.href; } catch { return null; } };
    let website = p.website; if (b.website !== undefined) { website = safeUrl(b.website); if (website === null) return fail(res, 400, 'Enter a valid website link'); }
    let links = p.links || []; if (Array.isArray(b.links)) { links = []; for (const l of b.links.slice(0, 5)) { const url = safeUrl(l && l.url); if (url === null) return fail(res, 400, 'One of your links isn’t valid'); if (url) links.push({ title: clean((l && l.title) || '', 30) || new URL(url).hostname.replace(/^www\./, ''), url }); } }
    const category = typeof b.category === 'string' ? (CATEGORIES.includes(b.category) ? b.category : p.category) : p.category;
    const gender = typeof b.gender === 'string' ? (GENDERS.includes(b.gender) ? b.gender : p.gender) : p.gender;
    let birthday = p.birthday; if (typeof b.birthday === 'string') { if (!b.birthday) birthday = null; else { const d = new Date(b.birthday + 'T00:00:00Z'), age = (Date.now() - d) / 31557600000; if (!/^\d{4}-\d{2}-\d{2}$/.test(b.birthday) || isNaN(d) || age < 13 || age > 120) return fail(res, 400, 'Enter a real birthday (you must be 13 or older)'); birthday = b.birthday; } }
    let avatar; if (b.avatar === null) avatar = ''; else if (typeof b.avatar === 'string') { if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(b.avatar) || b.avatar.length > 400000) return fail(res, 400, 'Profile photo must be a JPG, PNG or WebP under 300 KB'); avatar = b.avatar; }
    await q(`UPDATE profiles SET username=$2, display_name=$3, bio=$4, avatar=CASE WHEN $5::text IS NULL THEN avatar WHEN $5='' THEN NULL ELSE $5 END, pronouns=$6, website=$7, links=$8::jsonb, category=$9, gender=$10, birthday=$11::date,
      username_changed_at=CASE WHEN username<>$2 THEN now() ELSE username_changed_at END WHERE user_id=$1`,
      [req.user.id, username, name || null, bio || null, avatar === undefined ? null : avatar, pronouns || null, website || null, JSON.stringify(links), category || null, gender || null, birthday || null]);
    // Keep the author handle on existing posts in sync.
    await q(`UPDATE fyp_publications SET content=jsonb_set(jsonb_set(content,'{author,username}',to_jsonb($2::text)),'{author,name}',to_jsonb($3::text)) WHERE user_id=$1 AND content ? 'author'`, [req.user.id, username, name || req.user.name || username]);
    res.json({ ok: true });
  }));
  app.post('/api/social/follow/:username', auth, wrap(async (req, res) => {
    await ensure(); await ensureProfile(req.user);
    const t = (await q('SELECT user_id FROM profiles WHERE username=$1 AND NOT banned', [slug(req.params.username)])).rows[0]; if (!t) return fail(res, 404, 'Account not found');
    if (t.user_id === req.user.id) return fail(res, 400, 'You can’t follow yourself');
    if (await blocked(req.user.id, t.user_id)) return fail(res, 403, 'You can’t follow this account');
    const want = req.body?.follow; const ex = !!(await q('SELECT 1 FROM follows WHERE follower=$1 AND followee=$2', [req.user.id, t.user_id])).rows[0];
    const follow = typeof want === 'boolean' ? want : !ex;
    if (follow && !ex) await q('INSERT INTO follows(follower,followee) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.user.id, t.user_id]);
    if (!follow && ex) await q('DELETE FROM follows WHERE follower=$1 AND followee=$2', [req.user.id, t.user_id]);
    const followers = (await q('SELECT count(*)::int n FROM follows WHERE followee=$1', [t.user_id])).rows[0].n;
    res.json({ following: follow, followers });
  }));
  app.post('/api/social/block/:username', auth, wrap(async (req, res) => {
    await ensure(); const t = (await q('SELECT user_id FROM profiles WHERE username=$1', [slug(req.params.username)])).rows[0]; if (!t) return fail(res, 404, 'Account not found');
    if (t.user_id === req.user.id) return fail(res, 400, 'You can’t block yourself');
    const block = req.body?.block !== false;
    if (block) { await q('INSERT INTO user_blocks(blocker,blocked) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.user.id, t.user_id]); await q('DELETE FROM follows WHERE (follower=$1 AND followee=$2) OR (follower=$2 AND followee=$1)', [req.user.id, t.user_id]); }
    else await q('DELETE FROM user_blocks WHERE blocker=$1 AND blocked=$2', [req.user.id, t.user_id]);
    res.json({ blocked: block });
  }));
  app.post('/api/social/report', auth, wrap(async (req, res) => {
    await ensure(); const b = req.body || {};
    if (!['profile', 'post'].includes(b.kind) || typeof b.id !== 'string' || b.id.length > 80 || typeof b.reason !== 'string' || !b.reason.trim() || b.reason.length > 200) return fail(res, 400, 'Invalid report');
    await q('INSERT INTO profile_reports(reporter,kind,target,reason) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [req.user.id, b.kind, b.id, b.reason.trim()]);
    res.json({ ok: true });
  }));
  app.get('/api/social/blocked', auth, wrap(async (req, res) => {
    await ensure(); res.json({ users: (await q(`SELECT p.username, COALESCE(p.display_name,u.name) name, p.avatar FROM user_blocks b JOIN profiles p ON p.user_id=b.blocked JOIN users u ON u.id=p.user_id WHERE b.blocker=$1 ORDER BY b.created_at DESC`, [req.user.id])).rows });
  }));
  app.post('/api/social/remove-follower/:username', auth, wrap(async (req, res) => {
    const t = (await q('SELECT user_id FROM profiles WHERE username=$1', [slug(req.params.username)])).rows[0]; if (!t) return fail(res, 404, 'Account not found');
    await q('DELETE FROM follows WHERE follower=$1 AND followee=$2', [t.user_id, req.user.id]); res.json({ ok: true });
  }));
  app.get('/api/social/username-available', auth, wrap(async (req, res) => {
    const u = slug(req.query.u); if (!/^[a-z0-9_]{3,20}$/.test(u)) return res.json({ ok: false, reason: '3–20 letters, numbers or _' });
    const t = (await q('SELECT user_id FROM profiles WHERE username=$1', [u])).rows[0]; res.json({ ok: !t || t.user_id === req.user.id, reason: t && t.user_id !== req.user.id ? 'Taken' : '' });
  }));
  app.get('/api/social/follows/:username/:kind', auth, wrap(async (req, res) => {
    const t = (await q('SELECT user_id FROM profiles WHERE username=$1', [slug(req.params.username)])).rows[0]; if (!t) return fail(res, 404, 'Account not found');
    if (!['followers', 'following'].includes(req.params.kind)) return fail(res, 400, 'Unknown list');
    if (t.user_id !== req.user.id) { const pv = await privacy(t.user_id); const fol = !!(await q('SELECT 1 FROM follows WHERE follower=$1 AND followee=$2', [req.user.id, t.user_id])).rows[0];
      if ((pv.private_account && !fol) || (req.params.kind === 'following' && !pv.show_following)) return res.json({ users: [], hidden: true }); }
    const followers = req.params.kind === 'followers';
    const rows = (await q(`SELECT p.username, COALESCE(p.display_name,u.name) name, p.avatar, EXISTS(SELECT 1 FROM follows x WHERE x.follower=$2 AND x.followee=p.user_id) is_following, p.user_id=$2 me
      FROM follows f JOIN profiles p ON p.user_id=${followers ? 'f.follower' : 'f.followee'} JOIN users u ON u.id=p.user_id WHERE ${followers ? 'f.followee' : 'f.follower'}=$1 ORDER BY f.created_at DESC LIMIT 300`, [t.user_id, req.user.id])).rows;
    res.json({ users: rows });
  }));
  app.get('/api/social/search-users', auth, wrap(async (req, res) => {
    const s = String(req.query.q || '').toLowerCase().trim().slice(0, 40); if (!s) return res.json({ users: [] });
    const rows = (await q(`SELECT p.username, COALESCE(p.display_name,u.name) name, p.avatar, (SELECT count(*)::int FROM follows f WHERE f.followee=p.user_id) followers,
      EXISTS(SELECT 1 FROM follows x WHERE x.follower=$2 AND x.followee=p.user_id) is_following FROM profiles p JOIN users u ON u.id=p.user_id
      WHERE NOT p.banned AND NOT EXISTS(SELECT 1 FROM user_blocks b WHERE (b.blocker=p.user_id AND b.blocked=$2) OR (b.blocker=$2 AND b.blocked=p.user_id)) AND (p.username LIKE $1 OR lower(COALESCE(p.display_name,u.name,'')) LIKE $1) ORDER BY followers DESC LIMIT 30`, ['%' + s.replace(/[%_]/g, '') + '%', req.user.id])).rows;
    res.json({ users: rows });
  }));
};
module.exports.SCHEMA = SCHEMA;
