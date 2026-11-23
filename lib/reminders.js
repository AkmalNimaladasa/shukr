// Push reminders v3: prayer (adhan / notification sound / silent per user choice), Jummah alert with nearest mosques & khutbah languages, adhkar, journal, streak, sleep, Friday,
// blessing-quote gratitude reminders, akhirah reminders, Quran daily goal, hifz review due.
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

module.exports = function reminders(ctx) {
  const { app, q, auth, wrap, localParts, todayFor, addDays, computeStats, defaultSettings, prayerTimesFor } = ctx;
  const AK = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'akhirah.json')));
  let pushOn = false;
  ctx.vapidPublic = () => ctx._vapid || null;

  async function initPush() {
    let pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) {
      await q('CREATE TABLE IF NOT EXISTS app_kv (k TEXT PRIMARY KEY, v JSONB NOT NULL)');
      let row = (await q(`SELECT v FROM app_kv WHERE k='vapid'`)).rows[0];
      if (!row) { const keys = webpush.generateVAPIDKeys(); await q(`INSERT INTO app_kv(k,v) VALUES('vapid',$1) ON CONFLICT (k) DO NOTHING`, [keys]); row = (await q(`SELECT v FROM app_kv WHERE k='vapid'`)).rows[0]; }
      pub = row.v.publicKey; priv = row.v.privateKey;
    }
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:salam@shukr.app', pub, priv);
    ctx._vapid = pub; pushOn = true; console.log('Push ready');
  }
  ctx.initPush = initPush;
  ctx.pushReady = () => pushOn;

  async function pushUser(userId, payload) {
    if (!pushOn || !payload) return 0;
    // Sound: payload.sound = 'adhan' (app plays the chosen adhan when open / on tap), 'sound' (device default), 'silent'.
    payload = { ...payload, silent: payload.sound === 'silent' };
    const subs = (await q('SELECT endpoint, sub FROM push_subs WHERE user_id=$1', [userId])).rows; let n = 0;
    for (const s of subs) {
      try { await webpush.sendNotification(s.sub, JSON.stringify(payload), { TTL: 3600, urgency: payload.urgency || 'normal' }); n++; }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await q('DELETE FROM push_subs WHERE endpoint=$1', [s.endpoint]); else console.log('push err', e.statusCode, String(e.body || '').slice(0, 120)); }
    }
    return n;
  }
  ctx.pushUser = pushUser;

  app.post('/api/push/subscribe', auth, wrap(async (req, res) => {
    const sub = req.body.subscription; if (!sub?.endpoint) return res.status(400).json({ error: 'bad subscription' });
    await q('INSERT INTO push_subs(endpoint,user_id,sub) VALUES($1,$2,$3) ON CONFLICT(endpoint) DO UPDATE SET user_id=$2, sub=$3', [sub.endpoint, req.user.id, sub]);
    res.json({ ok: true });
  }));
  app.post('/api/push/unsubscribe', auth, wrap(async (req, res) => { if (req.body.endpoint) await q('DELETE FROM push_subs WHERE endpoint=$1 AND user_id=$2', [req.body.endpoint, req.user.id]); res.json({ ok: true }); }));
  app.post('/api/push/test', auth, wrap(async (req, res) => {
    const kind = req.body?.kind || 'test'; let payload = { title: 'Shukr', body: 'Reminders are on. Alhamdulillah 🌙', url: '/', tag: 'test', vibrate: [200, 100, 200] };
    if (kind === 'blessing') payload = await blessingPayload(req.user) || payload;
    if (kind === 'akhirah') payload = akhirahPayload(req.user, todayFor(req.user), 0);
    if (kind === 'prayer') { const rem = { ...defaultSettings().reminders, ...(req.user.settings?.reminders || {}) }; const mode = rem.adhanMode || 'sound';
      payload = { title: 'Asr time 🕌', body: 'Hayya ‘ala-s-salah — come to prayer.', url: mode === 'adhan' ? '/#/prayer?adhan=asr' : '/#/prayer', tag: 'prayer', sound: mode, adhan: mode === 'adhan' ? (rem.adhanVoice || 'madinah') : null, vibrate: mode === 'silent' ? [] : [300, 120, 300, 120, 300], renotify: true, urgency: 'high', requireInteraction: mode === 'adhan' }; }
    if (kind === 'jummah') { const s = { ...defaultSettings(), ...req.user.settings }; if (s.lat == null) return res.status(400).json({ error: 'Set your location first' });
      payload = await jummahPayload(req.user, s, { ...defaultSettings().reminders, ...(s.reminders || {}) }); }
    res.json({ sent: await pushUser(req.user.id, payload) });
  }));

  async function once(userId, key, day, fn) {
    const r = await q('INSERT INTO reminders_sent(user_id,key,day) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING key', [userId, key, day]);
    if (r.rows[0]) {
      try { const sent = await fn(); if(sent === 0) await q('DELETE FROM reminders_sent WHERE user_id=$1 AND key=$2 AND day=$3',[userId,key,day]); }
      catch(e) { await q('DELETE FROM reminders_sent WHERE user_id=$1 AND key=$2 AND day=$3',[userId,key,day]); throw e; }
    }
  }
  function ago(day, today) {
    const n = Math.round((new Date(today) - new Date(day)) / 864e5);
    return n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : n < 14 ? `${n} days ago` : n < 60 ? `${Math.round(n / 7)} weeks ago` : `${Math.round(n / 30)} months ago`;
  }
  async function blessingPayload(user) {
    const today = todayFor(user);
    const b = (await q(`SELECT text, to_char(day,'YYYY-MM-DD') d FROM blessings WHERE user_id=$1 ORDER BY (favorite::int * 2 + random()) DESC LIMIT 1`, [user.id])).rows[0];
    if (!b) return { title: 'Count your blessings ✨', body: '“If you are grateful, I will surely increase you.” (Ibrahim 14:7) What are you thankful for right now?', url: '/#/journal/new', tag: 'blessing', vibrate: [120, 60, 120] };
    return { title: `${ago(b.d, today)} you were grateful for…`, body: `“${b.text}” — say Alhamdulillah 🤲`, url: '/#/blessings', tag: 'blessing', vibrate: [120, 60, 120] };
  }
  function akhirahPayload(user, day, slot) {
    const s = user.settings || {}; const on = Object.entries({ qabr: 1, qiyamah: 1, sirat: 1, jannah: 1, jahannam: 1, ...(s.akhirahTopics || {}) }).filter(([, v]) => v).map(([k]) => k);
    const pool = AK.items.filter(i => on.includes(i.topic)); if (!pool.length) return null;
    const seed = [...(day + slot + user.id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const it = pool[seed % pool.length];
    const title = { qabr: '🕯️ Remember the grave', qiyamah: '⏳ The Day of Judgement', sirat: '⚖️ The Sirat & the Scales', jannah: '🌿 Jannah awaits', jahannam: '🔥 Protect yourself from the Fire' }[it.topic];
    return { title, body: `${it.en.slice(0, 220)}${it.en.length > 220 ? '…' : ''} — ${it.ref}`, url: '/#/akhirah', tag: 'akhirah', vibrate: [100, 80, 100] };
  }
  ctx.akhirahPayload = akhirahPayload;

  const PRAYER_NAMES = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
  const atMin = (minNow, hhmm, win = 10) => { if (!hhmm) return false; const [h, m] = hhmm.split(':').map(Number); const t = h * 60 + m; return minNow >= t && minNow < t + win; };

  // Jummah alert: closest mosques with Jummah times + khutbah languages (community database), falling back to the nearest mosques.
  async function jummahPayload(u, s, rem) {
    let list = [];
    try { list = await ctx.ummahNearby(+s.lat, +s.lng, Math.min(+rem.jummahRadius || 5000, 20000)); } catch {}
    const withJ = list.filter(m => m.jummah && m.jummah.length);
    const pickList = (withJ.length ? withJ : list).slice(0, 3);
    const km = d => d < 1000 ? Math.round(d / 10) * 10 + ' m' : (d / 1000).toFixed(1) + ' km';
    const line = m => { const j = (m.jummah || [])[0]; const t = j ? (j.khutbah || j.salah) : null;
      const langs = [...new Set([...(m.jummah || []).map(x => x.lang).filter(Boolean), ...(m.langs || [])])].slice(0, 2).join('/');
      return `${m.name}${t ? ' · ' + t : ''}${langs ? ' · ' + langs : ''} (${km(m.dist)})`; };
    const body = pickList.length ? pickList.map(line).join('\n') : 'Find a mosque near you for Jumu‘ah. Read Surah al-Kahf and send salawat upon the Prophet ﷺ.';
    return { title: 'Jumu‘ah Mubarak 🕌 Jummah today', body, url: '/#/jummah', tag: 'jummah', vibrate: [200, 100, 200, 100, 400], urgency: 'high', requireInteraction: true, sound: 'sound' };
  }
  ctx.jummahPayload = jummahPayload;

  const inQuiet = (m, from, to) => { const f = toMin(from), t = toMin(to); return f <= t ? m >= f && m < t : m >= f || m < t; };
  const toMin = s => { const [h, mm] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (mm || 0); };
  function hijriOf(day, adj) { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + (+adj || 0));
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }).formatToParts(d).map(x => [x.type, x.value]));
    return { d: +p.day, m: +p.month, y: parseInt(p.year) }; }
  // Event for a (tomorrow) date — sent the evening before.
  function islamicEventFor(day, adj) { const h = hijriOf(day, adj);
    if (h.m === 9 && h.d === 1) return { key: 'ramadan', title: 'Ramadan Mubarak tomorrow 🌙', body: 'Ramadan begins (subject to moon sighting). Plan suhoor and intend your fast tonight.' };
    if (h.m === 10 && h.d === 1) return { key: 'eid-fitr', title: 'Eid al-Fitr tomorrow 🎉', body: 'Pay Zakat al-Fitr before the Eid prayer. Takbir from tonight until the prayer.' };
    if (h.m === 12 && h.d === 1) return { key: 'dhul-hijjah', title: 'The best 10 days begin', body: 'The first ten days of Dhul Hijjah: increase dhikr — tahlil, takbir and tahmid.' };
    if (h.m === 12 && h.d === 9) return { key: 'arafah', title: 'Day of ‘Arafah tomorrow', body: 'Fasting ‘Arafah expiates the sins of the previous and coming year (Muslim 1162).' };
    if (h.m === 12 && h.d === 10) return { key: 'eid-adha', title: 'Eid al-Adha tomorrow 🐑', body: 'Takbir after every prayer from Fajr of ‘Arafah until ‘Asr on the 13th.' };
    if (h.m === 1 && h.d === 1) return { key: 'new-year', title: 'Islamic New Year tomorrow', body: 'A new Hijri year begins. Muharram is one of the sacred months.' };
    if (h.m === 1 && (h.d === 9 || h.d === 10)) return { key: 'ashura-' + h.d, title: h.d === 9 ? 'Tasu‘a tomorrow (9 Muharram)' : '‘Ashura tomorrow (10 Muharram)', body: 'Fasting ‘Ashura expiates the sins of the previous year (Muslim 1162); fast the 9th with it.' };
    if (h.d === 13 && h.m !== 12) return { key: 'white', title: 'White days start tomorrow', body: 'Fasting the 13th, 14th and 15th of the Hijri month is a sunnah (Nasa’i 2420).' };
    if (h.m === 8 && h.d === 15) return null;
    return null; }
  ctx.islamicEventFor = islamicEventFor;

  async function tick() {
    if (!ctx.dbReady() || !pushOn) return;
    const users = (await q('SELECT DISTINCT u.* FROM users u JOIN push_subs p ON p.user_id=u.id')).rows;
    const now = Date.now();
    for (const u of users) {
      try {
        const s = { ...defaultSettings(), ...u.settings }; const rem = { ...defaultSettings().reminders, ...(s.reminders || {}) };
        const lp = localParts(s.tz); const day = lp.day; const minNow = lp.hh * 60 + lp.mm;
        const quiet = rem.quietOn && inQuiet(minNow, rem.quietFrom || '23:00', rem.quietTo || '05:00');
        const pushUserQ = (id, pl) => (quiet && !/^(prayer|tahajjud|sunrise|jummah)/.test(pl?.tag || '')) ? 0 : pushUser(id, pl);
        const times = await prayerTimesFor(s, day);
        const near = (t, offsetMin = 0) => t && now >= t.getTime() + offsetMin * 60000 && now < t.getTime() + offsetMin * 60000 + 10 * 60000;
        if (times && rem.prayers) for (const p of Object.keys(PRAYER_NAMES)) {
          if (rem.prayerList && rem.prayerList[p] === false) continue;
          const mode = (rem.adhanPer && rem.adhanPer[p]) || rem.adhanMode || 'sound';
          if (near(times[p], -(rem.preAdhanMin || 0))) await once(u.id, 'prayer-' + p, day, () => pushUserQ(u.id, {
            sound: mode, adhan: mode === 'adhan' && !rem.preAdhanMin ? (p === 'fajr' ? (rem.fajrVoice || 'fajr-ramadan') : (rem.adhanVoice || 'madinah')) : null, prayer: p,
            title: `${PRAYER_NAMES[p]}${rem.preAdhanMin ? ' in ' + rem.preAdhanMin + ' min' : ' time'} 🕌`,
            body: p === 'fajr' ? 'As-salatu khayrun min an-nawm — prayer is better than sleep.' : 'Hayya ‘ala-s-salah — come to prayer.',
            url: mode === 'adhan' && !rem.preAdhanMin ? `/#/prayer?adhan=${p}` : '/#/prayer', tag: 'prayer-' + p, vibrate: mode === 'silent' ? [] : [300, 120, 300, 120, 300], renotify: true, requireInteraction: mode === 'adhan', urgency: 'high' }));
        }
        // Sunrise (end of Fajr), Duha, Tahajjud (last third), Monday/Thursday fasting
        if (times && rem.sunrise && near(times.sunrise, -10)) await once(u.id, 'sunrise', day, () => pushUserQ(u.id, { title: 'Sunrise in 10 minutes 🌅', body: 'Fajr time ends at sunrise — pray now if you haven’t yet.', url: '/#/prayer', tag: 'sunrise', vibrate: [200, 100, 200], urgency: 'high' }));
        if (times && rem.duha && times.sunrise && times.dhuhr) { const duhaAt = new Date(times.sunrise.getTime() + Math.round((times.dhuhr - times.sunrise) / 3)); // ~a third of the way to Dhuhr, well after the sun has risen
          if (near(duhaAt)) await once(u.id, 'duha', day, () => pushUserQ(u.id, { title: 'Duha prayer ☀️', body: '“Charity is due on every joint each morning… two rak‘ahs of Duha suffice for that.” (Muslim)', url: '/#/prayer', tag: 'duha', vibrate: [150, 80, 150] })); }
        if (rem.tahajjud) { const tm = await prayerTimesFor(s, addDays(day, 1)).catch(() => null), yest = await prayerTimesFor(s, addDays(day, -1)).catch(() => null);
          // last third of tonight (Maghrib today → Fajr tomorrow), and of last night (after midnight)
          const third = (mg, fj) => mg && fj ? new Date(fj.getTime() - (fj - mg) / 3) : null;
          for (const [t, key] of [[third(yest?.maghrib, times?.fajr), day], [third(times?.maghrib, tm?.fajr), addDays(day, 1)]]) if (t && near(t)) await once(u.id, 'tahajjud', key, () => pushUserQ(u.id, { title: 'Last third of the night 🌙', body: 'Our Lord descends to the lowest heaven: “Who is calling upon Me, that I may answer him?” (Bukhari & Muslim)', url: '/#/prayer', tag: 'tahajjud', vibrate: [120, 60, 120] })); }
        if (rem.fasting !== false && rem.fastMonThu && ['Sun', 'Wed'].includes(lp.weekday) && atMin(minNow, rem.fastTime || '21:00', 12)) await once(u.id, 'fast-eve', day, () => pushUserQ(u.id, { title: `Fasting tomorrow? (${lp.weekday === 'Sun' ? 'Monday' : 'Thursday'})`, body: 'The Prophet ﷺ fasted Mondays and Thursdays: “Deeds are presented on these days, and I love that mine are presented while I am fasting.” (Tirmidhi) — set an alarm for suhoor.', url: '/#/prayer', tag: 'fast', vibrate: [150, 80, 150] }));
        if (times && rem.fastMonThu && ['Mon', 'Thu'].includes(lp.weekday) && near(times.fajr, -45)) await once(u.id, 'fast-suhoor', day, () => pushUserQ(u.id, { title: 'Suhoor time 🌙', body: `It’s ${lp.weekday === 'Mon' ? 'Monday' : 'Thursday'} — eat suhoor and make your intention before Fajr.`, url: '/#/prayer', tag: 'fast', vibrate: [150, 80, 150] }));
        const stats = await computeStats(u, 30);
        if (times && rem.morning && near(times.fajr, 25) && !stats.streaks.morning.doneToday) await once(u.id, 'morning', day, () => pushUserQ(u.id, {
          title: 'Morning adhkar ☀️', body: stats.streaks.morning.current ? `Keep your ${stats.streaks.morning.current}-day streak going.` : 'Start your day with the remembrance of Allah.', url: '/#/adhkar/morning', tag: 'adhkar', vibrate: [150, 80, 150] }));
        if (times && rem.evening && near(times.asr, 20) && !stats.streaks.evening.doneToday) await once(u.id, 'evening', day, () => pushUserQ(u.id, {
          title: 'Evening adhkar 🌙', body: stats.streaks.evening.current ? `Evening streak: ${stats.streaks.evening.current} days. Protect it.` : 'Time for the evening remembrance.', url: '/#/adhkar/evening', tag: 'adhkar', vibrate: [150, 80, 150] }));
        if (rem.journal && atMin(minNow, rem.journalTime || '21:00', 15) && !stats.streaks.journal.doneToday) await once(u.id, 'journal', day, () => pushUserQ(u.id, {
          title: 'What are you grateful for today?', body: stats.streaks.journal.current ? `🔥 ${stats.streaks.journal.current}-day streak — write 3 blessings to keep it.` : '“If you are grateful, I will surely increase you.” (14:7)', url: '/#/journal/new', tag: 'journal', vibrate: [150, 80, 150] }));
        if (rem.streak && minNow >= 22 * 60 + 30 && minNow < 22 * 60 + 45) {
          const atRisk = ['journal', 'morning', 'evening'].filter(k => stats.streaks[k].current >= 2 && !stats.streaks[k].doneToday);
          if (atRisk.length) await once(u.id, 'streak', day, () => pushUserQ(u.id, { title: 'Streak at risk ⏳', body: `Your ${atRisk.join(', ')} streak ends at midnight. A few minutes is enough.`, url: '/', tag: 'streak', vibrate: [150, 80, 150] }));
        }
        if (rem.sleep && atMin(minNow, rem.sleepTime || '22:30', 15)) await once(u.id, 'sleep', day, () => pushUserQ(u.id, { title: 'Before you sleep 🌙', body: 'Ayat al-Kursi, the 3 Quls, Surah al-Mulk and tasbih of Fatimah (33·33·34).', url: '/#/adhkar/sleep', tag: 'sleep', vibrate: [120, 60, 120] }));
        // ---- v14 notification types ----
        const P5 = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
        // Jamaah/iqamah reminder: N minutes after adhan (time to reach the masjid)
        if (times && rem.iqamah && !quiet) for (const p of P5) { if (rem.prayerList && rem.prayerList[p] === false) continue;
          if (near(times[p], +rem.iqamahAfter || 10)) await once(u.id, 'iqamah-' + p, day, () => pushUserQ(u.id, { title: `${PRAYER_NAMES[p]} jamaah soon 🕌`, body: 'Iqamah is usually 10–20 minutes after the adhan. Head to the masjid now.', url: '/#/mosques', tag: 'iqamah-' + p, sound: 'sound' })); }
        // Missed-prayer check: 30 min before the next prayer, if not marked
        if (times && rem.missed && !quiet) { const tdy = (await q('SELECT prayer FROM prayer_logs WHERE user_id=$1 AND day=$2', [u.id, day]).catch(() => ({ rows: [] }))).rows.map(x => x.prayer);
          const nxt = { fajr: times.sunrise, dhuhr: times.asr, asr: times.maghrib, maghrib: times.isha };
          for (const [p, end] of Object.entries(nxt)) if (end && !tdy.includes(p) && near(end, -30)) await once(u.id, 'missed-' + p, day, () => pushUserQ(u.id, { title: `Have you prayed ${PRAYER_NAMES[p]}?`, body: `${PRAYER_NAMES[p]} time ends in about 30 minutes. Tap to mark it.`, url: '/#/prayer', tag: 'missed-' + p, sound: 'sound' })); }
        // Thursday night: Surah al-Kahf from Maghrib
        if (times && rem.kahfThu && lp.weekday === 'Thu' && near(times.maghrib, 15)) await once(u.id, 'kahf-thu', day, () => pushUserQ(u.id, { title: 'Friday starts at Maghrib 🌙', body: 'You can begin Surah al-Kahf tonight — a light between the two Fridays.', url: '/#/quran/18', tag: 'kahf' }));
        // Last hour of Friday (hour of acceptance)
        if (times && rem.fridayHour && lp.weekday === 'Fri' && near(times.maghrib, -60)) await once(u.id, 'fri-hour', day, () => pushUserQ(u.id, { title: 'The last hour of Friday 🤲', body: 'Many scholars say this is the hour in which dua is answered. Make dua now.', url: '/#/adhkar', tag: 'fri-hour', sound: 'sound' }));
        // Islamic calendar events (white days, Ramadan, Eid, Arafah, Ashura, Mawlid-free)
        if (rem.events !== false && !quiet && atMin(minNow, rem.eventsTime || '20:00', 12)) { const ev = islamicEventFor(addDays(day, 1), s.hijriAdj || 0);
          if (ev) await once(u.id, 'event-' + ev.key, day, () => pushUserQ(u.id, { title: ev.title, body: ev.body, url: '/#/calendar', tag: 'event' })); }
        // Mosque updates for my mosques (new/changed Jummah info)
        if (rem.mosqueUpdates !== false && !quiet && atMin(minNow, '18:00', 12)) await once(u.id, 'mosque-upd', day, async () => {
          const ch = (await q(`SELECT m.name, m.jummah FROM ummah_fav f JOIN ummah_mosques m ON m.id=f.mosque_id WHERE f.user_id=$1 AND m.updated_at > now() - interval '1 day' AND m.updated_by IS DISTINCT FROM $1 LIMIT 3`, [u.id]).catch(() => ({ rows: [] }))).rows;
          if (ch.length) return pushUserQ(u.id, { title: 'Your mosque updated its info', body: ch.map(m => m.name + ((m.jummah || [])[0] ? ' · Jummah ' + ((m.jummah[0].khutbah || m.jummah[0].salah) || '') : '')).join('\n'), url: '/#/jummah', tag: 'mosque-upd' }); });
        if (rem.jummah !== false && lp.weekday === 'Fri' && times && s.lat != null) {
          const lead = [30, 60, 90, 120, 180].includes(+rem.jummahLead) ? +rem.jummahLead : 60;
          if (near(times.dhuhr, -lead)) await once(u.id, 'jummah', day, async () => { const p = await jummahPayload(u, s, rem, lp); if (p) return pushUserQ(u.id, p); });
        }
        if (rem.friday && lp.weekday === 'Fri' && minNow >= 9 * 60 && minNow < 9 * 60 + 15) await once(u.id, 'friday', day, () => pushUserQ(u.id, { title: 'Jumu‘ah Mubarak', body: 'Read Surah al-Kahf and send abundant salawat upon the Prophet ﷺ.', url: '/#/quran/18', tag: 'friday', vibrate: [150, 80, 150] }));
        // Blessing-quote gratitude reminders
        if (rem.blessings !== false) for (const [i, t] of (rem.blessingTimes || ['13:00']).entries()) {
          if (atMin(minNow, t, 12)) await once(u.id, 'bless-' + i, day, async () => { const p = await blessingPayload(u); if (p) return pushUserQ(u.id, p); });
        }
        // Akhirah reminders
        if (rem.akhirah !== false) for (const [i, t] of (rem.akhirahTimes || ['20:00']).entries()) {
          if (atMin(minNow, t, 12)) await once(u.id, 'akhirah-' + i, day, async () => { const p = akhirahPayload(u, day, i); if (p) return pushUserQ(u.id, p); });
        }
        // Quran daily goal (evening, if under goal)
        if (rem.quran !== false && atMin(minNow, rem.quranTime || '19:30', 12)) {
          const n = (await q('SELECT count(*)::int n FROM quran_read WHERE user_id=$1 AND day=$2', [u.id, day])).rows[0].n;
          const goal = ((await q('SELECT daily_goal FROM quran_progress WHERE user_id=$1', [u.id])).rows[0]?.daily_goal) || 5;
          if (n < goal * 10) await once(u.id, 'quran', day, () => pushUserQ(u.id, { title: 'Your daily Quran 📖', body: n ? `You've read ${n} ayat today — finish your goal of ${goal} pages.` : `A few pages a day. Your goal: ${goal} pages.`, url: '/#/quran', tag: 'quran', vibrate: [120, 60, 120] }));
        }
        // Hifz review due
        if (rem.hifz !== false && atMin(minNow, rem.hifzTime || '06:30', 12)) {
          const n = (await q('SELECT count(*)::int n FROM hifz_items WHERE user_id=$1 AND due <= $2', [u.id, day])).rows[0].n;
          if (n) await once(u.id, 'hifz', day, () => pushUserQ(u.id, { title: 'Hifz review 🧠', body: `${n} ayah${n > 1 ? 's' : ''} due for review today.`, url: '/#/hifz', tag: 'hifz', vibrate: [120, 60, 120] }));
        }
      } catch (e) { console.log('tick err', u.id, e.message); }
    }
    await q(`DELETE FROM reminders_sent WHERE day < now() - interval '3 days'`).catch(() => {});
  }
  setInterval(() => tick().catch(e => console.log('tick', e.message)), 60 * 1000);
  ctx.reminderTick = tick;
};
