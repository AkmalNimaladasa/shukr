// Video editor render: the phone sends the original clip + an edit recipe; ffmpeg applies trim, speed, reverse, crop/aspect,
// rotate/flip, colour filter (exact same maths as the preview via a 3D LUT), vignette/sharpen/grain, overlays (text/stickers/
// drawings rendered on the phone as one transparent PNG per layer with timing), voice effects, nasheed / voiceover mix and
// auto-captions. Output: H.264/AAC MP4 (≤1080×1920) stored as a normal upload, then posted like any other video.
const fs = require('node:fs'), fsp = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { spawn } = require('node:child_process'); const { randomUUID } = require('node:crypto');
const FX = require('../public/js/fx.js');
let FF = process.env.FFMPEG; try { FF = FF || require('ffmpeg-static'); } catch {} FF = FF || 'ffmpeg';
const run = (args, ms = 240000) => new Promise((ok, bad) => { const p = spawn(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...args]); let e = '';
  const t = setTimeout(() => { p.kill('SIGKILL'); bad(new Error('Rendering took too long — try a shorter clip.')); }, ms);
  p.on('error', err => { clearTimeout(t); bad(err); }); p.stderr.on('data', d => e += d); p.on('close', c => { clearTimeout(t); c === 0 ? ok() : bad(new Error('Render failed: ' + e.slice(-300))); }); });
const probe = file => new Promise(ok => { const p = spawn(FF, ['-hide_banner', '-i', file]); let s = ''; p.on('error', () => ok({})); p.stderr.on('data', d => s += d);
  p.on('close', () => { const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(s), v = /Video:.*?(\d{2,5})x(\d{2,5})/.exec(s), r = /rotate\s*:\s*(-?\d+)|displaymatrix: rotation of (-?[\d.]+)/.exec(s);
    ok({ dur: m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0, w: v ? +v[1] : 0, h: v ? +v[2] : 0, audio: /Audio:/.test(s), rot: r ? Math.abs(Math.round(+(r[1] || r[2]))) % 180 === 90 : false }); }); });
const probeDur = file => new Promise(ok => { const p = spawn(FF, ['-hide_banner', '-i', file, '-map', '0:v:0', '-c', 'copy', '-f', 'null', '-']); let s = ''; p.on('error', () => ok(0)); p.stderr.on('data', d => s += d);
  p.on('close', () => { const m = [...s.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop(); ok(m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0); }); });
const VOICE = { // voice effects (no music)
  none: '', deep: 'asetrate=44100*0.84,aresample=44100,atempo=1.19', high: 'asetrate=44100*1.22,aresample=44100,atempo=0.82', robot: 'afftfilt=real=\'hypot(re,im)*sin(0)\':imag=\'hypot(re,im)*cos(0)\':win_size=512:overlap=0.75',
  echo: 'aecho=0.8:0.85:280|560:0.35|0.2', masjid: 'aecho=0.85:0.9:90|180|360:0.4|0.3|0.2,lowpass=f=7000', radio: 'highpass=f=500,lowpass=f=3200,acrusher=bits=10:mode=log:aa=1', chorus: 'chorus=0.6:0.9:50|60:0.4|0.32:0.25|0.4:2|1.3',
  whisper: 'highpass=f=900,volume=1.4,aecho=0.6:0.5:40:0.2', giant: 'asetrate=44100*0.7,aresample=44100,atempo=1.428,aecho=0.8:0.8:120:0.3' };
const num = (v, lo, hi, d) => { v = +v; return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const esc = s => String(s).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");

module.exports = function videoEditor(ctx) {
  const { app, q, auth, wrap } = ctx;
  // Render jobs: phones lose long HTTP requests (screen lock, proxies). With ?async=1 the render runs in the background
  // and the app polls /api/video/jobs/:id until it's done.
  const jobs = new Map(); const { randomUUID: rid } = require('node:crypto');
  const asyncWrap = handler => wrap(async (req, res) => {
    if (req.query.async !== '1') return handler(req, res);
    const id = rid(); jobs.set(id, { user: req.user.id, status: 'running', at: Date.now() });
    const fake = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { const j = jobs.get(id); if (j) Object.assign(j, this.statusCode >= 400 ? { status: 'error', error: b?.error || 'Render failed' } : { status: 'done', result: b }); return this; }, setHeader() {}, end() {} };
    handler(req, fake).catch(e => { const j = jobs.get(id); if (j) Object.assign(j, { status: 'error', error: /took too long/.test(e.message) ? e.message : 'Rendering failed — please try again.' }); console.error('render job', e.message); });
    res.json({ jobId: id });
  });
  setInterval(() => { for (const [k, j] of jobs) if (Date.now() - j.at > 30 * 60e3) jobs.delete(k); }, 60e3).unref();
  app.get('/api/video/jobs/:id', auth, (req, res) => { const j = jobs.get(req.params.id); if (!j || j.user !== req.user.id) return res.status(404).json({ error: 'Render not found' });
    res.json({ status: j.status, error: j.error, ...(j.result || {}) }); });
  const fail = (res, s, m) => res.status(s).json({ error: m });
  let busy = 0; const MAX = +(process.env.VIDEO_RENDER_CONCURRENCY || 2);
  const fetchUgc = (file, dest) => ctx.readUgcToFile(file, dest);
  const mediaRow = async (uid, id, kinds) => (await q(`SELECT * FROM social_media WHERE id=$1 AND user_id=$2 AND kind = ANY($3::text[])`, [String(id || ''), uid, kinds])).rows[0];

  // Photo mode with sound (TikTok/Instagram): 1-10 edited photos + a library sound -> vertical slideshow video.
  app.post('/api/video/photos', auth, asyncWrap(async (req, res) => {
    if (ctx.socialUploadsReady) await ctx.socialUploadsReady();
    if (busy >= MAX) return fail(res, 429, 'The editor is busy — try again in a few seconds.'); busy++;
    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'vph-')); const T = n => path.join(tmp, n);
    try {
      const b = req.body || {}, ids = (Array.isArray(b.mediaIds) ? b.mediaIds : []).slice(0, 10).map(String);
      if (!ids.length) return fail(res, 400, 'Add a photo first.');
      const rows = (await q(`SELECT * FROM social_media WHERE user_id=$1 AND kind='image' AND id = ANY($2::text[])`, [req.user.id, ids])).rows;
      const imgs = ids.map(id => rows.find(r => r.id === id)).filter(Boolean); if (!imgs.length) return fail(res, 400, 'Upload the photos first.');
      const sid = String(b.sound?.id || ''); let snd = sid && !sid.startsWith('mine:') && ctx.soundFile ? ctx.soundFile(sid) : null;
      if (!snd && b.nasheedId) { const r = (await q('SELECT file FROM nasheeds WHERE id=$1 AND user_id=$2', [String(b.nasheedId), req.user.id]).catch(() => ({ rows: [] }))).rows[0]; if (r) { await fetchUgc(r.file, T('snd.mp3')); snd = T('snd.mp3'); } }
      if (!snd) return fail(res, 400, 'Pick a sound first.');
      const per = num(b.perPhoto, 1.5, 8, imgs.length > 1 ? 3 : 8), dur = Math.min(60, per * imgs.length), W = 720, H = 1280, vol = num(b.volume, 0, 2, 1);
      const inputs = [], parts = [];
      for (const [i, m] of imgs.entries()) { await fetchUgc(m.file, T(`p${i}`)); inputs.push('-loop', '1', '-t', per.toFixed(2), '-i', T(`p${i}`));
        // blurred fill background + fitted photo + gentle zoom (Ken Burns)
        parts.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=30,eq=brightness=-0.08[bg${i}];[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg${i}];[bg${i}][fg${i}]overlay=(W-w)/2:(H-h)/2,fps=30,scale=w='trunc(${W}*(1+0.06*t/${per.toFixed(2)})/2)*2':h=-2:eval=frame,crop=${W}:${H},setsar=1,format=yuv420p,trim=duration=${per.toFixed(2)},setpts=PTS-STARTPTS[s${i}]`); }
      const n = imgs.length; let chain = parts.join(';') + ';' + (n > 1 ? `${Array.from({ length: n }, (_, i) => `[s${i}]`).join('')}concat=n=${n}:v=1:a=0[v]` : '[s0]null[v]');
      inputs.push('-stream_loop', '-1', '-i', snd);
      chain += `;[${n}:a]atrim=0:${dur.toFixed(2)},asetpts=PTS-STARTPTS,volume=${vol},afade=t=in:d=0.3,afade=t=out:st=${Math.max(0, dur - 1.2).toFixed(2)}:d=1.2,loudnorm=I=-15:TP=-1.5[a]`;
      const out = T('out.mp4');
      await run([...inputs, '-filter_complex', chain, '-map', '[v]', '-map', '[a]', '-t', dur.toFixed(2), '-c:v', 'libx264', '-preset', 'superfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-movflags', '+faststart', '-threads', '0', out]);
      await run(['-ss', '0.5', '-i', out, '-frames:v', '1', '-q:v', '4', T('poster.jpg')]).catch(() => {});
      const id = randomUUID(), file = id + '.mp4', buf = await fsp.readFile(out); await ctx.storeUgcFile(file, buf, 'video/mp4');
      await q('INSERT INTO social_media(id,user_id,file,kind,mime,bytes,width,height,duration_ms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, req.user.id, file, 'video', 'video/mp4', buf.length, W, H, Math.round(dur * 1000)]);
      let poster = null; if (fs.existsSync(T('poster.jpg'))) { const pid = randomUUID(), pf = pid + '.jpg', pb = await fsp.readFile(T('poster.jpg')); await ctx.storeUgcFile(pf, pb, 'image/jpeg');
        await q('INSERT INTO social_media(id,user_id,file,kind,mime,bytes,width,height) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [pid, req.user.id, pf, 'image', 'image/jpeg', pb.length, W, H]); poster = { id: pid, url: '/ugc/' + pf }; }
      res.json({ media: { id, url: '/ugc/' + file, width: W, height: H, duration: Math.round(dur * 1000) }, poster });
    } finally { busy--; fsp.rm(tmp, { recursive: true, force: true }).catch(() => {}); }
  }));
  app.post('/api/video/render', auth, asyncWrap(async (req, res) => {
    if (ctx.socialUploadsReady) await ctx.socialUploadsReady();
    if (busy >= MAX) return fail(res, 429, 'The editor is busy — try again in a few seconds.'); busy++;
    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'ved-')); const T = n => path.join(tmp, n);
    try {
      const b = req.body || {}, src = await mediaRow(req.user.id, b.mediaId, ['video']); if (!src) return fail(res, 404, 'Upload the video first.');
      await fetchUgc(src.file, T('in')); const info = await probe(T('in')); if (!info.dur) info.dur = await probeDur(T('in')); if (!info.dur) return fail(res, 400, 'We couldn’t read that video.');
      const start = num(b.trim?.start, 0, info.dur, 0), end = num(b.trim?.end, start + 0.3, info.dur, info.dur), speed = [0.3, 0.5, 1, 2, 3].includes(+b.speed) ? +b.speed : 1;
      const outDur = (end - start) / speed; if (outDur > 180) return fail(res, 400, 'Edited videos can be up to 3 minutes.');
      const rot = [0, 90, 180, 270].includes(+b.rotate) ? +b.rotate : 0, flip = !!b.flip, aspect = FX.ASPECTS[b.aspect] !== undefined ? b.aspect : '9:16';
      let sw = info.rot ? info.h : info.w, sh = info.rot ? info.w : info.h;
      const o = FX.outSize(sw, sh, rot, aspect, 1280), cr = FX.cropRect(o.sw, o.sh, o.w, o.h, num(b.crop?.zoom, 1, 4, 1), num(b.crop?.x, -1, 1, 0), num(b.crop?.y, -1, 1, 0));
      const fx = FX.build(String(b.filter || 'normal'), num(b.strength, 0, 100, 100), b.adjust || {});
      const vf = [`trim=start=${start}:end=${end}`, 'setpts=PTS-STARTPTS'];
      if (b.reverse) vf.push('reverse');
      if (speed !== 1) vf.push(`setpts=PTS/${speed}`);
      if (rot === 90) vf.push('transpose=1'); else if (rot === 270) vf.push('transpose=2'); else if (rot === 180) vf.push('hflip,vflip');
      if (flip) vf.push('hflip');
      vf.push(`scale=${Math.round(cr.dw / 2) * 2}:${Math.round(cr.dh / 2) * 2}`, `crop=${o.w}:${o.h}:${Math.round(cr.x)}:${Math.round(cr.y)}`, 'setsar=1', 'fps=30');
      if (!FX.isIdentity({ ...fx, vig: 0, sharp: 0, grain: 0 })) { await fsp.writeFile(T('fx.cube'), FX.cube(fx)); vf.push(`lut3d=file='${esc(T('fx.cube'))}'`); }
      if (fx.sharp) vf.push(`unsharp=5:5:${(fx.sharp / 100 * 1.5).toFixed(2)}`);
      if (fx.grain) vf.push(`noise=alls=${Math.round(fx.grain / 100 * 22)}:allf=t`);
      if (fx.vig) vf.push(`vignette=angle=${(Math.PI / 5 + fx.vig / 100 * Math.PI / 5).toFixed(3)}`);
      const D2 = outDur.toFixed(2), EFF = { glitch: 'rgbashift=rh=-10:bh=10,noise=alls=6:allf=t', vhs: 'rgbashift=rh=-5:bh=5,noise=alls=16:allf=t,eq=saturation=1.2:contrast=1.06',
        dreamy: 'split[dz1][dz2];[dz2]gblur=sigma=16[dz3];[dz1][dz3]blend=all_mode=screen:all_opacity=0.45', mirror: `crop=${Math.round(o.w / 4) * 2}:${o.h}:0:0,split[mz1][mz2];[mz2]hflip[mz3];[mz1][mz3]hstack`,
        zoom: `scale=w='trunc(iw*(1+0.15*min(t/${D2}\\,1))/2)*2':h=-2:eval=frame,crop=${o.w}:${o.h}`, fade: `fade=t=in:st=0:d=0.5,fade=t=out:st=${Math.max(0, outDur - 0.5).toFixed(2)}:d=0.5` };
      if (EFF[b.effect]) vf.push(EFF[b.effect]);
      vf.push('format=yuv420p');
      // Inputs: 0 = clip, then overlay PNGs, then nasheed, then voiceover
      const inputs = ['-i', T('in')]; let n = 1, chain = `[0:v]${vf.join(',')}[v0]`, last = 'v0';
      const layers = Array.isArray(b.layers) ? b.layers.slice(0, 20) : [];
      for (const [i, L] of layers.entries()) { if (!L?.png || !/^data:image\/png;base64,/.test(L.png) || L.png.length > 6e6) continue;
        await fsp.writeFile(T(`L${i}.png`), Buffer.from(L.png.split(',')[1], 'base64')); inputs.push('-loop', '1', '-t', String(outDur.toFixed(2)), '-i', T(`L${i}.png`));
        const s0 = num(L.start, 0, outDur, 0), s1 = num(L.end, s0, outDur, outDur);
        chain += `;[${n}:v]scale=${o.w}:${o.h},format=rgba[o${n}];[${last}][o${n}]overlay=0:0:enable='between(t,${s0.toFixed(2)},${s1.toFixed(2)})'[v${n}]`; last = 'v' + n; n++; }
      // captions: ASS file rendered by libass with the app font
      if (Array.isArray(b.captions) && b.captions.length) {
        const fmt = t => { t = Math.max(0, t); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = (t % 60).toFixed(2).padStart(5, '0'); return `${h}:${String(m).padStart(2, '0')}:${s}`; };
        const st = b.captionStyle === 'boxed' ? 'BorderStyle=3,BackColour=&H80000000' : 'BorderStyle=1,Outline=3,Shadow=0';
        const ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${o.w}\nPlayResY: ${o.h}\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Alignment, MarginV, BorderStyle, Outline, Shadow\nStyle: C,Figtree,${Math.round(o.w * 0.058)},&H00FFFFFF,&H00000000,&H80000000,1,2,${Math.round(o.h * 0.22)},${b.captionStyle === 'boxed' ? 3 : 1},${b.captionStyle === 'boxed' ? 8 : 3},0\n\n[Events]\nFormat: Layer, Start, End, Style, Text\n` +
          b.captions.slice(0, 400).map(c => `Dialogue: 0,${fmt(num(c.start, 0, outDur, 0))},${fmt(num(c.end, 0, outDur, 0))},C,${String(c.text || '').replace(/[{}\\\n]/g, ' ').slice(0, 120)}`).join('\n');
        await fsp.writeFile(T('cap.ass'), ass); const fontsdir = path.join(__dirname, '..', 'public', 'fonts');
        chain += `;[${last}]ass='${esc(T('cap.ass'))}'${fs.existsSync(fontsdir) ? `:fontsdir='${esc(fontsdir)}'` : ''}[vc]`; last = 'vc'; void st; }
      // Audio
      const ov = num(b.audio?.original, 0, 2, 1), mv = num(b.audio?.music, 0, 2, 0.6), vv = num(b.audio?.voiceover, 0, 2, 1.2);
      const vfx = VOICE[b.audio?.effect] || '';
      const aParts = []; let ai = 0;
      if (info.audio && ov > 0 && !b.audio?.mute) { const af = [`atrim=start=${start}:end=${end}`, 'asetpts=PTS-STARTPTS']; if (b.reverse) af.push('areverse');
        if (speed !== 1) { let s = speed; while (s > 2) { af.push('atempo=2'); s /= 2; } while (s < 0.5) { af.push('atempo=0.5'); s /= 0.5; } af.push(`atempo=${s}`); }
        if (vfx) af.push(vfx); af.push(`volume=${ov}`); chain += `;[0:a]${af.join(',')}[a${ai}]`; aParts.push(`[a${ai++}]`); }
      // added sound: a library sound (bundled file) or one of the user's own studio nasheeds
      let sndPath = null; const sid = String(b.audio?.sound?.id || '');
      if (sid && !sid.startsWith('mine:') && ctx.soundFile) sndPath = ctx.soundFile(sid);
      if (!sndPath && b.audio?.nasheedId) { const r = (await q('SELECT file FROM nasheeds WHERE id=$1 AND user_id=$2', [b.audio.nasheedId, req.user.id]).catch(() => ({ rows: [] }))).rows[0]; if (r) { await fetchUgc(r.file, T('nash.mp3')); sndPath = T('nash.mp3'); } }
      if (sndPath) { { inputs.push('-stream_loop', '-1', '-i', sndPath);
          const off = num(b.audio?.musicStart, 0, 600, 0); chain += `;[${n}:a]atrim=start=${off},asetpts=PTS-STARTPTS,atrim=0:${outDur.toFixed(2)},volume=${mv},afade=t=out:st=${Math.max(0, outDur - 1.2).toFixed(2)}:d=1.2[a${ai}]`; aParts.push(`[a${ai++}]`); n++; } }
      if (b.audio?.voiceoverId) { const vo = await mediaRow(req.user.id, b.audio.voiceoverId, ['audio']); if (vo) { await fetchUgc(vo.file, T('vo')); inputs.push('-i', T('vo'));
        chain += `;[${n}:a]${vfx ? vfx + ',' : ''}highpass=f=80,acompressor=threshold=-20dB:ratio=3,volume=${vv},atrim=0:${outDur.toFixed(2)}[a${ai}]`; aParts.push(`[a${ai++}]`); n++; } }
      // text-to-speech for text layers (TikTok style): spoken when the text appears
      if (Array.isArray(b.tts) && b.tts.length && ctx.AI_KEY) for (const [i, s] of b.tts.slice(0, 6).entries()) { const text = String(s?.text || '').slice(0, 300).trim(); if (!text) continue;
        try { const r = await fetch(ctx.AI_BASE + '/audio/speech', { method: 'POST', signal: AbortSignal.timeout(30000), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ctx.AI_KEY }, body: JSON.stringify({ model: 'tts-1', voice: ['nova', 'onyx', 'alloy', 'shimmer'].includes(s.voice) ? s.voice : 'nova', input: text }) });
          if (!r.ok) continue; await fsp.writeFile(T(`tts${i}.mp3`), Buffer.from(await r.arrayBuffer())); inputs.push('-i', T(`tts${i}.mp3`)); const ms = Math.round(num(s.start, 0, outDur, 0) * 1000);
          chain += `;[${n}:a]adelay=${ms}|${ms},volume=1.5[a${ai}]`; aParts.push(`[a${ai++}]`); n++; } catch {} }
      if (aParts.length) chain += `;${aParts.join('')}amix=inputs=${aParts.length}:normalize=0:duration=longest,atrim=0:${outDur.toFixed(2)},acompressor=threshold=-22dB:ratio=3:attack=5:release=80:makeup=4,loudnorm=I=-14:TP=-1.2:LRA=9,alimiter=limit=0.95[aout]`;
      const out = T('out.mp4');
      await run([...inputs, '-filter_complex', chain, '-map', `[${last}]`, ...(aParts.length ? ['-map', '[aout]', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2'] : ['-an']),
        '-t', outDur.toFixed(2), '-c:v', 'libx264', '-preset', 'superfast', '-tune', 'film', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-threads', '0', out]);
      await run(['-ss', String((b.cover != null ? num(b.cover, 0, Math.max(0, outDur - 0.05), 0) : Math.min(1, outDur / 3)).toFixed(2)), '-i', out, '-frames:v', '1', '-q:v', '4', T('poster.jpg')]).catch(() => {});
      const id = randomUUID(), file = id + '.mp4', buf = await fsp.readFile(out); await ctx.storeUgcFile(file, buf, 'video/mp4');
      await q('INSERT INTO social_media(id,user_id,file,kind,mime,bytes,width,height,duration_ms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, req.user.id, file, 'video', 'video/mp4', buf.length, o.w, o.h, Math.round(outDur * 1000)]);
      let poster = null; if (fs.existsSync(T('poster.jpg'))) { const pid = randomUUID(), pf = pid + '.jpg', pb = await fsp.readFile(T('poster.jpg')); await ctx.storeUgcFile(pf, pb, 'image/jpeg');
        await q('INSERT INTO social_media(id,user_id,file,kind,mime,bytes,width,height) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [pid, req.user.id, pf, 'image', 'image/jpeg', pb.length, o.w, o.h]); poster = { id: pid, url: '/ugc/' + pf }; }
      res.json({ media: { id, url: '/ugc/' + file, width: o.w, height: o.h, duration: Math.round(outDur * 1000) }, poster });
    } finally { busy--; fsp.rm(tmp, { recursive: true, force: true }).catch(() => {}); }
  }));

  // Auto-captions: speech-to-text with word timings, grouped into short lines (TikTok style)
  app.post('/api/video/captions', auth, wrap(async (req, res) => {
    const src = await mediaRow(req.user.id, req.body?.mediaId, ['video', 'audio']); if (!src) return fail(res, 404, 'Upload the video first.');
    if (!ctx.AI_KEY) return fail(res, 503, 'Captions aren’t available right now.');
    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'cap-'));
    try { await fetchUgc(src.file, path.join(tmp, 'in')); await run(['-i', path.join(tmp, 'in'), '-vn', '-ac', '1', '-ar', '16000', '-af', 'highpass=f=80,loudnorm', '-t', '300', path.join(tmp, 'a.mp3')]);
      const fd = new FormData(); fd.append('file', new Blob([await fsp.readFile(path.join(tmp, 'a.mp3'))], { type: 'audio/mpeg' }), 'a.mp3'); fd.append('model', 'whisper-large-v3-turbo');
      fd.append('response_format', 'verbose_json'); fd.append('timestamp_granularities[]', 'word'); if (req.body?.lang) fd.append('language', String(req.body.lang).slice(0, 2));
      const r = await fetch(ctx.AI_BASE + '/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + ctx.AI_KEY }, body: fd, signal: AbortSignal.timeout(90000) });
      if (!r.ok) return fail(res, 502, 'Couldn’t make captions right now.'); const j = await r.json();
      const words = (j.words || []).filter(w => w.word?.trim()); const lines = []; let cur = null;
      for (const w of words) { if (!cur || cur.text.length + w.word.length > 26 || w.start - cur.end > 0.7) { cur && lines.push(cur); cur = { start: w.start, end: w.end, text: w.word.trim() }; } else { cur.text += ' ' + w.word.trim(); cur.end = w.end; } }
      cur && lines.push(cur); if (!lines.length && j.text) lines.push({ start: 0, end: Math.max(2, j.duration || 3), text: j.text.trim().slice(0, 120) });
      res.json({ captions: lines.map(l => ({ start: +l.start.toFixed(2), end: +l.end.toFixed(2), text: l.text })) });
    } finally { fsp.rm(tmp, { recursive: true, force: true }).catch(() => {}); }
  }));
};
