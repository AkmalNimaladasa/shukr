// Security hardening (server-side; invisible to users).
// - Strict security headers + Content-Security-Policy (inline boot script allowed by hash)
// - CSRF: state-changing /api requests must come from our own origin (Origin/Referer check) or carry a Bearer token
// - Rate limiting per IP (global) and per IP+account on sensitive routes (login, register, reset, uploads, posting, payments)
// - Brute-force lockout on login per email and per IP with backoff
// - Session hardening: hashed tokens at rest, 90-day expiry, rotation on login, revoke-all on password change
// - Request size limits, JSON content-type enforcement, path traversal / bad-method blocking
// - Security event log (in memory + console) readable by the developer dashboard
const crypto = require('crypto');

module.exports = function security(app, opts = {}) {
  const HOST_ALLOW = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const events = []; const log = (type, req, extra = {}) => {
    const row = { at: new Date().toISOString(), type, ip: ipOf(req), path: req.path, ua: String(req.headers['user-agent'] || '').slice(0, 120), ...extra };
    events.unshift(row); if (events.length > 500) events.length = 500;
    console.log('SECURITY', JSON.stringify(row));
    for (const fn of hooks) { try { fn(row, req); } catch {} }
  };
  const hooks = [];
  const ipOf = req => String(req.headers['cf-connecting-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress || '').trim().slice(0, 64);

  // ---------- Headers ----------
  const inlineHashes = opts.inlineScriptHashes || [];
  const CSP = [
    "default-src 'self'",
    `script-src 'self' https://www.youtube.com https://s.ytimg.com ${inlineHashes.map(h => `'${h}'`).join(' ')}`.trim(),
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "connect-src 'self' https:",
    "frame-src https://www.google.com https://maps.google.com https://www.youtube-nocookie.com https://www.youtube.com",
    "worker-src 'self' blob:", "manifest-src 'self'", "object-src 'none'", "base-uri 'self'",
    "form-action 'self' https://www.payhere.lk https://sandbox.payhere.lk",
    "frame-ancestors 'none'", "upgrade-insecure-requests"
  ].join('; ');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self), accelerometer=(self), magnetometer=(self), gyroscope=(self), payment=(self), usb=(), bluetooth=(), serial=(), interest-cohort=()');
    if (!req.path.startsWith('/ugc/')) res.setHeader('Content-Security-Policy', CSP);
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // ---------- Basic request hygiene ----------
  app.use((req, res, next) => {
    if (!['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'].includes(req.method)) { log('bad-method', req, { method: req.method }); return res.status(405).end(); }
    const raw = req.originalUrl || '';
    if (raw.length > 4096 || /\.\.(\/|%2f|\\)|%00|\0/i.test(raw)) { log('traversal-or-oversize-url', req); return res.status(400).end(); }
    if (req.method === 'OPTIONS') return res.status(204).end(); // no CORS: same-origin app only
    next();
  });

  // ---------- CSRF (same-origin enforcement for writes) ----------
  const selfOrigins = req => {
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';
    return new Set([`https://${host}`, `http://${host}`, ...HOST_ALLOW]);
  };
  const csrfExempt = new Set(['/api/pay/payhere/notify', '/api/client-log']);
  app.use((req, res, next) => {
    if (!req.path.startsWith('/api/') || ['GET', 'HEAD'].includes(req.method) || csrfExempt.has(req.path)) return next();
    if ((req.headers.authorization || '').startsWith('Bearer ')) return next();
    const origin = req.headers.origin || (req.headers.referer ? (() => { try { return new URL(req.headers.referer).origin; } catch { return ''; } })() : '');
    if (!origin || !selfOrigins(req).has(origin)) { log('csrf-blocked', req, { origin: origin || 'none' }); return res.status(403).json({ error: 'Request blocked' }); }
    // JSON endpoints must be JSON (blocks simple-form CSRF/content sniffing); uploads/text endpoints are explicit.
    const ct = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const rawOk = ['/api/social/media', '/api/stt', '/api/tajweed/assess', '/api/scholar/docs'].includes(req.path);
    const hasBody = +(req.headers['content-length'] || 0) > 0 || req.headers['transfer-encoding'];
    if (hasBody && !rawOk && ct && ct !== 'application/json') { log('bad-content-type', req, { ct }); return res.status(415).json({ error: 'Unsupported content type' }); }
    next();
  });

  // ---------- Rate limiting (sliding window, in memory) ----------
  const buckets = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k); }, 60000).unref();
  const hit = (key, limit, windowMs) => {
    const now = Date.now(); let b = buckets.get(key);
    if (!b || b.reset < now) { b = { n: 0, reset: now + windowMs }; buckets.set(key, b); }
    b.n++; return { ok: b.n <= limit, retry: Math.ceil((b.reset - now) / 1000), n: b.n };
  };
  const limiter = (name, limit, windowMs, keyFn = req => ipOf(req)) => (req, res, next) => {
    const r = hit(`${name}:${keyFn(req)}`, limit, windowMs);
    if (!r.ok) { if (r.n === limit + 1) log('rate-limited', req, { bucket: name }); res.setHeader('Retry-After', r.retry); return res.status(429).json({ error: 'Too many requests. Please slow down and try again shortly.' }); }
    next();
  };
  app.use('/api/', limiter('api', 600, 60000));                       // 600 req/min per IP overall
  app.use('/ugc/', limiter('ugc', 900, 60000));
  app.use('/api/login', limiter('login-ip', 20, 15 * 60000));
  app.use('/api/register', limiter('register-ip', 8, 60 * 60000));
  app.use('/api/password/', limiter('reset-ip', 10, 60 * 60000));
  app.use('/api/social/media', limiter('upload-ip', 60, 60 * 60000));
  app.use('/api/social/posts', limiter('post-ip', 40, 60 * 60000));
  app.use('/api/pay/', limiter('pay-ip', 30, 60 * 60000));
  app.use('/api/chat', limiter('chat-ip', 40, 60000));
  app.use('/api/fyp', limiter('fyp-ip', 300, 60000));
  app.use('/api/social/messages', limiter('dm-ip', 60, 60000));
  app.use('/api/ads/', limiter('ads-ip', 120, 60000));

  // ---------- Login brute-force lockout (per email) ----------
  const fails = new Map(); // email -> {n, until}
  const lockKey = e => String(e || '').toLowerCase().trim().slice(0, 200);
  const loginGuard = (req, res, next) => {
    const k = lockKey(req.body?.email), f = fails.get(k);
    if (f && f.until > Date.now()) { log('login-locked', req, { email: k.replace(/(.{2}).*@/, '$1***@') }); res.setHeader('Retry-After', Math.ceil((f.until - Date.now()) / 1000)); return res.status(429).json({ error: 'Too many failed sign-in attempts. Try again in a few minutes or reset your password.' }); }
    const end = res.end; res.end = function (...a) {
      if (res.statusCode === 401) { const g = fails.get(k) || { n: 0, until: 0 }; g.n++; if (g.n >= 5) { g.until = Date.now() + Math.min(60, 2 ** (g.n - 5)) * 60000; log('login-lockout', req, { email: k.replace(/(.{2}).*@/, '$1***@'), fails: g.n }); } fails.set(k, g); }
      else if (res.statusCode < 300) fails.delete(k);
      return end.apply(this, a);
    };
    next();
  };

  // ---------- Input validation helpers ----------
  const validEmail = e => typeof e === 'string' && e.length <= 200 && /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}$/i.test(e.trim());
  const validRegister = (req, res, next) => {
    const b = req.body || {};
    if (!validEmail(b.email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 200) return res.status(400).json({ error: 'Use a password of at least 8 characters.' });
    if (/^(.)\1+$/.test(b.password) || ['password', '12345678', '123456789', 'qwertyui', '11111111', 'password1', 'iloveyou'].includes(b.password.toLowerCase())) return res.status(400).json({ error: 'That password is too easy to guess. Try a longer phrase.' });
    if (b.name != null && (typeof b.name !== 'string' || b.name.length > 80 || /[<>]/.test(b.name))) return res.status(400).json({ error: 'Please use a shorter name without < or >.' });
    next();
  };
  // Call AFTER the body parser: these validators need req.body.
  const bodyRules = () => {
    // Reject prototype-pollution keys anywhere in JSON bodies (first, before any handler reads the body).
    const bad = o => { if (!o || typeof o !== 'object') return false; for (const k of Object.keys(o)) { if (k === '__proto__' || k === 'constructor' || k === 'prototype') return true; if (typeof o[k] === 'object' && bad(o[k])) return true; } return false; };
    app.use('/api/', (req, res, next) => { if (req.body && typeof req.body === 'object' && bad(req.body)) { log('prototype-pollution', req); return res.status(400).json({ error: 'Invalid request' }); } next(); });
    app.post('/api/register', validRegister);
    app.post('/api/login', (req, res, next) => { const b = req.body || {}; if (typeof b.email !== 'string' || typeof b.password !== 'string' || b.password.length > 200 || b.email.length > 200) return res.status(400).json({ error: 'Incorrect email or password' }); next(); }, loginGuard);
  };
  return { onEvent: fn => hooks.push(fn), bodyRules, log, events, ipOf, limiter, validEmail, sha: s => crypto.createHash('sha256').update(s).digest('hex') };
};
