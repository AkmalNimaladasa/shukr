// Shukr v2 — Muslim gratitude companion. Express + Postgres/PGlite + Roar AI (OpenAI-compatible) + Web Push.
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { Pool } = require('pg');
const webpush = require('web-push');
const adhan = require('adhan');
const { validCoordinates, zonedTime } = require('./public/js/prayer-location');

const PORT = process.env.PORT || 3000;
const AI_BASE = (process.env.ROAR_BASE_URL || '').replace(/\/$/, '');
const AI_KEY = process.env.ROAR_API_KEY || '';
const CHAT_MODEL = process.env.CHAT_MODEL || 'claude-sonnet-5-5';
const FAST_MODEL = process.env.FAST_MODEL || 'claude-haiku-5-5';
const EMBED_MODEL = process.env.EMBED_MODEL || 'text-embedding-3-small';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
const inlineScriptHashes = (() => { try { const h = require('fs').readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8'); return [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => 'sha256-' + crypto.createHash('sha256').update(m[1]).digest('base64')); } catch { return []; } })();
const sec = require('./lib/security')(app, { inlineScriptHashes });
app.use('/api/pay/payhere/notify', express.urlencoded({ extended: false }));
app.use((req, res, next) => (req.path === '/api/social/media' || req.path === '/api/stt' || req.path === '/api/tajweed/assess' || req.path === '/api/scholar/docs') ? next() : express.json({ limit: req.path === '/api/video/render' ? '40mb' : /^\/api\/(chat|alim|journal|import|tajweed|stt)/.test(req.path) ? '12mb' : '256kb', strict: true })(req, res, next));
sec.bodyRules();

// ---------- DB ----------
// Uses a managed Postgres when DATABASE_URL is set; otherwise an embedded Postgres (PGlite)
// whose data directory is snapshotted to the app's private S3 bucket so it survives redeploys.
let pool = null, lite = null, dbReady = false, dirty = false, lastBackup = 0;
const S3_KEY = 'db/shukr-pgdata.tar.gz';
let s3 = null;
if (process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID) {
  const { S3Client } = require('@aws-sdk/client-s3');
  s3 = new S3Client({ region: process.env.S3_REGION || 'auto', endpoint: process.env.S3_ENDPOINT, forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY } });
}
if (process.env.DATABASE_URL) {
  pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8,
    ssl: /sslmode=require/.test(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : undefined });
}
let chain = Promise.resolve();
const q = (text, params) => {
  if (pool) return pool.query(text, params);
  if (!lite) return Promise.reject(new Error('Database is starting'));
  if (!/^\s*(SELECT|WITH)/i.test(text)) dirty = true;
  // serialise access to the single embedded connection
  const run = chain.then(() => (params && params.length ? lite.query(text, params) : lite.query(text)));
  chain = run.catch(() => {});
  return run;
};
async function openLite() {
  const { PGlite } = await import('@electric-sql/pglite');
  let loadDataDir;
  if (s3) {
    try {
      const { GetObjectCommand } = require('@aws-sdk/client-s3');
      const r = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: S3_KEY }));
      const buf = Buffer.from(await r.Body.transformToByteArray());
      loadDataDir = new Blob([buf]); console.log('Restored DB snapshot', buf.length, 'bytes');
    } catch (e) { console.log('No DB snapshot restored:', e.name || e.message); }
  }
  lite = await PGlite.create(loadDataDir ? { loadDataDir } : {});
}
async function backup(force) {
  if (!lite || !s3 || (!dirty && !force)) return;
  dirty = false;
  try {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const job = chain.then(() => lite.dumpDataDir('gzip')); chain = job.catch(() => {}); const blob = await job;
    const body = Buffer.from(await blob.arrayBuffer());
    await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: S3_KEY, Body: body, ContentType: 'application/gzip' }));
    lastBackup = Date.now(); console.log('DB snapshot saved', body.length, 'bytes');
  } catch (e) { dirty = true; console.log('backup failed', e.message); }
}
setInterval(() => backup(false), 20 * 1000);
// Daily dated snapshots (kept 30 days) so a bad save or corruption can be rolled back to any of the last 30 days.
async function dailySnapshot() {
  if (!lite || !s3) return;
  const day = new Date().toISOString().slice(0, 10), key = `db/daily/shukr-${day}.tar.gz`;
  try {
    const { PutObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');
    try { await s3.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key })); return; } catch {}
    const job = chain.then(() => lite.dumpDataDir('gzip')); chain = job.catch(() => {}); const blob = await job;
    const body = Buffer.from(await blob.arrayBuffer());
    await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: body, ContentType: 'application/gzip' }));
    console.log('daily snapshot', key, body.length);
    const old = await s3.send(new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET, Prefix: 'db/daily/' }));
    const cut = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    for (const o of old.Contents || []) { const d = (o.Key.match(/shukr-(\d{4}-\d{2}-\d{2})/) || [])[1]; if (d && d < cut) await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: o.Key })); }
  } catch (e) { console.log('daily snapshot failed', e.message); }
}
setTimeout(dailySnapshot, 90 * 1000); setInterval(dailySnapshot, 3 * 3600 * 1000);
module.exports.__snap = { listSnapshots: async () => { if (!s3) return []; const { ListObjectsV2Command } = require('@aws-sdk/client-s3'); const r = await s3.send(new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET, Prefix: 'db/' })); return (r.Contents || []).map(o => ({ key: o.Key, size: o.Size, at: o.LastModified })).sort((a, b) => String(b.key).localeCompare(String(a.key))); },
  getSnapshot: async key => { const { GetObjectCommand } = require('@aws-sdk/client-s3'); const r = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key })); return Buffer.from(await r.Body.transformToByteArray()); },
  snapshotNow: async () => { await backup(true); } };
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => { console.log(sig, '— saving DB'); await backup(true).catch(() => {}); process.exit(0); });

const SCHEMA2 = require('./lib/schema2');
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, pass TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS entries (
  id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, day DATE NOT NULL,
  text TEXT NOT NULL, mood INT, prompt TEXT, kind TEXT DEFAULT 'gratitude', tags TEXT[] DEFAULT '{}',
  sentiment REAL, ai_reflection TEXT, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS blessings (
  id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, entry_id INT REFERENCES entries(id) ON DELETE CASCADE,
  text TEXT NOT NULL, category TEXT DEFAULT 'other', favorite BOOLEAN DEFAULT false, day DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS dhikr_logs (
  id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, day DATE NOT NULL,
  phrase TEXT NOT NULL, count INT NOT NULL DEFAULT 0, UNIQUE(user_id, day, phrase));
CREATE TABLE IF NOT EXISTS adhkar_logs (
  user_id INT REFERENCES users(id) ON DELETE CASCADE, day DATE NOT NULL, kind TEXT NOT NULL,
  done INT DEFAULT 0, total INT DEFAULT 0, completed BOOLEAN DEFAULT false, PRIMARY KEY(user_id, day, kind));
CREATE TABLE IF NOT EXISTS prayer_logs (
  user_id INT REFERENCES users(id) ON DELETE CASCADE, day DATE NOT NULL, prayer TEXT NOT NULL,
  status TEXT NOT NULL, PRIMARY KEY(user_id, day, prayer));
CREATE TABLE IF NOT EXISTS day_logs (
  user_id INT REFERENCES users(id) ON DELETE CASCADE, day DATE NOT NULL, fasting BOOLEAN DEFAULT false,
  quran_pages INT DEFAULT 0, mood INT, PRIMARY KEY(user_id, day));
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, title TEXT DEFAULT 'New chat',
  mode TEXT DEFAULT 'coach', updated_at TIMESTAMPTZ DEFAULT now(), created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY, conversation_id INT REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL, content TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS memories (
  id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, content TEXT NOT NULL,
  kind TEXT DEFAULT 'fact', importance INT DEFAULT 3, embedding REAL[], source TEXT,
  hits INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now(), last_used TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, sub JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS reminders_sent (user_id INT, key TEXT, day DATE, PRIMARY KEY(user_id, key, day));
CREATE TABLE IF NOT EXISTS insights_cache (user_id INT PRIMARY KEY, day DATE, data JSONB);
CREATE TABLE IF NOT EXISTS lessons (
  id SERIAL PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, topic TEXT, title TEXT,
  content TEXT, quiz JSONB, score INT, completed BOOLEAN DEFAULT false, day DATE, created_at TIMESTAMPTZ DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_entries_user_day ON entries(user_id, day);
CREATE INDEX IF NOT EXISTS idx_blessings_user ON blessings(user_id, day);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, id);
CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);
`;

async function initDb() {
  if (!pool) {
    try { await openLite(); await lite.exec(SCHEMA); await lite.exec(SCHEMA2); await lite.exec(require('./lib/schema-fyp')); await lite.exec(require('./lib/schema-habits')); await lite.exec(require('./lib/schema-fyp-social')); await lite.exec(require('./lib/schema-social-hub')); dbReady = true; console.log('DB ready (embedded)'); ctx.initPush().catch(e => console.log('push init', e.message)); }
    catch (e) { console.error('Embedded DB failed', e); }
    return;
  }
  for (let i = 0; i < 30; i++) {
    try { await q(SCHEMA); await q(SCHEMA2); await q(require('./lib/schema-fyp')); await q(require('./lib/schema-habits')); await q(require('./lib/schema-fyp-social')); await q(require('./lib/schema-social-hub')); dbReady = true; console.log('DB ready'); ctx.initPush().catch(e => console.log('push init', e.message)); return; }
    catch (e) { console.log('DB init retry', i, e.message); await new Promise(r => setTimeout(r, 4000)); }
  }
}

// ---------- Auth ----------
const hashPass = (p, salt = crypto.randomBytes(16).toString('hex')) =>
  salt + ':' + crypto.scryptSync(p, salt, 64).toString('hex');
const checkPass = (p, stored) => {
  const [salt, h] = String(stored || '').split(':');
  if (!salt || !h || h.length !== 128) { crypto.scryptSync(p, 'x'.repeat(32), 64); return false; }
  const test = crypto.scryptSync(p, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(test, 'hex'));
};
function getCookie(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
const SESSION_DAYS = 90;
// Session tokens are stored as SHA-256 hashes, so a leaked database can't be used to hijack accounts.
const tokHash = t => 'h:' + crypto.createHash('sha256').update(String(t)).digest('hex');
async function findSession(t) {
  if (!t || t.length > 200) return null;
  let r = await q(`SELECT u.*, s.token AS _stok FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=$1 AND s.created_at > now() - interval '${SESSION_DAYS} days'`, [tokHash(t)]);
  if (r.rows[0]) return r.rows[0];
  // migrate legacy plaintext sessions on first use
  r = await q(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=$1 AND s.created_at > now() - interval '${SESSION_DAYS} days'`, [t]);
  if (r.rows[0]) { await q('UPDATE sessions SET token=$2 WHERE token=$1', [t, tokHash(t)]).catch(() => {}); return r.rows[0]; }
  return null;
}
async function newSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await q('INSERT INTO sessions(token,user_id) VALUES($1,$2)', [tokHash(token), userId]);
  // keep at most 20 live sessions per account
  await q(`DELETE FROM sessions WHERE user_id=$1 AND token NOT IN (SELECT token FROM sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20)`, [userId]).catch(() => {});
  res.setHeader('Set-Cookie', `sid=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
}
async function auth(req, res, next) {
  if (!dbReady) return res.status(503).json({ error: 'Database is starting, try again in a moment' });
  const t = getCookie(req, 'sid') || (req.headers.authorization || '').replace('Bearer ', '');
  if (!t) return res.status(401).json({ error: 'auth' });
  const u = await findSession(t);
  if (!u) return res.status(401).json({ error: 'auth' });
  if (u.banned_at) return res.status(403).json({ error: 'This account has been suspended.' });
  delete u._stok; req.user = u; next();
}
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(e => {
  console.error(e); if (res.headersSent) return;
  const safe = e && (e.expose || e.status && e.status < 500) ? e.message : 'Something went wrong. Please try again.';
  res.status(e && e.status && e.status < 600 ? e.status : 500).json({ error: safe });
});
const mergeSettings = st => { const d = defaultSettings(), s = { ...d, ...(st || {}) }; for (const k of ['reminders', 'akhirahTopics', 'adjust', 'sections', 'optionalPrayers']) s[k] = { ...(d[k] || {}), ...((st || {})[k] || {}) }; s.reminders.prayerList = { ...d.reminders.prayerList, ...(((st || {}).reminders || {}).prayerList || {}) }; return s; };
const publicUser = u => ({ id: u.id, email: u.email, name: u.name, settings: mergeSettings(u.settings) });

app.post('/api/register', wrap(async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'Database is starting, try again in a moment' });
  const { email, password, name } = req.body || {};
  if (!email || !password || password.length < 8) return res.status(400).json({ error: 'Email and a password of 8+ characters are required' });
  if (process.env.SIGNUP_CODE && req.body.code !== process.env.SIGNUP_CODE) return res.status(403).json({ error: 'Invalid invite code' });
  const ex = await q('SELECT id FROM users WHERE email=$1', [email.toLowerCase().trim()]);
  if (ex.rows[0]) return res.status(409).json({ error: 'An account with this email already exists' });
  const r = await q('INSERT INTO users(email,name,pass,settings) VALUES($1,$2,$3,$4) RETURNING *',
    [email.toLowerCase().trim(), (name || '').trim() || null, hashPass(password), defaultSettings()]);
  await newSession(res, r.rows[0].id);
  if (req.body.ref) ctx.attachReferral?.(r.rows[0].id, req.body.ref);
  res.json({ user: publicUser(r.rows[0]) });
}));
app.post('/api/login', wrap(async (req, res) => {
  if (!dbReady) return res.status(503).json({ error: 'Database is starting, try again in a moment' });
  const { email, password } = req.body || {};
  const r = await q('SELECT * FROM users WHERE email=$1', [(email || '').toLowerCase().trim()]);
  if (!checkPass(password || '', r.rows[0] ? r.rows[0].pass : '') || !r.rows[0]) return res.status(401).json({ error: 'Incorrect email or password' });
  await newSession(res, r.rows[0].id);
  res.json({ user: publicUser(r.rows[0]) });
}));
app.post('/api/account/password', auth, wrap(async (req, res) => {
  const { current, next: nw } = req.body || {};
  if (typeof current !== 'string' || typeof nw !== 'string') return res.status(400).json({ error: 'Enter your current and new password' });
  if (nw.length < 8 || nw.length > 200) return res.status(400).json({ error: 'Use a new password of at least 8 characters' });
  if (!checkPass(current, req.user.pass)) { sec.log('password-change-wrong-current', req, { user: req.user.id }); return res.status(403).json({ error: 'Your current password is incorrect' }); }
  if (checkPass(nw, req.user.pass)) return res.status(400).json({ error: 'Choose a password you haven’t used here' });
  await q('UPDATE users SET pass=$2 WHERE id=$1', [req.user.id, hashPass(nw)]);
  await q('DELETE FROM sessions WHERE user_id=$1', [req.user.id]);   // sign out everywhere…
  await newSession(res, req.user.id);                                // …except this device
  res.json({ ok: true });
}));
app.post('/api/account/logout-all', auth, wrap(async (req, res) => {
  await q('DELETE FROM sessions WHERE user_id=$1', [req.user.id]); await newSession(res, req.user.id);
  res.json({ ok: true });
}));
app.get('/api/account/sessions', auth, wrap(async (req, res) => {
  res.json({ count: (await q('SELECT count(*)::int n FROM sessions WHERE user_id=$1', [req.user.id])).rows[0].n });
}));
app.post('/api/logout', wrap(async (req, res) => {
  const t = getCookie(req, 'sid'); if (t && dbReady) await q('DELETE FROM sessions WHERE token=$1 OR token=$2', [t, tokHash(t)]);
  res.setHeader('Set-Cookie', 'sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'); res.json({ ok: true });
}));

function defaultSettings() {
  return {
    lat: null, lng: null, city: null, tz: 'UTC', method: 'MuslimWorldLeague', madhab: 'Shafi', highLat: 'auto', mpCityId: null, useMuslimPro: false,
    optionalPrayers: { tahajjud: false, duha: false, witr: false },
    adjust: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
    reminders: { iqamah: false, iqamahAfter: 10, missed: false, kahfThu: true, fridayHour: true, events: true, eventsTime: '20:00', mosqueUpdates: true, quietOn: false, quietFrom: '23:00', quietTo: '05:00', adhanMode: 'sound', adhanVoice: 'madinah', fajrVoice: 'fajr-ramadan', adhanPer: {}, jummah: true, jummahLead: 60, jummahRadius: 5000, prayers: true, sunrise: true, duha: false, tahajjud: false, fastMonThu: false, fastTime: '21:00', preAdhanMin: 0, prayerList: { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true }, morning: true, evening: true, journal: true, journalTime: '21:00', streak: true, sleep: false, sleepTime: '22:30', friday: true,
      blessings: true, blessingTimes: ['13:00'], akhirah: true, akhirahTimes: ['20:00'], quran: true, quranTime: '19:30', hifz: true, hifzTime: '06:30' },
    akhirahTopics: { qabr: true, qiyamah: true, sirat: true, jannah: true, jahannam: true },
    dhikrGoal: 100, theme: 'auto', palette: 'cream', arabicSize: 28, showTranslit: true, coachTone: 'gentle', hijriAdj: 0,
    sections: {}, homeCards: null, nasheed: false, nasheedVolume: 0.25, haptics: true, alimVoice: 'alloy', alimDeep: false
  };
}
app.get('/api/me', auth, wrap(async (req, res) => { const p = (await q('SELECT username,is_admin FROM profiles WHERE user_id=$1', [req.user.id])).rows[0]; const plans = ctx.userPlans ? await ctx.userPlans(req.user).catch(() => ({})) : {}; res.json({ flags: { recitation: process.env.LICENSED_RECITATION === '1', mapStyle: process.env.MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty' }, user: { ...publicUser(req.user), username: p?.username || null, isAdmin: !!(ctx.isAdmin && ctx.isAdmin(req.user)), developer: !!(ctx.isAdmin && ctx.isAdmin(req.user)), plans }, ai: !!AI_KEY, vapid: ctx.vapidPublic(), mail: !!(ctx.mailConfigured && ctx.mailConfigured()) }); }));
app.put('/api/settings', auth, wrap(async (req, res) => {
  const inc = req.body.settings || {};
  const s = { ...defaultSettings(), ...req.user.settings, ...inc };
  for (const k of ['reminders', 'akhirahTopics', 'sections', 'adjust', 'optionalPrayers', 'custom']) if (inc[k] && typeof inc[k] === 'object' && !Array.isArray(inc[k])) s[k] = { ...(defaultSettings()[k] || {}), ...(req.user.settings?.[k] || {}), ...inc[k] };
  if (s.reminders?.prayerList && inc.reminders?.prayerList) s.reminders.prayerList = { ...(req.user.settings?.reminders?.prayerList || {}), ...inc.reminders.prayerList };
  if (inc.optionalPrayers !== undefined) {
    if (!inc.optionalPrayers || typeof inc.optionalPrayers !== 'object' || Array.isArray(inc.optionalPrayers) || Object.entries(inc.optionalPrayers).some(([k,v]) => !['tahajjud','duha','witr'].includes(k) || typeof v !== 'boolean')) return res.status(400).json({error:'Invalid optional prayer settings'});
    s.optionalPrayers = require('./lib/worship-extras').optionalPrayerSettings(s.optionalPrayers);
  }
  if (inc.reminders && Object.prototype.hasOwnProperty.call(inc.reminders, 'blessingTimes')) { try { s.reminders.blessingTimes = require('./lib/worship-extras').validateBlessingTimes(inc.reminders.blessingTimes); } catch(e) {return res.status(400).json({error:e.message});} }
  const name = req.body.name !== undefined ? req.body.name : req.user.name;
  const r = await q('UPDATE users SET settings=$1, name=$2 WHERE id=$3 RETURNING *', [s, name, req.user.id]);
  res.json({ user: publicUser(r.rows[0]) });
}));

// ---------- Time helpers ----------
function localParts(tz, d = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short' });
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, y: +p.year, m: +p.month, d: +p.day, hh: +p.hour % 24, mm: +p.minute, weekday: p.weekday };
}
const todayFor = u => localParts(u.settings?.tz).day;
const dayStr = d => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
function addDays(day, n) { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

// Calculation presets. "MuslimProLK" = Sri Lanka regional preset (19.65° / 18°, +1 min Dhuhr) — fitted to local mosque timetables.
const PrayerMethods = require('./public/js/prayer-methods.js');
function calcParams(s, coords) { return PrayerMethods.params(adhan, s, coords); }
function prayerTimes(s, day) {
  if (!validCoordinates(s.lat, s.lng)) return null;
  const coords = new adhan.Coordinates(+s.lat, +s.lng);
  const [y, m, d] = day.split('-').map(Number);
  const pt = new adhan.PrayerTimes(coords, new Date(y, m - 1, d), calcParams(s, coords));
  return { fajr: pt.fajr, sunrise: pt.sunrise, dhuhr: pt.dhuhr, asr: pt.asr, maghrib: pt.maghrib, isha: pt.isha };
}
// Convert "HH:MM" in a timezone on a given day to a Date
// Prefer live Muslim Pro times for the user's city when available, else calculated.
async function prayerTimesFor(s, day) {
  if (!validCoordinates(s.lat, s.lng)) return null;
  if (false && ctx.muslimPro) {
    try {
      const mp = await ctx.muslimPro(s.mpCityId);
      const t = mp?.days?.[day];
      if (t && t.length >= 6) { const k = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']; const o = { source: 'muslimpro' }; k.forEach((n, i) => { o[n] = new Date(zonedTime(day, t[i], s.tz).getTime() + ((s.adjust || {})[n] || 0) * 60000); }); return o; }
    } catch {}
  }
  const c = prayerTimes(s, day); if (c) c.source = 'calculated'; return c;
}

// ---------- AI helpers ----------
async function aiChat(messages, { model = FAST_MODEL, json = false, max_tokens = 1200, temperature = 0.4 } = {}) {
  if (!AI_KEY) throw new Error('AI is not configured');
  const body = { model, messages, max_tokens, temperature };
  if (json) body.response_format = { type: 'json_object' };
  const r = await fetch(AI_BASE + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AI_KEY }, body: JSON.stringify(body) });
  if (!r.ok) {
    if (json && r.status === 400) return aiChat(messages, { model, json: false, max_tokens, temperature });
    throw new Error('AI ' + r.status + ': ' + (await r.text()).slice(0, 300));
  }
  const d = await r.json();
  const out = d.choices?.[0]?.message?.content || '';
  // Some models spend the budget on hidden reasoning and return empty text; retry once with more room.
  if (!out.trim() && d.choices?.[0]?.finish_reason === 'length' && !arguments[1]?._retried) return aiChat(messages, { model, json, max_tokens: Math.min(6000, Math.max(1500, max_tokens * 4)), temperature, _retried: true });
  return out;
}
function parseJson(s) {
  try { return JSON.parse(s); } catch {}
  const m = s && s.match(/\{[\s\S]*\}/); if (m) { try { return JSON.parse(m[0]); } catch {} }
  // repair truncated JSON: close open string/arrays/objects
  if (s && s.includes('{')) {
    let t = s.slice(s.indexOf('{')); const st = []; let inStr = false, esc = false;
    for (const ch of t) { if (esc) { esc = false; continue; } if (ch === '\\') { esc = true; continue; } if (ch === '"') inStr = !inStr; else if (!inStr) { if (ch === '{' || ch === '[') st.push(ch); else if (ch === '}' || ch === ']') st.pop(); } }
    if (inStr) t += '"'; t = t.replace(/,\s*$/, '').replace(/,\s*"[^"]*"\s*:?\s*$/, '');
    while (st.length) t += st.pop() === '{' ? '}' : ']';
    try { return JSON.parse(t); } catch {}
  }
  return null;
}
const embedCache = new Map();
async function embedFast(text, ms = 1200) {
  if (!text) return null; const key = text.slice(0, 2000); if (embedCache.has(key)) return embedCache.get(key);
  const p = embed([key]).then(([v]) => { if (v) { embedCache.set(key, v); if (embedCache.size > 500) embedCache.delete(embedCache.keys().next().value); } return v; });
  return Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
}
async function embed(texts) {
  if (!AI_KEY || !texts.length) return texts.map(() => null);
  try {
    const r = await fetch(AI_BASE + '/embeddings', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AI_KEY }, body: JSON.stringify({ model: EMBED_MODEL, input: texts }) });
    if (!r.ok) { console.log('embed fail', r.status, (await r.text()).slice(0, 200)); return texts.map(() => null); }
    const d = await r.json(); return d.data.map(x => x.embedding);
  } catch (e) { console.log('embed err', e.message); return texts.map(() => null); }
}
function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

// Memory: store with dedupe by semantic similarity
async function remember(userId, items, source) {
  const tier = ctx_memoryTier ? await ctx_memoryTier(userId).catch(() => 0) : 3;
  if (!tier) return; // free plan: Alim saves nothing (Memory / Memory Plus / Mentor only)
  const CAP = [0, 300, 2000, 20000][tier] || 300;
  items = (items || []).filter(m => m && m.content && m.content.length > 3).slice(0, 8);
  if (!items.length) return;
  const vecs = await embed(items.map(m => m.content));
  const existing = (await q('SELECT id, content, embedding, importance FROM memories WHERE user_id=$1', [userId])).rows;
  for (let i = 0; i < items.length; i++) {
    const m = items[i], v = vecs[i];
    let dup = null;
    if (v) for (const e of existing) { if (cosine(v, e.embedding) > 0.9) { dup = e; break; } }
    else dup = existing.find(e => e.content.toLowerCase() === m.content.toLowerCase());
    if (dup) {
      await q('UPDATE memories SET content=$1, importance=GREATEST(importance,$2), hits=hits+1, last_used=now() WHERE id=$3', [m.content, m.importance || 3, dup.id]);
    } else {
      // Over the tier's limit: forget the least important, least used, oldest memory first.
      if (existing.length >= CAP) { const drop = (await q('SELECT id FROM memories WHERE user_id=$1 ORDER BY importance ASC, hits ASC, last_used ASC NULLS FIRST, created_at ASC LIMIT 1', [userId])).rows[0]; if (drop) { await q('DELETE FROM memories WHERE id=$1', [drop.id]); const k = existing.findIndex(e => e.id === drop.id); if (k >= 0) existing.splice(k, 1); } }
      const r = await q('INSERT INTO memories(user_id,content,kind,importance,embedding,source) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
        [userId, m.content, m.kind || 'fact', Math.min(5, Math.max(1, m.importance || 3)), v, source]);
      existing.push({ id: r.rows[0].id, content: m.content, embedding: v });
    }
  }
}
async function recall(userId, query, k = 12, preVec) {
  const all = (await q('SELECT id, content, kind, importance, embedding, created_at, hits FROM memories WHERE user_id=$1', [userId])).rows;
  if (!all.length) return [];
  let qv = preVec !== undefined ? preVec : null; if (preVec === undefined && query) [qv] = await embed([query.slice(0, 2000)]);
  const now = Date.now();
  const scored = all.map(m => {
    const sim = qv ? cosine(qv, m.embedding) : 0;
    const ageDays = (now - new Date(m.created_at).getTime()) / 864e5;
    const recency = Math.exp(-ageDays / 45);
    return { ...m, score: sim * 2 + m.importance * 0.18 + recency * 0.3 + Math.min(m.hits, 5) * 0.03 };
  }).sort((a, b) => b.score - a.score).slice(0, k);
  if (scored.length) q('UPDATE memories SET last_used=now() WHERE id = ANY($1)', [scored.map(s => s.id)]).catch(() => {});
  return scored.map(({ embedding, ...m }) => m);
}

const EXTRACT_PROMPT = `You are the memory system of a Muslim gratitude & spiritual-growth companion app.
From the user's latest content, extract durable things worth remembering long-term about the USER (not generic knowledge).
Kinds: "fact" (life details: family, work, health, location), "person" (people important to them, with relation), "goal" (spiritual/personal goals), "struggle" (recurring challenges, temptations, emotions), "preference" (how they like to be coached, interests), "learned" (Islamic topics/lessons they have been taught or understood), "win" (achievements, progress).
Only extract what is clearly stated or strongly implied. Write each as a short third-person sentence ("Has a daughter named Maryam, age 4"). importance 1-5.
Return JSON: {"memories":[{"content":"...","kind":"...","importance":3}]}. Return {"memories":[]} if nothing durable.`;

async function extractMemories(userId, text, source) {
  if (!AI_KEY) return;
  if (ctx.memoryTier && !(await ctx.memoryTier(userId).catch(() => 0))) return; // memory is a paid feature
  try {
    const out = await aiChat([{ role: 'system', content: EXTRACT_PROMPT }, { role: 'user', content: text.slice(0, 6000) }], { json: true, max_tokens: 1500, temperature: 0.1 });
    const j = parseJson(out); if (j?.memories) await remember(userId, j.memories, source);
  } catch (e) { console.log('extract err', e.message); }
}

// ---------- Journal & blessings ----------
const BLESSING_CATS = ['faith', 'family', 'health', 'people', 'provision', 'nature', 'knowledge', 'work', 'home', 'ease', 'protection', 'growth', 'small joys', 'other'];
async function analyzeEntry(userId, entry) {
  let analysis = null;
  if (AI_KEY) {
    try {
      const out = await aiChat([{ role: 'system', content: `Analyse a gratitude journal entry from a Muslim user. Return JSON:
{"blessings":[{"text":"concise blessing, first person, max 15 words","category":"one of ${BLESSING_CATS.join('|')}"}],
 "sentiment": number from -1 to 1,
 "tags": ["2-5 short lowercase themes"],
 "reflection": "2-3 warm sentences: acknowledge, connect to a relevant ayah or authentic hadith (cite briefly, e.g. Quran 14:7 or Sahih Muslim), and one gentle nudge. No fatwas."}
Extract EVERY distinct blessing mentioned, even small ones.` },
      { role: 'user', content: `Mood ${entry.mood || '?'}/5. Prompt: ${entry.prompt || '-'}\n\n${entry.text}` }], { json: true, max_tokens: 2000, temperature: 0.3 });
      analysis = parseJson(out);
      if (!analysis) console.log('analyze: unparsable output', String(out).slice(0, 300));
    } catch (e) { console.log('analyze err', e.message); }
  }
  if (!analysis) {
    const parts = entry.text.split(/\n|•|- |\d\.\s|;/).map(s => s.trim()).filter(s => s.length > 2);
    analysis = { blessings: parts.slice(0, 10).map(t => ({ text: t, category: 'other' })), sentiment: null, tags: [], reflection: null };
  }
  const bl = (analysis.blessings || []).filter(b => b.text).slice(0, 20);
  for (const b of bl) await q('INSERT INTO blessings(user_id,entry_id,text,category,day) VALUES($1,$2,$3,$4,$5)',
    [userId, entry.id, b.text, BLESSING_CATS.includes(b.category) ? b.category : 'other', entry.day]);
  await q('UPDATE entries SET sentiment=$1, tags=$2, ai_reflection=$3 WHERE id=$4',
    [analysis.sentiment ?? null, (analysis.tags || []).slice(0, 6), analysis.reflection || null, entry.id]);
  extractMemories(userId, `Journal entry (${entry.day}, mood ${entry.mood}/5):\n${entry.text}`, 'journal');
  return { blessings: bl, reflection: analysis.reflection, tags: analysis.tags };
}

app.post('/api/entries', auth, wrap(async (req, res) => {
  const { text, mood, prompt, kind, day } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Write something first' });
  const d = day || todayFor(req.user);
  const r = await q('INSERT INTO entries(user_id,day,text,mood,prompt,kind) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
    [req.user.id, d, text.trim(), mood || null, prompt || null, kind || 'gratitude']);
  if (mood) await q(`INSERT INTO day_logs(user_id,day,mood) VALUES($1,$2,$3) ON CONFLICT(user_id,day) DO UPDATE SET mood=$3`, [req.user.id, d, mood]);
  const a = await analyzeEntry(req.user.id, { ...r.rows[0], day: d });
  res.json({ entry: { ...r.rows[0], ai_reflection: a.reflection, tags: a.tags }, blessings: a.blessings });
}));
app.get('/api/entries', auth, wrap(async (req, res) => {
  const r = await q(`SELECT e.*, to_char(e.day,'YYYY-MM-DD') AS day,
    COALESCE((SELECT json_agg(json_build_object('id',b.id,'text',b.text,'category',b.category)) FROM blessings b WHERE b.entry_id=e.id),'[]') AS blessings
    FROM entries e WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [req.user.id, +req.query.limit || 50, +req.query.offset || 0]);
  res.json({ entries: r.rows });
}));
app.delete('/api/entries/:id', auth, wrap(async (req, res) => {
  await q('DELETE FROM entries WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]); res.json({ ok: true });
}));
app.get('/api/blessings', auth, wrap(async (req, res) => {
  const r = await q(`SELECT id,text,category,favorite,entry_id,to_char(day,'YYYY-MM-DD') AS day,created_at FROM blessings WHERE user_id=$1 ORDER BY created_at DESC`, [req.user.id]);
  res.json({ blessings: r.rows });
}));
app.post('/api/blessings', auth, wrap(async (req, res) => {
  const { text, category } = req.body; if (!text) return res.status(400).json({ error: 'text required' });
  const r = await q(`INSERT INTO blessings(user_id,text,category,day) VALUES($1,$2,$3,$4) RETURNING id,text,category,favorite,to_char(day,'YYYY-MM-DD') AS day`,
    [req.user.id, text, BLESSING_CATS.includes(category) ? category : 'other', todayFor(req.user)]);
  res.json({ blessing: r.rows[0] });
}));
app.patch('/api/blessings/:id', auth, wrap(async (req, res) => {
  await q('UPDATE blessings SET favorite=COALESCE($1,favorite), category=COALESCE($2,category) WHERE id=$3 AND user_id=$4',
    [req.body.favorite ?? null, req.body.category ?? null, req.params.id, req.user.id]); res.json({ ok: true });
}));
app.delete('/api/blessings/:id', auth, wrap(async (req, res) => {
  await q('DELETE FROM blessings WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]); res.json({ ok: true });
}));

// ---------- Trackers ----------
app.post('/api/dhikr', auth, wrap(async (req, res) => {
  const { phrase, add } = req.body; const d = req.body.day || todayFor(req.user);
  const r = await q(`INSERT INTO dhikr_logs(user_id,day,phrase,count) VALUES($1,$2,$3,$4)
    ON CONFLICT(user_id,day,phrase) DO UPDATE SET count=dhikr_logs.count+$4 RETURNING count`, [req.user.id, d, phrase, Math.max(0, +add || 0)]);
  res.json({ count: r.rows[0].count });
}));
app.post('/api/adhkar', auth, wrap(async (req, res) => {
  const { kind, done, total } = req.body; const d = req.body.day || todayFor(req.user);
  await q(`INSERT INTO adhkar_logs(user_id,day,kind,done,total,completed) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(user_id,day,kind) DO UPDATE SET done=$4,total=$5,completed=$6`, [req.user.id, d, kind, done, total, done >= total]);
  res.json({ ok: true });
}));
app.post('/api/prayer', auth, wrap(async (req, res) => {
  const { prayer, status } = req.body; const d = req.body.day || todayFor(req.user);
  const { OBLIGATORY_PRAYERS, OPTIONAL_PRAYERS } = require('./lib/worship-extras');
  const optional = OPTIONAL_PRAYERS.includes(prayer);
  if ((!optional && !OBLIGATORY_PRAYERS.includes(prayer)) || (status != null && !(optional ? ['done'] : ['ontime','jamaah','late','missed']).includes(status)) || !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d+'T12:00:00Z')) || new Date(d+'T12:00:00Z').toISOString().slice(0,10)!==d || d>todayFor(req.user)) return res.status(400).json({error:'Invalid prayer log'});
  if (!status) await q('DELETE FROM prayer_logs WHERE user_id=$1 AND day=$2 AND prayer=$3', [req.user.id, d, prayer]);
  else await q(`INSERT INTO prayer_logs(user_id,day,prayer,status) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,day,prayer) DO UPDATE SET status=$4`, [req.user.id, d, prayer, status]);
  res.json({ ok: true });
}));
app.post('/api/daylog', auth, wrap(async (req, res) => {
  const d = req.body.day || todayFor(req.user);
  await q(`INSERT INTO day_logs(user_id,day,fasting,quran_pages,mood) VALUES($1,$2,COALESCE($3,false),COALESCE($4,0),$5)
    ON CONFLICT(user_id,day) DO UPDATE SET fasting=COALESCE($3,day_logs.fasting), quran_pages=COALESCE($4,day_logs.quran_pages), mood=COALESCE($5,day_logs.mood)`,
    [req.user.id, d, req.body.fasting ?? null, req.body.quran_pages ?? null, req.body.mood ?? null]);
  res.json({ ok: true });
}));
app.get('/api/today', auth, wrap(async (req, res) => {
  const d = req.query.day || todayFor(req.user), u = req.user.id;
  const [dh, ad, pr, dl, en] = await Promise.all([
    q('SELECT phrase,count FROM dhikr_logs WHERE user_id=$1 AND day=$2', [u, d]),
    q('SELECT kind,done,total,completed FROM adhkar_logs WHERE user_id=$1 AND day=$2', [u, d]),
    q('SELECT prayer,status FROM prayer_logs WHERE user_id=$1 AND day=$2', [u, d]),
    q('SELECT fasting,quran_pages,mood FROM day_logs WHERE user_id=$1 AND day=$2', [u, d]),
    q('SELECT count(*)::int AS n FROM entries WHERE user_id=$1 AND day=$2', [u, d])]);
  const stats = await computeStats(req.user);
  res.json({ day: d, dhikr: dh.rows, adhkar: ad.rows, prayers: Object.fromEntries(pr.rows.map(r => [r.prayer, r.status])),
    daylog: dl.rows[0] || {}, entries: en.rows[0].n, streaks: stats.streaks });
}));

// ---------- Patterns engine (statistics + on-device ML) ----------
function pearson(x, y) {
  const n = x.length; if (n < 5) return null;
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; }
  if (!dx || !dy) return null; return num / Math.sqrt(dx * dy);
}
function linreg(ys) {
  const pts = ys.map((y, i) => [i, y]).filter(p => p[1] != null); if (pts.length < 4) return null;
  const n = pts.length, mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
  let num = 0, den = 0; for (const [x, y] of pts) { num += (x - mx) * (y - my); den += (x - mx) ** 2; }
  return den ? num / den : 0;
}
// Logistic regression (L2-regularised, gradient descent) — learns which habits predict a "good day" (mood >= 4)
function logistic(X, y, names, epochs = 600, lr = 0.3, l2 = 0.05) {
  if (X.length < 10 || y.every(v => v === y[0])) return null;
  const k = X[0].length; let w = new Array(k).fill(0), b = 0;
  for (let e = 0; e < epochs; e++) {
    const gw = new Array(k).fill(0); let gb = 0;
    for (let i = 0; i < X.length; i++) {
      const z = b + X[i].reduce((a, v, j) => a + v * w[j], 0), p = 1 / (1 + Math.exp(-z)), err = p - y[i];
      for (let j = 0; j < k; j++) gw[j] += err * X[i][j]; gb += err;
    }
    for (let j = 0; j < k; j++) w[j] -= lr * (gw[j] / X.length + l2 * w[j]); b -= lr * gb / X.length;
  }
  let correct = 0; for (let i = 0; i < X.length; i++) { const z = b + X[i].reduce((a, v, j) => a + v * w[j], 0); if ((z > 0 ? 1 : 0) === y[i]) correct++; }
  return { weights: names.map((n, j) => ({ feature: n, weight: +w[j].toFixed(3) })).sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)), bias: +b.toFixed(3), accuracy: +(correct / X.length).toFixed(2), n: X.length };
}
function streak(daysSet, today) {
  let cur = 0, d = daysSet.has(today) ? today : addDays(today, -1);
  while (daysSet.has(d)) { cur++; d = addDays(d, -1); }
  const sorted = [...daysSet].sort(); let best = 0, run = 0, prev = null;
  for (const x of sorted) { run = prev && addDays(prev, 1) === x ? run + 1 : 1; best = Math.max(best, run); prev = x; }
  return { current: cur, best, doneToday: daysSet.has(today) };
}

async function computeStats(user, days = 90) {
  const u = user.id, today = todayFor(user), from = addDays(today, -days + 1);
  const goal = user.settings?.dhikrGoal || 100;
  const [en, bl, dh, ad, pr, dl] = await Promise.all([
    q(`SELECT to_char(day,'YYYY-MM-DD') d, mood, sentiment, tags, extract(hour from created_at AT TIME ZONE $3)::int h FROM entries WHERE user_id=$1 AND day>=$2`, [u, from, user.settings?.tz || 'UTC']),
    q(`SELECT to_char(day,'YYYY-MM-DD') d, category, text FROM blessings WHERE user_id=$1`, [u]),
    q(`SELECT to_char(day,'YYYY-MM-DD') d, sum(count)::int c FROM dhikr_logs WHERE user_id=$1 GROUP BY day`, [u]),
    q(`SELECT to_char(day,'YYYY-MM-DD') d, kind, completed FROM adhkar_logs WHERE user_id=$1`, [u]),
    q(`SELECT to_char(day,'YYYY-MM-DD') d, prayer, status FROM prayer_logs WHERE user_id=$1 AND prayer IN ('fajr','dhuhr','asr','maghrib','isha')`, [u]),
    q(`SELECT to_char(day,'YYYY-MM-DD') d, fasting, quran_pages, mood FROM day_logs WHERE user_id=$1`, [u])]);
  const journalDays = new Set(en.rows.map(r => r.d));
  const allJournal = new Set((await q(`SELECT DISTINCT to_char(day,'YYYY-MM-DD') d FROM entries WHERE user_id=$1`, [u])).rows.map(r => r.d));
  const dhikrMap = Object.fromEntries(dh.rows.map(r => [r.d, r.c]));
  const morning = new Set(ad.rows.filter(r => r.kind === 'morning' && r.completed).map(r => r.d));
  const evening = new Set(ad.rows.filter(r => r.kind === 'evening' && r.completed).map(r => r.d));
  const prayed = {}; for (const r of pr.rows) if (r.status !== 'missed') prayed[r.d] = (prayed[r.d] || 0) + 1;
  const allPrayers = new Set(Object.entries(prayed).filter(([, n]) => n >= 5).map(([d]) => d));
  const dhikrDays = new Set(Object.entries(dhikrMap).filter(([, c]) => c >= goal).map(([d]) => d));
  const anyDhikr = new Set(Object.keys(dhikrMap).filter(d => dhikrMap[d] > 0));
  const dlMap = Object.fromEntries(dl.rows.map(r => [r.d, r]));
  const anyActivity = new Set([...allJournal, ...anyDhikr, ...morning, ...evening, ...Object.keys(prayed)]);

  const streaks = {
    journal: streak(allJournal, today), morning: streak(morning, today), evening: streak(evening, today),
    dhikr: streak(dhikrDays, today), prayers: streak(allPrayers, today), active: streak(anyActivity, today)
  };

  // daily series
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    const moods = en.rows.filter(r => r.d === d && r.mood).map(r => r.mood);
    const mood = moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : (dlMap[d]?.mood || null);
    series.push({ d, mood, journal: journalDays.has(d) ? 1 : 0, dhikr: dhikrMap[d] || 0, morning: morning.has(d) ? 1 : 0, evening: evening.has(d) ? 1 : 0,
      prayers: prayed[d] || 0, fasting: dlMap[d]?.fasting ? 1 : 0, quran: dlMap[d]?.quran_pages || 0, blessings: bl.rows.filter(b => b.d === d).length });
  }
  const withMood = series.filter(s => s.mood != null);
  const feats = [['morning', 'Morning adhkar'], ['evening', 'Evening adhkar'], ['prayers', 'Prayers on time'], ['dhikr', 'Dhikr count'], ['blessings', 'Blessings noted'], ['quran', 'Quran pages'], ['fasting', 'Fasting']];
  const correlations = feats.map(([k, label]) => {
    const r = pearson(withMood.map(s => s[k]), withMood.map(s => s.mood));
    return r == null ? null : { key: k, label, r: +r.toFixed(2) };
  }).filter(Boolean).sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  const maxes = Object.fromEntries(feats.map(([k]) => [k, Math.max(1, ...series.map(s => s[k]))]));
  const model = logistic(withMood.map(s => feats.map(([k]) => s[k] / maxes[k])), withMood.map(s => (s.mood >= 4 ? 1 : 0)), feats.map(f => f[1]));
  const last14 = series.slice(-14);
  const moodTrend = linreg(last14.map(s => s.mood));
  const catCount = {}; for (const b of bl.rows) catCount[b.category] = (catCount[b.category] || 0) + 1;
  const tagCount = {}; for (const e of en.rows) for (const t of e.tags || []) tagCount[t] = (tagCount[t] || 0) + 1;
  const hours = new Array(24).fill(0); for (const e of en.rows) hours[e.h] = (hours[e.h] || 0) + 1;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], wdRate = wd.map(() => [0, 0]);
  for (const s of series.slice(-56)) { const w = new Date(s.d + 'T00:00:00Z').getUTCDay(); wdRate[w][1]++; if (s.journal || s.morning || s.evening || s.dhikr) wdRate[w][0]++; }
  const weekday = wd.map((n, i) => ({ day: n, rate: wdRate[i][1] ? +(wdRate[i][0] / wdRate[i][1]).toFixed(2) : 0 }));
  const prayerBreakdown = {}; for (const r of pr.rows.filter(r => r.d >= addDays(today, -29))) { prayerBreakdown[r.prayer] = prayerBreakdown[r.prayer] || { ontime: 0, late: 0, missed: 0, jamaah: 0 }; prayerBreakdown[r.prayer][r.status] = (prayerBreakdown[r.prayer][r.status] || 0) + 1; }
  const last7 = series.slice(-7), prev7 = series.slice(-14, -7);
  const sum = (a, k) => a.reduce((x, s) => x + s[k], 0);
  return {
    today, streaks, series: series.slice(-30), correlations, model, moodTrend: moodTrend == null ? null : +moodTrend.toFixed(3),
    totals: { entries: allJournal.size, blessings: bl.rows.length, dhikrAll: dh.rows.reduce((a, r) => a + r.c, 0), activeDays: anyActivity.size },
    categories: Object.entries(catCount).sort((a, b) => b[1] - a[1]).map(([category, count]) => ({ category, count })),
    tags: Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([tag, count]) => ({ tag, count })),
    hours, weekday, prayerBreakdown,
    week: { journal: sum(last7, 'journal'), dhikr: sum(last7, 'dhikr'), morning: sum(last7, 'morning'), evening: sum(last7, 'evening'), prayers: sum(last7, 'prayers'), blessings: sum(last7, 'blessings') },
    prevWeek: { journal: sum(prev7, 'journal'), dhikr: sum(prev7, 'dhikr'), morning: sum(prev7, 'morning'), evening: sum(prev7, 'evening'), prayers: sum(prev7, 'prayers'), blessings: sum(prev7, 'blessings') }
  };
}
function statsBrief(s) {
  const st = s.streaks;
  const lines = [
    `Streaks (current/best): journal ${st.journal.current}/${st.journal.best}, morning adhkar ${st.morning.current}/${st.morning.best}, evening adhkar ${st.evening.current}/${st.evening.best}, dhikr goal ${st.dhikr.current}/${st.dhikr.best}, all 5 prayers ${st.prayers.current}/${st.prayers.best}.`,
    `Today done: journal ${st.journal.doneToday}, morning adhkar ${st.morning.doneToday}, evening adhkar ${st.evening.doneToday}, prayers logged ${s.series.at(-1)?.prayers || 0}/5, dhikr ${s.series.at(-1)?.dhikr || 0}.`,
    `This week vs last: journal days ${s.week.journal} vs ${s.prevWeek.journal}; dhikr ${s.week.dhikr} vs ${s.prevWeek.dhikr}; morning adhkar ${s.week.morning} vs ${s.prevWeek.morning}; evening ${s.week.evening} vs ${s.prevWeek.evening}; prayers ${s.week.prayers} vs ${s.prevWeek.prayers}.`,
    `Totals: ${s.totals.entries} journal days, ${s.totals.blessings} blessings recorded.`,
    s.moodTrend != null ? `Mood trend (14d slope): ${s.moodTrend > 0.03 ? 'rising' : s.moodTrend < -0.03 ? 'falling' : 'steady'} (${s.moodTrend}).` : '',
    s.correlations.length ? `Mood correlations: ${s.correlations.slice(0, 4).map(c => `${c.label} r=${c.r}`).join(', ')}.` : '',
    s.model ? `ML model of good-mood days (acc ${s.model.accuracy}, n=${s.model.n}): ${s.model.weights.slice(0, 4).map(w => `${w.feature} ${w.weight > 0 ? '+' : ''}${w.weight}`).join(', ')}.` : '',
    s.categories.length ? `Top blessing themes: ${s.categories.slice(0, 5).map(c => `${c.category} (${c.count})`).join(', ')}.` : '',
    `Weekday consistency: ${s.weekday.map(w => `${w.day} ${Math.round(w.rate * 100)}%`).join(', ')}.`
  ];
  return lines.filter(Boolean).join('\n');
}
app.get('/api/coach', auth, wrap(async (req, res) => {
  const tier = ctx_memoryTier ? await ctx_memoryTier(req.user) : 0;
  if (tier < 2) return res.json({ tier, locked: true });
  const c = await ctx_coachProfile(req.user.id); res.json({ tier, profile: c?.data || {}, updated: c?.updated_at || null });
}));
app.get('/api/stats', auth, wrap(async (req, res) => res.json(await computeStats(req.user))));
app.get('/api/insights/ai', auth, wrap(async (req, res) => {
  const today = todayFor(req.user);
  const c = (await q('SELECT day, data FROM insights_cache WHERE user_id=$1', [req.user.id])).rows[0];
  if (c && dayStr(c.day) === today && !req.query.refresh) return res.json(c.data);
  const s = await computeStats(req.user);
  const mems = await recall(req.user.id, 'goals struggles patterns progress', 15);
  const recent = (await q(`SELECT to_char(day,'YYYY-MM-DD') d, mood, text FROM entries WHERE user_id=$1 ORDER BY created_at DESC LIMIT 8`, [req.user.id])).rows;
  const out = await aiChat([{ role: 'system', content: `You are a wise, warm Muslim coach analysing a user's spiritual habit data. Produce personalised, specific insights grounded in the numbers. Never invent data. Avoid fatwas; cite Quran/authentic hadith briefly when helpful.
Return JSON: {"headline":"one encouraging sentence","insights":[{"title":"short","body":"1-3 sentences","type":"pattern|win|nudge|warning"}],"focus":"one concrete focus for tomorrow","ayah":{"ref":"e.g. 14:7","text":"English meaning"}}. 3-5 insights.` },
  { role: 'user', content: `User: ${req.user.name || 'friend'}\nSTATS:\n${statsBrief(s)}\n\nMEMORIES:\n${mems.map(m => `- [${m.kind}] ${m.content}`).join('\n') || 'none'}\n\nRECENT ENTRIES:\n${recent.map(r => `${r.d} mood ${r.mood}: ${r.text.slice(0, 300)}`).join('\n') || 'none'}` }],
  { model: CHAT_MODEL, json: true, max_tokens: 2500, temperature: 0.5 });
  const data = parseJson(out) || { headline: out.slice(0, 200), insights: [] };
  data.generated = new Date().toISOString();
  await q(`INSERT INTO insights_cache(user_id,day,data) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET day=$2,data=$3`, [req.user.id, today, data]);
  res.json(data);
}));

// Memory management (like Claude's memory)
let ctx_hasPlan = null, ctx_memoryTier = null, ctx_coachProfile = null;
app.get('/api/memories', auth, wrap(async (req, res) => {
  if (ctx.memoryTier && !(await ctx.memoryTier(req.user).catch(() => 0))) return res.json({ memories: [], locked: true });
  if (ctx_hasPlan && !(await ctx_hasPlan(req.user, 'memory'))) return res.json({ memories: [], locked: true });
  const r = await q('SELECT id,content,kind,importance,source,created_at,hits FROM memories WHERE user_id=$1 ORDER BY importance DESC, created_at DESC', [req.user.id]);
  res.json({ memories: r.rows });
}));
app.post('/api/memories', auth, wrap(async (req, res) => {
  if (ctx.memoryTier && !(await ctx.memoryTier(req.user).catch(() => 0))) return res.status(402).json({ error: 'Alim’s memory is part of Shukr Memory.', locked: true });
  await remember(req.user.id, [{ content: req.body.content, kind: req.body.kind || 'fact', importance: 4 }], 'manual'); res.json({ ok: true });
}));
app.delete('/api/memories/:id', auth, wrap(async (req, res) => {
  if (req.params.id === 'all') await q('DELETE FROM memories WHERE user_id=$1', [req.user.id]);
  else await q('DELETE FROM memories WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.json({ ok: true });
}));

// Daily personalised lesson + quiz
app.post('/api/lesson', auth, wrap(async (req, res) => {
  const topic = req.body.topic || 'gratitude (shukr) in Islam';
  const learned = (await q(`SELECT content FROM memories WHERE user_id=$1 AND kind='learned' ORDER BY created_at DESC LIMIT 25`, [req.user.id])).rows.map(r => r.content);
  const past = (await q(`SELECT title FROM lessons WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30`, [req.user.id])).rows.map(r => r.title);
  const out = await aiChat([{ role: 'system', content: `Create a short, accurate Islamic micro-lesson (3-minute read) for a Muslim adult. Build on prior learning, never repeat past lesson titles. Cite Quran (surah:ayah) and authentic hadith with collection names. Avoid contested fiqh rulings.
Return JSON: {"title":"...","content":"markdown, 150-300 words, with a practical 'Try today' line at the end","quiz":[{"q":"...","options":["a","b","c","d"],"answer":0,"explain":"..."}]} with exactly 3 quiz questions.` },
  { role: 'user', content: `Topic: ${topic}\nAlready learned: ${learned.join('; ') || 'nothing yet'}\nPast lesson titles: ${past.join('; ') || 'none'}` }],
  { model: CHAT_MODEL, json: true, max_tokens: 3000, temperature: 0.5 });
  const j = parseJson(out); if (!j) return res.status(500).json({ error: 'Could not generate a lesson, try again' });
  const r = await q('INSERT INTO lessons(user_id,topic,title,content,quiz,day) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [req.user.id, topic, j.title, j.content, JSON.stringify(j.quiz || []), todayFor(req.user)]);
  res.json({ lesson: r.rows[0] });
}));
app.get('/api/lessons', auth, wrap(async (req, res) => {
  const r = await q('SELECT id,topic,title,score,completed,created_at FROM lessons WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [req.user.id]);
  res.json({ lessons: r.rows });
}));
app.get('/api/lessons/:id', auth, wrap(async (req, res) => {
  const r = await q('SELECT * FROM lessons WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]); res.json({ lesson: r.rows[0] });
}));
app.post('/api/lessons/:id/complete', auth, wrap(async (req, res) => {
  const l = (await q('UPDATE lessons SET completed=true, score=$1 WHERE id=$2 AND user_id=$3 RETURNING *', [req.body.score, req.params.id, req.user.id])).rows[0];
  if (l) await remember(req.user.id, [{ content: `Learned "${l.title}" (topic: ${l.topic}); quiz score ${req.body.score}/3`, kind: 'learned', importance: 3 }], 'lesson');
  res.json({ ok: true });
}));

// Prayer times (server-side too, for consistency with reminders)
app.get('/api/prayertimes', auth, wrap(async (req, res) => {
  const s = { ...defaultSettings(), ...req.user.settings }; const from = req.query.day || todayFor(req.user); const n = Math.min(+req.query.days || 1, 31);
  const out = []; for (let i = 0; i < n; i++) { const d = addDays(from, i); const t = await prayerTimesFor(s, d); out.push({ day: d, times: t, source: t?.source || null }); }
  res.json(n === 1 ? { day: from, times: out[0].times, source: out[0].source } : { days: out });
}));

// Delete account (and all data)
app.delete('/api/account', auth, wrap(async (req, res) => {
  // Re-authenticate before the most destructive action (stolen session can't wipe an account).
  const pw = (req.body && req.body.password) || req.headers['x-confirm-password'];
  if (typeof pw !== 'string' || !checkPass(pw, req.user.pass)) { sec.log('account-delete-denied', req, { user: req.user.id }); return res.status(403).json({ error: 'Enter your password to delete your account' }); }
  const u = req.user.id;
  for (const t of ['message_vectors WHERE user_id=$1', 'messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id=$1)', 'conversations WHERE user_id=$1', 'posts WHERE user_id=$1', 'comments WHERE user_id=$1', 'likes WHERE user_id=$1', 'follows WHERE follower=$1 OR followee=$1', 'blocks WHERE blocker=$1 OR blocked=$1', 'reports WHERE reporter=$1', 'profiles WHERE user_id=$1', 'quran_read WHERE user_id=$1', 'quran_progress WHERE user_id=$1', 'bookmarks WHERE user_id=$1', 'hifz_items WHERE user_id=$1', 'tajweed_attempts WHERE user_id=$1', 'user_profile_ai WHERE user_id=$1', 'fasting WHERE user_id=$1', 'audiobook_progress WHERE user_id=$1', 'blessings WHERE user_id=$1', 'entries WHERE user_id=$1', 'dhikr_logs WHERE user_id=$1', 'adhkar_logs WHERE user_id=$1', 'prayer_logs WHERE user_id=$1', 'day_logs WHERE user_id=$1', 'memories WHERE user_id=$1', 'push_subs WHERE user_id=$1', 'reminders_sent WHERE user_id=$1', 'insights_cache WHERE user_id=$1', 'lessons WHERE user_id=$1', 'sessions WHERE user_id=$1', 'fyp_feed_orders WHERE user_id=$1', 'fyp_progress WHERE user_id=$1', 'learning_profiles WHERE user_id=$1', 'habit_logs WHERE user_id=$1', 'habits WHERE user_id=$1', 'users WHERE id=$1'])
    await q('DELETE FROM ' + t, [u]);
  res.setHeader('Set-Cookie', 'sid=; Path=/; Max-Age=0'); res.json({ ok: true });
}));
// Export
app.get('/api/export', auth, wrap(async (req, res) => {
  const u = req.user.id; const t = async s => (await q(s, [u])).rows;
  res.setHeader('Content-Disposition', 'attachment; filename="shukr-export.json"');
  res.json({ exported: new Date(), user: publicUser(req.user), entries: await t('SELECT * FROM entries WHERE user_id=$1'), blessings: await t('SELECT * FROM blessings WHERE user_id=$1'),
    dhikr: await t('SELECT * FROM dhikr_logs WHERE user_id=$1'), adhkar: await t('SELECT * FROM adhkar_logs WHERE user_id=$1'), prayers: await t('SELECT * FROM prayer_logs WHERE user_id=$1'),
    memories: await t('SELECT id,content,kind,importance,created_at FROM memories WHERE user_id=$1'),
    conversations: await t('SELECT c.id, c.title, c.created_at, (SELECT json_agg(json_build_object(\'role\',m.role,\'content\',m.content,\'at\',m.created_at) ORDER BY m.id) FROM messages m WHERE m.conversation_id=c.id) messages FROM conversations c WHERE c.user_id=$1'),
    learningProfile: await t('SELECT * FROM learning_profiles WHERE user_id=$1'), learningProgress: await t('SELECT * FROM fyp_progress WHERE user_id=$1'), habits: await t('SELECT * FROM habits WHERE user_id=$1'), habitLogs: await t('SELECT * FROM habit_logs WHERE user_id=$1'),
    quran: await t('SELECT * FROM quran_progress WHERE user_id=$1'), hifz: await t('SELECT * FROM hifz_items WHERE user_id=$1'), bookmarks: await t('SELECT * FROM bookmarks WHERE user_id=$1') });
}));


// ---------- Modules ----------
const ctx = { app, q, auth, wrap, AI_BASE, AI_KEY, FAST_MODEL, CHAT_MODEL, aiChat, parseJson, embed, embedFast, cosine, remember, recall, extractMemories,
  computeStats, statsBrief, localParts, todayFor, addDays, defaultSettings, prayerTimes, prayerTimesFor, dbReady: () => dbReady, hashPass, newSession, checkPass, tokHash, sec };
ctx.s3 = s3;
require('./lib/reminders')(ctx);
require('./lib/features')(ctx);
require('./lib/fyp')(ctx);
require('./lib/social-hub')(ctx);
require('./lib/metal-prices')({ app, auth, wrap });
require('./lib/i18n')(ctx);
require('./lib/social-uploads')(Object.assign(ctx, { s3 }));
require('./lib/social-graph')(ctx);
require('./lib/password-reset')(ctx);
require('./lib/monetize')(ctx);
require('./lib/breach-watch')(ctx);
require('./lib/scholars')(ctx);
require('./lib/audio-studio')(ctx);
require('./lib/social-plus')(ctx);
require('./lib/jobs-market')(ctx);
require('./lib/earn')(ctx);
require('./lib/feedback-names')(ctx);
require('./lib/calls')(ctx);
require('./lib/video-editor')(ctx);
require('./lib/creator-quests')(ctx);
require('./lib/sound-library')(ctx);
require('./lib/ummah')(ctx);
// Admin-only backups: list the snapshots in storage and download one (to keep a copy outside Roar).
app.get('/api/admin/backups', auth, wrap(async (req, res) => { if (!ctx.isAdmin?.(req.user)) return res.status(403).json({ error: 'Developers only' }); res.json({ snapshots: await module.exports.__snap.listSnapshots() }); }));
app.get('/api/admin/backups/download', auth, wrap(async (req, res) => {
  if (!ctx.isAdmin?.(req.user)) return res.status(403).json({ error: 'Developers only' });
  const key = String(req.query.key || 'db/shukr-pgdata.tar.gz'); if (!/^db\/(daily\/shukr-\d{4}-\d{2}-\d{2}|shukr-pgdata)\.tar\.gz$/.test(key)) return res.status(400).json({ error: 'Bad key' });
  if (key === 'db/shukr-pgdata.tar.gz') await module.exports.__snap.snapshotNow();
  const buf = await module.exports.__snap.getSnapshot(key);
  res.setHeader('Content-Type', 'application/gzip'); res.setHeader('Content-Disposition', `attachment; filename="${key.split('/').pop().replace('pgdata', 'latest-' + new Date().toISOString().slice(0, 10))}"`); res.end(buf);
}));
// Feature plug-ins: every lib/features/*.js exports function(ctx)
for (const f of require('fs').readdirSync(require('path').join(__dirname, 'lib', 'features')).filter(f => f.endsWith('.js')).sort()) {
  try { require('./lib/features/' + f)(ctx); } catch (e) { console.error('feature', f, e.message); }
}
{ const seed = require('./lib/house-accounts'); const t = setInterval(() => { if (dbReady) { clearInterval(t); setTimeout(() => seed(ctx), 3000); } }, 2000); t.unref?.(); }
// One-time: the old default theme was 'light'; switch those users to 'auto' (follow phone dark mode).
setTimeout(async () => { try { if (!dbReady) return; await q(`UPDATE users SET settings = jsonb_set(settings, '{theme}', '"auto"') WHERE settings->>'theme' = 'light' AND NOT (settings ? 'themeChosen')`); } catch (e) { console.log('theme migrate', e.message); } }, 15000);
ctx_hasPlan = ctx.hasPlan; ctx_memoryTier = ctx.memoryTier; ctx_coachProfile = ctx.coachProfile;
require('./lib/habits')(ctx);
require('./lib/alim')(ctx);

app.get('/api/profile-ai', auth, wrap(async (req, res) => res.json((await q('SELECT life_summary, updated_at FROM user_profile_ai WHERE user_id=$1', [req.user.id])).rows[0] || {})));

// ---------- Static ----------
// Client boot/error beacons (no auth) so mobile failures are visible in server logs
const clientLog = []; let clHits = 0; setInterval(() => { clHits = 0; }, 60000);
app.post('/api/client-log', express.text({ type: () => true, limit: '20kb' }), (req, res) => {
  if (++clHits > 120) return res.status(429).end();
  let d = {}; try { d = JSON.parse(req.body || '{}'); } catch { d = { raw: String(req.body || '').slice(0, 500) }; }
  const row = { at: new Date().toISOString(), ip: (req.headers['cf-connecting-ip'] || req.ip || '').slice(0, 45), ua: String(req.headers['user-agent'] || '').slice(0, 220), ...d };
  clientLog.unshift(row); clientLog.length = Math.min(clientLog.length, 300);
  console.log('CLIENT', JSON.stringify(row).slice(0, 900));
  res.status(204).end();
});
app.get('/api/client-log', (req, res) => { const dk = process.env.DIAG_KEY || 'shukr-diag-7281'; if (typeof req.query.k !== 'string' || req.query.k.length !== dk.length || !crypto.timingSafeEqual(Buffer.from(req.query.k), Buffer.from(dk))) { sec.log('diag-key-denied', req); return res.status(403).end(); } res.json(clientLog); });
app.get('/healthz', (req, res) => res.json({ ok: true, version: 2, db: dbReady, dbKind: pool ? 'postgres' : 'embedded', persisted: !!s3, lastBackup: lastBackup ? new Date(lastBackup).toISOString() : null, ai: !!AI_KEY, push: ctx.pushReady() }));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, p) => {
    if (/sw\.js$|index\.html$|manifest|\.js$|\.css$/.test(p)) res.setHeader('Cache-Control', 'no-cache');
    else if (/\/data\/|\/audio\/|\/icons\//.test(p)) res.setHeader('Cache-Control', 'public, max-age=604800');
    else res.setHeader('Cache-Control', 'public, max-age=300');
  }
}));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.get(/^\/(?!api).*/, (req, res) => { if (/\.[a-z0-9]{1,6}$/i.test(req.path)) return res.status(404).type('text/plain').send('Not found'); res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(__dirname, 'public', 'index.html')); });
app.use((err, req, res, next) => { console.error('unhandled', err.message); if (!res.headersSent) res.status(err.status || 500).json({ error: err.type === 'entity.too.large' ? 'Upload too large' : 'Something went wrong' }); });
process.on('unhandledRejection', e => console.error('unhandledRejection', e && e.message));

app.listen(PORT, '0.0.0.0', () => { console.log('Shukr listening on', PORT); initDb(); });
