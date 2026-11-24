// Barakah & Halal wealth: daily barakah checklists + score; net worth, budget, transactions, zakat estimate; AI-assisted Shariah screener.
import { $, $$, esc, escAttr, I, api, toast, vibrate, shell, bindGo, loadJSON, askAlim, loadingHTML, confirmSheet, sheet, localDay } from '../core.js';

const TONE = { gold: ['#B45309', '#F59E0B'], violet: ['#6D28D9', '#A78BFA'], teal: ['#0F766E', '#2DD4BF'], green: ['#15803D', '#4ADE80'] };

// ================= BARAKAH =================
export async function viewBarakah() {
  const p = shell('Barakah');
  p.innerHTML = loadingHTML();
  const [D, s0] = await Promise.all([loadJSON('/data/bw-barakah.json'), api('/bw/barakah')]);
  let s = s0, open = new Set(['wealth']);
  function paint() {
    const done = new Set(s.done);
    p.innerHTML = `
      <div class="bw-hero"><div class="row between" style="align-items:center;gap:12px"><div><div class="bw-k">Today’s barakah</div><div class="bw-big">${s.score}<small>/100</small></div>
        <div class="bw-pill">${I.flame} ${s.streak} day streak</div></div>
        <div class="bw-week">${s.week.map(w => `<div><i style="height:${Math.max(6, w.score)}%"></i><span>${new Date(w.d + 'T12:00').toLocaleDateString([], { weekday: 'narrow' })}</span></div>`).join('')}</div></div></div>
      ${D.sections.map(sec => { const [c1, c2] = TONE[sec.tone] || TONE.gold, n = sec.items.filter(i => done.has(i.id)).length, isOpen = open.has(sec.id);
        return `<div class="bw-sec ${isOpen ? 'open' : ''}"><button class="bw-sech" data-sec="${sec.id}" style="--c1:${c1};--c2:${c2}"><span class="bw-ic">${I[sec.icon] || I.sparkle}</span><div class="grow"><b>${esc(sec.title)}</b>
          <div class="bw-bar"><i style="width:${n / sec.items.length * 100}%"></i></div></div><span class="bw-n">${n}/${sec.items.length}</span></button>
          ${isOpen ? sec.items.map(it => `<div class="bw-item ${done.has(it.id) ? 'on' : ''}" style="--c1:${c1};--c2:${c2}"><button class="bw-chk" data-it="${escAttr(it.id)}" aria-label="${escAttr(it.title)}">${done.has(it.id) ? I.check : I[it.icon] || ''}</button>
            <div class="grow"><b>${esc(it.title)}</b><p>${esc(it.text)}</p><div class="bw-ref">${esc(it.ref)}${it.go ? ` · <a href="#${escAttr(it.go)}">Open</a>` : ''}</div></div></div>`).join('') : ''}</div>`; }).join('')}
      <div class="card bw-dua"><h3>${I.dua} Dua for barakah in rizq</h3><div class="ar bw-ar" lang="ar">${esc(D.dua.ar)}</div><div class="bw-tl">${esc(D.dua.tr)}</div><p>${esc(D.dua.en)}</p><p class="muted small">${esc(D.dua.note)}</p><div class="bw-ref">${esc(D.dua.ref)}</div></div>
      <div class="grid2"><button class="btn ghost" data-go="/wealth">${I.wallet} Halal wealth</button><button class="btn ghost" id="bwAsk">${I.chat} Ask Alim</button></div>`;
    bindGo(p);
    $$('[data-sec]', p).forEach(b => b.onclick = () => { const id = b.dataset.sec; open.has(id) ? open.delete(id) : open.add(id); paint(); });
    $$('[data-it]', p).forEach(b => b.onclick = async () => { const id = b.dataset.it, on = !s.done.includes(id); s.done = on ? [...s.done, id] : s.done.filter(x => x !== id); vibrate(on ? [12, 30, 12] : 8); paint();
      try { s = await api('/bw/barakah', { body: { item: id, on } }); paint(); } catch (e) { toast(e.message); } });
    $('#bwAsk').onclick = () => askAlim('How can I bring more barakah into my wealth, time and family according to the Quran and Sunnah?');
  }
  paint();
}

// ================= HALAL WEALTH =================
const KIND = { bank: ['Bank', 'wallet'], cash: ['Cash', 'coin'], savings: ['Savings', 'gem'], investments: ['Investments', 'chart'], gold: ['Gold', 'star'], silver: ['Silver', 'star'], crypto: ['Crypto', 'layers'], property: ['Property', 'home'], debt: ['Debt / loan', 'alert'] };
const CAT = { needs: ['Needs', '#0EA5E9'], family: ['Family', '#8B5CF6'], sadaqah: ['Sadaqah', '#10B981'], savings: ['Savings', '#F59E0B'], wants: ['Wants', '#F43F5E'], income: ['Income', '#64748B'] };
const SUBS = { needs: ['Rent / home', 'Groceries', 'Utilities', 'Transport', 'Phone & internet', 'Health', 'Education', 'Insurance (takaful)'], family: ['Children', 'Parents', 'Spouse', 'Gifts', 'Relatives'],
  sadaqah: ['Masjid', 'Orphans', 'Zakat', 'Charity', 'Neighbours', 'Emergency appeal'], savings: ['Emergency fund', 'Hajj / Umrah', 'Investments', 'Gold', 'Big purchase'],
  wants: ['Eating out', 'Shopping', 'Entertainment', 'Travel', 'Subscriptions', 'Hobbies'], income: ['Salary', 'Business', 'Freelance', 'Gift', 'Rental', 'Other'] };
const ETFS = [['SPUS', 'SP Funds S&P 500 Sharia Industry Exclusions ETF'], ['HLAL', 'Wahed FTSE USA Shariah ETF'], ['UMMA', 'Wahed Dow Jones Islamic World ETF'], ['SPRE', 'SP Funds S&P Global REIT Sharia ETF'], ['ISWD / ISDU', 'iShares MSCI World / USA Islamic UCITS ETFs'], ['SPSK', 'SP Funds Dow Jones Global Sukuk ETF']];
export async function viewWealth(q) {
  const p = shell('Halal wealth');
  let tab = ['overview', 'budget', 'screen'].includes(q?.get('tab')) ? q.get('tab') : 'overview', s, month = '';
  const mq = () => month ? '?month=' + month : '';
  const money = (n, cur = s?.currency || 'USD') => { try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 }).format(n || 0); } catch { return `${cur} ${Math.round(n || 0).toLocaleString()}`; } };
  const tabs = () => `<div class="seg" style="margin-bottom:12px">${[['overview', 'Net worth'], ['budget', 'Budget'], ['screen', 'Halal screener']].map(([id, l]) => `<button data-tab="${id}" class="${id === tab ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const bindTabs = () => $$('[data-tab]', p).forEach(b => b.onclick = () => { tab = b.dataset.tab; history.replaceState(null, '', '#/wealth?tab=' + tab); render(); });
  async function render() { p.innerHTML = tabs() + loadingHTML(); bindTabs(); if (!s && tab !== 'screen') s = await api('/wealth' + mq()); tab === 'overview' ? overview() : tab === 'budget' ? budget() : screen(); }

  function accountSheet(a = {}) {
    sheet(`<h3>${a.id ? 'Edit' : 'Add'} account</h3>
      <label class="faint small">Type</label><select class="input" id="aK">${Object.entries(KIND).map(([k, [l]]) => `<option value="${k}" ${a.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <label class="faint small" style="display:block;margin-top:8px">Name</label><input class="input" id="aN" maxlength="60" value="${escAttr(a.name || '')}" placeholder="e.g. Current account">
      <label class="faint small" style="display:block;margin-top:8px">Balance (${esc(s.currency)})</label><input class="input" id="aB" type="number" inputmode="decimal" step="0.01" value="${a.balance ?? ''}">
      <label class="list-item" style="margin-top:8px"><div class="grow">Earns or charges interest</div><span class="toggle"><input type="checkbox" id="aI" ${a.interest ? 'checked' : ''}><span></span></span></label>
      <div class="row" style="gap:8px;margin-top:12px">${a.id ? `<button class="btn ghost" id="aDel">${I.trash}</button>` : ''}<button class="btn accent grow" id="aSave">Save</button></div>`, (el, close) => {
      $('#aSave', el).onclick = async () => { try { s = await api('/wealth/accounts', { body: { id: a.id, kind: $('#aK', el).value, name: $('#aN', el).value, balance: $('#aB', el).value, interest: $('#aI', el).checked } }); close(); overview(); } catch (e) { toast(e.message); } };
      const d = $('#aDel', el); if (d) d.onclick = async () => { s = await api('/wealth/accounts/' + a.id, { method: 'DELETE' }); close(); overview(); };
    });
  }
  function overview() {
    const by = {}; for (const a of s.accounts) (by[a.kind] ||= []).push(a);
    p.innerHTML = tabs() + `
      <div class="bw-whero"><div class="bw-k">Net worth</div><div class="bw-big">${money(s.netWorth)}</div>
        <div class="bw-wrow"><span>${I.chart} Assets ${money(s.assets)}</span><span>${I.alert} Debts ${money(s.debts)}</span></div>
        <button class="bw-cur" id="wCur">${esc(s.currency)} ${I.edit}</button></div>
      ${s.ribaFlag ? `<div class="bw-riba">${I.info}<div><b>A gentle note on interest</b><p>Some of your accounts earn or charge interest (riba), which Islam prohibits (Quran 2:275–279). Consider moving to an Islamic account, and give any interest earned to charity without counting it as sadaqah. Ask a scholar about your situation.</p></div></div>` : ''}
      <div class="card"><div class="row between" style="align-items:center"><h3 style="margin:0">Accounts</h3><button class="btn sm bw-addbtn" id="wAdd">${I.plus} Add</button></div>
        ${s.accounts.length ? Object.entries(by).map(([k, list]) => list.map(a => `<button class="bw-acc" data-acc="${a.id}"><span class="bw-aic ${k === 'debt' ? 'neg' : ''}">${I[KIND[k]?.[1]] || I.wallet}</span><div class="grow"><b>${esc(a.name)}</b><div class="faint small">${esc(KIND[k]?.[0] || k)}${a.interest ? ' · <span class="bw-itag">interest</span>' : ''}</div></div><span class="${k === 'debt' ? 'bw-neg' : ''}">${k === 'debt' ? '−' : ''}${money(a.balance)}</span></button>`).join('')).join('')
          : '<p class="muted small" style="margin-top:8px">Add your bank, cash, savings, gold and investments to see your net worth and zakat at a glance.</p>'}</div>
      <div class="card bw-zak"><h3>${I.coin} Zakat estimate</h3><div class="row between"><span class="muted">Zakatable assets</span><b>${money(s.zakatable)}</b></div><div class="row between"><span class="muted">2.5% if above nisab for a lunar year</span><b>${money(s.zakatable * 0.025)}</b></div>
        <p class="faint small">Includes cash, bank, savings, gold, silver, crypto and investments. Scholars differ on how to count shares and long-term investments, and debts due may reduce the amount. Use the full calculator for nisab and details.</p>
        <button class="btn ghost block" data-go="/zakat">Open Zakat calculator</button></div>
      <p class="faint small" style="text-align:center">Your numbers are private to you. Not financial advice.</p>`;
    bindTabs(); bindGo(p);
    $('#wAdd').onclick = () => accountSheet();
    $$('[data-acc]', p).forEach(b => b.onclick = () => accountSheet(s.accounts.find(a => a.id === +b.dataset.acc)));
    $('#wCur').onclick = () => settingsSheet();
  }
  function settingsSheet() {
    sheet(`<h3>Budget settings</h3><label class="faint small">Currency code</label><input class="input" id="sC" maxlength="3" value="${escAttr(s.currency)}" style="text-transform:uppercase">
      <label class="faint small" style="display:block;margin-top:8px">Monthly income</label><input class="input" id="sI" type="number" inputmode="decimal" value="${s.income || ''}">
      <h4 style="margin:14px 0 6px">Monthly budget by category</h4>${Object.entries(CAT).filter(([k]) => k !== 'income').map(([k, [l, c]]) => `<div class="list-item"><span class="bw-dot" style="background:${c}"></span><div class="grow">${l}</div><input class="input bw-num" type="number" inputmode="decimal" data-b="${k}" value="${s.budget[k] ?? ''}" placeholder="0"></div>`).join('')}
      <button class="btn ghost sm" id="sAuto" style="margin-top:6px">${I.sparkle} Suggest from my income</button>
      <p class="faint small">Guide: needs 50%, savings 20%, family 10%, wants 15%, sadaqah 5% (or more).</p>
      <button class="btn accent block" id="sSave">Save</button>`, (el, close) => {
      $('#sAuto', el).onclick = () => { const inc = +$('#sI', el).value || 0; if (!inc) return toast('Enter your monthly income first'); const P = { needs: .5, savings: .2, family: .1, wants: .15, sadaqah: .05 }; $$('[data-b]', el).forEach(i => { i.value = Math.round(inc * (P[i.dataset.b] || 0)); }); };
      $('#sSave', el).onclick = async () => { const budget = {}; $$('[data-b]', el).forEach(i => { if (i.value !== '') budget[i.dataset.b] = +i.value; });
        try { s = await api('/wealth/settings' + mq(), { method: 'PUT', body: { currency: $('#sC', el).value, income: +$('#sI', el).value || 0, budget } }); close(); render(); } catch (e) { toast(e.message); } };
    });
  }
  function txSheet(t = {}) {
    const isInc = t.income || t.cat === 'income';
    const cats = isInc ? ['income'] : Object.keys(CAT).filter(k => k !== 'income');
    sheet(`<h3>${t.id ? 'Edit' : 'Add'} ${isInc ? 'income' : 'spending'}</h3>
      <div class="bw-amt"><span>${esc(s.currency)}</span><input id="tA" type="number" inputmode="decimal" step="0.01" min="0" value="${t.amount ?? ''}" placeholder="0" autofocus></div>
      ${isInc ? '' : `<div class="bw-catgrid">${cats.map(k => `<button class="bw-catb ${(t.cat || 'needs') === k ? 'on' : ''}" data-c="${k}" style="--c:${CAT[k][1]}"><i></i>${CAT[k][0]}</button>`).join('')}</div>`}
      <div class="bw-subs" id="tSubs"></div>
      <div class="grid2" style="margin-top:10px"><div><label class="faint small">Date</label><input class="input" id="tD" type="date" value="${t.day || localDay()}"></div><div><label class="faint small">Note</label><input class="input" id="tN" maxlength="120" value="${escAttr(t.note || '')}" placeholder="Optional"></div></div>
      <div class="row" style="gap:8px;margin-top:14px">${t.id ? `<button class="btn ghost" id="tDel" aria-label="Delete">${I.trash}</button>` : ''}<button class="btn accent grow" id="tSave">Save</button></div>`, (el, close) => {
      let cat = isInc ? 'income' : (t.cat || 'needs'), sub = t.sub || '';
      const subs = () => { $('#tSubs', el).innerHTML = (SUBS[cat] || []).map(x => `<button class="chip sm ${x === sub ? 'on' : ''}" data-s="${escAttr(x)}">${esc(x)}</button>`).join('');
        $$('[data-s]', el).forEach(b => b.onclick = () => { sub = sub === b.dataset.s ? '' : b.dataset.s; subs(); }); };
      subs();
      $$('[data-c]', el).forEach(b => b.onclick = () => { cat = b.dataset.c; sub = ''; $$('[data-c]', el).forEach(x => x.classList.toggle('on', x === b)); subs(); });
      $('#tSave', el).onclick = async () => { const btn = $('#tSave', el); btn.disabled = true; try { s = await api('/wealth/tx' + mq(), { body: { id: t.id, amount: $('#tA', el).value, cat, sub, day: $('#tD', el).value, note: $('#tN', el).value } }); vibrate(12); close(); budget(); } catch (e) { btn.disabled = false; toast(e.message); } };
      const d = $('#tDel', el); if (d) d.onclick = async () => { s = await api('/wealth/tx/' + t.id + mq(), { method: 'DELETE' }); close(); budget(); };
    });
  }
  function donut(parts) {
    const total = parts.reduce((a, x) => a + x[1], 0); if (!total) return `<div class="bw-donut empty"><span>No spending yet</span></div>`;
    let acc = 0; const C = 2 * Math.PI * 42;
    return `<svg viewBox="0 0 100 100" class="bw-donut"><circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" stroke-width="12"/>${parts.filter(x => x[1] > 0).map(([k, v]) => { const len = v / total * C, el = `<circle cx="50" cy="50" r="42" fill="none" stroke="${CAT[k][1]}" stroke-width="12" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-acc}" transform="rotate(-90 50 50)"/>`; acc += len; return el; }).join('')}
      <text x="50" y="47" text-anchor="middle" class="bw-dt">Spent</text><text x="50" y="60" text-anchor="middle" class="bw-dv">${esc(money(total).replace(/\.\d+$/, ''))}</text></svg>`;
  }
  function budget() {
    const cats = Object.keys(CAT).filter(k => k !== 'income'), parts = cats.map(k => [k, s.spentBy[k] || 0]);
    const inc = s.earned || s.income || 0, left = inc - s.spent, totalBudget = cats.reduce((a, k) => a + (+s.budget[k] || 0), 0);
    const d = s.dayOfMonth, dim = s.daysInMonth, isNow = s.month === s.thisMonth, perDay = d ? s.spent / d : 0, projected = isNow ? perDay * dim : s.spent;
    const safeDaily = isNow && dim - d + 1 > 0 ? Math.max(0, (totalBudget || inc) - s.spent) / (dim - d + 1) : 0;
    const saveRate = inc ? Math.round((s.spentBy.savings || 0) / inc * 100) : null;
    const sadPct = inc ? (s.sadaqah / inc * 100) : 0;
    const monthLabel = new Date(s.month + '-15').toLocaleDateString([], { month: 'long', year: 'numeric' });
    const shift = n => { const [y, m] = s.month.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };
    const maxDay = Math.max(1, ...s.daily);
    const max = Math.max(1, ...s.months.map(m => Math.max(m.spent || 0, m.earned || 0)));
    const insight = (() => { const t = [];
      if (inc && left < 0) t.push([I.alert, 'bad', `You’ve spent ${money(-left)} more than you earned this month.`]);
      cats.forEach(k => { const b = +s.budget[k], sp = s.spentBy[k] || 0;
        if (b && sp > b) t.push([I.alert, 'bad', `${CAT[k][0]} is over budget by ${money(sp - b)}.`]);
        else if (b && isNow && sp / b > d / dim + 0.2) t.push([I.clock, 'warn', `${CAT[k][0]} is ahead of pace: ${Math.round(sp / b * 100)}% used with ${dim - d} days left.`]); });
      const top = cats.filter(k => s.prevBy[k] && s.spentBy[k]).map(k => [k, (s.spentBy[k] - s.prevBy[k]) / s.prevBy[k]]).sort((a, b) => b[1] - a[1])[0];
      if (top && top[1] > 0.25) t.push([I.chart, 'warn', `${CAT[top[0]][0]} is up ${Math.round(top[1] * 100)}% vs last month.`]);
      if (!s.sadaqah) t.push([I.heart, 'info', 'No sadaqah logged yet this month. “The most beloved deeds to Allah are the most consistent, even if small” (Bukhari 6464).']);
      else t.push([I.heart, 'good', `Sadaqah: ${money(s.sadaqah)}${inc ? ` (${sadPct.toFixed(1)}% of income)` : ''}. “Charity does not decrease wealth” (Muslim 2588).`]);
      return t.slice(0, 4); })();
    const catRow = k => { const sp = s.spentBy[k] || 0, b = +s.budget[k] || 0, pv = s.prevBy[k] || 0, over = b && sp > b;
      const subs = Object.entries(s.bySub).filter(([key]) => key.startsWith(k + '|')).sort((a, c) => c[1] - a[1]);
      const delta = pv ? Math.round((sp - pv) / pv * 100) : null;
      return `<details class="bw-cat" ${over ? 'open' : ''}><summary><span class="bw-cic" style="background:${CAT[k][1]}"></span><div class="bw-cmain"><div class="bw-ctop"><b>${CAT[k][0]}</b><span class="bw-cnum ${over ? 'bw-over' : ''}">${money(sp)}${b ? `<small> / ${money(b)}</small>` : ''}</span></div>
        ${b ? `<div class="bw-cbar2"><i style="width:${Math.min(100, sp / b * 100)}%;background:${over ? '#DC2626' : CAT[k][1]}"></i>${isNow ? `<em style="left:${d / dim * 100}%"></em>` : ''}</div>` : ''}
        <div class="bw-cmeta">${b ? (over ? `<span class="bw-over">Over by ${money(sp - b)}</span>` : `<span>${money(b - sp)} left</span>`) : '<span class="faint">No budget set</span>'}${delta != null ? `<span class="${delta > 0 ? 'up' : 'down'}">${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}% vs last month</span>` : ''}</div></div></summary>
        ${subs.length ? `<div class="bw-subl">${subs.map(([key, v]) => `<div><span>${esc(key.split('|')[1])}</span><b>${money(v)}</b></div>`).join('')}</div>` : '<div class="bw-subl faint small">No entries yet</div>'}</details>`; };
    p.innerHTML = tabs() + `
      <div class="bw-mnav"><button class="iconbtn" id="bSet" aria-label="Budget settings">${I.sliders}</button><button class="iconbtn" id="mPrev" aria-label="Previous month">${I.back}</button><b>${esc(monthLabel)}</b><button class="iconbtn bw-fwd" id="mNext" aria-label="Next month" ${isNow ? 'disabled' : ''}>${I.back}</button><span class="iconbtn" aria-hidden="true"></span></div>
      <div class="bw-bhero"><div class="bw-k">${inc ? (left >= 0 ? 'Left this month' : 'Over by') : 'Spent this month'}</div><div class="bw-big">${money(inc ? Math.abs(left) : s.spent)}</div>
        ${inc ? `<div class="bw-ibar"><i style="width:${Math.min(100, s.spent / inc * 100)}%"></i></div><div class="bw-hrow"><span>${money(s.spent)} spent</span><span>of ${money(inc)}</span></div>` : '<div class="bw-hrow"><span>Set your monthly income in settings to see what’s left</span></div>'}</div>
      <div class="bw-kpis">
        <div class="bw-kpi"><span>Income</span><b>${money(s.earned || s.income)}</b><small>${s.earned ? 'received' : 'expected'}</small></div>
        <div class="bw-kpi"><span>Spent</span><b>${money(s.spent)}</b><small>${isNow ? money(perDay) + ' a day' : 'total'}</small></div>
        <div class="bw-kpi sad"><span>Sadaqah</span><b>${money(s.sadaqah)}</b><small>${inc ? sadPct.toFixed(1) + '% of income' : 'this month'}</small></div>
        <div class="bw-kpi"><span>${isNow ? 'Projected' : 'Savings rate'}</span><b>${isNow ? money(projected) : (saveRate != null ? saveRate + '%' : '—')}</b><small>${isNow ? 'month-end spend' : 'of income'}</small></div>
        ${isNow && (totalBudget || inc) ? `<div class="bw-kpi"><span>Safe to spend</span><b>${money(safeDaily)}</b><small>a day, rest of month</small></div>` : ''}
        ${isNow && saveRate != null ? `<div class="bw-kpi"><span>Savings rate</span><b>${saveRate}%</b><small>put aside · aim 20%</small></div>` : ''}
      </div>
      <div class="grid2" style="margin:12px 0"><button class="btn accent" id="bAdd">${I.plus} Spending</button><button class="btn ghost" id="bInc">${I.plus} Income</button></div>
      ${insight.length ? `<div class="card bw-ins">${insight.map(([ic, tone, txt]) => `<div class="bw-insr ${tone}"><span>${ic}</span><p>${esc(txt)}</p></div>`).join('')}</div>` : ''}
      <div class="card"><h3>Where it went</h3>${isNow ? '<div class="faint small" style="margin:-4px 0 6px">The small line on each bar shows where you should be by today.</div>' : ''}
        <div class="bw-bud2">${donut(parts)}<div class="bw-legend">${cats.filter(k => s.spentBy[k]).map(k => `<span><i style="background:${CAT[k][1]}"></i>${CAT[k][0]} <b>${s.spent ? Math.round((s.spentBy[k] || 0) / s.spent * 100) : 0}%</b></span>`).join('') || '<span class="faint small">Log your first spending to see the breakdown</span>'}</div></div>
        <div class="bw-cats">${cats.map(catRow).join('')}</div></div>
      ${s.spent ? `<div class="card"><h3>Daily spending</h3><div class="bw-days">${s.daily.map((v, i) => `<i class="${isNow && i + 1 === d ? 'today' : ''}" style="height:${Math.max(v ? 6 : 2, v / maxDay * 100)}%"></i>`).join('')}</div><div class="bw-hrow faint small"><span>1</span><span>${dim}</span></div></div>` : ''}
      ${s.months.length > 1 ? `<div class="card"><h3>Last 6 months</h3><div class="bw-mbars">${s.months.slice(-6).map(m => `<div><div class="bw-mb"><i class="in" style="height:${(m.earned || 0) / max * 100}%"></i><i style="height:${(m.spent || 0) / max * 100}%"></i></div><span>${new Date(m.m + '-15').toLocaleDateString([], { month: 'short' })}</span></div>`).join('')}</div>
        <div class="faint small"><span class="bw-dot" style="background:#94A3B8"></span> income <span class="bw-dot" style="background:var(--accent);margin-left:8px"></span> spent</div></div>` : ''}
      <div class="card"><div class="row between" style="align-items:center"><h3 style="margin:0">Transactions</h3><a class="btn sm ghost" href="/api/wealth/export.csv" download>${I.download} CSV</a></div>
        ${s.tx.length ? `<div class="chips bw-filt" style="margin:8px 0"><button class="chip sm on" data-tf="">All</button>${Object.keys(CAT).filter(k => s.tx.some(t => t.cat === k)).map(k => `<button class="chip sm" data-tf="${k}">${CAT[k][0]}</button>`).join('')}</div><div id="bwTx"></div>` : '<p class="muted small" style="margin-top:8px">No entries this month.</p>'}</div>`;
    bindTabs();
    const txList = f => { const box = $('#bwTx', p); if (!box) return; let last = '';
      box.innerHTML = s.tx.filter(t => !f || t.cat === f).map(t => { const h = t.day !== last ? `<div class="bw-dayh">${new Date(t.day + 'T12:00').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</div>` : ''; last = t.day;
        return h + `<button class="bw-tx" data-tx="${t.id}"><span class="bw-cic sm" style="background:${CAT[t.cat]?.[1]}"></span><div class="grow"><b>${esc(t.note || t.sub || CAT[t.cat]?.[0] || t.cat)}</b><div class="faint small">${esc(CAT[t.cat]?.[0] || '')}${t.sub && t.note ? ' · ' + esc(t.sub) : ''}</div></div><span class="${t.income ? 'bw-pos' : ''}">${t.income ? '+' : '−'}${money(t.amount)}</span></button>`; }).join('');
      $$('[data-tx]', box).forEach(b => b.onclick = () => txSheet(s.tx.find(t => t.id === +b.dataset.tx))); };
    txList('');
    $$('[data-tf]', p).forEach(b => b.onclick = () => { $$('[data-tf]', p).forEach(x => x.classList.toggle('on', x === b)); txList(b.dataset.tf); });
    const go2 = async m => { month = m === s.thisMonth ? '' : m; $('.bw-mnav b', p).textContent = '…'; s = await api('/wealth' + mq()); budget(); };
    $('#mPrev').onclick = () => go2(shift(-1)); $('#mNext').onclick = () => { if (!isNow) go2(shift(1)); };
    $('#bSet').onclick = settingsSheet; $('#bAdd').onclick = () => txSheet(); $('#bInc').onclick = () => txSheet({ cat: 'income', income: true });
  }
  function screen() {
    p.innerHTML = tabs() + `
      <div class="bw-shero"><div class="bw-k">Shariah screener</div><div class="bw-big" style="font-size:22px">Is this stock or ETF halal?</div>
        <div class="bw-sform"><input id="scQ" placeholder="Ticker or company, e.g. AAPL" maxlength="40" autocapitalize="characters" enterkeyhint="search"><button class="btn accent" id="scGo">Check</button></div></div>
      <div class="bw-disc">${I.alert}<div><b>AI-assisted — not financial or religious advice.</b> Results use AAOIFI-style rules and may be outdated or wrong. Always verify with a dedicated Shariah screening service (e.g. Zoya, Musaffa, IdealRatings) and a qualified scholar before investing.</div></div>
      <div id="scOut"></div>
      <div class="card"><h3>How screening works</h3><ul class="bw-ul"><li><b>Business:</b> no core income from interest-based finance, alcohol, pork, gambling, adult content or tobacco; non-compliant income under 5%.</li>
        <li><b>Debt:</b> interest-bearing debt under 30% of market value.</li><li><b>Cash & interest securities:</b> under 30% of market value.</li><li><b>Receivables:</b> under 49% (some boards use 33%).</li></ul></div>
      <div class="card"><h3>Shariah ETFs to research</h3><p class="faint small">Examples to research — not recommendations.</p>${ETFS.map(([t, n]) => `<button class="bw-etf" data-etf="${escAttr(t.split(' ')[0])}"><b>${esc(t)}</b><span class="muted small">${esc(n)}</span></button>`).join('')}</div>
      <div class="card"><h3>Dividend purification</h3><p class="muted small">If a company has a small share of non-compliant income, give that share of your dividends to charity.</p>
        <div class="grid2"><div><label class="faint small">Dividends received</label><input class="input" id="pD" type="number" inputmode="decimal"></div><div><label class="faint small">Non-compliant income %</label><input class="input" id="pP" type="number" inputmode="decimal" step="0.1"></div></div>
        <div class="bw-pur">To purify: <b id="pR">—</b></div></div>`;
    bindTabs();
    const run = async v => { v = (v ?? $('#scQ').value).trim(); if (!v) return; $('#scQ').value = v; const out = $('#scOut'); out.innerHTML = loadingHTML('Screening…');
      try { const r = await api('/wealth/screen', { body: { ticker: v } }); const cls = r.verdict === 'Likely compliant' ? 'ok' : r.verdict === 'Doubtful' ? 'mid' : r.verdict === 'Unknown' ? 'unk' : 'bad';
        const pf = x => x === true ? `<span class="bw-ok">${I.check}</span>` : x === false ? `<span class="bw-bad">${I.x}</span>` : `<span class="faint">?</span>`;
        out.innerHTML = `<div class="card bw-res ${cls}"><div class="row between" style="align-items:flex-start;gap:8px"><div><b>${esc(r.name)}</b><div class="faint small">${esc(r.ticker || '')} ${r.type !== 'unknown' ? '· ' + esc(r.type.toUpperCase()) : ''}</div></div><span class="bw-verdict">${esc(r.verdict)}</span></div>
          <div class="bw-chk2">${pf(r.business.pass)}<div><b>Business activity</b><div class="muted small">${esc(r.business.note)}</div></div></div>
          ${r.ratios.map(x => `<div class="bw-chk2">${pf(x.pass)}<div class="grow row between"><span>${esc(x.name)}</span><b>${esc(x.value)}</b></div></div>`).join('')}
          ${r.nonCompliantRevenuePct ? `<div class="bw-chk2"><span class="faint">%</span><div class="grow row between"><span>Non-compliant income</span><b>${esc(r.nonCompliantRevenuePct)}</b></div></div>` : ''}
          ${r.reasons.length ? `<ul class="bw-ul">${r.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
          <div class="faint small">Figures approx. ${esc(r.dataAsOf || '')}${r.cached ? ' · checked recently' : ''}. Verify before investing.</div></div>`;
      } catch (e) { out.innerHTML = `<div class="empty"><p class="muted">${esc(e.message)}</p></div>`; } };
    $('#scGo').onclick = () => run(); $('#scQ').onkeydown = e => { if (e.key === 'Enter') run(); };
    $$('[data-etf]', p).forEach(b => b.onclick = () => { run(b.dataset.etf); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    const pur = () => { const d = +$('#pD').value, pc = +$('#pP').value; $('#pR').textContent = d && pc ? (d * pc / 100).toFixed(2) : '—'; }; $('#pD').oninput = $('#pP').oninput = pur;
  }
  render();
}

export const routes = [
  [/^\/barakah$/, () => viewBarakah(), 'barakah'],
  [/^\/wealth$/, (m, q) => viewWealth(q), 'wealth'],
];
