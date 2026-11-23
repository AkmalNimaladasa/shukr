// Feature routes: Quran progress, bookmarks, hifz (SM-2), tajweed assessment, Ummah social, mosques, Muslim Pro times, pattern insights, audiobooks, fasting, zakat helper.
const fs = require('fs');
const path = require('path');
const tzLookup = require('tz-lookup');
const { validCoordinates } = require('../public/js/prayer-location');


// ffmpeg cleanup shared by recitation checks
const { spawn: _spawn } = require('child_process'); let _FF = null; try { _FF = process.env.FFMPEG || require('ffmpeg-static'); } catch {}
function cleanAudio(input) { return new Promise((ok, bad) => { if (!_FF) return bad(new Error('no ffmpeg'));
  const p = _spawn(_FF, ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-af', 'highpass=f=70,lowpass=f=7600,afftdn=nf=-28:tn=1,dynaudnorm=f=200:g=11:p=0.9,loudnorm=I=-16:TP=-1.5', '-ar', '16000', '-ac', '1', '-f', 'wav', 'pipe:1']);
  const out = []; let err = ''; const t = setTimeout(() => p.kill('SIGKILL'), 30000);
  p.on('error', bad); p.stdout.on('data', d => out.push(d)); p.stderr.on('data', d => err += d); p.stdin.on('error', () => {});
  p.on('close', code => { clearTimeout(t); code === 0 && out.length ? ok(Buffer.concat(out)) : bad(new Error(err.slice(0, 200) || 'ffmpeg ' + code)); }); p.stdin.end(input); }); }
module.exports = function features(ctx) {
  const { app, q, auth, wrap, AI_KEY, AI_BASE, FAST_MODEL, CHAT_MODEL, aiChat, parseJson, todayFor, addDays, recall, computeStats, statsBrief } = ctx;
  const META = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'quran-meta.json')));
  const QAR = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'quran-ar.json')));
  const PAGES = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'quran-pages.json')));
  const TOTAL_AYAT = 6236;

  // ---------------- QURAN PROGRESS ----------------
  async function getProg(uid) {
    let p = (await q('SELECT * FROM quran_progress WHERE user_id=$1', [uid])).rows[0];
    if (!p) p = (await q('INSERT INTO quran_progress(user_id) VALUES($1) RETURNING *', [uid])).rows[0];
    return p;
  }
  app.get('/api/quran/progress', auth, wrap(async (req, res) => {
    const u = req.user.id, today = todayFor(req.user), p = await getProg(u);
    const [cyc, tod, days, bysurah] = await Promise.all([
      q('SELECT count(*)::int n FROM quran_read WHERE user_id=$1 AND cycle=$2', [u, p.khatam_count]),
      q('SELECT count(*)::int n FROM quran_read WHERE user_id=$1 AND day=$2', [u, today]),
      q(`SELECT to_char(day,'YYYY-MM-DD') d, count(*)::int n FROM quran_read WHERE user_id=$1 AND day >= $2 GROUP BY day ORDER BY day`, [u, addDays(today, -29)]),
      q('SELECT surah, count(*)::int n FROM quran_read WHERE user_id=$1 AND cycle=$2 GROUP BY surah', [u, p.khatam_count])]);
    const dset = new Set((await q(`SELECT DISTINCT to_char(day,'YYYY-MM-DD') d FROM quran_read WHERE user_id=$1`, [u])).rows.map(r => r.d));
    let streak = 0, d = dset.has(today) ? today : addDays(today, -1); while (dset.has(d)) { streak++; d = addDays(d, -1); }
    const todayPages = new Set((await q('SELECT surah, ayah FROM quran_read WHERE user_id=$1 AND day=$2', [u, today])).rows.map(r => PAGES[r.surah - 1][r.ayah - 1])).size;
    res.json({ progress: p, cycleRead: cyc.rows[0].n, total: TOTAL_AYAT, pct: +(cyc.rows[0].n / TOTAL_AYAT * 100).toFixed(2), todayAyat: tod.rows[0].n, todayPages, streak, days: days.rows, bySurah: Object.fromEntries(bysurah.rows.map(r => [r.surah, r.n])) });
  }));
  // mark ayat as read (auto-tracking from reader visibility / audio playback)
  app.post('/api/quran/read', auth, wrap(async (req, res) => {
    const u = req.user.id, today = todayFor(req.user), p = await getProg(u);
    const items = (req.body.ayat || []).slice(0, 300).filter(a => a && QAR[a[0] - 1] && QAR[a[0] - 1][a[1] - 1]);
    let added = 0;
    for (const [s, a] of items) {
      const r = await q('INSERT INTO quran_read(user_id,surah,ayah,cycle,day) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING ayah', [u, s, a, p.khatam_count, today]);
      if (r.rows[0]) added++;
    }
    if (items.length) { const [ls, la] = items[items.length - 1]; await q('UPDATE quran_progress SET last_surah=$1,last_ayah=$2,updated_at=now() WHERE user_id=$3', [ls, la, u]); }
    const n = (await q('SELECT count(*)::int n FROM quran_read WHERE user_id=$1 AND cycle=$2', [u, p.khatam_count])).rows[0].n;
    let khatam = false;
    if (n >= TOTAL_AYAT) { await q('UPDATE quran_progress SET khatam_count=khatam_count+1 WHERE user_id=$1', [u]); khatam = true; }
    // keep legacy day_logs.quran_pages in sync for insights
    const pages = new Set((await q('SELECT surah, ayah FROM quran_read WHERE user_id=$1 AND day=$2', [u, today])).rows.map(r => PAGES[r.surah - 1][r.ayah - 1])).size;
    await q(`INSERT INTO day_logs(user_id,day,quran_pages) VALUES($1,$2,$3) ON CONFLICT(user_id,day) DO UPDATE SET quran_pages=GREATEST(day_logs.quran_pages,$3)`, [u, today, pages]);
    res.json({ added, cycleRead: n, khatam, todayPages: pages });
  }));
  app.put('/api/quran/prefs', auth, wrap(async (req, res) => {
    await getProg(req.user.id);
    const { translation, reciter, daily_goal, last_surah, last_ayah } = req.body;
    await q(`UPDATE quran_progress SET translation=COALESCE($1,translation), reciter=COALESCE($2,reciter), daily_goal=COALESCE($3,daily_goal),
      last_surah=COALESCE($4,last_surah), last_ayah=COALESCE($5,last_ayah) WHERE user_id=$6`, [translation || null, reciter || null, daily_goal || null, last_surah || null, last_ayah || null, req.user.id]);
    res.json({ ok: true });
  }));

  // ---------------- BOOKMARKS ----------------
  app.get('/api/bookmarks', auth, wrap(async (req, res) => {
    const r = await q('SELECT * FROM bookmarks WHERE user_id=$1 AND ($2::text IS NULL OR kind=$2) ORDER BY created_at DESC', [req.user.id, req.query.kind || null]);
    res.json({ bookmarks: r.rows });
  }));
  app.post('/api/bookmarks', auth, wrap(async (req, res) => {
    const { kind, ref, title, note } = req.body; if (!kind || !ref) return res.status(400).json({ error: 'kind and ref required' });
    const ex = (await q('SELECT id FROM bookmarks WHERE user_id=$1 AND kind=$2 AND ref=$3', [req.user.id, kind, ref])).rows[0];
    if (ex && req.body.toggle) { await q('DELETE FROM bookmarks WHERE id=$1', [ex.id]); return res.json({ removed: true }); }
    await q('INSERT INTO bookmarks(user_id,kind,ref,title,note) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,kind,ref) DO UPDATE SET title=$4, note=$5', [req.user.id, kind, ref, title || null, note || null]);
    res.json({ saved: true });
  }));
  app.delete('/api/bookmarks/:id', auth, wrap(async (req, res) => { await q('DELETE FROM bookmarks WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]); res.json({ ok: true }); }));

  // ---------------- HIFZ (SM-2 spaced repetition) ----------------
  app.get('/api/hifz', auth, wrap(async (req, res) => {
    const u = req.user.id, today = todayFor(req.user);
    const items = (await q(`SELECT surah, ayah, status, ease, interval_days, reps, to_char(due,'YYYY-MM-DD') due, to_char(last_review,'YYYY-MM-DD') last_review FROM hifz_items WHERE user_id=$1 ORDER BY surah, ayah`, [u])).rows;
    const due = items.filter(i => i.due && i.due <= today);
    const memorised = items.filter(i => i.status === 'memorised').length;
    const bySurah = {}; for (const i of items) { const b = bySurah[i.surah] = bySurah[i.surah] || { total: META.surahs[i.surah - 1].ayahs, added: 0, memorised: 0 }; b.added++; if (i.status === 'memorised') b.memorised++; }
    // juz memorised (approximate by ayah count per juz)
    res.json({ items, due, dueCount: due.length, memorised, added: items.length, bySurah, pctQuran: +(memorised / TOTAL_AYAT * 100).toFixed(2) });
  }));
  app.post('/api/hifz/add', auth, wrap(async (req, res) => {
    const s = +req.body.surah, from = +req.body.from || 1, to = Math.min(+req.body.to || META.surahs[s - 1]?.ayahs || 1, META.surahs[s - 1]?.ayahs || 1);
    if (!META.surahs[s - 1]) return res.status(400).json({ error: 'Invalid surah' });
    const today = todayFor(req.user); let n = 0;
    for (let a = from; a <= to; a++) { const r = await q(`INSERT INTO hifz_items(user_id,surah,ayah,status,due) VALUES($1,$2,$3,'learning',$4) ON CONFLICT DO NOTHING RETURNING ayah`, [req.user.id, s, a, today]); if (r.rows[0]) n++; }
    res.json({ added: n });
  }));
  app.post('/api/hifz/review', auth, wrap(async (req, res) => {
    // grade: 0 forgot, 3 hard, 4 good, 5 easy (SM-2)
    const { surah, ayah } = req.body; const g = Math.max(0, Math.min(5, +req.body.grade));
    const it = (await q('SELECT * FROM hifz_items WHERE user_id=$1 AND surah=$2 AND ayah=$3', [req.user.id, surah, ayah])).rows[0];
    if (!it) return res.status(404).json({ error: 'not in hifz list' });
    let { ease, interval_days: iv, reps } = it;
    if (g < 3) { reps = 0; iv = 1; } else { reps += 1; iv = reps === 1 ? 1 : reps === 2 ? 3 : Math.round(iv * ease); }
    ease = Math.max(1.3, ease + (0.1 - (5 - g) * (0.08 + (5 - g) * 0.02)));
    const today = todayFor(req.user), due = addDays(today, iv);
    const status = reps >= 4 && iv >= 14 ? 'memorised' : g < 3 ? 'needs_review' : 'learning';
    await q('UPDATE hifz_items SET ease=$1, interval_days=$2, reps=$3, due=$4, last_review=$5, status=$6 WHERE user_id=$7 AND surah=$8 AND ayah=$9', [ease, iv, reps, due, today, status, req.user.id, surah, ayah]);
    res.json({ status, due, interval: iv });
  }));
  app.post('/api/hifz/set', auth, wrap(async (req, res) => {
    const { surah, ayah, status } = req.body; if (!['new', 'learning', 'memorised', 'needs_review'].includes(status)) return res.status(400).json({ error: 'bad status' });
    const today = todayFor(req.user);
    await q(`INSERT INTO hifz_items(user_id,surah,ayah,status,due,reps,interval_days) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,surah,ayah) DO UPDATE SET status=$4, due=$5, reps=$6, interval_days=$7`,
      [req.user.id, surah, ayah, status, status === 'memorised' ? addDays(today, 14) : today, status === 'memorised' ? 4 : 0, status === 'memorised' ? 14 : 0]);
    res.json({ ok: true });
  }));
  app.delete('/api/hifz/:surah', auth, wrap(async (req, res) => { await q('DELETE FROM hifz_items WHERE user_id=$1 AND surah=$2', [req.user.id, +req.params.surah]); res.json({ ok: true }); }));

  // ---------------- TAJWEED ASSESSMENT ----------------
  const stripAr = s => String(s || '').normalize('NFC')
    .replace(/\u0670/g, 'ا') // dagger alif (Uthmani) -> full alif, as spoken
    .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06ED\u08D3-\u08FF\u0640]/g, '') // harakat, tatweel, quranic marks
    .replace(/اا+/g, 'ا')
    .replace(/[ٱأإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ء/g, '')
    .replace(/[^\u0621-\u064A\s]/g, ' ').replace(/\s+/g, ' ').trim();
  function wordDiff(target, said) {
    const A = stripAr(target).split(' ').filter(Boolean), B = stripAr(said).split(' ').filter(Boolean);
    const n = A.length, m = B.length, dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = 0; i <= n; i++) dp[i][0] = i; for (let j = 0; j <= m; j++) dp[0][j] = j;
    const lev = (a, b) => { const m = a.length, n = b.length; let prev = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return prev[n]; };
    const norm = w => w.replace(/^ال/, '').replace(/[اوي]/g, ''); // ignore long-vowel spelling differences when judging "close"
    const sim = (x, y) => { if (x === y) return 0; if (norm(x) === norm(y)) return 0; const d = lev(x, y) / Math.max(x.length, y.length); return d <= 0.34 ? 0.5 : 1; };
    for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + sim(A[i - 1], B[j - 1]));
    const ops = []; let i = n, j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + sim(A[i - 1], B[j - 1])) { const c = sim(A[i - 1], B[j - 1]); ops.unshift({ t: c === 0 ? 'ok' : c === 0.5 ? 'close' : 'wrong', w: A[i - 1], s: B[j - 1], idx: i - 1 }); i--; j--; }
      else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) { ops.unshift({ t: 'missed', w: A[i - 1], idx: i - 1 }); i--; }
      else { ops.unshift({ t: 'extra', s: B[j - 1] }); j--; }
    }
    const ok = ops.filter(o => o.t === 'ok').length + ops.filter(o => o.t === 'close').length * 0.5;
    return { ops, score: n ? Math.round(ok / n * 100) : 0, words: n };
  }
  ctx.wordDiff = wordDiff;
  app.post('/api/tajweed/assess', auth, require('express').raw({ type: () => true, limit: '20mb' }), wrap(async (req, res) => {
    if (!AI_KEY) return res.status(503).json({ error: 'AI not configured' });
    const s = +req.query.surah, a1 = +req.query.ayah, a2 = Math.min(+(req.query.to || a1), a1 + 9);
    if (!QAR[s - 1] || !QAR[s - 1][a1 - 1]) return res.status(400).json({ error: 'Invalid ayah' });
    const target = QAR[s - 1].slice(a1 - 1, a2).join(' ');
    const buf = req.body; if (!buf || buf.length < 1000) return res.status(400).json({ error: 'Recording too short — hold the mic and recite' });
    const type = (req.headers['content-type'] || 'audio/webm').split(';')[0];
    const ext = type.includes('mp4') || type.includes('aac') ? 'm4a' : type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : type.includes('mpeg') ? 'mp3' : 'webm';
    // Clean & level the recording (raw mic, no phone DSP): band-pass for voice, gentle FFT denoise, loudness normalise, 16 kHz mono WAV.
    let file = buf, fname = 'rec.' + ext, ftype = type;
    try { file = await cleanAudio(buf); fname = 'rec.wav'; ftype = 'audio/wav'; } catch (e) { console.log('tajweed clean', e.message); }
    const fd = new FormData(); fd.append('file', new Blob([file], { type: ftype }), fname); fd.append('model', process.env.TAJWEED_STT_MODEL || 'whisper-large-v3-turbo'); fd.append('language', 'ar'); fd.append('temperature', '0');
    fd.append('prompt', stripAr(target).slice(0, 400));
    const r = await fetch(AI_BASE + '/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + AI_KEY }, body: fd });
    if (!r.ok) { console.log('tajweed stt', r.status, (await r.text()).slice(0, 200)); return res.status(502).json({ error: r.status === 413 ? 'That recording is too long. Recite one ayah at a time.' : 'Our recitation checker is busy. Please try again in a moment.' }); }
    const transcript = ((await r.json()).text || '').trim();
    const diff = wordDiff(target, transcript);
    let feedback = '';
    if (!transcript) return res.status(422).json({ error: 'We couldn’t hear any recitation. Move somewhere quieter, hold the phone about 15–20 cm from your mouth, and recite clearly at a steady pace.', code: 'unclear' });
    // Constructive, word-specific feedback. Speech recognition reliably tells us WHICH words were missed, changed or
    // added; it cannot hear madd counts or ghunnah, so tajweed notes are phrased as "check" items for those words.
    const issues = diff.ops.filter(o => o.t !== 'ok');
    let fb = null;
    try {
      const out = await aiChat([{ role: 'system', content: `You are a kind, precise Quran teacher (Hafs 'an 'Asim). A student recited an ayah; automatic speech recognition compared it with the text word by word.
For EACH listed issue write one short constructive correction: what was heard vs what the word should be, and exactly how to fix it (the letter, its makhraj, the haraka, or the tajweed rule that applies to that word, e.g. "the ح comes from the middle of the throat — breathy, not ه"). Never claim to have heard madd length or ghunnah; for those say "check that you…". Also list which tajweed rules apply in this ayah (rule + word) so the student can self-check.
Return JSON {"notes":[{"i":<issue index>,"note":"…","rule":"short rule name or empty"}],"rules":[{"word":"…","rule":"…","how":"…"}],"strengths":"one line about what they did well","focus":"the one thing to practise next","encouragement":"one warm line"}` },
        { role: 'user', content: `Ayah ${s}:${a1}${a2 > a1 ? '-' + a2 : ''}\nText: ${target}\nHeard: ${transcript}\nAccuracy: ${diff.score}%\nIssues:\n${issues.map((o, k) => `${k}. ${o.t}: ${o.t === 'extra' ? `added "${o.s}"` : o.t === 'missed' ? `skipped "${o.w}"` : `"${o.w}" sounded like "${o.s}"`}`).join('\n') || 'none'}` }],
        { json: true, max_tokens: 1800, temperature: 0.2 });
      fb = parseJson(out);
    } catch (e) { console.log('tajweed feedback err', e.message); }
    if (fb) {
      (fb.notes || []).forEach(n => { const o = issues[n.i]; if (o) { o.note = String(n.note || '').slice(0, 260); o.rule = String(n.rule || '').slice(0, 60); } });
      diff.rules = (fb.rules || []).slice(0, 6).map(r => ({ word: String(r.word || '').slice(0, 40), rule: String(r.rule || '').slice(0, 50), how: String(r.how || '').slice(0, 200) }));
      diff.strengths = fb.strengths ? [String(fb.strengths).slice(0, 200)] : [];
      diff.focus = String(fb.focus || '').slice(0, 300); diff.encouragement = String(fb.encouragement || '').slice(0, 200);
    }
    feedback = [diff.focus, ...issues.map(o => o.note).filter(Boolean)].filter(Boolean).join('\n');
    await q('INSERT INTO tajweed_attempts(user_id,surah,ayah,transcript,score,feedback) VALUES($1,$2,$3,$4,$5,$6)', [req.user.id, s, a1, transcript, diff.score, feedback]);
    res.json({ target, transcript, ...diff, feedback });
  }));
  app.get('/api/tajweed/history', auth, wrap(async (req, res) => {
    res.json({ attempts: (await q('SELECT id,surah,ayah,score,created_at FROM tajweed_attempts WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [req.user.id])).rows });
  }));

  // Prayer times are always calculated by Shukr (no third-party timetable scraping).
  ctx.muslimPro = null;
  app.get('/api/muslimpro', auth, (req, res) => res.json({ data: null }));
  app.get('/api/geocode', auth, wrap(async (req, res) => {
    const name = String(req.query.q || '').slice(0, 80); if (!name) return res.json({ results: [] });
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=8&language=en`);
    const j = await r.json();
    res.json({ results: (j.results || []).filter(x => validCoordinates(x.latitude, x.longitude)).map(x => ({ id: x.id, name: x.name, country: x.country, countryCode: x.country_code, admin: x.admin1, lat: x.latitude, lng: x.longitude, tz: tzLookup(x.latitude, x.longitude) })) });
  }));
  app.get('/api/reverse-city', auth, wrap(async (req, res) => {
    if (!validCoordinates(req.query.lat, req.query.lng)) return res.status(400).json({ error: 'Valid lat/lng required' });
    const lat = +req.query.lat, lng = +req.query.lng;
    // Resolve from the actual GPS coordinate, not the device or a nearby city.
    // City services are optional: offline geocoding must not break prayer times.
    const result = { lat, lng, tz: tzLookup(lat, lng), id: null, name: null, country: null, countryCode: null };
    try {
      const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`, { signal: AbortSignal.timeout(4000) });
      if (r.ok) {
        const g = await r.json();
        result.name = g.city || g.locality || null;
        result.country = g.countryName || null;
        result.countryCode = g.countryCode || null;
      }
    } catch {}
    // GPS keeps precise coordinates and calculated times, not a nearby city's
    // published schedule. Manual city search can opt into that city schedule.
    res.json({ result });
  }));

  // ---------------- MOSQUES (OpenStreetMap / Overpass) ----------------
  const mosqueCache = new Map();
  app.get('/api/mosques', auth, wrap(async (req, res) => {
    const lat = +req.query.lat, lng = +req.query.lng, rad = Math.min(+req.query.r || 4000, 15000);
    if (!isFinite(lat) || !isFinite(lng)) return res.status(400).json({ error: 'lat/lng required' });
    try { res.json({ mosques: await fetchOsmMosques(lat, lng, rad) }); } catch (e) { res.status(502).json({ error: e.message }); }
  }));
  async function fetchOsmMosques(lat, lng, rad) {
    const key = `${lat.toFixed(3)},${lng.toFixed(3)},${rad}`;
    if (mosqueCache.has(key) && Date.now() - mosqueCache.get(key).t < 6 * 3600e3) return mosqueCache.get(key).d.mosques;
    const ql = `[out:json][timeout:20];nwr[amenity=place_of_worship][religion=muslim](around:${rad},${lat},${lng});out center 300;`;
    const eps = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
    let j = null;
    for (const ep of eps) {
      try {
        const r = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ShukrApp/2.0 (Muslim companion PWA)' }, body: 'data=' + encodeURIComponent(ql), signal: AbortSignal.timeout(8000) });
        if (r.ok) { j = await r.json(); break; }
      } catch {}
    }
    if (!j) {
      // Fallback: Nominatim (OSM) bounded search for mosques in the radius box
      try {
        const dLat = rad / 111320, dLng = rad / (111320 * Math.cos(lat * Math.PI / 180));
        const vb = `${lng - dLng},${lat + dLat},${lng + dLng},${lat - dLat}`;
        const seen = new Map();
        for (const term of ['mosque', 'masjid', 'jumma']) {
          const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${term}&format=jsonv2&limit=40&viewbox=${vb}&bounded=1&extratags=1&addressdetails=1`, { headers: { 'User-Agent': 'ShukrApp/2.0 (Muslim companion PWA)', 'Accept-Language': 'en' }, signal: AbortSignal.timeout(12000) });
          if (!r.ok) continue;
          for (const x of await r.json()) if (!seen.has(x.osm_type + x.osm_id)) seen.set(x.osm_type + x.osm_id, x);
          await new Promise(r2 => setTimeout(r2, 1100)); // Nominatim usage policy: max 1 req/s
        }
        if (seen.size) j = { elements: [...seen.values()].filter(x => x.type === 'place_of_worship' || x.category === 'amenity' || /mosque|masjid|jumm?a/i.test(x.name || '')).map(x => ({ type: x.osm_type, id: x.osm_id, lat: +x.lat, lon: +x.lon,
          tags: { name: x.name || 'Masjid', ...(x.extratags || {}), 'addr:street': x.address?.road, 'addr:city': x.address?.city || x.address?.town || x.address?.suburb } })) };
      } catch (e) { console.log('nominatim err', e.message); }
    }
    if (!j) throw new Error('Map service is busy, please try again');
    const toRad = x => x * Math.PI / 180;
    const dist = (a, b, c, d) => { const R = 6371e3, p = toRad(c - a), l = toRad(d - b); const h = Math.sin(p / 2) ** 2 + Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(l / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
    const out = j.elements.map(e => { const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon; const t = e.tags || {};
      return { id: e.type + e.id, name: t.name || t['name:en'] || 'Masjid', nameAr: t['name:ar'] || null, lat: la, lng: lo, dist: Math.round(dist(lat, lng, la, lo)),
        address: [t['addr:housenumber'], t['addr:street'], t['addr:city']].filter(Boolean).join(', '), denomination: t.denomination || null, website: t.website || t['contact:website'] || null, phone: t.phone || t['contact:phone'] || null };
    }).filter(m => m.lat).sort((a, b) => a.dist - b.dist);
    const d = { mosques: out };
    mosqueCache.set(key, { t: Date.now(), d }); return out;
  }
  ctx.fetchOsmMosques = fetchOsmMosques;

  // ---------------- AUDIOBOOK PROGRESS ----------------
  app.get('/api/audiobooks/progress', auth, wrap(async (req, res) => res.json({ progress: (await q('SELECT book, track, pos FROM audiobook_progress WHERE user_id=$1', [req.user.id])).rows })));
  app.post('/api/audiobooks/progress', auth, wrap(async (req, res) => {
    await q('INSERT INTO audiobook_progress(user_id,book,track,pos) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,book) DO UPDATE SET track=$3,pos=$4,updated_at=now()', [req.user.id, String(req.body.book).slice(0, 120), +req.body.track || 0, +req.body.pos || 0]);
    res.json({ ok: true });
  }));

  // ---------------- FASTING ----------------
  app.get('/api/fasting', auth, wrap(async (req, res) => res.json({ days: (await q(`SELECT to_char(day,'YYYY-MM-DD') AS day, kind FROM fasting WHERE user_id=$1 ORDER BY day DESC`, [req.user.id])).rows })));
  app.post('/api/fasting', auth, wrap(async (req, res) => {
    const day = req.body.day || todayFor(req.user);
    if (req.body.on === false) await q('DELETE FROM fasting WHERE user_id=$1 AND day=$2', [req.user.id, day]);
    else await q('INSERT INTO fasting(user_id,day,kind) VALUES($1,$2,$3) ON CONFLICT(user_id,day) DO UPDATE SET kind=$3', [req.user.id, day, req.body.kind || 'sunnah']);
    await q(`INSERT INTO day_logs(user_id,day,fasting) VALUES($1,$2,$3) ON CONFLICT(user_id,day) DO UPDATE SET fasting=$3`, [req.user.id, day, req.body.on !== false]);
    res.json({ ok: true });
  }));

  // ---------------- PATTERN INSIGHTS FROM CHATS & JOURNAL ----------------
  app.get('/api/insights/patterns', auth, wrap(async (req, res) => {
    const u = req.user.id;
    const cached = (await q('SELECT patterns, updated_at FROM user_profile_ai WHERE user_id=$1', [u])).rows[0];
    if (cached?.patterns && !req.query.refresh && Date.now() - new Date(cached.updated_at).getTime() < 20 * 3600e3 && cached.patterns.generated) return res.json(cached.patterns);
    if (!AI_KEY) return res.json({ empty: true });
    const msgs = (await q(`SELECT m.content, m.created_at FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.user_id=$1 AND m.role='user' ORDER BY m.id DESC LIMIT 120`, [u])).rows;
    const ents = (await q(`SELECT to_char(day,'YYYY-MM-DD') d, mood, text FROM entries WHERE user_id=$1 ORDER BY created_at DESC LIMIT 60`, [u])).rows;
    if (msgs.length + ents.length < 3) return res.json({ empty: true, note: 'Chat with Alim and journal for a few days — your personal patterns will appear here.' });
    const mems = (await q('SELECT kind, content FROM memories WHERE user_id=$1 ORDER BY importance DESC LIMIT 60', [u])).rows;
    const stats = await computeStats(req.user);
    const out = await aiChat([{ role: 'system', content: `You are a wise Muslim mentor and psychologist-informed coach. Analyse this person's own words (chat messages to their companion and gratitude journal entries) plus habit stats, and teach them about THEIR patterns so they can grow into a better human (tazkiyah, akhlaq). Be specific, kind and honest; quote short phrases of theirs as evidence; never diagnose. Ground advice in Quran/Sunnah with references.
Return JSON: {"summary":"2-3 sentences","emotions":[{"name":"...","trend":"rising|steady|falling","evidence":"short quote"}],"triggers":[{"trigger":"...","effect":"...","evidence":"..."}],"strengths":[{"name":"...","evidence":"..."}],"growth_areas":[{"area":"...","why":"...","practice":"one concrete daily practice","source":"Quran/hadith reference"}],"character":{"virtue_to_build":"...","plan":["step 1","step 2","step 3"]},"progress":"how they have changed over time, if visible"}` },
      { role: 'user', content: `HABIT STATS:\n${statsBrief(stats)}\n\nMEMORIES:\n${mems.map(m => `[${m.kind}] ${m.content}`).join('\n')}\n\nJOURNAL (newest first):\n${ents.map(e => `${e.d} mood ${e.mood || '?'}: ${e.text.slice(0, 400)}`).join('\n')}\n\nCHAT MESSAGES (newest first):\n${msgs.map(m => `${new Date(m.created_at).toISOString().slice(0, 10)}: ${m.content.slice(0, 300)}`).join('\n')}` }],
      { model: CHAT_MODEL, json: true, max_tokens: 3500, temperature: 0.4 });
    const data = parseJson(out) || { summary: out.slice(0, 400) };
    data.generated = new Date().toISOString();
    await q(`INSERT INTO user_profile_ai(user_id, patterns) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET patterns=$2, updated_at=now()`, [u, data]);
    res.json(data);
  }));

  // Weekly review
  app.get('/api/insights/weekly', auth, wrap(async (req, res) => {
    if (!AI_KEY) return res.json({});
    const s = await computeStats(req.user);
    const bl = (await q(`SELECT text FROM blessings WHERE user_id=$1 AND day >= $2 ORDER BY created_at DESC LIMIT 40`, [req.user.id, addDays(todayFor(req.user), -7)])).rows.map(r => r.text);
    const out = await aiChat([{ role: 'system', content: 'Write a warm weekly review (max 160 words, markdown) for a Muslim user: wins, blessings theme, one honest observation, and 3 small goals for next week. Cite one ayah or hadith with reference.' },
      { role: 'user', content: `${statsBrief(s)}\n\nBlessings this week:\n${bl.join('\n') || 'none'}` }], { max_tokens: 1200 });
    res.json({ review: out });
  }));

  // ---------------- UMMAH (social) ----------------
  const ADMIN_EMAILS = (process.env.NODE_ENV === 'test' && process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.toLowerCase().split(',').map(s => s.trim()) : ['akmal.yasaz@gmail.com']);
  async function myProfile(u) { return (await q('SELECT * FROM profiles WHERE user_id=$1', [u.id])).rows[0]; }
  async function moderate(text) {
    if (!AI_KEY) return { ok: true };
    try {
      const out = await aiChat([{ role: 'system', content: 'You moderate a respectful Muslim community app. Block: hate, harassment, sexual content, violence/extremism incitement, spam/scams, sharing personal data, sectarian takfir/insults. Allow: sincere questions, differing respectful opinions, dua requests, reminders. Return JSON {"ok":true|false,"reason":"short"}.' }, { role: 'user', content: text.slice(0, 3000) }], { json: true, max_tokens: 300, temperature: 0 });
      const j = parseJson(out); return j && typeof j.ok === 'boolean' ? j : { ok: true };
    } catch { return { ok: true }; }
  }
  const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
  app.get('/api/ummah/me', auth, wrap(async (req, res) => res.json({ profile: (await myProfile(req.user)) || null })));
  app.post('/api/ummah/profile', auth, wrap(async (req, res) => {
    const username = String(req.body.username || '').toLowerCase().trim();
    if (!USERNAME_RE.test(username)) return res.status(400).json({ error: 'Username: 3-20 characters, letters, numbers or _' });
    const taken = (await q('SELECT user_id FROM profiles WHERE username=$1', [username])).rows[0];
    if (taken && taken.user_id !== req.user.id) return res.status(409).json({ error: 'That username is taken' });
    const bio = String(req.body.bio || '').slice(0, 300), dn = String(req.body.display_name || '').slice(0, 50), loc = String(req.body.location || '').slice(0, 60);
    if (bio && !(await moderate(bio)).ok) return res.status(400).json({ error: 'Please keep your bio respectful' });
    const avatar = typeof req.body.avatar === 'string' && req.body.avatar.startsWith('data:image/') && req.body.avatar.length < 300000 ? req.body.avatar : undefined;
    const isAdmin = ADMIN_EMAILS.includes(req.user.email.toLowerCase());
    await q(`INSERT INTO profiles(user_id,username,display_name,bio,location,private,is_admin,avatar) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(user_id) DO UPDATE SET username=$2, display_name=$3, bio=$4, location=$5, private=$6, is_admin=$7, avatar=COALESCE($8, profiles.avatar)`,
      [req.user.id, username, dn || null, bio || null, loc || null, !!req.body.private, isAdmin, avatar || null]);
    res.json({ profile: await myProfile(req.user) });
  }));
  const POST_SELECT = `SELECT p.id, p.kind, p.body, p.image, p.dua_count, p.created_at, p.user_id, pr.username, pr.display_name, pr.avatar,
    (SELECT count(*)::int FROM likes l WHERE l.post_id=p.id AND l.kind='like') likes,
    (SELECT count(*)::int FROM comments c WHERE c.post_id=p.id AND c.status='visible') comments,
    EXISTS(SELECT 1 FROM likes l WHERE l.post_id=p.id AND l.user_id=$1 AND l.kind='like') liked,
    EXISTS(SELECT 1 FROM likes l WHERE l.post_id=p.id AND l.user_id=$1 AND l.kind='dua') duad
    FROM posts p JOIN profiles pr ON pr.user_id=p.user_id`;
  app.get('/api/ummah/feed', auth, wrap(async (req, res) => {
    const tab = req.query.tab || 'all', u = req.user.id;
    const where = [`p.status='visible'`, `pr.banned=false`, `NOT EXISTS(SELECT 1 FROM blocks b WHERE b.blocker=$1 AND b.blocked=p.user_id)`, `(pr.private=false OR p.user_id=$1 OR EXISTS(SELECT 1 FROM follows f WHERE f.follower=$1 AND f.followee=p.user_id))`];
    if (tab === 'following') where.push(`(p.user_id=$1 OR EXISTS(SELECT 1 FROM follows f WHERE f.follower=$1 AND f.followee=p.user_id))`);
    if (tab === 'duas') where.push(`p.kind='dua'`);
    if (req.query.user) where.push(`pr.username=$2`);
    const params = [u]; if (req.query.user) params.push(String(req.query.user));
    const r = await q(`${POST_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC LIMIT 60`, params);
    res.json({ posts: r.rows });
  }));
  app.post('/api/ummah/posts', auth, wrap(async (req, res) => {
    const prof = await myProfile(req.user); if (!prof) return res.status(400).json({ error: 'Create your Ummah profile first' });
    if (prof.banned) return res.status(403).json({ error: 'Your account cannot post' });
    const body = String(req.body.body || '').trim().slice(0, 2000); if (!body) return res.status(400).json({ error: 'Write something' });
    const recent = (await q(`SELECT count(*)::int n FROM posts WHERE user_id=$1 AND created_at > now() - interval '10 minutes'`, [req.user.id])).rows[0].n;
    if (recent >= 5) return res.status(429).json({ error: 'Please slow down a little' });
    const kind = ['post', 'blessing', 'dua', 'reminder', 'question'].includes(req.body.kind) ? req.body.kind : 'post';
    const image = typeof req.body.image === 'string' && req.body.image.startsWith('data:image/') && req.body.image.length < 900000 ? req.body.image : null;
    const mod = await moderate(body);
    const r = await q('INSERT INTO posts(user_id,kind,body,image,status,mod_reason) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [req.user.id, kind, body, image, mod.ok ? 'visible' : 'held', mod.ok ? null : mod.reason]);
    if (!mod.ok) return res.status(202).json({ held: true, message: 'Your post is held for review: ' + (mod.reason || 'community guidelines') });
    res.json({ id: r.rows[0].id });
  }));
  app.delete('/api/ummah/posts/:id', auth, wrap(async (req, res) => {
    const prof = await myProfile(req.user);
    await q('DELETE FROM posts WHERE id=$1 AND (user_id=$2 OR $3)', [req.params.id, req.user.id, ADMIN_EMAILS.includes(req.user.email.toLowerCase())]); res.json({ ok: true });
  }));
  app.post('/api/ummah/posts/:id/react', auth, wrap(async (req, res) => {
    if (!(await myProfile(req.user))) return res.status(400).json({ error: 'Create your Ummah profile first' });
    const kind = req.body.kind === 'dua' ? 'dua' : 'like', id = +req.params.id;
    const ex = (await q('SELECT 1 FROM likes WHERE post_id=$1 AND user_id=$2 AND kind=$3', [id, req.user.id, kind])).rows[0];
    if (ex && kind === 'like') await q('DELETE FROM likes WHERE post_id=$1 AND user_id=$2 AND kind=$3', [id, req.user.id, kind]);
    else if (!ex) { await q('INSERT INTO likes(post_id,user_id,kind) VALUES($1,$2,$3)', [id, req.user.id, kind]); if (kind === 'dua') await q('UPDATE posts SET dua_count=dua_count+1 WHERE id=$1', [id]); }
    res.json({ on: !ex || kind === 'dua' });
  }));
  app.get('/api/ummah/posts/:id/comments', auth, wrap(async (req, res) => {
    res.json({ comments: (await q(`SELECT c.id, c.body, c.created_at, c.user_id, pr.username, pr.display_name, pr.avatar FROM comments c JOIN profiles pr ON pr.user_id=c.user_id
      WHERE c.post_id=$1 AND c.status='visible' AND NOT EXISTS(SELECT 1 FROM blocks b WHERE b.blocker=$2 AND b.blocked=c.user_id) ORDER BY c.id`, [req.params.id, req.user.id])).rows });
  }));
  app.post('/api/ummah/posts/:id/comments', auth, wrap(async (req, res) => {
    const prof = await myProfile(req.user); if (!prof) return res.status(400).json({ error: 'Create your Ummah profile first' });
    if (prof.banned) return res.status(403).json({ error: 'Your account cannot comment' });
    const body = String(req.body.body || '').trim().slice(0, 800); if (!body) return res.status(400).json({ error: 'Empty comment' });
    const mod = await moderate(body);
    if (!mod.ok) { await q(`INSERT INTO comments(post_id,user_id,body,status) VALUES($1,$2,$3,'held')`, [req.params.id, req.user.id, body]); return res.status(202).json({ held: true, message: 'Comment held for review: ' + (mod.reason || '') }); }
    await q('INSERT INTO comments(post_id,user_id,body) VALUES($1,$2,$3)', [req.params.id, req.user.id, body]); res.json({ ok: true });
  }));
  app.get('/api/ummah/users/:username', auth, wrap(async (req, res) => {
    const p = (await q(`SELECT user_id, username, display_name, bio, location, avatar, private, created_at,
      (SELECT count(*)::int FROM follows WHERE followee=profiles.user_id) followers, (SELECT count(*)::int FROM follows WHERE follower=profiles.user_id) following,
      (SELECT count(*)::int FROM posts WHERE user_id=profiles.user_id AND status='visible') posts,
      EXISTS(SELECT 1 FROM follows WHERE follower=$2 AND followee=profiles.user_id) is_following FROM profiles WHERE username=$1 AND banned=false`, [req.params.username.toLowerCase(), req.user.id])).rows[0];
    if (!p) return res.status(404).json({ error: 'User not found' });
    res.json({ profile: { ...p, me: p.user_id === req.user.id } });
  }));
  app.post('/api/ummah/follow/:username', auth, wrap(async (req, res) => {
    if (!(await myProfile(req.user))) return res.status(400).json({ error: 'Create your Ummah profile first' });
    const t = (await q('SELECT user_id FROM profiles WHERE username=$1', [req.params.username.toLowerCase()])).rows[0]; if (!t) return res.status(404).json({ error: 'not found' });
    if (t.user_id === req.user.id) return res.status(400).json({ error: 'cannot follow yourself' });
    const ex = (await q('SELECT 1 FROM follows WHERE follower=$1 AND followee=$2', [req.user.id, t.user_id])).rows[0];
    if (ex) await q('DELETE FROM follows WHERE follower=$1 AND followee=$2', [req.user.id, t.user_id]); else await q('INSERT INTO follows(follower,followee) VALUES($1,$2)', [req.user.id, t.user_id]);
    res.json({ following: !ex });
  }));
  app.post('/api/ummah/block/:username', auth, wrap(async (req, res) => {
    const t = (await q('SELECT user_id FROM profiles WHERE username=$1', [req.params.username.toLowerCase()])).rows[0]; if (!t) return res.status(404).json({ error: 'not found' });
    await q('INSERT INTO blocks(blocker,blocked) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.user.id, t.user_id]);
    await q('DELETE FROM follows WHERE (follower=$1 AND followee=$2) OR (follower=$2 AND followee=$1)', [req.user.id, t.user_id]);
    res.json({ ok: true });
  }));
  app.post('/api/ummah/report', auth, wrap(async (req, res) => {
    const kind = ['post', 'comment', 'user'].includes(req.body.kind) ? req.body.kind : 'post';
    await q('INSERT INTO reports(reporter,target_kind,target_id,reason) VALUES($1,$2,$3,$4)', [req.user.id, kind, +req.body.id, String(req.body.reason || '').slice(0, 300)]);
    // auto-hide after 3 independent reports
    if (kind === 'post') { const n = (await q(`SELECT count(DISTINCT reporter)::int n FROM reports WHERE target_kind='post' AND target_id=$1 AND resolved=false`, [+req.body.id])).rows[0].n; if (n >= 3) await q(`UPDATE posts SET status='held', mod_reason='reported' WHERE id=$1`, [+req.body.id]); }
    res.json({ ok: true });
  }));
  // Community: who I follow / who follows me, people to meet, and a pulse of what the ummah is doing.
  app.get('/api/ummah/people', auth, wrap(async (req, res) => {
    const u = req.user.id;
    const base = `SELECT pr.user_id, pr.username, pr.display_name, pr.avatar, pr.bio,
      (SELECT count(*)::int FROM follows f2 WHERE f2.followee=pr.user_id) followers,
      (SELECT count(*)::int FROM posts p WHERE p.user_id=pr.user_id AND p.status='visible') posts,
      (SELECT max(created_at) FROM posts p WHERE p.user_id=pr.user_id AND p.status='visible') last_post,
      EXISTS(SELECT 1 FROM follows x WHERE x.follower=$1 AND x.followee=pr.user_id) is_following,
      EXISTS(SELECT 1 FROM follows x WHERE x.follower=pr.user_id AND x.followee=$1) follows_you
      FROM profiles pr`;
    const notBlocked = `pr.banned=false AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker=$1 AND b.blocked=pr.user_id) OR (b.blocker=pr.user_id AND b.blocked=$1))`;
    const following = (await q(`${base} JOIN follows f ON f.followee=pr.user_id AND f.follower=$1 WHERE ${notBlocked} ORDER BY last_post DESC NULLS LAST, f.created_at DESC LIMIT 300`, [u])).rows;
    const followers = (await q(`${base} JOIN follows f ON f.follower=pr.user_id AND f.followee=$1 WHERE ${notBlocked} ORDER BY f.created_at DESC LIMIT 300`, [u])).rows;
    // Suggestions: friends-of-friends first, then active members; never people you already follow.
    const suggested = (await q(`${base} WHERE ${notBlocked} AND pr.user_id<>$1 AND NOT EXISTS(SELECT 1 FROM follows x WHERE x.follower=$1 AND x.followee=pr.user_id)
      ORDER BY (SELECT count(*) FROM follows a JOIN follows b ON b.follower=a.followee WHERE a.follower=$1 AND b.followee=pr.user_id) DESC, followers DESC, last_post DESC NULLS LAST LIMIT 12`, [u])).rows;
    res.json({ following, followers, suggested });
  }));
  app.get('/api/ummah/pulse', auth, wrap(async (req, res) => {
    const r = (await q(`SELECT
      (SELECT count(*)::int FROM profiles WHERE banned=false) members,
      (SELECT count(*)::int FROM posts WHERE status='visible' AND created_at > now() - interval '24 hours') posts_today,
      (SELECT COALESCE(sum(dua_count),0)::int FROM posts WHERE status='visible' AND kind='dua' AND created_at > now() - interval '7 days') duas_week,
      (SELECT count(*)::int FROM posts WHERE status='visible' AND kind='dua' AND created_at > now() - interval '7 days') open_duas`)).rows[0];
    res.json(r);
  }));
  app.get('/api/ummah/search', auth, wrap(async (req, res) => {
    const s = String(req.query.q || '').toLowerCase().trim(); if (!s) return res.json({ users: [] });
    res.json({ users: (await q(`SELECT username, display_name, avatar, bio FROM profiles WHERE banned=false AND (username ILIKE $1 OR display_name ILIKE $1) LIMIT 20`, ['%' + s + '%'])).rows });
  }));
  // admin moderation queue
  async function requireAdmin(req, res) { const p = await myProfile(req.user); if (!(process.env.NODE_ENV === 'test' && p?.is_admin) && !ADMIN_EMAILS.includes(String(req.user.email || '').toLowerCase())) { res.status(403).json({ error: 'Admins only' }); return false; } return true; }
  app.get('/api/ummah/admin/queue', auth, wrap(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const held = (await q(`SELECT p.id, p.body, p.mod_reason, p.created_at, pr.username FROM posts p JOIN profiles pr ON pr.user_id=p.user_id WHERE p.status='held' ORDER BY p.created_at DESC LIMIT 100`)).rows;
    const heldC = (await q(`SELECT c.id, c.body, c.created_at, pr.username FROM comments c JOIN profiles pr ON pr.user_id=c.user_id WHERE c.status='held' ORDER BY c.created_at DESC LIMIT 100`)).rows;
    const reports = (await q(`SELECT r.id, r.target_kind, r.target_id, r.reason, r.created_at, pr.username reporter FROM reports r LEFT JOIN profiles pr ON pr.user_id=r.reporter WHERE r.resolved=false ORDER BY r.created_at DESC LIMIT 100`)).rows;
    res.json({ held, heldComments: heldC, reports });
  }));
  app.post('/api/ummah/admin/action', auth, wrap(async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const { action, kind, id, username } = req.body;
    if (action === 'approve' && kind === 'post') await q(`UPDATE posts SET status='visible' WHERE id=$1`, [id]);
    if (action === 'remove' && kind === 'post') await q(`UPDATE posts SET status='removed' WHERE id=$1`, [id]);
    if (action === 'approve' && kind === 'comment') await q(`UPDATE comments SET status='visible' WHERE id=$1`, [id]);
    if (action === 'remove' && kind === 'comment') await q(`UPDATE comments SET status='removed' WHERE id=$1`, [id]);
    if (action === 'resolve') await q('UPDATE reports SET resolved=true WHERE id=$1', [id]);
    if (action === 'ban' && username) await q('UPDATE profiles SET banned=true WHERE username=$1', [username]);
    res.json({ ok: true });
  }));
};
