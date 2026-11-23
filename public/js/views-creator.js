// Creator Quests (gamified creator dashboard) + Creator University (in-depth course).
import { $, $$, esc, escAttr, I, api, state, shell, go, toast, vibrate } from './core.js';
import './creator-course.js';
const C = globalThis.ShukrCourse;
const n = x => (+x || 0).toLocaleString();
const ICO = { circle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9" stroke-dasharray="4 3"/></svg>',
  zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7Z"/></svg>',
  flame: I.flame, play: I.play, plus: I.plus, chat: I.chat, users: I.users, eye: I.eye, dollar: I.dollar, grid: I.grid, layers: I.layers, cap: I.cap };
const ic = k => ICO[k] || I.star;

function confetti(host) { const c = document.createElement('div'); c.className = 'cq-confetti';
  c.innerHTML = Array.from({ length: 36 }, (_, i) => `<i style="left:${Math.random() * 100}%;background:${['#FFD60A', '#FF2D55', '#34C759', '#0A84FF', '#AF52DE', '#D4AF37'][i % 6]};animation-delay:${(Math.random() * .3).toFixed(2)}s;transform:rotate(${Math.random() * 360}deg)"></i>`).join('');
  (host || document.body).append(c); setTimeout(() => c.remove(), 2200); }

function ring(pct, size = 92, stroke = 9) { const r = (size - stroke) / 2, cf = 2 * Math.PI * r;
  return `<svg class="cq-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" class="bg"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" class="fg" stroke-dasharray="${cf}" stroke-dashoffset="${cf * (1 - Math.min(1, pct / 100))}"/></svg>`; }

function questCard(x) { const pct = Math.round(100 * x.value / Math.max(1, x.goal));
  return `<div class="cq-q ${x.claimed ? 'claimed' : x.done ? 'ready' : ''}" data-q="${x.id}">
    <div class="cq-qi">${ic(x.icon)}</div>
    <div class="grow"><div class="cq-qt">${esc(x.title)}</div><div class="cq-qd">${esc(x.desc)}</div>
      <div class="cq-bar"><i style="width:${Math.min(100, pct)}%"></i></div><div class="cq-qn">${n(x.value)} / ${n(x.goal)}</div></div>
    ${x.claimed ? `<span class="cq-done">${I.check}</span>` : x.done ? `<button class="cq-claim" data-claim="${x.id}">+${x.xp} XP</button>` : `<span class="cq-xp">+${x.xp}</span>`}</div>`; }

export async function viewQuests() {
  const p = shell('Creator Quests', { back: '/creator' }); p.innerHTML = '<div class="loading"><span class="spin"></span></div>';
  let b; try { b = await api('/creator/quests'); } catch (e) { p.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const draw = (b, tab = 'd') => { const L = b.level, s = b.stats;
    const groups = { d: b.quests.filter(x => x.period === 'd'), w: b.quests.filter(x => x.period === 'w'), m: b.quests.filter(x => x.period === 'm') };
    const dDone = groups.d.filter(x => x.done).length;
    p.innerHTML = `<div class="cq-hero">
        <div class="cq-lv">${ring(Math.max(3, L.pct))}<div class="cq-lvn"><b>${L.level}</b><small>LEVEL</small></div></div>
        <div class="grow"><div class="cq-title">${esc(L.title)}</div><div class="cq-sub">${n(L.xp)} XP${L.next ? ` · ${n(L.next - L.xp)} to <b>${esc(L.nextTitle)}</b>` : ' · max level'}</div><div class="cq-xpbar"><i style="width:${Math.max(3, L.pct)}%"></i></div>
          <div class="cq-stats"><span class="cq-streak ${s.postedToday ? 'lit' : ''}">${I.flame}<b>${s.streak}</b> streak</span><span>${I.users}<b>${n(s.followers)}</b> fans</span><span>${I.eye}<b>${n(s.views28)}</b> views</span></div></div></div>
      ${s.postedToday ? '' : `<a class="cq-nudge" href="#/create">${I.flame}<div class="grow"><b>${s.streak ? `Keep your ${s.streak}-day streak alive` : 'Start your streak today'}</b><small>Post a video or a story before midnight</small></div><span class="cq-go">Post</span></a>`}
      <div class="cq-today"><div class="cq-tt">Today’s quests <b>${dDone}/${groups.d.length}</b></div><div class="cq-dots">${[...groups.d].sort((a, c) => (c.claimed * 2 + c.done) - (a.claimed * 2 + a.done)).map(x => `<i class="${x.claimed ? 'c' : x.done ? 'r' : ''}"></i>`).join('')}</div></div>
      ${b.ready ? `<button class="cq-claimall" data-claimall>Claim ${b.ready} reward${b.ready > 1 ? 's' : ''} · +${b.quests.filter(x => x.done && !x.claimed).reduce((a, x) => a + x.xp, 0)} XP</button>` : ''}
      <div class="seg cq-tabs"><button data-t="d" class="${tab === 'd' ? 'on' : ''}">Daily</button><button data-t="w" class="${tab === 'w' ? 'on' : ''}">Weekly</button><button data-t="m" class="${tab === 'm' ? 'on' : ''}">Milestones</button></div>
      <div class="cq-list">${groups[tab].map(questCard).join('')}</div>
      <div class="card cq-badges"><h3>Badges <span class="faint small">${b.badges.length}/${groups.m.length}</span></h3><div class="cq-bgrid">${groups.m.map(x => `<div class="cq-badge ${x.claimed ? 'on' : ''}" title="${escAttr(x.desc)}"><div>${ic(x.icon)}</div><small>${esc(x.title)}</small></div>`).join('')}</div></div>
      <a class="card cq-uni" href="#/university"><div class="cq-uni-ic">🎓</div><div class="grow"><b>Creator University</b><div class="muted small">${b.lessonsDone.length}/${b.lessonsTotal} lessons · learn to grow & earn</div><div class="cq-bar"><i style="width:${Math.round(100 * b.lessonsDone.length / Math.max(1, b.lessonsTotal))}%"></i></div></div>${I.chevron || '›'}</a>
      <div class="card"><h3>Levels</h3>${b.levels.map(x => `<div class="cq-lrow ${x.level === L.level ? 'cur' : x.level < L.level ? 'past' : ''}"><b>${x.level}</b><span class="grow">${esc(x.title)}</span><small>${n(x.xp)} XP</small></div>`).join('')}</div>`;
    $$('[data-t]', p).forEach(t => t.onclick = () => draw(b, t.dataset.t));
    const claim = async ids => { let last = null, gained = 0, up = null;
      for (const id of ids) { try { last = await api(`/creator/quests/${id}/claim`, { body: {} }); gained += last.gained || 0; up = last.levelUp || up; } catch (e) { toast(e.message); } }
      if (!last) return; vibrate(30); confetti(); toast(up ? `🎉 Level ${up.level} — ${up.title}!` : `+${gained} XP`); b = last; draw(b, tab); };
    $$('[data-claim]', p).forEach(x => x.onclick = e => { e.stopPropagation(); claim([x.dataset.claim]); });
    $('[data-claimall]', p) && ($('[data-claimall]', p).onclick = () => claim(b.quests.filter(x => x.done && !x.claimed).map(x => x.id)));
  };
  draw(b);
}

const MT = {"#34C759": ["#1E7E34", "#5BE37D"], "#FF2D55": ["#C8102E", "#FF7590"], "#007AFF": ["#0058C6", "#6CB2FF"], "#D4AF37": ["#8A6A00", "#FFD95A"], "#AF52DE": ["#7B2FA8", "#D79CF5"]}; // readable text colour per module accent: [light theme, dark theme]
export async function viewUniversity() {
  const p = shell('Creator University', { back: '/creator/quests' }); let done = [];
  try { done = (await api('/creator/quests')).lessonsDone; } catch {}
  const total = C.MODULES.reduce((a, m) => a + m.lessons.length, 0), mins = C.MODULES.reduce((a, m) => a + m.lessons.reduce((s, l) => s + l.mins, 0), 0);
  const next = C.MODULES.flatMap(m => m.lessons).find(l => !done.includes(l.id));
  p.innerHTML = `<div class="cu-hero"><div class="cu-cap">🎓</div><h2>Creator University</h2><p>Everything you need to grow on Shukr and earn from your content — the right way.</p>
      <div class="cu-meta"><span><b>${C.MODULES.length}</b> modules</span><span><b>${total}</b> lessons</span><span><b>${Math.round(mins / 6) / 10}</b> hrs</span></div>
      <div class="cq-bar big"><i style="width:${Math.round(100 * done.length / total)}%"></i></div><small>${done.length}/${total} complete${done.length === total ? ' · 🎓 Graduate!' : ''}</small>
      ${next ? `<a class="btn accent block" href="#/university/${next.id}" style="margin-top:12px">${done.length ? 'Continue' : 'Start'}: ${esc(next.title)}</a>` : ''}</div>
    ${C.MODULES.map((m, mi) => { const d = m.lessons.filter(l => done.includes(l.id)).length; return `<div class="cu-mod" style="--mc:${m.color};--mtl:${MT[m.color]?.[0] || m.color};--mtd:${MT[m.color]?.[1] || m.color}">
      <div class="cu-mh"><span class="cu-me">${m.emoji}</span><div class="grow"><div class="cu-mn">Module ${mi + 1}</div><h3>${esc(m.title)}</h3><p class="muted small">${esc(m.blurb)}</p></div><span class="cu-mc">${d}/${m.lessons.length}</span></div>
      ${m.lessons.map((l, i) => `<a class="cu-l ${done.includes(l.id) ? 'done' : ''}" href="#/university/${l.id}"><span class="cu-ln">${done.includes(l.id) ? I.check : i + 1}</span><div class="grow"><b>${esc(l.title)}</b><small>${l.mins} min · ${esc(l.summary)}</small></div></a>`).join('')}</div>`; }).join('')}`;
}

export async function viewLesson(id) {
  const L = C.lesson(id); const p = shell(L ? L.module.title : 'Lesson', { back: '/university' });
  if (!L) { p.innerHTML = '<div class="empty">Lesson not found</div>'; return; }
  let done = []; try { done = (await api('/creator/quests')).lessonsDone; } catch {}
  const all = C.MODULES.flatMap(m => m.lessons), idx = all.findIndex(x => x.id === id), nxt = all[idx + 1];
  const blk = ([t, v]) => t === 'p' ? `<p>${esc(v)}</p>` : t === 'h' ? `<h4>${esc(v)}</h4>` : t === 'list' ? `<ul>${v.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
    : t === 'steps' ? `<ol>${v.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : t === 'tip' ? `<div class="cu-tip">💡 ${esc(v)}</div>`
    : t === 'do' ? `<div class="cu-do"><div class="ok"><b>✓ Do</b>${esc(v[0])}</div><div class="no"><b>✗ Don’t</b>${esc(v[1])}</div></div>` : '';
  p.innerHTML = `<article class="cu-art" style="--mc:${L.module.color};--mtl:${MT[L.module.color]?.[0] || L.module.color};--mtd:${MT[L.module.color]?.[1] || L.module.color}"><div class="cu-crumb">${L.module.emoji} ${esc(L.module.title)} · Lesson ${idx + 1} of ${all.length} · ${L.mins} min</div>
    <h2>${esc(L.title)}</h2><p class="cu-sum">${esc(L.summary)}</p>${L.body.map(blk).join('')}
    <div class="cu-task"><div class="cu-tt">🎯 Do it now</div><p>${esc(L.task.text)}</p>${L.task.go ? `<a class="btn ghost" href="#${L.task.go}">Open</a>` : ''}</div>
    <div class="cu-quiz"><div class="cu-tt">✅ Quick check</div><p><b>${esc(L.quiz.q)}</b></p>${L.quiz.options.map((o, i) => `<button class="cu-opt" data-o="${i}">${esc(o)}</button>`).join('')}<div class="cu-why" hidden></div></div>
    <div class="cu-nav">${done.includes(id) ? `<span class="badge green">${I.check} Completed</span>` : ''}${nxt ? `<a class="btn accent grow" href="#/university/${nxt.id}" id="nx">Next: ${esc(nxt.title)}</a>` : `<a class="btn accent grow" href="#/creator/quests">Back to Quests</a>`}</div></article>`;
  $$('.cu-opt', p).forEach(b => b.onclick = async () => { const ok = +b.dataset.o === L.quiz.answer;
    $$('.cu-opt', p).forEach(x => { x.disabled = true; x.classList.toggle('right', +x.dataset.o === L.quiz.answer); }); if (!ok) b.classList.add('wrong');
    const w = $('.cu-why', p); w.hidden = false; w.textContent = (ok ? 'Correct! ' : 'Not quite. ') + L.quiz.why;
    try { const r = await api(`/creator/lessons/${id}/done`, { body: { quizOk: ok } }); if (!done.includes(id)) { done.push(id); vibrate(20); if (ok) confetti(); toast(r.ready ? 'Lesson complete — you have a quest reward to claim!' : 'Lesson complete ✓'); } } catch (e) { toast(e.message); } });
}

export async function viewSoundCredits() {
  const p = shell('Credits & licences', { back: '/settings' }); let c = [], ad = [];
  try { c = (await (await fetch('/api/sounds/credits')).json()).credits || []; } catch {}
  try { ad = await (await fetch('/adhan/adhan.json')).json(); } catch {}
  const item = x => `<div class="list-item"><div class="grow"><b>${esc(x.title)}</b><small>${esc(x.artist || 'Unknown')} · ${esc(x.license)}</small></div>${x.source ? `<a class="btn ghost sm" href="${escAttr(x.source)}" target="_blank" rel="noopener">Source</a>` : ''}</div>`;
  const texts = [
    { title: 'Quran Arabic text', artist: 'Tanzil Project (tanzil.net) — unmodified Uthmani text', license: 'CC BY 3.0', source: 'https://tanzil.net/docs/text_license' },
    { title: 'Quran English translation', artist: 'Marmaduke Pickthall, 1930', license: 'Public domain', source: 'https://en.wikisource.org/wiki/The_Meaning_of_the_Glorious_Koran' },
    { title: 'Hadith Arabic texts', artist: 'Classical collections via fawazahmed0/hadith-api', license: 'Public domain / Unlicense', source: 'https://github.com/fawazahmed0/hadith-api' },
    { title: 'English of hadith, duas & adhkar', artist: 'Shukr’s own translations', license: '© Shukr' },
    { title: 'Prayer-time calculation', artist: 'Adhan JavaScript library (Batoul Apps)', license: 'MIT', source: 'https://github.com/batoulapps/adhan-js' },
    { title: 'Maps', artist: 'Leaflet; map data © OpenStreetMap contributors', license: 'BSD-2 / ODbL', source: 'https://www.openstreetmap.org/copyright' },
    { title: 'Stickers', artist: 'Twemoji by Twitter, Inc and contributors', license: 'CC BY 4.0', source: 'https://github.com/twitter/twemoji' },
    { title: 'Audiobooks', artist: 'LibriVox volunteers (public-domain books)', license: 'Public domain', source: 'https://librivox.org' }];
  p.innerHTML = `<p class="muted small">Shukr only uses content that is public domain, freely licensed, or created by Shukr. Thank you to everyone below.</p>
    <h3 style="margin:14px 2px 6px">Adhan recordings</h3><div class="card sc-list">${ad.map(x => item({ title: x.label + ' — ' + x.sub, artist: x.author, license: x.license, source: x.source })).join('')}</div>
    <h3 style="margin:14px 2px 6px">Texts, maps & tools</h3><div class="card sc-list">${texts.map(item).join('')}</div>
    <h3 style="margin:14px 2px 6px">Sound library</h3><div class="card sc-list">${c.map(item).join('')}</div>`;
}
