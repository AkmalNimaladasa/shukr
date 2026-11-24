// Free English Quran audio: ClearQuran (Talal Itani) verse-by-verse narration, "Ollie" voice, Allah edition.
// Licence CC BY-ND 4.0 — commercial use allowed, unmodified, with attribution. We serve the original MP3 bytes untouched,
// pulled once per verse from ClearQuran's official zip via HTTP range requests (index of byte offsets built offline),
// then cached in the app's S3 bucket (or local disk) so ClearQuran's CDN is hit at most once per verse.
const fs = require('fs'), path = require('path');
module.exports = function quranEnAudio(ctx) {
  const { app, wrap } = ctx;
  const IDX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'clearquran-idx.json'), 'utf8'));
  const s3 = ctx.s3 || null, bucket = process.env.S3_BUCKET;
  const dir = path.join(ctx.uploadDir || path.join(__dirname, '..', '..', '.uploads'), 'cq'); try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  const mem = new Map(); const inflight = new Map();
  const ATTR = 'English narration: The Clear Quran by Dr. Talal Itani (ClearQuran.com), audio by Awais Mahmood — CC BY-ND 4.0';
  async function fromCache(key) {
    if (mem.has(key)) return mem.get(key);
    if (s3) { try { const { GetObjectCommand } = require('@aws-sdk/client-s3'); const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: 'cq/' + key + '.mp3' })); return Buffer.from(await r.Body.transformToByteArray()); } catch { return null; } }
    try { return fs.readFileSync(path.join(dir, key + '.mp3')); } catch { return null; }
  }
  async function toCache(key, buf) {
    if (mem.size > 300) mem.delete(mem.keys().next().value); mem.set(key, buf);
    if (s3) { try { const { PutObjectCommand } = require('@aws-sdk/client-s3'); await s3.send(new PutObjectCommand({ Bucket: bucket, Key: 'cq/' + key + '.mp3', Body: buf, ContentType: 'audio/mpeg' })); } catch (e) { console.error('cq s3', e.message); } }
    else { try { fs.writeFileSync(path.join(dir, key + '.mp3'), buf); } catch {} }
  }
  async function fetchVerse(key) {
    const [off, size] = IDX.idx[key];
    const r = await fetch(IDX.src, { headers: { Range: `bytes=${off}-${off + size - 1}`, 'User-Agent': 'Mozilla/5.0 (Shukr app; +https://shukr-1467.roarai.app)' }, signal: AbortSignal.timeout(20000) });
    if (r.status !== 206) throw new Error('upstream ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length !== size || buf[0] !== 0xFF && buf.slice(0, 3).toString() !== 'ID3') throw new Error('bad audio');
    return buf;
  }
  app.get('/api/quran/en-audio/:s/:a', wrap(async (req, res) => {
    const s = +req.params.s, a = +req.params.a; const key = String(s).padStart(3, '0') + String(a).padStart(3, '0');
    if (!IDX.idx[key]) return res.status(404).json({ error: 'No such ayah' });
    let buf = await fromCache(key);
    if (!buf) { if (!inflight.has(key)) inflight.set(key, fetchVerse(key).then(async b => { await toCache(key, b); return b; }).finally(() => inflight.delete(key))); buf = await inflight.get(key); }
    else mem.set(key, buf);
    res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=31536000, immutable', 'Accept-Ranges': 'bytes', 'X-Attribution': 'The Clear Quran by Dr. Talal Itani (ClearQuran.com), audio by Awais Mahmood, CC BY-ND 4.0' });
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (range) { const start = range[1] ? +range[1] : 0, end = range[2] ? Math.min(+range[2], buf.length - 1) : buf.length - 1;
      if (start >= buf.length) return res.status(416).end();
      res.status(206).set({ 'Content-Range': `bytes ${start}-${end}/${buf.length}`, 'Content-Length': end - start + 1 }); return res.end(buf.subarray(start, end + 1)); }
    res.set('Content-Length', buf.length); res.end(buf);
  }));
  app.get('/api/quran/en-audio-credit', (req, res) => res.json({ attribution: ATTR, license: 'CC BY-ND 4.0', url: 'https://clearquran.com' }));
};
