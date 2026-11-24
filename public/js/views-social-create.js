// Create: in-app camera (tap = photo, hold = video), gallery upload, then caption & post.
import { sheet, $, $$, esc, escAttr, I, api, go, toast, onCleanup } from './core.js';
import { openEditor, exportPhoto, exportVideo, defaultEdit, renderJob } from './editor.js';
import './fx.js';
const FX = globalThis.ShukrFX;

const TOPICS = [['wellbeing','Wellbeing'],['quran','Quran'],['sunnah','Sunnah'],['character','Character'],['learning','Learning'],['world','World']];
const MAX_VIDEO_MS = 60000;
const FLIP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7h-3l-2-3H9L7 7H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1Z"/><path d="M15.5 12.5a3.5 3.5 0 0 1-6.3 2M8.5 12.5a3.5 3.5 0 0 1 6.3-2"/><path d="m15 9 .2 1.6-1.6.2M9 16l-.2-1.6 1.6-.2"/></svg>';
const GALLERY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="9" cy="9" r="2"/><path d="m21 15-4.5-4.5L6 21"/></svg>';

function readMeta(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('video/')) {
      const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true; v.playsInline = true; v.src = url;
      let fin = false; const done = (poster) => { if (fin) return; fin = true; resolve({ url, width: v.videoWidth || null, height: v.videoHeight || null, duration: isFinite(v.duration) ? Math.round(v.duration * 1000) : null, poster }); };
      // MediaRecorder WebM files report Infinity until seeked to the end — resolve the real length first
      v.onloadeddata = () => { try { if (!isFinite(v.duration)) { v.ondurationchange = () => { if (isFinite(v.duration)) { v.ondurationchange = null; v.currentTime = Math.min(0.5, v.duration / 3); } }; v.currentTime = 1e7; setTimeout(() => { if (!isFinite(v.duration)) v.currentTime = 0.1; }, 2500); } else v.currentTime = Math.min(0.5, (v.duration || 1) / 3); } catch { done(null); } };
      setTimeout(() => done(null), 8000);
      v.onseeked = () => {
        try { const c = document.createElement('canvas'), s = Math.min(1, 1080 / Math.max(v.videoWidth, v.videoHeight)); c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s); c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); c.toBlob(b => done(b), 'image/jpeg', .85); }
        catch { done(null); }
      };
      v.onerror = () => done(null); setTimeout(() => done(null), 8000);
    } else {
      const img = new Image(); img.onload = () => resolve({ url, width: img.naturalWidth, height: img.naturalHeight }); img.onerror = () => resolve({ url }); img.src = url;
    }
  });
}
// Phone photos can be 10+ MB; shrink to 1920px JPEG before upload (keeps GIFs as-is).
async function shrinkImage(file, meta) {
  if (file.type === 'image/gif' || !meta.width || Math.max(meta.width, meta.height) <= 1920 && file.size < 2.5e6) return file;
  const img = new Image(); img.src = meta.url; await img.decode().catch(() => {});
  const s = 1920 / Math.max(meta.width, meta.height), c = document.createElement('canvas');
  c.width = Math.round(meta.width * Math.min(1, s)); c.height = Math.round(meta.height * Math.min(1, s));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .88));
  if (!blob) return file;
  meta.width = c.width; meta.height = c.height;
  return new File([blob], (file.name || 'photo').replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}
function upload(blob, meta, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest(); x.open('POST', '/api/social/media'); x.withCredentials = true;
    x.setRequestHeader('Content-Type', blob.type);
    if (meta?.width) x.setRequestHeader('X-Media-Width', String(meta.width));
    if (meta?.height) x.setRequestHeader('X-Media-Height', String(meta.height));
    if (meta?.duration) x.setRequestHeader('X-Media-Duration', String(meta.duration));
    x.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    x.onload = () => { let d = {}; try { d = JSON.parse(x.responseText); } catch {} if (x.status >= 200 && x.status < 300) resolve(d.media); else reject(new Error(d.error || `Upload failed (${x.status})`)); };
    x.onerror = () => reject(new Error('Network error while uploading. Check your connection.'));
    x.send(blob);
  });
}

export async function viewCreate(query) {
  const app = $('#app');
  const prev = document.documentElement.classList.contains('immersive');
  document.documentElement.classList.add('immersive', 'creating');
  let showFx = false, camFilter = 'normal', timerSec = 0, grid = false, torch = false, alive = true, stream = null, facing = 'environment', recorder = null, chunks = [], recStart = 0, recTimer = null, holdTimer = null;
  let kind = query?.get('type') === 'story' ? 'story' : 'post', items = [];
  const host = document.createElement('div'); host.className = 'create-screen'; document.body.append(host);
  // Free the phone's video decoders & memory: pause and unload every background video (feed, stories) while creating.
  const parked = [...document.querySelectorAll('video')].filter(v => !host.contains(v)).map(v => { const s = v.getAttribute('src'); try { v.pause(); } catch {} if (s) { v.dataset.parkedSrc = s; v.removeAttribute('src'); try { v.load(); } catch {} } return v; });
  const unpark = () => parked.forEach(v => { if (v.dataset.parkedSrc && v.isConnected) { v.setAttribute('src', v.dataset.parkedSrc); delete v.dataset.parkedSrc; } });
  const stopStream = () => { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; };
  const cleanup = () => { alive = false; unpark(); stopStream(); clearInterval(recTimer); clearTimeout(holdTimer); items.forEach(i => URL.revokeObjectURL(i.meta.url)); host.remove(); document.documentElement.classList.remove('creating'); if (!prev) document.documentElement.classList.remove('immersive'); window.removeEventListener('hashchange', cleanup); };
  window.addEventListener('hashchange', cleanup); onCleanup(cleanup);
  // Close always leaves the camera: go back only if the previous page was inside the app and not /create, else open the feed.
  const entryHash = sessionStorage.getItem('shukr.prevHash') || '';
  const close = () => { const before = location.hash; if (entryHash && !/^#\/create/.test(entryHash) && history.length > 1) { history.back(); setTimeout(() => { if (location.hash === before) go('/fyp'); }, 350); } else go('/fyp'); };

  function cameraUI() {
    host.innerHTML = `<div class="cam">
      <video class="cam-view ${facing === 'user' ? 'mirror' : ''}" playsinline muted autoplay></video>
      <div class="cam-msg" hidden></div>
      <header class="cam-top"><button class="cam-icon" data-close aria-label="Close">${I.x}</button><div class="cam-timer" hidden>0:00</div><span></span></header>
      <div class="cam-side"><button class="cam-icon" data-flip aria-label="Flip camera">${FLIP}</button>
        <button class="cam-icon ${timerSec ? 'on' : ''}" data-timer aria-label="Timer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg><small>${timerSec ? timerSec + 's' : 'Off'}</small></button>
        <button class="cam-icon ${torch ? 'on' : ''}" data-torch aria-label="Flash"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7Z"/></svg></button>
        <button class="cam-icon ${grid ? 'on' : ''}" data-grid aria-label="Grid"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg></button>
        <button class="cam-icon ${camFilter !== 'normal' ? 'on' : ''}" data-fxbtn aria-label="Filters"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="9" r="6"/><circle cx="15" cy="9" r="6"/><circle cx="12" cy="15" r="6"/></svg></button></div>
      <div class="cam-grid" ${grid ? '' : 'hidden'}></div><div class="cam-count" hidden></div>
      <svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="camF" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"/><feComponentTransfer><feFuncR type="table" tableValues="0 1"/><feFuncG type="table" tableValues="0 1"/><feFuncB type="table" tableValues="0 1"/></feComponentTransfer></filter></svg>
      <div class="cam-bottom">
        <div class="cam-fx" ${camFilter !== 'normal' || showFx ? '' : 'hidden'}>${FX.FILTERS.map(([k, l]) => `<button data-cf="${k}" class="${camFilter === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="cam-hint">Tap for photo · hold for video</div>
        <div class="cam-row">
          <label class="cam-gallery" aria-label="Upload from your gallery">${GALLERY}<b>Upload</b><input type="file" accept="image/*,video/*" multiple hidden data-pick></label>
          <button class="cam-shutter" data-shutter aria-label="Take photo or hold to record"><span></span><svg viewBox="0 0 100 100" class="cam-ring"><circle cx="50" cy="50" r="46"/></svg></button>
          <button class="cam-gallery cam-flip2" data-flip2 aria-label="Switch to selfie / back camera">${FLIP}<b>Flip</b></button>
          <input type="file" accept="image/*" capture="environment" hidden data-pick data-cap-photo><input type="file" accept="video/*" capture="environment" hidden data-pick data-cap-video>
        </div>
        <div class="cam-modes" role="tablist"><button data-kind="post" class="${kind === 'post' ? 'on' : ''}" role="tab">Post</button><button data-kind="story" class="${kind === 'story' ? 'on' : ''}" role="tab">Story</button></div>
      </div></div>`;
    $('[data-close]', host).onclick = close;
    $$('[data-pick]', host).forEach(i => i.onchange = () => { if (i.files?.length) addFiles([...i.files]); i.value = ''; });
    // Flip (bottom-right, big target). If the live camera can't run here, it opens the phone's own camera instead.
    $('[data-flip2]', host).onclick = () => { if (!stream) return $('[data-cap-photo]', host).click(); facing = facing === 'user' ? 'environment' : 'user'; startCamera(); };
    $$('[data-kind]', host).forEach(b => b.onclick = () => { kind = b.dataset.kind; $$('[data-kind]', host).forEach(x => x.classList.toggle('on', x === b)); });
    $('[data-flip]', host).onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; startCamera(); };
    // Live preview: CSS filter functions (GPU, work on <video> on Android/iOS — SVG url() filters don't). Photos/videos get the exact filter after capture.
    const CSSF = { normal: '', noor: 'brightness(1.06) contrast(1.08) saturate(1.15)', madinah: 'sepia(.25) saturate(1.2) contrast(1.1) hue-rotate(-8deg)', oasis: 'saturate(1.4) contrast(1.12)',
      dawn: 'sepia(.2) saturate(1.1) brightness(1.06) hue-rotate(-12deg) contrast(.95)', dusk: 'sepia(.35) saturate(1.05) contrast(1.15) brightness(.95)', sahara: 'sepia(.5) contrast(1.08) saturate(1.1)',
      silk: 'brightness(1.08) contrast(.92) saturate(.9)', teal: 'hue-rotate(-14deg) saturate(1.3) contrast(1.2)', vivid: 'saturate(1.6) contrast(1.18)', cool: 'saturate(1.1) hue-rotate(12deg) brightness(1.03)',
      retro: 'sepia(.45) contrast(1.1) saturate(.85)', mono: 'grayscale(1) contrast(1.12)', noir: 'grayscale(1) contrast(1.45) brightness(.95)', moon: 'grayscale(1) brightness(1.1) contrast(.85)', night: 'brightness(.9) contrast(1.25) saturate(.9) hue-rotate(10deg)' };
    const applyCamFx = () => { const v = $('.cam-view', host); if (v) v.style.filter = camFilter === 'normal' ? '' : (CSSF[camFilter] || ''); };
    applyCamFx();
    $('[data-fxbtn]', host).onclick = () => { showFx = !showFx; $('.cam-fx', host).hidden = !showFx; };
    $$('[data-cf]', host).forEach(b => b.onclick = () => { camFilter = b.dataset.cf; $$('[data-cf]', host).forEach(x => x.classList.toggle('on', x === b)); $('[data-fxbtn]', host).classList.toggle('on', camFilter !== 'normal'); applyCamFx(); });
    $('[data-timer]', host).onclick = e => { timerSec = timerSec === 0 ? 3 : timerSec === 3 ? 10 : 0; e.currentTarget.classList.toggle('on', !!timerSec); e.currentTarget.querySelector('small').textContent = timerSec ? timerSec + 's' : 'Off'; };
    $('[data-grid]', host).onclick = e => { grid = !grid; e.currentTarget.classList.toggle('on', grid); $('.cam-grid', host).hidden = !grid; };
    $('[data-torch]', host).onclick = async e => { const t = stream?.getVideoTracks()[0]; torch = !torch; e.currentTarget.classList.toggle('on', torch);
      try { if (t?.getCapabilities?.().torch) await t.applyConstraints({ advanced: [{ torch }] }); else if (torch) toast(facing === 'user' ? 'Front flash: the screen lights up when you shoot' : 'Flash isn’t available on this camera'); } catch {} };
    // swipe left/right on the preview to change filter (like Instagram)
    { const v = $('.cam-view', host); let sx = null; v.addEventListener('pointerdown', e => sx = e.clientX); v.addEventListener('pointerup', e => { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) < 60) return;
      const i = FX.FILTERS.findIndex(f => f[0] === camFilter), n = (i + (dx < 0 ? 1 : -1) + FX.FILTERS.length) % FX.FILTERS.length; camFilter = FX.FILTERS[n][0]; $$('[data-cf]', host).forEach(x => x.classList.toggle('on', x.dataset.cf === camFilter)); applyCamFx();
      const lab = $('.cam-count', host); lab.hidden = false; lab.textContent = FX.FILTERS[n][1]; lab.classList.add('label'); clearTimeout(lab._t); lab._t = setTimeout(() => { lab.hidden = true; lab.classList.remove('label'); }, 900); }); }
    // pinch-zoom on the preview
    { const v = $('.cam-view', host); const P = new Map(); let d0 = 0, z0 = 1;
      v.addEventListener('pointerdown', e => { P.set(e.pointerId, [e.clientX, e.clientY]); if (P.size === 2) { const [a, b] = [...P.values()]; d0 = Math.hypot(a[0] - b[0], a[1] - b[1]); const t = stream?.getVideoTracks()[0]; z0 = t?.getSettings?.().zoom || 1; } });
      v.addEventListener('pointermove', async e => { if (!P.has(e.pointerId)) return; P.set(e.pointerId, [e.clientX, e.clientY]); if (P.size !== 2) return; const [a, b] = [...P.values()]; const t = stream?.getVideoTracks()[0], cap = t?.getCapabilities?.();
        if (cap?.zoom) { const z = Math.min(cap.zoom.max, Math.max(cap.zoom.min, z0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / Math.max(20, d0))); try { await t.applyConstraints({ advanced: [{ zoom: z }] }); } catch {} } });
      const up = e => P.delete(e.pointerId); v.addEventListener('pointerup', up); v.addEventListener('pointercancel', up); }
    const sh = $('[data-shutter]', host);
    const down = e => { e.preventDefault(); if (!stream) return; holdTimer = setTimeout(startRecording, 320); };
    const countdown = fn => { if (!timerSec) return fn(); const el = $('.cam-count', host); let n = timerSec; el.hidden = false; el.classList.remove('label'); el.textContent = n;
      const t = setInterval(() => { n--; if (n <= 0) { clearInterval(t); el.hidden = true; fn(); } else el.textContent = n; }, 1000); };
    const up = e => { e.preventDefault(); if (recorder) return stopRecording(); if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; if (stream) countdown(takePhoto); } };
    sh.addEventListener('pointerdown', down); sh.addEventListener('pointerup', up); sh.addEventListener('pointerleave', e => { if (recorder) up(e); else clearTimeout(holdTimer); });
    sh.addEventListener('contextmenu', e => e.preventDefault());
    startCamera();
  }
  async function startCamera() {
    stopStream(); const v = $('.cam-view', host), msg = $('.cam-msg', host); if (!v) return;
    v.classList.toggle('mirror', facing === 'user'); host.classList.toggle('cam-front', facing === 'user');
    if (!navigator.mediaDevices?.getUserMedia) { msg.hidden = false; msg.innerHTML = `<b>Camera preview isn’t available here.</b><span>Use <em>Upload</em> below, or tap <em>Flip</em> to open your phone camera.</span>`; return; }
    try {
      // Ask for the sensor's natural framing. Forcing a 9:16 aspect ratio makes Android crop the middle of the
      // sensor (looks zoomed in); the browser rotates the frame to portrait by itself when the phone is upright.
      const video = facing === 'user' ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 }, frameRate: { ideal: 30 } } : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } };
      stream = await navigator.mediaDevices.getUserMedia({ video, audio: true })
        .catch(() => navigator.mediaDevices.getUserMedia({ video, audio: false }))
        .catch(() => navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false }));
      if (!alive) return stopStream();
      // Reset any digital zoom to 1× (some Android phones remember a zoom level).
      const track = stream.getVideoTracks()[0];
      try { const cap = track.getCapabilities?.(); if (cap && cap.zoom) await track.applyConstraints({ advanced: [{ zoom: cap.zoom.min }] }); } catch {}
      v.srcObject = stream; await v.play().catch(() => {}); msg.hidden = true;
      const fit = () => { if (!v.videoWidth) return; const portrait = v.videoHeight > v.videoWidth; host.classList.toggle('cam-landscape-frame', !portrait); };
      v.onloadedmetadata = fit; v.onresize = fit; fit();
    } catch (e) {
      msg.hidden = false; msg.innerHTML = `<b>Allow camera access to shoot in Shukr.</b><span>Or use <em>Upload</em> below.</span><button class="cam-retry">Try again</button>`;
      $('.cam-retry', msg).onclick = startCamera;
    }
  }
  function takePhoto() {
    const v = $('.cam-view', host); if (!v?.videoWidth) return;
    // Crop to the visible (cover-fitted) area so the photo matches the full-screen preview.
    const vw = v.videoWidth, vh = v.videoHeight, ar = v.clientWidth / Math.max(1, v.clientHeight); let sw = vw, sh2 = vh;
    if (facing !== 'user') { if (vw / vh > ar) sw = Math.round(vh * ar); else sh2 = Math.round(vw / ar); }
    const sx = (vw - sw) / 2, sy = (vh - sh2) / 2;
    const c = document.createElement('canvas'); c.width = sw; c.height = sh2; const g = c.getContext('2d');
    if (facing === 'user') { g.translate(c.width, 0); g.scale(-1, 1); }
    if (torch && facing === 'user') { host.classList.add('selfie-flash'); setTimeout(() => host.classList.remove('selfie-flash'), 400); }
    g.drawImage(v, sx, sy, sw, sh2, 0, 0, sw, sh2); if (camFilter !== 'normal') { const d = g.getImageData(0, 0, c.width, c.height); FX.applyPixels(d, FX.build(camFilter, 100, {})); g.putImageData(d, 0, 0); }
    host.classList.add('flash'); setTimeout(() => host.classList.remove('flash'), 180);
    c.toBlob(b => { if (b) addFiles([new File([b], 'photo.jpg', { type: 'image/jpeg' })]); }, 'image/jpeg', .9);
  }
  function startRecording() {
    holdTimer = null; if (!stream || !window.MediaRecorder) return toast('Video recording isn’t supported here — use Upload.');
    const type = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
    try { recorder = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 4e6 } : undefined); } catch { recorder = null; return toast('Couldn’t start recording.'); }
    chunks = []; recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => { const mime = (recorder?.mimeType || type || 'video/webm').split(';')[0]; const blob = new Blob(chunks, { type: mime }); recorder = null; if (blob.size > 1000) addFiles([new File([blob], 'video.' + (mime.includes('mp4') ? 'mp4' : 'webm'), { type: mime })], camFilter); };
    recorder.start(250); recStart = Date.now(); host.classList.add('recording');
    const t = $('.cam-timer', host); t.hidden = false;
    recTimer = setInterval(() => { const ms = Date.now() - recStart, s = Math.floor(ms / 1000); t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; host.style.setProperty('--rec', Math.min(1, ms / MAX_VIDEO_MS)); if (ms >= MAX_VIDEO_MS) stopRecording(); }, 100);
  }
  function stopRecording() { clearInterval(recTimer); host.classList.remove('recording'); const t = $('.cam-timer', host); if (t) t.hidden = true; host.style.removeProperty('--rec'); if (recorder && recorder.state !== 'inactive') recorder.stop(); }

  async function addFiles(files, preFilter) {
    for (const f of files) {
      if (!/^(image|video)\//.test(f.type)) { toast('Only photos and videos can be posted.'); continue; }
      const isVideo = f.type.startsWith('video/');
      if (isVideo && (items.length || files.length > 1)) { toast('Post one video at a time.'); if (items.length) continue; }
      if (!isVideo && items.some(i => i.video)) { toast('Post one video at a time, or up to 10 photos.'); continue; }
      if (items.length >= 10) { toast('Up to 10 photos per post.'); break; }
      const meta = await readMeta(f);
      if (isVideo && meta.duration && meta.duration > 180000) { URL.revokeObjectURL(meta.url); toast('Videos can be up to 3 minutes.'); continue; }
      const it = { file: f, meta, video: isVideo }; if (isVideo && preFilter && preFilter !== 'normal') it.edit = { ...defaultEdit(), filter: preFilter }; items.push(it);
      if (isVideo) break;
    }
    if (items.length) { stopStream(); const r = await openEditor(items, 0); if (!r) { items.forEach(i => URL.revokeObjectURL(i.meta.url)); items = []; cameraUI(); return; } editUI(); }
  }  // Picked up from the phone share sheet (other apps → Shukr).
  if (query?.get('shared') && 'caches' in window) { (async () => { try { const cc = await caches.open('share-inbox'); const keys = await cc.keys(); const fs = [];
    for (const k of keys) { const r = await cc.match(k); const b = await r.blob(); fs.push(new File([b], decodeURIComponent(r.headers.get('X-Name') || 'shared'), { type: b.type })); }
    await Promise.all(keys.map(k => cc.delete(k))); if (fs.length) await addFiles(fs); else if (query.get('text')) toast('Shared links can’t be reposted — save the video to your phone, then share the file to Shukr.'); } catch {} })(); }


  function editUI() {
    const first = items[0];
    host.innerHTML = `<div class="create-edit">
      <header class="cam-top solid"><button class="cam-icon" data-back aria-label="Back to camera">${I.back}</button><b>${kind === 'story' ? 'New story' : 'New post'}</b><span></span></header>
      <div class="create-body">
        <div class="create-preview">${first.video ? `<video src="${escAttr(first.meta.url)}" playsinline muted loop autoplay class="cp-vid"></video>` : `<div class="create-strip">${items.map((it, i) => `<div class="create-thumb" data-ei="${i}"><img src="${escAttr(it.preview || it.meta.url)}" alt="">${it.edited ? '<i class="cp-edited">Edited</i>' : ''}<button data-remove="${i}" aria-label="Remove photo">${I.x}</button></div>`).join('')}${items.length < 10 ? `<label class="create-add" aria-label="Add more photos">${I.plus}<input type="file" accept="image/*" multiple hidden data-more></label>` : ''}</div>`}
          <button class="cp-edit" data-reedit>${'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>'} Edit</button>
          ${first.edit?.audio?.sound ? `<span class="create-badge">♪ ${esc(first.edit.audio.sound.title)}</span>` : ''}<span class="create-badge">${first.video ? `${I.play} Video${first.meta.duration ? ' · ' + Math.round(first.meta.duration / 1000) + 's' : ''}` : items.length > 1 ? `${items.length} photos · carousel` : 'Photo'}</span></div>
        <textarea class="create-caption" maxlength="2200" rows="4" placeholder="Write a caption… share a reminder, a lesson, a moment of shukr."></textarea>
        <div class="create-label">Topic</div>
        <div class="chips wrap create-topics">${TOPICS.map(([v, l], i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-topic="${v}">${esc(l)}</button>`).join('')}</div>
        <div class="tag-row"><button type="button" class="opt" id="tagBtn"><span class="e">${I.tag||"@"}</span><div>Tag people<small id="tagList">Nobody tagged</small></div></button></div>
        <div class="seg create-kind"><button data-kind="post" class="${kind === 'post' ? 'on' : ''}">Post to feed</button><button data-kind="story" class="${kind === 'story' ? 'on' : ''}">Story · 24h</button></div>
        <label class="create-rights"><input type="checkbox" data-rights> <span>This is my own photo/video (or I have permission), and it follows the community guidelines.</span></label>
        <div class="create-progress" hidden><div><i></i></div><span>Uploading…</span></div>
        <p class="err" role="alert"></p>
      </div>
      <footer class="create-foot"><button class="btn ghost" data-back>Retake</button><button class="btn accent" data-post>${I.send || ''} ${kind === 'story' ? 'Share story' : 'Post'}</button></footer>
    </div>`;
    let topic = 'wellbeing';
    // photo previews with edits baked in; video preview with live filter
    (async () => { for (const it of items) if (!it.video && it.edited) { try { const r = await exportPhoto(it); it.preview && URL.revokeObjectURL(it.preview); it.preview = URL.createObjectURL(r.file); it.exported = r; const im = $(`[data-ei="${items.indexOf(it)}"] img`, host); if (im) im.src = it.preview; } catch {} } })();
    if (first.video && first.edit && first.edit.filter !== 'normal') { const v = $('.cp-vid', host); const fx = FX.build(first.edit.filter, first.edit.strength, first.edit.adjust); v.style.filter = `saturate(${1 + (first.edit.adjust.sat || 0) / 100}) brightness(${1 + (first.edit.adjust.bri || 0) / 200})`; void fx; }
    $('[data-reedit]', host).onclick = async () => { const cap = $('.create-caption', host).value; const r = await openEditor(items, 0); if (r) { items.forEach(i => { i.exported = null; }); editUI(); const c2 = $('.create-caption', host); if (c2) c2.value = cap; } };
    $$('[data-ei]', host).forEach(t => t.querySelector('img').onclick = async () => { const cap = $('.create-caption', host).value; const r = await openEditor(items, +t.dataset.ei); if (r) { items.forEach(i => { i.exported = null; }); editUI(); const c2 = $('.create-caption', host); if (c2) c2.value = cap; } });
    $$('[data-back]', host).forEach(b => b.onclick = () => { items.forEach(i => URL.revokeObjectURL(i.meta.url)); items = []; cameraUI(); });
    $$('[data-topic]', host).forEach(b => b.onclick = () => { topic = b.dataset.topic; $$('[data-topic]', host).forEach(x => x.classList.toggle('on', x === b)); });
    let tags = [];
    $('#tagBtn', host).onclick = () => sheet(`<h3>Tag people</h3><input class="input" id="tq" placeholder="Search username or name" autocomplete="off"><div id="tr"></div><div id="tsel" class="chips wrap" style="margin-top:8px"></div><button class="btn accent block" data-close style="margin-top:10px">Done</button>`, (sh, close) => {
      const sel = () => { $('#tsel', sh).innerHTML = tags.map(t => `<button class="chip on" data-un="${escAttr(t)}">@${esc(t)} ✕</button>`).join(''); $$('[data-un]', sh).forEach(b => b.onclick = () => { tags = tags.filter(x => x !== b.dataset.un); sel(); }); $('#tagList', host).textContent = tags.length ? tags.map(t => '@' + t).join(', ') : 'Nobody tagged'; };
      let t; $('#tq', sh).oninput = e => { clearTimeout(t); t = setTimeout(async () => { const v = e.target.value.trim(); if (!v) { $('#tr', sh).innerHTML = ''; return; } const d = await api('/search/people?q=' + encodeURIComponent(v)).catch(() => ({ users: [] }));
        $('#tr', sh).innerHTML = d.users.slice(0, 8).map(u => `<button class="opt" data-tg="${escAttr(u.username)}"><span class="e">@</span><div>${esc(u.username)}<small>${esc(u.name || '')}</small></div></button>`).join('');
        $$('[data-tg]', sh).forEach(b => b.onclick = () => { if (!tags.includes(b.dataset.tg) && tags.length < 20) tags.push(b.dataset.tg); sel(); }); }, 220); };
      sel(); $('[data-close]', sh).onclick = close; });
    $$('[data-kind]', host).forEach(b => b.onclick = () => { kind = b.dataset.kind; $$('[data-kind]', host).forEach(x => x.classList.toggle('on', x === b)); $('[data-post]', host).innerHTML = `${I.send || ''} ${kind === 'story' ? 'Share story' : 'Post'}`; $('.cam-top b', host).textContent = kind === 'story' ? 'New story' : 'New post'; });
    $$('[data-remove]', host).forEach(b => b.onclick = () => { const [it] = items.splice(+b.dataset.remove, 1); URL.revokeObjectURL(it.meta.url); if (items.length) editUI(); else cameraUI(); });
    const more = $('[data-more]', host); if (more) more.onchange = () => { const files = [...more.files]; more.value = ''; const caption = $('.create-caption', host).value; addFiles(files).then(() => { const c = $('.create-caption', host); if (c) c.value = caption; }); };
    $('[data-post]', host).onclick = async () => {
      const btn = $('[data-post]', host), errEl = $('.err', host), prog = $('.create-progress', host), bar = $('.create-progress i', host), label = $('.create-progress span', host);
      errEl.textContent = '';
      if (!$('[data-rights]', host).checked) { errEl.textContent = 'Please confirm this is your own content.'; return; }
      btn.disabled = true; prog.hidden = false; let wake = null; try { wake = await navigator.wakeLock?.request('screen'); } catch {}
      try {
        const ids = []; let posterId = null; const total = items.length;
        const photoSound = !items[0].video && items[0].edit?.audio?.sound ? items[0].edit.audio : null;
        for (let i = 0; i < total; i++) {
          const it = items[i]; label.textContent = total > 1 ? `Uploading ${i + 1} of ${total}…` : 'Uploading…';
          if (it.video && it.edited) { // server renders the edit
            const r = await exportVideo(it, () => upload(it.file, it.meta, p => { bar.style.width = (60 * p).toFixed(1) + '%'; }), s => { label.textContent = s; if (/Render/.test(s)) bar.style.width = '75%'; });
            ids.push(r.media.id); posterId = r.poster?.id || null; continue; }
          let blob = it.file, meta = it.meta;
          if (!it.video && it.edited) { const r = it.exported || await exportPhoto(it); blob = r.file; meta = r.meta; }
          else if (!it.video) blob = await shrinkImage(it.file, it.meta);
          const m = it.video && it.uploaded ? it.uploaded : await upload(blob, meta, p => { bar.style.width = ((photoSound ? 60 : 100) * (i + p) / total).toFixed(1) + '%'; });
          ids.push(m.id);
          if (it.video && it.meta.poster) { try { posterId = (await upload(new File([it.meta.poster], 'poster.jpg', { type: 'image/jpeg' }), {})).id; } catch {} }
        }
        if (photoSound) { label.textContent = 'Adding your sound…'; bar.style.width = '70%';
          const r = await renderJob('/video/photos', { mediaIds: ids, sound: photoSound.sound, nasheedId: photoSound.nasheedId, volume: photoSound.music }, st => { label.textContent = st.replace('your edit', 'your video'); });
          ids.length = 0; ids.push(r.media.id); posterId = r.poster?.id || null; }
        label.textContent = 'Publishing…'; bar.style.width = '100%';
        const caption = $('.create-caption', host).value.trim();
        const r = await api('/social/posts', { body: { mediaIds: ids, posterId, caption, topic, kind, tags, rightsConfirmed: true } });
        toast(kind === 'story' ? 'Story shared' : 'Posted!');
        go(kind === 'story' ? '/stories' : '/fyp?post=' + encodeURIComponent(r.publication.id));
      } catch (e) { errEl.textContent = e.message; btn.disabled = false; prog.hidden = true; bar.style.width = '0'; }
      finally { try { wake?.release(); } catch {} }
    };
  }
  cameraUI();
}
