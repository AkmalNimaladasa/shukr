// Feature: study — Pomodoro & deep-focus sessions, tasks & exam countdowns, flashcards (spaced repetition), stats.
module.exports = function study(ctx) {
  const { app, q, auth, wrap, todayFor } = ctx;
  let ready;
  const ensure = () => ready ||= (async () => {
    await q(`CREATE TABLE IF NOT EXISTS study_sessions (id SERIAL PRIMARY KEY, user_id INT NOT NULL, day DATE NOT NULL, kind TEXT NOT NULL, minutes INT NOT NULL, subject TEXT, note TEXT, created_at TIMESTAMPTZ DEFAULT now())`);
    await q(`CREATE INDEX IF NOT EXISTS study_sessions_user_day ON study_sessions(user_id, day)`);
    await q(`CREATE TABLE IF NOT EXISTS study_tasks (id SERIAL PRIMARY KEY, user_id INT NOT NULL, title TEXT NOT NULL, subject TEXT, due DATE, exam BOOLEAN NOT NULL DEFAULT false, done BOOLEAN NOT NULL DEFAULT false, est INT, created_at TIMESTAMPTZ DEFAULT now(), done_at TIMESTAMPTZ)`);
    await q(`CREATE TABLE IF NOT EXISTS study_decks (id SERIAL PRIMARY KEY, user_id INT NOT NULL, name TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS study_cards (id SERIAL PRIMARY KEY, deck_id INT NOT NULL, user_id INT NOT NULL, front TEXT NOT NULL, back TEXT NOT NULL, box INT NOT NULL DEFAULT 0, due DATE NOT NULL DEFAULT CURRENT_DATE, reviews INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS study_prefs (user_id INT PRIMARY KEY, goal INT NOT NULL DEFAULT 120, focus INT NOT NULL DEFAULT 25, short INT NOT NULL DEFAULT 5, long INT NOT NULL DEFAULT 15, rounds INT NOT NULL DEFAULT 4, subjects JSONB NOT NULL DEFAULT '[]'::jsonb)`);
  })().catch(e => { ready = null; throw e; });
  const rows = (s, a) => q(s, a).then(r => r.rows);
  const str = (v, n) => String(v ?? '').trim().slice(0, n);
  const addDays = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const BOX_DAYS = [0, 1, 3, 7, 14, 30, 60];
  const prefs = async uid => (await rows('SELECT goal, focus, short, long, rounds, subjects FROM study_prefs WHERE user_id=$1', [uid]))[0] || { goal: 120, focus: 25, short: 5, long: 15, rounds: 4, subjects: [] };

  async function summary(user) {
    const uid = user.id, today = todayFor(user), from = addDays(today, -83);
    const days = await rows(`SELECT to_char(day,'YYYY-MM-DD') AS d, sum(minutes)::int m, count(*)::int n FROM study_sessions WHERE user_id=$1 AND day >= $2 GROUP BY day ORDER BY day`, [uid, from]);
    const subj = await rows(`SELECT COALESCE(NULLIF(subject,''),'General') s, sum(minutes)::int m FROM study_sessions WHERE user_id=$1 AND day >= $2 GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, [uid, addDays(today, -29)]);
    const hours = await rows(`SELECT extract(hour from created_at)::int h, sum(minutes)::int m FROM study_sessions WHERE user_id=$1 AND day >= $2 GROUP BY 1`, [uid, addDays(today, -29)]);
    const tot = (await rows('SELECT COALESCE(sum(minutes),0)::int m, count(*)::int n FROM study_sessions WHERE user_id=$1', [uid]))[0];
    const by = Object.fromEntries(days.map(r => [r.d, r.m]));
    let streak = 0; for (let d = by[today] ? today : addDays(today, -1); by[d]; d = addDays(d, -1)) streak++;
    let best = 0, run = 0; for (let i = 83; i >= 0; i--) { const d = addDays(today, -i); if (by[d]) { run++; best = Math.max(best, run); } else run = 0; }
    const week = Array.from({ length: 7 }, (_, i) => { const d = addDays(today, i - 6); return { d, m: by[d] || 0 }; });
    const dueCards = (await rows('SELECT count(*)::int n FROM study_cards WHERE user_id=$1 AND due <= $2', [uid, today]))[0].n;
    const openTasks = (await rows('SELECT count(*)::int n FROM study_tasks WHERE user_id=$1 AND NOT done', [uid]))[0].n;
    const nextExam = (await rows(`SELECT id, title, subject, to_char(due,'YYYY-MM-DD') due FROM study_tasks WHERE user_id=$1 AND exam AND NOT done AND due >= $2 ORDER BY due LIMIT 1`, [uid, today]))[0] || null;
    return { today, todayMin: by[today] || 0, streak, best, week, heat: Array.from({ length: 84 }, (_, i) => { const d = addDays(today, i - 83); return by[d] || 0; }), subjects: subj, hours, total: tot, dueCards, openTasks, nextExam, prefs: await prefs(uid) };
  }

  app.get('/api/study', auth, wrap(async (req, res) => { await ensure(); res.json(await summary(req.user)); }));
  app.put('/api/study/prefs', auth, wrap(async (req, res) => {
    await ensure(); const b = req.body || {}, n = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Math.round(+v || d)));
    const subjects = Array.isArray(b.subjects) ? [...new Set(b.subjects.map(s => str(s, 30)).filter(Boolean))].slice(0, 20) : [];
    await q(`INSERT INTO study_prefs(user_id,goal,focus,short,long,rounds,subjects) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT(user_id) DO UPDATE SET goal=$2,focus=$3,short=$4,long=$5,rounds=$6,subjects=$7::jsonb`,
      [req.user.id, n(b.goal, 10, 960, 120), n(b.focus, 5, 180, 25), n(b.short, 1, 30, 5), n(b.long, 5, 60, 15), n(b.rounds, 2, 8, 4), JSON.stringify(subjects)]);
    res.json(await summary(req.user));
  }));
  app.post('/api/study/session', auth, wrap(async (req, res) => {
    await ensure(); const b = req.body || {}, minutes = Math.round(+b.minutes || 0);
    if (minutes < 1 || minutes > 600) return res.status(400).json({ error: 'Session length must be 1–600 minutes' });
    const kind = ['pomodoro', 'focus', 'manual'].includes(b.kind) ? b.kind : 'manual';
    const today = todayFor(req.user), before = (await rows('SELECT COALESCE(sum(minutes),0)::int m FROM study_sessions WHERE user_id=$1 AND day=$2', [req.user.id, today]))[0].m;
    if (before + minutes > 960) return res.status(400).json({ error: 'That’s more than 16 hours today — please check the time' });
    await q('INSERT INTO study_sessions(user_id,day,kind,minutes,subject,note) VALUES($1,$2,$3,$4,$5,$6)', [req.user.id, today, kind, minutes, str(b.subject, 30) || null, str(b.note, 200) || null]);
    if (b.taskId) await q('UPDATE study_tasks SET done=true, done_at=now() WHERE id=$1 AND user_id=$2 AND $3::boolean', [+b.taskId, req.user.id, !!b.completeTask]);
    res.json(await summary(req.user));
  }));
  app.get('/api/study/sessions', auth, wrap(async (req, res) => {
    await ensure(); res.json({ sessions: await rows(`SELECT id, to_char(day,'YYYY-MM-DD') AS day, kind, minutes, subject, note, created_at FROM study_sessions WHERE user_id=$1 ORDER BY id DESC LIMIT 50`, [req.user.id]) });
  }));
  app.delete('/api/study/session/:id', auth, wrap(async (req, res) => { await ensure(); await q('DELETE FROM study_sessions WHERE id=$1 AND user_id=$2', [+req.params.id, req.user.id]); res.json({ ok: true }); }));

  // ---------- tasks & exams ----------
  const taskList = uid => rows(`SELECT id, title, subject, to_char(due,'YYYY-MM-DD') due, exam, done, est FROM study_tasks WHERE user_id=$1 AND (NOT done OR done_at > now() - interval '3 days') ORDER BY done, due NULLS LAST, id`, [uid]);
  app.get('/api/study/tasks', auth, wrap(async (req, res) => { await ensure(); res.json({ tasks: await taskList(req.user.id) }); }));
  app.post('/api/study/tasks', auth, wrap(async (req, res) => {
    await ensure(); const b = req.body || {}, uid = req.user.id, title = str(b.title, 120);
    const due = /^\d{4}-\d{2}-\d{2}$/.test(b.due || '') ? b.due : null;
    if (b.id) {
      if (b.toggle) await q('UPDATE study_tasks SET done=NOT done, done_at=CASE WHEN done THEN NULL ELSE now() END WHERE id=$1 AND user_id=$2', [+b.id, uid]);
      else { if (!title) return res.status(400).json({ error: 'Add a title' }); await q('UPDATE study_tasks SET title=$3, subject=$4, due=$5, exam=$6, est=$7 WHERE id=$1 AND user_id=$2', [+b.id, uid, title, str(b.subject, 30) || null, due, !!b.exam, Math.round(+b.est) || null]); }
    } else {
      if (!title) return res.status(400).json({ error: 'Add a title' });
      if ((await rows('SELECT count(*)::int n FROM study_tasks WHERE user_id=$1 AND NOT done', [uid]))[0].n >= 300) return res.status(400).json({ error: 'Too many open tasks' });
      await q('INSERT INTO study_tasks(user_id,title,subject,due,exam,est) VALUES($1,$2,$3,$4,$5,$6)', [uid, title, str(b.subject, 30) || null, due, !!b.exam, Math.round(+b.est) || null]);
    }
    res.json({ tasks: await taskList(uid) });
  }));
  app.delete('/api/study/tasks/:id', auth, wrap(async (req, res) => { await ensure(); await q('DELETE FROM study_tasks WHERE id=$1 AND user_id=$2', [+req.params.id, req.user.id]); res.json({ tasks: await taskList(req.user.id) }); }));

  // ---------- flashcards (Leitner boxes) ----------
  const decks = (uid, today) => rows(`SELECT d.id, d.name, count(c.id)::int cards, count(c.id) FILTER (WHERE c.due <= $2)::int due, count(c.id) FILTER (WHERE c.box >= 4)::int mastered FROM study_decks d LEFT JOIN study_cards c ON c.deck_id=d.id WHERE d.user_id=$1 GROUP BY d.id ORDER BY d.id DESC`, [uid, today]);
  app.get('/api/study/decks', auth, wrap(async (req, res) => { await ensure(); res.json({ decks: await decks(req.user.id, todayFor(req.user)) }); }));
  app.post('/api/study/decks', auth, wrap(async (req, res) => {
    await ensure(); const uid = req.user.id, name = str(req.body?.name, 60); if (!name) return res.status(400).json({ error: 'Name your deck' });
    if (req.body?.id) await q('UPDATE study_decks SET name=$3 WHERE id=$1 AND user_id=$2', [+req.body.id, uid, name]);
    else { if ((await rows('SELECT count(*)::int n FROM study_decks WHERE user_id=$1', [uid]))[0].n >= 100) return res.status(400).json({ error: 'Too many decks' }); await q('INSERT INTO study_decks(user_id,name) VALUES($1,$2)', [uid, name]); }
    res.json({ decks: await decks(uid, todayFor(req.user)) });
  }));
  app.delete('/api/study/decks/:id', auth, wrap(async (req, res) => {
    await ensure(); const uid = req.user.id; await q('DELETE FROM study_cards WHERE deck_id=$1 AND user_id=$2', [+req.params.id, uid]); await q('DELETE FROM study_decks WHERE id=$1 AND user_id=$2', [+req.params.id, uid]);
    res.json({ decks: await decks(uid, todayFor(req.user)) });
  }));
  const ownDeck = async (uid, id) => (await rows('SELECT id, name FROM study_decks WHERE id=$1 AND user_id=$2', [id, uid]))[0];
  app.get('/api/study/decks/:id/cards', auth, wrap(async (req, res) => {
    await ensure(); const uid = req.user.id, d = await ownDeck(uid, +req.params.id); if (!d) return res.status(404).json({ error: 'Deck not found' });
    const today = todayFor(req.user), all = req.query.all === '1';
    res.json({ deck: d, cards: await rows(`SELECT id, front, back, box, to_char(due,'YYYY-MM-DD') due FROM study_cards WHERE deck_id=$1 ${all ? '' : 'AND due <= $2'} ORDER BY ${all ? 'id' : 'box, random()'} LIMIT ${all ? 1000 : 100}`, all ? [d.id] : [d.id, today]) });
  }));
  app.post('/api/study/decks/:id/cards', auth, wrap(async (req, res) => {
    await ensure(); const uid = req.user.id, d = await ownDeck(uid, +req.params.id); if (!d) return res.status(404).json({ error: 'Deck not found' });
    const list = Array.isArray(req.body?.cards) ? req.body.cards : [req.body];
    const clean = list.map(c => ({ id: +c.id || null, f: str(c.front, 500), b: str(c.back, 1000) })).filter(c => c.f && c.b).slice(0, 200);
    if (!clean.length) return res.status(400).json({ error: 'Add a front and a back' });
    if ((await rows('SELECT count(*)::int n FROM study_cards WHERE deck_id=$1', [d.id]))[0].n + clean.filter(c => !c.id).length > 2000) return res.status(400).json({ error: 'A deck can hold up to 2,000 cards' });
    for (const c of clean) c.id ? await q('UPDATE study_cards SET front=$3, back=$4 WHERE id=$1 AND user_id=$2', [c.id, uid, c.f, c.b]) : await q('INSERT INTO study_cards(deck_id,user_id,front,back,due) VALUES($1,$2,$3,$4,$5)', [d.id, uid, c.f, c.b, todayFor(req.user)]);
    res.json({ ok: true, added: clean.length });
  }));
  app.delete('/api/study/cards/:id', auth, wrap(async (req, res) => { await ensure(); await q('DELETE FROM study_cards WHERE id=$1 AND user_id=$2', [+req.params.id, req.user.id]); res.json({ ok: true }); }));
  app.post('/api/study/cards/:id/review', auth, wrap(async (req, res) => {
    await ensure(); const uid = req.user.id, c = (await rows('SELECT box FROM study_cards WHERE id=$1 AND user_id=$2', [+req.params.id, uid]))[0]; if (!c) return res.status(404).json({ error: 'Card not found' });
    const g = String(req.body?.grade || 'good'), box = g === 'again' ? 0 : g === 'hard' ? Math.max(1, c.box) : g === 'easy' ? Math.min(6, c.box + 2) : Math.min(6, c.box + 1);
    const due = addDays(todayFor(req.user), g === 'again' ? 0 : Math.max(1, BOX_DAYS[box]));
    await q('UPDATE study_cards SET box=$3, due=$4, reviews=reviews+1 WHERE id=$1 AND user_id=$2', [+req.params.id, uid, box, due]);
    res.json({ box, due });
  }));

  // Alim can read study progress (paid users with app_data).
  ctx.alimData = ctx.alimData || {};
  ctx.alimData.study = async user => { await ensure(); const s = await summary(user); return { todayMinutes: s.todayMin, goalMinutes: s.prefs.goal, streakDays: s.streak, last7Days: s.week, topSubjects: s.subjects, cardsDue: s.dueCards, openTasks: s.openTasks, nextExam: s.nextExam }; };
};
