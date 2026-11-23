// Scholars: separate scholar accounts, credential verification, fatwas, and paid consultations.
//
// Verification model (based on how ifta authority is established in practice — Dar al-Ifta al-Misriyyah, the
// International Islamic Fiqh Academy's ifta conditions, Takhassus fil-Ifta programmes, and ijazah/sanad checking):
//   • Teacher (ustadh/ustadha/'alim): may hold paid consultations and answer questions — NOT issue fatwas.
//       needs: a recognised Islamic-sciences qualification (Alimiyyah / Dars-e-Nizami / BA+ in Shariah or Usul
//       ad-Din from a recognised university) OR a traceable ijazah with sanad in a relevant science.
//   • Mufti: may also publish fatwas.
//       needs: everything above PLUS formal ifta training (Takhassus fil-Ifta, Dar al-Ifta mufti diploma, or an
//       equivalent supervised ifta programme) or a current/previous ifta post at a recognised institution.
//   Both need: government ID, documents, the issuing institution's contact for direct verification, two references
//   from known scholars, and a short video interview. Verification expires after 12 months.
// Documents are stored privately (never public URLs) and only the developer can open them.
const crypto = require('crypto');
const SCHEMA = [
`ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'member'`,
`CREATE TABLE IF NOT EXISTS scholars (user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL, title TEXT, tier_requested TEXT NOT NULL DEFAULT 'teacher', tier TEXT, status TEXT NOT NULL DEFAULT 'draft',
  madhhab TEXT, languages TEXT[] NOT NULL DEFAULT '{}', specialties TEXT[] NOT NULL DEFAULT '{}', bio TEXT, country TEXT,
  qualifications JSONB NOT NULL DEFAULT '[]'::jsonb, ijazat JSONB NOT NULL DEFAULT '[]'::jsonb, ifta JSONB NOT NULL DEFAULT '{}'::jsonb,
  references_ JSONB NOT NULL DEFAULT '[]'::jsonb, interview_at TIMESTAMPTZ, review_notes TEXT, reviewed_by INT, verified_at TIMESTAMPTZ, expires_at TIMESTAMPTZ,
  rate_text_usd NUMERIC(10,2) NOT NULL DEFAULT 15, rate_call_usd NUMERIC(10,2) NOT NULL DEFAULT 40, call_minutes INT NOT NULL DEFAULT 30, accepting BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`,
`CREATE TABLE IF NOT EXISTS scholar_docs (id TEXT PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, name TEXT, mime TEXT, data BYTEA NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`,
`CREATE TABLE IF NOT EXISTS fatwas (id SERIAL PRIMARY KEY, scholar_id INT REFERENCES users(id) ON DELETE CASCADE, question TEXT NOT NULL, answer TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '[]'::jsonb, madhhab TEXT, topic TEXT, status TEXT NOT NULL DEFAULT 'published', views INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`,
`CREATE TABLE IF NOT EXISTS consultations (id SERIAL PRIMARY KEY, scholar_id INT REFERENCES users(id) ON DELETE CASCADE, user_id INT REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, topic TEXT, question TEXT NOT NULL, price_usd NUMERIC(10,2) NOT NULL, scholar_usd NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_payment', order_id TEXT, scheduled_at TIMESTAMPTZ, call_link TEXT, rating INT, review TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), answered_at TIMESTAMPTZ, closed_at TIMESTAMPTZ)`,
`CREATE TABLE IF NOT EXISTS consultation_messages (id SERIAL PRIMARY KEY, consultation_id INT REFERENCES consultations(id) ON DELETE CASCADE, sender INT, body TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`
];
const TIERS = ['teacher', 'mufti'];
const MADHHABS = ['Hanafi', 'Maliki', "Shafi'i", 'Hanbali', 'Other / multiple'];
const SPECIALTIES = ['Fiqh of worship', 'Family & marriage', 'Finance & business', 'Inheritance', 'Aqidah', 'Quran & tafsir', 'Hadith', 'Tajweed & qira’at', 'Youth & counselling', 'New Muslims', 'Medical ethics', 'Women’s fiqh'];
const DOC_KINDS = ['id', 'degree', 'ijazah', 'ifta', 'transcript', 'other'];
// Marketplace model: the MEMBER pays the scholar's price; the scholar keeps the rest; Shukr keeps only this commission.
const PLATFORM_FEE = +(process.env.SCHOLAR_COMMISSION_PCT || process.env.SCHOLAR_FEE_PCT || 20) / 100;

module.exports = function scholars(ctx) {
  const { app, q, auth, wrap } = ctx;
  let ready = null; const ensure = () => ready || (ready = SCHEMA.reduce((p, s) => p.then(() => q(s)), Promise.resolve()).catch(e => { ready = null; throw e; }));
  const fail = (res, s, e) => res.status(s).json({ error: e });
  const clean = (v, n) => typeof v === 'string' ? v.replace(/[<>\u0000-\u0008]/g, '').trim().slice(0, n) : '';
  const isAdmin = u => ctx.isAdmin && ctx.isAdmin(u);
  const money = n => Math.round(+n * 100) / 100;
  const getS = async uid => (await q('SELECT * FROM scholars WHERE user_id=$1', [uid])).rows[0];
  const verified = s => s && s.status === 'verified' && (!s.expires_at || new Date(s.expires_at) > new Date());
  const pub = s => ({ userId: s.user_id, name: s.full_name, title: s.title, tier: s.tier, madhhab: s.madhhab, languages: s.languages, specialties: s.specialties, bio: s.bio, country: s.country,
    verifiedAt: s.verified_at, qualifications: (s.qualifications || []).map(x => ({ title: x.title, institution: x.institution, year: x.year })),
    rates: { text: +s.rate_text_usd, call: +s.rate_call_usd, minutes: s.call_minutes }, accepting: s.accepting });

  // ---------- Separate scholar sign-up ----------
  app.post('/api/scholar/register', wrap(async (req, res) => {
    await ensure(); const b = req.body || {};
    const email = clean(b.email, 200).toLowerCase(), name = clean(b.fullName, 80);
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return fail(res, 400, 'Enter a valid email address.');
    if (typeof b.password !== 'string' || b.password.length < 10) return fail(res, 400, 'Scholar accounts need a password of at least 10 characters.');
    if (name.length < 3) return fail(res, 400, 'Enter your full name as it appears on your certificates.');
    if ((await q('SELECT 1 FROM users WHERE email=$1', [email])).rows[0]) return fail(res, 409, 'An account with this email already exists. Sign in, then apply from Scholar portal.');
    const u = (await q(`INSERT INTO users(email,name,pass,settings,account_type) VALUES($1,$2,$3,$4,'scholar') RETURNING *`, [email, name, ctx.hashPass(b.password), ctx.defaultSettings()])).rows[0];
    await q('INSERT INTO scholars(user_id,full_name,tier_requested) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [u.id, name, TIERS.includes(b.tier) ? b.tier : 'teacher']);
    await ctx.newSession(res, u.id); res.json({ ok: true });
  }));
  // Existing member applying to become a scholar.
  app.post('/api/scholar/apply', auth, wrap(async (req, res) => {
    await ensure(); const name = clean(req.body?.fullName, 80) || req.user.name || '';
    if (name.length < 3) return fail(res, 400, 'Enter your full name as it appears on your certificates.');
    await q(`UPDATE users SET account_type='scholar' WHERE id=$1`, [req.user.id]);
    await q('INSERT INTO scholars(user_id,full_name,tier_requested) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [req.user.id, name, TIERS.includes(req.body?.tier) ? req.body.tier : 'teacher']);
    res.json({ ok: true });
  }));

  // ---------- Application ----------
  app.get('/api/scholar/me', auth, wrap(async (req, res) => {
    await ensure(); const s = await getS(req.user.id); if (!s) return res.json({ scholar: null, options: { TIERS, MADHHABS, SPECIALTIES, DOC_KINDS } });
    const docs = (await q('SELECT id,kind,name,mime,created_at FROM scholar_docs WHERE user_id=$1 ORDER BY created_at', [req.user.id])).rows;
    const earn = (await q(`SELECT COALESCE(sum(scholar_usd) FILTER (WHERE status IN ('answered','completed')),0)::float earned, count(*) FILTER (WHERE status IN ('paid','scheduled'))::int open FROM consultations WHERE scholar_id=$1`, [req.user.id])).rows[0];
    res.json({ scholar: { ...s, references: s.references_, verified: verified(s) }, docs, earnings: earn, netRate: 1 - PLATFORM_FEE, options: { TIERS, MADHHABS, SPECIALTIES, DOC_KINDS } });
  }));
  app.put('/api/scholar/me', auth, wrap(async (req, res) => {
    await ensure(); const s = await getS(req.user.id); if (!s) return fail(res, 404, 'Apply first');
    const b = req.body || {};
    const arr = (v, ok, n) => Array.isArray(v) ? v.filter(x => typeof x === 'string' && (!ok || ok.includes(x))).slice(0, n) : null;
    const list = (v, fields, n) => Array.isArray(v) ? v.slice(0, n).map(x => Object.fromEntries(fields.map(f => [f, clean(x?.[f], 200)]))).filter(x => Object.values(x).some(Boolean)) : null;
    const editingCreds = ['qualifications', 'ijazat', 'ifta', 'references', 'tier_requested', 'full_name'].some(k => b[k] !== undefined);
    if (editingCreds && s.status === 'verified') return fail(res, 400, 'Your credentials are verified. Contact support to change them.');
    const v = {
      full_name: b.full_name !== undefined ? clean(b.full_name, 80) : s.full_name, title: b.title !== undefined ? clean(b.title, 40) : s.title,
      tier_requested: TIERS.includes(b.tier_requested) ? b.tier_requested : s.tier_requested, madhhab: MADHHABS.includes(b.madhhab) ? b.madhhab : s.madhhab,
      languages: arr(b.languages, null, 8) || s.languages, specialties: arr(b.specialties, SPECIALTIES, 8) || s.specialties,
      bio: b.bio !== undefined ? clean(b.bio, 1200) : s.bio, country: b.country !== undefined ? clean(b.country, 60) : s.country,
      qualifications: list(b.qualifications, ['title', 'institution', 'year', 'registrar'], 8) || s.qualifications,
      ijazat: list(b.ijazat, ['subject', 'shaykh', 'sanad', 'year'], 8) || s.ijazat,
      ifta: b.ifta && typeof b.ifta === 'object' ? { programme: clean(b.ifta.programme, 160), institution: clean(b.ifta.institution, 160), supervisor: clean(b.ifta.supervisor, 120), year: clean(b.ifta.year, 10), post: clean(b.ifta.post, 200) } : s.ifta,
      references_: list(b.references, ['name', 'role', 'institution', 'contact'], 3) || s.references_,
      rate_text_usd: b.rate_text_usd != null ? Math.min(500, Math.max(5, +b.rate_text_usd || 15)) : s.rate_text_usd,
      rate_call_usd: b.rate_call_usd != null ? Math.min(1000, Math.max(10, +b.rate_call_usd || 40)) : s.rate_call_usd,
      call_minutes: [15, 30, 45, 60].includes(+b.call_minutes) ? +b.call_minutes : s.call_minutes, accepting: typeof b.accepting === 'boolean' ? b.accepting : s.accepting
    };
    await q(`UPDATE scholars SET full_name=$2,title=$3,tier_requested=$4,madhhab=$5,languages=$6,specialties=$7,bio=$8,country=$9,qualifications=$10,ijazat=$11,ifta=$12,references_=$13,
      rate_text_usd=$14,rate_call_usd=$15,call_minutes=$16,accepting=$17,updated_at=now() WHERE user_id=$1`,
      [req.user.id, v.full_name, v.title, v.tier_requested, v.madhhab, v.languages, v.specialties, v.bio, v.country, JSON.stringify(v.qualifications), JSON.stringify(v.ijazat), JSON.stringify(v.ifta), JSON.stringify(v.references_), v.rate_text_usd, v.rate_call_usd, v.call_minutes, v.accepting]);
    res.json({ ok: true });
  }));
  // Private document upload (raw body). Images or PDF, ≤ 8 MB, magic-byte checked.
  app.post('/api/scholar/docs', auth, require('express').raw({ type: () => true, limit: '8mb' }), wrap(async (req, res) => {
    await ensure(); const s = await getS(req.user.id); if (!s) return fail(res, 404, 'Apply first');
    const kind = DOC_KINDS.includes(req.query.kind) ? req.query.kind : 'other', buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length < 200) return fail(res, 400, 'Choose a file');
    const sig = buf.subarray(0, 8).toString('hex'); const mime = sig.startsWith('25504446') ? 'application/pdf' : sig.startsWith('ffd8ff') ? 'image/jpeg' : sig.startsWith('89504e47') ? 'image/png' : buf.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : null;
    if (!mime) return fail(res, 415, 'Upload a PDF, JPG, PNG or WebP');
    if ((await q('SELECT count(*)::int n FROM scholar_docs WHERE user_id=$1', [req.user.id])).rows[0].n >= 20) return fail(res, 400, 'Up to 20 documents');
    const id = crypto.randomUUID();
    await q('INSERT INTO scholar_docs(id,user_id,kind,name,mime,data) VALUES($1,$2,$3,$4,$5,$6)', [id, req.user.id, kind, clean(req.query.name, 120) || kind, mime, buf]);
    res.json({ id, kind, mime });
  }));
  app.delete('/api/scholar/docs/:id', auth, wrap(async (req, res) => { await q('DELETE FROM scholar_docs WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]); res.json({ ok: true }); }));
  app.post('/api/scholar/submit', auth, wrap(async (req, res) => {
    await ensure(); const s = await getS(req.user.id); if (!s) return fail(res, 404, 'Apply first');
    const docs = (await q('SELECT kind FROM scholar_docs WHERE user_id=$1', [req.user.id])).rows.map(r => r.kind);
    const miss = [];
    if (!docs.includes('id')) miss.push('a government ID');
    if (!(s.qualifications || []).length && !(s.ijazat || []).length) miss.push('at least one qualification or ijazah');
    if (!docs.some(k => ['degree', 'ijazah'].includes(k))) miss.push('a copy of your degree or ijazah');
    if ((s.qualifications || []).some(x => !x.registrar)) miss.push('the registrar / verification contact for each qualification');
    if ((s.references_ || []).length < 2) miss.push('two references from known scholars');
    if (s.tier_requested === 'mufti' && !(s.ifta?.programme || s.ifta?.post)) miss.push('your ifta training or ifta post');
    if (s.tier_requested === 'mufti' && !docs.includes('ifta')) miss.push('your ifta certificate or appointment letter');
    if (!s.madhhab || !(s.specialties || []).length) miss.push('your madhhab and specialties');
    if (miss.length) return fail(res, 400, 'Still needed: ' + miss.join(', ') + '.');
    await q(`UPDATE scholars SET status='submitted', updated_at=now() WHERE user_id=$1`, [req.user.id]);
    // Verification requests go to the Shukr team inbox.
    const to = process.env.SCHOLAR_REVIEW_EMAIL || 'akmal@terminusapp.ai', host = (req.headers['x-forwarded-proto'] || 'https') + '://' + req.headers.host;
    if (ctx.mailConfigured?.() && ctx.sendMail) ctx.sendMail(to, `[Shukr] Scholar verification request — ${s.full_name || req.user.name || req.user.email} (${s.tier_requested === 'mufti' ? 'Mufti' : 'Scholar/teacher'})`,
      `A scholar has submitted their application for verification.\n\nName: ${s.full_name || req.user.name || ''}\nEmail: ${req.user.email}\nTier requested: ${s.tier_requested || 'scholar'}\nMadhhab: ${s.madhhab || ''}\nSpecialties: ${(s.specialties || []).join(', ')}\nQualifications: ${(s.qualifications || []).map(x => [x.title, x.institution, x.year].filter(Boolean).join(', ')).join(' | ')}\nIjazat: ${(s.ijazat || []).length}\nReferences: ${(s.references_ || []).length}\nDocuments: ${docs.join(', ')}\n\nReview and verify: ${host}/#/admin/scholars\n(Sign in as the developer account to open the review page.)`).catch(e => console.log('scholar mail', e.message));
    else console.log('SCHOLAR-REVIEW pending for', req.user.email, '— email not configured (SMTP_USER/SMTP_PASS)');
    if (ctx.pushAdmins) ctx.pushAdmins({ title: 'New scholar application', body: `${s.full_name || req.user.email} wants to be verified`, url: '/#/admin/scholars' }).catch?.(() => {});
    res.json({ ok: true, status: 'submitted' });
  }));

  // ---------- Developer review ----------
  const adminOnly = (req, res, next) => isAdmin(req.user) ? next() : res.status(403).json({ error: 'Developer access only' });
  app.get('/api/admin/scholars', auth, adminOnly, wrap(async (req, res) => {
    await ensure();
    const rows = (await q(`SELECT s.*, u.email, (SELECT json_agg(json_build_object('id',d.id,'kind',d.kind,'name',d.name,'mime',d.mime)) FROM scholar_docs d WHERE d.user_id=s.user_id) docs FROM scholars s JOIN users u ON u.id=s.user_id ORDER BY CASE s.status WHEN 'submitted' THEN 0 WHEN 'interview' THEN 1 ELSE 2 END, s.updated_at DESC LIMIT 200`)).rows;
    res.json({ scholars: rows });
  }));
  app.get('/api/admin/scholar-docs/:id', auth, adminOnly, wrap(async (req, res) => {
    const d = (await q('SELECT mime,data,name FROM scholar_docs WHERE id=$1', [req.params.id])).rows[0]; if (!d) return res.status(404).end();
    res.setHeader('Content-Type', d.mime); res.setHeader('Content-Disposition', `inline; filename="${String(d.name).replace(/[^\w.-]/g, '_')}"`); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'"); res.end(d.data);
  }));
  app.post('/api/admin/scholars/:uid', auth, adminOnly, wrap(async (req, res) => {
    await ensure(); const b = req.body || {}, uid = +req.params.uid, s = await getS(uid); if (!s) return fail(res, 404, 'Not found');
    const notes = clean(b.notes, 2000);
    if (b.action === 'interview') await q(`UPDATE scholars SET status='interview', interview_at=$2, review_notes=$3, updated_at=now() WHERE user_id=$1`, [uid, b.at ? new Date(b.at) : null, notes]);
    else if (b.action === 'verify') {
      const tier = TIERS.includes(b.tier) ? b.tier : s.tier_requested;
      // Checklist must be confirmed by the reviewer — every item, not just a click.
      const need = ['idMatches', 'institutionConfirmed', 'referencesContacted', 'interviewPassed'].concat(tier === 'mufti' ? ['iftaConfirmed'] : []);
      const missing = need.filter(k => b.checks?.[k] !== true);
      if (missing.length) return fail(res, 400, 'Confirm every check first: ' + missing.join(', '));
      await q(`UPDATE scholars SET status='verified', tier=$2, review_notes=$3, reviewed_by=$4, verified_at=now(), expires_at=now()+interval '12 months', updated_at=now() WHERE user_id=$1`, [uid, tier, notes + '\n[checks] ' + JSON.stringify(b.checks), req.user.id]);
    } else if (b.action === 'reject') await q(`UPDATE scholars SET status='rejected', review_notes=$2, reviewed_by=$3, updated_at=now() WHERE user_id=$1`, [uid, notes, req.user.id]);
    else if (b.action === 'suspend') await q(`UPDATE scholars SET status='suspended', review_notes=$2, reviewed_by=$3, updated_at=now() WHERE user_id=$1`, [uid, notes, req.user.id]);
    else return fail(res, 400, 'Unknown action');
    res.json({ ok: true });
  }));

  // ---------- Public directory ----------
  app.get('/api/scholars', auth, wrap(async (req, res) => {
    await ensure();
    const rows = (await q(`SELECT s.*, (SELECT count(*)::int FROM fatwas f WHERE f.scholar_id=s.user_id AND f.status='published') fatwas,
      (SELECT round(avg(rating)::numeric,1) FROM consultations c WHERE c.scholar_id=s.user_id AND rating IS NOT NULL) rating
      FROM scholars s WHERE s.status='verified' AND (s.expires_at IS NULL OR s.expires_at > now()) ORDER BY s.tier='mufti' DESC, s.verified_at`)).rows;
    res.json({ scholars: rows.map(s => ({ ...pub(s), fatwas: s.fatwas, rating: s.rating ? +s.rating : null })) });
  }));
  app.get('/api/scholars/:uid', auth, wrap(async (req, res) => {
    await ensure(); const s = await getS(+req.params.uid); if (!verified(s)) return fail(res, 404, 'Scholar not found');
    const fatwas = (await q(`SELECT id,question,topic,madhhab,created_at FROM fatwas WHERE scholar_id=$1 AND status='published' ORDER BY created_at DESC LIMIT 50`, [s.user_id])).rows;
    res.json({ scholar: pub(s), fatwas });
  }));

  // ---------- Fatwas (verified muftis only) ----------
  app.post('/api/fatwas', auth, wrap(async (req, res) => {
    await ensure(); const s = await getS(req.user.id);
    if (!verified(s) || s.tier !== 'mufti') return fail(res, 403, 'Only verified muftis can publish fatwas.');
    const b = req.body || {}, question = clean(b.question, 2000), answer = clean(b.answer, 12000);
    const evidence = Array.isArray(b.evidence) ? b.evidence.slice(0, 15).map(e => ({ type: ['quran', 'hadith', 'scholar', 'other'].includes(e?.type) ? e.type : 'other', ref: clean(e?.ref, 200), text: clean(e?.text, 800) })).filter(e => e.ref) : [];
    if (question.length < 15 || answer.length < 80) return fail(res, 400, 'Write the full question and a complete answer.');
    if (!evidence.length) return fail(res, 400, 'Add at least one source (Quran, hadith with grading, or scholarly reference).');
    const r = (await q(`INSERT INTO fatwas(scholar_id,question,answer,evidence,madhhab,topic) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [req.user.id, question, answer, JSON.stringify(evidence), MADHHABS.includes(b.madhhab) ? b.madhhab : s.madhhab, clean(b.topic, 60)])).rows[0];
    res.json({ id: r.id });
  }));
  app.get('/api/fatwas', auth, wrap(async (req, res) => {
    await ensure(); const term = clean(req.query.q, 80);
    const rows = (await q(`SELECT f.id,f.question,f.topic,f.madhhab,f.created_at,f.views,s.full_name,s.title,s.user_id scholar_id FROM fatwas f JOIN scholars s ON s.user_id=f.scholar_id
      WHERE f.status='published' AND s.status='verified' ${term ? `AND (f.question ILIKE $1 OR f.answer ILIKE $1 OR f.topic ILIKE $1)` : ''} ORDER BY f.created_at DESC LIMIT 60`, term ? ['%' + term.replace(/[%_]/g, '') + '%'] : [])).rows;
    res.json({ fatwas: rows });
  }));
  app.get('/api/fatwas/:id', auth, wrap(async (req, res) => {
    await ensure(); const f = (await q(`SELECT f.*, s.full_name, s.title, s.tier, s.madhhab scholar_madhhab, s.verified_at FROM fatwas f JOIN scholars s ON s.user_id=f.scholar_id WHERE f.id=$1 AND f.status='published' AND s.status='verified'`, [+req.params.id])).rows[0];
    if (!f) return fail(res, 404, 'Fatwa not found'); q('UPDATE fatwas SET views=views+1 WHERE id=$1', [f.id]).catch(() => {}); res.json({ fatwa: f });
  }));
  app.post('/api/fatwas/:id/report', auth, wrap(async (req, res) => {
    await q(`UPDATE fatwas SET status=CASE WHEN status='published' THEN 'published' ELSE status END WHERE id=$1`, [+req.params.id]);
    ctx.securityAlert && ctx.securityAlert('medium', 'fatwa-report', `A fatwa was reported (#${+req.params.id})`, { reason: clean(req.body?.reason, 300), by: req.user.id, key: 'fatwa' + req.params.id });
    res.json({ ok: true });
  }));

  // ---------- Consultations (paid) ----------
  app.post('/api/consultations', auth, wrap(async (req, res) => {
    await ensure(); const b = req.body || {}, s = await getS(+b.scholarId);
    if (!verified(s) || !s.accepting) return fail(res, 400, 'This scholar is not taking consultations right now.');
    if (s.user_id === req.user.id) return fail(res, 400, 'You can’t book yourself.');
    const kind = b.kind === 'call' ? 'call' : 'text', question = clean(b.question, 4000);
    if (question.length < 20) return fail(res, 400, 'Describe your question in a few sentences.');
    const price = money(kind === 'call' ? s.rate_call_usd : s.rate_text_usd), scholarUsd = money(price * (1 - PLATFORM_FEE));
    const c = (await q(`INSERT INTO consultations(scholar_id,user_id,kind,topic,question,price_usd,scholar_usd) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [s.user_id, req.user.id, kind, clean(b.topic, 80), question, price, scholarUsd])).rows[0];
    // Payment uses the shared checkout (PayHere live, or demo mode).
    if (ctx.monetizeReady) await ctx.monetizeReady();
    if (ctx.createConsultationCheckout) { const r = await ctx.createConsultationCheckout(req, req.user, c.id, price, `Consultation with ${s.full_name}`); await q('UPDATE consultations SET order_id=$2 WHERE id=$1', [c.id, r.orderId]); return res.json({ id: c.id, checkout: r, price }); }
    res.json({ id: c.id, price });
  }));
  ctx.onConsultationPaid = async id => { await q(`UPDATE consultations SET status='paid' WHERE id=$1 AND status='awaiting_payment'`, [id]); const c = (await q('SELECT scholar_id FROM consultations WHERE id=$1', [id])).rows[0]; if (c && ctx.pushUser) ctx.pushUser(c.scholar_id, { title: 'New paid consultation', body: 'A member is waiting for your answer.', url: '/#/scholar' }).catch(() => {}); };
  app.get('/api/consultations', auth, wrap(async (req, res) => {
    await ensure();
    const mine = (await q(`SELECT c.id,c.scholar_id,c.kind,c.topic,c.question,c.price_usd,c.status,c.scheduled_at,c.call_link,c.rating,c.created_at, s.full_name scholar_name FROM consultations c JOIN scholars s ON s.user_id=c.scholar_id WHERE c.user_id=$1 ORDER BY c.created_at DESC LIMIT 50`, [req.user.id])).rows;
    const inbox = (await q(`SELECT c.*, u.name member_name FROM consultations c JOIN users u ON u.id=c.user_id WHERE c.scholar_id=$1 AND c.status<>'awaiting_payment' ORDER BY c.status='paid' DESC, c.created_at DESC LIMIT 100`, [req.user.id])).rows;
    res.json({ mine, inbox });
  }));
  const party = async (req, id) => { const c = (await q('SELECT * FROM consultations WHERE id=$1', [id])).rows[0]; if (!c || (c.user_id !== req.user.id && c.scholar_id !== req.user.id)) return null; return c; };
  app.get('/api/consultations/:id', auth, wrap(async (req, res) => {
    const c = await party(req, +req.params.id); if (!c) return fail(res, 404, 'Not found');
    const msgs = (await q('SELECT id,sender,body,created_at FROM consultation_messages WHERE consultation_id=$1 ORDER BY id', [c.id])).rows;
    const role = c.scholar_id === req.user.id ? 'scholar' : 'member'; if (role === 'member') delete c.scholar_usd;
    res.json({ consultation: c, messages: msgs, role });
  }));
  app.post('/api/consultations/:id/messages', auth, wrap(async (req, res) => {
    const c = await party(req, +req.params.id); if (!c) return fail(res, 404, 'Not found');
    if (!['paid', 'scheduled', 'answered'].includes(c.status)) return fail(res, 400, c.status === 'awaiting_payment' ? 'Complete payment first.' : 'This consultation is closed.');
    const body = clean(req.body?.body, 6000); if (!body) return fail(res, 400, 'Write a message');
    await q('INSERT INTO consultation_messages(consultation_id,sender,body) VALUES($1,$2,$3)', [c.id, req.user.id, body]);
    if (c.scholar_id === req.user.id && c.status === 'paid') await q(`UPDATE consultations SET status='answered', answered_at=now() WHERE id=$1`, [c.id]);
    const other = c.scholar_id === req.user.id ? c.user_id : c.scholar_id; ctx.pushUser && ctx.pushUser(other, { title: 'New consultation message', body: body.slice(0, 80), url: '/#/consult/' + c.id }).catch(() => {});
    res.json({ ok: true });
  }));
  app.post('/api/consultations/:id/schedule', auth, wrap(async (req, res) => {
    const c = await party(req, +req.params.id); if (!c || c.scholar_id !== req.user.id) return fail(res, 404, 'Not found');
    const at = new Date(req.body?.at), link = clean(req.body?.link, 300);
    if (isNaN(at) || at < new Date()) return fail(res, 400, 'Pick a future time');
    if (!/^https:\/\/(meet\.google\.com|[\w-]+\.zoom\.us|zoom\.us|teams\.microsoft\.com|whereby\.com|meet\.jit\.si)\//i.test(link)) return fail(res, 400, 'Use a Google Meet, Zoom, Teams, Whereby or Jitsi link');
    await q(`UPDATE consultations SET status='scheduled', scheduled_at=$2, call_link=$3 WHERE id=$1`, [c.id, at, link]); res.json({ ok: true });
  }));
  app.post('/api/consultations/:id/complete', auth, wrap(async (req, res) => {
    const c = await party(req, +req.params.id); if (!c || c.user_id !== req.user.id) return fail(res, 404, 'Not found');
    const rating = Math.min(5, Math.max(1, +req.body?.rating || 5));
    await q(`UPDATE consultations SET status='completed', rating=$2, review=$3, closed_at=now() WHERE id=$1 AND status IN ('answered','scheduled')`, [c.id, rating, clean(req.body?.review, 600)]); res.json({ ok: true });
  }));
  // Member protection: if a paid consultation gets no reply in 72 hours, the member can cancel and it's flagged for refund.
  app.post('/api/consultations/:id/cancel', auth, wrap(async (req, res) => {
    const c = await party(req, +req.params.id); if (!c || c.user_id !== req.user.id) return fail(res, 404, 'Not found');
    if (c.status === 'awaiting_payment') { await q(`UPDATE consultations SET status='cancelled', closed_at=now() WHERE id=$1`, [c.id]); return res.json({ ok: true }); }
    if (c.status !== 'paid' || Date.now() - new Date(c.created_at) < 72 * 3600e3) return fail(res, 400, 'You can cancel a paid consultation if the scholar hasn’t replied within 72 hours.');
    await q(`UPDATE consultations SET status='refund_requested', closed_at=now() WHERE id=$1`, [c.id]);
    ctx.securityAlert && ctx.securityAlert('low', 'refund', `Refund requested for consultation #${c.id} ($${c.price_usd})`, { key: 'refund' + c.id });
    res.json({ ok: true });
  }));
  ctx.scholarEarnings = async uid => (await q(`SELECT COALESCE(sum(scholar_usd),0)::float s FROM consultations WHERE scholar_id=$1 AND status IN ('answered','completed')`, [uid])).rows[0].s;
};
module.exports.SPECIALTIES = SPECIALTIES;
