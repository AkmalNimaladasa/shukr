// Audio: AI nasheed studio — voice only, no musical instruments.
import { $, $$, esc, escAttr, I, api, toast, shell, onCleanup } from './core.js';

const VOICE_LABEL = { deep: 'Deep', warm: 'Warm', bright: 'Bright', soft: 'Soft', storyteller: 'Storyteller', clear: 'Clear' };
const MOODS = ['Peaceful', 'Hopeful', 'Joyful', 'Longing', 'Reflective', 'Uplifting'];
const IDEAS = ['Gratitude for small blessings', 'Love for the Prophet ﷺ', 'Patience in hard times', 'Ramadan nights', 'Missing a loved one who passed', 'My mother’s du’a', 'The beauty of salah', 'Hope in Allah’s mercy'];
const fmt = ms => { const s = Math.round((ms || 0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export async function viewAudio() {
  const p = shell('Audio'); p.classList.add('au-page');
  let opts = { voices: Object.keys(VOICE_LABEL), styles: ['Soft & reflective'] }; try { opts = await api('/audio/options'); } catch {}
  const st = { title: '', lines: [], voice: 'deep', style: opts.styles[0], mood: 'Peaceful' };
  let player = null; onCleanup(() => player && player.pause());
  p.innerHTML = `<div class="au-hero"><div class="au-badge">${I.mic} Voice only · no instruments</div><h2>Create a nasheed</h2><p>Describe it, let Alim write the words, then choose voices. Everything you hear is made from the human voice — harmonies, humming and echo.</p></div>
    <div class="card"><label class="lbl">What should it be about?</label><textarea class="input" id="th" rows="2" maxlength="300" placeholder="e.g. gratitude for my parents"></textarea>
      <div class="chips wrap au-ideas">${IDEAS.map(x => `<button class="chip" data-idea="${escAttr(x)}">${esc(x)}</button>`).join('')}</div>
      <div class="grid2"><div><label class="lbl">Mood</label><select class="input" id="md">${MOODS.map(m => `<option>${m}</option>`).join('')}</select></div><div><label class="lbl">Language</label><select class="input" id="lg">${['English', 'Arabic', 'Urdu', 'Malay', 'Indonesian', 'Turkish', 'French', 'Bengali', 'Sinhala', 'Tamil'].map(l => `<option>${l}</option>`).join('')}</select></div></div>
      <button class="btn accent block" id="wr">${I.sparkle || I.star} Write lyrics</button><p class="err" id="werr"></p></div>
    <div class="card" id="lyc" hidden><div class="row between"><input class="input au-title" id="tt" maxlength="80"><button class="iconbtn sm" id="rw" aria-label="Rewrite">${I.repeat}</button></div>
      <p class="faint small" id="note"></p><div id="ly"></div><button class="btn ghost sm" id="al">+ Add line</button></div>
    <div class="card" id="vc" hidden><h3>Voices</h3><div class="au-voices">${opts.voices.map(v => `<button class="au-v ${v === st.voice ? 'on' : ''}" data-v="${v}">${VOICE_LABEL[v] || v}</button>`).join('')}</div>
      <h3 style="margin-top:12px">Style</h3><div class="au-styles">${opts.styles.map(s => `<button class="au-s ${s === st.style ? 'on' : ''}" data-s="${escAttr(s)}">${esc(s)}</button>`).join('')}</div>
      <button class="btn accent block" style="margin-top:14px" id="mk">${I.mic} Create nasheed</button><p class="faint small" style="text-align:center">Takes about 15–40 seconds.</p><p class="err" id="merr"></p></div>
    <div id="res"></div>
    <h3 class="au-h">My nasheeds</h3><div id="mine"><div class="loading"><span class="spin"></span></div></div>`;
  const drawLines = () => {
    $('#ly', p).innerHTML = st.lines.map((l, i) => `<div class="au-line ${l.part}"><span class="au-part">${l.part === 'chorus' ? 'Chorus' : 'Verse'}</span><input class="input" data-i="${i}" value="${escAttr(l.text)}" maxlength="120"><button class="iconbtn sm" data-rm="${i}" aria-label="Remove">${I.x}</button></div>`).join('');
    $$('[data-i]', p).forEach(inp => inp.oninput = () => st.lines[+inp.dataset.i].text = inp.value);
    $$('[data-rm]', p).forEach(b => b.onclick = () => { st.lines.splice(+b.dataset.rm, 1); drawLines(); });
  };
  $$('[data-idea]', p).forEach(b => b.onclick = () => { $('#th', p).value = b.dataset.idea; });
  const write = async () => {
    const b = $('#wr', p); b.disabled = true; b.innerHTML = '<span class="spin"></span> Writing…'; $('#werr', p).textContent = '';
    try { const r = await api('/audio/lyrics', { body: { theme: $('#th', p).value, mood: $('#md', p).value, language: $('#lg', p).value } });
      st.title = r.title; st.lines = r.lines; $('#tt', p).value = r.title; $('#note', p).textContent = r.note || ''; drawLines(); $('#lyc', p).hidden = false; $('#vc', p).hidden = false; $('#lyc', p).scrollIntoView({ behavior: 'smooth' }); }
    catch (e) { $('#werr', p).textContent = e.message; }
    b.disabled = false; b.innerHTML = `${I.sparkle || I.star} Write lyrics`;
  };
  $('#wr', p).onclick = write; $('#rw', p).onclick = write;
  $('#tt', p).oninput = e => st.title = e.target.value;
  $('#al', p).onclick = () => { st.lines.push({ part: 'verse', text: '' }); drawLines(); };
  $$('[data-v]', p).forEach(b => b.onclick = () => { st.voice = b.dataset.v; $$('[data-v]', p).forEach(x => x.classList.toggle('on', x === b)); });
  $$('[data-s]', p).forEach(b => b.onclick = () => { st.style = b.dataset.s; $$('[data-s]', p).forEach(x => x.classList.toggle('on', x === b)); });
  $('#mk', p).onclick = async () => {
    const b = $('#mk', p); b.disabled = true; $('#merr', p).textContent = ''; const steps = ['Recording the lead voice…', 'Adding harmonies…', 'Humming the drone…', 'Mixing in the masjid…', 'Almost ready…']; let si = 0; b.innerHTML = '<span class="spin"></span> ' + steps[0]; const tk = setInterval(() => { si = Math.min(steps.length - 1, si + 1); b.innerHTML = '<span class="spin"></span> ' + steps[si]; }, 6000);
    try { const r = await api('/audio/render', { body: { title: st.title, lines: st.lines.filter(l => l.text.trim()), voice: st.voice, style: st.style } });
      $('#res', p).innerHTML = trackHTML(r.nasheed, true); bindTracks($('#res', p)); $('#res', p).scrollIntoView({ behavior: 'smooth' }); loadMine(); }
    catch (e) { $('#merr', p).textContent = e.message || 'Something went wrong — please try again.'; }
    clearInterval(tk);
    b.disabled = false; b.innerHTML = `${I.mic} Create nasheed`;
  };
  function trackHTML(n, fresh) {
    return `<div class="au-track ${fresh ? 'fresh' : ''}" data-id="${n.id}"><button class="au-play" data-url="${escAttr(n.url)}" aria-label="Play">${I.play}</button>
      <div class="grow"><b>${esc(n.title)}</b><small>${fmt(n.durationMs || n.duration_ms)} · ${esc(VOICE_LABEL[(n.settings || n).voice] || '')} · ${esc((n.settings || n).style || '')}</small><div class="au-bar"><i></i></div></div>
      <a class="iconbtn sm" href="${escAttr(n.url)}" download="${escAttr(n.title)}.mp3" aria-label="Download">${I.download || '⤓'}</a><button class="iconbtn sm" data-del="${n.id}" aria-label="Delete">${I.trash}</button></div>`;
  }
  function bindTracks(box) {
    $$('.au-play', box).forEach(b => b.onclick = () => {
      if (player && player._btn === b && !player.paused) { player.pause(); return; }
      if (player) { player.pause(); player._btn.innerHTML = I.play; }
      player = new Audio(b.dataset.url); player._btn = b; b.innerHTML = I.pause || '❚❚';
      const bar = b.closest('.au-track').querySelector('.au-bar i');
      player.ontimeupdate = () => { if (player.duration) bar.style.width = (100 * player.currentTime / player.duration) + '%'; };
      player.onended = player.onpause = () => { b.innerHTML = I.play; };
      player.onplay = () => { b.innerHTML = I.pause || '❚❚'; };
      player.play().catch(() => toast('Tap play again to listen'));
    });
    $$('[data-del]', box).forEach(b => b.onclick = async () => { if (!confirm('Delete this nasheed?')) return; await api('/audio/' + b.dataset.del, { method: 'DELETE' }); b.closest('.au-track').remove(); toast('Deleted'); });
  }
  async function loadMine() { try { const { nasheeds } = await api('/audio/mine'); const box = $('#mine', p); if (!box) return; box.innerHTML = nasheeds.length ? nasheeds.map(n => trackHTML(n)).join('') : '<p class="faint small">Your nasheeds will appear here.</p>'; bindTracks(box); } catch {} }
  loadMine();
}
