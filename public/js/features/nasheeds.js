// Nasheeds: listen to official vocals-only / duff-only nasheeds (played from the artists' own channels via the
// privacy-enhanced YouTube embed — artists keep the views and rights; nothing is re-hosted). Plus Shukr's library.
import { $, $$, esc, escAttr, I, api, toast, vibrate, shell, LS, onCleanup, loadingHTML } from '../core.js';

const CATS = [['all', 'All'], ['fav', 'Favourites'], ['prophet', 'Prophet ﷺ'], ['allah', 'Allah & du‘a'], ['ramadan', 'Ramadan & Eid'], ['duff', 'With duff'], ['kids', 'Kids'], ['life', 'Life & hope'], ['library', 'Shukr library']];
const LANGS = [['', 'Any language'], ['en', 'English'], ['ar', 'Arabic'], ['ur', 'Urdu'], ['tr', 'Turkish'], ['ms', 'Malay']];
const fmt = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const thumb = id => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
let YTP = null;
const loadYT = () => YTP ||= new Promise(res => {
  if (window.YT?.Player) return res(window.YT);
  window.onYouTubeIframeAPIReady = () => res(window.YT);
  const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.onerror = () => res(null); document.head.appendChild(s);
});

export async function viewNasheeds(q) {
  const p = shell('Nasheeds'); p.classList.add('ns-page');
  p.innerHTML = loadingHTML();
  let data, lib = [];
  try { data = await (await fetch('/data/nasheeds.json', { cache: 'force-cache' })).json(); } catch { data = { tracks: [] }; }
  try { lib = ((await api('/sounds?cat=nasheeds')).sounds || []).map(s => ({ lib: true, id: s.id, t: s.title, a: s.artist || 'Shukr library', d: s.duration || 0, url: s.url, tags: ['library'], license: s.license })); } catch {}
  const all = data.tracks;
  let errs = 0, cat = q?.get('cat') || 'all', lang = '', term = '', queue = [], qi = -1, shuffle = false, player = null, audio = null, tick = null;
  const favs = new Set(LS.get('ns.favs', []));
  const recent = LS.get('ns.recent', []);
  const saveFav = () => LS.set('ns.favs', [...favs]);
  const list = () => {
    let L = cat === 'library' ? lib : cat === 'fav' ? [...all, ...lib].filter(t => favs.has(t.id)) : cat === 'duff' ? all.filter(t => t.duff || /aqib farid/i.test(t.a)) : cat === 'all' ? all : all.filter(t => t.tags.includes(cat));
    if (lang && cat !== 'library') L = L.filter(t => t.lang === lang);
    if (term) { const s = term.toLowerCase(); L = [...all, ...lib].filter(t => (t.t + ' ' + t.a).toLowerCase().includes(s)); }
    return L;
  };
  const artists = (() => { const m = new Map(); for (const t of all) { const a = t.a.split(/ & | x | ft\.? | feat\.? /i)[0].trim(); m.set(a, (m.get(a) || 0) + (t.v || 0)); } return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([a]) => a); })();

  p.innerHTML = `<div class="ns-hero"><div class="ns-badge">${I.mic} Vocals & duff only</div><h2>Nasheeds</h2><p>${all.length} nasheeds from the artists + ${lib.length} in the Shukr library — no musical instruments. Official vocals-only versions from the artists themselves.</p>
      <div class="ns-search"><span>${I.search}</span><input id="nsQ" placeholder="Search nasheeds or artists" autocomplete="off"></div></div>
    <div class="chips ns-cats">${CATS.map(([k, l]) => `<button class="chip ${k === cat ? 'on' : ''}" data-cat="${k}">${esc(l)}</button>`).join('')}</div>
    <div class="row ns-tools"><select class="input sm" id="nsLang">${LANGS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><button class="btn sm ghost" id="nsShuf">${I.shuffle || I.refresh || '⤮'} Shuffle all</button></div>
    <div id="nsRecent"></div>
    <h3 class="ns-h">Artists</h3><div class="ns-artists">${artists.map(a => `<button class="ns-art" data-art="${escAttr(a)}"><span>${esc(a.split(' ').map(w => w[0]).join('').slice(0, 2))}</span><b>${esc(a)}</b></button>`).join('')}</div>
    <h3 class="ns-h" id="nsTitle">All nasheeds</h3><div id="nsList" class="ns-list"></div>
    <p class="faint small" style="text-align:center;margin:14px 8px 120px">Played from each artist’s official channel. Shukr library tracks are free-licensed and credited on the credits page.</p>
    <div class="ns-player hidden" id="nsPlayer"><div class="ns-embed" id="nsEmbed"><div id="nsYT"></div></div>
      <div class="ns-pbar"><i id="nsProg"></i></div>
      <div class="ns-prow"><img id="nsArt" alt=""><div class="grow ns-pmeta"><b id="nsPT"></b><small id="nsPA"></small></div>
        <button class="iconbtn" id="nsFav" aria-label="Favourite">${I.heart}</button><button class="iconbtn" id="nsPrev" aria-label="Previous">${I.back}</button><button class="ns-play" id="nsPlay" aria-label="Play">${I.play}</button><button class="iconbtn ns-next" id="nsNext" aria-label="Next">${I.back}</button><button class="iconbtn" id="nsVid" aria-label="Show video">${I.eye || I.expand || I.image || I.play}</button></div></div>`;

  const row = (t, i) => `<button class="ns-row ${queue[qi]?.id === t.id ? 'on' : ''}" data-i="${i}">${t.lib ? `<span class="ns-thumb lib">${I.mic}</span>` : `<img class="ns-thumb" loading="lazy" src="${thumb(t.id)}" alt="">`}
      <div class="grow"><b>${esc(t.t)}</b><small>${esc(t.a)}${t.duff ? ' · duff' : ''}${t.d ? ' · ' + fmt(t.d) : ''}</small></div>${favs.has(t.id) ? `<span class="ns-fv">${I.heart}</span>` : ''}</button>`;
  let shown = [];
  const draw = () => {
    shown = list();
    $('#nsTitle').textContent = term ? `Results for “${term}”` : (CATS.find(c => c[0] === cat)?.[1] || 'Nasheeds') + ` · ${shown.length}`;
    $('#nsList').innerHTML = shown.length ? shown.slice(0, 300).map(row).join('') : `<div class="empty"><p class="muted">${cat === 'fav' ? 'Tap ♥ on the player to save favourites.' : 'Nothing found.'}</p></div>`;
    $$('#nsList [data-i]').forEach(b => b.onclick = () => playList(shown, +b.dataset.i));
    const rc = recent.map(id => [...all, ...lib].find(t => t.id === id)).filter(Boolean).slice(0, 10);
    $('#nsRecent').innerHTML = rc.length && !term && cat === 'all' ? `<h3 class="ns-h">Recently played</h3><div class="ns-recent">${rc.map((t, i) => `<button class="ns-rc" data-rc="${i}">${t.lib ? `<span class="ns-thumb lib">${I.mic}</span>` : `<img loading="lazy" src="${thumb(t.id)}" alt="">`}<b>${esc(t.t)}</b><small>${esc(t.a)}</small></button>`).join('')}</div>` : '';
    $$('[data-rc]').forEach(b => b.onclick = () => playList(rc, +b.dataset.rc));
  };
  const setPlayIcon = playing => { const b = $('#nsPlay'); if (b) b.innerHTML = playing ? I.pause : I.play; };
  const stopAll = () => { clearInterval(tick); if (audio) { audio.pause(); audio = null; } try { player?.pauseVideo?.(); } catch {} };
  async function playAt(i) {
    if (!queue.length) return; qi = (i + queue.length) % queue.length; const t = queue[qi]; stopAll();
    const P = $('#nsPlayer'); P.classList.remove('hidden'); document.documentElement.classList.add('ns-on');
    $('#nsPT').textContent = t.t; $('#nsPA').textContent = t.a; $('#nsArt').src = t.lib ? '/icons/icon-192.png' : thumb(t.id);
    $('#nsFav').classList.toggle('on', favs.has(t.id)); $('#nsProg').style.width = '0%';
    const r = recent.filter(x => x !== t.id); r.unshift(t.id); recent.splice(0, recent.length, ...r.slice(0, 20)); LS.set('ns.recent', recent);
    $$('#nsList .ns-row').forEach(b => b.classList.toggle('on', shown[+b.dataset.i]?.id === t.id));
    if ('mediaSession' in navigator) { navigator.mediaSession.metadata = new MediaMetadata({ title: t.t, artist: t.a, album: 'Shukr · Nasheeds', artwork: [{ src: t.lib ? '/icons/icon-512.png' : `https://i.ytimg.com/vi/${t.id}/hqdefault.jpg`, sizes: '480x360' }] });
      navigator.mediaSession.setActionHandler('nexttrack', () => next()); navigator.mediaSession.setActionHandler('previoustrack', () => playAt(qi - 1)); }
    if (t.lib) {
      $('#nsEmbed').classList.add('hidden');
      audio = new Audio(t.url); audio.onended = () => next(); audio.play().then(() => setPlayIcon(true)).catch(() => setPlayIcon(false));
      tick = setInterval(() => { if (audio?.duration) $('#nsProg').style.width = (audio.currentTime / audio.duration * 100) + '%'; }, 500);
      return;
    }
    $('#nsEmbed').classList.remove('hidden');
    const YT = await loadYT();
    if (!YT) { toast('Couldn’t load the player — check your connection'); return; }
    if (!player) {
      player = await new Promise(res => { const pl = new YT.Player('nsYT', { host: 'https://www.youtube-nocookie.com', videoId: t.id, playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, controls: 1 },
        events: { onReady: () => res(pl), onStateChange: e => { setPlayIcon(e.data === 1); if (e.data === 1) errs = 0; if (e.data === 0) next(); },
          onError: () => { const cur = queue[qi]; if (++errs <= 3) { toast('This one can’t play here — skipping'); setTimeout(next, 600); } else { errs = 0; toast('Playback is blocked on this network'); if (cur) window.open('https://www.youtube.com/watch?v=' + cur.id, '_blank', 'noopener'); } } } }); });
      try { player.playVideo(); } catch {}
    } else player.loadVideoById(t.id);
    tick = setInterval(() => { try { const d = player.getDuration(), c = player.getCurrentTime(); if (d) $('#nsProg').style.width = (c / d * 100) + '%'; } catch {} }, 700);
  }
  const next = () => { if (shuffle && queue.length > 1) { let n; do n = Math.floor(Math.random() * queue.length); while (n === qi); playAt(n); } else playAt(qi + 1); };
  function playList(L, i) { queue = L.slice(); shuffle = false; vibrate(8); playAt(i); }
  onCleanup(() => { stopAll(); try { player?.destroy?.(); } catch {} document.documentElement.classList.remove('ns-on'); });

  $$('[data-cat]').forEach(b => b.onclick = () => { cat = b.dataset.cat; term = ''; $('#nsQ').value = ''; $$('[data-cat]').forEach(x => x.classList.toggle('on', x === b)); draw(); });
  $$('[data-art]').forEach(b => b.onclick = () => { term = b.dataset.art; $('#nsQ').value = term; draw(); $('#nsTitle').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  let st; $('#nsQ').oninput = e => { clearTimeout(st); st = setTimeout(() => { term = e.target.value.trim(); draw(); }, 200); };
  $('#nsLang').onchange = e => { lang = e.target.value; draw(); };
  $('#nsShuf').onclick = () => { queue = list().slice(); if (!queue.length) return; shuffle = true; playAt(Math.floor(Math.random() * queue.length)); toast('Shuffling ' + queue.length + ' nasheeds'); };
  $('#nsPlay').onclick = () => { if (audio) { audio.paused ? audio.play().then(() => setPlayIcon(true)) : (audio.pause(), setPlayIcon(false)); return; } try { player.getPlayerState() === 1 ? player.pauseVideo() : player.playVideo(); } catch {} };
  $('#nsNext').onclick = () => next(); $('#nsPrev').onclick = () => playAt(qi - 1);
  $('#nsFav').onclick = () => { const t = queue[qi]; if (!t) return; favs.has(t.id) ? favs.delete(t.id) : favs.add(t.id); saveFav(); $('#nsFav').classList.toggle('on', favs.has(t.id)); vibrate(10); toast(favs.has(t.id) ? 'Added to favourites' : 'Removed from favourites'); if (cat === 'fav') draw(); };
  $('#nsVid').onclick = () => $('#nsPlayer').classList.toggle('big');
  draw();
}

export const routes = [[/^\/nasheeds$/, (m, q) => viewNasheeds(q), 'nasheeds']];
