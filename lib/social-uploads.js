// User-generated posts: photo/video uploads (gallery or camera) published into the Social feed.
// Media is stored in the app's private S3 bucket when configured (local ./.uploads otherwise) and
// streamed back through /ugc/<file> with HTTP Range support so iOS can play videos.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const TYPES = {
  'image/jpeg': ['jpg', 'image'], 'image/png': ['png', 'image'], 'image/webp': ['webp', 'image'], 'image/gif': ['gif', 'image'],
  'video/mp4': ['mp4', 'video'], 'video/quicktime': ['mov', 'video'], 'video/webm': ['webm', 'video'],
  // voiceover clips recorded inside the editor (never shown as posts on their own)
  'audio/webm': ['weba', 'audio'], 'audio/mp4': ['m4a', 'audio'], 'audio/ogg': ['ogg', 'audio']
};
const LIMITS = { image: 15 * 1024 * 1024, video: 120 * 1024 * 1024, audio: 20 * 1024 * 1024 };
const MIME_BY_EXT = { ...Object.fromEntries(Object.entries(TYPES).map(([m, [e]]) => [e, m])), mp3: 'audio/mpeg' };
const FILE_RE = /^[a-f0-9-]{36}\.(jpg|png|webp|gif|mp4|mov|webm|mp3|weba|m4a|ogg)$/; // mp3 = server-rendered nasheeds only (never user-uploaded)

// Verify the bytes really are what the Content-Type claims (no HTML/SVG/script smuggling).
function sniff(buf) {
  const h = buf.subarray(0, 16), s = (a, b) => h.subarray(a, b).toString('latin1');
  if (h[0] === 0xFF && h[1] === 0xD8 && h[2] === 0xFF) return 'image/jpeg';
  if (h[0] === 0x89 && s(1, 4) === 'PNG') return 'image/png';
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP') return 'image/webp';
  if (s(0, 4) === 'GIF8') return 'image/gif';
  if (h[0] === 0x1A && h[1] === 0x45 && h[2] === 0xDF && h[3] === 0xA3) return 'video/webm';
  if (s(0, 4) === 'OggS') return 'audio/ogg';
  if (s(4, 8) === 'ftyp') return s(8, 10) === 'qt' ? 'video/quicktime' : 'video/mp4';
  return null;
}
const compatible = (claimed, actual) => claimed === actual || (TYPES[claimed]?.[1] === 'video' && TYPES[actual]?.[1] === 'video' && actual !== 'video/webm' && claimed !== 'video/webm')
  || (claimed === 'audio/webm' && actual === 'video/webm') || (claimed === 'audio/mp4' && actual === 'video/mp4');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS social_media (
 id TEXT PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 file TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, mime TEXT NOT NULL, bytes INT NOT NULL,
 width INT, height INT, duration_ms INT, used BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS social_media_user ON social_media(user_id, created_at);
`;

module.exports = function registerSocialUploads(ctx) {
  const { app, q, auth, wrap } = ctx;
  const s3 = ctx.s3 || null, bucket = process.env.S3_BUCKET;
  const dir = ctx.uploadDir || path.join(__dirname, '..', '.uploads');
  const err = (res, status, error) => res.status(status).json({ error });
  const clean = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : '';
  let ready = null;
  const ensure = () => ready || (ready = SCHEMA.split(';').map(x => x.trim()).filter(Boolean).reduce((p, sql) => p.then(() => q(sql)), Promise.resolve()).catch(e => { ready = null; throw e; }));

  async function put(file, tmp, mime, bytes) {
    if (s3) {
      const { PutObjectCommand } = require('@aws-sdk/client-s3');
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: 'ugc/' + file, Body: fs.createReadStream(tmp), ContentLength: bytes, ContentType: mime }));
      await fsp.unlink(tmp).catch(() => {});
    } else {
      await fsp.mkdir(dir, { recursive: true });
      await fsp.rename(tmp, path.join(dir, file)).catch(async () => { await fsp.copyFile(tmp, path.join(dir, file)); await fsp.unlink(tmp); });
    }
  }
  // Shared helpers for server-generated media (e.g. voice-only nasheeds).
  ctx.storeUgcFile = async (file, buf, mime) => { if (!FILE_RE.test(file)) throw new Error('bad file name'); const tmp = path.join(os.tmpdir(), 'ugc-' + randomUUID()); await fsp.writeFile(tmp, buf); await put(file, tmp, mime, buf.length); };
  ctx.removeUgcFile = file => FILE_RE.test(file) ? remove(file) : null;
  ctx.readUgcToFile = async (file, dest) => { if (!FILE_RE.test(file)) throw new Error('bad file name');
    if (s3) { const { GetObjectCommand } = require('@aws-sdk/client-s3'); const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: 'ugc/' + file }));
      await new Promise((ok, bad) => r.Body.pipe(fs.createWriteStream(dest)).on('finish', ok).on('error', bad)); }
    else await fsp.copyFile(path.join(dir, file), dest); };
  async function remove(file) {
    try {
      if (s3) { const { DeleteObjectCommand } = require('@aws-sdk/client-s3'); await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: 'ugc/' + file })); }
      else await fsp.unlink(path.join(dir, file));
    } catch {}
  }

  // Raw-body upload: POST /api/social/media with Content-Type = the file's MIME type.
  app.post('/api/social/media', auth, wrap(async (req, res) => {
    await ensure();
    const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!TYPES[mime]) return err(res, 415, 'Upload a photo (JPG, PNG, WebP, GIF) or a video (MP4, MOV, WebM).');
    if (TYPES[mime][1] === 'audio' && req.headers['x-media-purpose'] !== 'voiceover') return err(res, 415, 'Upload a photo or a video.');
    const [ext, kind] = TYPES[mime], limit = LIMITS[kind];
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > limit) return err(res, 413, kind === 'video' ? 'Videos can be up to 120 MB.' : 'Photos can be up to 15 MB.');
    const p = (await q('SELECT banned FROM profiles WHERE user_id=$1', [req.user.id])).rows[0];
    if (p?.banned) return err(res, 403, 'Your account cannot post right now.');
    const recent = (await q("SELECT count(*)::int n FROM social_media WHERE user_id=$1 AND created_at>now()-interval '1 hour'", [req.user.id])).rows[0].n;
    if (recent >= 40) return err(res, 429, 'Upload limit reached. Try again in an hour.');
    const id = randomUUID(), file = `${id}.${ext}`, tmp = path.join(os.tmpdir(), 'shukr-up-' + file);
    let bytes = 0, head = Buffer.alloc(0), tooBig = false;
    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(tmp);
      req.on('data', c => { bytes += c.length; if (head.length < 16) head = Buffer.concat([head, c]).subarray(0, 16); if (bytes > limit && !tooBig) { tooBig = true; req.unpipe(out); out.end(); req.resume(); } });
      req.on('error', reject); out.on('error', reject); out.on('finish', resolve); req.on('end', () => { if (tooBig) resolve(); });
      req.pipe(out);
    });
    const fail = async (s, m) => { await fsp.unlink(tmp).catch(() => {}); return err(res, s, m); };
    if (tooBig) return fail(413, kind === 'video' ? 'Videos can be up to 120 MB.' : 'Photos can be up to 15 MB.');
    if (bytes < 32) return fail(400, 'That file is empty.');
    const actual = sniff(head);
    if (!actual || !compatible(mime, actual)) return fail(415, 'That file doesn’t look like a supported photo or video.');
    const w = +req.headers['x-media-width'] || null, h = +req.headers['x-media-height'] || null, d = +req.headers['x-media-duration'] || null;
    if (kind === 'video' && d && d > 181000) return fail(400, 'Videos can be up to 3 minutes long.');
    await put(file, tmp, mime, bytes);
    await q('INSERT INTO social_media(id,user_id,file,kind,mime,bytes,width,height,duration_ms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [id, req.user.id, file, kind, mime, bytes, w && w < 20000 ? Math.round(w) : null, h && h < 20000 ? Math.round(h) : null, d ? Math.round(d) : null]);
    res.status(201).json({ media: { id, kind, mime, url: '/ugc/' + file, width: w, height: h } });
  }));

  // Stream media with Range support. Files are unguessable UUIDs; posts are public within the app.
  app.get('/ugc/:file', wrap(async (req, res) => {
    const file = req.params.file;
    if (!FILE_RE.test(file)) return res.status(404).end();
    const mime = MIME_BY_EXT[file.split('.').pop()];
    res.setHeader('Content-Type', mime); res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (s3) {
      const { GetObjectCommand } = require('@aws-sdk/client-s3');
      let r;
      try { r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: 'ugc/' + file, ...(range ? { Range: req.headers.range } : {}) })); }
      catch (e) { const st = e?.$metadata?.httpStatusCode; return res.status(st === 416 ? 416 : 404).end(); }
      if (r.ContentRange) { res.status(206); res.setHeader('Content-Range', r.ContentRange); }
      if (r.ContentLength != null) res.setHeader('Content-Length', r.ContentLength);
      r.Body.on('error', () => res.destroy()); r.Body.pipe(res); return;
    }
    const full = path.join(dir, file); let st;
    try { st = await fsp.stat(full); } catch { return res.status(404).end(); }
    let start = 0, end = st.size - 1;
    if (range) {
      if (range[1] === '' && range[2] !== '') { start = Math.max(0, st.size - +range[2]); }
      else { start = +range[1] || 0; if (range[2] !== '') end = Math.min(end, +range[2]); }
      if (start > end || start >= st.size) { res.setHeader('Content-Range', `bytes */${st.size}`); return res.status(416).end(); }
      res.status(206); res.setHeader('Content-Range', `bytes ${start}-${end}/${st.size}`);
    }
    res.setHeader('Content-Length', end - start + 1);
    fs.createReadStream(full, { start, end }).pipe(res);
  }));

  const author = async user => {
    if (ctx.ensureProfile) { try { await ctx.ensureProfile(user); } catch {} }
    const p = (await q('SELECT username,display_name FROM profiles WHERE user_id=$1', [user.id])).rows[0];
    const name = p?.display_name || user.name || 'Shukr member';
    return { userId: user.id, name, username: p?.username || (name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'member') };
  };

  // Publish: 1 video → reel; 1 photo → image; 2–10 photos → carousel. kind=story expires in 24h.
  app.post('/api/social/posts', auth, wrap(async (req, res) => {
    await ensure();
    const b = req.body || {}, ids = Array.isArray(b.mediaIds) ? b.mediaIds.filter(x => typeof x === 'string').slice(0, 11) : [];
    const caption = clean(b.caption, 2200), kind = b.kind === 'story' ? 'story' : 'post', poster = typeof b.posterId === 'string' ? b.posterId : null;
    const topic = ['quran', 'sunnah', 'character', 'wellbeing', 'learning', 'world'].includes(b.topic) ? b.topic : 'wellbeing';
    if (!ids.length) return err(res, 400, 'Add a photo or video first.');
    if (ids.length > 10) return err(res, 400, 'Up to 10 photos per post.');
    if (b.rightsConfirmed !== true) return err(res, 400, 'Confirm this is your own content.');
    const p = (await q('SELECT banned FROM profiles WHERE user_id=$1', [req.user.id])).rows[0];
    if (p?.banned) return err(res, 403, 'Your account cannot post right now.');
    const recent = (await q("SELECT count(*)::int n FROM fyp_publications WHERE user_id=$1 AND published_at>now()-interval '1 hour'", [req.user.id])).rows[0].n;
    if (recent >= 20) return err(res, 429, 'You’re posting a lot. Try again in a little while.');
    const rows = (await q('SELECT * FROM social_media WHERE user_id=$1 AND id = ANY($2::text[])', [req.user.id, [...ids, ...(poster ? [poster] : [])]])).rows;
    const media = ids.map(id => rows.find(r => r.id === id));
    if (media.some(m => !m)) return err(res, 400, 'One of those uploads was not found. Try uploading again.');
    if (media.some(m => m.kind === 'audio')) return err(res, 400, 'Add a photo or video to post.');
    const videos = media.filter(m => m.kind === 'video');
    if (videos.length && media.length > 1) return err(res, 400, 'Post one video at a time, or up to 10 photos.');
    const posterRow = poster ? rows.find(r => r.id === poster && r.kind === 'image') : null;
    const url = m => '/ugc/' + m.file, who = await author(req.user);
    const title = clean(b.title, 120) || caption.split('\n')[0].slice(0, 90) || (videos.length ? 'New video' : 'New post');
    const mediaJson = videos.length
      ? { src: url(videos[0]), poster: posterRow ? url(posterRow) : null, alt: title, durationSeconds: videos[0].duration_ms ? Math.round(videos[0].duration_ms / 1000) : null, width: videos[0].width, height: videos[0].height, ugc: true }
      : media.length > 1 ? { slides: media.map((m, i) => ({ src: url(m), alt: `${title} (${i + 1}/${media.length})` })), ugc: true }
        : { src: url(media[0]), alt: title, width: media[0].width, height: media[0].height, ugc: true };
    const format = videos.length ? 'reel' : media.length > 1 ? 'carousel' : 'image';
    const id = (kind === 'story' ? 'story-' : 'post-') + randomUUID();
    const content = { id, ugc: true, format, media: mediaJson, topic, title, hook: caption, body: caption, takeaway: '', sources: [], quiz: null,
      author: who, authorId: req.user.id, publishedAt: new Date().toISOString(), durationSeconds: mediaJson.durationSeconds || 20 };
    // People tags (+ @mentions in caption) → resolved to real usernames.
    const tagNames = [...new Set([...(Array.isArray(b.tags) ? b.tags : []), ...(caption.match(/@([a-z0-9_.]{2,30})/gi) || []).map(x => x.slice(1))].map(x => String(x).replace(/^@/, '').toLowerCase()).filter(Boolean))].slice(0, 20);
    if (tagNames.length) content.tags = (await q('SELECT user_id,username FROM profiles WHERE lower(username) = ANY($1::text[]) AND NOT banned AND user_id<>$2', [tagNames, req.user.id])).rows.map(r => r.username);
    await q('UPDATE social_media SET used=true WHERE user_id=$1 AND id = ANY($2::text[])', [req.user.id, rows.map(r => r.id)]);
    if (kind === 'story') {
      await q('INSERT INTO social_stories(id,user_id,lesson_id,caption,content) VALUES($1,$2,$3,$4,$5)', [id, req.user.id, id, caption || title, JSON.stringify(content)]);
      return res.status(201).json({ story: { id, caption: caption || title, content } });
    }
    await q('INSERT INTO fyp_publications(id,user_id,content) VALUES($1,$2,$3)', [id, req.user.id, JSON.stringify(content)]);
    ctx.onPublished?.(content, req.user.id).catch(() => {});
    res.status(201).json({ publication: content });
  }));

  app.get('/api/social/mine', auth, wrap(async (req, res) => {
    const posts = (await q('SELECT content FROM fyp_publications WHERE user_id=$1 ORDER BY published_at DESC LIMIT 200', [req.user.id])).rows.map(r => r.content);
    res.json({ posts, author: await author(req.user) });
  }));

  // Edit your own post: caption, topic, cover, visibility, comments, pin. Media itself can't be swapped (keeps
  // likes/views honest) — to replace the video, delete and re-post.
  app.put('/api/social/posts/:id', auth, wrap(async (req, res) => {
    await ensure(); const id = String(req.params.id || ''); if (id.length > 80) return err(res, 400, 'Invalid post.');
    const row = (await q('SELECT user_id,content FROM fyp_publications WHERE id=$1', [id])).rows[0];
    if (!row) return err(res, 404, 'Post not found.'); if (row.user_id !== req.user.id) return err(res, 403, 'You can only edit your own posts.');
    const b = req.body || {}, c = { ...row.content };
    if (typeof b.caption === 'string') { const cap = clean(b.caption, 2200); c.hook = cap; c.body = cap; c.title = clean(b.title, 120) || cap.split('\n')[0].slice(0, 90) || c.title; }
    if (['quran', 'sunnah', 'character', 'wellbeing', 'learning', 'world'].includes(b.topic)) c.topic = b.topic;
    if (['everyone', 'followers', 'private'].includes(b.visibility)) c.visibility = b.visibility;
    if (typeof b.allowComments === 'boolean') c.allowComments = b.allowComments;
    if (typeof b.allowDownload === 'boolean') c.allowDownload = b.allowDownload;
    if (typeof b.pinned === 'boolean') {
      if (b.pinned && (await q(`SELECT count(*)::int n FROM fyp_publications WHERE user_id=$1 AND content->>'pinned'='true' AND id<>$2`, [req.user.id, id])).rows[0].n >= 3) return err(res, 400, 'You can pin up to 3 posts.');
      c.pinned = b.pinned;
    }
    if (typeof b.posterId === 'string' && c.format === 'reel') {
      const pr = (await q(`SELECT file FROM social_media WHERE id=$1 AND user_id=$2 AND kind='image'`, [b.posterId, req.user.id])).rows[0];
      if (!pr) return err(res, 400, 'Cover image not found.'); c.media = { ...c.media, poster: '/ugc/' + pr.file };
      await q('UPDATE social_media SET used=true WHERE id=$1', [b.posterId]);
    }
    if (typeof b.coverTime === 'number' && c.format === 'reel') c.media = { ...c.media, coverTime: Math.max(0, Math.min(600, b.coverTime)) };
    c.editedAt = new Date().toISOString();
    await q('UPDATE fyp_publications SET content=$2 WHERE id=$1', [id, JSON.stringify(c)]);
    res.json({ publication: c });
  }));
  app.delete('/api/social/posts/:id', auth, wrap(async (req, res) => {
    const id = req.params.id; if (typeof id !== 'string' || id.length > 80) return err(res, 400, 'Invalid post.');
    const row = (await q('SELECT user_id,content FROM fyp_publications WHERE id=$1', [id])).rows[0]
      || (await q('SELECT user_id,content FROM social_stories WHERE id=$1', [id])).rows[0];
    if (!row) return err(res, 404, 'Post not found.');
    const admin = (await q('SELECT is_admin FROM profiles WHERE user_id=$1', [req.user.id])).rows[0]?.is_admin;
    if (row.user_id !== req.user.id && !admin) return err(res, 403, 'You can only delete your own posts.');
    await q('DELETE FROM fyp_publications WHERE id=$1', [id]); await q('DELETE FROM social_stories WHERE id=$1', [id]);
    const m = row.content?.media || {}, files = [m.src, m.poster, ...(m.slides || []).map(s => s.src)].filter(s => typeof s === 'string' && s.startsWith('/ugc/')).map(s => s.slice(5));
    if (files.length) { await q('DELETE FROM social_media WHERE user_id=$1 AND file = ANY($2::text[])', [row.user_id, files]); for (const f of files) await remove(f); }
    res.json({ ok: true });
  }));
  ctx.socialUploadsReady = ensure;
};
module.exports.SCHEMA = SCHEMA;
module.exports.sniff = sniff;
