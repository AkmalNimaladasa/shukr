const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const lessons = JSON.parse(fs.readFileSync(path.join(root, 'public/data/fyp-lessons.json'), 'utf8'));
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const assets = new Set();
function local(src) {
  assert.match(src, /^\/media\/fyp\/[a-z0-9-]+\.(webp|mp4)$/);
  const file = path.join(root, 'public', src);
  assert.ok(fs.existsSync(file), `Missing ${file}`);
  assert.ok(fs.statSync(file).size > 1000, `Empty asset ${file}`);
  assets.add(file);
  return file;
}
test('all 30 sourced lessons are preserved, with balanced real social formats', () => {
  assert.equal(lessons.length, 30);
  const original = lessons.map(({format, media, ...rest}) => rest);
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(canonical(original))).digest('hex'), '97b1764bc516c3767ff97f7820236cff33d0277ef82cf6bdf9c67b563ba30a31', 'No edits to existing sourced text, quiz, identifiers, or lesson reading durations');
  for (const topic of ['quran','sunnah','character','wellbeing','learning','world']) {
    const group = lessons.filter(l => l.topic === topic);
    assert.deepEqual(group.map(l => l.format), ['reel','carousel','carousel','image','image']);
  }
});
test('media contract resolves to distinct real images, slides and playable H264 reels', () => {
  const images = [];
  for (const lesson of lessons) {
    const m = lesson.media;
    assert.ok(m && typeof m.alt === 'string' && m.alt.length > 35);
    const file = local(m.src);
    if (lesson.format === 'reel') {
      assert.equal(m.durationSeconds, 24);
      images.push([local(m.poster), 720, 1280]);
      const probe = JSON.parse(execFileSync('/usr/local/bin/ffprobe', ['-v','error','-show_streams','-show_format','-of','json',file], {encoding:'utf8'}));
      const video = probe.streams.find(s => s.codec_type === 'video');
      assert.equal(video.codec_name, 'h264');
      assert.equal(video.pix_fmt, 'yuv420p');
      assert.equal(video.width, 720);
      assert.equal(video.height, 1280);
      assert.ok(Math.abs(Number(probe.format.duration) - 24) < 0.1);
      assert.ok(Number(video.nb_frames) >= 288);
      assert.equal(probe.streams.some(s => s.codec_type === 'audio'), true, 'Reels ship with an original ambient audio track');
      execFileSync('/usr/local/bin/ffmpeg', ['-v','error','-i',file,'-f','null','-'], {timeout:30000});
    } else if (lesson.format === 'carousel') {
      assert.equal(m.slides.length, 3);
      assert.equal(m.src, m.slides[0].src);
      assert.equal(new Set(m.slides.map(s => s.src)).size, 3);
      for (const slide of m.slides) {
        assert.ok(slide.alt.length > 35);
        images.push([local(slide.src),720,1280]);
      }
    } else {
      assert.equal(lesson.format, 'image');
      images.push([file,720,1280]);
    }
  }
  // Pillow validates actual image decoding and intrinsic dimensions, not extensions.
  execFileSync('python', ['-c', 'import json,sys; from PIL import Image; entries=json.loads(sys.argv[1]); hashes=set(); import hashlib\nfor p,w,h in entries:\n im=Image.open(p); assert im.size==(w,h),(p,im.size); im.load(); hashes.add(hashlib.sha256(im.tobytes()).hexdigest())\nassert len(hashes)==len(entries), "Images must not be duplicated placeholders"', JSON.stringify(images)], {timeout:30000});
  assert.equal(assets.size, 60);
  const bytes = [...assets].reduce((n, file) => n + fs.statSync(file).size, 0);
  assert.ok(bytes < 15 * 1024 * 1024, `${bytes} bytes exceeds media budget`);
});
