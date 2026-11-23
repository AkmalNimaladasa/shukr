// Instagram-style social layer: notifications, people search, user stories (tray/viewer/seen), share-to-DM, profile tags.
const { randomUUID } = require('crypto');
const SCHEMA = [
`CREATE TABLE IF NOT EXISTS notifications (id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, actor INT REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, ref TEXT, text TEXT, read BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
`CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at DESC)`,
`CREATE TABLE IF NOT EXISTS story_views (story_id TEXT, user_id INT, reaction TEXT, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(story_id, user_id))`,
`CREATE TABLE IF NOT EXISTS search_recent (user_id INT, target INT, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(user_id, target))`,
`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio_tags JSONB NOT NULL DEFAULT '[]'::jsonb`
];
module.exports = function socialPlus(ctx) {
  const { app, q, auth, wrap } = ctx;
  let ready = null; const ensure = () => ready || (ready = SCHEMA.reduce((p, s) => p.then(() => q(s)), Promise.resolve()).catch(e => { ready = null; throw e; }));
  const fail = (res, s, e) => res.status(s).json({ error: e });
  const prof = `p.username, COALESCE(p.display_name,u.name) AS name, p.avatar`;
  const blocked = `NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker=$1 AND b.blocked=u.id) OR (b.blocker=u.id AND b.blocked=$1))`;

  // ---- Notifications ----
  ctx.notify = async (userId, actor, kind, ref, text) => { if (!userId || userId === actor) return; try { await ensure();
    await q(`DELETE FROM notifications WHERE user_id=$1 AND actor=$2 AND kind=$3 AND ref IS NOT DISTINCT FROM $4 AND created_at>now()-interval '1 day'`, [userId, actor, kind, ref]);
    await q('INSERT INTO notifications(user_id,actor,kind,ref,text) VALUES($1,$2,$3,$4,$5)', [userId, actor, kind, ref, text]);
    ctx.pushUser?.(userId, { title: 'Shukr', body: text, url: '/#/notifications', tag: 'n-' + kind }).catch(() => {}); } catch {} };
  // Derived events (likes/comments/follows on existing tables) merged with stored ones.
  app.get('/api/notifications', auth, wrap(async (req, res) => { await ensure(); const u = req.user.id;
    const safe = (sql) => q(sql, [u]).then(r => r.rows).catch(e => { console.log('notif', e.message); return []; });
    const derived = [
      ...await safe(`SELECT 'like' kind, f.user_id actor, f.lesson_id ref, NULL text, p.published_at created_at FROM fyp_progress f JOIN fyp_publications p ON p.id=f.lesson_id WHERE p.user_id=$1 AND f.liked AND f.user_id<>$1 LIMIT 100`),
      ...await safe(`SELECT 'comment' kind, c.user_id actor, c.lesson_id ref, c.body text, c.created_at FROM fyp_comments c JOIN fyp_publications p ON p.id=c.lesson_id WHERE p.user_id=$1 AND c.user_id<>$1 AND NOT c.hidden ORDER BY c.created_at DESC LIMIT 100`),
      ...await safe(`SELECT 'follow' kind, f.follower actor, NULL ref, NULL text, f.created_at FROM follows f WHERE f.followee=$1 ORDER BY f.created_at DESC LIMIT 100`)];
    const stored = (await q('SELECT kind, actor, ref, text, created_at, read FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 150', [u])).rows;
    const all = [...stored, ...derived].filter(x => x.actor && x.actor !== u).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 150);
    const ids = [...new Set(all.map(x => x.actor))];
    const people = ids.length ? Object.fromEntries((await q(`SELECT u.id, ${prof}, EXISTS(SELECT 1 FROM follows f WHERE f.follower=$1 AND f.followee=u.id) following FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id = ANY($2::int[])`, [u, ids])).rows.map(r => [r.id, r])) : {};
    const posts = [...new Set(all.filter(x => x.ref && /^(post|story)-/.test(x.ref)).map(x => x.ref))];
    const thumbs = posts.length ? Object.fromEntries((await q(`SELECT id, content->'media' m FROM fyp_publications WHERE id = ANY($1::text[])`, [posts])).rows.map(r => [r.id, r.m?.poster || r.m?.src || r.m?.slides?.[0]?.src || null])) : {};
    const lastSeen = (await q(`SELECT (settings->>'notifSeenAt') s FROM users WHERE id=$1`, [u]).catch(() => ({ rows: [{}] }))).rows[0]?.s;
    res.json({ items: all.map(x => ({ ...x, who: people[x.actor] || null, thumb: thumbs[x.ref] || null, unread: lastSeen ? new Date(x.created_at) > new Date(lastSeen) : true })) }); }));
  app.get('/api/notifications/count', auth, wrap(async (req, res) => { await ensure(); const u = req.user.id;
    const s = (await q(`SELECT (settings->>'notifSeenAt') s FROM users WHERE id=$1`, [u]).catch(() => ({ rows: [{}] }))).rows[0]?.s || '1970-01-01';
    const n = (await q(`SELECT (SELECT count(*) FROM notifications WHERE user_id=$1 AND created_at>$2) + (SELECT count(*) FROM follows WHERE followee=$1 AND created_at>$2)
      + (SELECT count(*) FROM fyp_comments c JOIN fyp_publications p ON p.id=c.lesson_id WHERE p.user_id=$1 AND c.user_id<>$1 AND c.created_at>$2) AS n`, [u, s]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n;
    const dm = (await q(`SELECT count(*)::int n FROM social_messages m JOIN social_conversations c ON c.id=m.conversation_id WHERE (c.starter=$1 OR c.recipient=$1) AND m.sender<>$1 AND m.created_at>COALESCE((SELECT read_at FROM social_reads r WHERE r.conversation_id=c.id AND r.user_id=$1),'1970-01-01')`, [u]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n;
    res.json({ messages: dm,  count: +n }); }));
  app.post('/api/notifications/seen', auth, wrap(async (req, res) => {
    await q(`UPDATE users SET settings = COALESCE(settings,'{}'::jsonb) || jsonb_build_object('notifSeenAt', now()::text) WHERE id=$1`, [req.user.id]); res.json({ ok: true }); }));

  // ---- Search (username + name, ranked; recent searches) ----
  app.get('/api/search/people', auth, wrap(async (req, res) => { await ensure(); const me = req.user.id;
    const t = String(req.query.q || '').trim().replace(/^@/, '').slice(0, 40).toLowerCase();
    if (!t) { const recent = (await q(`SELECT u.id, ${prof} FROM search_recent r JOIN users u ON u.id=r.target LEFT JOIN profiles p ON p.user_id=u.id WHERE r.user_id=$1 ORDER BY r.created_at DESC LIMIT 15`, [me])).rows;
      return res.json({ recent, users: [] }); }
    const users = (await q(`SELECT u.id, ${prof}, (SELECT count(*)::int FROM follows f WHERE f.followee=u.id) followers, EXISTS(SELECT 1 FROM follows f WHERE f.follower=$1 AND f.followee=u.id) following,
      CASE WHEN lower(p.username)=$2 THEN 0 WHEN lower(p.username) LIKE $2||'%' THEN 1 WHEN lower(COALESCE(p.display_name,u.name)) LIKE $2||'%' THEN 2 ELSE 3 END rank
      FROM users u JOIN profiles p ON p.user_id=u.id WHERE NOT p.banned AND u.id<>$1 AND ${blocked}
      AND (lower(p.username) LIKE '%'||$2||'%' OR lower(COALESCE(p.display_name,u.name)) LIKE '%'||$2||'%')
      ORDER BY rank, following DESC, followers DESC LIMIT 30`, [me, t.replace(/[%_]/g, '')])).rows;
    res.json({ users }); }));
  app.post('/api/search/recent', auth, wrap(async (req, res) => { await ensure(); const id = +req.body?.id;
    if (req.body?.clear) await q('DELETE FROM search_recent WHERE user_id=$1', [req.user.id]);
    else if (req.body?.remove) await q('DELETE FROM search_recent WHERE user_id=$1 AND target=$2', [req.user.id, id]);
    else if (id) await q('INSERT INTO search_recent(user_id,target) VALUES($1,$2) ON CONFLICT(user_id,target) DO UPDATE SET created_at=now()', [req.user.id, id]);
    res.json({ ok: true }); }));

  // ---- Stories (users) ----
  const storyRows = async (me, whereSql, args) => (await q(`SELECT s.id, s.user_id, s.caption, s.content, s.created_at, s.expires_at, ${prof},
      EXISTS(SELECT 1 FROM story_views v WHERE v.story_id=s.id AND v.user_id=$1) seen
      FROM social_stories s JOIN users u ON u.id=s.user_id LEFT JOIN profiles p ON p.user_id=s.user_id
      WHERE s.expires_at>now() AND (s.content->>'ugc')='true' AND ${blocked} ${whereSql} ORDER BY s.created_at ASC`, [me, ...args])).rows;
  const group = rows => { const m = new Map(); for (const r of rows) { if (!m.has(r.user_id)) m.set(r.user_id, { userId: r.user_id, username: r.username, name: r.name, avatar: r.avatar, stories: [] });
    m.get(r.user_id).stories.push({ id: r.id, caption: r.caption, media: r.content?.media, format: r.content?.format, createdAt: r.created_at, seen: r.seen }); }
    return [...m.values()].map(g => ({ ...g, allSeen: g.stories.every(s => s.seen) })); };
  app.get('/api/stories/tray', auth, wrap(async (req, res) => { await ensure(); const me = req.user.id;
    const rows = await storyRows(me, `AND (s.user_id=$1 OR s.user_id IN (SELECT followee FROM follows WHERE follower=$1) OR s.user_id IN (SELECT user_id FROM social_stories WHERE expires_at>now() GROUP BY user_id ORDER BY max(created_at) DESC LIMIT 30))`, []);
    const g = group(rows); const mine = g.find(x => x.userId === me) || null;
    const others = g.filter(x => x.userId !== me).sort((a, b) => a.allSeen - b.allSeen || new Date(b.stories.at(-1).createdAt) - new Date(a.stories.at(-1).createdAt));
    res.json({ mine, tray: others }); }));
  app.get('/api/stories/user/:username', auth, wrap(async (req, res) => { await ensure();
    const rows = await storyRows(req.user.id, 'AND lower(p.username)=lower($2)', [req.params.username]); res.json({ group: group(rows)[0] || null }); }));
  app.post('/api/stories/:id/seen', auth, wrap(async (req, res) => { await ensure(); const r = typeof req.body?.reaction === 'string' && ['❤️', '🤲', '😂', '😮', '😢', '🔥'].includes(req.body.reaction) ? req.body.reaction : null;
    await q(`INSERT INTO story_views(story_id,user_id,reaction) VALUES($1,$2,$3) ON CONFLICT(story_id,user_id) DO UPDATE SET reaction=COALESCE(EXCLUDED.reaction,story_views.reaction)`, [req.params.id, req.user.id, r]);
    if (r) { const s = (await q('SELECT user_id FROM social_stories WHERE id=$1', [req.params.id])).rows[0]; if (s) ctx.notify(s.user_id, req.user.id, 'story-react', req.params.id, `reacted ${r} to your story`); }
    res.json({ ok: true }); }));
  app.get('/api/stories/:id/viewers', auth, wrap(async (req, res) => { await ensure();
    const s = (await q('SELECT user_id FROM social_stories WHERE id=$1', [req.params.id])).rows[0]; if (!s || s.user_id !== req.user.id) return fail(res, 404, 'Not found');
    res.json({ viewers: (await q(`SELECT u.id, ${prof}, v.reaction, v.created_at FROM story_views v JOIN users u ON u.id=v.user_id LEFT JOIN profiles p ON p.user_id=u.id WHERE v.story_id=$1 AND v.user_id<>$2 ORDER BY v.created_at DESC`, [req.params.id, req.user.id])).rows }); }));
  app.delete('/api/stories/:id', auth, wrap(async (req, res) => { await q('DELETE FROM social_stories WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]); res.json({ ok: true }); }));
  app.get('/api/stories/has', auth, wrap(async (req, res) => { const names = String(req.query.u || '').split(',').slice(0, 60).map(x => x.toLowerCase());
    res.json({ users: (await q(`SELECT DISTINCT lower(p.username) u FROM social_stories s JOIN profiles p ON p.user_id=s.user_id WHERE s.expires_at>now() AND lower(p.username)=ANY($1::text[])`, [names])).rows.map(r => r.u) }); }));

  // ---- Share a post/story/listing to DMs ----
  ctx.openDm = async (a, b) => { const c = (await q('SELECT id FROM social_conversations WHERE (starter=$1 AND recipient=$2) OR (starter=$2 AND recipient=$1)', [a, b])).rows[0]; if (c) return c.id;
    const following = (await q('SELECT 1 FROM follows WHERE follower=$1 AND followee=$2', [b, a])).rows[0];
    const id = 'dm-' + randomUUID(); await q('INSERT INTO social_conversations(id,starter,recipient,accepted) VALUES($1,$2,$3,$4)', [id, a, b, !!following]); return id; };
  ctx.sendDm = async (cid, sender, { kind, body, media }) => { await ctx.richMessages?.(); const id = 'msg-' + randomUUID();
    await q('INSERT INTO social_messages(id,conversation_id,sender,body,kind,media) VALUES($1,$2,$3,$4,$5,$6)', [id, cid, sender, body || '', kind, media ? JSON.stringify(media) : null]); return id; };
  // Reshare a post into your own 24h story (Instagram "Add post to your story"), crediting the original creator.
  app.post('/api/stories/reshare', auth, wrap(async (req, res) => { await ensure(); const me = req.user.id, postId = String(req.body?.postId || '').slice(0, 120);
    const pub = (await q("SELECT p.id, p.user_id, p.content, pr.username FROM fyp_publications p LEFT JOIN profiles pr ON pr.user_id=p.user_id WHERE p.id=$1 AND COALESCE(p.content->>'visibility','everyone')='everyone'", [postId])).rows[0];
    if (!pub) return fail(res, 404, 'That post can’t be shared.');
    const recent = (await q("SELECT count(*)::int n FROM social_stories WHERE user_id=$1 AND created_at>now()-interval '1 hour'", [me])).rows[0].n; if (recent >= 30) return fail(res, 429, 'Too many stories — try again later.');
    const c = pub.content || {}, m = c.media || {}; const src = m.src || m.slides?.[0]?.src; if (!src) return fail(res, 400, 'That post has no media.');
    const id = 'story-' + require('crypto').randomUUID();
    const content = { id, ugc: true, format: c.format === 'reel' || /\.mp4|video/.test(String(m.mime || src)) ? 'reel' : 'image', media: { ...m, src, slides: undefined }, title: c.title || 'Shared post', hook: c.hook || '', reshare: { postId: pub.id, username: pub.username || null } };
    await q('INSERT INTO social_stories(id,user_id,lesson_id,caption,content) VALUES($1,$2,$3,$4,$5)', [id, me, pub.id, String(req.body?.caption || '').slice(0, 200) || (pub.username ? '@' + pub.username : 'Shared post'), JSON.stringify(content)]);
    if (pub.user_id && pub.user_id !== me) ctx.notify?.(pub.user_id, me, 'mention', pub.id, 'shared your post to their story.');
    res.status(201).json({ ok: true, id });
  }));
  app.get('/api/share/targets', auth, wrap(async (req, res) => { const me = req.user.id;
    res.json({ users: (await q(`SELECT u.id, ${prof} FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.id<>$1 AND ${blocked} AND (u.id IN (SELECT CASE WHEN starter=$1 THEN recipient ELSE starter END FROM social_conversations WHERE starter=$1 OR recipient=$1)
      OR u.id IN (SELECT followee FROM follows WHERE follower=$1) OR u.id IN (SELECT follower FROM follows WHERE followee=$1)) LIMIT 60`, [me])).rows }); }));
  app.post('/api/share/dm', auth, wrap(async (req, res) => { const me = req.user.id, to = (Array.isArray(req.body?.to) ? req.body.to : []).map(Number).filter(Boolean).slice(0, 15), postId = String(req.body?.postId || '');
    if (!to.length) return fail(res, 400, 'Choose who to send to.');
    let card = null;
    const pub = (await q('SELECT id, content FROM fyp_publications WHERE id=$1', [postId])).rows[0] || (await q('SELECT id, content FROM social_stories WHERE id=$1 AND expires_at>now()', [postId])).rows[0];
    const lesson = pub ? pub.content : (ctx.fypContent ? (await ctx.fypContent()).find?.(x => x.id === postId) : null);
    if (!lesson) return fail(res, 404, 'Post not found.');
    const m = lesson.media || {}; card = { id: lesson.id, title: String(lesson.title || '').slice(0, 120), format: lesson.format, thumb: m.poster || m.src || m.slides?.[0]?.src || lesson.image || null, author: lesson.author?.username || lesson.author?.handle || 'shukr', story: /^story-/.test(lesson.id) };
    const text = String(req.body?.text || '').slice(0, 500);
    for (const uid of to) { if ((await q(`SELECT 1 FROM user_blocks WHERE (blocker=$1 AND blocked=$2) OR (blocker=$2 AND blocked=$1)`, [me, uid]).catch(() => ({ rows: [] }))).rows[0]) continue;
      const cid = await ctx.openDm(me, uid); await ctx.sendDm(cid, me, { kind: 'post', body: 'Shared a post', media: card }); if (text) await ctx.sendDm(cid, me, { kind: 'text', body: text });
      ctx.pushUser?.(uid, { title: 'Shukr', body: 'Sent you a post', url: '/#/messages?id=' + encodeURIComponent(cid), tag: 'dm-' + cid }).catch(() => {}); }
    res.json({ ok: true, sent: to.length }); }));

  // ---- Profile tags (bio @mentions) + tagged posts ----
  app.get('/api/social/tagged/:username', auth, wrap(async (req, res) => {
    res.json({ posts: (await q(`SELECT content FROM fyp_publications WHERE content->'tags' ? lower($1) AND (COALESCE(content->>'visibility','everyone')='everyone' OR lower($1)=(SELECT lower(username) FROM profiles WHERE user_id=$2)) ORDER BY published_at DESC LIMIT 60`, [req.params.username, req.user.id])).rows.map(r => r.content) }); }));
  // Notify tagged users after a post is created (wrap the existing route by observing new rows).
  ctx.onPublished = async (content, userId) => { for (const t of content.tags || []) { const r = (await q('SELECT user_id FROM profiles WHERE username=$1', [t])).rows[0]; if (r) ctx.notify(r.user_id, userId, 'tag', content.id, 'tagged you in a post'); } };
};
