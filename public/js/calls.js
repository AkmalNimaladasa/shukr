// Voice & video calls in Messages (WebRTC, peer-to-peer). Incoming-call watcher runs app-wide.
import { $, esc, escAttr, api, state, toast } from './core.js';

let active = null;
const ICON = {
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.7 5.2M19 11a7 7 0 0 1-.4 2.3M12 18v3M3 3l18 18"/></svg>',
  spk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3"/></svg>',
  camOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 16v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2M10 5h4a2 2 0 0 1 2 2v3l6-3v10M3 3l18 18"/></svg>',
  flip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 7h-3l-2-3H9L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/><path d="M9 13a3 3 0 0 1 5-2.2M15 13a3 3 0 0 1-5 2.2M14 9v2h-2M10 17v-2h2"/></svg>',
  end: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 9c-3.3 0-6.3 1-8.6 2.7-.6.4-.7 1.2-.3 1.8l1.6 2.2c.4.5 1.1.7 1.7.4l2.4-1.2c.5-.2.8-.8.7-1.3l-.3-1.6a12 12 0 0 1 5.6 0l-.3 1.6c-.1.5.2 1.1.7 1.3l2.4 1.2c.6.3 1.3.1 1.7-.4l1.6-2.2c.4-.6.3-1.4-.3-1.8C18.3 10 15.3 9 12 9Z"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2Z"/></svg>'
};
export const callIcons = ICON;

function ring(on) { // simple ringtone from the device speaker (oscillator, no file)
  try { if (on) { const ac = new (window.AudioContext || window.webkitAudioContext)(); const g = ac.createGain(); g.gain.value = 0; g.connect(ac.destination);
      const o1 = ac.createOscillator(), o2 = ac.createOscillator(); o1.frequency.value = 440; o2.frequency.value = 480; o1.connect(g); o2.connect(g); o1.start(); o2.start();
      let t = ac.currentTime; for (let i = 0; i < 30; i++) { g.gain.setValueAtTime(0.18, t); g.gain.setValueAtTime(0, t + 1.2); t += 3.2; } return () => { try { o1.stop(); o2.stop(); ac.close(); } catch {} }; } } catch {} return () => {}; }

export async function startCall(conversationId, peer = {}, video = false) {
  if (active) return toast('You’re already on a call');
  let r; try { r = await api('/calls', { body: { conversationId, video } }); } catch (e) { return toast(e.message); }
  runCall({ id: r.id, video, peer, outgoing: true, iceServers: r.iceServers });
}

async function runCall({ id, video, peer, outgoing, iceServers }) {
  const ov = document.createElement('div'); ov.className = 'call-ov' + (video ? ' video' : ''); document.body.append(ov); document.documentElement.classList.add('in-call');
  const av = peer.avatar ? `<img src="${escAttr(peer.avatar)}" alt="">` : esc((peer.name || peer.username || '?')[0].toUpperCase());
  ov.innerHTML = `<video class="call-remote" id="cRemote" autoplay playsinline></video><video class="call-local" id="cLocal" autoplay playsinline muted></video><audio id="cAudio" autoplay></audio>
    <div class="call-top"><span class="call-av">${av}</span><b>${esc(peer.name || peer.username || 'Shukr user')}</b><small id="cState">${outgoing ? 'Calling…' : 'Connecting…'}</small></div>
    <div class="call-bar"><button class="cbt" id="cMic" aria-label="Mute">${ICON.mic}<small>Mute</small></button><button class="cbt" id="cSpk" aria-label="Speaker">${ICON.spk}<small>Speaker</small></button>
      ${video ? `<button class="cbt" id="cCam" aria-label="Camera">${ICON.cam}<small>Camera</small></button><button class="cbt" id="cFlip" aria-label="Flip camera">${ICON.flip}<small>Flip</small></button>` : `<button class="cbt" id="cVid" aria-label="Turn on video">${ICON.cam}<small>Video</small></button>`}
      <button class="cbt end" id="cEnd" aria-label="End call">${ICON.end}</button></div>`;
  const st = t => { $('#cState', ov).textContent = t; };
  let stream, pc, closed = false, timer = null, t0 = 0, poll = null, facing = 'user', stopRing = outgoing ? ring(true) : () => {};
  const remoteV = $('#cRemote', ov), audioEl = $('#cAudio', ov);
  const cleanup = async (send = true, msg = 'Call ended') => { if (closed) return; closed = true; stopRing(); clearInterval(timer); clearTimeout(poll);
    if (send) api(`/calls/${id}/end`, { body: {} }).catch(() => {}); try { pc?.close(); } catch {} stream?.getTracks().forEach(t => t.stop());
    st(msg); setTimeout(() => { ov.remove(); document.documentElement.classList.remove('in-call'); }, 900); active = null; };
  active = { id, end: () => cleanup() };
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: video ? { facingMode: facing, width: { ideal: 720 }, height: { ideal: 1280 } } : false }); }
  catch { toast('Allow microphone' + (video ? ' and camera' : '') + ' access to call'); return cleanup(true, 'Permission needed'); }
  if (video) $('#cLocal', ov).srcObject = stream;
  pc = new RTCPeerConnection({ iceServers });
  stream.getTracks().forEach(t => pc.addTrack(t, stream));
  const remote = new MediaStream(); remoteV.srcObject = remote; audioEl.srcObject = remote;
  pc.ontrack = e => { e.streams[0].getTracks().forEach(t => remote.addTrack(t)); if (e.track.kind === 'video') ov.classList.add('has-remote'); audioEl.play().catch(() => {}); remoteV.play().catch(() => {}); };
  const signal = data => api(`/calls/${id}/signal`, { body: { data } }).catch(() => {});
  pc.onicecandidate = e => { if (e.candidate) signal({ ice: e.candidate.toJSON() }); };
  pc.onconnectionstatechange = () => { const s = pc.connectionState;
    if (s === 'connected') { stopRing(); t0 = Date.now(); clearInterval(timer); timer = setInterval(() => { const s2 = Math.floor((Date.now() - t0) / 1000); st(`${Math.floor(s2 / 60)}:${String(s2 % 60).padStart(2, '0')}`); }, 1000); }
    if (s === 'failed') cleanup(true, 'Connection lost'); if (s === 'disconnected') st('Reconnecting…'); };
  const pending = []; let haveRemote = false;
  const addIce = async c => { try { await pc.addIceCandidate(c); } catch {} };
  const loop = async () => { if (closed) return; try { const r = await api(`/calls/${id}/poll`);
      if (['ended', 'declined', 'missed'].includes(r.state)) return cleanup(false, r.state === 'declined' ? 'Call declined' : r.state === 'missed' ? 'No answer' : 'Call ended');
      if (outgoing && r.state === 'active' && $('#cState', ov).textContent === 'Calling…') { st('Connecting…'); stopRing(); }
      for (const d of r.signals) {
        if (d.sdp) { await pc.setRemoteDescription(d.sdp); haveRemote = true; for (const c of pending.splice(0)) await addIce(c);
          if (d.sdp.type === 'offer') { const ans = await pc.createAnswer(); await pc.setLocalDescription(ans); signal({ sdp: pc.localDescription.toJSON() }); } }
        else if (d.ice) haveRemote ? await addIce(d.ice) : pending.push(d.ice);
      } } catch {} poll = setTimeout(loop, 700); };
  if (outgoing) { const off = await pc.createOffer(); await pc.setLocalDescription(off); signal({ sdp: pc.localDescription.toJSON() }); }
  loop();
  // Controls
  let muted = false, speaker = true;
  $('#cMic', ov).onclick = e => { muted = !muted; stream.getAudioTracks().forEach(t => t.enabled = !muted); e.currentTarget.classList.toggle('on', muted); e.currentTarget.innerHTML = (muted ? ICON.micOff : ICON.mic) + `<small>${muted ? 'Unmute' : 'Mute'}</small>`; };
  // Speakerphone: switch output where the browser allows (setSinkId), otherwise toggle loud/earpiece-level volume.
  $('#cSpk', ov).onclick = async e => { speaker = !speaker; e.currentTarget.classList.toggle('on', speaker);
    try { if (audioEl.setSinkId && navigator.mediaDevices.enumerateDevices) { const outs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput');
        const pick = outs.find(d => speaker ? /speaker/i.test(d.label) : /earpiece|receiver|handset/i.test(d.label)) || outs[0]; if (pick) await audioEl.setSinkId(pick.deviceId); } } catch {}
    audioEl.volume = speaker ? 1 : 0.35; toast(speaker ? 'Speaker on' : 'Speaker off'); };
  $('#cSpk', ov).classList.add('on');
  $('#cEnd', ov).onclick = () => cleanup();
  $('#cCam', ov) && ($('#cCam', ov).onclick = e => { const v = stream.getVideoTracks()[0]; if (!v) return; v.enabled = !v.enabled; e.currentTarget.classList.toggle('on', !v.enabled); e.currentTarget.innerHTML = (v.enabled ? ICON.cam : ICON.camOff) + '<small>Camera</small>'; });
  $('#cFlip', ov) && ($('#cFlip', ov).onclick = async () => { facing = facing === 'user' ? 'environment' : 'user';
    try { const ns = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing } }); const nt = ns.getVideoTracks()[0]; const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      await sender.replaceTrack(nt); stream.getVideoTracks().forEach(t => { t.stop(); stream.removeTrack(t); }); stream.addTrack(nt); $('#cLocal', ov).srcObject = stream; } catch { toast('Couldn’t switch camera'); } });
  $('#cVid', ov) && ($('#cVid', ov).onclick = () => toast('Start a video call from the camera button in the chat'));
}

// Incoming calls: poll lightly while the app is open (push notification wakes the user when it is closed).
let watching = false, shown = null;
export function watchIncomingCalls() {
  if (watching) return; watching = true;
  const tick = async () => { if (!state.user || document.hidden || active) return setTimeout(tick, 4000);
    try { const r = await api('/calls/incoming'); if (r.call && shown !== r.call.id) { shown = r.call.id; showIncoming(r.call, r.iceServers); } } catch {}
    setTimeout(tick, 2500); };
  setTimeout(tick, 3000);
}
function showIncoming(c, iceServers) {
  const p = c.caller || {}; const ov = document.createElement('div'); ov.className = 'call-ov incoming';
  const av = p.avatar ? `<img src="${escAttr(p.avatar)}" alt="">` : esc((p.name || p.username || '?')[0].toUpperCase());
  ov.innerHTML = `<div class="call-top"><span class="call-av pulse">${av}</span><b>${esc(p.name || p.username || 'Shukr user')}</b><small>Incoming ${c.video ? 'video' : 'voice'} call…</small></div>
    <div class="call-bar two"><button class="cbt end" id="iDec" aria-label="Decline">${ICON.end}<small>Decline</small></button><button class="cbt accept" id="iAcc" aria-label="Accept">${c.video ? ICON.cam : ICON.phone}<small>Accept</small></button></div>`;
  document.body.append(ov); const stop = ring(true); try { navigator.vibrate?.([500, 300, 500, 300, 500]); } catch {}
  let gone = false; const close = () => { if (gone) return; gone = true; stop(); ov.remove(); };
  const check = setInterval(async () => { try { const r = await api(`/calls/${c.id}/poll?peek=1`); if (r.state !== 'ringing' && r.state !== 'active') { clearInterval(check); close(); } } catch {} }, 1500);
  $('#iDec', ov).onclick = () => { clearInterval(check); close(); api(`/calls/${c.id}/decline`, { body: {} }).catch(() => {}); };
  $('#iAcc', ov).onclick = async () => { clearInterval(check); close();
    try { await api(`/calls/${c.id}/answer`, { body: {} }); } catch (e) { return toast(e.message); }
    runCall({ id: c.id, video: c.video, peer: p, outgoing: false, iceServers }); };
}
