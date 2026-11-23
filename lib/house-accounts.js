// Shukr-run community accounts (clearly Shukr-branded, verified) that post original 9:16 videos with ambient audio.
const crypto = require('crypto');
const ACCOUNTS = [
  { username: 'shukrdaily', name: 'Shukr Daily', bio: 'A daily dose of gratitude from the Shukr team.' },
  { username: 'shukrnature', name: 'Shukr Nature', bio: 'His signs in creation. Posted by the Shukr team.' },
  { username: 'shukrreminders', name: 'Shukr Reminders', bio: 'Short reminders from the Shukr team.' },
  { username: 'shukrfacts', name: 'Shukr Facts', bio: 'Amazing facts about creation — with the Qur’an. By the Shukr team.' }];
// Newer, voiced videos (rendered by scripts/build-house-videos.py → public/media/house/videos.json)
let EXTRA = []; try { EXTRA = require('../public/media/house/videos.json'); } catch {}
const REELS = [
  ['shukrdaily', 'dawn-sky', 'Alhamdulillah for a new morning 🌅 What are you grateful for today?', 'wellbeing'],
  ['shukrnature', 'ocean', 'SubhanAllah — look at the sea He made 🌊', 'world'],
  ['shukrnature', 'night-stars', 'Allahu Akbar ✨ Step outside tonight and count the stars.', 'world'],
  ['shukrreminders', 'rain-window', 'Rain is a mercy — a time when du‘a is accepted. Make yours now 🤲', 'sunnah'],
  ['shukrnature', 'golden-field', 'MashaAllah 🌾 Every grain is a gift.', 'world'],
  ['shukrreminders', 'calm-heart', '“Verily, in the remembrance of Allah do hearts find rest.” (Qur’an 13:28) 🤍', 'quran']];
module.exports = async function seedHouse(ctx) {
  const { q } = ctx;
  try {
    for (const a of ACCOUNTS) {
      let u = (await q('SELECT u.id FROM users u JOIN profiles p ON p.user_id=u.id WHERE p.username=$1', [a.username])).rows[0];
      if (!u) {
        const email = `${a.username}@team.shukr.app`, pw = crypto.randomBytes(24).toString('hex');
        // Unusable password (not a valid scrypt hash) → nobody can log in to these accounts.
        u = (await q('INSERT INTO users(email,name,pass) VALUES($1,$2,$3) ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name RETURNING id', [email, a.name, 'locked:' + pw])).rows[0];
        await q(`INSERT INTO profiles(user_id,username,display_name,bio) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET username=EXCLUDED.username,display_name=EXCLUDED.display_name,bio=EXCLUDED.bio`, [u.id, a.username, a.name, a.bio]);
      }
      a.id = u.id;
    }
    let day = 0;
    for (const v of EXTRA) REELS.unshift([v.account, v.slug, v.caption, v.topic, v.duration]);
    for (const [user, slug, caption, topic, secs] of REELS) {
      const id = 'post-house-' + slug; if ((await q('SELECT 1 FROM fyp_publications WHERE id=$1', [id])).rows[0]) continue;
      const a = ACCOUNTS.find(x => x.username === user);
      const content = { id, ugc: true, format: 'reel', topic, title: caption.split(/[—.!]/)[0].slice(0, 80), hook: caption, body: caption, takeaway: '', sources: [], quiz: null,
        media: { src: `/media/house/${slug}.mp4`, poster: `/media/house/${slug}.jpg`, alt: caption, durationSeconds: Math.round(secs || 12), width: 720, height: 1280, ugc: true },
        author: { username: a.username, name: a.name, handle: a.username, verified: true }, authorId: a.id, publishedAt: new Date(Date.now() - (day++) * 5 * 3600e3).toISOString(), durationSeconds: Math.round(secs || 12) };
      await q('INSERT INTO fyp_publications(id,user_id,content,published_at) VALUES($1,$2,$3,$4)', [id, a.id, JSON.stringify(content), content.publishedAt]);
    }
  } catch (e) { console.log('house accounts', e.message); }
};
