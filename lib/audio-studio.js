// Audio studio: AI-written nasheed lyrics performed with voice only — no musical instruments.
// Pipeline: AI writes lyrics (checked for Islamic accuracy + no instrument words) → TTS voices each line →
// ffmpeg vocal-only production: harmony voices (pitch-shifted copies of the SAME voice), a hummed drone made from
// the voice itself, optional hand-free "vocal percussion" is NOT added (kept strictly acapella), and room reverb.
// No synthesised tones, no instrument samples, no beats.
const { spawn } = require('child_process');
const fs = require('fs'), fsp = fs.promises, path = require('path'), os = require('os'), crypto = require('crypto');
let STATIC = null; try { STATIC = require('ffmpeg-static'); } catch {}
const FF = process.env.FFMPEG || (fs.existsSync('/usr/local/bin/ffmpeg') ? '/usr/local/bin/ffmpeg' : STATIC && fs.existsSync(STATIC) ? STATIC : 'ffmpeg');
const SCHEMA = [
`CREATE TABLE IF NOT EXISTS nasheeds (id TEXT PRIMARY KEY, user_id INT REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, lyrics JSONB NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb, file TEXT, duration_ms INT, status TEXT NOT NULL DEFAULT 'draft', created_at TIMESTAMPTZ DEFAULT now())`,
`CREATE INDEX IF NOT EXISTS idx_nasheeds_user ON nasheeds(user_id, created_at DESC)`
];
const VOICES = { deep: 'onyx', warm: 'echo', bright: 'nova', soft: 'shimmer', storyteller: 'fable', clear: 'alloy' };
const STYLES = {
  // harmony: semitone offsets layered under the lead; hum: drone from the voice an octave down; room: reverb taps
  'Soft & reflective': { speed: 0.82, harmony: [-5], hum: 0.22, room: '0.8:0.75:70|140|260:0.35|0.25|0.18' },
  'Group chorus': { speed: 0.88, harmony: [-12, -5, 4, 7], hum: 0.18, room: '0.8:0.8:40|90|150:0.4|0.3|0.2' },
  'Masjid echo': { speed: 0.8, harmony: [-12, -5], hum: 0.25, room: '0.85:0.9:120|260|420|640:0.4|0.32|0.22|0.14' },
  'Children’s choir': { speed: 0.92, harmony: [4, 7, 12], hum: 0.12, room: '0.8:0.75:50|110:0.35|0.22' },
  'Solo, clean': { speed: 0.9, harmony: [], hum: 0, room: '0.7:0.6:50|100:0.25|0.15' },
};
const INSTRUMENT_WORDS = /\b(guitar|piano|drum|drums|daf|duff|oud|violin|flute|beat|bass|synth|keyboard|trumpet|saxophone|cello|harp|tabla|music(al)? instrument|orchestra|strings)\b/i;
const run = (args, timeoutMs = 120000) => new Promise((ok, bad) => { const p = spawn(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...args]); let e = ''; p.on('error', err => bad(new Error('Audio engine unavailable: ' + err.code))); p.stderr.on('data', d => e += d); const t = setTimeout(() => p.kill('SIGKILL'), timeoutMs); p.on('close', c => { clearTimeout(t); c === 0 ? ok() : bad(new Error('audio processing failed: ' + e.slice(0, 200))); }); });

module.exports = function audioStudio(ctx) {
  const { app, q, auth, wrap, aiChat, parseJson, AI_BASE, AI_KEY, FAST_MODEL } = ctx;
  let ready = null; const ensure = () => ready || (ready = SCHEMA.reduce((p, s) => p.then(() => q(s)), Promise.resolve()).catch(e => { ready = null; throw e; }));
  const fail = (res, s, e) => res.status(s).json({ error: e });
  const clean = (v, n) => typeof v === 'string' ? v.replace(/[<>\u0000-\u0008]/g, '').trim().slice(0, n) : '';
  const busy = new Map(); // user -> running render
  const day = new Map();  // user -> {d, n}
  const quota = uid => { const d = new Date().toISOString().slice(0, 10), x = day.get(uid) || { d, n: 0 }; if (x.d !== d) { x.d = d; x.n = 0; } day.set(uid, x); return x; };

  app.get('/api/audio/options', auth, (req, res) => res.json({ voices: Object.keys(VOICES), styles: Object.keys(STYLES) }));

  // 1) Lyrics
  app.post('/api/audio/lyrics', auth, wrap(async (req, res) => {
    const b = req.body || {}, theme = clean(b.theme, 300), lang = clean(b.language, 30) || 'English', mood = clean(b.mood, 40) || 'peaceful';
    if (theme.length < 3) return fail(res, 400, 'Tell us what the nasheed is about.');
    if (INSTRUMENT_WORDS.test(theme)) return fail(res, 400, 'Shukr nasheeds are voice-only — no musical instruments.');
    const q1 = quota(req.user.id); if (q1.n >= 30) return fail(res, 429, 'You’ve written a lot today. Try again tomorrow.'); q1.n++;
    const out = await aiChat([{ role: 'system', content: `You write short nasheeds (Islamic acapella songs) for a Muslim app. Rules:
- Voice only: never mention or imply musical instruments, beats or music.
- Theologically sound (Ahl as-Sunnah): praise Allah, love of the Prophet ﷺ, gratitude, patience, hope, the Hereafter. No exaggeration about the Prophet ﷺ or saints, no tawassul/istighatha to other than Allah, no shirk, nothing contrary to Quran and authentic Sunnah.
- Do NOT invent Quran verses or hadith. You may echo well-known phrases (SubhanAllah, Alhamdulillah, La ilaha illa Allah, Allahu Akbar, salawat) correctly.
- Language: ${lang}. Short singable lines (4–9 words). 2 verses of 4 lines + a 2–4 line chorus repeated. Max 18 lines total.
Return JSON {"title":"…","lines":[{"part":"verse|chorus","text":"…"}],"note":"one line on the meaning"}` },
      { role: 'user', content: `Theme: ${theme}\nMood: ${mood}${b.include ? `\nInclude: ${clean(b.include, 200)}` : ''}` }], { json: true, max_tokens: 4000, temperature: 0.8, model: process.env.LYRICS_MODEL || 'gemini-3.8-flash' });
    const j = parseJson(String(out || '')); if (!j || !Array.isArray(j.lines)) { console.log('lyrics parse fail', String(out).slice(0, 300)); return fail(res, 502, 'Couldn’t write lyrics just now. Try again.'); }
    const lines = j.lines.filter(l => l && typeof l.text === 'string').slice(0, 18).map(l => ({ part: l.part === 'chorus' ? 'chorus' : 'verse', text: clean(l.text, 120) })).filter(l => l.text && !INSTRUMENT_WORDS.test(l.text));
    res.json({ title: clean(j.title, 80) || 'Untitled nasheed', lines, note: clean(j.note, 200) });
  }));

  // 2) Render voice-only audio
  app.post('/api/audio/render', auth, wrap(async (req, res) => {
    await ensure(); const b = req.body || {};
    if (!AI_KEY) return fail(res, 503, 'Voice generation isn’t available right now.');
    const title = clean(b.title, 80) || 'Nasheed', voice = VOICES[b.voice] ? b.voice : 'deep', style = STYLES[b.style] ? b.style : 'Soft & reflective';
    const lines = Array.isArray(b.lines) ? b.lines.slice(0, 24).map(l => ({ part: l?.part === 'chorus' ? 'chorus' : 'verse', text: clean(l?.text, 140) })).filter(l => l.text) : [];
    if (!lines.length) return fail(res, 400, 'Add some lyrics first.');
    if (lines.some(l => INSTRUMENT_WORDS.test(l.text))) return fail(res, 400, 'Remove instrument words — nasheeds here are voice-only.');
    const chars = lines.reduce((n, l) => n + l.text.length, 0); if (chars > 1800) return fail(res, 400, 'That’s too long — keep it under about 1,800 characters.');
    if (busy.get(req.user.id)) return fail(res, 429, 'Your last nasheed is still being made.');
    const q1 = quota(req.user.id); if (q1.n >= 30) return fail(res, 429, 'Daily limit reached. Try again tomorrow.'); q1.n += 2;
    busy.set(req.user.id, true);
    const id = crypto.randomUUID(), dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'nsh-'));
    try {
      const S = STYLES[style];
      // Chorus lines are sung by the group (more harmony), verses by the lead.
      // Voice every line in parallel (4 at a time) — about 4x faster than one by one.
      const segs = new Array(lines.length); let next = 0;
      const worker = async () => { while (next < lines.length) { const i = next++;
        const r = await fetch(AI_BASE + '/audio/speech', { method: 'POST', signal: AbortSignal.timeout(60000), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AI_KEY }, body: JSON.stringify({ model: 'tts-1', voice: VOICES[voice], input: lines[i].text, speed: S.speed, response_format: 'mp3' }) });
        if (!r.ok) throw new Error('voice ' + r.status);
        const f = path.join(dir, `l${i}.mp3`); await fsp.writeFile(f, Buffer.from(await r.arrayBuffer())); segs[i] = f; } };
      await Promise.all([worker(), worker(), worker(), worker()]);
      // Join lines with breathing gaps (longer after each verse).
      const list = path.join(dir, 'list.txt');
      const gapS = path.join(dir, 'gs.wav'), gapL = path.join(dir, 'gl.wav');
      await run(['-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', '0.45', gapS]); await run(['-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', '1.1', gapL]);
      const norm = segs.map((_, i) => path.join(dir, `n${i}.wav`)); await Promise.all(segs.map((f, i) => run(['-i', f, '-ar', '24000', '-ac', '1', norm[i]])));
      const order = []; norm.forEach((f, i) => { order.push(f); order.push(lines[i + 1] && lines[i + 1].part !== lines[i].part ? gapL : gapS); });
      await fsp.writeFile(list, order.map(f => `file '${f}'`).join('\n'));
      const dry = path.join(dir, 'dry.wav'); await run(['-f', 'concat', '-safe', '0', '-i', list, '-ar', '44100', dry]);
      // Vocal-only production.
      const H = S.harmony, n = 1 + H.length + (S.hum ? 1 : 0);
      const split = `[0:a]aformat=sample_rates=44100:channel_layouts=mono,asplit=${n}${Array.from({ length: n }, (_, k) => `[s${k}]`).join('')}`;
      const parts = [`[s0]equalizer=f=250:t=q:w=1:g=2,equalizer=f=3200:t=q:w=1:g=3[v0]`];
      H.forEach((st, k) => parts.push(`[s${k + 1}]asetrate=44100*${Math.pow(2, st / 12).toFixed(4)},aresample=44100,atempo=${(1/Math.pow(2, st / 12)).toFixed(4)},volume=${(0.32 - k * 0.04).toFixed(2)},adelay=${20 + k * 15}[v${k + 1}]`));
      if (S.hum) parts.push(`[s${n - 1}]lowpass=f=500,asetrate=22050,aresample=44100,atempo=2,volume=${S.hum}[v${n - 1}]`);
      const graph = [split, ...parts, `${Array.from({ length: n }, (_, k) => `[v${k}]`).join('')}amix=inputs=${n}:normalize=0,aecho=${S.room},highpass=f=70,acompressor=threshold=-18dB:ratio=3,loudnorm=I=-12:TP=-1:LRA=9,alimiter=limit=0.95,apad=pad_dur=1.5,afade=t=in:d=0.3[out]`].join(';');
      const out = path.join(dir, 'out.mp3'); await run(['-i', dry, '-filter_complex', graph, '-map', '[out]', '-ac', '2', '-b:a', '160k', out], 180000);
      const buf = await fsp.readFile(out);
      // Store like other user media (S3 or local) via the shared helper.
      const file = `${id}.mp3`; await ctx.storeUgcFile(file, buf, 'audio/mpeg');
      const dur = await new Promise(ok => { const p = spawn(FF, ['-i', out, '-f', 'null', '-']); let s = ''; p.on('error', () => ok(null)); p.stderr.on('data', d => s += d); p.on('close', () => { const m = s.match(/Duration: (\d+):(\d+):([\d.]+)/); ok(m ? Math.round(((+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3])) * 1000) : null); }); });
      await q('INSERT INTO nasheeds(id,user_id,title,lyrics,settings,file,duration_ms,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [id, req.user.id, title, JSON.stringify(lines), JSON.stringify({ voice, style }), file, dur, 'ready']);
      res.json({ nasheed: { id, title, url: '/ugc/' + file, durationMs: dur, voice, style, lyrics: lines } });
    } finally { busy.delete(req.user.id); fsp.rm(dir, { recursive: true, force: true }).catch(() => {}); }
  }));

  app.get('/api/audio/mine', auth, wrap(async (req, res) => {
    await ensure();
    res.json({ nasheeds: (await q('SELECT id,title,lyrics,settings,file,duration_ms,created_at FROM nasheeds WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [req.user.id])).rows.map(r => ({ ...r, url: '/ugc/' + r.file })) });
  }));
  app.delete('/api/audio/:id', auth, wrap(async (req, res) => {
    await ensure(); const r = (await q('DELETE FROM nasheeds WHERE id=$1 AND user_id=$2 RETURNING file', [req.params.id, req.user.id])).rows[0];
    if (r && ctx.removeUgcFile) await ctx.removeUgcFile(r.file); res.json({ ok: true });
  }));
};
module.exports.STYLES = STYLES; module.exports.INSTRUMENT_WORDS = INSTRUMENT_WORDS;
