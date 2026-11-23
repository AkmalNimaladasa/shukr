// Feedback (stored + emailed to the team when SMTP is configured) and 99 Names memorisation tracker.
const FEEDBACK_TO = 'akmal@terminusapp.ai';
module.exports = function feedbackNames(ctx) {
  const { app, q, auth, wrap } = ctx;
  let ready = null;
  const ensure = () => ready ||= q('CREATE TABLE IF NOT EXISTS feedback (id SERIAL PRIMARY KEY, user_id INT, email TEXT, kind TEXT, message TEXT, page TEXT, ua TEXT, rating INT, created_at TIMESTAMPTZ DEFAULT now())')
    .then(() => q('CREATE TABLE IF NOT EXISTS names_memorised (user_id INT, n INT, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(user_id, n))')).catch(e => { ready = null; throw e; });
  const hits = new Map();
  app.post('/api/feedback', auth, wrap(async (req, res) => { await ensure();
    const k = req.user.id, now = Date.now(), h = (hits.get(k) || []).filter(t => now - t < 3600e3); if (h.length >= 8) return res.status(429).json({ error: 'Thanks! You’ve sent a lot of feedback — please try again later.' }); h.push(now); hits.set(k, h);
    const kind = ['bug', 'idea', 'praise', 'content', 'other'].includes(req.body?.kind) ? req.body.kind : 'other';
    const message = String(req.body?.message || '').trim().slice(0, 4000); if (message.length < 3) return res.status(400).json({ error: 'Please write a little more.' });
    const rating = Number.isInteger(+req.body?.rating) && +req.body.rating >= 1 && +req.body.rating <= 5 ? +req.body.rating : null;
    const page = String(req.body?.page || '').slice(0, 200), ua = String(req.headers['user-agent'] || '').slice(0, 300);
    const r = (await q('INSERT INTO feedback(user_id,email,kind,message,page,ua,rating) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [k, req.user.email, kind, message, page, ua, rating])).rows[0];
    let emailed = false;
    if (ctx.mailConfigured?.() && ctx.sendMail) { try { await ctx.sendMail(FEEDBACK_TO, `[Shukr feedback #${r.id}] ${kind}${rating ? ' · ' + '★'.repeat(rating) : ''}`,
      `From: ${req.user.name || ''} <${req.user.email}> (user ${k})\nPage: ${page}\nDevice: ${ua}\n\n${message}`); emailed = true; } catch (e) { console.log('feedback mail', e.message); } }
    res.status(201).json({ ok: true, id: r.id, emailed });
  }));
  app.get('/api/admin/feedback', auth, wrap(async (req, res) => { if (!ctx.isAdmin?.(req.user)) return res.status(403).json({ error: 'Developer only' }); await ensure();
    res.json({ items: (await q('SELECT * FROM feedback ORDER BY created_at DESC LIMIT 300')).rows }); }));
  // 99 Names memorised tracker
  app.get('/api/names/memorised', auth, wrap(async (req, res) => { await ensure(); res.json({ memorised: (await q('SELECT n FROM names_memorised WHERE user_id=$1 ORDER BY n', [req.user.id])).rows.map(r => r.n) }); }));
  app.post('/api/names/memorised', auth, wrap(async (req, res) => { await ensure(); const n = +req.body?.n; if (!Number.isInteger(n) || n < 1 || n > 99) return res.status(400).json({ error: 'Invalid name' });
    if (req.body?.on === false) await q('DELETE FROM names_memorised WHERE user_id=$1 AND n=$2', [req.user.id, n]); else await q('INSERT INTO names_memorised(user_id,n) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.user.id, n]);
    res.json({ memorised: (await q('SELECT n FROM names_memorised WHERE user_id=$1 ORDER BY n', [req.user.id])).rows.map(r => r.n) }); }));
};
module.exports.FEEDBACK_TO = FEEDBACK_TO;
