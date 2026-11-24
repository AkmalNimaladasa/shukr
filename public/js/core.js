// Core: utilities, icons, API, state, router, shell (left drawer), sheets, nasheed, theme.
import './prayer-location.js';
import './prayer-methods.js';
export const { guessMethod, locationPatch, validCoordinates } = globalThis.ShukrPrayerLocation;
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const escAttr = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// esc: escapes HTML; ﷺ (U+FDFA) is replaced by a readable form because many phone fonts lack the glyph
export const esc = s => escAttr(String(s ?? '').replace(/\(\s*\uFDFA\s*\)/g, '\uFDFA').replace(/\uFDFA/g, '\u0640SAW\u0640')).replace(/\u0640SAW\u0640/g, '<span class="saw">ﷺ</span>');
export const LS = { get: (k, d) => { try { const v = localStorage.getItem('shukr.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem('shukr.' + k, JSON.stringify(v)); } catch {} } };

// ---------- Haptics: navigator.vibrate on Android; iOS has no vibrate API -> subtle audio tick fallback ----------
let actx = null;
function tick(freq = 1400, dur = 0.018, vol = 0.05) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = freq; o.type = 'sine'; g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + dur + 0.01);
  } catch {}
}
export const canVibrate = () => typeof navigator !== 'undefined' && 'vibrate' in navigator;
export function vibrate(p = 15) {
  if (state.user?.settings?.haptics === false) return;
  let ok = false; try { ok = canVibrate() && navigator.vibrate(p); } catch {}
  if (!ok && LS.get('tickSound', true)) tick(Array.isArray(p) ? 900 : 1400, Array.isArray(p) ? 0.06 : 0.018);
}

export function toast(msg, ms = 2400) { const t = $('#toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms); }

export async function api(path, opts = {}) {
  const r = await fetch('/api' + path, { method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'), headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined, credentials: 'same-origin' });
  if (r.status === 401 && !opts.noAuthRedirect) { state.user = null; location.hash = ''; window.dispatchEvent(new Event('shukr:logout')); throw new Error('Please sign in'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || 'Something went wrong (' + r.status + ')'); e.status = r.status; e.data = j; throw e; }
  return j;
}
export const loadJSON = (() => { const c = {}; return u => c[u] || (c[u] = fetch(u).then(r => { if (!r.ok) throw new Error('Failed to load ' + u); return r.json(); }).catch(e => { delete c[u]; throw e; })); })();

// ---------- Icons (inline SVG, no emoji) ----------
const S = (d, o = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ${o}>${d}</svg>`;
export const I = {
  menu: S('<path d="M4 7h16M4 12h10M4 17h16"/>'),
  edit: S('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  undo: S('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  back: S('<path d="M15 18l-6-6 6-6"/>'), fwd: S('<path d="M9 18l6-6-6-6"/>'),
  home: S('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/>'),
  book: S('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5Z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>'),
  quran: S('<path d="M12 6c-2-1.5-5-2-8-1.5v14c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5v-14c-3-.5-6 0-8 1.5Z"/><path d="M12 6v14"/>'),
  scroll: S('<path d="M8 21h11a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 0 0-2-2 2 2 0 0 0-2 2v3h4"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M14 8h-4M14 12h-4"/>'),
  brain: S('<path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3 2 2 0 0 0 3-1V4a2 2 0 0 0-3-1Z"/><path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3 2 2 0 0 1-3-1"/>'),
  mic: S('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  micOff: S('<path d="M3 3l18 18"/><path d="M9 9v2a3 3 0 0 0 5 2.2M15 9.3V6a3 3 0 0 0-5.7-1.3"/><path d="M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3"/>'),
  wave: S('<path d="M3 12h2M7 8v8M11 5v14M15 8v8M19 10v4M21 12h0"/>'),
  beads: S('<circle cx="12" cy="4.5" r="1.8"/><circle cx="17.3" cy="6.7" r="1.8"/><circle cx="19.5" cy="12" r="1.8"/><circle cx="17.3" cy="17.3" r="1.8"/><circle cx="6.7" cy="6.7" r="1.8"/><circle cx="4.5" cy="12" r="1.8"/><circle cx="6.7" cy="17.3" r="1.8"/><circle cx="12" cy="19.5" r="1.8"/>'),
  moon: S('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>'),
  sun: S('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  clock: S('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  cal: S('<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 3v3M16 3v3"/>'),
  gem: S('<path d="M6 3h12l4 6-10 12L2 9Z"/><path d="M2 9h20M12 21 8 9l4-6 4 6-4 12"/>'),
  chart: S('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  cap: S('<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>'),
  compass: S('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>'),
  star: S('<path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7Z"/>'),
  starFill: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7Z"/></svg>',
  gear: S('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
  send: S('<path d="M12 19V5M5 12l7-7 7 7"/>', 'stroke-width="2.2"'),
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
  copy: S('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'),
  retry: S('<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5"/>'),
  save: S('<path d="M19 21 12 16 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z"/>'),
  saveFill: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 21 12 16 5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  next: S('<path d="M5 5l10 7-10 7V5ZM19 5v14"/>'), prev: S('<path d="M19 19 9 12l10-7v14ZM5 19V5"/>'),
  repeat: S('<path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>'),
  check: S('<path d="M5 12l5 5L20 7"/>', 'stroke-width="3"'),
  plus: S('<path d="M12 5v14M5 12h14"/>', 'stroke-width="2"'),
  x: S('<path d="M18 6 6 18M6 6l12 12"/>'),
  trash: S('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
  search: S('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  clip: S('<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>'),
  speaker: S('<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>'),
  mute: S('<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="m22 9-6 6M16 9l6 6"/>'),
  music: S('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  heart: S('<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/>'),
  heartFill: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/></svg>',
  hands: S('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 12V4.5a1.5 1.5 0 0 1 3 0V12"/><path d="M14 12V6.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.2 15a1.5 1.5 0 0 1 2.4-1.8L8 15.5"/>'),
  chat: S('<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z"/>'),
  users: S('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2a5 5 0 0 1 6 4.8"/>'),
  pin: S('<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Z"/><circle cx="12" cy="9" r="2.5"/>'),
  mosque: S('<path d="M3 21h18M5 21v-8h14v8M12 3c-3 2-5 4-5 7h10c0-3-2-5-5-7Z"/><path d="M12 1v2M10 21v-4a2 2 0 0 1 4 0v4M2 21V10M22 21V10"/>'),
  shuffle: S('<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>'),
  play2: S('<path d="m7 4 13 8-13 8Z"/>'),
  headphones: S('<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3v4ZM3 19a2 2 0 0 0 2 2h1v-6H3v4Z"/>'),
  hourglass: S('<path d="M5 2h14M5 22h14M7 2v4a5 5 0 0 0 10 0V2M7 22v-4a5 5 0 0 1 10 0v4"/>'),
  flame: S('<path d="M12 22c4 0 7-3 7-7 0-4-3-6-4-10-1 2-2 3-3 3-.5-2-1-3-2-4-1 4-5 6-5 11 0 4 3 7 7 7Z"/>'),
  leaf: S('<path d="M11 20A7 7 0 0 1 4 13c0-6 5-10 16-10 0 11-4 16-10 16Z"/><path d="M4 21c3-6 7-9 12-11"/>'),
  scale: S('<path d="M12 3v18M5 21h14M3 7h18M6 7l-3 7a3 3 0 0 0 6 0Zm12 0-3 7a3 3 0 0 0 6 0Z"/>'),
  bulb: S('<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2Z"/>'),
  target: S('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
  alert: S('<path d="M12 3 2 20h20Z"/><path d="M12 10v4M12 17v.5"/>'),
  sparkle: S('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>'),
  coin: S('<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-2 0-3 1-3 2s1 1.6 3 2 3 1 3 2-1 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v12"/>'),
  fast: S('<path d="M18 8a6 6 0 1 1-8.5-5.5A7 7 0 0 0 18 8Z"/><path d="M4 21h16"/>'),
  dua: S('<path d="M7 11V6a2 2 0 0 1 4 0v5M11 10V5a2 2 0 0 1 4 0v6M15 9a2 2 0 0 1 4 0v4a8 8 0 0 1-8 8H9a6 6 0 0 1-6-6v-3a2 2 0 0 1 4 0"/>'),
  eye: S('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: S('<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  share: S('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>'),
  flag: S('<path d="M4 22V4M4 4h12l-2 4 2 4H4"/>'),
  settings: S('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  mail: S('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/>'),
  create: S('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/><path d="M4 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" fill="currentColor"/>'),
  bag: S('<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>'),
  briefcase: S('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>'),
  tag: S('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/>'),
  tagged: S('<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18.5a6 6 0 0 1 11 0"/>'),
  dollar: S('<path d="M12 2v20M17 6.5c-.8-1.5-2.7-2.5-5-2.5-2.8 0-5 1.5-5 3.7 0 5.3 10 2.8 10 8.6 0 2.2-2.2 3.7-5 3.7-2.5 0-4.4-1-5.2-2.7"/>'),
  wallet: S('<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M16 13h2M3 10h18M6 6l9-3 1 3"/>'),
  gift: S('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v9h14v-9M12 8C10 4 7 4 7 6s3 2 5 2c2 0 5 0 5-2s-3-2-5 2"/>'),
  smile: S('<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/>'),
  camera: S('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>'),
  link: S('<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>'),
  globe: S('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
  block: S('<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>'),
  image: S('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>'),
  bookmark: S('<path d="M6 3h12v18l-6-4-6 4V3Z"/>'),
  external: S('<path d="M14 3h7v7M10 14 21 3M21 14v7H3V3h7"/>'),
  lock: S('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  grid: S('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
  megaphone: S('<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1ZM15 8a5 5 0 0 1 0 8M18 5a9 9 0 0 1 0 14"/>'),
  info: S('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  user: S('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  shield: S('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>'),
  more: S('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'),
  download: S('<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>'),
  install: S('<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M12 7v7M9 11l3 3 3-3M10 18h4"/>'),
  phone: S('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>'),
  route: S('<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>'),
  layers: S('<path d="m12 2 10 5-10 5L2 7Z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>'),
  sliders: S('<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>'),
  kaaba: '<svg viewBox="0 0 36 36"><path d="M6 11 18 6l12 5v15l-12 5-12-5Z" fill="#1F1E1D"/><path d="M6 11l12 5 12-5" fill="none" stroke="#D4A84A" stroke-width="1.5"/><path d="M6 15l12 5 12-5" stroke="#D4A84A" stroke-width="2.4" fill="none"/><path d="M18 16v15" stroke="#3a3a3a" stroke-width=".8"/></svg>',
  logo: '<svg viewBox="0 0 64 64" fill="currentColor"><path d="M40 52A22 22 0 1 1 30.5 10.2 18 18 0 1 0 52 37.5 22 22 0 0 1 40 52Z"/><path d="M42 18l1.5 5.5L49 25l-5.5 1.5L42 32l-1.5-5.5L35 25l5.5-1.5Z"/></svg>',
  khatam: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.6l2.5 3 3.9-.4-.4 3.9 3 2.5-3 2.5.4 3.9-3.9-.4-2.5 3-2.5-3-3.9.4.4-3.9-3-2.5 3-2.5-.4-3.9 3.9.4Z"/><circle cx="12" cy="12" r="3.2" fill="var(--bg)"/></svg>',
  ayahStar: '<svg viewBox="0 0 40 40" fill="currentColor"><path d="M20 1l5 6.4 8.1-1.4-1.4 8.1L38 19l-6.3 5 1.4 8.1-8.1-1.4L20 37l-5-6.3-8.1 1.4 1.4-8.1L2 19l6.3-5L6.9 6l8.1 1.4Z"/></svg>',
  moodIcons: [
    S('<circle cx="12" cy="12" r="9"/><path d="M8 16.5c1-1.3 2.4-2 4-2s3 .7 4 2M9 9.5h.01M15 9.5h.01"/>'),
    S('<circle cx="12" cy="12" r="9"/><path d="M8.5 16c1-.8 2.2-1.2 3.5-1.2s2.5.4 3.5 1.2M9 9.5h.01M15 9.5h.01"/>'),
    S('<circle cx="12" cy="12" r="9"/><path d="M8.5 15.5h7M9 9.5h.01M15 9.5h.01"/>'),
    S('<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1 2.2 1.5 3.5 1.5s2.5-.5 3.5-1.5M9 9.5h.01M15 9.5h.01"/>'),
    S('<circle cx="12" cy="12" r="9"/><path d="M7.5 13.5c1 2 2.6 3 4.5 3s3.5-1 4.5-3ZM9 9h.01M15 9h.01"/>')
  ]
};
export const icon = (k, cls = '') => `<span class="${cls}" style="display:inline-grid;place-items:center">${I[k] || ''}</span>`;

// ---------- State ----------
export const state = { user: null, ai: false, vapid: null, deferredPrompt: null, timers: [], cleanups: [] };
export const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
export const tz = () => state.user?.settings?.tz || TZ;
export const localDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: tz() }).format(d);
export const localHour = () => +new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: tz() }).format(new Date()) % 24;
export const fmtTime = d => d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: tz() }) : '--';
const HM = ['Muharram', 'Safar', 'Rabi‘ al-Awwal', 'Rabi‘ al-Thani', 'Jumada al-Ula', 'Jumada al-Akhirah', 'Rajab', 'Sha‘ban', 'Ramadan', 'Shawwal', 'Dhu al-Qa‘dah', 'Dhu al-Hijjah'];
export function hijri(d = new Date()) { const p = hijriParts(d); return p.m ? `${p.d} ${HM[p.m - 1]} ${p.y}\u00A0AH` : ''; }
// Tabular (arithmetic) Hijri fallback for browsers without the umalqura calendar
function tabularHijri(date) {
  const jd = Math.floor(date.getTime() / 864e5) + 2440588; // julian day (UTC noon-ish)
  let l = jd - 1948440 + 10632; const n = Math.floor((l - 1) / 10631); l = l - 10631 * n + 354;
  const j = Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) + Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l = l - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const m = Math.floor((24 * l) / 709), d = l - Math.floor((709 * m) / 24), y = 30 * n + j - 30;
  return { d, m, y };
}
let umalquraOK = null;
export function hijriParts(d = new Date()) {
  const dd = new Date(d.getTime() + (state.user?.settings?.hijriAdj || 0) * 864e5);
  if (umalquraOK !== false) {
    try {
      const p = {}; new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: tz() }).formatToParts(dd).forEach(x => { p[x.type] = x.value; });
      const r = { d: parseInt(p.day, 10), m: parseInt(p.month, 10), y: parseInt(p.year || p.relatedYear, 10) };
      if (r.d && r.m && r.y && r.y > 1300 && r.y < 1600) { umalquraOK = true; return r; }
      umalquraOK = false;
    } catch (e) { umalquraOK = false; }
  }
  return tabularHijri(dd);
}
export const prettyDate = s => new Date(s + 'T12:00:00').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
export const daysAgo = s => { const n = Math.round((new Date(localDay()) - new Date(s)) / 864e5); return n === 0 ? 'Today' : n === 1 ? 'Yesterday' : n < 7 ? n + ' days ago' : prettyDate(s); };
export function dayIndex(mod, salt = 0) { const d = new Date(localDay()); return (Math.floor(d.getTime() / 864e5) + salt) % mod; }
export const hasMemoryPlan = () => Object.keys(state.user?.plans || {}).some(k => /^(memory|memory_plus|mentor)$/.test(k));
export function onCleanup(fn) { state.cleanups.push(fn); }
export function every(ms, fn) { const h = setInterval(fn, ms); state.timers.push(h); return h; }

// ---------- Markdown (safe) ----------
export function md(src) {
  let s = esc(src || '');
  const blocks = []; s = s.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, l, c) => { blocks.push('<pre><code>' + c + '</code></pre>'); return `\u0000${blocks.length - 1}\u0000`; });
  const inline = t => t
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>').replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/([\u0600-\u06FF][\u0600-\u06FF\u064B-\u0670\u06D6-\u06ED\s،ۖ-ۜ]{3,})/g, '<span class="ar-inline" dir="rtl">$1</span>');
  const lines = s.split('\n'); const out = []; let list = null, table = null;
  const closeList = () => { if (list) { out.push('</' + list + '>'); list = null; } };
  const closeTable = () => { if (table) { out.push('<table>' + table.join('') + '</table>'); table = null; } };
  for (const raw of lines) {
    const l = raw.trimEnd(); let m;
    if (/^\|.*\|$/.test(l.trim())) { closeList(); if (/^\|[\s:|-]+\|$/.test(l.trim())) continue; const cells = l.trim().slice(1, -1).split('|').map(c => inline(c.trim())); table = table || []; table.push('<tr>' + cells.map(c => (table.length ? `<td>${c}</td>` : `<th>${c}</th>`)).join('') + '</tr>'); continue; } else closeTable();
    if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push('<li>' + inline(m[1]) + '</li>'); continue; }
    if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push('<li>' + inline(m[1]) + '</li>'); continue; }
    closeList();
    if ((m = l.match(/^(#{1,4})\s+(.*)/))) { const n = Math.min(4, m[1].length + 1); out.push(`<h${n}>${inline(m[2])}</h${n}>`); continue; }
    if ((m = l.match(/^&gt;\s?(.*)/))) { out.push('<blockquote>' + inline(m[1]) + '</blockquote>'); continue; }
    if (/^\u0000\d+\u0000$/.test(l.trim())) { out.push(l.trim()); continue; }
    if (!l.trim()) { out.push(''); continue; }
    out.push('<p>' + inline(l) + '</p>');
  }
  closeList(); closeTable();
  return out.join('\n').replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[i]);
}

// ---------- Sections / navigation ----------
const SECTIONS_ALL = [
  { group: '', items: [['/new-to-islam', 'New to Islam?', 'info', 'newislam'], ['/fyp', 'For You', 'play'], ['/profile', 'My profile', 'user'], ['/quests', 'Daily quests & league', 'star', 'quests'], ['/achievements', 'Streaks & rewards', 'gift'], ['/premium', 'Premium', 'star']] },
  { group: 'Creators', items: [['/creator/analytics', 'Creator analytics', 'chart'], ['/creator/quests', 'Creator Quests', 'flame'], ['/university', 'Creator University', 'cap'], ['/creator', 'Creator earnings', 'dollar'], ['/advertise', 'Advertise', 'send']] },
  { group: 'Daily', items: [['/today', 'Today', 'home'], ['/chat/new', 'Alim', 'khatam', 'alim'], ['/sunnah', 'Sunnah tracker', 'check', 'sunnah'], ['/challenges', 'Challenges & leaderboard', 'flame', 'challenges'], ['/habits', 'Habit tracker', 'check', 'habits'], ['/journal', 'Gratitude journal', 'book', 'journal'], ['/blessings', 'Blessings', 'gem', 'blessings'], ['/cards', 'Greeting cards', 'image', 'cards']] },
  { group: 'Worship', items: [['/prayer', 'Prayer times', 'clock', 'prayer'], ['/dhikr', 'Dhikr counter', 'beads', 'dhikr'], ['/istighfar', 'Istighfar', 'leaf', 'istighfar'], ['/adhkar', 'Adhkar & duas', 'moon', 'adhkar'], ['/qibla', 'Qibla', 'compass', 'qibla'], ['/calendar', 'Calendar', 'cal', 'calendar'], ['/fasting', 'Fasting', 'fast', 'fasting'], ['/timetable', 'Monthly timetable', 'cal', 'timetable'], ['/salah-guide', 'How to pray', 'hands', 'salahguide'], ['/ramadan', 'Ramadan', 'moon', 'ramadan'], ['/hajj', 'Hajj & Umrah', 'kaaba', 'hajj']] },
  { group: 'Knowledge', items: [['/quran', 'Quran', 'quran', 'quran'], ['/ayah-finder', 'Ayah finder', 'search', 'ayahfinder'], ['/tafsir', 'Tafsir', 'book', 'tafsir'], ['/hadith', 'Hadith', 'scroll', 'hadith'], ['/seerah', 'Seerah & history', 'hourglass', 'seerah'], ['/hifz', 'Hifz', 'brain', 'hifz'], ['/tajweed', 'Tajweed', 'mic', 'tajweed'], ['/learn', 'Learn', 'cap', 'learn'], ['/names', '99 Names', 'star', 'names']] },
  { group: 'Learn Arabic', items: [['/arabic', 'Learn Qur’anic Arabic', 'quran', 'arabic'], ['/arabic/review', 'Arabic word review', 'retry', 'arabic']] },
  { group: 'Study', items: [['/study', 'Study hub', 'cap', 'study'], ['/study/pomodoro', 'Pomodoro timer', 'clock', 'study'], ['/study/focus', 'Deep focus', 'brain', 'study'], ['/study/tasks', 'Tasks & exams', 'check', 'study'], ['/study/cards', 'Flashcards', 'book', 'study'], ['/study/stats', 'Study stats', 'chart', 'study']] },
  { group: 'Listen', items: [['/audiobooks', 'Audiobooks', 'headphones', 'audiobooks'], ['/nasheeds', 'Nasheeds', 'headphones', 'nasheeds']] },
  { group: 'Barakah & wealth', items: [['/barakah', 'Barakah', 'sparkle', 'barakah'], ['/wealth', 'Halal wealth', 'wallet', 'wealth'], ['/zakat', 'Zakat calculator', 'coin', 'zakat']] },
  { group: 'Earn $', items: [['/earn', 'Earn', 'dollar'], ['/referrals', 'Refer & earn', 'gift'], ['/wallet', 'Wallet', 'wallet'], ['/freelance', 'Freelance', 'briefcase'], ['/market', 'Marketplace', 'bag'], ['/jobs', 'Jobs', 'briefcase'], ['/audio', 'Nasheed studio', 'mic']] },
  { group: 'Scholars', items: [['/scholars', 'Ask a scholar', 'cap'], ['/scholar', 'Scholar portal', 'shield']] },
  { group: 'Heart', items: [['/akhirah', 'Akhirah reminders', 'hourglass', 'akhirah'], ['/insights', 'Insights', 'chart', 'insights'], ['/memory', 'Alim’s memory', 'layers', 'memory']] },
  { group: 'Ummah', items: [['/ummah', 'Ummah', 'users', 'ummah'], ['/jummah', 'Jummah', 'mosque', 'ummah'], ['/mosques', 'Mosque map', 'pin', 'mosques'], ['/ummah/feed', 'Community', 'chat', 'ummah'], ['/halal-places', 'Halal food near me', 'bag', 'halalplaces']] },
  { group: '', items: [['/feedback', 'Send feedback', 'chat'], ['/settings', 'Settings', 'gear']] }
];
// Pages still being built are hidden from the menu until their module ships.
const PENDING = new Set([]);
export const SECTIONS = SECTIONS_ALL.map(g => ({ ...g, items: g.items.filter(it => !PENDING.has(it[0])) })).filter(g => g.items.length);

export const sectionOn = key => !key || state.user?.settings?.sections?.[key] !== false;

export const route = () => (location.hash.replace(/^#/, '') || '/');
// In-app navigation memory: back buttons pop history (no forward-push loops); menu taps mark the page as a top-level destination.
export const NAV = { depth: 0, fromMenu: null };
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => { NAV.depth++; });
  document.addEventListener('click', e => {
    const b = e.target.closest?.('[data-back]'); if (b) { e.preventDefault(); e.stopPropagation(); if (NAV.depth > 0 && history.length > 1) { NAV.depth -= 2; history.back(); } else go(b.dataset.back); return; }
    const n = e.target.closest?.('.nav-item[data-go],.newchat[data-go]'); if (n) NAV.fromMenu = '#' + n.dataset.go;
  }, true);
}
export const go = h => { if (location.hash === '#' + h || (h === '/' && !location.hash)) window.dispatchEvent(new Event('hashchange')); else location.hash = h; };

export function bindGo(root) { $$('[data-go]', root).forEach(b => b.addEventListener('click', e => { e.preventDefault(); go(b.dataset.go); })); }

export function shell(title, { back = null, right = '', flush = false, noPad = false } = {}) {
  for (const h of state.timers) clearInterval(h); state.timers = [];
  for (const fn of state.cleanups.splice(0)) { try { fn(); } catch {} }
  const app = $('#app');
  if (!$('#drawer', app)) {
    app.innerHTML = `<aside class="drawer" id="drawer" aria-label="Menu"></aside><div class="scrim" id="scrim"></div>
      <div class="shell-main"><div class="topbar" id="topbar"></div><main class="main" id="main"></main></div>`;
    $('#scrim').addEventListener('click', closeDrawer);
    renderDrawer();
  } else renderDrawerActive();
  const tb = $('#topbar');
  if (back && NAV.fromMenu === location.hash) back = null; // opened from the menu → show the menu button, not a back chain
  tb.innerHTML = `${back ? `<button class="iconbtn" data-back="${back}" aria-label="Back">${I.back}</button>` : `<button class="iconbtn" id="openDrawer" aria-label="Open menu">${I.menu}</button>`}
    <div class="title">${title}</div>
    <div class="right">${right}${/^\/(profile|u\/|premium|creator|advertise|admin|explore|stories|activity|messages|notifications|mosques|zakat|settings|create|earn|referrals|wallet|market|jobs|freelance|fundraiser|communities|product|audio)/.test(route()) ? '' : `<button class="iconbtn nasheed-btn" id="nasheedBtn" aria-label="Toggle nasheed">${nasheedIcon()}</button>`}</div>`;
  $('#openDrawer')?.addEventListener('click', openDrawer);
  $('#nasheedBtn')?.addEventListener('click', toggleNasheed);
  bindGo(tb);
  const main = $('#main'); main.scrollTop = 0;
  main.innerHTML = `<div class="${flush ? '' : 'page'}" id="page" ${noPad ? 'style="height:100%"' : ''}></div>`;
  return $('#page');
}
function renderDrawer() {
  const d = $('#drawer'); const u = state.user;
  d.innerHTML = `<div class="brand"><span class="logo">${I.logo}</span>Shukr</div>
    <button class="newchat" data-go="/chat/new">${I.edit} New chat with Alim</button>
    ${!(matchMedia('(display-mode: standalone)').matches || navigator.standalone) && !LS.get('installed', false) ? `<button class="ins-drawer" id="drInstall">${I.download}<span><b>Install the app</b><small>Add Shukr to your home screen</small></span></button>` : ''}
    <div class="drawer-scroll">
      ${SECTIONS.map(g => { const items = g.items.filter(it => sectionOn(it[3])); if (!items.length) return ''; return `${g.group ? `<div class="nav-group">${g.group}</div>` : '<div class="divider"></div>'}${items.map(([p, l, ic]) => `<button class="nav-item" data-go="${p}" data-path="${p}">${I[ic]}${l}</button>`).join('')}`; }).join('')}
      ${u?.developer ? `<div class="nav-group">Developer</div><button class="nav-item" data-go="/admin" data-path="/admin">${I.chart}Dashboard</button>` : ''}
      ${sectionOn('alim') ? `<div class="nav-group">Recent chats</div><div id="chatlist"></div>` : ''}
    </div>
    <div class="foot" data-go="/profile" style="cursor:pointer"><div class="avatar">${esc((u?.name || u?.email || '?')[0].toUpperCase())}</div><div style="flex:1;min-width:0"><div style="font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(u?.name || u?.email || '')}</div><div class="faint small">${esc(hijri())}</div></div></div>`;
  $$('[data-go]', d).forEach(b => b.addEventListener('click', e => { e.preventDefault(); closeDrawer(); go(b.dataset.go); }));
  const di = $('#drInstall', d); if (di) di.onclick = () => { closeDrawer(); setTimeout(() => window.shukrInstall?.(), 350); };
  renderDrawerActive(); loadChatList();
}
export function refreshDrawer() { if ($('#drawer')) renderDrawer(); }
function renderDrawerActive() {
  const r = route();
  const socialR = /^\/(fyp|explore|stories|create|activity|messages|profile|rights)/.test(r);
  $$('.nav-item').forEach(b => { const p = b.dataset.path; b.classList.toggle('active', p === '/fyp' ? (socialR && !r.startsWith('/profile')) || r === '/' : p === '/' ? r === '/' : (p === '/chat/new' ? r.startsWith('/chat') : r.startsWith(p))); });
  const cur = (r.match(/^\/chat\/(\d+)/) || [])[1];
  $$('.chatitem').forEach(b => b.classList.toggle('active', b.dataset.id === cur));
}
export async function loadChatList() {
  const el = $('#chatlist'); if (!el) return;
  try {
    const { conversations } = await api('/conversations');
    el.innerHTML = conversations.length ? conversations.slice(0, 40).map(c => `<button class="chatitem" data-id="${c.id}">${esc(c.title)}</button>`).join('') : '<div class="faint small" style="padding:6px 10px">No chats yet</div>';
    $$('.chatitem', el).forEach(b => b.addEventListener('click', () => { closeDrawer(); go('/chat/' + b.dataset.id); }));
    renderDrawerActive();
  } catch {}
}
export function openDrawer() { $('#drawer')?.classList.add('open'); $('#scrim')?.classList.add('open'); if (!openDrawer.w && state.user?.settings?.lat != null) { openDrawer.w = 1; fetch('/api/worship-plus/halal/warm', { method: 'POST', credentials: 'same-origin' }).catch(() => {}); } }
export function closeDrawer() { $('#drawer')?.classList.remove('open'); $('#scrim')?.classList.remove('open'); }

// ---------- Bottom sheet ----------
export function sheet(html, onMount) {
  const sc = document.createElement('div'); sc.className = 'sheet-scrim';
  const sh = document.createElement('div'); sh.className = 'sheet'; sh.setAttribute('role', 'dialog'); sh.innerHTML = '<div class="grab"></div>' + html;
  document.body.append(sc, sh);
  requestAnimationFrame(() => { sc.classList.add('open'); sh.classList.add('open'); });
  let closed = false;
  const close = () => { if (closed) return; closed = true; sc.classList.remove('open'); sh.classList.remove('open'); setTimeout(() => { sc.remove(); sh.remove(); }, 280); window.removeEventListener('hashchange', close); };
  sc.addEventListener('click', close); window.addEventListener('hashchange', close);
  let y0 = null; sh.addEventListener('touchstart', e => { if (sh.scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
  sh.addEventListener('touchmove', e => { if (y0 != null && e.touches[0].clientY - y0 > 90) { y0 = null; close(); } }, { passive: true });
  onMount && onMount(sh, close);
  return close;
}
export function confirmSheet(title, body, okLabel = 'Confirm', danger = false) {
  return new Promise(res => {
    let done = false;
    const close = sheet(`<h3>${esc(title)}</h3><div class="muted" style="margin-bottom:16px">${body}</div><div class="row"><button class="btn ghost grow" id="cNo">Cancel</button><button class="btn ${danger ? 'danger' : 'accent'} grow" id="cYes">${esc(okLabel)}</button></div>`, (sh, cl) => {
      $('#cNo', sh).onclick = () => { done = true; cl(); res(false); };
      $('#cYes', sh).onclick = () => { done = true; cl(); res(true); };
    });
    setTimeout(() => { if (!done) {} }, 0);
  });
}

// ---------- Theme ----------
// Follow the phone's dark mode live (System is the default): re-apply whenever the OS setting flips.
if (window.matchMedia) { const mq = matchMedia('(prefers-color-scheme: dark)'); const on = () => { if ((state.user?.settings?.theme || 'auto') === 'auto') applyPrefs(); }; mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener && mq.addListener(on); }
export function applyPrefs() {
  const s = state.user?.settings || {};
  const theme = s.theme || 'auto';
  const dark = theme === 'dark' || (theme === 'auto' && !!window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-palette', s.palette || 'cream');
  document.documentElement.style.setProperty('--ar-size', (s.arabicSize || 28) + 'px');
  LS.set('theme', theme); LS.set('palette', s.palette || 'cream');
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#F5F4EE';
}
export async function saveSettings(patch, extra = {}) {
  const { user } = await api('/settings', { method: 'PUT', body: { settings: patch, ...extra } });
  state.user = { ...state.user, ...user }; applyPrefs(); return state.user;
}

// ---------- Background nasheed (starts on first interaction; browsers block autoplay with sound) ----------
let nasheed = null, nasheedWanted = null;
const nasheedMuted = () => LS.get('nasheedMuted', false) || state.user?.settings?.nasheed === false;
function nasheedIcon() { return nasheed && !nasheed.paused ? I.music : I.mute; }
function updateNasheedBtn() { const b = $('#nasheedBtn'); if (b) { b.innerHTML = nasheedIcon(); b.classList.toggle('playing', !!(nasheed && !nasheed.paused)); b.setAttribute('aria-label', nasheed && !nasheed.paused ? 'Mute nasheed' : 'Play nasheed'); } }
function fadeTo(target, ms = 1500, after) {
  if (!nasheed) return; const start = nasheed.volume, t0 = performance.now();
  const step = () => { const k = Math.min(1, (performance.now() - t0) / ms); nasheed.volume = Math.max(0, Math.min(1, start + (target - start) * k)); if (k < 1) requestAnimationFrame(step); else after && after(); };
  requestAnimationFrame(step);
}
export function startNasheed() {
  if (nasheedMuted()) { updateNasheedBtn(); return; }
  if (!nasheed) { nasheed = new Audio('/audio/nasheed.mp3'); nasheed.loop = true; nasheed.volume = 0; nasheed.preload = 'auto'; nasheed.addEventListener('play', updateNasheedBtn); nasheed.addEventListener('pause', updateNasheedBtn); }
  if (!nasheed.paused) return;
  nasheed.play().then(() => fadeTo(state.user?.settings?.nasheedVolume ?? 0.25, 2500)).catch(() => { nasheedWanted = true; });
}
export function stopNasheed(fade = true) { if (nasheed && !nasheed.paused) { if (fade) fadeTo(0, 600, () => nasheed.pause()); else nasheed.pause(); } }
export function duckNasheed(on) { if (!nasheed || nasheed.paused) return; fadeTo(on ? 0.03 : (state.user?.settings?.nasheedVolume ?? 0.25), 500); }
function toggleNasheed() {
  if (nasheed && !nasheed.paused) { LS.set('nasheedMuted', true); stopNasheed(); toast('Nasheed muted'); }
  else { LS.set('nasheedMuted', false); if (state.user?.settings?.nasheed === false) saveSettings({ nasheed: true }).catch(() => {}); startNasheed(); toast('Nasheed: “Alhamdulillah” by Jawad Syed'); }
  setTimeout(updateNasheedBtn, 100);
}
// No autoplay on launch: background nasheed only plays when the user turns it on with the music button.
document.addEventListener('visibilitychange', () => { if (document.hidden) stopNasheed(false); });

// ---------- Recording helper (MediaRecorder) ----------
export async function recordAudio({ onLevel, maxMs = 120000, hq = false, voice = false } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone is not available in this browser');
  // hq: recitation mode — mono 48 kHz, no auto-gain pumping, gentle noise suppression, 128 kbps Opus.
  // hq (recitation/voice): phone DSP (noise suppression/AGC) chops long vowels, madd and ghunnah → keep it raw and clean on the server instead.
  const audio = hq ? { channelCount: 1, sampleRate: { ideal: 48000 }, sampleSize: 16, echoCancellation: { ideal: true }, noiseSuppression: { ideal: false }, autoGainControl: { ideal: true }, voiceIsolation: { ideal: false } }
    : { channelCount: 1, sampleRate: { ideal: 48000 }, echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  const stream = await navigator.mediaDevices.getUserMedia({ audio }).catch(() => navigator.mediaDevices.getUserMedia({ audio: true }));
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg;codecs=opus'];
  const mime = types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
  const opts = {}; if (mime) opts.mimeType = mime; if (hq || voice) opts.audioBitsPerSecond = hq ? 128000 : 64000;
  let rec; try { rec = new MediaRecorder(stream, opts); } catch { rec = new MediaRecorder(stream); }
  const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  let raf = null, ac = null;
  if (onLevel) {
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); const src = ac.createMediaStreamSource(stream); const an = ac.createAnalyser(); an.fftSize = 512; src.connect(an); const buf = new Uint8Array(an.fftSize);
      const loop = () => { an.getByteTimeDomainData(buf); let s = 0; for (const v of buf) s += (v - 128) ** 2; onLevel(Math.sqrt(s / buf.length) / 128); raf = requestAnimationFrame(loop); }; loop(); } catch {}
  }
  const done = new Promise(res => { rec.onstop = () => { cancelAnimationFrame(raf); try { ac && ac.close(); } catch {} stream.getTracks().forEach(t => t.stop()); res(new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' })); }; });
  rec.start(250);
  const timer = setTimeout(() => rec.state !== 'inactive' && rec.stop(), maxMs);
  return { stop: () => { clearTimeout(timer); if (rec.state !== 'inactive') rec.stop(); return done; }, cancel: () => { clearTimeout(timer); rec.onstop = null; try { rec.stop(); } catch {} stream.getTracks().forEach(t => t.stop()); }, done };
}
export async function transcribe(blob, lang, prompt, fast) {
  const qs = new URLSearchParams(); if (lang) qs.set('lang', lang); if (prompt) qs.set('prompt', String(prompt).slice(0, 300)); if (fast) { qs.set('fix', '0'); qs.set('fast', '1'); }
  const r = await fetch('/api/stt' + (qs.toString() ? '?' + qs : ''), { method: 'POST', headers: { 'Content-Type': blob.type || 'audio/webm' }, body: blob, credentials: 'same-origin' });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Transcription failed'); return j.text || '';
}

// ---------- Prayer times ----------
export const METHODS = {
  MuslimProLK: 'Sri Lanka — local mosque timetable (19.65° / 18°)', ACJU: 'ACJU Sri Lanka (18° / 18°)', MuslimWorldLeague: 'Muslim World League (18° / 17°)', NorthAmerica: 'ISNA — North America (15° / 15°)',
  Egyptian: 'Egyptian General Authority (19.5° / 17.5°)', UmmAlQura: 'Umm al-Qura, Makkah (18.5° / 90 min)', Karachi: 'Univ. of Islamic Sciences, Karachi (18° / 18°)', MoonsightingCommittee: 'Moonsighting Committee (Khalid Shaukat)',
  Dubai: 'Dubai (18.2° / 18.2°)', Gulf: 'Gulf Region (19.5° / 90 min)', Kuwait: 'Kuwait (18° / 17.5°)', Qatar: 'Qatar (18° / 90 min)', Jordan: 'Jordan — Ministry of Awqaf (18° / 18°)',
  Singapore: 'MUIS Singapore (20° / 18°)', JAKIM: 'JAKIM Malaysia (20° / 18°)', KEMENAG: 'KEMENAG Indonesia (20° / 18°)', Turkey: 'Diyanet — Turkey', Russia: 'Spiritual Administration of Muslims of Russia (16° / 15°)',
  France: 'UOIF France (12° / 12°)', France15: 'France (15° / 15°)', France18: 'France (18° / 18°)', Portugal: 'Comunidade Islâmica de Lisboa (18° / 77 min)', Morocco: 'Morocco — Ministry of Habous (19° / 17°)',
  Algeria: 'Algeria — Ministry of Religious Affairs (18° / 17°)', Tunisia: 'Tunisia (18° / 18°)', Tehran: 'Institute of Geophysics, Tehran (Shia)', Jafari: 'Jafari — Leva Institute, Qum (Shia)',
  Custom: 'Custom angles (set your own)'
};

export function calcTimes(dayDate = new Date()) {
  const s = state.user?.settings || {};
  if (!validCoordinates(s.lat, s.lng) || typeof adhan === 'undefined') return null;
  const coords = new adhan.Coordinates(+s.lat, +s.lng);
  const p = globalThis.ShukrMethods.params(adhan, s, coords);
  const [y, m, d] = localDay(dayDate).split('-').map(Number);
  const pt = new adhan.PrayerTimes(coords, new Date(y, m - 1, d), p);
  const sun = new adhan.SunnahTimes(pt);
  return { fajr: pt.fajr, sunrise: pt.sunrise, dhuhr: pt.dhuhr, asr: pt.asr, maghrib: pt.maghrib, isha: pt.isha, midnight: sun.middleOfTheNight, lastThird: sun.lastThirdOfTheNight, qibla: adhan.Qibla(coords), source: 'calculated' };
}
// Prayer times are always calculated on-device (no third-party timetables).
const mpCache = {};
export async function loadMP() { return null;
  const s = state.user?.settings || {};
  if (!s.mpCityId || s.useMuslimPro === false || s.methodChosen) return null;
  const key = s.mpCityId; if (mpCache[key] && Date.now() - mpCache[key].t < 6 * 3600e3) return mpCache[key].d;
  try { const { data } = await api('/muslimpro?cityId=' + s.mpCityId); mpCache[key] = { t: Date.now(), d: data }; LS.set('mp.' + key, data); return data; }
  catch { return LS.get('mp.' + key, null); }
}
function zoned(day, hhmm) { return globalThis.ShukrPrayerLocation.zonedTime(day, hhmm, tz()); }
export function computeTimes(dayDate = new Date(), mp = null) {
  const c = calcTimes(dayDate); if (!c) return null;
  const day = localDay(dayDate); const row = mp?.days?.[day];
  if (!state.user?.settings?.methodChosen && state.user?.settings?.useMuslimPro !== false && row && row.length >= 6) { const adj = state.user?.settings?.adjust || {}; ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'].forEach((k, i) => { c[k] = new Date(zoned(day, row[i]).getTime() + (adj[k] || 0) * 60000); }); c.source = 'muslimpro'; }
  return c;
}
export const PRAYERS = [['fajr', 'Fajr', 'الفجر'], ['sunrise', 'Sunrise', 'الشروق'], ['dhuhr', 'Dhuhr', 'الظهر'], ['asr', 'Asr', 'العصر'], ['maghrib', 'Maghrib', 'المغرب'], ['isha', 'Isha', 'العشاء']];
export function nextPrayer(mp) {
  const now = new Date(); const t = computeTimes(now, mp); if (!t) return null;
  for (const [k, n] of PRAYERS) if (k !== 'sunrise' && t[k] > now) return { key: k, name: n, time: t[k], times: t };
  const t2 = computeTimes(new Date(now.getTime() + 864e5), mp); return { key: 'fajr', name: 'Fajr', time: t2.fajr, times: t, tomorrow: true };
}
export const cd = ms => { if (ms < 0) ms = 0; const h = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4), s = Math.floor(ms % 6e4 / 1e3); return (h ? h + 'h ' : '') + m + 'm' + (h ? '' : ' ' + s + 's'); };

export function askAlim(text, mode = 'coach') { sessionStorage.setItem('shukr.ask', text); sessionStorage.setItem('shukr.askMode', mode); go('/chat/new'); }
export function empty(iconKey, text, extra = '') { return `<div class="empty"><div class="big">${I[iconKey] || ''}</div>${text}${extra}</div>`; }
export const loadingHTML = (t = 'Loading…') => `<div class="loading"><span class="spin"></span>${esc(t)}</div>`;
export function ring(pct, size = 76, stroke = 7, label = '') {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r;
  return `<svg class="ring-sm" viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="var(--border)" stroke-width="${stroke}" fill="none"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="var(--accent)" stroke-width="${stroke}" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - Math.min(1, pct))}" transform="rotate(-90 ${size / 2} ${size / 2})"/><text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" font-size="${size / 5}" font-family="var(--serif)" fill="var(--text)">${label}</text></svg>`;
}
