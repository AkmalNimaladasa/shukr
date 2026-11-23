// Voice & video calls (WebRTC). The server only relays call setup (offer/answer/ICE) through short polling; audio/video flow peer-to-peer.
const crypto = require('crypto');
module.exports = function calls(ctx) {
  const { app, q, auth, wrap } = ctx;
  const calls = new Map(); // id -> { id, conv, from, to, video, state, created, answered, inbox: {uid: [signals]} }
  const fail = (res, s, m) => res.status(s).json({ error: m });
  const sweep = () => { const now = Date.now(); for (const [k, c] of calls) if (now - c.created > 4 * 3600e3 || (c.state === 'ringing' && now - c.created > 50e3) || (['ended', 'declined', 'missed'].includes(c.state) && now - (c.endedAt || c.created) > 60e3)) {
    if (c.state === 'ringing') { c.state = 'missed'; c.endedAt = now; note(c, 'missed'); } else calls.delete(k); } };
  setInterval(sweep, 10e3).unref();
  const mine = (req, res) => { const c = calls.get(String(req.params.id)); if (!c || (c.from !== req.user.id && c.to !== req.user.id)) { fail(res, 404, 'Call not found'); return null; } return c; };
  const other = (c, uid) => c.from === uid ? c.to : c.from;
  async function note(c, kind) { // drop a call record into the chat thread
    try { const secs = c.answered && c.endedAt ? Math.round((c.endedAt - c.answered) / 1000) : 0;
      const body = kind === 'missed' ? `📞 Missed ${c.video ? 'video' : 'voice'} call` : kind === 'declined' ? `📞 ${c.video ? 'Video' : 'Voice'} call declined` : `📞 ${c.video ? 'Video' : 'Voice'} call · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      await q('INSERT INTO social_messages(id,conversation_id,sender,body) VALUES($1,$2,$3,$4)', ['msg-' + crypto.randomUUID(), c.conv, c.from, body]); } catch (e) { console.log('call note', e.message); } }
  app.post('/api/calls', auth, wrap(async (req, res) => { sweep();
    const conv = (await q('SELECT * FROM social_conversations WHERE id=$1 AND (starter=$2 OR recipient=$2)', [req.body?.conversationId, req.user.id])).rows[0];
    if (!conv) return fail(res, 404, 'Conversation not found');
    if (!conv.accepted) return fail(res, 403, 'You can call once they accept your message request.');
    const to = conv.starter === req.user.id ? conv.recipient : conv.starter;
    const blocked = (await q('SELECT 1 FROM blocks WHERE (blocker=$1 AND blocked=$2) OR (blocker=$2 AND blocked=$1)', [req.user.id, to]).catch(() => ({ rows: [] }))).rows[0];
    if (blocked) return fail(res, 403, 'You can’t call this person.');
    for (const c of calls.values()) if ([c.from, c.to].includes(to) && ['ringing', 'active'].includes(c.state)) return fail(res, 409, 'They’re on another call. Try again soon.');
    const id = crypto.randomUUID(), video = !!req.body?.video;
    const me = (await q('SELECT p.username, COALESCE(p.display_name,u.name) AS name, p.avatar FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id=$1', [req.user.id])).rows[0] || {};
    calls.set(id, { id, conv: conv.id, from: req.user.id, to, video, state: 'ringing', created: Date.now(), caller: me, inbox: { [req.user.id]: [], [to]: [] } });
    ctx.pushUser?.(to, { title: `${me.name || 'Someone'} is calling you`, body: video ? 'Incoming video call on Shukr' : 'Incoming voice call on Shukr', url: `/#/messages/${conv.id}?call=${id}`, tag: 'call-' + id, vibrate: [400, 200, 400, 200, 400], requireInteraction: true, urgency: 'high', renotify: true }).catch?.(() => {});
    res.status(201).json({ id, video, iceServers: ice() });
  }));
  app.get('/api/calls/incoming', auth, wrap(async (req, res) => { sweep(); const c = [...calls.values()].find(c => c.to === req.user.id && c.state === 'ringing');
    res.json({ call: c ? { id: c.id, video: c.video, conversationId: c.conv, caller: c.caller } : null, iceServers: c ? ice() : undefined }); }));
  app.post('/api/calls/:id/signal', auth, wrap(async (req, res) => { const c = mine(req, res); if (!c) return; const d = req.body?.data;
    if (!d || typeof d !== 'object' || JSON.stringify(d).length > 20000) return fail(res, 400, 'Bad signal');
    const box = c.inbox[other(c, req.user.id)]; if (box.length < 300) box.push(d); res.json({ ok: true }); }));
  app.get('/api/calls/:id/poll', auth, wrap(async (req, res) => { const c = mine(req, res); if (!c) return; const box = c.inbox[req.user.id]; const signals = req.query.peek ? [] : box.splice(0, box.length);
    res.json({ state: c.state, video: c.video, signals }); }));
  app.post('/api/calls/:id/:act(answer|decline|end)', auth, wrap(async (req, res) => { const c = mine(req, res); if (!c) return; const act = req.params.act;
    if (act === 'answer' && c.to === req.user.id && c.state === 'ringing') { c.state = 'active'; c.answered = Date.now(); }
    else if (act === 'decline' && c.state === 'ringing') { c.state = c.to === req.user.id ? 'declined' : 'missed'; c.endedAt = Date.now(); note(c, c.state); }
    else if (act === 'end' && !['ended', 'declined', 'missed'].includes(c.state)) { const was = c.state; c.state = was === 'ringing' ? 'missed' : 'ended'; c.endedAt = Date.now(); note(c, c.state); }
    res.json({ state: c.state }); }));
  function ice() { const s = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
    if (process.env.TURN_URL) s.push({ urls: process.env.TURN_URL.split(','), username: process.env.TURN_USER || '', credential: process.env.TURN_PASS || '' }); return s; }
};
