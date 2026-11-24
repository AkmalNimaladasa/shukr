// Install Shukr (PWA "Add to Home Screen"). Uses Chrome/Edge/Samsung's native prompt when available,
// otherwise shows step-by-step instructions for the user's browser (iPhone Safari, Firefox, in-app browsers…).
import { $, I, LS, state, toast, vibrate, sheet, esc } from './core.js';

const ua = navigator.userAgent;
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /android/i.test(ua);
const isMobile = isIOS || isAndroid || /mobile/i.test(ua);
const inApp = /FBAN|FBAV|Instagram|Line\/|TikTok|musical_ly|Snapchat|Twitter|WhatsApp|GSA\//i.test(ua);
const browser = /SamsungBrowser/i.test(ua) ? 'samsung' : /Firefox|FxiOS/i.test(ua) ? 'firefox' : /EdgA|EdgiOS|Edg\//i.test(ua) ? 'edge' : /OPR|Opera/i.test(ua) ? 'opera'
  : isIOS && /CriOS/i.test(ua) ? 'ios-chrome' : isIOS ? 'safari' : /Chrome/i.test(ua) ? 'chrome' : 'other';

const listeners = new Set();
const notify = () => listeners.forEach(f => { try { f(); } catch {} });
export const onInstallChange = f => { listeners.add(f); return () => listeners.delete(f); };
export const canPrompt = () => !!state.deferredPrompt;
export const showInstall = () => !isStandalone() && !LS.get('installed', false);

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); state.deferredPrompt = e; notify(); });
window.addEventListener('appinstalled', () => { state.deferredPrompt = null; LS.set('installed', true); notify(); toast('Shukr is installed — open it from your home screen'); document.querySelector('.ins-pill')?.remove(); });

const steps = () => {
  const share = `<span class="ins-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg></span>`, dots = '<span class="ins-ic">⋮</span>', plus = `<span class="ins-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg></span>`;
  if (inApp) return { t: 'Open in your browser first', s: [`Tap the <b>⋯</b> or <b>⋮</b> menu in this app`, `Choose <b>Open in browser</b> (Chrome or Safari)`, `Then tap <b>Install Shukr</b> again`] };
  switch (browser) {
    case 'safari': return { t: 'Add Shukr to your Home Screen', s: [`Tap ${share} <b>Share</b> at the bottom of Safari`, `Scroll down and tap ${plus} <b>Add to Home Screen</b>`, `Tap <b>Add</b> — Shukr appears on your home screen`] };
    case 'ios-chrome': return { t: 'Add Shukr to your Home Screen', s: [`Tap ${share} <b>Share</b> in the address bar`, `Tap ${plus} <b>Add to Home Screen</b>`, `Tap <b>Add</b>`] };
    case 'samsung': return { t: 'Install Shukr', s: [`Tap the <b>☰</b> menu at the bottom`, `Tap ${plus} <b>Add page to</b> → <b>Home screen</b>`, `Tap <b>Add</b>`] };
    case 'firefox': return { t: 'Install Shukr', s: [`Tap ${dots} the menu`, `Tap <b>Install</b> (or <b>Add to Home screen</b>)`, `Confirm with <b>Add</b>`] };
    case 'edge': case 'opera': return { t: 'Install Shukr', s: [`Tap the menu (${dots} or ☰)`, `Tap <b>Add to phone</b> / <b>Install app</b>`, `Confirm with <b>Install</b>`] };
    default: return isMobile ? { t: 'Install Shukr', s: [`Tap ${dots} at the top right of Chrome`, `Tap <b>Add to Home screen</b> or <b>Install app</b>`, `Tap <b>Install</b>`] }
      : { t: 'Install Shukr on this computer', s: [`Click the install icon <span class="ins-ic">⊕</span> at the right of the address bar`, `Or open ${dots} → <b>Cast, save and share</b> → <b>Install page as app</b>`, `Click <b>Install</b>`] };
  }
};

export async function installApp() {
  vibrate(10);
  if (isStandalone()) return toast('Shukr is already installed on this device');
  if (state.deferredPrompt) {
    const p = state.deferredPrompt; state.deferredPrompt = null;
    try { await p.prompt(); const r = await p.userChoice; if (r?.outcome === 'accepted') { LS.set('installed', true); notify(); return; } } catch {}
    notify(); return;
  }
  const g = steps();
  sheet(`<div class="ins-sheet"><div class="ins-app"><img src="/icons/icon-192.png?v=2" alt=""><div><b>Shukr</b><small>Free · works offline · no app store needed</small></div></div>
    <h3>${esc(g.t)}</h3><ol class="ins-steps">${g.s.map(x => `<li>${x}</li>`).join('')}</ol>
    <div class="ins-perks"><span>${I.clock} Prayer alerts</span><span>${I.sparkle} Opens instantly</span><span>${I.phone} Full screen</span></div>
    <button class="btn accent block" data-close>Got it</button></div>`, (el, close) => { el.querySelector('[data-close]').onclick = close; });
}

window.shukrInstall = () => installApp();

// Floating install pill on mobile browsers (dismissible for 7 days).
export function mountInstallPill() {
  if (!isMobile || !showInstall() || document.querySelector('.ins-pill')) return;
  const until = LS.get('installPillHide', 0); if (until && Date.now() < until) return;
  const visits = LS.get('visits', 0) + 1; LS.set('visits', visits);
  const el = document.createElement('div'); el.className = 'ins-pill';
  el.innerHTML = `<button class="ins-go"><img src="/icons/icon-192.png?v=2" alt=""><span><b>Shukr app</b><small>Faster, full screen, prayer alerts</small></span><i>${I.download}Install</i></button><button class="ins-x" aria-label="Not now">${I.x}</button>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  el.querySelector('.ins-go').onclick = () => installApp();
  el.querySelector('.ins-x').onclick = () => { LS.set('installPillHide', Date.now() + 7 * 864e5); el.classList.remove('in'); setTimeout(() => el.remove(), 300); };
  onInstallChange(() => { if (!showInstall()) el.remove(); });
}
