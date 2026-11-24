// Registry of per-section data readers for Alim's app_data tool. Other feature modules add their own:
//   ctx.alimData.<section> = async (user, { brief }) => <small JSON summary of the user's data>
module.exports = function alimData(ctx) {
  const { q, todayFor, computeStats } = ctx;
  const R = ctx.alimData = ctx.alimData || {};
  const safe = async (sql, p) => { try { return (await q(sql, p)).rows; } catch { return []; } };
  R.prayers = async user => { const rows = await safe(`SELECT to_char(day,'YYYY-MM-DD') d, prayer, status FROM prayer_logs WHERE user_id=$1 AND day > CURRENT_DATE - 14 ORDER BY day DESC`, [user.id]);
    const by = {}; rows.forEach(r => (by[r.d] ||= {})[r.prayer] = r.status); return { last14days: by, settings: { method: user.settings?.method, madhab: user.settings?.madhab, city: user.settings?.city } }; };
  R.fasting = async user => ({ daysFastedLast60: (await safe(`SELECT to_char(day,'YYYY-MM-DD') d, kind FROM fasting WHERE user_id=$1 AND day > CURRENT_DATE - 60 ORDER BY day DESC`, [user.id])) });
  R.quran = async user => ({ pagesLast14: await safe(`SELECT to_char(day,'YYYY-MM-DD') d, quran_pages FROM day_logs WHERE user_id=$1 AND day > CURRENT_DATE - 14 AND quran_pages > 0 ORDER BY day DESC`, [user.id]) });
  R.journal = async user => ({ recent: (await safe(`SELECT to_char(day,'YYYY-MM-DD') d, left(text,200) t FROM entries WHERE user_id=$1 ORDER BY day DESC LIMIT 5`, [user.id])) });
  R.blessings = async user => ({ recent: (await safe(`SELECT text, category FROM blessings WHERE user_id=$1 ORDER BY id DESC LIMIT 8`, [user.id])) });
  R.habits = async user => { try { return computeStats ? await computeStats(user, 14).then(s => ({ streaks: s.streaks })) : {}; } catch { return {}; } };
  R.jummah = async user => ({ myMosques: await safe(`SELECT m.name, m.jummah, m.langs FROM ummah_fav f JOIN ummah_mosques m ON m.id=f.mosque_id WHERE f.user_id=$1 LIMIT 10`, [user.id]),
    reminders: { jummah: user.settings?.reminders?.jummah !== false, adhanMode: user.settings?.reminders?.adhanMode || 'sound' } });
  R.profile = async user => ({ name: user.name, city: user.settings?.city, tz: user.settings?.tz });
};
