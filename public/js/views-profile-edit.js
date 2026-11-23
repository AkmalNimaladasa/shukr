// Full-screen "Edit profile" and "Settings and privacy" (TikTok / Instagram style).
import { $, $$, esc, escAttr, I, api, state, toast, shell, go, sheet, onCleanup } from './core.js';

const PRONOUNS = ['', 'she/her', 'he/him', 'they/them'];
const SCOPE_LABEL = { everyone: 'Everyone', followers: 'Followers', mutual: 'Friends (mutual follows)', nobody: 'No one' };
const GENDER_LABEL = { '': 'Not set', female: 'Female', male: 'Male', prefer_not: 'Prefer not to say' };
const chev = '<svg class="ep-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m9 6 6 6-6 6"/></svg>';
const initial = pr => esc((pr.name || pr.username || '?')[0].toUpperCase());

async function loadMe() { return (await api('/social/profile')).profile; }

// Generic one-field editor screen (Instagram pattern: tap a row → its own page with Save).
function fieldPage({ title, value = '', max = 30, multiline = false, hint = '', type = 'text', placeholder = '', check, save }) {
  return new Promise(done => {
    sheet(`<div class="ep-field"><div class="ep-field-top"><button class="ep-x" data-cancel aria-label="Cancel">Cancel</button><b>${esc(title)}</b><button class="ep-save" data-save>Save</button></div>
      ${multiline ? `<textarea class="input ep-input" rows="5" maxlength="${max}" placeholder="${escAttr(placeholder)}">${esc(value)}</textarea>` : `<input class="input ep-input" type="${type}" maxlength="${max}" value="${escAttr(value)}" placeholder="${escAttr(placeholder)}" autocapitalize="${type === 'text' && title === 'Username' ? 'off' : 'sentences'}" spellcheck="${title === 'Username' ? 'false' : 'true'}">`}
      <div class="ep-meta"><span class="ep-hint">${esc(hint)}</span>${type === 'text' || multiline ? `<span class="ep-count"></span>` : ''}</div><p class="err"></p></div>`, (sh, close) => {
      const inp = $('.ep-input', sh), cnt = $('.ep-count', sh), hintEl = $('.ep-hint', sh);
      const upd = () => { if (cnt) cnt.textContent = `${[...inp.value].length}/${max}`; };
      let t; inp.oninput = () => { upd(); if (check) { clearTimeout(t); t = setTimeout(async () => { const r = await check(inp.value); if (r) { hintEl.textContent = r.text; hintEl.className = 'ep-hint ' + (r.ok ? 'ok' : 'bad'); } }, 300); } };
      upd(); setTimeout(() => { inp.focus(); try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch {} }, 60);
      $('[data-cancel]', sh).onclick = () => { close(); done(false); };
      $('[data-save]', sh).onclick = async () => { const b = $('[data-save]', sh); b.disabled = true; try { await save(inp.value); close(); done(true); } catch (e) { $('.err', sh).textContent = e.message; b.disabled = false; } };
    });
  });
}

function choicePage({ title, value, options, save, note = '' }) {
  sheet(`<h3>${esc(title)}</h3>${note ? `<p class="muted small">${esc(note)}</p>` : ''}<div class="ep-choices">${options.map(([v, l]) => `<button class="ep-choice ${v === value ? 'on' : ''}" data-v="${escAttr(v)}"><span>${esc(l)}</span><i></i></button>`).join('')}</div>`, (sh, close) => {
    $$('[data-v]', sh).forEach(b => b.onclick = async () => { try { await save(b.dataset.v); close(); } catch (e) { toast(e.message); } });
  });
}

export async function viewEditProfile() {
  const p = shell('Edit profile', { back: '/profile' }); p.classList.add('ep-page');
  let alive = true; onCleanup(() => { alive = false; });
  p.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  let pr; try { pr = await loadMe(); } catch (e) { p.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const put = async body => { await api('/social/me', { method: 'PUT', body }); pr = await loadMe(); if (alive) draw(); toast('Saved'); };
  const nextChange = pr.usernameChangedAt ? new Date(new Date(pr.usernameChangedAt).getTime() + 7 * 86400000) : null;
  const row = (k, label, val, empty = 'Add') => `<button class="ep-row" data-edit="${k}"><span class="ep-l">${label}</span><span class="ep-v ${val ? '' : 'empty'}">${val ? esc(val) : empty}</span>${chev}</button>`;
  function draw() {
    const av = pr.avatar ? `<img src="${escAttr(pr.avatar)}" alt="">` : initial(pr);
    p.innerHTML = `
      <div class="ep-photo"><button class="ep-av" data-photo aria-label="Change photo"><span class="avatar xl">${av}</span><i>${I.camera || '📷'}</i></button><button class="link" data-photo>Change photo</button></div>
      <div class="ep-group"><div class="ep-gt">About you</div>
        ${row('name', 'Name', pr.name)}
        ${row('username', 'Username', '@' + pr.username)}
        ${row('pronouns', 'Pronouns', pr.pronouns)}
        ${row('bio', 'Bio', pr.bio ? pr.bio.replace(/\n/g, ' ') : '', 'Add a bio to your profile')}
        ${row('category', 'Category', pr.category, 'Show a label like Creator or Educator')}
      </div>
      <div class="ep-group"><div class="ep-gt">Links</div>
        ${row('website', 'Website', pr.website ? pr.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') : '')}
        ${row('links', 'Other links', pr.links.length ? pr.links.length + (pr.links.length === 1 ? ' link' : ' links') : '', 'Instagram, YouTube, shop…')}
      </div>
      <div class="ep-group"><div class="ep-gt">Personal information <small>Not shown on your profile</small></div>
        ${row('gender', 'Gender', pr.gender ? GENDER_LABEL[pr.gender] : '', 'Not set')}
        ${row('birthday', 'Birthday', pr.birthday ? new Date(pr.birthday + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '', 'Not set')}
        ${row('email', 'Email', state.user.email || '', '')}
      </div>
      <div class="ep-group">
        <a class="ep-row" href="#/profile/settings"><span class="ep-l">Settings and privacy</span><span class="ep-v"></span>${chev}</a>
        <button class="ep-row" data-share><span class="ep-l">Share profile</span><span class="ep-v faint">shukr-1467.roarai.app/#/u/${esc(pr.username)}</span>${chev}</button>
      </div>
      <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/*" hidden id="epAv">`;
    $$('[data-photo]', p).forEach(b => b.onclick = photoMenu);
    $$('[data-edit]', p).forEach(b => b.onclick = () => edit(b.dataset.edit));
    $('[data-share]', p).onclick = async () => { const url = `${location.origin}/#/u/${pr.username}`; try { if (navigator.share) await navigator.share({ title: pr.name, url }); else { await navigator.clipboard.writeText(url); toast('Profile link copied'); } } catch {} };
    $('#epAv', p).onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) cropAvatar(f); };
  }
  function photoMenu() {
    sheet(`<h3>Profile photo</h3><button class="opt" data-a="pick"><span class="e">${I.image || '🖼'}</span><div>Choose from library</div></button>
      <button class="opt" data-a="cam"><span class="e">${I.camera || '📷'}</span><div>Take photo</div></button>
      ${pr.avatar ? `<button class="opt danger" data-a="rm"><span class="e">${I.trash || '✕'}</span><div>Remove current photo</div></button>` : ''}`, (sh, close) => {
      $$('[data-a]', sh).forEach(b => b.onclick = async () => { close(); const inp = $('#epAv', p);
        if (b.dataset.a === 'pick') { inp.removeAttribute('capture'); inp.click(); }
        else if (b.dataset.a === 'cam') { inp.setAttribute('capture', 'user'); inp.click(); }
        else { try { await put({ avatar: null }); } catch (e) { toast(e.message); } } });
    });
  }
  // Square crop with drag + zoom, exported at 320×320 JPEG (keeps uploads small and strips EXIF/location data).
  function cropAvatar(file) {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      let z = 1, x = 0, y = 0; const S = 280;
      sheet(`<h3>Move and scale</h3><div class="ep-crop" style="width:${S}px;height:${S}px"><img src="${url}" alt="" draggable="false"></div>
        <input type="range" min="1" max="3" step="0.01" value="1" class="ep-zoom" aria-label="Zoom"><button class="btn accent block" data-ok>Use photo</button><p class="err"></p>`, (sh, close) => {
        const box = $('.ep-crop', sh), im = $('img', box), base = S / Math.min(img.width, img.height);
        const clamp = () => { const w = img.width * base * z, h = img.height * base * z; x = Math.min(0, Math.max(S - w, x)); y = Math.min(0, Math.max(S - h, y)); im.style.cssText = `width:${w}px;height:${h}px;transform:translate(${x}px,${y}px)`; };
        x = (S - img.width * base) / 2; y = (S - img.height * base) / 2; clamp();
        let drag = null; box.onpointerdown = e => { drag = { sx: e.clientX - x, sy: e.clientY - y }; box.setPointerCapture(e.pointerId); };
        box.onpointermove = e => { if (!drag) return; x = e.clientX - drag.sx; y = e.clientY - drag.sy; clamp(); }; box.onpointerup = () => drag = null;
        $('.ep-zoom', sh).oninput = e => { const cx = S / 2 - x, cy = S / 2 - y, k = +e.target.value / z; z = +e.target.value; x = S / 2 - cx * k; y = S / 2 - cy * k; clamp(); };
        $('[data-ok]', sh).onclick = async () => {
          const c = document.createElement('canvas'); c.width = c.height = 320; const g = c.getContext('2d'), r = 320 / S;
          g.fillStyle = '#fff'; g.fillRect(0, 0, 320, 320); g.drawImage(img, x * r, y * r, img.width * base * z * r, img.height * base * z * r);
          const data = c.toDataURL('image/jpeg', .86); const b = $('[data-ok]', sh); b.disabled = true;
          try { await put({ avatar: data }); close(); URL.revokeObjectURL(url); } catch (e) { $('.err', sh).textContent = e.message; b.disabled = false; }
        };
      });
    };
    img.onerror = () => toast('That photo format isn’t supported. Try a JPG or PNG.'); img.src = url;
  }
  async function edit(k) {
    if (k === 'name') return fieldPage({ title: 'Name', value: pr.name, max: 30, hint: 'Your name can only be changed a few times a week.', save: v => put({ name: v }) });
    if (k === 'username') return fieldPage({ title: 'Username', value: pr.username, max: 20, placeholder: 'username',
      hint: nextChange && nextChange > new Date() ? `You can change your username again on ${nextChange.toLocaleDateString()}.` : 'Letters, numbers and underscores. You can change it once every 7 days.',
      check: async v => { const u = v.toLowerCase().replace(/^@/, ''); if (u === pr.username) return { ok: true, text: 'This is your current username' }; try { const r = await api('/social/username-available?u=' + encodeURIComponent(u)); return { ok: r.ok, text: r.ok ? `@${u} is available` : r.reason }; } catch { return null; } },
      save: v => put({ username: v.toLowerCase().replace(/^@/, '') }) });
    if (k === 'pronouns') return choicePage({ title: 'Pronouns', value: pr.pronouns, options: [...PRONOUNS.map(x => [x, x || 'Don’t show']), ['__custom', 'Custom…']], note: 'Shown next to your name.',
      save: async v => { if (v === '__custom') return fieldPage({ title: 'Pronouns', value: pr.pronouns, max: 20, save: x => put({ pronouns: x }) }); return put({ pronouns: v }); } });
    if (k === 'bio') return fieldPage({ title: 'Bio', value: pr.bio, max: 150, multiline: true, placeholder: 'Tell people about yourself', save: v => put({ bio: v }) });
    if (k === 'category') return choicePage({ title: 'Category', value: pr.category, options: [['', 'Don’t show'], ...pr.categories.map(c => [c, c])], note: 'Helps people understand what you post.', save: v => put({ category: v }) });
    if (k === 'website') return fieldPage({ title: 'Website', value: pr.website, max: 200, type: 'url', placeholder: 'https://', hint: 'Shown as a link on your profile.', save: v => put({ website: v }) });
    if (k === 'links') return linksPage();
    if (k === 'gender') return choicePage({ title: 'Gender', value: pr.gender, options: Object.entries(GENDER_LABEL), note: 'This won’t be part of your public profile.', save: v => put({ gender: v }) });
    if (k === 'birthday') return fieldPage({ title: 'Birthday', value: pr.birthday, type: 'date', hint: 'Used to keep Shukr age-appropriate. Never shown publicly.', save: v => put({ birthday: v }) });
    if (k === 'email') return toast('To change your sign-in email, contact support from Settings.');
  }
  function linksPage() {
    const links = pr.links.map(l => ({ ...l }));
    const render = sh => { $('.ep-links', sh).innerHTML = links.map((l, i) => `<div class="ep-link"><input class="input" data-t="${i}" maxlength="30" placeholder="Title" value="${escAttr(l.title || '')}"><input class="input" data-u="${i}" type="url" maxlength="200" placeholder="https://" value="${escAttr(l.url || '')}"><button class="iconbtn" data-rm="${i}" aria-label="Remove link">${I.x}</button></div>`).join('') || '<p class="muted small">No links yet.</p>';
      $$('[data-rm]', sh).forEach(b => b.onclick = () => { links.splice(+b.dataset.rm, 1); render(sh); });
      $$('[data-t]', sh).forEach(i => i.oninput = () => links[+i.dataset.t].title = i.value); $$('[data-u]', sh).forEach(i => i.oninput = () => links[+i.dataset.u].url = i.value);
      $('[data-add]', sh).hidden = links.length >= 5; };
    sheet(`<h3>Links</h3><p class="muted small">Add up to 5 links — Instagram, YouTube, your shop or charity page.</p><div class="ep-links"></div><button class="btn ghost block" data-add>+ Add link</button><button class="btn accent block" style="margin-top:10px" data-save>Save</button><p class="err"></p>`, (sh, close) => {
      render(sh); $('[data-add]', sh).onclick = () => { links.push({ title: '', url: '' }); render(sh); $$('[data-u]', sh).pop()?.focus(); };
      $('[data-save]', sh).onclick = async () => { try { await put({ links: links.filter(l => l.url.trim()) }); close(); } catch (e) { $('.err', sh).textContent = e.message; } };
    });
  }
  draw();
}

export async function viewProfileSettings() {
  const p = shell('Settings and privacy', { back: '/profile' }); p.classList.add('ep-page');
  p.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  let pr; try { pr = await loadMe(); } catch (e) { p.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  let pv = pr.privacy;
  const tog = (k, label, sub) => `<label class="ep-row ep-tog"><span class="ep-l">${label}${sub ? `<small>${sub}</small>` : ''}</span><span class="toggle"><input type="checkbox" data-pv="${k}" ${pv[k] ? 'checked' : ''}><span></span></span></label>`;
  const scope = (k, label) => `<button class="ep-row" data-scope="${k}"><span class="ep-l">${label}</span><span class="ep-v">${SCOPE_LABEL[pv[k]] || 'Everyone'}</span>${chev}</button>`;
  const savePv = async body => { const r = await api('/social/privacy', { method: 'PUT', body }); pv = r.privacy; };
  function draw() {
    p.innerHTML = `
      <div class="ep-group"><div class="ep-gt">Account</div>
        <a class="ep-row" href="#/profile/edit"><span class="ep-l">Edit profile</span><span class="ep-v"></span>${chev}</a>
        <button class="ep-row" data-act="password"><span class="ep-l">Change password</span><span class="ep-v"></span>${chev}</button>
        <a class="ep-row" href="#/premium"><span class="ep-l">Shukr Premium</span><span class="ep-v">Memory · No ads</span>${chev}</a>
        <a class="ep-row" href="#/creator"><span class="ep-l">Creator tools & earnings</span><span class="ep-v"></span>${chev}</a>
        <a class="ep-row" href="#/advertise"><span class="ep-l">Advertise on Shukr</span><span class="ep-v"></span>${chev}</a>
        ${state.user.developer ? `<a class="ep-row" href="#/admin"><span class="ep-l">Developer dashboard</span><span class="ep-v"></span>${chev}</a>` : ''}
      </div>
      <div class="ep-group"><div class="ep-gt">Privacy</div>
        ${tog('private_account', 'Private account', 'Only people you approve can see your videos')}
        ${tog('suggest_account', 'Suggest your account to others', 'Appear in Discover and search suggestions')}
        ${tog('show_following', 'Show following list', 'Others can see who you follow')}
        ${tog('show_reposts', 'Show reposts', 'Others can see your Reposts tab')}
        ${tog('show_liked', 'Show liked videos', 'Others can see your Liked tab')}
        ${tog('show_activity', 'Activity status', 'Let people you follow see when you’re active')}
      </div>
      <div class="ep-group"><div class="ep-gt">Interactions</div>
        ${tog('allow_comments', 'Comments', 'Allow comments on your videos')}
        ${scope('comment_scope', 'Who can comment')}
        ${scope('allow_dms', 'Who can message you')}
      </div>
      <div class="ep-group"><div class="ep-gt">Messages</div>
        ${tog('read_receipts', 'Read receipts', 'Let people see when you’ve read their messages. If off, you won’t see theirs either.')}
        ${tog('typing_indicator', 'Typing indicator', 'Let people see when you’re typing. If off, you won’t see theirs either.')}
      </div>
      <div class="ep-group"><div class="ep-gt">More interactions</div>
        ${scope('allow_mentions', 'Who can @mention you')}
        ${tog('allow_downloads', 'Video downloads', 'Allow others to save your videos')}
        <button class="ep-row" data-act="filter"><span class="ep-l">Filter comment keywords</span><span class="ep-v">${pv.filter_words ? pv.filter_words.split(',').length + ' words' : 'Off'}</span>${chev}</button>
        <button class="ep-row" data-act="blocked"><span class="ep-l">Blocked accounts</span><span class="ep-v"></span>${chev}</button>
      </div>
      <div class="ep-group"><div class="ep-gt">App</div>
        <a class="ep-row" href="#/settings"><span class="ep-l">Notifications, language & display</span><span class="ep-v"></span>${chev}</a>
        <a class="ep-row" href="/api/export" download><span class="ep-l">Download your data</span><span class="ep-v"></span>${chev}</a>
      </div>
      <div class="ep-group"><div class="ep-gt">Login</div>
        <button class="ep-row" data-act="logout-all"><span class="ep-l">Log out of all other devices</span><span class="ep-v"></span>${chev}</button>
        <button class="ep-row" data-act="logout"><span class="ep-l">Log out</span><span class="ep-v"></span>${chev}</button>
        <button class="ep-row danger" data-act="delete"><span class="ep-l">Delete account</span><span class="ep-v"></span>${chev}</button>
      </div>`;
    $$('[data-pv]', p).forEach(c => c.onchange = async () => { try { await savePv({ [c.dataset.pv]: c.checked }); toast('Saved'); } catch (e) { toast(e.message); c.checked = !c.checked; } });
    $$('[data-scope]', p).forEach(b => b.onclick = () => choicePage({ title: b.querySelector('.ep-l').textContent, value: pv[b.dataset.scope], options: Object.entries(SCOPE_LABEL), save: async v => { await savePv({ [b.dataset.scope]: v }); draw(); toast('Saved'); } }));
    $$('[data-act]', p).forEach(b => b.onclick = () => act(b.dataset.act));
  }
  async function act(a) {
    if (a === 'password') return sheet(`<h3>Change password</h3><form id="pwF"><label class="lbl">Current password</label><input class="input" type="password" name="c" autocomplete="current-password" required>
      <label class="lbl">New password</label><input class="input" type="password" name="n" autocomplete="new-password" minlength="8" required><label class="lbl">Confirm new password</label><input class="input" type="password" name="n2" autocomplete="new-password" minlength="8" required>
      <p class="faint small">At least 8 characters. Changing it signs you out on every other device.</p><button class="btn accent block">Change password</button><p class="err"></p>
      <a class="link small" href="#/" id="pwForgot">Forgot your password?</a></form>`, (sh, close) => {
      $('#pwF', sh).onsubmit = async e => { e.preventDefault(); const f = e.target; if (f.n.value !== f.n2.value) return $('.err', sh).textContent = 'New passwords don’t match';
        try { await api('/account/password', { body: { current: f.c.value, next: f.n.value } }); close(); toast('Password changed'); } catch (er) { $('.err', sh).textContent = er.message; } };
      $('#pwForgot', sh).onclick = async e => { e.preventDefault(); close(); await api('/logout', { body: {} }).catch(() => {}); location.hash = '#/?forgot=1'; location.reload(); };
    });
    if (a === 'filter') return sheet(`<h3>Filter keywords</h3><p class="muted small">Comments containing these words are hidden from your videos. Separate with commas.</p><textarea class="input" rows="4" maxlength="1500" id="fw">${esc(pv.filter_words || '')}</textarea><button class="btn accent block" style="margin-top:10px" data-s>Save</button>`, (sh, close) => {
      $('[data-s]', sh).onclick = async () => { try { await savePv({ filter_words: $('#fw', sh).value }); close(); draw(); toast('Saved'); } catch (e) { toast(e.message); } };
    });
    if (a === 'blocked') { const r = await api('/social/blocked'); return sheet(`<h3>Blocked accounts</h3>${r.users.length ? r.users.map(u => `<div class="tt-user"><span class="avatar">${u.avatar ? `<img src="${escAttr(u.avatar)}" alt="">` : esc((u.name || u.username)[0].toUpperCase())}</span><span class="grow"><b>${esc(u.name || u.username)}</b><small>@${esc(u.username)}</small></span><button class="tt-pill" data-ub="${escAttr(u.username)}">Unblock</button></div>`).join('') : '<p class="muted" style="text-align:center">You haven’t blocked anyone.</p>'}`, sh => {
      $$('[data-ub]', sh).forEach(b => b.onclick = async () => { await api('/social/block/' + encodeURIComponent(b.dataset.ub), { body: { block: false } }); b.closest('.tt-user').remove(); toast('Unblocked'); });
    }); }
    if (a === 'logout-all') { await api('/account/logout-all', { body: {} }); return toast('Logged out of all other devices'); }
    if (a === 'logout') { await api('/logout', { body: {} }).catch(() => {}); location.hash = ''; location.reload(); }
    if (a === 'delete') { const m = await import('./views-more.js'); m.deleteAccountSheet(); }
  }
  draw();
}
