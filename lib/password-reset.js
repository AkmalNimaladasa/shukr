// Password reset by emailed 6-digit code (Gmail SMTP with an app password).
// Env: SMTP_USER (e.g. akmal.yasaz@gmail.com), SMTP_PASS (16-char Gmail app password), optional SMTP_HOST/SMTP_PORT, MAIL_FROM.
const crypto = require('crypto');
const SCHEMA = `CREATE TABLE IF NOT EXISTS password_resets (
 email TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL, attempts INT NOT NULL DEFAULT 0,
 sent_count INT NOT NULL DEFAULT 1, window_start TIMESTAMPTZ NOT NULL DEFAULT now())`;
module.exports = function registerReset(ctx) {
  const { app, q, wrap, hashPass } = ctx;
  let ready = null; const ensure = () => ready || (ready = q(SCHEMA).catch(e => { ready = null; throw e; }));
  const USER = process.env.SMTP_USER || '', PASS = (process.env.SMTP_PASS || '').replace(/\s+/g, '');
  let transport = null;
  function mailer() {
    if (!USER || !PASS) return null;
    if (!transport) transport = require('nodemailer').createTransport({ host: process.env.SMTP_HOST || 'smtp.gmail.com', port: +(process.env.SMTP_PORT || 465), secure: +(process.env.SMTP_PORT || 465) === 465, auth: { user: USER, pass: PASS } });
    return transport;
  }
  const sha = s => crypto.createHash('sha256').update(s).digest('hex');
  const norm = e => String(e || '').toLowerCase().trim().slice(0, 200);
  ctx.mailConfigured = () => !!(USER && PASS);
  ctx.sendMail = async (to, subject, text, html) => { const t = mailer(); if (!t) throw new Error('Email is not configured'); await t.sendMail({ from: process.env.MAIL_FROM || `Shukr <${USER}>`, to, subject, text, html }); };

  app.post('/api/password/forgot', wrap(async (req, res) => {
    if (!ctx.dbReady()) return res.status(503).json({ error: 'Starting up, try again in a moment' });
    await ensure(); const email = norm(req.body?.email);
    const generic = { ok: true, message: 'If an account exists for that email, a 6-digit code is on its way.' };
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (!mailer()) return res.status(503).json({ error: 'Password reset by email isn’t available yet. Please contact support.' });
    const u = (await q('SELECT id FROM users WHERE email=$1', [email])).rows[0];
    if (!u) return res.json(generic);
    const prev = (await q('SELECT * FROM password_resets WHERE email=$1', [email])).rows[0];
    if (prev && new Date(prev.window_start) > new Date(Date.now() - 3600e3) && prev.sent_count >= 5) return res.status(429).json({ error: 'Too many codes requested. Try again in an hour.' });
    const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
    const reset = prev && new Date(prev.window_start) > new Date(Date.now() - 3600e3);
    await q(`INSERT INTO password_resets(email,code_hash,expires_at,attempts,sent_count,window_start) VALUES($1,$2,now()+interval '15 minutes',0,1,now())
      ON CONFLICT(email) DO UPDATE SET code_hash=$2, expires_at=now()+interval '15 minutes', attempts=0,
      sent_count=CASE WHEN $3 THEN password_resets.sent_count+1 ELSE 1 END, window_start=CASE WHEN $3 THEN password_resets.window_start ELSE now() END`, [email, sha(email + ':' + code), !!reset]);
    try {
      await ctx.sendMail(email, `${code} is your Shukr reset code`, `Your Shukr password reset code is ${code}. It expires in 15 minutes. If you didn't ask for this, you can ignore this email.`,
        `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px"><h2 style="margin:0 0 8px">Reset your Shukr password</h2><p style="color:#555">Enter this code in the app. It expires in 15 minutes.</p><div style="font-size:34px;font-weight:800;letter-spacing:8px;background:#FFF0F3;color:#E3164E;padding:16px;text-align:center;border-radius:14px">${code}</div><p style="color:#888;font-size:13px">If you didn’t ask for this, ignore this email — your password won’t change.</p></div>`);
    } catch (e) { console.log('reset mail failed', e.message); return res.status(502).json({ error: 'Couldn’t send the email right now. Try again shortly.' }); }
    res.json(generic);
  }));
  app.post('/api/password/reset', wrap(async (req, res) => {
    await ensure(); const email = norm(req.body?.email), code = String(req.body?.code || '').replace(/\D/g, ''), pw = String(req.body?.password || '');
    if (code.length !== 6) return res.status(400).json({ error: 'Enter the 6-digit code from the email.' });
    if (pw.length < 6) return res.status(400).json({ error: 'Use a password with 6 or more characters.' });
    const r = (await q('SELECT * FROM password_resets WHERE email=$1', [email])).rows[0];
    if (!r || new Date(r.expires_at) < new Date()) return res.status(400).json({ error: 'That code has expired. Request a new one.' });
    if (r.attempts >= 5) return res.status(429).json({ error: 'Too many wrong attempts. Request a new code.' });
    const ok = crypto.timingSafeEqual(Buffer.from(sha(email + ':' + code)), Buffer.from(r.code_hash));
    if (!ok) { await q('UPDATE password_resets SET attempts=attempts+1 WHERE email=$1', [email]); return res.status(400).json({ error: 'That code isn’t right. Check the email and try again.' }); }
    const u = (await q('SELECT id FROM users WHERE email=$1', [email])).rows[0]; if (!u) return res.status(400).json({ error: 'Account not found.' });
    await q('UPDATE users SET pass=$2 WHERE id=$1', [u.id, hashPass(pw)]);
    await q('DELETE FROM sessions WHERE user_id=$1', [u.id]);
    await q('DELETE FROM password_resets WHERE email=$1', [email]);
    await ctx.newSession(res, u.id);
    res.json({ ok: true });
  }));
};
module.exports.SCHEMA = SCHEMA;
