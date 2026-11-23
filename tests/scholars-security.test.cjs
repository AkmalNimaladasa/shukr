// Scholars, breach alerts, post editing — end-to-end against an embedded PGlite DB.
const test = require('node:test'); const assert = require('node:assert'); const path = require('node:path'); const fs = require('node:fs'); const os = require('node:os');
const express = require('express');
const { PGlite } = require('@electric-sql/pglite');
let db, app, server, base, USERS = {};
const ADMIN = 'dev@shukr.test';
async function api(p, { user, method, body, raw, type } = {}) {
  const headers = { Origin: base, 'x-test-user': String(user || '') };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (raw) headers['Content-Type'] = type;
  const r = await fetch(base + p, { method: method || (body !== undefined || raw ? 'POST' : 'GET'), headers, body: raw || (body !== undefined ? JSON.stringify(body) : undefined) });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
test.before(async () => {
  process.env.ADMIN_EMAILS = ADMIN; delete process.env.PAYHERE_MERCHANT_ID;
  db = new PGlite(); const q = (s, p) => db.query(s, p);
  await db.exec(`CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT UNIQUE, name TEXT, pass TEXT, settings JSONB DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id INT, created_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE profiles (user_id INT PRIMARY KEY, username TEXT UNIQUE, display_name TEXT, bio TEXT, avatar TEXT, private BOOLEAN DEFAULT false, is_admin BOOLEAN DEFAULT false, banned BOOLEAN DEFAULT false);
    CREATE TABLE follows (follower INT, followee INT, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(follower,followee));
    CREATE TABLE fyp_publications (id TEXT PRIMARY KEY, user_id INT, content JSONB, published_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE social_stories (id TEXT PRIMARY KEY, user_id INT, lesson_id TEXT, caption TEXT, content JSONB);
    CREATE TABLE fyp_views (user_id INT, lesson_id TEXT, started_at TIMESTAMPTZ DEFAULT now(), watched_ms INT DEFAULT 0);`);
  for (const [id, email, name] of [[1, ADMIN, 'Dev'], [2, 'shaykh@x.io', 'Yusuf Ahmed'], [3, 'member@x.io', 'Aisha'], [4, 'teacher@x.io', 'Bilal']]) { await q('INSERT INTO users(id,email,name,pass) VALUES($1,$2,$3,$4)', [id, email, name, 'x']); USERS[id] = { id, email, name }; }
  await q("SELECT setval('users_id_seq', 10)");
  app = express(); app.use((req, res, next) => req.path === '/api/scholar/docs' ? next() : express.json()(req, res, next));
  const auth = (req, res, next) => { const u = USERS[req.headers['x-test-user']]; if (!u) return res.status(401).json({ error: 'auth' }); req.user = u; next(); };
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(e => { console.error(e); res.status(500).json({ error: e.message }); });
  const sec = require('../lib/security')(app, {}); sec.bodyRules();
  const pushes = []; const ctx = { app, q, auth, wrap, sec, pushUser: async (uid, p) => pushes.push([uid, p]), hashPass: p => 'h' + p, newSession: async () => {}, defaultSettings: () => ({}), uploadDir: fs.mkdtempSync(path.join(os.tmpdir(), 'shk')) };
  ctx.pushes = pushes; app.locals.ctx = ctx;
  require('../lib/social-uploads')(ctx); require('../lib/monetize')(ctx); require('../lib/breach-watch')(ctx); require('../lib/scholars')(ctx);
  await new Promise(r => { server = app.listen(0, r); }); base = 'http://127.0.0.1:' + server.address().port;
});
test.after(async () => { server && server.close(); setTimeout(() => process.exit(0), 200).unref(); });

test('scholar: application cannot be submitted without credentials; verify needs every check', async () => {
  assert.equal((await api('/api/scholar/apply', { user: 2, body: { fullName: 'Yusuf Ahmed', tier: 'mufti' } })).status, 200);
  const sub = await api('/api/scholar/submit', { user: 2, body: {} }); assert.equal(sub.status, 400); assert.match(sub.data.error, /government ID/);
  await api('/api/scholar/me', { user: 2, method: 'PUT', body: { title: 'Mufti', madhhab: 'Hanafi', specialties: ['Finance & business'], qualifications: [{ title: 'Alimiyyah', institution: 'Darul Uloom', year: '2012', registrar: 'registrar@du.edu' }], references: [{ name: 'Shaykh A', contact: 'a@x' }, { name: 'Shaykh B', contact: 'b@x' }], ifta: { programme: 'Takhassus fil-Ifta', institution: 'Darul Uloom' }, rate_text_usd: 25, rate_call_usd: 60 } });
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(400, 32)]);
  for (const k of ['id', 'degree', 'ifta']) assert.equal((await api('/api/scholar/docs?kind=' + k, { user: 2, raw: pdf, type: 'application/pdf' })).status, 200);
  assert.equal((await api('/api/scholar/docs?kind=id', { user: 2, raw: Buffer.from('<html><script>x</script>' + ' '.repeat(300)), type: 'text/html' })).status, 415, 'non-document rejected');
  assert.equal((await api('/api/scholar/submit', { user: 2, body: {} })).status, 200);
  assert.equal((await api('/api/admin/scholars', { user: 3 })).status, 403, 'members cannot see applications');
  const half = await api('/api/admin/scholars/2', { user: 1, body: { action: 'verify', tier: 'mufti', checks: { idMatches: true, institutionConfirmed: true } } }); assert.equal(half.status, 400);
  assert.equal((await api('/api/admin/scholars/2', { user: 1, body: { action: 'verify', tier: 'mufti', checks: { idMatches: true, institutionConfirmed: true, referencesContacted: true, interviewPassed: true, iftaConfirmed: true } } })).status, 200);
  const list = (await api('/api/scholars', { user: 3 })).data.scholars; assert.equal(list.length, 1); assert.equal(list[0].tier, 'mufti');
  assert.ok(!JSON.stringify(list).includes('registrar@du.edu'), 'private verification contacts never public');
});
test('fatwas: only verified muftis; evidence required; teachers cannot publish', async () => {
  assert.equal((await api('/api/fatwas', { user: 3, body: { question: 'Is X permissible in Islam?', answer: 'a'.repeat(100), evidence: [{ type: 'quran', ref: '2:275' }] } })).status, 403);
  assert.equal((await api('/api/fatwas', { user: 2, body: { question: 'Is X permissible in Islam?', answer: 'a'.repeat(100), evidence: [] } })).status, 400);
  const f = await api('/api/fatwas', { user: 2, body: { question: 'Is trading currencies on deferred settlement allowed?', answer: 'It is not permissible to sell currencies by deferred sale... '.repeat(3), evidence: [{ type: 'scholar', ref: 'IIFA Resolution 102 (5/11)' }], topic: 'Finance' } });
  assert.equal(f.status, 200);
  assert.equal((await api('/api/fatwas?q=currencies', { user: 3 })).data.fatwas.length, 1);
});
test('consultations: member pays scholar price; scholar gets 80%; commission never shown to members', async () => {
  const c = await api('/api/consultations', { user: 3, body: { scholarId: 2, kind: 'text', question: 'I have a question about my business partnership and profit sharing.' } });
  assert.equal(c.status, 200); assert.equal(c.data.price, 25); assert.ok(!('commission' in c.data) && !('scholarReceives' in c.data), 'no commission leak to members');
  const mv = (await api(`/api/consultations/${c.data.id}`, { user: 3 })).data; assert.ok(!JSON.stringify(mv).includes('scholar_usd'), 'member view hides scholar payout');
  assert.equal((await api(`/api/consultations/${c.data.id}/messages`, { user: 2, body: { body: 'Answer' } })).status, 400, 'no answer before payment');
  assert.equal((await api('/api/pay/demo/complete', { user: 3, body: { orderId: c.data.checkout.orderId } })).status, 403, 'members cannot fake payment in demo');
  await db.query("UPDATE payments SET user_id=1 WHERE order_id=$1", [c.data.checkout.orderId]);
  assert.equal((await api('/api/pay/demo/complete', { user: 1, body: { orderId: c.data.checkout.orderId } })).status, 200);
  assert.equal((await api(`/api/consultations/${c.data.id}`, { user: 4 })).status, 404, 'strangers cannot read a consultation');
  assert.equal((await api(`/api/consultations/${c.data.id}/messages`, { user: 2, body: { body: 'Wa alaykum assalam, here is the answer...' } })).status, 200);
  const cr = (await api('/api/creator', { user: 2 })).data; assert.equal(cr.consultUsd, 20);
});
test('breach alerts: credential stuffing raises a high alert, developer only, push sent', async () => {
  const ctx = app.locals.ctx;
  for (let i = 0; i < 3; i++) ctx.sec.log('login-lockout', { headers: { 'cf-connecting-ip': '6.6.6.6' }, path: '/api/login' });
  await new Promise(r => setTimeout(r, 300));
  assert.equal((await api('/api/admin/security', { user: 3 })).status, 403);
  const s = (await api('/api/admin/security', { user: 1 })).data; assert.ok(s.alerts.some(a => a.kind === 'credential-stuffing' && a.severity === 'high'));
  assert.ok(ctx.pushes.some(([uid, p]) => uid === 1 && /security/i.test(p.title)));
  const rv = await api('/api/admin/security/revoke-all', { user: 1, body: { confirm: 'nope' } }); assert.equal(rv.status, 400);
});
test('posts: owner can edit caption/visibility/pin; others cannot; delete works', async () => {
  await db.query(`INSERT INTO fyp_publications(id,user_id,content) VALUES('post-1',3,'{"id":"post-1","ugc":true,"format":"image","media":{"src":"/ugc/a.jpg"},"hook":"old","author":{"userId":3}}')`);
  assert.equal((await api('/api/social/posts/post-1', { user: 4, method: 'PUT', body: { caption: 'hacked' } })).status, 403);
  const e = await api('/api/social/posts/post-1', { user: 3, method: 'PUT', body: { caption: 'New caption', visibility: 'followers', allowComments: false, pinned: true } });
  assert.equal(e.status, 200); assert.equal(e.data.publication.hook, 'New caption'); assert.equal(e.data.publication.visibility, 'followers'); assert.equal(e.data.publication.pinned, true); assert.ok(e.data.publication.editedAt);
  assert.equal((await api('/api/social/posts/post-1', { user: 3, method: 'PUT', body: { visibility: 'hackers' } })).data.publication.visibility, 'followers');
  assert.equal((await api('/api/social/posts/post-1', { user: 4, method: 'DELETE' })).status, 403);
  assert.equal((await api('/api/social/posts/post-1', { user: 3, method: 'DELETE' })).status, 200);
});
