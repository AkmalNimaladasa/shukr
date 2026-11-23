// Interface translation: any language. Strings are translated once by the AI, cached in the database and shared by
// every user of that language, so cost stays tiny. Arabic scripture (Quran, names of Allah, du'a) is never sent.
const LANGS = require('../public/data/languages.json');
const CODES = new Set(LANGS.map(l => l.code));

module.exports = function i18n({ app, q, auth, wrap, aiChat, FAST_MODEL, sec }) {
  let ready = null;
  const ensure = () => ready || (ready = q(`CREATE TABLE IF NOT EXISTS ui_translations (lang TEXT NOT NULL, src TEXT NOT NULL, out TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY(lang, src))`).catch(e => { ready = null; throw e; }));
  const perUserDay = new Map(); // userId -> {day, n}
  const busy = new Map();       // lang -> Promise (one AI batch per language at a time)

  app.get('/api/i18n/languages', (req, res) => { res.setHeader('Cache-Control', 'public, max-age=86400'); res.json({ languages: LANGS }); });

  // Body: { lang, strings: [..] } → { map: {src: out} }
  app.post('/api/i18n/translate', auth, wrap(async (req, res) => {
    await ensure();
    const lang = String(req.body?.lang || ''), list = req.body?.strings;
    if (!CODES.has(lang) || lang === 'en') return res.status(400).json({ error: 'Unsupported language' });
    if (!Array.isArray(list) || list.length > 150) return res.status(400).json({ error: 'Too many strings' });
    const strs = [...new Set(list.filter(s => typeof s === 'string').map(s => s.trim()).filter(s => s.length >= 2 && s.length <= 400 && /[A-Za-z]/.test(s)))];
    if (!strs.length) return res.json({ map: {} });
    const have = (await q('SELECT src,out FROM ui_translations WHERE lang=$1 AND src = ANY($2)', [lang, strs])).rows;
    const map = Object.fromEntries(have.map(r => [r.src, r.out]));
    let missing = strs.filter(s => !(s in map));
    if (missing.length) {
      // Abuse guard: each account may trigger at most 2,500 new strings/day (the whole app is ~1,500).
      const day = new Date().toISOString().slice(0, 10), u = perUserDay.get(req.user.id) || { day, n: 0 }; if (u.day !== day) { u.day = day; u.n = 0; }
      if (u.n + missing.length > 2500) { sec?.log('i18n-quota', req, { user: req.user.id }); missing = []; }
      else { u.n += missing.length; perUserDay.set(req.user.id, u); }
    }
    if (missing.length) {
      const name = LANGS.find(l => l.code === lang).name;
      const prev = busy.get(lang) || Promise.resolve();
      const job = prev.then(async () => {
        const still = (await q('SELECT src FROM ui_translations WHERE lang=$1 AND src = ANY($2)', [lang, missing])).rows.map(r => r.src);
        const todo = missing.filter(s => !still.includes(s)); if (!todo.length) return;
        for (let i = 0; i < todo.length; i += 60) {
          const chunk = todo.slice(i, i + 60);
          const out = await aiChat([
            { role: 'system', content: `You translate the user interface of "Shukr", a Muslim social & spiritual app, from English to ${name} (${lang}). Return ONLY a JSON object mapping each input index to its translation, e.g. {"0":"…","1":"…"}. Rules: natural, short UI wording a native app would use; keep emoji, numbers, @handles, URLs, placeholders like {n} and symbols unchanged; keep brand names Shukr, Alim, TikTok, WhatsApp untranslated; use the standard local Islamic terms (e.g. salah/namaz, du'a, zakat) the way Muslims who speak ${name} say them; never add explanations.` },
            { role: 'user', content: JSON.stringify(Object.fromEntries(chunk.map((s, k) => [k, s]))) }
          ], { model: FAST_MODEL, json: true, max_tokens: 4000, temperature: 0.1 }).catch(() => null);
          let j = null; try { j = JSON.parse(String(out).replace(/^```(json)?|```$/g, '').trim()); } catch {}
          if (!j) continue;
          for (let k = 0; k < chunk.length; k++) { const t = j[k] ?? j[String(k)]; if (typeof t === 'string' && t.trim() && t.length < 800 && !/[<>]/.test(t)) await q('INSERT INTO ui_translations(lang,src,out) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [lang, chunk[k], t.trim()]); }
        }
      }).catch(e => console.error('i18n', e.message));
      busy.set(lang, job); await job; if (busy.get(lang) === job) busy.delete(lang);
      for (const r of (await q('SELECT src,out FROM ui_translations WHERE lang=$1 AND src = ANY($2)', [lang, missing])).rows) map[r.src] = r.out;
    }
    res.json({ map });
  }));
};
module.exports.LANGS = LANGS;
