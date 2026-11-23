// Sound library for the editor (TikTok/Instagram-style "Add sound"): voice-only nasheeds, vocals and nature sounds.
// Bundled tracks are free-licensed (CC0 / CC BY / CC BY-SA / public domain, Wikimedia Commons) and listed in
// public/sounds/commons.json with their author, licence and source page (credited in the app). Shukr's own studio
// nasheeds (voice only) are in public/sounds/shukr.json. Users' own published studio nasheeds are added on top.
const fs = require('node:fs'), path = require('node:path');
const DIR = path.join(__dirname, '..', 'public', 'sounds');
const CATS = [['trending', 'For you'], ['nasheeds', 'Nasheeds'], ['gym', 'Gym & war cry'], ['peaceful', 'Peaceful'], ['vocals', 'Vocals'], ['nature', 'Nature'], ['calm', 'Rain & calm'], ['mine', 'My nasheeds']];
let cache = null;
const load = () => { if (cache) return cache; const all = [];
  for (const f of ['shukr.json', 'commons.json']) { try { all.push(...(JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')).sounds || [])); } catch {} }
  return (cache = all.filter(s => s && s.id && s.url)); };

module.exports = function soundLibrary(ctx) {
  const { app, q, auth, wrap } = ctx;
  app.get('/api/sounds', auth, wrap(async (req, res) => {
    const all = load(), cat = String(req.query.cat || 'trending'), qs = String(req.query.q || '').toLowerCase().trim();
    let mine = [];
    try { mine = (await q(`SELECT id, title, file, duration_ms FROM nasheeds WHERE user_id=$1 AND file IS NOT NULL AND status='ready' ORDER BY created_at DESC LIMIT 30`, [req.user.id])).rows
      .map(r => ({ id: 'mine:' + r.id, nasheedId: r.id, title: r.title, category: 'mine', mood: 'peaceful', url: '/ugc/' + r.file, duration: r.duration_ms ? r.duration_ms / 1000 : null, artist: 'You' })); } catch {}
    let list = cat === 'mine' ? mine : cat === 'trending' ? [...all.filter(s => s.featured), ...all.filter(s => !s.featured)].slice(0, 24)
      : cat === 'peaceful' ? all.filter(s => s.mood === 'peaceful' || s.mood === 'calm' && s.category === 'nasheeds') : all.filter(s => s.category === cat);
    if (qs) list = [...all, ...mine].filter(s => (s.title + ' ' + (s.artist || '') + ' ' + s.category + ' ' + (s.mood || '')).toLowerCase().includes(qs));
    res.json({ categories: CATS, sounds: list.slice(0, 60) });
  }));
  // Server-side lookup used by the video renderer: returns a local file path for a library sound id.
  ctx.soundFile = id => { const s = load().find(x => x.id === id); if (!s) return null; const f = path.join(__dirname, '..', 'public', s.url.replace(/^\//, '')); return fs.existsSync(f) ? f : null; };
  ctx.soundCredits = () => load().filter(s => s.license && !/shukr/i.test(s.license)).map(s => ({ title: s.title, artist: s.artist, license: s.license, source: s.source }));
  app.get('/api/sounds/credits', (req, res) => res.json({ credits: ctx.soundCredits() }));
};
module.exports.CATS = CATS;
