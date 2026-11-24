// Alim chat (streaming, web search, tools, attachments, mic STT, full voice mode, edit/regenerate/copy/read-aloud), Memory
import { hasMemoryPlan, $, escAttr, $$, esc, LS, I, api, state, toast, vibrate, shell, bindGo, go, sheet, confirmSheet, md, loadChatList, onCleanup, recordAudio, transcribe, duckNasheed, empty, loadingHTML } from './core.js';

const MODES = [['coach', 'Coach', 'sparkle', 'Notices your patterns and helps you grow'], ['teach', 'Teach me', 'cap', 'Step-by-step Islamic learning'], ['reflect', 'Reflect', 'moon', 'Muhasabah — one question at a time'],
  ['fiqh', 'Fatwa research', 'scale', 'Finds published fatwas — never its own'], ['istikhara', 'Decision', 'compass', 'Think a decision through Islamically']];
const STARTERS = [['sparkle', 'What patterns do you see in my gratitude lately?', 'coach'], ['cap', 'Teach me something new about the Prophet ﷺ', 'teach'], ['scale', 'Is it permissible to pray in a moving vehicle?', 'fiqh'],
  ['heart', 'I’m feeling anxious today — help me', 'coach'], ['globe', 'What’s the latest news affecting Muslims today?', 'coach'], ['moon', 'Guide me through tonight’s muhasabah', 'reflect']];
const TOOL_LABEL = { web_search: 'Searching the web', save_memory: 'Saved to memory', search_memory: 'Searching your history', forget_memory: 'Forgetting', quran_lookup: 'Looking up the Quran', hadith_search: 'Searching hadith', app_data: 'Checking your Shukr data', open_page: 'Finding the right page', add_blessing: 'Added to Blessings', get_stats: 'Checking your progress' };

let ctl = null; // AbortController for current stream
export async function viewChat(id) {
  const isNew = !id || id === 'new';
  const p = shell(isNew ? 'Alim' : '…', { flush: true, right: `<button class="iconbtn" id="cMenu" aria-label="Chat options">${I.more}</button>` });
  let convId = isNew ? null : +id, mode = sessionStorage.getItem('shukr.askMode') || LS.get('alimMode', 'coach'), msgs = [], streaming = false, atts = [], deep = !!state.user.settings.alimDeep, webOn = true;
  p.innerHTML = `<div class="chat"><div class="chat-scroll" id="cs"></div><div class="composer-wrap"><div class="composer">
    <div class="att-row" id="attRow"></div><div id="recRow"></div>
    <textarea id="ci" rows="1" placeholder="Message Alim…" aria-label="Message"></textarea>
    <div class="bar"><button class="cbtn" id="cAtt" aria-label="Attach">${I.clip}</button><button class="mode" id="cMode"></button><button class="cbtn ${deep ? 'on' : ''}" id="cDeep" aria-label="Deep thinking" title="Deep, thorough answers">${I.brain}</button>
      <button class="cbtn" id="cMic" aria-label="Dictate">${I.mic}</button><button class="send voice" id="cSend" aria-label="Voice mode">${I.wave}</button></div></div></div>
    <input type="file" id="fileIn" accept="image/*,application/pdf,.txt,.md,.csv,.json" multiple hidden></div>`;
  const cs = $('#cs'), ci = $('#ci'), send = $('#cSend');
  const modeBtn = () => { const m = MODES.find(x => x[0] === mode) || MODES[0]; $('#cMode').innerHTML = `${I[m[2]]}${m[1]}`; };
  modeBtn();
  const scrollEnd = (smooth) => { const m = $('#main'); m.scrollTo({ top: m.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); };
  const updSend = () => { const has = ci.value.trim() || atts.length; send.classList.toggle('voice', !has && !streaming); send.innerHTML = streaming ? I.stop : has ? I.send : I.wave; send.setAttribute('aria-label', streaming ? 'Stop' : has ? 'Send' : 'Voice mode'); };
  ci.addEventListener('input', () => { ci.style.height = 'auto'; ci.style.height = Math.min(180, ci.scrollHeight) + 'px'; updSend(); });
  ci.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer:fine)').matches) { e.preventDefault(); doSend(); } });

  function msgHTML(m, i) {
    if (m.role === 'user') return `<div class="msg user" data-i="${i}">${m.meta?.attachments?.length ? `<div class="att">${m.meta.attachments.map(a => a.preview ? `<img src="${a.preview}" alt="">` : `<span class="att-chip">${I.clip}<span class="nm">${esc(a.name || 'file')}</span></span>`).join('')}</div>` : ''}<div class="bubble">${esc(m.content)}</div>
      <div class="uact">${m.id ? `<button data-edit="${i}" aria-label="Edit">${I.edit}</button>` : ''}<button data-copy="${i}" aria-label="Copy">${I.copy}</button></div></div>`;
    const tools = (m.meta?.tools || []).map(t => `<span class="toolpill">${t.name === 'web_search' ? I.globe : t.name.includes('memory') ? I.layers : t.name === 'quran_lookup' ? I.quran : t.name === 'hadith_search' ? I.scroll : I.sparkle}${esc(TOOL_LABEL[t.name] || t.name)}${t.args?.query ? ': ' + esc(String(t.args.query).slice(0, 40)) : t.args?.ref ? ' ' + esc(t.args.ref) : ''}</span>`).join('');
    const src = (m.meta?.sources || []).map(s => { let h = ''; try { h = new URL(s.url).hostname.replace('www.', ''); } catch {} return `<a class="source" href="${escAttr(s.url)}" target="_blank" rel="noopener"><img src="https://www.google.com/s2/favicons?domain=${esc(h)}&sz=32" alt="">${esc(s.title || h)}</a>`; }).join('');
    return `<div class="msg assistant" data-i="${i}">${tools ? `<div>${tools}</div>` : ''}<div class="md">${m.content ? md(m.content) : (m.pending ? `<span class="thinking"><span class="star-spin">${I.khatam}</span>${esc(m.status || 'Thinking…')}</span>` : '')}</div>
      ${(m.meta?.buttons || []).length ? `<div class="al-btns">${m.meta.buttons.map(b => `<a class="al-go" href="#${escAttr(b.path)}">${esc(b.label)} ›</a>`).join('')}</div>` : ''}      ${src ? `<div class="sources">${src}</div>` : ''}${m.error ? `<div class="small" style="color:var(--danger);margin-top:6px;font-family:var(--sans)">${esc(m.error)}</div>` : ''}
      ${!m.pending ? `<div class="msg-actions"><button data-copy="${i}" aria-label="Copy">${I.copy}</button><button data-speak="${i}" aria-label="Read aloud">${I.speaker}</button>${i === msgs.length - 1 ? `<button data-regen="${i}" aria-label="Regenerate">${I.retry}</button>` : ''}<button data-share="${i}" aria-label="Share">${I.share}</button></div>` : ''}</div>`;
  }
  function render() {
    if (!msgs.length) {
      const name = (state.user.name || '').split(' ')[0];
      cs.innerHTML = `<div class="chat-empty"><span class="logo">${I.khatam}</span><h2>${name ? 'How can I help, ' + esc(name) + '?' : 'How can I help you today?'}</h2>
        <div class="starters">${STARTERS.map(([ic, t, m]) => `<button class="starter" data-s="${escAttr(t)}" data-m="${m}">${I[ic]}<span>${esc(t)}</span></button>`).join('')}</div>
        <div class="faint small" style="margin-top:16px;max-width:420px">${hasMemoryPlan() ? 'Alim remembers your journey, searches the web, and cites the Quran, Sunnah and published fatwas.' : 'Alim searches the web and cites the Quran, Sunnah and published fatwas. Each chat starts fresh — <a href="#/premium">unlock memory</a> to have Alim remember you.'} It does not issue its own fatwas.</div></div>`;
      $$('[data-s]', cs).forEach(b => b.onclick = () => { mode = b.dataset.m; modeBtn(); ci.value = b.dataset.s; updSend(); doSend(); });
      return;
    }
    cs.innerHTML = msgs.map(msgHTML).join('');
    bindMsgActions();
  }
  function renderLast() { const i = msgs.length - 1; const el = cs.querySelector(`.msg[data-i="${i}"]`); if (!el) return render(); el.outerHTML = msgHTML(msgs[i], i); bindMsgActions(); }
  let speakAudio = null; onCleanup(() => { speakAudio?.pause(); ctl?.abort(); });
  function bindMsgActions() {
    $$('[data-copy]', cs).forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(msgs[+b.dataset.copy].content); toast('Copied'); } catch { toast('Copy failed'); } });
    $$('[data-share]', cs).forEach(b => b.onclick = async () => { const t = msgs[+b.dataset.share].content + '\n\n— Alim, Shukr app'; try { if (navigator.share) await navigator.share({ text: t }); else { await navigator.clipboard.writeText(t); toast('Copied'); } } catch {} });
    $$('[data-regen]', cs).forEach(b => b.onclick = () => doSend({ regenerate: true }));
    $$('[data-edit]', cs).forEach(b => b.onclick = () => { const i = +b.dataset.edit, m = msgs[i]; ci.value = m.content; ci.dispatchEvent(new Event('input')); ci.focus(); ci.dataset.editFrom = m.id; ci.dataset.editIdx = i; toast('Editing — send to replace from here'); });
    $$('[data-speak]', cs).forEach(b => b.onclick = async () => {
      if (speakAudio && !speakAudio.paused) { speakAudio.pause(); b.innerHTML = I.speaker; return; }
      b.innerHTML = '<span class="spin"></span>';
      try { const r = await fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: msgs[+b.dataset.speak].content, voice: state.user.settings.alimVoice || 'onyx' }) }); if (!r.ok) throw new Error('Speech unavailable');
        speakAudio = new Audio(URL.createObjectURL(await r.blob())); duckNasheed(true); await speakAudio.play(); b.innerHTML = I.pause; speakAudio.onended = () => { b.innerHTML = I.speaker; duckNasheed(false); }; } catch (e) { toast(e.message); b.innerHTML = I.speaker; }
    });
  }
  async function stream(body, onDelta) {
    ctl = new AbortController();
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal, credentials: 'same-origin' });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Alim is unavailable (' + r.status + ')'); }
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
    while (true) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let k;
      while ((k = buf.indexOf('\n\n')) >= 0) { const line = buf.slice(0, k).trim(); buf = buf.slice(k + 2); if (line.startsWith('data:')) { try { onDelta(JSON.parse(line.slice(5))); } catch {} } } }
  }
  async function doSend(o = {}) {
    if (streaming) { ctl?.abort(); return; }
    const text = ci.value.trim();
    if (!o.regenerate && !text && !atts.length) return openVoice();
    if (!state.ai) return toast('Alim is not configured on the server');
    const editFromId = ci.dataset.editFrom ? +ci.dataset.editFrom : null;
    if (editFromId) { msgs = msgs.slice(0, +ci.dataset.editIdx); delete ci.dataset.editFrom; delete ci.dataset.editIdx; }
    if (o.regenerate) { if (msgs.at(-1)?.role === 'assistant') msgs.pop(); }
    else msgs.push({ role: 'user', content: text || '(attachment)', meta: atts.length ? { attachments: atts.map(a => ({ name: a.name, preview: a.type.startsWith('image/') ? a.data : null })) } : null });
    const sendAtts = atts.map(a => ({ type: a.type, name: a.name, data: a.data, text: a.text })); atts = []; drawAtts();
    ci.value = ''; ci.style.height = 'auto';
    const am = { role: 'assistant', content: '', pending: true, status: 'Thinking…', meta: { tools: [], sources: [] } }; msgs.push(am);
    streaming = true; updSend(); render(); scrollEnd(true);
    let raf = null; const paint = () => { raf = null; renderLast(); const m = $('#main'); if (m.scrollHeight - m.scrollTop - m.clientHeight < 220) scrollEnd(); };
    try {
      await stream({ conversationId: convId, message: text, mode, attachments: sendAtts, deep, regenerate: !!o.regenerate, editFromId, web: webOn, voice: !!o.voice }, ev => {
        if (ev.type === 'meta' && ev.memory === false && !sessionStorage.getItem('shukr.memNudge')) { sessionStorage.setItem('shukr.memNudge', '1'); setTimeout(() => toast('Free plan: Alim doesn’t remember chats. Unlock memory in Premium.'), 1500); }
        if (ev.type === 'meta') { const wasNew = !convId; convId = ev.conversationId; if (wasNew) history.replaceState(null, '', '#/chat/' + convId); }
        else if (ev.type === 'delta') { am.content += ev.text; am.status = null; o.onDelta && o.onDelta(ev.text); }
        else if (ev.type === 'tool') { am.meta.tools.push({ name: ev.name, args: ev.args }); am.status = (TOOL_LABEL[ev.name] || ev.name) + '…'; o.onTool && o.onTool(ev.name); }
        else if (ev.type === 'sources') am.meta.sources = ev.sources;
        else if (ev.type === 'button') (am.meta.buttons ||= []).push({ path: ev.path, label: ev.label });
        else if (ev.type === 'crisis') showCrisisCard(ev);
        else if (ev.type === 'title') { $('#topbar .title').textContent = ev.title; loadChatList(); }
        else if (ev.type === 'error') am.error = ev.error;
        else if (ev.type === 'done') { am.id = ev.messageId; }
        if (!raf) raf = requestAnimationFrame(paint);
      });
    } catch (e) { if (e.name !== 'AbortError') am.error = e.message; else am.error = am.content ? null : 'Stopped'; }
    am.pending = false; streaming = false; updSend(); cancelAnimationFrame(raf); render(); loadChatList();
    if (!$('#topbar .title').textContent.trim() || $('#topbar .title').textContent === 'Alim') { /* title arrives via event */ }
    if (o.voice) return am;
    // reload ids for edit support
    if (convId) api('/conversations/' + convId).then(r => { r.messages.forEach((m, i) => { if (msgs[i] && msgs[i].role === m.role) msgs[i].id = m.id; }); }).catch(() => {});
  }
  send.onclick = () => doSend();
  // ---- mode / deep ----
  $('#cMode').onclick = () => sheet(`<h3>How should Alim help?</h3>${MODES.map(([k, l, ic, d]) => `<button class="opt ${k === mode ? 'on' : ''}" data-k="${k}"><span class="e">${I[ic]}</span><div><div>${l}</div><div class="d">${d}</div></div></button>`).join('')}`, (sh, close) => $$('[data-k]', sh).forEach(b => b.onclick = () => { mode = b.dataset.k; LS.set('alimMode', mode); modeBtn(); close(); }));
  $('#cDeep').onclick = () => { if (!Object.keys(state.user?.plans || {}).some(k => /memory|mentor/.test(k))) { toast('Deep thinking is a Premium feature'); go('/premium'); return; } deep = !deep; $('#cDeep').classList.toggle('on', deep); toast(deep ? 'Deep thinking on — longer, thorough answers' : 'Deep thinking off'); };
  // ---- attachments ----
  function drawAtts() { $('#attRow').innerHTML = atts.map((a, i) => `<span class="att-chip">${a.type.startsWith('image/') ? `<img src="${a.data}" alt="">` : I.clip}<span class="nm">${esc(a.name)}</span><button class="x" data-rm="${i}" aria-label="Remove">×</button></span>`).join(''); $$('[data-rm]', $('#attRow')).forEach(b => b.onclick = () => { atts.splice(+b.dataset.rm, 1); drawAtts(); updSend(); }); updSend(); }
  $('#cAtt').onclick = () => $('#fileIn').click();
  $('#fileIn').onchange = async e => {
    for (const f of [...e.target.files].slice(0, 4 - atts.length)) {
      if (f.size > 12e6) { toast(f.name + ' is too large (max 12 MB)'); continue; }
      if (f.type.startsWith('image/')) atts.push({ type: f.type, name: f.name, data: await shrinkImage(f) });
      else if (f.type === 'application/pdf') atts.push({ type: f.type, name: f.name, data: await readURL(f) });
      else atts.push({ type: f.type || 'text/plain', name: f.name, text: await f.text() });
    }
    e.target.value = ''; drawAtts();
  };
  // ---- mic (speech to text) ----
  let rec = null; onCleanup(() => rec?.cancel());
  $('#cMic').onclick = async () => {
    const b = $('#cMic');
    if (rec) { b.innerHTML = '<span class="spin"></span>'; $('#recRow').innerHTML = ''; try { const blob = await rec.stop(); rec = null; const t = await transcribe(blob); ci.value = (ci.value ? ci.value.trimEnd() + ' ' : '') + t; ci.dispatchEvent(new Event('input')); ci.focus(); } catch (e) { toast(e.message); rec = null; } b.innerHTML = I.mic; b.classList.remove('on'); return; }
    try { rec = await recordAudio(); b.classList.add('on'); b.innerHTML = I.stop; vibrate(12); const t0 = Date.now(); $('#recRow').innerHTML = '<div class="recbar"><span class="recdot"></span><span id="recT">Listening… 0:00</span><span class="faint" style="margin-left:auto">tap ■ to finish</span></div>';
      const h = setInterval(() => { const el = $('#recT'); if (!el || !rec) return clearInterval(h); const s = Math.floor((Date.now() - t0) / 1000); el.textContent = `Listening… ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }, 500); }
    catch (e) { toast(e.message || 'Microphone permission denied'); }
  };
  // ---- voice mode ----
  function openVoice() {
    if (!state.ai) return toast('Alim is not configured');
    const ov = document.createElement('div'); ov.className = 'voice-overlay';
    ov.innerHTML = `<div class="row between" style="width:100%"><span class="faint small">Voice mode · ${esc((MODES.find(m => m[0] === mode) || MODES[0])[1])}</span><button class="iconbtn" id="vx" aria-label="Close">${I.x}</button></div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:26px"><div class="orb" id="orb"></div><div class="voice-status" id="vs">Tap the mic and speak</div><div class="voice-transcript" id="vt"></div></div>
      <div class="voice-controls"><button class="vbtn" id="vmute" aria-label="Stop speaking">${I.mute}</button><button class="vbtn big" id="vmic" aria-label="Talk">${I.mic}</button><button class="vbtn end" id="vend" aria-label="End">${I.x}</button></div>`;
    document.body.append(ov); duckNasheed(true);
    const orb = $('#orb', ov), vs = $('#vs', ov), vt = $('#vt', ov); let vrec = null, audio = null, alive = true, auto = LS.get('voiceAuto', true);
    const setState = (s, txt) => { orb.className = 'orb ' + s; vs.textContent = txt; };
    const close = () => { alive = false; try { srObj?.abort(); } catch {} vrec?.cancel(); stopSpeech?.(); ctl?.abort(); ov.remove(); duckNasheed(false); render(); scrollEnd(); };
    $('#vx', ov).onclick = close; $('#vend', ov).onclick = close; window.addEventListener('hashchange', close, { once: true });
    $('#vmute', ov).onclick = () => { stopSpeech(); setState('', 'Tap the mic and speak'); };
    let silenceT = null, spoke = false;
    // Speech detection: rolling noise floor (median of quiet frames), "spoke" after ~150 ms above it, end after 1.3 s of silence.
    const lang = (state.user.settings.lang || navigator.language || 'en').slice(0, 2);
    // Instant path: the phone's own speech recogniser (Android Chrome) streams words live — no upload, no wait.
    // Android's built-in recogniser plays a system "beep" every time it starts/stops (can't be silenced from a web page), so voice mode
    // uses our own silent recorder + server transcription instead.
    const SR = null; let srObj = null, srFail = true;
    const listenSR = () => new Promise(resolve => {
      const r = new SR(); srObj = r; r.lang = state.user.settings.lang === 'ar' ? 'ar-SA' : (navigator.language || 'en-US'); r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
      let finalText = '', got = false, endT = null; const done = t => { if (got) return; got = true; clearTimeout(endT); try { r.stop(); } catch {} srObj = null; resolve(t); };
      r.onresult = ev => { let interim = ''; for (let i = ev.resultIndex; i < ev.results.length; i++) { const x = ev.results[i]; if (x.isFinal) finalText += x[0].transcript; else interim += x[0].transcript; }
        const live = (finalText + ' ' + interim).trim(); if (live) { vt.textContent = '“' + live + '”'; setState('listening', 'Listening…'); orb.style.transform = `scale(${1.05 + Math.random() * .12})`; }
        clearTimeout(endT); if (finalText && !interim) done(finalText.trim()); else endT = setTimeout(() => done(live), 900); };
      r.onerror = ev => { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed' || ev.error === 'network') { srFail = true; } done(got ? finalText : null); };
      r.onend = () => done(finalText.trim() || null);
      try { r.start(); setState('listening', 'Listening… speak now'); $('#vmic', ov).innerHTML = I.stop; } catch { srFail = true; done(null); } });
    const listen = async () => {
      if (!alive) return; stopSpeech();
      if (!srFail) { vt.textContent = ''; const t = await listenSR(); $('#vmic', ov).innerHTML = I.mic; orb.style.transform = ''; if (!alive) return;
        if (t) { ack(); return handleText(t); } if (!srFail) { setState('', 'I didn’t hear anything — tap the mic and speak'); return; } }
      try { spoke = false; let floor = 0.012, loud = 0, frames = 0;
        vrec = await recordAudio({ voice: true, maxMs: 60000, onLevel: lv => { frames++; orb.style.transform = `scale(${1 + Math.min(0.3, lv * 3)})`;
          if (lv < floor * 1.6) floor = floor * 0.95 + lv * 0.05; const th = Math.max(0.02, floor * 2.4);
          if (lv > th) { if (++loud > 5) { spoke = true; clearTimeout(silenceT); silenceT = null; if (vs.textContent !== 'Listening…') setState('listening', 'Listening…'); } }
          else { loud = Math.max(0, loud - 1); if (spoke && !silenceT) silenceT = setTimeout(() => finish(), 450); }
          if (!spoke && frames > 60 * 12) finish(); } });
        setState('listening', 'Listening… speak now'); $('#vmic', ov).innerHTML = I.stop; }
      catch (e) { setState('', e.message || 'Microphone permission denied'); }
    };
    // Alim's voice: sentence-chunked TTS so he starts speaking within ~1 s, one reusable <audio> (autoplay-safe on iOS/Android).
    const player = new Audio(); player.preload = 'auto'; let queue = [], speaking = false, speechId = 0;
    const stopSpeech = () => { speechId++; queue = []; speaking = false; try { player.pause(); } catch {} try { window.speechSynthesis?.cancel(); } catch {} };
    // Instant voice (default): the phone's own speech engine starts talking the moment the first words arrive — no server
    // round-trip (~2.5 s per sentence) and no AI credits. "Natural voice" keeps the server TTS for users who prefer it.
    const SS = window.speechSynthesis, instant = () => !!SS && typeof SpeechSynthesisUtterance !== 'undefined' && LS.get('voiceEngine', 'instant') === 'instant' && (SS.getVoices?.() || []).length > 0; // no voices installed -> server voice
    let devVoice; const pickVoice = () => { if (devVoice !== undefined) return devVoice; const vs = SS?.getVoices?.() || []; if (!vs.length) return null;
      const want = (state.user.settings.lang || navigator.language || 'en').slice(0, 2).toLowerCase(); const m = vs.filter(v => (v.lang || '').toLowerCase().startsWith(want));
      const pool = m.length ? m : vs.filter(v => /^en/i.test(v.lang || ''));
      devVoice = pool.find(v => /google|natural|enhanced|premium|siri/i.test(v.name) && v.localService !== false) || pool.find(v => v.localService) || pool[0] || null; return devVoice; };
    try { SS?.getVoices(); SS && SS.addEventListener?.('voiceschanged', () => { devVoice = undefined; }); } catch {}
    const primeSpeech = () => { try { if (instant()) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; SS.speak(u); } } catch {} }; // unlocks iOS speech inside the tap
    const chunksOf = t => { const s = t.replace(/\[(.*?)\]\([^)]*\)/g, '$1').replace(/https?:\S+/g, '').replace(/[*#_`>|~]/g, '').replace(/\s+/g, ' ').trim().match(/[^.!?؟…]+[.!?؟…]*\s*/g) || [];
      const out = []; let cur = ''; for (const x of s) { if ((cur + x).length > 220 && cur) { out.push(cur.trim()); cur = ''; } cur += x; if (!out.length && cur.length > 60) { out.push(cur.trim()); cur = ''; } } if (cur.trim()) out.push(cur.trim()); return out; };
    const ttsUrl = (text, fast) => fetch('/api/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, fast: !!fast, voice: state.user.settings.alimVoice || 'onyx' }) }).then(r => { if (!r.ok) throw new Error('Voice unavailable'); return r.blob(); }).then(b => URL.createObjectURL(b));
    // Streaming speech: sentences are voiced the moment they arrive from Alim, played back in order.
    const makeDeviceSpeaker = () => { const id = ++speechId; let buf = '', n = 0, done = 0, ended = false, started = false;
      const clean = t => t.replace(/\[(.*?)\]\([^)]*\)/g, '$1').replace(/https?:\S+/g, '').replace(/[*#_`>|~]/g, '').replace(/ﷺ/g, ' peace be upon him ').replace(/\s+/g, ' ').trim();
      const fin = () => { if (id !== speechId || !alive) return; if (ended && done >= n) { speaking = false; if (auto) listen(); else setState('', 'Tap the mic to reply'); } };
      const push = t => { t = clean(t); if (t.length < 1 || id !== speechId) return; n++; const u = new SpeechSynthesisUtterance(t); const v = pickVoice(); if (v) { u.voice = v; u.lang = v.lang; } u.rate = 1.04;
        u.onstart = () => { if (id === speechId && !started) { started = true; setState('speaking', 'Alim is speaking'); speaking = true; } };
        u.onend = u.onerror = () => { done++; fin(); }; try { SS.resume(); } catch {} SS.speak(u); };
      return { say(t) { push(t); }, feed(t) { buf += t; let m; // speak the first clause as early as possible, then sentence by sentence
          while ((m = buf.match(n ? /^[\s\S]{8,}?[.!?؟…](\s|$)/ : /^[\s\S]{6,}?([.!?؟…]|[,،;:—–](?=\s))(\s|$)/))) { push(m[0]); buf = buf.slice(m[0].length); }
          if (!n && buf.length > 28) { const k = buf.lastIndexOf(' ', 26); if (k > 8) { push(buf.slice(0, k)); buf = buf.slice(k); } } },
        end() { if (buf.trim()) push(buf); buf = ''; ended = true; fin(); } }; };
    const makeSpeaker = () => instant() ? makeDeviceSpeaker() : makeServerSpeaker();
    const makeServerSpeaker = () => { const id = ++speechId; const urls = [], parts = []; let i = 0, ended = false, playing = false, buf = '';
      const clean = t => t.replace(/\[(.*?)\]\([^)]*\)/g, '$1').replace(/https?:\S+/g, '').replace(/[*#_`>|~]/g, '').replace(/\s+/g, ' ').trim();
      const push = t => { t = clean(t); if (t.length < 2) return; parts.push(t); urls.push(parts.length === 1 ? Promise.resolve('/api/tts/stream?' + new URLSearchParams({ text: t, voice: state.user.settings.alimVoice || 'onyx' })) : ttsUrl(t, true)); if (!playing) next(); };
      const next = async () => { if (id !== speechId || !alive) return;
        if (i >= parts.length) { playing = false; if (ended) { speaking = false; if (auto) listen(); else setState('', 'Tap the mic to reply'); } return; }
        playing = true; let u; try { u = await urls[i]; } catch { i++; return next(); } if (id !== speechId) return;
        if (!player.paused && !player.ended && player.currentTime > 0 && i === 0) await new Promise(r => { const t = setTimeout(r, 1500); player.addEventListener('ended', () => { clearTimeout(t); r(); }, { once: true }); });
        if (id !== speechId) return; player.src = u; player.volume = 1; i++; setState('speaking', 'Alim is speaking'); speaking = true;
        try { await player.play(); } catch { playing = false; setState('', 'Tap the mic to hear Alim'); $('#vmic', ov).onclick = () => { $('#vmic', ov).onclick = () => vrec ? finish() : listen(); player.play().catch(() => {}); }; } };
      player.onended = next; player.onerror = next;
      return { say(t) { push(t); }, feed(t) { buf += t; let m; // first chunk early (comma/sentence after ~40 chars), then full sentences
          while ((m = buf.match(parts.length ? /^[\s\S]{20,}?[.!?؟…](\s|$)/ : /^[\s\S]{12,}?([.!?؟…]|[,،;:—–](?=\s))(\s|$)/))) { push(m[0]); buf = buf.slice(m[0].length); }
          if (!parts.length && buf.length > 40) { const k = buf.lastIndexOf(' ', 36); if (k > 12) { push(buf.slice(0, k)); buf = buf.slice(k); } } },
        end() { if (buf.trim()) push(buf); buf = ''; ended = true; if (!playing) next(); } }; };
    // Instant acknowledgement: tiny cached clips play the moment you stop talking, so Alim never feels silent.
    // No spoken fillers ("let me think" etc.): Alim goes straight into the answer.
    const ack = () => {};
    let lastReply = '';
    const finish = async () => {
      if (!vrec) return; clearTimeout(silenceT); silenceT = null; const r = vrec; vrec = null; $('#vmic', ov).innerHTML = I.mic; orb.style.transform = '';
      try { const blob = await r.stop(); if (blob.size < 1500) { setState('', 'I didn’t hear anything — tap the mic and speak'); return; }
        setState('thinking', 'Understanding…'); ack(); const text = (await transcribe(blob, lang, lastReply.slice(-250), true)).trim();
        await handleText(text);
      } catch (e) { setState('', e.message || 'Something went wrong'); }
    };
    let lastSent = '', lastAt = 0;
    const handleText = async text => {
      if (text && text === lastSent && Date.now() - lastAt < 4000) return; lastSent = text || ''; lastAt = Date.now();
      try {
        if (!text) { setState('', 'I didn’t catch that — tap the mic and try again'); return; }
        vt.textContent = '“' + text + '”'; ci.value = text; setState('thinking', 'Thinking…');
        const sp = makeSpeaker(); let shown = '';
        let filler = false; const am = await doSend({ voice: true, onTool: n => { if (filler) return; filler = true; setState('thinking', n === 'web_search' ? 'Searching…' : 'Checking sources…');  }, onDelta: t => { sp.feed(t); shown += t; vt.textContent = shown.replace(/[*#_`>]/g, '').slice(-400); } }); if (!alive) return;
        const reply = (am?.content || '').trim(); if (!reply) { stopSpeech(); setState('', am?.error || 'No reply — tap the mic to try again'); return; }
        lastReply = reply; sp.end();
      } catch (e) { setState('', e.message || 'Something went wrong'); }
    };
    $('#vmic', ov).onclick = () => { primeSpeech(); return srObj ? srObj.stop() : vrec ? finish() : listen(); };
    primeSpeech(); listen();
  }
  // ---- menu ----
  $('#cMenu').onclick = () => sheet(`<h3>Chat</h3>
    <button class="opt" id="oNew"><span class="e">${I.edit}</span><div>New chat</div></button>
    <button class="opt" id="oVoice"><span class="e">${I.wave}</span><div><div>Voice mode</div><div class="d">Talk with Alim hands-free</div></div></button>
    <div class="opt"><span class="e">${I.wave}</span><div class="grow"><div>Instant voice</div><div class="d">Phone’s own voice — replies start immediately. Off = natural voice (slower)</div></div><label class="toggle"><input type="checkbox" id="oInstant" ${LS.get('voiceEngine', 'instant') === 'instant' ? 'checked' : ''}><span></span></label></div>
    <div class="opt"><span class="e">${I.wave}</span><div class="grow"><div>Auto-listen after Alim speaks</div></div><label class="toggle"><input type="checkbox" id="oAuto" ${LS.get('voiceAuto', true) ? 'checked' : ''}><span></span></label></div>
    <button class="opt" id="oSearch"><span class="e">${I.search}</span><div>Search all chats</div></button>
    <button class="opt" id="oMem"><span class="e">${I.layers}</span><div><div>Alim’s memory${hasMemoryPlan() ? '' : ' 🔒'}</div><div class="d">${hasMemoryPlan() ? 'See and edit what Alim remembers' : 'Premium — Alim remembers you across chats'}</div></div></button>
    ${convId ? `<button class="opt" id="oRen"><span class="e">${I.edit}</span><div>Rename chat</div></button><button class="opt" id="oDel" style="color:var(--danger)"><span class="e" style="color:var(--danger)">${I.trash}</span><div>Delete chat</div></button>` : ''}`, (sh, close) => {
    $('#oNew', sh).onclick = () => { close(); go('/chat/new'); };
    $('#oVoice', sh).onclick = () => { close(); openVoice(); };
    $('#oAuto', sh).onchange = e => LS.set('voiceAuto', e.target.checked);
    { const oi = $('#oInstant', sh); if (oi) oi.onchange = e => LS.set('voiceEngine', e.target.checked ? 'instant' : 'natural'); }
    $('#oMem', sh).onclick = () => { close(); go('/memory'); };
    $('#oSearch', sh).onclick = () => { close(); searchChats(); };
    $('#oRen', sh) && ($('#oRen', sh).onclick = async () => { const t = prompt('Rename chat', $('#topbar .title').textContent); if (t) { await api('/conversations/' + convId, { method: 'PATCH', body: { title: t } }); $('#topbar .title').textContent = t; loadChatList(); } close(); });
    $('#oDel', sh) && ($('#oDel', sh).onclick = async () => { close(); if (await confirmSheet('Delete this chat?', hasMemoryPlan() ? 'The conversation is removed. Memories Alim saved from it are kept (manage them in Alim’s memory).' : 'The conversation is removed.', 'Delete', true)) { await api('/conversations/' + convId, { method: 'DELETE' }); loadChatList(); go('/chat/new'); } });
  });
  // ---- load ----
  if (!isNew) {
    try { const r = await api('/conversations/' + convId); msgs = r.messages.map(m => ({ id: m.id, role: m.role, content: m.content, meta: m.meta })); $('#topbar .title').textContent = r.conversation.title; if (r.conversation.mode) { mode = r.conversation.mode; modeBtn(); } }
    catch { return go('/chat/new'); }
  } else $('#topbar .title').textContent = 'Alim';
  render(); setTimeout(() => scrollEnd(), 30); updSend();
  const ask = sessionStorage.getItem('shukr.ask'); if (ask) { sessionStorage.removeItem('shukr.ask'); sessionStorage.removeItem('shukr.askMode'); modeBtn(); ci.value = ask; updSend(); doSend(); }
  else sessionStorage.removeItem('shukr.askMode');
}
function readURL(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); }); }
async function shrinkImage(f, max = 1400) {
  const url = await readURL(f); const img = new Image(); img.src = url; await img.decode().catch(() => {});
  const k = Math.min(1, max / Math.max(img.width || max, img.height || max)); if (k >= 1 && f.size < 1.5e6) return url;
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.85);
}
function searchChats() {
  sheet(`<h3>Search chats</h3><input class="input" id="sq" placeholder="Search titles and messages" type="search"><div id="sr" style="margin-top:8px"></div>`, (sh, close) => {
    let t = null; $('#sq', sh).oninput = e => { clearTimeout(t); t = setTimeout(async () => { const v = e.target.value.trim(); if (!v) return ($('#sr', sh).innerHTML = ''); const { conversations } = await api('/conversations?q=' + encodeURIComponent(v)); $('#sr', sh).innerHTML = conversations.map(c => `<button class="chatitem" data-id="${c.id}">${esc(c.title)}</button>`).join('') || '<div class="faint small">No matches</div>'; $$('[data-id]', sh).forEach(b => b.onclick = () => { close(); go('/chat/' + b.dataset.id); }); }, 250); };
    setTimeout(() => $('#sq', sh).focus(), 300);
  });
}

// ================= MEMORY =================
const KIND_LABEL = { fact: 'About you', person: 'People', goal: 'Goals', struggle: 'Struggles', preference: 'Preferences', learned: 'Learned', win: 'Wins' };
export async function viewMemory() {
  const p = shell('Alim’s memory'); p.innerHTML = loadingHTML();
  const [{ memories, locked }, prof] = await Promise.all([api('/memories'), api('/profile-ai').catch(() => ({}))]);
  if (locked) { p.innerHTML = `<div class="prem-hero" style="margin-top:12px"><span class="prem-ic">${I.layers}</span><h1>Give Alim a memory</h1><p>With Alim Memory, Alim remembers your goals, struggles, family and wins across every chat and journal entry, and picks up where you left off.</p></div><div class="card"><ul class="paylist"><li>${I.check} Remembers what matters to you</li><li>${I.check} Searches all your past chats & journal</li><li>${I.check} A personal life summary that grows</li></ul><a class="btn accent block" href="#/premium">Unlock for $8 / month</a><p class="faint small" style="text-align:center;margin-top:8px">Without it, each chat starts fresh and nothing is stored.</p></div>`; return; }
  const groups = {}; memories.forEach(m => (groups[m.kind] = groups[m.kind] || []).push(m));
  p.innerHTML = `<div class="sub" style="margin-top:10px">Your Memory plan is active: Alim remembers what matters to you across chats. These are the key facts it has distilled about you — edit anything that’s wrong.</div>
    ${prof.life_summary ? `<div class="card soft"><div class="faint small" style="margin-bottom:4px">How Alim understands you</div><div style="font-family:var(--serif);font-size:15.5px;line-height:1.6">${esc(prof.life_summary)}</div></div>` : ''}
    <form id="mf" class="row" style="margin-bottom:12px"><input class="input" id="mi" placeholder="Tell Alim something to remember…" maxlength="300"><button class="btn accent" aria-label="Add">${I.plus}</button></form>
    ${memories.length ? Object.entries(groups).map(([k, arr]) => `<div class="card flat"><div class="faint small" style="font-weight:600;margin-bottom:4px">${KIND_LABEL[k] || k} · ${arr.length}</div>${arr.map(m => `<div class="list-item"><div class="grow" style="font-size:15px">${esc(m.content)}<div class="faint" style="font-size:11.5px">${esc(m.source || '')} · ${new Date(m.created_at).toLocaleDateString()}</div></div><button class="iconbtn sm" data-del="${m.id}" aria-label="Forget">${I.trash}</button></div>`).join('')}</div>`).join('')
      : empty('layers', 'Nothing yet. Chat with Alim and write in your journal — it will remember what matters.')}
    ${memories.length ? '<button class="btn danger block" id="mclear" style="margin-top:8px">Forget everything</button>' : ''}`;
  $('#mf').onsubmit = async e => { e.preventDefault(); const v = $('#mi').value.trim(); if (!v) return; await api('/memories', { body: { content: v, kind: 'fact' } }); toast('Remembered'); viewMemory(); };
  $$('[data-del]').forEach(b => b.onclick = async () => { await api('/memories/' + b.dataset.del, { method: 'DELETE' }); b.closest('.list-item').remove(); toast('Forgotten'); });
  $('#mclear')?.addEventListener('click', async () => { if (await confirmSheet('Forget everything?', 'All saved memories will be deleted. Your chats and journal stay.', 'Forget all', true)) { await api('/memories/all', { method: 'DELETE' }); viewMemory(); } });
}

// Pinned, tappable help card shown whenever the server detects crisis language (independent of the AI reply).
function showCrisisCard(ev) {
  if (document.querySelector('.crisis-card')) return;
  const tel = v => /^[+\d][\d\s-]{1,}$/.test(v.trim()) ? `<a class="btn accent sm" href="tel:${v.replace(/[^\d+]/g, '')}">Call ${v}</a>` : /findahelpline/.test(v) ? `<a class="btn accent sm" href="https://findahelpline.com" target="_blank" rel="noopener">Open findahelpline.com</a>` : `<span class="small">${v.replace(/</g, '&lt;')}</span>`;
  const el = document.createElement('div'); el.className = 'crisis-card'; el.setAttribute('role', 'alert');
  el.innerHTML = `<div class="crisis-top"><b>${ev.kind === 'abuse' ? 'You deserve to be safe' : 'You’re not alone — help is available now'}</b><button class="iconbtn sm" aria-label="Hide">✕</button></div>
    <p class="small">Free, confidential people who want to listen, any time:</p>
    ${ev.lines.map(([n, v]) => `<div class="crisis-line"><span>${n.replace(/</g, '&lt;')}</span>${tel(v)}</div>`).join('')}
    <p class="faint small" style="margin-top:6px">If you might act on these thoughts, call emergency services or go to the nearest hospital.</p>`;
  el.querySelector('button').onclick = () => el.remove();
  (document.querySelector('.chat-log, #log, .shell-main') || document.body).prepend(el);
}
