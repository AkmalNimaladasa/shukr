// Scholars: directory, fatwa library, consultations, scholar portal (application + inbox), developer review.
import { $, $$, esc, escAttr, I, api, state, toast, shell, go, sheet, md, onCleanup } from './core.js';
import { checkout } from './views-money.js';

const usd = n => '$' + (+n || 0).toFixed(2);
const tierLabel = t => t === 'mufti' ? 'Verified Mufti' : 'Verified Scholar';
const badge = s => `<span class="sc-badge ${s.tier}">${I.check} ${tierLabel(s.tier)}</span>`;
const avatar = n => `<span class="avatar sc-av">${esc((n || '?').replace(/^(Shaykh|Sheikh|Mufti|Dr\.?|Ustadh|Ustadha|Imam)\s+/i, '')[0] || '?')}</span>`;

// ---------- Member side: Scholars hub ----------
export async function viewScholars(q) {
  const tab = q?.get('tab') || 'fatwas';
  const p = shell('Ask a scholar'); p.classList.add('sc-page');
  p.innerHTML = `<div class="sc-hero"><h2>Guidance from verified scholars</h2><p>Every scholar here is checked: ID, certificates confirmed with their institution, two scholar references and an interview. Only verified muftis can publish fatwas.</p></div>
    <div class="seg" style="margin:12px 0">${[['fatwas', 'Fatwas'], ['scholars', 'Scholars'], ['mine', 'My consultations']].map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div id="scBody"><div class="loading"><span class="spin"></span></div></div>
    <a class="sc-cta" href="#/scholar">${I.cap || I.star} Are you a scholar? Apply to join</a>`;
  $$('[data-t]', p).forEach(b => b.onclick = () => go('/scholars?tab=' + b.dataset.t));
  const body = $('#scBody', p);
  if (tab === 'fatwas') {
    const draw = async term => { const r = await api('/fatwas' + (term ? '?q=' + encodeURIComponent(term) : '')); body.querySelector('#fl').innerHTML = r.fatwas.length ? r.fatwas.map(f => `<a class="sc-fatwa" href="#/fatwa/${f.id}"><b>${esc(f.question.slice(0, 140))}${f.question.length > 140 ? '…' : ''}</b><small>${esc(f.title ? f.title + ' ' : '')}${esc(f.full_name)}${f.madhhab ? ' · ' + esc(f.madhhab) : ''}${f.topic ? ' · ' + esc(f.topic) : ''}</small></a>`).join('') : `<div class="empty small">${term ? 'No fatwas match that search.' : 'No fatwas published yet. Verified muftis will publish here.'}</div>`; };
    body.innerHTML = `<input class="input" id="fq" type="search" placeholder="Search fatwas (e.g. zakat on gold)"><div id="fl" style="margin-top:10px"></div>`;
    let t; $('#fq', body).oninput = e => { clearTimeout(t); t = setTimeout(() => draw(e.target.value.trim()), 250); }; draw('');
  } else if (tab === 'scholars') {
    const { scholars } = await api('/scholars');
    body.innerHTML = scholars.length ? scholars.map(s => `<a class="sc-card" href="#/scholar/${s.userId}">${avatar(s.name)}<div class="grow"><b>${esc(s.title ? s.title + ' ' : '')}${esc(s.name)}</b>${badge(s)}
      <small>${esc([s.madhhab, (s.languages || []).join(', '), s.country].filter(Boolean).join(' · '))}</small><small class="sc-spec">${esc((s.specialties || []).slice(0, 3).join(' · '))}</small></div>
      <div class="sc-price"><b>${usd(s.rates.text)}</b><small>question</small>${s.rating ? `<small>★ ${s.rating}</small>` : ''}</div></a>`).join('') : `<div class="empty small">Verified scholars will appear here soon, in sha Allah.</div>`;
  } else {
    const { mine } = await api('/consultations');
    body.innerHTML = mine.length ? mine.map(c => `<a class="sc-cons" href="#/consult/${c.id}"><div class="row between"><b>${esc(c.scholar_name)}</b><span class="sc-st ${c.status}">${statusLabel(c.status)}</span></div><small>${esc(c.question.slice(0, 100))}</small><small class="faint">${c.kind === 'call' ? 'Video call' : 'Written answer'} · ${usd(c.price_usd)}</small></a>`).join('') : `<div class="empty small">You haven’t booked a consultation yet. Choose a scholar to ask a private question.</div>`;
  }
}
const statusLabel = s => ({ awaiting_payment: 'Awaiting payment', paid: 'Waiting for scholar', answered: 'Answered', scheduled: 'Call scheduled', completed: 'Completed', cancelled: 'Cancelled', refund_requested: 'Refund requested' })[s] || s;

export async function viewFatwa(id) {
  const p = shell('Fatwa', { back: '/scholars' });
  let f; try { f = (await api('/fatwas/' + id)).fatwa; } catch (e) { p.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const ev = f.evidence || [];
  p.innerHTML = `<article class="sc-fw"><div class="sc-fw-q"><span>Question</span><p>${esc(f.question)}</p></div>
    <div class="sc-fw-a"><span>Answer</span><div class="md">${md(f.answer)}</div></div>
    ${ev.length ? `<div class="sc-fw-ev"><span>Evidence & sources</span>${ev.map(e => `<div class="sc-ev"><b>${esc(e.ref)}</b>${e.text ? `<p>${esc(e.text)}</p>` : ''}</div>`).join('')}</div>` : ''}
    <a class="sc-by" href="#/scholar/${f.scholar_id}">${avatar(f.full_name)}<div><b>${esc(f.title ? f.title + ' ' : '')}${esc(f.full_name)}</b><small>${tierLabel(f.tier)}${f.madhhab ? ' · ' + esc(f.madhhab) + ' madhhab' : ''} · ${new Date(f.created_at).toLocaleDateString()}</small></div></a>
    <p class="faint small">Rulings can differ between madhhabs and circumstances. For your own situation, book a private consultation with a scholar.</p>
    <div class="row" style="gap:8px"><a class="btn accent grow" href="#/scholar/${f.scholar_id}">Ask this scholar</a><button class="btn ghost" id="rep">${I.flag} Report</button></div></article>`;
  $('#rep', p).onclick = () => sheet(`<h3>Report this fatwa</h3><textarea class="input" id="rr" rows="3" placeholder="What's wrong? (e.g. misquoted hadith)"></textarea><button class="btn accent block" style="margin-top:10px" id="rs">Send</button>`, (sh, close) => { $('#rs', sh).onclick = async () => { await api(`/fatwas/${id}/report`, { body: { reason: $('#rr', sh).value } }); close(); toast('Thank you — the team will review it.'); }; });
}

export async function viewScholarProfile(uid) {
  const p = shell('Scholar', { back: '/scholars?tab=scholars' });
  let d; try { d = await api('/scholars/' + uid); } catch (e) { p.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const s = d.scholar;
  p.innerHTML = `<div class="sc-prof">${avatar(s.name)}<h2>${esc(s.title ? s.title + ' ' : '')}${esc(s.name)}</h2>${badge(s)}
    <p class="muted small">${esc([s.madhhab && s.madhhab + ' madhhab', (s.languages || []).join(', '), s.country].filter(Boolean).join(' · '))}</p>
    ${s.bio ? `<p class="sc-bio">${esc(s.bio)}</p>` : ''}
    <div class="chips wrap" style="justify-content:center">${(s.specialties || []).map(x => `<span class="chip">${esc(x)}</span>`).join('')}</div></div>
    <div class="card"><h3>Credentials (verified)</h3>${(s.qualifications || []).map(qq => `<div class="sc-qual">${I.cap || I.check}<div><b>${esc(qq.title)}</b><small>${esc(qq.institution)}${qq.year ? ' · ' + esc(qq.year) : ''}</small></div></div>`).join('') || '<p class="muted small">Ijazah-based credentials verified by Shukr.</p>'}<p class="faint small">Verified ${new Date(s.verifiedAt).toLocaleDateString()}</p></div>
    ${s.accepting ? `<div class="card sc-book"><h3>Private consultation</h3>
      <div class="sc-opts"><button class="sc-opt on" data-k="text"><b>Written answer</b><span>${usd(s.rates.text)}</span><small>Usually within 72 hours</small></button>
      <button class="sc-opt" data-k="call"><b>Video call</b><span>${usd(s.rates.call)}</span><small>${s.rates.minutes} minutes</small></button></div>
      <label class="lbl">Your question (private)</label><textarea class="input" id="cq" rows="5" maxlength="4000" placeholder="Explain your situation. Only this scholar will see it."></textarea>
      <p class="faint small">You pay the scholar’s price. If they don’t reply within 72 hours you can cancel for a refund.</p>
      <button class="btn accent block" id="cb">Book & pay</button><p class="err"></p></div>` : `<div class="card"><p class="muted">This scholar isn’t taking consultations right now.</p></div>`}
    ${d.fatwas.length ? `<h3 style="margin:16px 0 8px">Fatwas</h3>${d.fatwas.map(f => `<a class="sc-fatwa" href="#/fatwa/${f.id}"><b>${esc(f.question.slice(0, 120))}</b><small>${esc(f.topic || '')}</small></a>`).join('')}` : ''}`;
  let kind = 'text'; $$('[data-k]', p).forEach(b => b.onclick = () => { kind = b.dataset.k; $$('[data-k]', p).forEach(x => x.classList.toggle('on', x === b)); });
  const cb = $('#cb', p); if (cb) cb.onclick = async () => { cb.disabled = true; try { const r = await api('/consultations', { body: { scholarId: s.userId, kind, question: $('#cq', p).value } }); if (r.checkout) checkout(r.checkout, () => go('/consult/' + r.id)); else go('/consult/' + r.id); } catch (e) { $('.err', p).textContent = e.message; } cb.disabled = false; };
}

export async function viewConsultation(id) {
  const p = shell('Consultation', { back: '/scholars?tab=mine' });
  const load = async () => {
    let d; try { d = await api('/consultations/' + id); } catch (e) { p.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const c = d.consultation, me = state.user.id, scholar = d.role === 'scholar';
    p.innerHTML = `<div class="card"><div class="row between"><b>${c.kind === 'call' ? 'Video call' : 'Written answer'} · ${usd(scholar ? c.scholar_usd : c.price_usd)}</b><span class="sc-st ${c.status}">${statusLabel(c.status)}</span></div>
      ${scholar ? `<small class="faint">Member paid ${usd(c.price_usd)} · you receive ${usd(c.scholar_usd)}</small>` : ''}
      ${c.scheduled_at ? `<p>Call: <b>${new Date(c.scheduled_at).toLocaleString()}</b> · <a href="${escAttr(c.call_link)}" target="_blank" rel="noopener">Join call</a></p>` : ''}</div>
      <div class="sc-thread"><div class="sc-msg them"><small>Question</small>${esc(c.question)}</div>${d.messages.map(m => `<div class="sc-msg ${m.sender === me ? 'me' : 'them'}">${esc(m.body)}<small>${new Date(m.created_at).toLocaleString()}</small></div>`).join('')}</div>
      ${['paid', 'scheduled', 'answered'].includes(c.status) ? `<form id="mf" class="sc-reply"><textarea class="input" rows="3" maxlength="6000" placeholder="${scholar ? 'Write your answer…' : 'Reply…'}"></textarea><button class="btn accent">Send</button></form>` : ''}
      ${c.status === 'awaiting_payment' && !scholar ? `<p class="muted small">Payment hasn’t completed yet.</p><button class="btn ghost block" id="cx">Cancel request</button>` : ''}
      ${scholar && c.kind === 'call' && c.status === 'paid' ? `<button class="btn ghost block" id="sch">Schedule the call</button>` : ''}
      ${!scholar && ['answered', 'scheduled'].includes(c.status) ? `<button class="btn ghost block" id="done">Mark complete & rate</button>` : ''}
      ${!scholar && c.status === 'paid' && Date.now() - new Date(c.created_at) > 72 * 3600e3 ? `<button class="btn ghost block" id="cx">No reply after 72 h — cancel & request refund</button>` : ''}`;
    const mf = $('#mf', p); if (mf) mf.onsubmit = async e => { e.preventDefault(); const v = $('textarea', mf).value.trim(); if (!v) return; try { await api(`/consultations/${id}/messages`, { body: { body: v } }); load(); } catch (er) { toast(er.message); } };
    $('#cx', p)?.addEventListener('click', async () => { try { await api(`/consultations/${id}/cancel`, { body: {} }); toast('Cancelled'); load(); } catch (e) { toast(e.message); } });
    $('#done', p)?.addEventListener('click', () => sheet(`<h3>How was it?</h3><div class="sc-stars">${[1, 2, 3, 4, 5].map(n => `<button data-r="${n}">★</button>`).join('')}</div><textarea class="input" id="rv" rows="3" placeholder="Optional review"></textarea>`, (sh, close) => $$('[data-r]', sh).forEach(b => b.onclick = async () => { await api(`/consultations/${id}/complete`, { body: { rating: +b.dataset.r, review: $('#rv', sh).value } }); close(); toast('Thank you'); load(); })));
    $('#sch', p)?.addEventListener('click', () => sheet(`<h3>Schedule the call</h3><label class="lbl">Date & time</label><input class="input" type="datetime-local" id="at"><label class="lbl">Meeting link</label><input class="input" id="lk" placeholder="https://meet.google.com/…"><button class="btn accent block" style="margin-top:10px" id="ok">Send to member</button><p class="err"></p>`, (sh, close) => { $('#ok', sh).onclick = async () => { try { await api(`/consultations/${id}/schedule`, { body: { at: $('#at', sh).value, link: $('#lk', sh).value } }); close(); load(); } catch (e) { $('.err', sh).textContent = e.message; } }; }));
  };
  load();
}

// ---------- Scholar portal (separate login + application + inbox + fatwa writing) ----------
export async function viewScholarPortal() {
  const p = shell('Scholar portal'); p.classList.add('sc-page');
  const d = await api('/scholar/me'); const s = d.scholar, o = d.options;
  if (!s) {
    p.innerHTML = `<div class="sc-hero"><h2>Join as a scholar</h2><p>Teach, answer questions and earn from private consultations. You set your own prices.</p></div>
      <div class="card"><h3>What we verify</h3><ul class="sc-req">
        <li><b>Identity</b> — government ID matching your certificates.</li>
        <li><b>Islamic qualification</b> — e.g. ‘Alimiyyah / Dars-e-Nizami, a degree in Shariah or Usul ad-Din, or an ijazah with a traceable sanad. We contact the issuing institution or shaykh directly.</li>
        <li><b>To publish fatwas (Mufti)</b> — formal ifta training (Takhassus fil-Ifta, Dar al-Ifta mufti programme or equivalent) or an ifta post at a recognised institution.</li>
        <li><b>Two references</b> from known scholars.</li><li><b>A short video interview</b> with our review team.</li><li>Verification is renewed every 12 months.</li></ul></div>
      <div class="card"><label class="lbl">Full name (as on your certificates)</label><input class="input" id="fn" value="${escAttr(state.user.name || '')}">
      <label class="lbl">I’m applying as</label><div class="seg" id="tr"><button data-v="teacher" class="on">Scholar / teacher</button><button data-v="mufti">Mufti (can issue fatwas)</button></div>
      <button class="btn accent block" style="margin-top:12px" id="ap">Start application</button><p class="err"></p></div>`;
    let tier = 'teacher'; $$('#tr button', p).forEach(b => b.onclick = () => { tier = b.dataset.v; $$('#tr button', p).forEach(x => x.classList.toggle('on', x === b)); });
    $('#ap', p).onclick = async () => { try { await api('/scholar/apply', { body: { fullName: $('#fn', p).value, tier } }); viewScholarPortal(); } catch (e) { $('.err', p).textContent = e.message; } };
    return;
  }
  const ver = s.verified;
  const stat = { draft: ['Draft', 'Complete your application and submit it for review.'], submitted: ['Under review', 'We’re confirming your credentials with your institutions and references. This usually takes 5–10 working days.'], interview: ['Interview', s.interview_at ? `Your video interview: ${new Date(s.interview_at).toLocaleString()}` : 'We’ll email you to schedule a short video interview.'], verified: ['Verified', `Verified as ${tierLabel(s.tier)} until ${new Date(s.expires_at).toLocaleDateString()}.`], rejected: ['Not approved', s.review_notes || 'Contact support for details.'], suspended: ['Suspended', 'Contact support.'] }[s.status] || ['', ''];
  p.innerHTML = `<div class="sc-status ${s.status}"><b>${stat[0]}</b><p>${esc(stat[1])}</p></div>
    ${ver ? `<div class="sc-kpis"><div><b>${usd(d.earnings.earned)}</b><small>earned</small></div><div><b>${d.earnings.open}</b><small>waiting</small></div><div><b>${d.scholar.accepting ? 'On' : 'Off'}</b><small>accepting</small></div></div>
      <div class="row" style="gap:8px;margin:10px 0"><a class="btn accent grow" href="#/scholar/inbox">Consultations</a>${s.tier === 'mufti' ? `<button class="btn ghost grow" id="nf">Write a fatwa</button>` : ''}<a class="btn ghost grow" href="#/creator">Payouts</a></div>` : ''}
    <div class="card"><h3>Profile</h3>
      <label class="lbl">Title</label><input class="input" id="ti" placeholder="Shaykh, Mufti, Dr., Ustadha…" value="${escAttr(s.title || '')}">
      <label class="lbl">Madhhab</label><select class="input" id="mh"><option value="">Choose…</option>${o.MADHHABS.map(m => `<option ${s.madhhab === m ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
      <label class="lbl">Specialties</label><div class="chips wrap" id="sp">${o.SPECIALTIES.map(x => `<button class="chip ${(s.specialties || []).includes(x) ? 'on' : ''}" data-s="${escAttr(x)}">${esc(x)}</button>`).join('')}</div>
      <label class="lbl">Languages</label><input class="input" id="lg" placeholder="Arabic, English, Urdu" value="${escAttr((s.languages || []).join(', '))}">
      <label class="lbl">Country</label><input class="input" id="co" value="${escAttr(s.country || '')}">
      <label class="lbl">About you</label><textarea class="input" id="bi" rows="4" maxlength="1200">${esc(s.bio || '')}</textarea>
      <div class="grid2"><div><label class="lbl">Written answer price ($)</label><input class="input" type="number" id="rt" min="5" max="500" value="${+s.rate_text_usd}"></div><div><label class="lbl">Video call price ($)</label><input class="input" type="number" id="rc" min="10" max="1000" value="${+s.rate_call_usd}"></div></div>
      <p class="faint small" id="net"></p>
      <label class="tt-privacy"><span>Accepting new consultations</span><span class="toggle"><input type="checkbox" id="ac" ${s.accepting ? 'checked' : ''}><span></span></span></label>
      <button class="btn accent block" id="sv">Save profile</button></div>
    ${ver ? '' : `<div class="card"><h3>Qualifications</h3><div id="ql"></div><button class="btn ghost sm" id="qa">+ Add qualification</button>
      <h3 style="margin-top:16px">Ijazat (with sanad)</h3><div id="il"></div><button class="btn ghost sm" id="ia">+ Add ijazah</button>
      ${s.tier_requested === 'mufti' ? `<h3 style="margin-top:16px">Ifta training</h3><input class="input" id="ip" placeholder="Programme (e.g. Takhassus fil-Ifta)" value="${escAttr(s.ifta?.programme || '')}"><input class="input" id="ii" placeholder="Institution" value="${escAttr(s.ifta?.institution || '')}" style="margin-top:6px"><input class="input" id="is" placeholder="Supervising mufti" value="${escAttr(s.ifta?.supervisor || '')}" style="margin-top:6px"><input class="input" id="iy" placeholder="Year" value="${escAttr(s.ifta?.year || '')}" style="margin-top:6px"><input class="input" id="io" placeholder="Current/previous ifta post (optional)" value="${escAttr(s.ifta?.post || '')}" style="margin-top:6px">` : ''}
      <h3 style="margin-top:16px">References (2)</h3><div id="rl"></div>
      <button class="btn accent block" style="margin-top:12px" id="sc">Save credentials</button></div>
    <div class="card"><h3>Documents</h3><p class="muted small">Private — only Shukr’s review team can see them. PDF or photo, max 8 MB.</p><div id="dl">${d.docs.map(x => `<div class="row between sc-doc"><span>${esc(x.kind.toUpperCase())} · ${esc(x.name)}</span><button class="iconbtn sm" data-del="${x.id}">${I.x}</button></div>`).join('') || '<p class="faint small">No documents yet.</p>'}</div>
      <div class="row wrap" style="gap:6px;margin-top:8px">${[['id', 'Government ID'], ['degree', 'Degree / ‘Alimiyyah'], ['ijazah', 'Ijazah'], ...(s.tier_requested === 'mufti' ? [['ifta', 'Ifta certificate']] : []), ['transcript', 'Transcript'], ['other', 'Other']].map(([k, l]) => `<label class="btn ghost sm">${l}<input type="file" hidden accept="application/pdf,image/*" data-up="${k}"></label>`).join('')}</div></div>
    ${['draft', 'rejected'].includes(s.status) ? `<button class="btn accent block" id="sub">Submit for verification</button><p class="err" id="suberr"></p>` : ''}`}`;
  // dynamic lists
  const quals = [...(s.qualifications || [])], ijz = [...(s.ijazat || [])], refs = [...(s.references || [])]; while (refs.length < 2) refs.push({});
  const listUI = (el, arr, fields) => { if (!el) return; el.innerHTML = arr.map((x, i) => `<div class="sc-row">${fields.map(([f, ph]) => `<input class="input" data-i="${i}" data-f="${f}" placeholder="${escAttr(ph)}" value="${escAttr(x[f] || '')}">`).join('')}${el.id === 'rl' ? '' : `<button class="iconbtn sm" data-rm="${i}">${I.x}</button>`}</div>`).join('');
    $$('[data-f]', el).forEach(inp => inp.oninput = () => arr[+inp.dataset.i][inp.dataset.f] = inp.value); $$('[data-rm]', el).forEach(b => b.onclick = () => { arr.splice(+b.dataset.rm, 1); listUI(el, arr, fields); }); };
  const QF = [['title', 'Qualification (e.g. ‘Alimiyyah, BA Shariah)'], ['institution', 'Institution'], ['year', 'Year'], ['registrar', 'Registrar email/phone for verification']];
  const IF = [['subject', 'Subject (e.g. Hafs ‘an ‘Asim, Sahih al-Bukhari)'], ['shaykh', 'Granted by (shaykh)'], ['sanad', 'Sanad summary'], ['year', 'Year']];
  const RF = [['name', 'Name'], ['role', 'Role (e.g. Imam, lecturer)'], ['institution', 'Institution'], ['contact', 'Email or phone']];
  listUI($('#ql', p), quals, QF); listUI($('#il', p), ijz, IF); listUI($('#rl', p), refs, RF);
  $('#qa', p)?.addEventListener('click', () => { quals.push({}); listUI($('#ql', p), quals, QF); }); $('#ia', p)?.addEventListener('click', () => { ijz.push({}); listUI($('#il', p), ijz, IF); });
  $$('[data-s]', p).forEach(b => b.onclick = () => b.classList.toggle('on'));
  const net = () => { const k = d.netRate || 0.8; $('#net', p).textContent = `You receive ${usd(+$('#rt', p).value * k)} per written answer and ${usd(+$('#rc', p).value * k)} per call.`; }; $('#rt', p).oninput = net; $('#rc', p).oninput = net; net();
  $('#sv', p).onclick = async () => { try { await api('/scholar/me', { method: 'PUT', body: { title: $('#ti', p).value, madhhab: $('#mh', p).value, specialties: $$('[data-s].on', p).map(b => b.dataset.s), languages: $('#lg', p).value.split(',').map(x => x.trim()).filter(Boolean), country: $('#co', p).value, bio: $('#bi', p).value, rate_text_usd: +$('#rt', p).value, rate_call_usd: +$('#rc', p).value, accepting: $('#ac', p).checked } }); toast('Saved'); } catch (e) { toast(e.message); } };
  $('#sc', p)?.addEventListener('click', async () => { try { await api('/scholar/me', { method: 'PUT', body: { qualifications: quals, ijazat: ijz, references: refs, ...(s.tier_requested === 'mufti' ? { ifta: { programme: $('#ip', p).value, institution: $('#ii', p).value, supervisor: $('#is', p).value, year: $('#iy', p).value, post: $('#io', p).value } } : {}) } }); toast('Saved'); } catch (e) { toast(e.message); } });
  $$('[data-up]', p).forEach(inp => inp.onchange = async () => { const f = inp.files[0]; if (!f) return; if (f.size > 8e6) return toast('Max 8 MB'); try { const r = await fetch(`/api/scholar/docs?kind=${inp.dataset.up}&name=${encodeURIComponent(f.name)}`, { method: 'POST', headers: { 'Content-Type': f.type || 'application/octet-stream' }, body: f, credentials: 'same-origin' }); const j = await r.json(); if (!r.ok) throw new Error(j.error); toast('Uploaded'); viewScholarPortal(); } catch (e) { toast(e.message); } });
  $$('[data-del]', p).forEach(b => b.onclick = async () => { await api('/scholar/docs/' + b.dataset.del, { method: 'DELETE' }); viewScholarPortal(); });
  $('#sub', p)?.addEventListener('click', async () => { try { $('#sc', p)?.click(); await new Promise(r => setTimeout(r, 400)); await api('/scholar/submit', { body: {} }); toast('Submitted for review'); viewScholarPortal(); } catch (e) { $('#suberr', p).textContent = e.message; } });
  $('#nf', p)?.addEventListener('click', () => fatwaEditor(s));
}
function fatwaEditor(s) {
  const ev = [{ type: 'quran', ref: '', text: '' }];
  sheet(`<h3>Publish a fatwa</h3><label class="lbl">Question</label><textarea class="input" id="fq" rows="3" maxlength="2000"></textarea>
    <label class="lbl">Answer</label><textarea class="input" id="fa" rows="8" maxlength="12000" placeholder="Give the ruling, reasoning, and any differences of opinion."></textarea>
    <label class="lbl">Topic</label><input class="input" id="ft" placeholder="e.g. Zakat, Marriage, Prayer">
    <label class="lbl">Evidence (required)</label><div id="fe"></div><button class="btn ghost sm" id="fea">+ Add source</button>
    <p class="faint small">Include the reference (e.g. Quran 2:275, Sahih Muslim 1598 — sahih) and any scholarly sources.</p>
    <button class="btn accent block" id="fp">Publish</button><p class="err"></p>`, (sh, close) => {
    const draw = () => { $('#fe', sh).innerHTML = ev.map((e, i) => `<div class="sc-row"><select class="input" data-i="${i}" data-f="type">${['quran', 'hadith', 'scholar', 'other'].map(t => `<option ${e.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select><input class="input" data-i="${i}" data-f="ref" placeholder="Reference" value="${escAttr(e.ref)}"><input class="input" data-i="${i}" data-f="text" placeholder="Quote / note (optional)" value="${escAttr(e.text)}"></div>`).join(''); $$('[data-f]', sh).forEach(x => x.oninput = x.onchange = () => ev[+x.dataset.i][x.dataset.f] = x.value); };
    draw(); $('#fea', sh).onclick = () => { ev.push({ type: 'hadith', ref: '', text: '' }); draw(); };
    $('#fp', sh).onclick = async () => { try { const r = await api('/fatwas', { body: { question: $('#fq', sh).value, answer: $('#fa', sh).value, topic: $('#ft', sh).value, evidence: ev, madhhab: s.madhhab } }); close(); toast('Fatwa published'); go('/fatwa/' + r.id); } catch (e) { $('.err', sh).textContent = e.message; } };
  });
}
export async function viewScholarInbox() {
  const p = shell('Consultations', { back: '/scholar' });
  const { inbox } = await api('/consultations');
  p.innerHTML = inbox.length ? inbox.map(c => `<a class="sc-cons" href="#/consult/${c.id}"><div class="row between"><b>${esc(c.member_name || 'Member')}</b><span class="sc-st ${c.status}">${statusLabel(c.status)}</span></div><small>${esc(c.question.slice(0, 120))}</small><small class="faint">${c.kind === 'call' ? 'Video call' : 'Written'} · you receive ${usd(c.scholar_usd)}</small></a>`).join('') : `<div class="empty small">No consultations yet. Complete your profile so members can find you.</div>`;
}

// Separate scholar sign-up screen (no member account needed first).
export function scholarSignupHTML() {
  return `<form id="scForm" class="auth-form"><h2>Scholar sign-up</h2><p class="muted small">For imams, muftis and teachers. You’ll verify your credentials next.</p>
    <input class="input" name="fullName" placeholder="Full name (as on your certificates)" required><input class="input" name="email" type="email" placeholder="Email" required autocomplete="email">
    <input class="input" name="password" type="password" placeholder="Password (10+ characters)" minlength="10" required autocomplete="new-password">
    <div class="seg" id="sct"><button type="button" data-v="teacher" class="on">Scholar / teacher</button><button type="button" data-v="mufti">Mufti</button></div>
    <button class="btn accent block">Create scholar account</button><p class="err"></p></form>`;
}

// ---------- Developer review queue ----------
export async function viewScholarReview() {
  const p = shell('Scholar verification', { back: '/admin' });
  const { scholars } = await api('/admin/scholars');
  const checks = [['idMatches', 'ID matches the name on the certificates'], ['institutionConfirmed', 'Institution / shaykh confirmed the qualification directly'], ['referencesContacted', 'Both references contacted and confirmed'], ['interviewPassed', 'Video interview passed'], ['iftaConfirmed', 'Ifta training / post confirmed (muftis only)']];
  p.innerHTML = scholars.length ? scholars.map(s => `<details class="card sc-rev" ${s.status === 'submitted' ? 'open' : ''}><summary><b>${esc(s.full_name)}</b> <span class="sc-st ${s.status}">${s.status}</span> <small class="faint">${esc(s.email)} · wants ${s.tier_requested}</small></summary>
    <p class="small"><b>Madhhab:</b> ${esc(s.madhhab || '—')} · <b>Country:</b> ${esc(s.country || '—')}</p>
    <p class="small"><b>Qualifications:</b><br>${(s.qualifications || []).map(q => `• ${esc(q.title)} — ${esc(q.institution)} (${esc(q.year)}) · verify via: ${esc(q.registrar)}`).join('<br>') || '—'}</p>
    <p class="small"><b>Ijazat:</b><br>${(s.ijazat || []).map(q => `• ${esc(q.subject)} from ${esc(q.shaykh)} (${esc(q.year)}) — sanad: ${esc(q.sanad)}`).join('<br>') || '—'}</p>
    ${s.tier_requested === 'mufti' ? `<p class="small"><b>Ifta:</b> ${esc(Object.values(s.ifta || {}).filter(Boolean).join(' · ') || '—')}</p>` : ''}
    <p class="small"><b>References:</b><br>${(s.references_ || []).map(r => `• ${esc(r.name)}, ${esc(r.role)} at ${esc(r.institution)} — ${esc(r.contact)}`).join('<br>') || '—'}</p>
    <p class="small"><b>Documents:</b> ${(s.docs || []).map(d => `<a href="/api/admin/scholar-docs/${d.id}" target="_blank" rel="noopener">${esc(d.kind)}: ${esc(d.name)}</a>`).join(' · ') || 'none'}</p>
    <div class="sc-checks">${checks.filter(([k]) => k !== 'iftaConfirmed' || s.tier_requested === 'mufti').map(([k, l]) => `<label><input type="checkbox" data-c="${k}"> ${l}</label>`).join('')}</div>
    <textarea class="input" rows="2" data-n placeholder="Review notes (shown to the applicant if rejected)">${esc(s.review_notes || '')}</textarea>
    <div class="row wrap" style="gap:6px;margin-top:8px"><button class="btn ghost sm" data-a="interview">Invite to interview</button><button class="btn accent sm" data-a="verify" data-tier="teacher">Verify as scholar</button>${s.tier_requested === 'mufti' ? `<button class="btn accent sm" data-a="verify" data-tier="mufti">Verify as mufti</button>` : ''}<button class="btn ghost sm" data-a="reject">Reject</button>${s.status === 'verified' ? `<button class="btn ghost sm" data-a="suspend">Suspend</button>` : ''}</div>
    <input type="hidden" data-uid="${s.user_id}"></details>`).join('') : '<div class="empty">No scholar applications yet.</div>';
  $$('.sc-rev', p).forEach(card => $$('[data-a]', card).forEach(b => b.onclick = async () => {
    const uid = $('[data-uid]', card).dataset.uid, c = {}; $$('[data-c]', card).forEach(x => c[x.dataset.c] = x.checked);
    let at = null; if (b.dataset.a === 'interview') { at = prompt('Interview date & time (YYYY-MM-DD HH:MM)'); if (!at) return; }
    try { await api('/admin/scholars/' + uid, { body: { action: b.dataset.a, tier: b.dataset.tier, checks: c, notes: $('[data-n]', card).value, at } }); toast('Saved'); viewScholarReview(); } catch (e) { toast(e.message); }
  }));
}
