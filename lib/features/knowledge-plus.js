// Feature: knowledge-plus — Ayah finder (AI topic search, verified), AI tafsir summaries (cached per ayah), Seerah timeline (static client data).
const fs = require('fs');
const path = require('path');

module.exports = function knowledgePlus(ctx) {
  const { app, q, auth, wrap, aiChat, parseJson, FAST_MODEL, CHAT_MODEL, todayFor } = ctx;
  const D = p => JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'data', p), 'utf8'));
  let META, AR, EN;
  const load = () => { if (!META) { META = D('quran-meta.json').surahs; AR = D('quran-ar.json'); EN = D('quran-en-pickthall.json'); } };
  const clean = s => String(s || '').replace(/^\uFEFF/, '');
  const valid = (s, a) => { load(); s = +s; a = +a; return Number.isInteger(s) && s >= 1 && s <= 114 && Number.isInteger(a) && a >= 1 && a <= META[s - 1].ayahs; };
  const verse = (s, a) => ({ s, a, ref: `${s}:${a}`, surah: META[s - 1].en, surahTr: META[s - 1].tr, surahAr: META[s - 1].ar, ar: clean(AR[s - 1][a - 1]), en: clean(EN[s - 1][a - 1]) });

  let ready;
  const ensure = () => ready ||= (async () => {
    await q(`CREATE TABLE IF NOT EXISTS kp_tafsir (surah INT NOT NULL, ayah INT NOT NULL, data JSONB NOT NULL, model TEXT, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(surah, ayah))`);
    await q(`CREATE TABLE IF NOT EXISTS kp_usage (user_id INT NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL, n INT NOT NULL DEFAULT 0, PRIMARY KEY(user_id, day, kind))`);
  })().catch(e => { ready = null; throw e; });

  const dayOf = user => { try { return todayFor(user); } catch { return new Date().toISOString().slice(0, 10); } };
  async function take(user, kind, limit) {
    const day = dayOf(user);
    const r = await q(`INSERT INTO kp_usage(user_id,day,kind,n) VALUES($1,$2,$3,1) ON CONFLICT(user_id,day,kind) DO UPDATE SET n=kp_usage.n+1 RETURNING n`, [user.id, day, kind]);
    if (r.rows[0].n > limit) { await q(`UPDATE kp_usage SET n=n-1 WHERE user_id=$1 AND day=$2 AND kind=$3`, [user.id, day, kind]); return false; }
    return true;
  }
  async function refund(user, kind) { await q(`UPDATE kp_usage SET n=GREATEST(0,n-1) WHERE user_id=$1 AND day=$2 AND kind=$3`, [user.id, dayOf(user), kind]).catch(() => {}); }

  // ---------- Ayah finder: topic search ----------
  app.post('/api/kp/find', auth, wrap(async (req, res) => {
    await ensure(); load();
    const query = String(req.body?.query || '').replace(/\s+/g, ' ').trim();
    if (query.length < 2 || query.length > 200) return res.status(400).json({ error: 'Describe a topic in 2–200 characters' });
    if (!(await take(req.user, 'find', 40))) return res.status(429).json({ error: 'You have used today’s 40 topic searches. Try again tomorrow, or search by keyword.' });
    let refs = [];
    try {
      const out = await aiChat([
        { role: 'system', content: 'You are a Quran index. Given a topic, feeling or description, return the most relevant Quran verses as JSON {"refs":[{"s":<surah number>,"a":<ayah number>,"why":"<max 12 words, original wording>"}]} with at most 8 entries, best first. Only cite verses you are certain about; never invent references. Return {"refs":[]} if the request is not about finding Quran verses.' },
        { role: 'user', content: query }
      ], { model: FAST_MODEL, json: true, max_tokens: 600, temperature: 0.2 });
      const j = parseJson(out) || {};
      refs = Array.isArray(j.refs) ? j.refs : Array.isArray(j) ? j : [];
    } catch (e) { await refund(req.user, 'find'); return res.status(502).json({ error: 'The topic search is unavailable right now. Try a keyword search.' }); }
    const seen = new Set(), results = [];
    for (const r of refs.slice(0, 12)) {
      let s = +r?.s, a = +r?.a;
      if ((!s || !a) && typeof r?.ref === 'string') [s, a] = r.ref.split(':').map(Number);
      if (!valid(s, a) || seen.has(s + ':' + a)) continue;
      seen.add(s + ':' + a);
      results.push({ ...verse(s, a), why: String(r.why || '').slice(0, 120) });
      if (results.length >= 8) break;
    }
    res.json({ results });
  }));

  // ---------- Tafsir ----------
  async function cached(s, a) { await ensure(); const r = await q('SELECT data FROM kp_tafsir WHERE surah=$1 AND ayah=$2', [s, a]); return r.rows[0]?.data || null; }
  ctx.kpTafsir = async (s, a) => { try { return valid(s, a) ? await cached(+s, +a) : null; } catch { return null; } };

  const str = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
  function sanitize(j) {
    return {
      summary: str(j.summary, 2000), context: str(j.context, 900),
      lessons: (Array.isArray(j.lessons) ? j.lessons : []).map(x => str(x, 300)).filter(Boolean).slice(0, 6),
      words: (Array.isArray(j.words) ? j.words : []).map(w => ({ ar: str(w?.ar, 40), meaning: str(w?.meaning, 160) })).filter(w => w.ar && w.meaning).slice(0, 6),
      note: str(j.note, 400)
    };
  }

  const inflight = new Map();
  app.get('/api/kp/tafsir/:s/:a', auth, wrap(async (req, res) => {
    if (!valid(req.params.s, req.params.a)) return res.status(400).json({ error: 'Unknown ayah' });
    const s = +req.params.s, a = +req.params.a;
    res.json({ verse: verse(s, a), tafsir: await cached(s, a) });
  }));
  app.post('/api/kp/tafsir', auth, wrap(async (req, res) => {
    const s = +req.body?.s, a = +req.body?.a;
    if (!valid(s, a)) return res.status(400).json({ error: 'Unknown ayah' });
    const hit = await cached(s, a);
    if (hit) return res.json({ verse: verse(s, a), tafsir: hit, cached: true });
    const key = s + ':' + a;
    if (!inflight.has(key)) {
      if (!(await take(req.user, 'tafsir', 30))) return res.status(429).json({ error: 'You have generated 30 tafsir summaries today. Already-explained verses still open instantly.' });
      const v = verse(s, a);
      const p = (async () => {
        const out = await aiChat([
          { role: 'system', content: 'You summarise classical Quran commentary (tafsir) for ordinary readers. Draw on the well-known classical mufassirun: Ibn Kathir, al-Tabari, al-Qurtubi and al-Sa\'di. Write everything in your OWN ORIGINAL English wording — never quote or reproduce any published translation of their works. Attribute views by name ("Ibn Kathir explains…"); where they differ, say so briefly. Mention occasion of revelation only if it is well established; otherwise say none is well known. Do not issue fiqh rulings; for legal matters note that scholars differ and to ask a scholar. Do not invent hadith; cite only well-known sahih hadith with their collection. Reply ONLY with JSON: {"summary":"120-220 words","context":"where it sits in the surah and any occasion of revelation, 1-3 sentences","lessons":["3-5 short practical lessons"],"words":[{"ar":"key Arabic word from the ayah","meaning":"its meaning and nuance"}],"note":"one sentence on any difference of opinion, or empty"}' },
          { role: 'user', content: `Surah ${v.surah} (${v.surahTr}) ${s}:${a}\nArabic: ${v.ar}\nPickthall: ${v.en}` }
        ], { model: CHAT_MODEL, json: true, max_tokens: 1500, temperature: 0.3 });
        const j = sanitize(parseJson(out) || {});
        if (!j.summary) throw new Error('empty');
        await q(`INSERT INTO kp_tafsir(surah,ayah,data,model) VALUES($1,$2,$3,$4) ON CONFLICT(surah,ayah) DO NOTHING`, [s, a, JSON.stringify(j), CHAT_MODEL]);
        return (await cached(s, a)) || j;
      })().finally(() => inflight.delete(key));
      p.user = req.user; inflight.set(key, p);
      try { return res.json({ verse: v, tafsir: await p }); }
      catch (e) { await refund(req.user, 'tafsir'); return res.status(502).json({ error: 'Could not prepare the tafsir right now. Please try again shortly.' }); }
    }
    try { res.json({ verse: verse(s, a), tafsir: await inflight.get(key) }); }
    catch { res.status(502).json({ error: 'Could not prepare the tafsir right now. Please try again shortly.' }); }
  }));
  app.get('/api/kp/usage', auth, wrap(async (req, res) => {
    await ensure();
    const r = await q('SELECT kind,n FROM kp_usage WHERE user_id=$1 AND day=$2', [req.user.id, dayOf(req.user)]);
    const by = Object.fromEntries(r.rows.map(x => [x.kind, x.n]));
    res.json({ find: { used: by.find || 0, limit: 40 }, tafsir: { used: by.tafsir || 0, limit: 30 } });
  }));
};
