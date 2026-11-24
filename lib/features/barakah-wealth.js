// Feature: barakah-wealth — Barakah daily checklists + score, Halal wealth (accounts, budget, transactions, zakat estimate),
// AI-assisted Shariah stock/ETF screener (cached, rate-limited, with clear disclaimers).
const fs = require('fs');
const path = require('path');

module.exports = function barakahWealth(ctx) {
  const { app, q, auth, wrap, todayFor, aiChat, parseJson, FAST_MODEL } = ctx;
  const BAR = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'data', 'bw-barakah.json'), 'utf8'));
  const ITEMS = new Map(); for (const s of BAR.sections) for (const it of s.items) ITEMS.set(it.id, s.id);
  const TOTAL = ITEMS.size;

  let ready;
  const ensure = () => ready ||= (async () => {
    await q(`CREATE TABLE IF NOT EXISTS bw_barakah (user_id INT NOT NULL, day DATE NOT NULL, items JSONB NOT NULL DEFAULT '[]'::jsonb, PRIMARY KEY(user_id, day))`);
    await q(`CREATE TABLE IF NOT EXISTS wealth_settings (user_id INT PRIMARY KEY, currency TEXT NOT NULL DEFAULT 'USD', income NUMERIC NOT NULL DEFAULT 0, budget JSONB NOT NULL DEFAULT '{}'::jsonb)`);
    await q(`CREATE TABLE IF NOT EXISTS wealth_accounts (id SERIAL PRIMARY KEY, user_id INT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, balance NUMERIC NOT NULL DEFAULT 0, interest BOOLEAN NOT NULL DEFAULT false, updated_at TIMESTAMPTZ DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS wealth_tx (id SERIAL PRIMARY KEY, user_id INT NOT NULL, day DATE NOT NULL, amount NUMERIC NOT NULL, cat TEXT NOT NULL, note TEXT, income BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ DEFAULT now())`);
    await q(`CREATE INDEX IF NOT EXISTS wealth_tx_user_day ON wealth_tx(user_id, day)`);
    await q(`ALTER TABLE wealth_tx ADD COLUMN IF NOT EXISTS sub TEXT`).catch(() => {});
    await q(`CREATE TABLE IF NOT EXISTS wealth_screen (ticker TEXT PRIMARY KEY, data JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS wealth_screen_use (user_id INT NOT NULL, day TEXT NOT NULL, n INT NOT NULL DEFAULT 0, PRIMARY KEY(user_id, day))`);
  })().catch(e => { ready = null; throw e; });

  const addDays = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const num = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n * 100) / 100 : null; };
  const str = (v, n) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, n);

  // ---------------- BARAKAH ----------------
  async function barakahState(user) {
    const uid = user.id, today = todayFor(user);
    const rows = (await q(`SELECT to_char(day,'YYYY-MM-DD') d, items FROM bw_barakah WHERE user_id=$1 AND day >= $2 ORDER BY day`, [uid, addDays(today, -60)])).rows;
    const by = Object.fromEntries(rows.map(r => [r.d, r.items.filter(i => ITEMS.has(i))]));
    const score = d => Math.round(((by[d] || []).length / TOTAL) * 100);
    const week = []; for (let i = 6; i >= 0; i--) { const d = addDays(today, -i); week.push({ d, score: score(d) }); }
    let streak = 0, d = (by[today] || []).length ? today : addDays(today, -1); while ((by[d] || []).length) { streak++; d = addDays(d, -1); }
    return { today, done: by[today] || [], score: score(today), week, streak, total: TOTAL };
  }
  app.get('/api/bw/barakah', auth, wrap(async (req, res) => { await ensure(); res.json(await barakahState(req.user)); }));
  app.post('/api/bw/barakah', auth, wrap(async (req, res) => {
    await ensure(); const id = String(req.body?.item || ''); if (!ITEMS.has(id)) return res.status(400).json({ error: 'Unknown item' });
    const on = req.body?.on !== false, day = todayFor(req.user);
    const cur = (await q('SELECT items FROM bw_barakah WHERE user_id=$1 AND day=$2', [req.user.id, day])).rows[0]?.items || [];
    const set = new Set(cur); on ? set.add(id) : set.delete(id);
    await q(`INSERT INTO bw_barakah(user_id,day,items) VALUES($1,$2,$3) ON CONFLICT(user_id,day) DO UPDATE SET items=$3`, [req.user.id, day, JSON.stringify([...set])]);
    res.json(await barakahState(req.user));
  }));

  // ---------------- WEALTH ----------------
  const KINDS = ['bank', 'cash', 'savings', 'investments', 'gold', 'silver', 'crypto', 'property', 'debt'];
  const CATS = ['needs', 'family', 'sadaqah', 'savings', 'wants', 'income'];
  const ZAKATABLE = new Set(['bank', 'cash', 'savings', 'investments', 'gold', 'silver', 'crypto']);
  const daysIn = m => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
  const nextMonth = m => { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 1)); return d.toISOString().slice(0, 7); };
  const prevMonth = m => { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 2, 1)); return d.toISOString().slice(0, 7); };
  async function wealthState(user, want) {
    const uid = user.id, today = todayFor(user), thisMonth = today.slice(0, 7);
    const month = /^\d{4}-\d{2}$/.test(want || '') && want <= thisMonth && want >= '2000-01' ? want : thisMonth;
    const from = month + '-01', to = nextMonth(month) + '-01';
    const st = (await q('SELECT currency, income, budget FROM wealth_settings WHERE user_id=$1', [uid])).rows[0] || { currency: 'USD', income: 0, budget: {} };
    const accounts = (await q('SELECT id, kind, name, balance::float balance, interest FROM wealth_accounts WHERE user_id=$1 ORDER BY kind, id', [uid])).rows;
    const tx = (await q(`SELECT id, to_char(day,'YYYY-MM-DD') AS day, amount::float amount, cat, sub, note, income FROM wealth_tx WHERE user_id=$1 AND day >= $2 AND day < $3 ORDER BY day DESC, id DESC LIMIT 1000`, [uid, from, to])).rows;
    const since = addDays(thisMonth + '-01', -160).slice(0, 7) + '-01';
    const months = (await q(`SELECT to_char(day,'YYYY-MM') m, sum(amount) FILTER (WHERE NOT income)::float spent, sum(amount) FILTER (WHERE income)::float earned, sum(amount) FILTER (WHERE cat='sadaqah')::float sadaqah FROM wealth_tx WHERE user_id=$1 AND day >= $2 GROUP BY 1 ORDER BY 1`, [uid, since])).rows;
    const pm = prevMonth(month);
    const prevBy = Object.fromEntries((await q(`SELECT cat, sum(amount)::float v FROM wealth_tx WHERE user_id=$1 AND NOT income AND day >= $2 AND day < $3 GROUP BY cat`, [uid, pm + '-01', from])).rows.map(r => [r.cat, r.v]));
    const spentBy = {}, bySub = {}, daily = Array(daysIn(month)).fill(0); let spent = 0, earned = 0;
    for (const t of tx) { if (t.income) earned += t.amount; else { spent += t.amount; spentBy[t.cat] = (spentBy[t.cat] || 0) + t.amount; const k = t.cat + '|' + (t.sub || 'Other'); bySub[k] = (bySub[k] || 0) + t.amount; daily[+t.day.slice(8) - 1] += t.amount; } }
    const assets = accounts.filter(a => a.kind !== 'debt').reduce((s, a) => s + a.balance, 0), debts = accounts.filter(a => a.kind === 'debt').reduce((s, a) => s + a.balance, 0);
    const zakatable = accounts.filter(a => ZAKATABLE.has(a.kind)).reduce((s, a) => s + Math.max(0, a.balance), 0);
    return { currency: st.currency, income: +st.income, budget: st.budget || {}, accounts, tx, month, thisMonth, daysInMonth: daysIn(month), dayOfMonth: month === thisMonth ? +today.slice(8) : daysIn(month),
      spent, earned, spentBy, prevBy, bySub, daily, months,
      netWorth: assets - debts, assets, debts, zakatable, sadaqah: spentBy.sadaqah || 0, ribaFlag: accounts.some(a => a.interest) };
  }
  app.get('/api/wealth', auth, wrap(async (req, res) => { await ensure(); res.json(await wealthState(req.user, req.query.month)); }));
  app.put('/api/wealth/settings', auth, wrap(async (req, res) => {
    await ensure(); const b = req.body || {};
    const cur = str(b.currency || 'USD', 3).toUpperCase(); if (!/^[A-Z]{3}$/.test(cur)) return res.status(400).json({ error: 'Use a 3-letter currency code, e.g. USD, GBP, LKR' });
    const income = num(b.income ?? 0, 0, 1e12); if (income == null) return res.status(400).json({ error: 'Bad income' });
    const budget = {}; for (const c of CATS) if (c !== 'income' && b.budget?.[c] != null) { const v = num(b.budget[c], 0, 1e12); if (v == null) return res.status(400).json({ error: 'Bad budget' }); budget[c] = v; }
    await q(`INSERT INTO wealth_settings(user_id,currency,income,budget) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET currency=$2, income=$3, budget=$4`, [req.user.id, cur, income, JSON.stringify(budget)]);
    res.json(await wealthState(req.user, req.query.month));
  }));
  app.post('/api/wealth/accounts', auth, wrap(async (req, res) => {
    await ensure(); const b = req.body || {}, uid = req.user.id;
    const kind = KINDS.includes(b.kind) ? b.kind : null, name = str(b.name, 60), bal = num(b.balance, -1e12, 1e12);
    if (!kind || !name || bal == null) return res.status(400).json({ error: 'Name, type and balance are required' });
    if (b.id) { const r = await q('UPDATE wealth_accounts SET kind=$3, name=$4, balance=$5, interest=$6, updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING id', [+b.id, uid, kind, name, bal, !!b.interest]); if (!r.rows.length) return res.status(404).json({ error: 'Not found' }); }
    else { const n = (await q('SELECT count(*)::int n FROM wealth_accounts WHERE user_id=$1', [uid])).rows[0].n; if (n >= 50) return res.status(400).json({ error: 'Up to 50 accounts' });
      await q('INSERT INTO wealth_accounts(user_id,kind,name,balance,interest) VALUES($1,$2,$3,$4,$5)', [uid, kind, name, bal, !!b.interest]); }
    res.json(await wealthState(req.user));
  }));
  app.delete('/api/wealth/accounts/:id', auth, wrap(async (req, res) => { await ensure(); await q('DELETE FROM wealth_accounts WHERE id=$1 AND user_id=$2', [+req.params.id, req.user.id]); res.json(await wealthState(req.user)); }));
  app.post('/api/wealth/tx', auth, wrap(async (req, res) => {
    await ensure(); const b = req.body || {}, uid = req.user.id;
    const amount = num(b.amount, 0.01, 1e12), cat = CATS.includes(b.cat) ? b.cat : null, day = /^\d{4}-\d{2}-\d{2}$/.test(b.day || '') ? b.day : todayFor(req.user);
    if (amount == null || !cat) return res.status(400).json({ error: 'Amount and category are required' });
    const income = cat === 'income';
    const sub = str(b.sub || '', 40) || null;
    if (b.id) { const r = await q('UPDATE wealth_tx SET day=$3, amount=$4, cat=$5, note=$6, income=$7, sub=$8 WHERE id=$1 AND user_id=$2 RETURNING id', [+b.id, uid, day, amount, cat, str(b.note, 120), income, sub]); if (!r.rows.length) return res.status(404).json({ error: 'Not found' }); }
    else await q('INSERT INTO wealth_tx(user_id,day,amount,cat,note,income,sub) VALUES($1,$2,$3,$4,$5,$6,$7)', [uid, day, amount, cat, str(b.note, 120), income, sub]);
    res.json(await wealthState(req.user, req.query.month || day.slice(0, 7)));
  }));
  app.delete('/api/wealth/tx/:id', auth, wrap(async (req, res) => { await ensure(); await q('DELETE FROM wealth_tx WHERE id=$1 AND user_id=$2', [+req.params.id, req.user.id]); res.json(await wealthState(req.user, req.query.month)); }));
  app.get('/api/wealth/export.csv', auth, wrap(async (req, res) => {
    await ensure(); const rows = (await q(`SELECT to_char(day,'YYYY-MM-DD') AS day, amount::float amount, cat, sub, note, income FROM wealth_tx WHERE user_id=$1 ORDER BY day`, [req.user.id])).rows;
    const esc = v => `"${String(v ?? '').replace(/"/g, '""').replace(/^[=+\-@]/, "'$&")}"`;
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="shukr-wealth.csv"' });
    res.send(['Date,Type,Amount,Category,Subcategory,Note', ...rows.map(r => [r.day, r.income ? 'Income' : 'Spending', r.amount, r.cat, r.sub, r.note].map(esc).join(','))].join('\n'));
  }));

  // ---------------- SHARIAH SCREENER (AI-assisted) ----------------
  app.post('/api/wealth/screen', auth, wrap(async (req, res) => {
    await ensure(); const raw = str(req.body?.ticker, 40);
    const key = raw.toUpperCase().replace(/[^A-Z0-9.\- &]/g, '').trim(); if (key.length < 1) return res.status(400).json({ error: 'Enter a ticker or company name' });
    const hit = (await q(`SELECT data, created_at FROM wealth_screen WHERE ticker=$1 AND created_at > now() - interval '24 hours'`, [key])).rows[0];
    if (hit) return res.json({ ...hit.data, cached: true, checkedAt: hit.created_at });
    const day = todayFor(req.user);
    const u = await q(`INSERT INTO wealth_screen_use(user_id,day,n) VALUES($1,$2,1) ON CONFLICT(user_id,day) DO UPDATE SET n=wealth_screen_use.n+1 RETURNING n`, [req.user.id, day]);
    if (u.rows[0].n > 20) { await q('UPDATE wealth_screen_use SET n=n-1 WHERE user_id=$1 AND day=$2', [req.user.id, day]); return res.status(429).json({ error: 'You’ve used today’s 20 screens. Try again tomorrow.' }); }
    let j;
    try {
      const out = await aiChat([
        { role: 'system', content: `You are a careful Shariah equity-screening assistant using AAOIFI-style methodology. For the given stock, ETF or company:
1) Business activity screen: flag any core business in conventional banking/insurance/interest-based finance, alcohol, pork, gambling, adult entertainment, tobacco, cannabis, and (per many boards) weapons/defence. Non-compliant revenue must be under 5%.
2) Financial ratios (use your best knowledge of the latest reported figures, approximate): interest-bearing debt / market cap < 30%; cash + interest-bearing securities / market cap < 30%; receivables / market cap < 49% (some boards use 33%).
3) For ETFs: say whether it is an explicitly Shariah-screened fund; otherwise assess its holdings broadly.
Never claim certainty; data may be outdated. If you do not know the company, say so and use verdict "Unknown".
Reply ONLY with JSON: {"name":"company or fund name","ticker":"symbol or empty","type":"stock|etf|unknown","verdict":"Likely compliant|Doubtful|Likely not compliant|Unknown","business":{"pass":true|false|null,"note":"1-2 sentences"},"ratios":[{"name":"Debt / market cap","value":"~x% or unknown","pass":true|false|null}],"nonCompliantRevenuePct":"~x% or unknown","reasons":["2-4 short reasons"],"dataAsOf":"approx year of figures"}` },
        { role: 'user', content: raw }
      ], { model: FAST_MODEL, json: true, max_tokens: 700, temperature: 0.1 });
      const p = parseJson(out) || {};
      const V = ['Likely compliant', 'Doubtful', 'Likely not compliant', 'Unknown'];
      j = { query: raw, name: str(p.name, 80) || raw, ticker: str(p.ticker, 15), type: ['stock', 'etf'].includes(p.type) ? p.type : 'unknown', verdict: V.includes(p.verdict) ? p.verdict : 'Unknown',
        business: { pass: typeof p.business?.pass === 'boolean' ? p.business.pass : null, note: str(p.business?.note, 300) },
        ratios: (Array.isArray(p.ratios) ? p.ratios : []).slice(0, 4).map(r => ({ name: str(r?.name, 50), value: str(r?.value, 30), pass: typeof r?.pass === 'boolean' ? r.pass : null })).filter(r => r.name),
        nonCompliantRevenuePct: str(p.nonCompliantRevenuePct, 30), reasons: (Array.isArray(p.reasons) ? p.reasons : []).slice(0, 4).map(r => str(r, 200)).filter(Boolean), dataAsOf: str(p.dataAsOf, 20) };
    } catch (e) { await q('UPDATE wealth_screen_use SET n=GREATEST(0,n-1) WHERE user_id=$1 AND day=$2', [req.user.id, day]); return res.status(502).json({ error: 'The screener is unavailable right now. Please try again shortly.' }); }
    if (j.verdict !== 'Unknown') await q(`INSERT INTO wealth_screen(ticker,data) VALUES($1,$2) ON CONFLICT(ticker) DO UPDATE SET data=$2, created_at=now()`, [key, JSON.stringify(j)]);
    res.json({ ...j, checkedAt: new Date().toISOString() });
  }));

  // ---------------- Alim connector ----------------
  ctx.alimData = ctx.alimData || {};
  ctx.alimData.barakah = async user => { await ensure(); const s = await barakahState(user); return { todayScore: s.score, doneToday: s.done, streakDays: s.streak, last7: s.week.map(w => `${w.d.slice(5)}:${w.score}`).join(' '), page: '/barakah' }; };
  ctx.alimData.wealth = async user => { await ensure(); const s = await wealthState(user);
    return { currency: s.currency, netWorth: Math.round(s.netWorth), zakatableAssets: Math.round(s.zakatable), debts: Math.round(s.debts), thisMonth: { spent: Math.round(s.spent), earned: Math.round(s.earned), sadaqah: Math.round(s.sadaqah), byCategory: Object.fromEntries(Object.entries(s.spentBy).map(([k, v]) => [k, Math.round(v)])) },
      budget: s.budget, hasInterestBearing: s.ribaFlag, accounts: s.accounts.length, page: '/wealth', note: 'Not financial advice.' }; };
};
