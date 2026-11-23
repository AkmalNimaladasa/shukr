// Breach & attack detection for the developer. Turns raw security events into alerts with severity, stores them,
// and notifies developers (push + email when configured). Rules are deliberately simple and explainable.
const SCHEMA = [
`CREATE TABLE IF NOT EXISTS security_alerts (id SERIAL PRIMARY KEY, severity TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb, ip TEXT, created_at TIMESTAMPTZ DEFAULT now(), acknowledged_at TIMESTAMPTZ, ack_by INT)`,
`CREATE INDEX IF NOT EXISTS idx_sec_alerts_created ON security_alerts(created_at DESC)`,
`CREATE TABLE IF NOT EXISTS security_events (id BIGSERIAL PRIMARY KEY, type TEXT NOT NULL, ip TEXT, path TEXT, user_id INT, detail JSONB, created_at TIMESTAMPTZ DEFAULT now())`,
`CREATE INDEX IF NOT EXISTS idx_sec_events_created ON security_events(created_at DESC)`
];
// Which raw events to persist, and how serious each one is on its own.
const WEIGHT = { 'csrf-blocked': 1, 'bad-content-type': 1, 'traversal-or-oversize-url': 2, 'prototype-pollution': 3, 'rate-limited': 1, 'login-lockout': 2, 'login-locked': 1,
  'diag-key-denied': 3, 'admin-denied': 3, 'password-change-wrong-current': 1, 'account-delete-denied': 2, 'i18n-quota': 1, 'export-burst': 3, 'session-anomaly': 2, 'bad-upload': 2 };

module.exports = function breachWatch(ctx) {
  const { app, q, auth, wrap, sec } = ctx;
  let ready = null; const ensure = () => ready || (ready = SCHEMA.reduce((p, s) => p.then(() => q(s)), Promise.resolve()).catch(e => { ready = null; throw e; }));
  ensure().catch(() => {});
  const recent = new Map(); // rule:key -> last alert time (dedupe for 30 min)
  const win = new Map();    // sliding counters
  const bump = (k, ms) => { const now = Date.now(); const a = (win.get(k) || []).filter(t => now - t < ms); a.push(now); win.set(k, a); return a.length; };

  async function alert(severity, kind, title, detail = {}, ip = null) {
    const key = kind + ':' + (ip || detail.key || '');
    if (recent.has(key) && Date.now() - recent.get(key) < 30 * 60e3) return; recent.set(key, Date.now());
    await ensure();
    const row = (await q('INSERT INTO security_alerts(severity,kind,title,detail,ip) VALUES($1,$2,$3,$4,$5) RETURNING *', [severity, kind, title, detail, ip])).rows[0];
    console.log('SECURITY-ALERT', severity, kind, title);
    notify(row).catch(e => console.log('alert notify err', e.message));
  }
  ctx.securityAlert = alert;

  async function notify(a) {
    const emails = (ctx.adminEmails || []).map(e => e.toLowerCase());
    if (!emails.length) return;
    const admins = (await q('SELECT id,email FROM users WHERE lower(email) = ANY($1)', [emails])).rows;
    const icon = a.severity === 'critical' ? '🚨' : a.severity === 'high' ? '⚠️' : 'ℹ️';
    for (const u of admins) {
      if (ctx.pushUser && ['critical', 'high'].includes(a.severity)) await ctx.pushUser(u.id, { title: `${icon} Shukr security: ${a.title}`, body: 'Open the developer dashboard to review.', url: '/#/admin?tab=security', tag: 'sec-' + a.id, urgency: 'high' }).catch(() => {});
    }
    if (ctx.mailConfigured && ctx.mailConfigured() && ['critical', 'high'].includes(a.severity)) {
      for (const e of emails) await ctx.sendMail(e, `${icon} [Shukr] ${a.severity.toUpperCase()}: ${a.title}`,
        `${a.title}\n\nWhen: ${new Date(a.created_at).toISOString()}\nSource IP: ${a.ip || 'n/a'}\nDetails: ${JSON.stringify(a.detail, null, 2)}\n\nReview it in the developer dashboard → Security.\n\nRecommended: if this looks real, rotate secrets in the Roar console, sign everyone out (Security → Sign out all users), and check recent admin activity.`).catch(() => {});
    }
  }

  // ---------- Detection rules over the live event stream ----------
  sec.onEvent((ev, req) => {
    if (!WEIGHT[ev.type]) return;
    ensure().then(() => q('INSERT INTO security_events(type,ip,path,user_id,detail) VALUES($1,$2,$3,$4,$5)', [ev.type, ev.ip, ev.path, req?.user?.id || null, ev])).catch(() => {});
    const ip = ev.ip || 'unknown';
    // 1) Credential stuffing: lockouts on 3+ different accounts from one IP in 15 min, or 10+ platform-wide.
    if (ev.type === 'login-lockout') {
      const n = bump('lock:' + ip, 15 * 60e3), all = bump('lock:*', 15 * 60e3);
      if (n >= 3) alert('high', 'credential-stuffing', `Credential-stuffing attack from ${ip}`, { lockouts15m: n }, ip);
      if (all >= 10) alert('critical', 'credential-stuffing-wide', 'Widespread login attack across many accounts', { lockouts15m: all, key: 'wide' });
    }
    // 2) Probing: injection / traversal / pollution attempts.
    if (['traversal-or-oversize-url', 'prototype-pollution'].includes(ev.type) && bump('probe:' + ip, 10 * 60e3) >= 3) alert('high', 'probing', `Attack probing from ${ip}`, { lastPath: ev.path }, ip);
    // 3) Someone hammering developer-only endpoints or the diagnostics key.
    if (['admin-denied', 'diag-key-denied'].includes(ev.type) && bump('adm:' + ip, 30 * 60e3) >= 3) alert('high', 'admin-probing', `Repeated attempts to open developer-only data from ${ip}`, { path: ev.path, user: req?.user?.id || null }, ip);
    // 4) Cross-site forgery wave.
    if (ev.type === 'csrf-blocked' && bump('csrf:*', 10 * 60e3) >= 50) alert('medium', 'csrf-wave', 'Many cross-site requests were blocked', { key: 'csrf' });
    // 5) Possible data exfiltration: one account pulling bulk data repeatedly.
    if (ev.type === 'export-burst') alert('critical', 'data-exfiltration', 'Possible data exfiltration: bulk data downloads', ev, ip);
    if (ev.type === 'session-anomaly') alert('high', 'session-hijack', 'A session was used from a new country minutes after another — possible stolen login', ev, ip);
  });

  // Data export watch: >3 full exports by one user in an hour, or >20 platform-wide → exfiltration alert.
  app.use('/api/export', (req, res, next) => { const k = req.headers.cookie || req.ip; if (bump('exp:' + k, 3600e3) > 3 || bump('exp:*', 3600e3) > 20) sec.log('export-burst', req, { note: 'bulk export' }); next(); });
  // Admin route guard logs denials so probing shows up.
  app.use(['/api/admin', '/api/ummah/admin'], (req, res, next) => { const end = res.end; res.end = function (...a) { if (res.statusCode === 403 || res.statusCode === 401) sec.log('admin-denied', req); return end.apply(this, a); }; next(); });

  // Integrity watch every 10 min: unexpected new admin accounts, mass sign-ups (bot), sudden mass deletes.
  let lastUsers = null;
  setInterval(async () => {
    try {
      await ensure();
      const u = (await q(`SELECT count(*)::int n, count(*) FILTER (WHERE created_at > now() - interval '10 minutes')::int recent FROM users`)).rows[0];
      if (u.recent >= 200) alert('high', 'signup-flood', `${u.recent} sign-ups in 10 minutes — likely bots`, { key: 'signup' });
      if (lastUsers != null && lastUsers - u.n >= 25) alert('critical', 'mass-deletion', `${lastUsers - u.n} accounts disappeared in 10 minutes`, { before: lastUsers, after: u.n, key: 'del' });
      lastUsers = u.n;
      const mods = (await q(`SELECT count(*)::int n FROM profiles WHERE is_admin`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n;
      if (ctx._modCount != null && mods > ctx._modCount) alert('critical', 'privilege-escalation', 'A new community moderator/admin account appeared', { before: ctx._modCount, after: mods, key: 'mods' });
      ctx._modCount = mods;
      await q(`DELETE FROM security_events WHERE created_at < now() - interval '30 days'`);
    } catch (e) { console.log('breach tick', e.message); }
  }, 10 * 60e3).unref();

  // ---------- Developer API ----------
  const adminOnly = (req, res, next) => ctx.isAdmin && ctx.isAdmin(req.user) ? next() : res.status(403).json({ error: 'Developer access only' });
  app.get('/api/admin/security', auth, adminOnly, wrap(async (req, res) => {
    await ensure();
    const alerts = (await q('SELECT * FROM security_alerts ORDER BY created_at DESC LIMIT 100')).rows;
    const counts = (await q(`SELECT type, count(*)::int n FROM security_events WHERE created_at > now() - interval '24 hours' GROUP BY type ORDER BY n DESC`)).rows;
    const topIps = (await q(`SELECT ip, count(*)::int n FROM security_events WHERE created_at > now() - interval '24 hours' GROUP BY ip ORDER BY n DESC LIMIT 8`)).rows;
    res.json({ alerts, open: alerts.filter(a => !a.acknowledged_at).length, counts, topIps, email: !!(ctx.mailConfigured && ctx.mailConfigured()), push: !!(ctx.pushReady && ctx.pushReady()) });
  }));
  app.post('/api/admin/security/:id/ack', auth, adminOnly, wrap(async (req, res) => {
    await q('UPDATE security_alerts SET acknowledged_at=now(), ack_by=$2 WHERE id=$1', [+req.params.id, req.user.id]); res.json({ ok: true });
  }));
  app.post('/api/admin/security/test', auth, adminOnly, wrap(async (req, res) => {
    recent.delete('test:'); await alert('high', 'test', 'Test alert — notifications are working', { by: req.user.email, key: '' }); res.json({ ok: true });
  }));
  // Emergency button: sign every user out (e.g. after a suspected leak).
  app.post('/api/admin/security/revoke-all', auth, adminOnly, wrap(async (req, res) => {
    if (req.body?.confirm !== 'SIGN OUT EVERYONE') return res.status(400).json({ error: 'Type SIGN OUT EVERYONE to confirm' });
    const n = (await q('DELETE FROM sessions WHERE user_id <> $1', [req.user.id])).rowCount;
    await alert('critical', 'revoke-all', `Developer signed out all users (${n} sessions)`, { by: req.user.email, key: 'revoke' + Date.now() });
    res.json({ ok: true, revoked: n });
  }));
};
