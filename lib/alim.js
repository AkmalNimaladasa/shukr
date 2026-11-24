// Alim — AI companion: streaming chat with tools (web search, memory, Quran/Hadith lookup), infinite memory (RAG), voice (STT/TTS).
const fs = require('fs');
const path = require('path');
const { chatModel, lexicalHistory, settleTitle } = require('./chat-policy');

const safety = require('./safety');
module.exports = function alim(ctx) {
  const { app, q, auth, wrap, aiGuard, AI_BASE, AI_KEY, FAST_MODEL, CHAT_MODEL, aiChat, parseJson, embed, embedFast, cosine, remember, recall, extractMemories, computeStats, statsBrief, localParts, todayFor } = ctx;
  const QAR = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'quran-ar.json')));
  const QEN = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'quran-en-pickthall.json')));
  const META = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'quran-meta.json')));

  const MODES = {
    coach: 'Role: gratitude & spiritual-growth COACH. Notice patterns in their data and memories, celebrate wins, gently challenge, give one small actionable step, ask a thoughtful follow-up.',
    teach: 'Role: TEACHER. Teach Islamic knowledge step by step, building on what they already learned (memories of kind "learned"). Short structured lessons, cite sources, end with one question to check understanding.',
    reflect: 'Role: REFLECTION GUIDE (muhasabah). One gentle question at a time: blessings noticed, patience shown, shortcomings to repent from, intentions for tomorrow.',
    istikhara: 'Role: help them think through a decision Islamically: the Istikhara prayer (2 rak‘ah nafl then the dua) and consulting trusted knowledgeable people (shura). List considerations without bias. Never claim to know the outcome or interpret dreams as signs.',
    fiqh: 'Role: FIQH RESEARCH ASSISTANT. Search the web for published fatwas/answers from recognised scholars and institutions, quote and link them, and note differences of madhhab. You never issue your own ruling.'
  };

  const TOOLS = [
    { type: 'web_search' },
    { type: 'function', function: { name: 'save_memory', description: 'Save a durable fact about the user to long-term memory (family, goals, struggles, preferences, wins, things learned). Use when the user shares something worth remembering.', parameters: { type: 'object', properties: { content: { type: 'string', description: 'Short third-person sentence' }, kind: { type: 'string', enum: ['fact', 'person', 'goal', 'struggle', 'preference', 'learned', 'win'] }, importance: { type: 'integer', minimum: 1, maximum: 5 } }, required: ['content'] } } },
    { type: 'function', function: { name: 'search_memory', description: "Search the user's entire history (all past conversations, journal entries, memories) for anything relevant. Use when the user refers to something from the past or you need context.", parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } },
    { type: 'function', function: { name: 'forget_memory', description: 'Delete a stored memory when the user asks you to forget something.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'What to forget' } }, required: ['query'] } } },
    { type: 'function', function: { name: 'quran_lookup', description: 'Get exact Quran text (Arabic + Yusuf Ali English) for a reference like "2:255" or "67:1-5". Always use this before quoting an ayah.', parameters: { type: 'object', properties: { ref: { type: 'string' } }, required: ['ref'] } } },
    { type: 'function', function: { name: 'hadith_search', description: 'Search authentic hadith collections (Bukhari, Muslim, Abu Dawud, Tirmidhi, Nasai, Ibn Majah, Malik, Nawawi 40) by keywords. Returns text with exact references.', parameters: { type: 'object', properties: { query: { type: 'string' }, book: { type: 'string', enum: ['any', 'bukhari', 'muslim', 'abudawud', 'tirmidhi', 'nasai', 'ibnmajah', 'malik', 'nawawi'] } }, required: ['query'] } } },
    { type: 'function', function: { name: 'app_data', description: "Read the user's own data from any part of the Shukr app to give personal answers: prayers, fasting, dhikr, istighfar, sunnah tracker, barakah checklist, wealth & budget, quests/creator stats, challenges & friends, Jummah/mosques they follow, Ramadan goals, journal and more. Call with section='all' for an overview, or a specific section name.", parameters: { type: 'object', properties: { section: { type: 'string', description: "'all' or one of the sections listed in the overview" } }, required: ['section'] } } },
    { type: 'function', function: { name: 'open_page', description: 'Offer the user a button that opens a page of the Shukr app (e.g. when they ask how to track something, want to pray, find a mosque, read an ayah, see their budget). Call this, then mention the button in your reply.', parameters: { type: 'object', properties: { path: { type: 'string', description: 'App route, e.g. /prayer, /quran/18, /tafsir/2/255, /ayah-finder, /seerah, /mosques, /jummah, /wealth, /barakah, /sunnah, /istighfar, /dhikr, /challenges, /achievements, /hajj, /ramadan, /timetable, /cards, /calendar, /zakat, /creator/analytics, /new-to-islam, /salah-guide, /halal-places, /hadith, /names, /journal' }, label: { type: 'string' } }, required: ['path', 'label'] } } },
    { type: 'function', function: { name: 'add_blessing', description: "Save a blessing to the user's Blessings jar when they express gratitude for something.", parameters: { type: 'object', properties: { text: { type: 'string' }, category: { type: 'string' } }, required: ['text'] } } }
  ];

  // ---------- Hadith search (downloaded once per book, cached on disk) ----------
  const HCACHE = {}; const HDIR = '/tmp/hadith-cache';
  async function loadBook(book) {
    if (HCACHE[book]) return HCACHE[book];
    fs.mkdirSync(HDIR, { recursive: true });
    const f = path.join(HDIR, book + '.json');
    let data;
    if (fs.existsSync(f)) data = JSON.parse(fs.readFileSync(f));
    else {
      const r = await fetch(`https://raw.githubusercontent.com/fawazahmed0/hadith-api/1/editions/eng-${book}.min.json`); // used only internally for search/grounding; never displayed verbatim in the UI
      if (!r.ok) throw new Error('hadith fetch ' + r.status);
      const j = await r.json();
      data = j.hadiths.filter(h => h.text && h.text.trim()).map(h => ({ n: h.hadithnumber, t: h.text, g: (h.grades || []).map(g => g.grade).slice(0, 2).join('; ') }));
      fs.writeFileSync(f, JSON.stringify(data));
    }
    HCACHE[book] = data; return data;
  }
  const BOOKNAMES = { bukhari: 'Sahih al-Bukhari', muslim: 'Sahih Muslim', abudawud: 'Sunan Abi Dawud', tirmidhi: "Jami' at-Tirmidhi", nasai: "Sunan an-Nasa'i", ibnmajah: 'Sunan Ibn Majah', malik: "Muwatta' Malik", nawawi: '40 Hadith an-Nawawi' };
  async function hadithSearch(query, book = 'any', limit = 6) {
    const books = book && book !== 'any' ? [book] : ['bukhari', 'muslim', 'nawawi', 'abudawud', 'tirmidhi'];
    const terms = query.toLowerCase().split(/\W+/).filter(w => w.length > 2 && !['the', 'and', 'for', 'with', 'about', 'that', 'hadith', 'prophet'].includes(w));
    const out = [];
    for (const b of books) {
      let data; try { data = await loadBook(b); } catch { continue; }
      for (const h of data) {
        const t = h.t.toLowerCase(); let sc = 0;
        for (const w of terms) if (t.includes(w)) sc += 1;
        if (sc >= Math.max(1, Math.ceil(terms.length * 0.4))) { if (terms.length > 1 && t.includes(terms.join(' '))) sc += 2; out.push({ ref: `${BOOKNAMES[b]} ${h.n}`, grade: h.g || (b === 'bukhari' || b === 'muslim' ? 'Sahih' : ''), text: h.t.slice(0, 900), sc }); }
      }
    }
    return out.sort((a, b) => b.sc - a.sc).slice(0, limit).map(({ sc, ...x }) => x);
  }
  ctx.hadithSearch = hadithSearch;
  // warm hadith cache at boot so first lookup is instant
  setTimeout(() => { for (const b of ['bukhari', 'muslim', 'nawawi', 'abudawud', 'tirmidhi']) loadBook(b).catch(() => {}); }, 3000);

  function quranLookup(ref) {
    const m = String(ref).match(/(\d+)\s*[:.]\s*(\d+)(?:\s*-\s*(\d+))?/);
    if (!m) return { error: 'Use format surah:ayah, e.g. 2:255' };
    const s = +m[1], a1 = +m[2], a2 = Math.min(+(m[3] || m[2]), a1 + 15);
    if (!QAR[s - 1] || !QAR[s - 1][a1 - 1]) return { error: 'Reference out of range' };
    const ay = []; for (let a = a1; a <= a2 && QAR[s - 1][a - 1]; a++) ay.push({ ayah: `${s}:${a}`, arabic: QAR[s - 1][a - 1], english_yusuf_ali: QEN[s - 1][a - 1] });
    return { surah: `${META.surahs[s - 1].en} (${META.surahs[s - 1].tr})`, ayat: ay };
  }
  ctx.quranLookup = quranLookup;

  // ---------- Infinite memory: vectorise every message, semantic search over all history ----------
  async function indexMessage(id, userId, content) {
    try { const [v] = await embed([content.slice(0, 4000)]); if (v) await q('INSERT INTO message_vectors(message_id,user_id,embedding) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [id, userId, v]); } catch {}
  }
  async function searchHistory(userId, query, k = 8, excludeConv = null, preVec) {
    const qv = preVec !== undefined ? preVec : (await embed([query.slice(0, 2000)]))[0];
    if (!qv) {
      const rows = (await q(`SELECT m.content, m.role, c.title, c.id cid FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.user_id=$1 AND c.id <> $2 ORDER BY m.id DESC LIMIT 600`, [userId, excludeConv || 0])).rows;
      const entries = (await q(`SELECT text FROM entries WHERE user_id=$1 ORDER BY created_at DESC LIMIT 400`, [userId])).rows;
      return lexicalHistory([...rows,...entries.map(e=>({content:e.text,src:'Past journal entry'}))], query, k);
    }
    const rows = (await q(`SELECT mv.message_id, mv.embedding, m.content, m.role, m.created_at, c.title, c.id cid FROM message_vectors mv
      JOIN messages m ON m.id=mv.message_id JOIN conversations c ON c.id=m.conversation_id WHERE mv.user_id=$1`, [userId])).rows;
    const ents = (await q(`SELECT id, text, to_char(day,'YYYY-MM-DD') d FROM entries WHERE user_id=$1 ORDER BY created_at DESC LIMIT 400`, [userId])).rows;
    const scored = rows.filter(r => r.cid !== excludeConv).map(r => ({ src: `chat "${r.title}" (${new Date(r.created_at).toISOString().slice(0, 10)}, ${r.role})`, text: r.content.slice(0, 600), s: cosine(qv, r.embedding) }));
    // journal entries: embed lazily (small set) using keyword fallback
    const terms = query.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    for (const e of ents) { const t = e.text.toLowerCase(); const hit = terms.filter(w => t.includes(w)).length; if (hit) scored.push({ src: `journal ${e.d}`, text: e.text.slice(0, 600), s: 0.3 + hit * 0.1 }); }
    return scored.sort((a, b) => b.s - a.s).slice(0, k).filter(x => x.s > 0.25);
  }
  ctx.searchHistory = searchHistory;

  // ---------- Coaching tiers ----------
  // Plus ($20): goal tracking + weekly check-ins. Mentor ($200): adds pattern recognition across journal, moods,
  // habits and chats, plus evidence-based psychology (CBT, motivational interviewing, habit science, values work).
  async function coachProfile(userId) {
    await q(`CREATE TABLE IF NOT EXISTS coach_profiles (user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ DEFAULT now())`);
    return (await q('SELECT data, updated_at FROM coach_profiles WHERE user_id=$1', [userId])).rows[0] || null;
  }
  function coachingBlock(tier, c) {
    const d = c.data || {};
    let out = `\n\nCOACHING (${tier >= 3 ? 'Life Mentor' : 'Memory Plus'} member):\nGoals they're working on: ${(d.goals || []).map(g => `${g.goal}${g.progress ? ` (${g.progress})` : ''}`).join('; ') || 'not set yet — gently help them name 1-3 goals'}.\nWhen relevant, check in on their goals, celebrate progress, and end with one small concrete next step.`;
    if (tier >= 3) out += `\nPATTERNS observed across their journal, moods, habits and chats (use carefully, never as a diagnosis):\n${(d.patterns || []).map(p => `- ${p}`).join('\n') || '- (still learning)'}\nTriggers: ${(d.triggers || []).join('; ') || 'unknown'}. What helps them: ${(d.helps || []).join('; ') || 'unknown'}. Core values: ${(d.values || []).join(', ') || 'unknown'}. Motivation style: ${d.motivation || 'unknown'}.
Coach like a skilled mentor: notice patterns and name them kindly ("I've noticed that…"), ask one powerful question at a time, use motivational interviewing (reflect, affirm, evoke their own reasons), CBT reframes for unhelpful thoughts, implementation intentions ("when X, I will Y"), habit stacking and tiny habits, and tie growth to their values and their deen. Hold them accountable warmly. You are not a therapist: if there are signs of crisis, self-harm, abuse or clinical depression, encourage professional help and local emergency services.`;
    return out;
  }
  async function refreshCoach(user, tier) {
    try {
      const prev = await coachProfile(user.id);
      if (prev && Date.now() - new Date(prev.updated_at).getTime() < (tier >= 3 ? 12 : 72) * 3600e3) return;
      const mems = (await q('SELECT kind, content FROM memories WHERE user_id=$1 ORDER BY importance DESC, created_at DESC LIMIT 150', [user.id])).rows;
      const entries = tier >= 3 ? (await q(`SELECT to_char(day,'Dy YYYY-MM-DD') d, mood, left(text,300) t FROM entries WHERE user_id=$1 ORDER BY created_at DESC LIMIT 60`, [user.id]).catch(() => ({ rows: [] }))).rows : [];
      const stats = tier >= 3 ? statsBrief(await computeStats(user)) : '';
      const schema = tier >= 3 ? '{"goals":[{"goal":"","progress":""}],"patterns":["specific recurring pattern with evidence, e.g. mood dips on Mondays after late nights"],"triggers":[""],"helps":[""],"values":[""],"motivation":"what drives them"}' : '{"goals":[{"goal":"","progress":""}]}';
      const out = await aiChat([{ role: 'system', content: `You maintain a private coaching profile for a member of a Muslim self-growth app. Use ONLY the evidence given; never invent. Merge with the previous profile. Return JSON ${schema}. Max 5 items per list.` },
        { role: 'user', content: `Previous: ${JSON.stringify(prev?.data || {})}\n\nMemories:\n${mems.map(m => `[${m.kind}] ${m.content}`).join('\n')}${entries.length ? `\n\nJournal (newest first):\n${entries.map(e => `${e.d} mood ${e.mood}: ${e.t}`).join('\n')}` : ''}${stats ? `\n\nHabit stats:\n${stats}` : ''}` }], { json: true, max_tokens: 1500, temperature: 0.2, model: tier >= 3 ? CHAT_MODEL : FAST_MODEL });
      const data = parseJson(out); if (!data) return;
      await q(`INSERT INTO coach_profiles(user_id,data,updated_at) VALUES($1,$2,now()) ON CONFLICT(user_id) DO UPDATE SET data=$2, updated_at=now()`, [user.id, data]);
    } catch (e) { console.log('coach err', e.message); }
  }
  ctx.coachProfile = coachProfile;
  async function lifeSummary(userId) {
    const r = (await q('SELECT life_summary FROM user_profile_ai WHERE user_id=$1', [userId])).rows[0];
    return r?.life_summary || '';
  }
  async function refreshSummaries(user, convId) {
    try {
      const msgs = (await q('SELECT id, role, content FROM messages WHERE conversation_id=$1 ORDER BY id', [convId])).rows;
      if (msgs.length >= 16) {
        const cs = (await q('SELECT summary, upto_id FROM conv_summaries WHERE conversation_id=$1', [convId])).rows[0];
        const older = msgs.slice(0, -10).filter(m => !cs || m.id > cs.upto_id);
        if (older.length >= 6) {
          const sum = await aiChat([{ role: 'system', content: 'Update a running summary of this conversation. Keep all key facts, decisions, advice given, and open questions. Max 250 words.' },
            { role: 'user', content: `Previous summary:\n${cs?.summary || '(none)'}\n\nNew messages:\n${older.map(m => `${m.role}: ${m.content.slice(0, 1200)}`).join('\n')}` }], { max_tokens: 1200 });
          await q(`INSERT INTO conv_summaries(conversation_id,summary,upto_id) VALUES($1,$2,$3) ON CONFLICT(conversation_id) DO UPDATE SET summary=$2, upto_id=$3, updated_at=now()`, [convId, sum, older.at(-1).id]);
        }
      }
      // life summary every ~10 user messages
      const n = (await q(`SELECT count(*)::int n FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.user_id=$1 AND m.role='user'`, [user.id])).rows[0].n;
      if (n % 10 === 0) {
        const mems = (await q('SELECT kind, content FROM memories WHERE user_id=$1 ORDER BY importance DESC, created_at DESC LIMIT 80', [user.id])).rows;
        const prev = await lifeSummary(user.id);
        const s = await aiChat([{ role: 'system', content: 'Write a compact profile of this person for their spiritual companion: who they are, family, work, goals, recurring struggles, strengths, how they like to be spoken to, and their growth journey so far. Max 200 words, third person.' },
          { role: 'user', content: `Previous profile:\n${prev || '(none)'}\n\nMemories:\n${mems.map(m => `[${m.kind}] ${m.content}`).join('\n')}` }], { max_tokens: 1200 });
        await q(`INSERT INTO user_profile_ai(user_id, life_summary) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET life_summary=$2, updated_at=now()`, [user.id, s]);
      }
    } catch (e) { console.log('summary err', e.message); }
  }

  function voicePrompt(user, mems, hasMemory, life, convSummary) {
    const s = user.settings || {}, lp = localParts(s.tz);
    return `You are Alim (عليم), a warm, wise Muslim companion in the Shukr app, speaking out loud to ${user.name || 'a friend'} (${lp.weekday} ${String(lp.hh).padStart(2, '0')}:${String(lp.mm).padStart(2, '0')}, ${s.city || 'location unknown'}).
RULES: Base religious content only on the Quran, authentic Sunnah and published scholarly answers. Never give your own fatwa — for halal/haram or fiqh details, give the general known position briefly and suggest asking a qualified scholar. Quote a hadith or ayah word-for-word ONLY if it appears in VERIFIED SOURCES below (name the collection, e.g. "in Sahih Muslim"); otherwise share the well-known meaning in your own words without a number. NEVER mention 'verified sources', tools, lookups, or what you can or can't quote — just speak naturally like a knowledgeable friend. Never invent references. Well-known Qur'anic duas (e.g. Rabbi ishrah li sadri, 20:25-28; Rabbi zidni ilma, 20:114) may be mentioned with their reference.
${safety.PROMPT}
${hasMemory ? `MEMORY: use what you know about them naturally.${life ? '\nPROFILE: ' + String(life).slice(0, 600) : ''}${mems?.length ? '\nMEMORIES:\n' + mems.slice(0, 8).map(m => '- ' + String(m.content).slice(0, 160)).join('\n') : ''}` : 'MEMORY: free plan — you do not remember past chats.'}${convSummary ? '\nEARLIER IN THIS CHAT: ' + String(convSummary).slice(0, 500) : ''}`;
  }
  function systemPrompt(user, mems, stats, mode, life, convSummary, deep, hasMemory = true) {
    const s = user.settings || {}, lp = localParts(s.tz);
    let hijri = ''; try { hijri = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric', timeZone: s.tz || 'UTC' }).format(new Date()); } catch {}
    return `You are Alim (عليم), a warm, wise and knowledgeable Muslim companion inside "Shukr", a gratitude & spiritual-growth app. You are as capable as a top general assistant (writing, planning, explaining, analysing, coding, everyday questions) while being grounded in Islam.

SOURCES & RELIGIOUS RULINGS — strict:
- Base religious content ONLY on the Quran, authentic Sunnah, and PUBLISHED fatwas/answers from recognised scholars and institutions (e.g. IslamQA, IslamWeb, SeekersGuidance, Dar al-Ifta al-Misriyyah, Permanent Committee (Lajnah), AMJA, Darul Uloom Deoband / Hanafi fatwa sites, Assembly of Muslim Jurists).
- NEVER issue your own fatwa or ruling. For any fiqh question (halal/haram, permissibility, worship details, money, marriage, etc.) use web_search to find published fatwas, then quote and LINK them, naming the scholar/institution, and mention differences of madhhab where they exist. If you cannot find a published answer, say so and advise asking a qualified local scholar.
- Before quoting an ayah, call quran_lookup for the exact text. Before quoting a hadith, use hadith_search (or a reliable source via web_search) and give the collection and number. Never invent references. If unsure of a grading, say so.
- ACCURACY: never present anything as Quran unless quran_lookup returned it (give surah:ayah). Never present anything as hadith unless hadith_search or a reliable source confirmed it — give the collection and number and its grading (sahih/hasan/da'if); never cite fabricated (mawdu') hadith as evidence. For the 99 Names use the well-known list (Tirmidhi 3507) and say that list's exact wording is graded weak by many scholars even though each Name is from Quran/Sunnah. For history and science, give established facts; if unsure, search or say you're not certain. It is always better to say "I'm not sure — please check with a scholar" than to guess.
${safety.PROMPT}

${hasMemory ? `TOOLS: use web_search for current events, facts you are unsure of, and fatwas; cite sources as markdown links. Use save_memory when the user shares durable facts. Use search_memory when they refer to the past. Use add_blessing when they express gratitude for something specific. Use app_data to look at the user's own records in any part of the app before giving personal advice (e.g. 'how am I doing', budgets, streaks, prayers), and open_page to give them a button to the right screen of the app.
MEMORY: You have unlimited long-term memory — every past conversation and journal entry is stored and searchable. Use the profile and memories naturally ("Last week you mentioned…"), don't recite them.` : 'TOOLS: use web_search for current events, facts you are unsure of, and fatwas; cite sources as markdown links.\nMEMORY: This user is on the free plan — you do NOT remember anything between conversations and cannot save memories. If they ask you to remember something or refer to an earlier chat, kindly say long-term memory is part of Shukr Premium, then help with what they share now.'}

${MODES[mode] || MODES.coach}
Tone preference: ${s.coachTone || 'gentle'}. ${deep ? 'Give thorough, well-structured answers.' : 'Keep replies concise for mobile (usually under 180 words) unless teaching or asked for detail.'} Use Markdown. Use Islamic phrases naturally, not excessively.

USER: ${user.name || 'friend'} | Local time: ${lp.weekday} ${lp.day} ${String(lp.hh).padStart(2, '0')}:${String(lp.mm).padStart(2, '0')} | Hijri: ${hijri} | Location: ${s.city || 'unknown'}

PROFILE: ${life || '(still getting to know them)'}

RELEVANT MEMORIES:
${mems.map(m => `- [${m.kind}] ${m.content}`).join('\n') || '- (none yet)'}
${convSummary ? `\nEARLIER IN THIS CONVERSATION (summary): ${convSummary}` : ''}

HABIT DATA:
${stats}`;
  }

  async function runTool(user, name, args, convId) {
    try {
      if (name === 'save_memory') { await remember(user.id, [{ content: args.content, kind: args.kind || 'fact', importance: args.importance || 3 }], 'chat'); return { saved: true }; }
      if (name === 'search_memory') {
        const [h, m] = await Promise.all([searchHistory(user.id, args.query, 8, convId), recall(user.id, args.query, 8)]);
        return { memories: m.map(x => `[${x.kind}] ${x.content}`), history: h };
      }
      if (name === 'forget_memory') {
        const m = await recall(user.id, args.query, 3); const del = m.filter(x => x.score > 1.6).slice(0, 2);
        for (const x of del) await q('DELETE FROM memories WHERE id=$1 AND user_id=$2', [x.id, user.id]);
        return { forgotten: del.map(x => x.content) };
      }
      if (name === 'quran_lookup') return quranLookup(args.ref);
      if (name === 'hadith_search') return { results: await hadithSearch(args.query, args.book) };
      if (name === 'app_data') {
        const reg = ctx.alimData || {}; const sec = String(args.section || 'all').toLowerCase();
        if (sec === 'all') { const out = { sections: Object.keys(reg) };
          for (const [k, fn] of Object.entries(reg)) { try { out[k] = await Promise.race([fn(user, { brief: true }), new Promise(r => setTimeout(() => r('(timeout)'), 2500))]); } catch (e) { out[k] = '(unavailable)'; } }
          return out; }
        const key = Object.keys(reg).find(k => k === sec || k.includes(sec) || sec.includes(k)); if (!key) return { error: 'Unknown section', sections: Object.keys(reg) };
        return { [key]: await reg[key](user, { brief: false }) };
      }
      if (name === 'open_page') { const path = String(args.path || '').trim(); if (!/^\/[a-z0-9\-\/]*(\?[\w=&%-]*)?$/i.test(path)) return { error: 'Invalid path' }; return { button: { path, label: String(args.label || 'Open').slice(0, 40) } }; }
      if (name === 'add_blessing') { await q('INSERT INTO blessings(user_id,text,category,day) VALUES($1,$2,$3,$4)', [user.id, String(args.text).slice(0, 300), args.category || 'other', todayFor(user)]); return { added: true }; }
      return { error: 'unknown tool' };
    } catch (e) { return { error: e.message }; }
  }

  // Streams a completion; returns {text, toolCalls}
  async function streamOnce(body, onDelta) {
    aiGuard();
    const r = await fetch(AI_BASE + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AI_KEY }, body: JSON.stringify({ ...body, stream: true }) });
    if (!r.ok) throw new Error('AI ' + r.status + ' ' + (await r.text()).slice(0, 300));
    const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '', text = ''; const calls = {}; let finish = null; const cites = [];
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop();
      for (const line of lines) {
        const l = line.trim(); if (!l.startsWith('data:')) continue; const data = l.slice(5).trim(); if (data === '[DONE]') continue;
        let j; try { j = JSON.parse(data); } catch { continue; }
        const ch = j.choices?.[0]; if (!ch) continue;
        if (ch.finish_reason) finish = ch.finish_reason;
        const d = ch.delta || {};
        for (const an of [...(d.annotations || []), ...(ch.message?.annotations || [])]) { const u = an.url_citation || an; if (u?.url && !cites.find(c => c.url === u.url)) cites.push({ url: u.url, title: u.title || '' }); }
        if (d.content) { text += d.content; onDelta(d.content); }
        for (const tc of d.tool_calls || []) {
          const k = tc.index ?? 0; calls[k] = calls[k] || { id: '', name: '', args: '' };
          if (tc.id) calls[k].id = tc.id; if (tc.function?.name) calls[k].name += tc.function.name; if (tc.function?.arguments) calls[k].args += tc.function.arguments;
        }
      }
    }
    return { text, toolCalls: Object.values(calls).filter(c => c.name), finish, cites };
  }

  function extractLinks(text) {
    const out = []; const re = /\[([^\]]{2,120})\]\((https?:\/\/[^)\s]+)\)/g; let m;
    while ((m = re.exec(text))) if (!out.find(o => o.url === m[2])) out.push({ title: m[1], url: m[2] });
    const re2 = /(?<!\()https?:\/\/[^\s)\]>"]+/g; while ((m = re2.exec(text))) if (!out.find(o => o.url === m[0])) out.push({ title: new URL(m[0]).hostname.replace('www.', ''), url: m[0] });
    return out.slice(0, 8);
  }

  app.post('/api/chat', auth, wrap(async (req, res) => {
    if (!AI_KEY) return res.status(503).json({ error: 'AI is not configured on the server' });
    let { conversationId, message, mode, attachments, deep, regenerate, editFromId, voice } = req.body;
    if (deep && ctx.memoryTier && !(await ctx.memoryTier(req.user).catch(() => 0))) deep = false; // deep thinking is premium
    if ((!message || !message.trim()) && !regenerate) return res.status(400).json({ error: 'empty' });
    let conv;
    if (conversationId) conv = (await q('SELECT * FROM conversations WHERE id=$1 AND user_id=$2', [conversationId, req.user.id])).rows[0];
    if (!conv) conv = (await q('INSERT INTO conversations(user_id,mode,title) VALUES($1,$2,$3) RETURNING *', [req.user.id, MODES[mode] ? mode : 'coach', (message || 'New chat').slice(0, 40)])).rows[0];
    if (regenerate) {
      const last = (await q(`SELECT id FROM messages WHERE conversation_id=$1 AND role='assistant' ORDER BY id DESC LIMIT 1`, [conv.id])).rows[0];
      if (last) await q('DELETE FROM messages WHERE id=$1', [last.id]);
    } else {
      if (editFromId) await q('DELETE FROM messages WHERE conversation_id=$1 AND id>=$2', [conv.id, editFromId]);
      const meta = attachments?.length ? { attachments: attachments.map(a => ({ type: a.type, name: a.name })) } : null;
      const ins = (await q('INSERT INTO messages(conversation_id,role,content,meta) VALUES($1,$2,$3,$4) RETURNING id', [conv.id, 'user', message, meta])).rows[0];
      indexMessage(ins.id, req.user.id, message);
    }
    const all = (await q('SELECT id, role, content FROM messages WHERE conversation_id=$1 ORDER BY id', [conv.id])).rows;
    const cs = (await q('SELECT summary, upto_id FROM conv_summaries WHERE conversation_id=$1', [conv.id])).rows[0];
    const hist = (cs ? all.filter(m => m.id > cs.upto_id) : all).slice(-24);
    const lastUser = [...all].reverse().find(m => m.role === 'user')?.content || '';
    // Speed: one embedding (cached, max 1.2s) shared by memory recall + history search; title generated in parallel
    const isFirst = !regenerate && all.filter(m => m.role === 'user').length <= 1;
    const titleP = isFirst ? aiChat([{ role: 'user', content: `Give a 2-5 word title (no quotes, no punctuation at the end) for a conversation starting with: "${(lastUser || '').slice(0, 300)}"` }], { max_tokens: 60 }).catch(() => '') : null;
    // Long-term memory is a paid feature ($8/mo). Without it Alim only sees the current conversation.
    const tier = ctx.memoryTier ? await ctx.memoryTier(req.user).catch(() => 0) : 3, hasMemory = tier >= 1;
    // Tier depth: Memory 14 memories / 4 past snippets · Plus 30 / 10 · Mentor 50 / 16 + coaching profile
    const K = [0, 14, 30, 50][tier], H = [0, 4, 10, 16][tier];
    const qvec = hasMemory && !voice ? await embedFast(lastUser) : null;     const [mems, stats, life, past, coach] = await Promise.all([hasMemory && !voice ? recall(req.user.id, lastUser, K, qvec) : hasMemory && voice ? recall(req.user.id, lastUser, Math.min(K, 8), null).catch(() => []) : [], computeStats(req.user), hasMemory ? lifeSummary(req.user.id) : '', hasMemory ? searchHistory(req.user.id, lastUser, H, conv.id, qvec).catch(() => []) : [], tier >= 2 ? coachProfile(req.user.id) : null]);
    // Plan abilities: Free = this chat only (no journal/habit data); Memory = memories + today's habits; Memory Plus = + weekly trends; Mentor = full patterns & coaching profile.
    const fullStats = statsBrief(stats).split('\n');
    const habit = !hasMemory ? '(not available on the free plan — answer from this conversation only)' : tier >= 3 ? fullStats.join('\n') : tier === 2 ? fullStats.filter(l => !/correlation/i.test(l)).join('\n') : fullStats.filter(l => /^(Streaks|Today done)/.test(l)).join('\n');
    // Voice: compact prompt (same safety + accuracy rules) so the first word comes ~1 s sooner.
    let sys = voice ? voicePrompt(req.user, mems, hasMemory, life, cs?.summary) : systemPrompt(req.user, mems, habit, conv.mode, life, cs?.summary, deep, hasMemory);
    if (tier >= 2 && coach) sys += coachingBlock(tier, coach);
    if (past.length) sys += `\n\nPOSSIBLY RELEVANT FROM PAST CONVERSATIONS/JOURNAL:\n${past.map(p => `- (${p.src}) ${p.text.slice(0, 300)}`).join('\n')}`;
    if (voice) sys += '\n\nVOICE MODE: your reply will be spoken aloud. Reply in 1-4 short conversational sentences, no markdown, no lists, no URLs. Start directly with the answer — never open with fillers like "Let me think", "Hmm", "Okay", "Great question" or "Let me check".';

    if (voice) { // pre-fetch verified sources locally (ms) so the model answers in ONE round with no tool calls
      const qq = String(lastUser || '').slice(0, 300).replace(/subhan\s*allah/gi, 'subhan allah glory').replace(/alhamdu\s*lillah/gi, 'praise allah').replace(/allahu\s*akbar/gi, 'allah greatest').replace(/astaghfirullah/gi, 'forgiveness').replace(/\b(what|is|the|of|a|an|about|can|i|my|me|do|does|how|why|when|for|to|in|on|and|or|read|say|saying|tell|please)\b/gi, ' ').replace(/\s+/g, ' ').trim(); let hs = [];
      try { hs = (await hadithSearch(qq, 'any', 3)).filter(Boolean); } catch {}
      const refs = [...qq.matchAll(/(\d{1,3})\s*[:.]\s*(\d{1,3})/g)].slice(0, 2).map(m => quranLookup(m[1] + ':' + m[2])).filter(x => x && !x.error);
      sys += '\n\nVERIFIED SOURCES for this question (you may quote ONLY these as hadith/Quran; otherwise speak generally without quoting or numbering):\n' + (hs.length ? hs.map(h => `- ${h.ref}${h.grade ? ' (' + h.grade + ')' : ''}: ${h.text.slice(0, 400)}`).join('\n') : '- (none for this question)') + (refs.length ? '\n' + refs.map(r => '- Quran ' + JSON.stringify(r).slice(0, 500)).join('\n') : '');
          }
    const messages = [{ role: 'system', content: sys }, ...(voice ? hist.slice(-10) : hist).map(m => ({ role: m.role, content: m.content }))];
    // attach images / pdf to the last user message
    if (attachments?.length && !regenerate) {
      const parts = [{ type: 'text', text: message }];
      for (const a of attachments.slice(0, 4)) {
        if (a.type?.startsWith('image/')) parts.push({ type: 'image_url', image_url: { url: a.data } });
        else if (a.type === 'application/pdf') parts.push({ type: 'file', file: { filename: a.name || 'file.pdf', file_data: a.data } });
        else if (a.text) parts[0].text += `\n\n[File ${a.name}]\n${a.text.slice(0, 20000)}`;
      }
      messages[messages.length - 1] = { role: 'user', content: parts };
    }

    res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache'); res.setHeader('X-Accel-Buffering', 'no'); res.flushHeaders?.();
    let closed = false; req.on('close', () => { closed = true; });
    const send = obj => { if (!closed) res.write(`data: ${JSON.stringify(obj)}\n\n`); };
    // Server-side crisis check: guarantees help lines are shown even if the model misses it.
    const risk = safety.assess(lastUser);
    if (risk) {
      const { lines } = safety.linesFor(req.user.settings || {});
      send({ type: 'crisis', kind: risk, lines: lines || [['Find a free helpline in your country', 'findahelpline.com']] });
      messages[0].content += `\n\nTHE USER'S LATEST MESSAGE SHOWS ${risk === 'abuse' ? 'THEY MAY BE IN DANGER FROM ABUSE' : 'SUICIDAL THOUGHTS OR SELF-HARM RISK'}. Follow the SAFETY rules above exactly. Include these numbers: ${(lines || [['findahelpline.com', '']]).map(l => l.join(': ')).join('; ')}. Keep it warm and short; ask if they are safe right now.`;
      console.log('SAFETY crisis-detected', JSON.stringify({ user: req.user.id, kind: risk }));
    }
    send({ type: 'meta', conversationId: conv.id, memoriesUsed: mems.length + past.length, memory: hasMemory });
    let full = ''; const toolLog = []; const webCites = [];
    // Fast model for everyday chat (≈3x quicker first word); full model for Deep thinking & fiqh questions
    const model = voice ? (process.env.ALIM_VOICE_MODEL || 'claude-haiku-5-5') : tier >= 3 ? CHAT_MODEL : chatModel({mode: conv.mode, deep, full: CHAT_MODEL, fast: process.env.ALIM_MODEL || FAST_MODEL});
    try {
      const maxRounds = voice ? 1 : 5;
      for (let round = 0; round < maxRounds; round++) {
        const { text, toolCalls, cites } = await streamOnce({ model, ...(voice ? { reasoning_effort: 'low' } : {}), max_tokens: voice ? 700 : deep ? 3000 : 1600, temperature: 0.5, messages, ...(voice ? {} : { tools: TOOLS.filter(t => !(voice || req.body.web === false) || t.type !== 'web_search').filter(t => hasMemory || !/^(save_memory|search_memory|forget_memory)$/.test(t.function?.name || '')).filter(t => hasMemory || !['save_memory', 'search_memory', 'forget_memory'].includes(t.function?.name)) }) }, t => { full += t; send({ type: 'delta', text: t }); });
        if (cites?.length) { for (const c of cites) if (!webCites.find(x => x.url === c.url)) webCites.push(c); if (!toolLog.find(t => t.name === 'web_search')) { toolLog.unshift({ name: 'web_search', args: {} }); send({ type: 'tool', name: 'web_search', args: {} }); } }
        if (!toolCalls.length) break;
        messages.push({ role: 'assistant', content: text || null, tool_calls: toolCalls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args || '{}' } })) });
        for (const c of toolCalls) {
          let args = {}; try { args = JSON.parse(c.args || '{}'); } catch {}
          send({ type: 'tool', name: c.name, args });
          const result = await runTool(req.user, c.name, args, conv.id);
          if (c.name === 'open_page' && result.button) { send({ type: 'button', ...result.button }); toolLog.push({ name: 'open_page', button: result.button }); }
          toolLog.push({ name: c.name, args });
          messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(result).slice(0, 12000) });
        }
        if (full && !full.endsWith('\n')) { full += '\n\n'; send({ type: 'delta', text: '\n\n' }); }
      }
      if (risk && full && !/(\d{3,}|findahelpline|emergency)/i.test(full)) { const add = '\n\n' + safety.crisisReply(risk, req.user.settings || {}).split('\n\n').slice(1, 2).join(''); full += add; send({ type: 'delta', text: add }); }
    } catch (e) { console.error('chat err', e.message); if (risk) { const fb = safety.crisisReply(risk, req.user.settings || {}); full = fb; send({ type: 'delta', text: fb }); } send({ type: 'error', error: /budget|cap|402|429/i.test(e.message) ? 'Alim has reached its usage limit for now. Please try again later.' : 'Alim could not answer right now. Please try again.' }); }
    const sources = [...webCites.map(c => ({ title: c.title || (() => { try { return new URL(c.url).hostname.replace('www.', ''); } catch { return c.url; } })(), url: c.url })), ...extractLinks(full)].filter((x, i, a) => a.findIndex(y => y.url === x.url) === i).slice(0, 10);
    if (sources.length) send({ type: 'sources', sources });
    let msgId = null;
    if (full) {
      msgId = (await q('INSERT INTO messages(conversation_id,role,content,meta) VALUES($1,$2,$3,$4) RETURNING id', [conv.id, 'assistant', full, { tools: toolLog, sources, buttons: toolLog.filter(t => t.name === 'open_page' && t.button).map(t => t.button) }])).rows[0].id;
      indexMessage(msgId, req.user.id, full);
    }
    await q('UPDATE conversations SET updated_at=now() WHERE id=$1', [conv.id]);
    if (titleP && full) {
      try { const t = await settleTitle(titleP); const title = (t || '').replace(/["*#]/g, '').trim().slice(0, 50); if (title) { await q('UPDATE conversations SET title=$1 WHERE id=$2', [title, conv.id]); send({ type: 'title', title }); } } catch {}
    }
    send({ type: 'done', messageId: msgId }); if (!closed) res.end();
    if (hasMemory && !regenerate && full) extractMemories(req.user.id, `User said: ${lastUser}\n\nAlim replied: ${full.slice(0, 1500)}`, 'chat');
    refreshSummaries(req.user, conv.id);
    if (tier >= 2) refreshCoach(req.user, tier);
  }));

  app.get('/api/conversations', auth, wrap(async (req, res) => {
    const qs = (req.query.q || '').trim();
    const r = qs
      ? await q(`SELECT DISTINCT c.id, c.title, c.mode, c.updated_at FROM conversations c LEFT JOIN messages m ON m.conversation_id=c.id WHERE c.user_id=$1 AND (c.title ILIKE $2 OR m.content ILIKE $2) ORDER BY c.updated_at DESC LIMIT 100`, [req.user.id, '%' + qs + '%'])
      : await q('SELECT id,title,mode,updated_at FROM conversations WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 200', [req.user.id]);
    res.json({ conversations: r.rows });
  }));
  app.get('/api/conversations/:id', auth, wrap(async (req, res) => {
    const c = (await q('SELECT * FROM conversations WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])).rows[0];
    if (!c) return res.status(404).json({ error: 'not found' });
    const m = await q('SELECT id,role,content,meta,created_at FROM messages WHERE conversation_id=$1 ORDER BY id', [c.id]);
    res.json({ conversation: c, messages: m.rows });
  }));
  app.delete('/api/conversations/:id', auth, wrap(async (req, res) => { await q('DELETE FROM conversations WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]); res.json({ ok: true }); }));
  app.patch('/api/conversations/:id', auth, wrap(async (req, res) => { await q('UPDATE conversations SET title=$1 WHERE id=$2 AND user_id=$3', [String(req.body.title || '').slice(0, 80), req.params.id, req.user.id]); res.json({ ok: true }); }));

  // ---------- Voice ----------
  // ---------- Voice: clean audio → Whisper (Islamic vocabulary hint) → fast AI correction; loud, normalised TTS ----------
  const { spawn } = require('child_process'); let FFB = null; try { FFB = process.env.FFMPEG || require('ffmpeg-static'); } catch {}
  const ffmpeg = (args, input) => new Promise((ok, bad) => { if (!FFB) return bad(new Error('no ffmpeg')); const p = spawn(FFB, ['-hide_banner', '-loglevel', 'error', ...args]); const out = []; let err = '';
    p.on('error', bad); p.stdout.on('data', d => out.push(d)); p.stderr.on('data', d => err += d); const t = setTimeout(() => p.kill('SIGKILL'), 30000);
    p.on('close', c => { clearTimeout(t); c === 0 ? ok(Buffer.concat(out)) : bad(new Error(err.slice(0, 200))); }); p.stdin.on('error', () => {}); p.stdin.end(input); });
  const VOCAB = 'Assalamu alaikum, Alim, Allah, SubhanAllah, Alhamdulillah, Allahu Akbar, InshaAllah, MashaAllah, JazakAllah khair, Bismillah, Astaghfirullah, Quran, surah, ayah, Al-Fatiha, Al-Baqarah, Ayat al-Kursi, Al-Ikhlas, Al-Falaq, An-Nas, Yasin, Al-Kahf, Al-Mulk, hadith, sunnah, Prophet Muhammad, salah, Fajr, Dhuhr, Asr, Maghrib, Isha, Tahajjud, Witr, wudu, dua, dhikr, adhkar, Ramadan, Eid, zakat, sadaqah, hajj, umrah, Jannah, Jahannam, akhirah, tawbah, iman, taqwa, sabr, shukr, halal, haram, masjid, imam, Shukr.';
  const fixPrompt = 'You fix speech-recognition errors for a Muslim app. The user is speaking to "Alim", an Islamic AI companion. Correct mis-heard words — especially Islamic terms (surah names, prayer names, Arabic phrases), names, numbers and grammar — using context. Keep the user\'s meaning and wording otherwise identical. Never answer or add anything. If it is already correct, return it unchanged. Output only the corrected transcript.';
  async function correct(text) {
    if (!text || text.length < 3) return text;
    try { aiGuard(); const r = await fetch(AI_BASE + '/chat/completions', { method: 'POST', signal: AbortSignal.timeout(6000), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AI_KEY },
        body: JSON.stringify({ model: process.env.STT_FIX_MODEL || 'claude-haiku-5-5', temperature: 0, max_tokens: 800, reasoning_effort: 'low', messages: [{ role: 'system', content: fixPrompt }, { role: 'user', content: text }] }) });
      const j = await r.json(); const out = (j.choices?.[0]?.message?.content || '').trim().replace(/^["“]|["”]$/g, '');
      return out && out.length < text.length * 2 + 40 ? out : text; } catch { return text; } }
  app.post('/api/stt', auth, express_raw(), wrap(async (req, res) => {
    if (!AI_KEY) return res.status(503).json({ error: 'AI not configured' });
    const buf = req.body; if (!buf || !buf.length) return res.status(400).json({ error: 'No audio received' });
    if (buf.length > 25 * 1024 * 1024) return res.status(413).json({ error: 'Recording too long' });
    if (buf.length < 1500) return res.json({ text: '' });
    const type = (req.headers['content-type'] || 'audio/webm').split(';')[0];
    // Clean the recording: band-limit, de-noise, level it, 16 kHz mono WAV (what Whisper is trained on).
    let file = buf, name = 'audio.' + (type.includes('mp4') || type.includes('m4a') || type.includes('aac') ? 'm4a' : type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : type.includes('mpeg') ? 'mp3' : 'webm'), ftype = type;
    if (!(req.query.fast && /webm|ogg|mp4|m4a|mpeg/.test(type))) { // fast voice mode: send the phone's Opus/AAC directly (no re-encode)
      try { file = await ffmpeg(['-i', 'pipe:0', '-af', req.query.fast ? 'highpass=f=80,lowpass=f=8000' : 'highpass=f=80,lowpass=f=8000,afftdn=nf=-25,dynaudnorm=f=150:g=15,loudnorm=I=-16:TP=-1.5', '-ar', '16000', '-ac', '1', '-f', 'wav', 'pipe:1'], buf); name = 'audio.wav'; ftype = 'audio/wav'; } catch (e) { console.log('stt clean', e.message); } }
    const fd = new FormData();
    fd.append('file', new Blob([file], { type: ftype }), name);
    fd.append('model', 'whisper-large-v3-turbo'); fd.append('temperature', '0');
    if (req.query.lang) fd.append('language', String(req.query.lang).slice(0, 5));
    fd.append('prompt', (String(req.query.prompt || '') + ' ' + VOCAB).slice(0, 800));
    const r = await fetch(AI_BASE + '/audio/transcriptions', { method: 'POST', signal: AbortSignal.timeout(45000), headers: { Authorization: 'Bearer ' + AI_KEY }, body: fd });
    if (!r.ok) return res.status(502).json({ error: 'Couldn’t hear that clearly — please try again.' });
    let text = ((await r.json()).text || '').trim();
    if (/^(thank you\.?|thanks for watching\.?|you)$/i.test(text) || text === VOCAB.slice(0, text.length)) text = ''; // Whisper hallucinations on silence
    if (text && req.query.fix !== '0') text = await correct(text);
    res.json({ text });
  }));
  const TTS_CACHE = new Map();
  // Streaming TTS for voice mode: <audio src> starts playing on the first packet (no blob download wait).
  app.get('/api/tts/stream', auth, wrap(async (req, res) => {
    if (!AI_KEY) return res.status(503).end();
    const text = String(req.query.text || '').replace(/[#*_`>\[\]]/g, '').replace(/https?:\S+/g, '').slice(0, 600);
    if (!text.trim()) return res.status(400).end();
    const voice = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].includes(req.query.voice) ? req.query.voice : 'onyx';
    const ck = voice + '|' + text; res.setHeader('Content-Type', 'audio/mpeg'); res.setHeader('Cache-Control', 'no-store');
    if (TTS_CACHE.has(ck)) return res.end(TTS_CACHE.get(ck));
    const r = await fetch(AI_BASE + '/audio/speech', { method: 'POST', signal: AbortSignal.timeout(45000), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AI_KEY }, body: JSON.stringify({ model: 'tts-1', voice, input: text, response_format: 'mp3' }) });
    if (!r.ok) return res.status(502).end();
    const chunks = []; const rd = r.body.getReader();
    for (;;) { const { value, done } = await rd.read(); if (done) break; const b = Buffer.from(value); chunks.push(b); res.write(b); }
    if (text.length < 120) { TTS_CACHE.set(ck, Buffer.concat(chunks)); if (TTS_CACHE.size > 300) TTS_CACHE.delete(TTS_CACHE.keys().next().value); }
    res.end();
  }));
  app.post('/api/tts', auth, wrap(async (req, res) => {
    if (!AI_KEY) return res.status(503).json({ error: 'AI not configured' });
    const text = String(req.body.text || '').replace(/[#*_`>\[\]]/g, '').replace(/\(https?:[^)]+\)/g, '').replace(/https?:\S+/g, '').slice(0, 3000);
    if (!text.trim()) return res.status(400).json({ error: 'empty' });
    const voice = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].includes(req.body.voice) ? req.body.voice : 'onyx';
    const ck = voice + '|' + text; if (text.length < 120 && TTS_CACHE.has(ck)) { res.setHeader('Content-Type', 'audio/mpeg'); res.setHeader('Cache-Control', 'no-store'); return res.end(TTS_CACHE.get(ck)); }
    const r = await fetch(AI_BASE + '/audio/speech', { method: 'POST', signal: AbortSignal.timeout(60000), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AI_KEY }, body: JSON.stringify({ model: 'tts-1', voice, input: text, speed: Math.min(1.5, Math.max(0.7, +req.body.speed || 1)), response_format: 'mp3' }) });
    if (!r.ok) return res.status(502).json({ error: 'Speech failed (' + r.status + ')' });
    if (req.body.fast) { // voice mode: stream bytes straight through so playback starts on the first packet
      res.setHeader('Content-Type', 'audio/mpeg'); res.setHeader('Cache-Control', 'no-store');
      const chunks = []; const rd = r.body.getReader();
      for (;;) { const { value, done } = await rd.read(); if (done) break; chunks.push(Buffer.from(value)); res.write(Buffer.from(value)); }
      if (text.length < 120) { TTS_CACHE.set(ck, Buffer.concat(chunks)); if (TTS_CACHE.size > 300) TTS_CACHE.delete(TTS_CACHE.keys().next().value); }
      return res.end();
    }
    let out = Buffer.from(await r.arrayBuffer());
    // Loud & clear: compress + normalise to -11 LUFS (phone-speaker friendly, no clipping).
    if (!req.body.fast) { try { out = await ffmpeg(['-i', 'pipe:0', '-af', 'acompressor=threshold=-22dB:ratio=4:attack=4:release=60:makeup=6,alimiter=limit=0.97', '-ar', '24000', '-b:a', '96k', '-f', 'mp3', 'pipe:1'], out); } catch (e) { console.log('tts loud', e.message); } }
    if (text.length < 120) { TTS_CACHE.set(ck, out); if (TTS_CACHE.size > 300) TTS_CACHE.delete(TTS_CACHE.keys().next().value); }
    res.setHeader('Content-Type', 'audio/mpeg'); res.setHeader('Cache-Control', 'no-store');
    res.end(out);
  }));

  // ---------- Hadith & Quran helpers for UI ----------
  app.get('/api/hadith/search', auth, wrap(async (req, res) => res.json({ results: await hadithSearch(String(req.query.q || ''), String(req.query.book || 'any'), 20) })));

  function express_raw() { return require('express').raw({ type: () => true, limit: '26mb' }); }
};
