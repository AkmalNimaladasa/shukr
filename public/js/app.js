import { viewEarn, viewReferrals, viewWallet, viewTips, viewProducts, viewProduct, viewAffiliate, viewFreelance, viewFundraisers, viewFundraiser, viewCommunities, viewAdminFundraisers, tipSheet } from './views-earn.js';
import { viewNotifications, viewJobs, viewMarket, viewListing, notifBadge } from './views-social-plus.js';
import { viewAudio } from './views-audio.js';
import { viewQuests, viewUniversity, viewLesson, viewSoundCredits } from './views-creator.js';
import './polyfills.js';
import { $, $$, esc, I, api, state, toast, applyPrefs, route, go, LS, startNasheed, TZ, guessMethod, saveSettings, sectionOn } from './core.js';
import * as D from './views-daily.js';
import * as W from './views-worship.js';
import * as K from './views-knowledge.js';
import * as A from './views-alim.js';
import * as M from './views-more.js';
import { viewFYP, viewLearningProfile, viewProfile } from './views-fyp.js';
import { viewEditProfile, viewProfileSettings } from './views-profile-edit.js';
import * as SC from './views-scholars.js';
import { viewPremium, viewCreator, viewAdvertise, viewAdmin } from './views-money.js';
import { viewSocialHub, mountSocialTabbar } from './views-social-hub.js';
import { watchIncomingCalls } from './calls.js';
import { viewCreate } from './views-social-create.js';
import * as U from './views-ummah.js';
import { viewHabits } from './views-habits.js';
// Referral links: /?ref=CODE → remember for sign-up.
(() => { try { const r = new URLSearchParams(location.search).get('ref'); if (r && /^[a-z0-9]{3,40}$/i.test(r)) { localStorage.setItem('shukrRef', r.toLowerCase()); fetch('/api/ref/click', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: r }) }).catch(() => {}); } } catch {} })();
// Shukr v2 entry: auth, onboarding, router

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); state.deferredPrompt = e; });
window.addEventListener('shukr:logout', () => authView());
const beacon = (kind, extra) => { try { window.shukrBeacon && window.shukrBeacon(kind, extra); } catch (e) {} };
window.addEventListener('unhandledrejection', e => { const m = (e.reason && e.reason.message) || ''; if (m && !/abort|Please sign in/i.test(m)) toast(m); });

function authView(mode = 'login') {
  started();
  const app = $('#app');
  if (mode === 'scholar') {
    app.innerHTML = `<main class="main" style="height:100%"><div class="auth"><span class="logo">${I.logo}</span>${SC.scholarSignupHTML()}<div style="text-align:center;margin-top:8px"><button class="link" id="sw">Back to sign in</button></div></div></main>`;
    $('#sw').onclick = () => authView('login'); let tier = 'teacher';
    $$('#sct button').forEach(b => b.onclick = () => { tier = b.dataset.v; $$('#sct button').forEach(x => x.classList.toggle('on', x === b)); });
    $('#scForm').onsubmit = async e => { e.preventDefault(); const f = e.target; try { await api('/scholar/register', { body: { fullName: f.fullName.value, email: f.email.value, password: f.password.value, tier }, noAuthRedirect: true }); location.hash = '#/scholar'; await boot(null, false); } catch (er) { $('.err', f).textContent = er.message; } };
    return;
  }
  if (mode === 'forgot') {
    app.innerHTML = `<main class="main" style="height:100%"><div class="auth"><span class="logo">${I.logo}</span><h1>Reset password</h1><div class="tagline">We’ll email you a 6-digit code.</div>
      <form id="ff"><input class="input" id="fe" type="email" placeholder="Email" autocomplete="email" required><button class="btn accent block" style="margin-top:14px">Send code</button><div class="err" id="ferr"></div></form>
      <form id="rf" hidden><input class="input otp" id="rc" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code" required style="margin-bottom:10px"><input class="input" id="rp" type="password" autocomplete="new-password" placeholder="New password (6+ characters)" minlength="6" required><button class="btn accent block" style="margin-top:14px">Set new password</button><button type="button" class="link" id="resend" style="margin-top:10px">Send a new code</button><div class="err" id="rerr"></div></form>
      <div style="text-align:center;margin-top:8px"><button class="link" id="sw">Back to sign in</button></div></div></main>`;
    $('#sw').onclick = () => authView('login');
    const send = async () => { $('#ferr').textContent = ''; try { const r = await api('/password/forgot', { body: { email: $('#fe').value }, noAuthRedirect: true }); toast(r.message); $('#ff').hidden = true; $('#rf').hidden = false; $('#rc').focus(); } catch (er) { $('#ferr').textContent = er.message; $('#ff').hidden = false; $('#rf').hidden = true; } };
    $('#ff').onsubmit = e => { e.preventDefault(); send(); };
    $('#resend').onclick = send;
    $('#rf').onsubmit = async e => { e.preventDefault(); $('#rerr').textContent = ''; try { await api('/password/reset', { body: { email: $('#fe').value, code: $('#rc').value, password: $('#rp').value }, noAuthRedirect: true }); toast('Password updated'); const me = await api('/me', { noAuthRedirect: true }); await boot(me.user, false); } catch (er) { $('#rerr').textContent = er.message; } };
    return;
  }
  app.innerHTML = `<main class="main" style="height:100%"><div class="auth">
    <span class="logo">${I.logo}</span><h1>${mode === 'login' ? 'Welcome back' : 'Join Shukr'}</h1>
    <div class="tagline">Short videos that leave you better — plus Alim, Quran, prayer and dhikr in one app.</div>
    <form id="af">${mode === 'register' ? '<input class="input" id="an" placeholder="Your name" autocomplete="name" style="margin-bottom:10px">' : ''}
      <input class="input" id="ae" type="email" placeholder="Email" autocomplete="email" required style="margin-bottom:10px">
      <input class="input" id="ap" type="password" placeholder="Password${mode === 'register' ? ' (8+ characters)' : ''}" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required>
      ${mode === 'login' ? '<div style="text-align:right;margin-top:8px"><button type="button" class="link" id="fg">Forgot password?</button></div>' : ''}
      <button class="btn accent block" style="margin-top:14px">${mode === 'login' ? 'Sign in' : 'Create account'}</button><div class="err" id="aerr"></div></form>
    <div style="text-align:center;margin-top:8px"><button class="link" id="sw">${mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'}</button></div>
    <div class="auth-scholar"><button class="link" id="scl">${I.cap} Islamic scholar? Sign up as a scholar</button></div></div></main>`;
  $('#scl').onclick = () => authView('scholar');
  $('#sw').onclick = () => authView(mode === 'login' ? 'register' : 'login');
  $('#fg')?.addEventListener('click', () => authView('forgot'));
  $('#af').onsubmit = async e => { e.preventDefault(); $('#aerr').textContent = '';
    try { const r = await api('/' + mode, { body: { email: $('#ae').value, password: $('#ap').value, name: $('#an')?.value, ref: localStorage.getItem('shukrRef') || undefined }, noAuthRedirect: true }); await boot(r.user, mode === 'register'); }
    catch (er) { $('#aerr').textContent = er.message; } };
}

async function boot(user, isNew) {
  const me = await api('/me'); state.user = me.user; state.ai = me.ai; state.vapid = me.vapid; state.flags = me.flags || {}; document.documentElement.classList.toggle('recite-on', !!state.flags.recitation);
  if (!state.user.settings.tz || state.user.settings.tz === 'UTC') { await saveSettings({ tz: TZ, ...(state.user.settings.lat == null ? { method: guessMethod(TZ) } : {}) }).catch(() => {}); }
  applyPrefs();
  if (isNew) { location.hash = '#/welcome'; }
  if (state.user.settings.lat == null && LS.get('askedLoc', false) === false) { LS.set('askedLoc', true); W.locate(true).catch(() => {}); }
  router();
}

function welcome() {
  const app = $('#app'); app.innerHTML = `<main class="main" style="height:100%"><div class="auth">
    <span class="logo">${I.logo}</span><h1>Assalamu ‘alaykum${state.user.name ? ', ' + esc(state.user.name.split(' ')[0]) : ''}</h1>
    <div class="tagline">Three quick steps for accurate prayer times and gentle reminders.</div>
    <button class="btn ghost block" id="w1" style="margin-bottom:10px">${I.pin} Use my location</button>
    <button class="btn ghost block" id="w2" style="margin-bottom:10px">${I.clock} Turn on prayer & Jummah alerts</button>
    <button class="btn accent block" id="w3">Start</button>
    <div class="faint small" style="margin-top:14px;text-align:center">Install Shukr: in Safari tap Share → Add to Home Screen; in Chrome tap ⋮ → Install app.</div></div></main>`;
  $('#w1').onclick = () => W.locate().then(() => { $('#w1').innerHTML = `${I.check} ${esc(state.user.settings.city || 'Location set')}`; }).catch(() => {});
  $('#w2').onclick = () => M.enablePush().then(() => { $('#w2').innerHTML = `${I.check} Reminders on`; }).catch(e => toast(e.message, 4000));
  $('#w3').onclick = () => go('/');
}

const ROUTES = [
  [/^\/$/, (m,q) => viewFYP(q)], [/^\/today$/, () => D.viewHome()],
  [/^\/u\/([a-z0-9_]{1,20})$/, m => viewProfile(m[1])], [/^\/profile\/edit$/, () => viewEditProfile()], [/^\/scholars$/, (m, q) => SC.viewScholars(q)], [/^\/scholar$/, () => SC.viewScholarPortal()], [/^\/scholar\/inbox$/, () => SC.viewScholarInbox()], [/^\/scholar\/(\d+)$/, m => SC.viewScholarProfile(m[1])], [/^\/fatwa\/(\d+)$/, m => SC.viewFatwa(m[1])], [/^\/consult\/(\d+)$/, m => SC.viewConsultation(m[1])], [/^\/admin\/scholars$/, () => SC.viewScholarReview()], [/^\/profile\/settings$/, () => viewProfileSettings()], [/^\/premium$/, (m,q) => viewPremium(q)], [/^\/creator$/, () => viewCreator()], [/^\/advertise$/, () => viewAdvertise()], [/^\/admin$/, (m,q) => viewAdmin(q)],
  [/^\/welcome$/, () => welcome()],
  [/^\/fyp$/, (m,q) => viewFYP(q)], [/^\/profile$/, () => viewLearningProfile()],
  [/^\/creator\/quests$/, () => viewQuests()], [/^\/sounds\/credits$/, () => viewSoundCredits()], [/^\/university$/, () => viewUniversity()], [/^\/university\/([a-z0-9-]+)$/, m => viewLesson(m[1])], [/^\/notifications$/, () => viewNotifications()], [/^\/earn$/, () => viewEarn()], [/^\/earn\/tips$/, () => viewTips()], [/^\/earn\/products$/, (m,q) => viewProducts(q)], [/^\/earn\/affiliate$/, () => viewAffiliate()], [/^\/product\/(\d+)$/, (m,q) => viewProduct(m[1],q)], [/^\/referrals$/, () => viewReferrals()], [/^\/wallet$/, () => viewWallet()], [/^\/freelance$/, (m,q) => viewFreelance(q)], [/^\/fundraisers$/, () => viewFundraisers()], [/^\/fundraiser\/(\d+)$/, m => viewFundraiser(m[1])], [/^\/communities$/, (m,q) => viewCommunities(q)], [/^\/admin\/fundraisers$/, () => viewAdminFundraisers()], [/^\/jobs$/, (m,q) => viewJobs(q)], [/^\/market$/, (m,q) => viewMarket(q)], [/^\/market\/(\d+)$/, m => viewListing(m[1])], [/^\/audio$/, () => viewAudio()],
  [/^\/create$/, (m,q) => viewCreate(q)], [/^\/social$/, () => go('/fyp')], [/^\/(explore|stories|activity|messages|rights)$/, (m,q) => viewSocialHub(m[1],q)],
  [/^\/habits$/, () => viewHabits(), 'habits'],
  [/^\/journal\/new$/, () => D.viewJournalNew(), 'journal'], [/^\/journal$/, () => D.viewJournal(), 'journal'],
  [/^\/blessings$/, () => D.viewBlessings(), 'blessings'],
  [/^\/dhikr$/, () => D.viewDhikr(), 'dhikr'],
  [/^\/adhkar$/, () => D.viewAdhkarList(), 'adhkar'], [/^\/adhkar\/(\w+)$/, m => D.viewAdhkar(m[1]), 'adhkar'], [/^\/duas\/(\d+)$/, m => D.viewDuas(m[1]), 'adhkar'],
  [/^\/akhirah$/, () => D.viewAkhirah(), 'akhirah'], [/^\/names$/, () => D.viewNames(), 'names'], [/^\/feedback$/, () => D.viewFeedback()],
  [/^\/prayer$/, () => W.viewPrayer(), 'prayer'], [/^\/qibla$/, () => W.viewQibla(), 'qibla'], [/^\/calendar$/, () => W.viewCalendar(), 'calendar'],
  [/^\/fasting$/, () => W.viewFasting(), 'fasting'], [/^\/mosques$/, (m, q) => U.viewMosqueMap(q), 'mosques'], [/^\/mosque\/([\w-]+)$/, m => U.viewMosque(decodeURIComponent(m[1])), 'mosques'], [/^\/jummah$/, () => U.viewJummah(), 'ummah'], [/^\/zakat$/, () => W.viewZakat(), 'zakat'],
  [/^\/quran$/, () => K.viewQuran(), 'quran'], [/^\/quran\/(\d+)$/, (m, q) => K.viewSurah(m[1], +q.get('a') || 1), 'quran'],
  [/^\/hadith$/, () => K.viewHadithHome(), 'hadith'], [/^\/hadith\/(\w+)(?:\/(\d+))?$/, m => K.viewHadithBook(m[1], m[2]), 'hadith'],
  [/^\/hifz$/, () => K.viewHifz(), 'hifz'], [/^\/hifz\/review$/, (m, q) => K.viewHifzReview(q.get('s')), 'hifz'], [/^\/hifz\/surah\/(\d+)$/, m => K.viewHifzSurah(m[1]), 'hifz'],
  [/^\/tajweed$/, () => K.viewTajweed(), 'tajweed'], [/^\/tajweed\/practice$/, (m, q) => K.viewTajweedPractice(q.get('s'), q.get('a')), 'tajweed'],
  [/^\/learn$/, () => K.viewLearn(), 'learn'], [/^\/learn\/(\d+)$/, m => K.viewLesson(m[1]), 'learn'],
  [/^\/audiobooks(?:\/(.+))?$/, m => K.viewAudiobooks(m[1] && decodeURIComponent(m[1])), 'audiobooks'],
  [/^\/chat(?:\/(new|\d+))?$/, m => A.viewChat(m[1] || 'new'), 'alim'], [/^\/memory$/, () => A.viewMemory()],
  [/^\/insights$/, () => M.viewInsights(), 'insights'],
  [/^\/ummah$/, () => U.viewUmmahHub(), 'ummah'], [/^\/ummah\/feed$/, () => M.viewUmmah(), 'ummah'], [/^\/ummah\/edit$/, () => M.viewUmmah('edit'), 'ummah'], [/^\/ummah\/admin$/, () => M.viewUmmahAdmin(), 'ummah'], [/^\/ummah\/u\/([\w]+)$/, m => M.viewUmmahUser(m[1]), 'ummah'],
  [/^\/settings$/, () => M.viewSettings()]
];
let seq = 0;
async function router() {
  if (!state.user) return;
  watchIncomingCalls();
  const full = route(); const [path, qs] = full.split('?'); const q = new URLSearchParams(qs || '');
  const my = ++seq;
  for (const [re, fn, sec] of ROUTES) {
    const m = path.match(re); if (!m) continue;
    if (sec && !sectionOn(sec)) { toast('This section is hidden — enable it in Settings'); return go('/'); }
    try { await fn(m, q);
      // Social screens always keep the TikTok-style bottom bar.
      const SOC = /^\/(fyp|explore|stories|activity|messages|notifications|profile|u\/|post|jobs|market|earn|referrals|wallet|freelance|fundraiser|communities|product|audio|search|creator|story)/;
      if (my === seq && SOC.test(path) && !document.querySelector('.social-tabbar') && !document.documentElement.classList.contains('dm-open')) {
        const sec = path.startsWith('/u/') || path.startsWith('/profile') ? 'profile' : path.startsWith('/explore') || path.startsWith('/stories') || path.startsWith('/search') ? 'explore' : /^\/(messages|activity|notifications)/.test(path) ? 'notifications' : 'none';
        mountSocialTabbar(sec); }
    } catch (e) { if (my !== seq) return; console.error(e); beacon('route-error', { route: path, message: String(e && e.message), stack: String(e && e.stack || '').slice(0, 600) }); const pg = $('#page') || $('#app'); if (pg) pg.innerHTML = `<div class="empty" style="padding-top:60px"><div class="big">${I.alert}</div>Something went wrong: ${esc(e && e.message)}<div style="margin-top:12px;display:flex;gap:8px;justify-content:center"><button class="btn sm" data-go-home>Go home</button><button class="btn ghost sm" data-repair>Repair</button></div></div>`; }
    return;
  }
  go('/');
}
window.addEventListener('hashchange', () => router());
import('./i18n.js').then(m => m.initI18n()).catch(() => {});

function started() {
  if (window.__shukrStarted) return; window.__shukrStarted = true; const b = document.getElementById('boot'); if (b) b.remove();
  beacon('started', { route: location.hash, loggedIn: !!state.user, ua: navigator.userAgent.slice(0, 120) });
  // Watchdog: if the screen is ever empty for 4s, report it and offer a repair instead of a blank page
  let emptyFor = 0;
  setInterval(() => {
    const app = document.getElementById('app'); const txt = app ? app.innerText.trim() : '';
    if (txt.length < 3) { emptyFor++; if (emptyFor === 2) { beacon('empty-screen', { route: location.hash, html: app ? app.innerHTML.slice(0, 300) : 'no #app' });
      if (app) app.innerHTML = '<div class="empty" style="padding-top:80px">Shukr hit a problem showing this page.<div style="margin-top:14px;display:flex;gap:8px;justify-content:center"><button class="btn sm" data-go-home>Go home</button><button class="btn ghost sm" data-repair>Repair</button></div></div>'; } }
    else emptyFor = 0;
  }, 2000);
}
(async function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  try { await boot(); } catch (e) { if (e && e.status !== 401 && !/sign in|auth/i.test(e.message || '')) { console.warn('boot', e); beacon('boot-error', { message: String(e && e.message), stack: String(e && e.stack || '').slice(0, 600) }); } authView(); }
  started();
})();

// CSP-safe replacement for inline onclick on error screens
document.addEventListener('click', e => { if (!e.target.closest) return; if (e.target.closest('[data-go-home]')) { location.hash = '#/'; location.reload(); } else if (e.target.closest('[data-repair]') && window.shukrRepair) window.shukrRepair(); });
