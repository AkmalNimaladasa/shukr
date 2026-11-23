// FYP: finite, swipeable learning sessions. No completion credit for merely scrolling.
import { $, $$, esc, escAttr, I, api, state, shell, go, bindGo, sheet, toast, onCleanup, askAlim, duckNasheed, refreshDrawer, openDrawer } from './core.js';
import { deckIndex, sessionProgress, safeSource } from './fyp-utils.js';
import { mountSocialTabbar } from './views-social-hub.js';
import { trackFeedEngagement } from './fyp-engagement.js';
import { heartBurst, haptic, bumpStreak, streakBadge, onWatched } from './engage.js';
import { storiesTrayHTML, bindStoryTray, sendToSheet, openStories, peopleSearchHTML, bindPeopleSearch, notifBadge } from './views-social-plus.js';

const topicIcons = { quran:'quran', sunnah:'scroll', character:'heart', wellbeing:'sun', learning:'brain', world:'compass' };
const topicLabel = (topics,id) => topics.find(t => t.id === id)?.label || id;
const compact = n => n>=1e6?(n/1e6).toFixed(n<1e7?1:0).replace(/\.0$/,'')+'M':n>=1e3?(n/1e3).toFixed(n<1e4?1:0).replace(/\.0$/,'')+'K':String(n);
// TikTok-style solid rail icons
const TT = {
  heart:'<svg viewBox="0 0 48 48" fill="currentColor"><path d="M24 42.6c-.6 0-1.2-.2-1.7-.6C11.6 33.4 4 26.7 4 17.9 4 11.2 9.1 6 15.5 6c3.6 0 6.7 1.7 8.5 4.4C25.8 7.7 28.9 6 32.5 6 38.9 6 44 11.2 44 17.9c0 8.8-7.6 15.5-18.3 24.1-.5.4-1.1.6-1.7.6Z"/></svg>',
  comment:'<svg viewBox="0 0 48 48" fill="currentColor"><path d="M24 5C12.4 5 3 13 3 23c0 5.6 3 10.6 7.6 13.9l-1.4 6.5c-.2 1 .8 1.7 1.7 1.2l7.8-4.3c1.7.4 3.5.6 5.3.6 11.6 0 21-8 21-18S35.6 5 24 5Zm-9 21a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm9 0a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm9 0a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"/></svg>',
  save:'<svg viewBox="0 0 48 48" fill="currentColor"><path d="M11 4h26a3 3 0 0 1 3 3v36.2c0 1.3-1.5 2-2.5 1.2L24 34.3 10.5 44.4c-1 .8-2.5.1-2.5-1.2V7a3 3 0 0 1 3-3Z"/></svg>',
  repost:'<svg viewBox="0 0 48 48" fill="currentColor"><path d="M33.6 5.4a2 2 0 0 1 2.8 0l6.2 6.2a2 2 0 0 1 0 2.8l-6.2 6.2a2 2 0 0 1-2.8-2.8l2.8-2.8H15a6 6 0 0 0-6 6v3a2 2 0 1 1-4 0v-3c0-5.5 4.5-10 10-10h21.4l-2.8-2.8a2 2 0 0 1 0-2.8Zm-19.2 22a2 2 0 0 1 0 2.8l-2.8 2.8H33a6 6 0 0 0 6-6v-3a2 2 0 1 1 4 0v3c0 5.5-4.5 10-10 10H11.6l2.8 2.8a2 2 0 1 1-2.8 2.8l-6.2-6.2a2 2 0 0 1 0-2.8l6.2-6.2a2 2 0 0 1 2.8 0Z"/></svg>',
  share:'<svg viewBox="0 0 48 48" fill="currentColor"><path d="M26.4 4.6a2 2 0 0 1 2.1.3l16.2 14.4a2 2 0 0 1 0 3L28.5 36.6a2 2 0 0 1-3.3-1.5v-7C14.6 28.3 8.4 32.4 5.2 40.3a1.2 1.2 0 0 1-2.3-.5C4.1 25.4 11.8 16.9 25.2 15.6V6.4a2 2 0 0 1 1.2-1.8Z"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M12 6v12M6 12h12"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 12 4 4 8-8"/></svg>',
  sound:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9h3.5L12 5v14l-4.5-4H4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  muted:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9h3.5L12 5v14l-4.5-4H4z"/><path d="m16 9 5 6m0-6-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  gift:'<svg viewBox="0 0 48 48" fill="currentColor"><path d="M17.5 5c2.6 0 4.9 1.7 6.5 4 1.6-2.3 3.9-4 6.5-4C34 5 36 7.6 36 10.5c0 1.3-.4 2.5-1.1 3.5H41a3 3 0 0 1 3 3v5a2 2 0 0 1-2 2h-16V14h-4v10H6a2 2 0 0 1-2-2v-5a3 3 0 0 1 3-3h6.1a6 6 0 0 1-1.1-3.5C12 7.6 14 5 17.5 5Zm0 4c-1 0-1.5.7-1.5 1.5 0 1.5 1.6 3.5 5.6 3.5-.6-2.7-2.3-5-4.1-5Zm13 0c-1.8 0-3.5 2.3-4.1 5 4 0 5.6-2 5.6-3.5 0-.8-.5-1.5-1.5-1.5ZM7 28h15v16h-11a4 4 0 0 1-4-4Zm19 0h15v12a4 4 0 0 1-4 4H26Z"/></svg>',
};
const BRAND = {
  whatsapp:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>',
  telegram:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"/></svg>',
  facebook:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/></svg>',
  sms:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6.1L4.5 21l4.3-2.3c1 .2 2.1.3 3.2.3 5.5 0 10-3.6 10-8s-4.5-8-10-8Z"/></svg>',
  instagram:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4ZM17.3 5.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4ZM12 2.2c2.7 0 3 0 4 .1 2.7.1 4 1.4 4.1 4.1.1 1 .1 1.3.1 4s0 3-.1 4c-.1 2.7-1.4 4-4.1 4.1-1 .1-1.3.1-4 .1s-3 0-4-.1c-2.7-.1-4-1.4-4.1-4.1-.1-1-.1-1.3-.1-4s0-3 .1-4C4 3.7 5.3 2.4 8 2.3c1 0 1.3-.1 4-.1ZM12 0C9.3 0 8.9 0 7.9.1 4.2.2 2.2 2.2 2.1 5.9 2 6.9 2 7.3 2 10s0 3.1.1 4.1c.1 3.7 2.1 5.7 5.8 5.8 1 .1 1.4.1 4.1.1s3.1 0 4.1-.1c3.7-.1 5.7-2.1 5.8-5.8.1-1 .1-1.4.1-4.1s0-3.1-.1-4.1C21.8 2.2 19.8.2 16.1.1 15.1 0 14.7 0 12 0Z"/></svg>',
  messenger:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.4 2 2 6.1 2 11.7c0 2.9 1.2 5.5 3.3 7.2V22l3-1.7c1.1.3 2.3.5 3.7.5 5.6 0 10-4.1 10-9.7S17.6 2 12 2Zm1 12.9-2.5-2.7-5 2.7 5.5-5.8 2.6 2.7 4.9-2.7-5.5 5.8Z"/></svg>',
  linkedin:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 2h-17A1.5 1.5 0 0 0 2 3.5v17A1.5 1.5 0 0 0 3.5 22h17a1.5 1.5 0 0 0 1.5-1.5v-17A1.5 1.5 0 0 0 20.5 2ZM8 19H5v-9h3Zm-1.5-10.3a1.7 1.7 0 1 1 0-3.5 1.7 1.7 0 0 1 0 3.5ZM19 19h-3v-4.7c0-1.1 0-2.6-1.6-2.6s-1.8 1.2-1.8 2.5V19h-3v-9h2.9v1.2a3.1 3.1 0 0 1 2.8-1.5c3 0 3.6 2 3.6 4.6Z"/></svg>',
  reddit:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12.1a2.2 2.2 0 0 0-3.7-1.6 10.8 10.8 0 0 0-5.8-1.8l1-4.6 3.2.7a1.6 1.6 0 1 0 .2-.9l-3.6-.8a.5.5 0 0 0-.5.3l-1.1 5.2a10.8 10.8 0 0 0-5.9 1.8 2.2 2.2 0 1 0-2.4 3.6v.6c0 3.4 4 6.2 8.8 6.2s8.8-2.8 8.8-6.2v-.6A2.2 2.2 0 0 0 22 12.1ZM7 13.7a1.6 1.6 0 1 1 1.6 1.6A1.6 1.6 0 0 1 7 13.7Zm8.9 4.2a5.8 5.8 0 0 1-3.8 1.2 5.8 5.8 0 0 1-3.8-1.2.4.4 0 0 1 .6-.6 5 5 0 0 0 3.2 1 5 5 0 0 0 3.2-1 .4.4 0 0 1 .6.6Zm-.3-2.6a1.6 1.6 0 1 1 1.6-1.6 1.6 1.6 0 0 1-1.6 1.6Z"/></svg>',
  qr:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v1M14 20h1M17 17h4v4h-4"/></svg>',
  download:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0-5-5m5 5 5-5M4 20h16"/></svg>',
  dm:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/></svg>',
  notint:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 21s-7-4.4-9.2-9A5 5 0 0 1 12 6a5 5 0 0 1 9.2 6c-.4.8-1 1.6-1.6 2.4M3 3l18 18"/></svg>',
  mail:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>'
};
const sourceHTML = sources => (sources || []).filter(s => safeSource(s.url)).map(s => `<a href="${escAttr(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ${I.external || '↗'}</a>`).join('');

export async function viewFYP(query) {
  const p = shell('For You', {flush:true, noPad:true});
  // Full-bleed, dark, TikTok-style stage: the regular top bar is hidden while the feed is open.
  document.documentElement.classList.add('immersive'); mountSocialTabbar('fyp');
  onCleanup(()=>document.documentElement.classList.remove('immersive'));
  p.className = 'fyp-page'; p.innerHTML = '<div class="fyp-loading"><span class="spin"></span></div>';
  if (query?.get('saved') === '1') { go('/profile?tab=saved'); return; }
  let alive = true, request = 0, tab = query?.get('saved') === '1' ? 'saved' : query?.get('tab') === 'following' ? 'following' : 'for-you', topic = 'all', offset = 0, items = [], topics = [], hasMore = false, nextOffset = 0, index = 0;
  let speech = null, scroller = null, observer = null, format = ['reel','carousel','image'].includes(query?.get('format'))?query.get('format'):'all', scrollTick = null, stopTracking = null, post = query?.get('post') || '';
  // Sound: TikTok plays with sound once the user has interacted; remember their mute choice.
  let soundOn = localStorage.getItem('shukr.sound') !== '0';
  // The icon always reflects what you actually hear (a browser may force a video muted until you tap).
  function syncSoundUI(){$$('[data-lesson]',p).forEach(card=>{const v=$('video',card);const audible=!!v&&!v.muted;card.classList.toggle('needs-tap-sound',!!v&&soundOn&&v.muted&&!card.hasAttribute('data-silent'));$$('[data-sound]',card).forEach(b=>{b.innerHTML=audible?TT.sound:TT.muted;b.setAttribute('aria-label',audible?'Mute':'Unmute');b.setAttribute('aria-pressed',String(!audible));});});}
  function setSound(on){soundOn=on;localStorage.setItem('shukr.sound',on?'1':'0');$$('video',p).forEach(v=>{if(!v.closest('[data-silent]'))v.muted=!on;});syncSoundUI();}
  // Browsers block autoplay with sound until the first tap; on that tap, unmute the playing video (TikTok behaviour).
  // Only click/touchend/keydown count as the user's tap on Android Chrome (pointerdown does not), so listen to those
  // and keep listening until a reel has actually gone audible — the first tap may land on a photo post.
  let audioUnlocked=false, unlockedAt=0;
  const unlock=()=>{if(audioUnlocked)return;audioUnlocked=true;{const c=$$('[data-lesson]',p)[index];const cv=c&&$('video',c);if(cv&&cv.muted&&soundOn&&!c.hasAttribute('data-silent')&&!cv.paused)unlockedAt=Date.now();}
    // Prime every reel inside this gesture so later swipes can start with sound.
    $$('video',p).forEach(v=>{if(v.closest('[data-silent]')||!soundOn)return;const card=v.closest('[data-lesson]');if(+card.dataset.index===index){v.muted=false;if(v.paused&&!v.dataset.userPaused)v.play().catch(()=>{v.muted=true;audioUnlocked=false;syncSoundUI();});}});
    syncSoundUI();};
  const unlockEvents=['click','touchend','keydown'];
  unlockEvents.forEach(ev=>document.addEventListener(ev,unlock,true));onCleanup(()=>unlockEvents.forEach(ev=>document.removeEventListener(ev,unlock,true)));
  function updateCounts(x) {
    const el=$$('[data-lesson]',p).find(el=>el.dataset.lesson===String(x.id));if(!el)return;
    $$('[data-count]',el).forEach(c=>{const n=Number(x.counts?.[c.dataset.count])||0;c.textContent=n>0?compact(n):(c.dataset.label||'');});
  }
  function pauseMedia(except) {
    $$('video',p).forEach(v=>{if(v!==except)v.pause();});
    if (!except || except.muted || except.paused) duckNasheed(false);
  }
  function disposeMedia() { if(stopTracking)stopTracking();stopTracking=null;pauseMedia(); if(observer)observer.disconnect(); observer=null; clearTimeout(scrollTick); }
  function hidden() { if(document.hidden){pauseMedia();stopSpeech();} }
  function leave() { pauseMedia();stopSpeech(); }
  document.addEventListener('visibilitychange',hidden);
  window.addEventListener('pagehide',leave);
  onCleanup(()=>{disposeMedia();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',leave);});
  function stopSpeech() { if (speech && window.speechSynthesis) speechSynthesis.cancel(); speech = null; duckNasheed(false); $$('.fyp-listen').forEach(b=>{b.classList.remove('on');b.setAttribute('aria-pressed','false');}); }
  onCleanup(() => { alive = false; request++; stopSpeech(); document.removeEventListener('keydown', keys); });
  function jump(n) {
    if (!scroller) return; index = deckIndex(n,items.length); stopSpeech();pauseMedia();
    scroller.scrollTo({top:index * scroller.clientHeight, behavior:'auto'});setTimeout(autoplay,120);
  }
  // TikTok-style: the reel fully in view plays (muted, silent originals); everything else is paused.
  function autoplay() {
    if(!alive||document.hidden||document.querySelector('.sheet.open'))return;
    const card=$$('[data-lesson]',p)[index];const v=card&&$('video',card);
    if(v&&v.paused&&!v.ended&&!v.dataset.userPaused)playReel(v,card);
    if(card?.dataset.ad&&!card.dataset.seen){card.dataset.seen='1';const nx=card.dataset.next||null;api(`/ads/${encodeURIComponent(card.dataset.lesson)}/impression`,{body:{nextTo:nx}}).catch(()=>{});}
  }
  // Start a reel: with sound when allowed, otherwise muted (and show "Tap for sound"), retrying when data arrives.
  function playReel(v,card){
    if(!card.hasAttribute('data-silent'))v.muted=!soundOn;
    if(v.readyState<2){v.preload='auto';const once=()=>{v.removeEventListener('canplay',once);if(+card.dataset.index===index&&v.paused&&!v.dataset.userPaused)playReel(v,card);};v.addEventListener('canplay',once);if(v.networkState===0||v.networkState===3)v.load();}
    const pr=v.play();if(pr&&pr.catch)pr.then(syncSoundUI).catch(err=>{if(err&&err.name==='AbortError')return;if(!v.muted){v.muted=true;audioUnlocked=false;v.play().then(syncSoundUI).catch(()=>{card.classList.add('needs-tap-play');syncSoundUI();});}else{card.classList.add('needs-tap-play');syncSoundUI();}});
    // warm the next reel so swiping is instant
    const next=$$('[data-lesson]',p)[index+1];const nv=next&&$('video',next);if(nv&&nv.preload!=='auto'){nv.preload='auto';}
  }
  function keys(e) { if (!alive || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || document.querySelector('.sheet.open')) return;
    if (['ArrowDown','PageDown','ArrowUp','PageUp'].includes(e.key)) {e.preventDefault();jump(index + (['ArrowDown','PageDown'].includes(e.key)?1:-1));}
  }
  document.addEventListener('keydown',keys);
  function progress() {
    const el = $('#fypSession',p); if (el) el.textContent = `${sessionProgress(items)} learned · ${items.length} in this session`;
    
  }
  function article(x,n) {
    const m=x.media||{}, slides=m.slides||[];
    const local=s=>typeof s==='string' && (/^\/media\/(fyp|house)\/[a-zA-Z0-9_./-]+$/.test(s) || /^\/ugc\/[a-f0-9-]{36}\.[a-z0-9]{3,4}$/.test(s)) && !s.includes('..') ? escAttr(s) : '';
    const image=(s,alt)=>`<div class="fyp-frame"><img class="fyp-backdrop" src="${local(s)}" alt="" aria-hidden="true" loading="lazy" decoding="async"><img class="fyp-art${m.ugc?' ugc':''}" src="${local(s)}" alt="${escAttr(alt||x.title)}" loading="${n===0?'eager':'lazy'}" decoding="async"><div class="fyp-media-error" hidden><p>Couldn’t load this image.</p><button data-media-retry>Retry</button></div></div>`;
    const silent=!!x.silent;
    // Every reel fills the 9:16 screen (object-fit: cover), like TikTok.
    const media=x.format==='reel'
      ? `<video class="fill" src="${local(m.src)}" ${local(m.poster)?`poster="${local(m.poster)}"`:''} playsinline ${silent||!soundOn?'muted':''} preload="${n<2?'auto':'metadata'}" aria-label="${escAttr(m.alt||x.title)}"></video><button class="fyp-reel-play" data-play aria-label="Play">${I.play}</button><div class="fyp-video-status" role="status"></div><div class="fyp-media-error" hidden><p>This video couldn’t play.</p><button data-media-retry>Retry</button></div><div class="fyp-progress" aria-hidden="true"><i></i></div>${silent?'':`<button class="fyp-sound" data-sound aria-label="${soundOn?'Mute':'Unmute'}">${soundOn?TT.sound:TT.muted}</button><button class="fyp-tapsound" data-tapsound type="button">${TT.muted}<span>Tap for sound</span></button>`}`
      : x.format==='carousel' && slides.length
        ? `<div class="fyp-carousel" tabindex="0" role="region" aria-label="Carousel slides">${slides.map((s,i)=>`<div class="fyp-slide" role="group" aria-label="Slide ${i+1} of ${slides.length}">${image(s.src,s.alt)}</div>`).join('')}</div><span class="fyp-slide-count" aria-live="polite">1 / ${slides.length}</span><div class="fyp-carousel-controls"><button data-slide-step="-1" aria-label="Previous slide">${I.back}</button><div class="fyp-dots">${slides.map((_,i)=>`<button data-slide="${i}" aria-label="Go to slide ${i+1}" aria-current="${i===0?'true':'false'}"><span></span></button>`).join('')}</div><button data-slide-step="1" aria-label="Next slide">${I.fwd}</button></div>`
        : image(m.src,m.alt);
    const au=x.author||{}, ugc=!!x.ugc, ad=!!x.sponsored, handle=ad?au.name:ugc?(au.username||'member'):'shukr', name=ad?'Sponsored':ugc?(au.name||'Shukr member'):'Shukr Learning';
    const tag=topicLabel(topics,x.topic||'').replace(/[^\p{L}\p{N}]+/gu,'').toLowerCase();
    const canFollow=ugc&&!au.me&&au.username;
    const avatar=ugc&&au.avatar&&/^data:image\//.test(au.avatar)?`<img src="${escAttr(au.avatar)}" alt="">`:ad?esc((au.name||'A')[0].toUpperCase()):ugc?esc((name[0]||'S').toUpperCase()):I.logo;
    const cls=`fyp-card fyp-post-${escAttr(x.format||'image')}${ad?' is-ad is-ugc':ugc?' is-ugc':' is-editorial'}`;
    return `<article class="${cls}" data-lesson="${escAttr(x.id)}" data-index="${n}" ${silent?'data-silent':''} ${ad?`data-ad="1" data-next="${escAttr(x.nextTo||'')}"`:''} aria-label="${ad?'Sponsored':'Post'} ${n+1}: ${escAttr(x.title||'')}">
      <div class="fyp-media-stage">${media}<div class="fyp-heart-burst" aria-hidden="true">${TT.heart}</div>
      <div class="fyp-rail" role="group" aria-label="Post actions">
        <div class="fyp-avatar-wrap"><${ugc&&!ad?'a':'span'} class="fyp-avatar ${ugc?'user':''}" ${ugc&&!ad?`href="#/u/${escAttr(au.username)}" aria-label="@${escAttr(au.username)} profile"`:'aria-hidden="true"'}>${avatar}</${ugc&&!ad?'a':'span'}>${canFollow?`<button class="fyp-follow ${au.isFollowing?'on':''}" data-action="follow" aria-label="${au.isFollowing?'Following':'Follow'} @${escAttr(au.username)}">${au.isFollowing?TT.check:TT.plus}</button>`:''}</div>
        ${ad?'':`<button class="fyp-action fyp-like ${x.liked?'on':''}" data-action="like" aria-label="Like" aria-pressed="${!!x.liked}"><i>${TT.heart}</i><span data-count="likes" data-label="0"></span></button>
        <button class="fyp-action fyp-comment" data-action="comment" aria-label="Comments"><i>${TT.comment}</i><span data-count="comments" data-label="0"></span></button>
        <button class="fyp-action fyp-save ${x.saved?'on':''}" data-action="save" aria-label="Save" aria-pressed="${!!x.saved}"><i>${TT.save}</i><span data-count="saves" data-label="0"></span></button>
        <button class="fyp-action fyp-repost ${x.reposted?'on':''}" data-action="repost" aria-label="Repost" aria-pressed="${!!x.reposted}"><i>${TT.repost}</i><span data-count="reposts" data-label="0"></span></button>`}
        <button class="fyp-action fyp-share" data-action="share" aria-label="Share"><i>${TT.share}</i><span data-count="shares" data-label="0"></span></button>
        ${ugc&&!ad&&au.userId===state.user.id?`<button class="fyp-action fyp-own" data-action="manage" aria-label="Manage your post"><i>${I.more}</i><span>Edit</span></button>`:''}
        ${x.format==='reel'?`<span class="fyp-disc" aria-hidden="true"><span>${ugc&&au.avatar?`<img src="${escAttr(au.avatar)}" alt="">`:I.logo}</span></span>`:''}
      </div>
      <div class="fyp-caption" data-action="caption" role="button" tabindex="0" aria-label="${ad?'Sponsored':'Open post'}">${ugc&&!ad&&au.username?`<a class="fyp-handle" data-profile href="#/u/${escAttr(au.username)}" aria-label="View @${escAttr(au.username)}'s profile">${esc(handle)}</a>`:`<b class="fyp-handle">${esc(handle)}${ad?`<small class="fyp-sponsored">Sponsored</small>`:'<small class="fyp-verified" aria-label="Official">✓</small>'}</b>`}${ad||ugc?(x.hook?`<span class="fyp-ugc-text">${esc(x.hook)}</span>`:''):`<span class="fyp-one">${esc(x.hook||x.title)}</span>`}${ad?'':`<em>#${esc(tag||'shukr')}${ugc?'':' #learn'}</em>`}${x.format==='reel'&&!ad?`<span class="fyp-music"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 18V6l11-2v12" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></svg><span class="fyp-marquee"><span>${silent?'No sound · Shukr Learning':`original sound – ${esc(handle)}`}</span></span></span>`:''}</div>
      ${ad?`<a class="fyp-ad-cta" data-ad-click href="${escAttr(x.ad.link)}" target="_blank" rel="noopener sponsored">${esc(x.ad.cta)} ${I.fwd}</a>`:''}
      </div></article>`;
  }
  function draw() {
    disposeMedia();
    const filtered=topic!=='all'||format!=='all';
    p.innerHTML = `<header class="fyp-toolbar"><button class="fyp-top-btn" data-open-drawer aria-label="Open menu">${I.menu}</button><div class="fyp-tabs" role="group" aria-label="Feed selection"><button data-tab="following" class="${tab==='following'?'on':''}">Following</button><button data-tab="for-you" class="${tab==='for-you'?'on':''}">For You</button>${tab==='saved'?'<button data-tab="saved" class="on">Saved</button>':''}</div><button class="fyp-top-btn ${filtered?'on':''}" id="fypFilter" aria-label="Filter topics and formats">${I.sliders}</button><a class="fyp-top-btn" href="#/explore" aria-label="Search">${I.search}</a><a class="fyp-top-btn nt-bell" href="#/notifications" aria-label="Notifications">${I.heart}</a></header>${(bumpStreak(),'')}<div class="eg-streak-wrap">${streakBadge()}</div><div class="fyp-stories" id="fypStories"></div><div class="fyp-session" id="fypSession" hidden></div>
      <div class="fyp-scroller" id="fypDeck" tabindex="0" aria-label="Swipeable educational feed">${items.map(article).join('')}
      <section class="fyp-card fyp-ending" aria-label="Session complete"><div class="fyp-ending-inner"><div class="fyp-overline">A GOOD PLACE TO PAUSE</div><h2>${items.length ? 'You’re all caught up.' : tab==='following'?'Follow creators to\nfill this feed.':tab==='saved'?'Nothing saved yet.':'A fresh perspective awaits.'}</h2><p id="fypLearned"></p><p>${items.length?'Keep scrolling for more, or take one idea into your day.':tab==='following'?'Tap the + on a creator’s picture to follow them. Their new posts land here first.':tab==='saved'?'Tap the bookmark on any post to keep it here.':'Try another topic.'}</p>${tab==='following'&&!items.length?'<button class="btn accent" data-go="/explore">Find creators</button>':''}<button class="btn ${tab==='following'&&!items.length?'ghost':'accent'}" id="fypContinue">${hasMore?'Load more':'Back to For You'}</button></div></section></div>`;
    scroller = $('#fypDeck',p);index=0; progress();bindGo(p);
    $('[data-open-drawer]',p).onclick=openDrawer;
    $$('[data-tab]',p).forEach(b=>b.onclick=()=>{post='';tab=b.dataset.tab;offset=0;load();});
    storiesTrayHTML().then(h=>{const s=$('#fypStories',p);if(s&&h){s.innerHTML=h;bindStoryTray(s,()=>storiesTrayHTML().then(h2=>{if(s.isConnected){s.innerHTML=h2;bindStoryTray(s);}}));}});notifBadge($('.nt-bell',p));
    $('#fypFilter',p).onclick=()=>{pauseMedia();sheet(`<h3>Tune your feed</h3><div class="fyp-overline">TOPIC</div><div class="chips wrap fyp-topics" aria-label="Lesson topics"><button class="chip ${topic==='all'?'on':''}" data-topic="all">All topics</button>${topics.map(t=>`<button class="chip ${topic===t.id?'on':''}" data-topic="${escAttr(t.id)}">${I[topicIcons[t.id]]||''}${esc(t.label)}</button>`).join('')}</div><div class="fyp-overline">FORMAT</div><div class="chips wrap fyp-formats" role="group" aria-label="Post formats">${[['all','All posts'],['reel','Videos'],['carousel','Carousels'],['image','Images']].map(([v,l])=>`<button data-format="${v}" aria-pressed="${format===v}" class="chip ${format===v?'on':''}">${l}</button>`).join('')}</div>`,(sh,close)=>{
      $$('[data-topic]',sh).forEach(b=>b.onclick=()=>{close();post='';topic=b.dataset.topic;offset=0;load();});
      $$('[data-format]',sh).forEach(b=>b.onclick=()=>{close();post='';format=b.dataset.format;offset=0;load();});
    });};
    $('#fypContinue',p).onclick=()=>{post='';if(hasMore)offset=nextOffset;else {offset=0;topic='all';format='all';tab='for-you';}load();};
    scroller.onscroll=()=>{
      // Pause immediately, not after snap settles; scrolling is never completion.
      $$('video',p).forEach(v=>{const r=v.closest('article').getBoundingClientRect(),s=scroller.getBoundingClientRect();if(r.top<s.top-2||r.bottom>s.bottom+2)v.pause();});
      clearTimeout(scrollTick);scrollTick=setTimeout(()=>{if(!alive)return;const n=deckIndex(scroller.scrollTop/scroller.clientHeight,items.length);if(n!==index){index=n;stopSpeech();pauseMedia();}autoplay();},90);
    };
    if(window.IntersectionObserver)observer=new IntersectionObserver(entries=>entries.forEach(e=>{const v=$('video',e.target);if(!v)return;if(e.intersectionRatio<.5)v.pause();else if(e.intersectionRatio>=.7){const n=+e.target.dataset.index;if(n!==index&&Math.abs(scroller.scrollTop/scroller.clientHeight-n)<.35){index=n;}if(n===index)autoplay();}}),{root:scroller,threshold:[0,.5,.7,1]});
    $$('[data-lesson]',p).forEach(el=>{
      const x=items.find(x=>String(x.id)===el.dataset.lesson);
      if(observer)observer.observe(el);
      $$('[data-action]',el).forEach(b=>b.onclick=e=>{e.stopPropagation();act(x,b,el);});
      $$('[data-profile],a.fyp-avatar',el).forEach(a=>a.addEventListener('click',e=>{e.stopPropagation();pauseMedia();},true));
      const cap=$('.fyp-caption',el);if(cap)cap.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();act(x,cap,el);}};
      $$('[data-sound]',el).forEach(b=>b.onclick=e=>{e.stopPropagation();const v=$('video',el);const audible=v&&!v.muted;setSound(!audible);if(v&&!audible){audioUnlocked=true;v.muted=false;if(v.paused&&!v.dataset.userPaused)v.play().catch(()=>{});}syncSoundUI();});
      const cta=$('[data-ad-click]',el);if(cta)cta.onclick=()=>{api(`/ads/${encodeURIComponent(x.id)}/click`,{body:{}}).catch(()=>{});};
      let lastTap=0;const stage=$('.fyp-media-stage',el);
      stage.addEventListener('click',e=>{if(e.target.closest('button,a,.fyp-rail'))return;const now=Date.now();clearTimeout(el._tapT);if(now-lastTap<320){lastTap=0;clearTimeout(el._tapT);heartBurst(stage,e.clientX,e.clientY);if(!x.liked)act(x,$('[data-action="like"]',el),el);}else{lastTap=now;const justUnmuted=Date.now()-unlockedAt<500;el._tapT=setTimeout(()=>{if(justUnmuted)return;if(el._toggleReel)el._toggleReel();},330);}});
      $$('img.fyp-art',el).forEach(img=>{
        const error=$('.fyp-media-error',img.parentElement);
        img.onerror=()=>{error.hidden=false;}; img.onload=()=>{error.hidden=true;};
        $('[data-media-retry]',img.parentElement).onclick=()=>{error.hidden=true;const src=img.getAttribute('src');img.removeAttribute('src');img.src=src;};
        if(img.complete&&!img.naturalWidth)error.hidden=false;
      });
      const track=$('.fyp-carousel',el);
      if(track){
        let slide=0,lastSlide=-1;const total=$$('.fyp-slide',track).length;
        const update=()=>{slide=Math.max(0,Math.min(total-1,Math.round(track.scrollLeft/Math.max(1,track.clientWidth))));$$('[data-slide]',el).forEach(b=>b.setAttribute('aria-current',String(+b.dataset.slide===slide)));$('.fyp-slide-count',el).textContent=`${slide+1} / ${total}`;$$('[data-slide-step]',el).forEach(b=>b.disabled=+b.dataset.slideStep<0?slide===0:slide===total-1);if(slide!==lastSlide){lastSlide=slide;el.dispatchEvent(new CustomEvent('fyp:slide',{bubbles:true,detail:{index:slide,total}}));}};
        const move=n=>track.scrollTo({left:Math.max(0,Math.min(total-1,n))*track.clientWidth,behavior:'auto'});
        track.onscroll=update;
        $$('[data-slide]',el).forEach(b=>b.onclick=()=>move(+b.dataset.slide));
        $$('[data-slide-step]',el).forEach(b=>b.onclick=()=>move(slide+(+b.dataset.slideStep)));
        track.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();move(slide+(e.key==='ArrowRight'?1:-1));}};update();
      }
      const v=$('video',el);
      if(v){
        const play=$('[data-play]',el), status=$('.fyp-video-status',el), error=$('.fyp-media-error',el);
        const silentCard=el.hasAttribute('data-silent');v.muted=silentCard||!soundOn;v.defaultMuted=v.muted;
        // "On screen" = at least 60% visible: tolerant of Android's address bar resizing the viewport.
        const active=()=>{if(!alive||document.hidden)return false;const r=el.getBoundingClientRect(),s=scroller.getBoundingClientRect();const vis=Math.min(r.bottom,s.bottom)-Math.max(r.top,s.top);return vis>=Math.min(r.height,s.height)*.6;};
        const bar=$('.fyp-progress i',el);
        const label=()=>{play.hidden=!v.paused;play.innerHTML=v.ended?I.repeat:I.play;play.setAttribute('aria-label',v.ended?'Replay captioned reel':'Play captioned reel');};
        const start=()=>{error.hidden=true;delete v.dataset.userPaused;el.classList.remove('needs-tap-play');if(v.ended)v.currentTime=0;if(!silentCard&&soundOn){v.muted=false;audioUnlocked=true;}v.play().then(syncSoundUI).catch(()=>{v.muted=true;v.play().then(syncSoundUI).catch(()=>{status.textContent='Tap to play.';label();});});};
        play.onclick=e=>{e.stopPropagation();start();};
        el._toggleReel=()=>{if(v.paused)start();else{v.dataset.userPaused='1';v.pause();}};
        v.ontimeupdate=()=>{if(bar&&v.duration)bar.style.width=(100*v.currentTime/v.duration).toFixed(2)+'%';};
        v.onplay=()=>{if(!active()){v.pause();return;}el.classList.remove('needs-tap-play');stopSpeech();pauseMedia(v);duckNasheed(!v.muted);label();syncSoundUI();};
        v.onpause=()=>{status.textContent='';duckNasheed(false);label();};
        // Loop like a short-video app, but let the 'ended' event fire first so a full watch is still recorded.
        v.onended=()=>{status.textContent='';duckNasheed(false);label();setTimeout(()=>{if(active()&&!document.querySelector('.sheet.open')&&!v.dataset.userPaused){v.currentTime=0;v.play().catch(()=>{});}},60);};
        v.onvolumechange=()=>{if(!v.muted)stopSpeech();duckNasheed(!v.paused&&!v.muted);syncSoundUI();};
        v.onwaiting=()=>{status.textContent='Buffering…';};v.onplaying=()=>{status.textContent='';label();};
        v.onerror=()=>{error.hidden=false;play.hidden=true;status.textContent='';duckNasheed(false);};
        $('[data-media-retry]',error).onclick=()=>{error.hidden=true;status.textContent='Loading video…';v.load();label();};
        v.onloadeddata=()=>{status.textContent='';if(+el.dataset.index===index&&v.paused&&!v.dataset.userPaused&&!v.ended)playReel(v,el);};
        // "Tap for sound" pill
        const ts=$('[data-tapsound]',el);if(ts)ts.onclick=e=>{e.stopPropagation();soundOn=true;localStorage.setItem('shukr.sound','1');v.muted=false;audioUnlocked=true;if(v.paused)v.play().catch(()=>{});syncSoundUI();};
      }
    });
    items.forEach(updateCounts);syncSoundUI();setTimeout(autoplay,150);
    stopTracking=trackFeedEngagement(p,items,(id,counts)=>{const x=items.find(x=>String(x.id)===String(id));if(x){x.counts={...x.counts,...counts};updateCounts(x);}});
  }
  function lessonSheet(x) {
    if(x.ugc){const mine=x.authorId===state.user?.id||x.author?.userId===state.user?.id;return sheet(`<div class="fyp-overline">@${esc(x.author?.username||'member').toUpperCase()}</div>${x.hook?`<p class="fyp-ugc-full">${esc(x.hook).replace(/\n/g,'<br>')}</p>`:''}<div class="faint small">${esc(new Date(x.publishedAt||Date.now()).toLocaleDateString())} · #${esc(topicLabel(topics,x.topic))}</div><div style="height:10px"></div>${!mine?`<button class="opt" data-action="gift"><span class="e">${TT.gift}</span><div>Send a gift<div class="faint small">Support @${esc(x.author?.username||'creator')} with coins</div></div></button>`:''}${mine?`<button class="opt" data-action="delete">${I.trash||I.x}<div>Delete post</div></button>`:''}<button class="opt" data-action="less">${I.x}<div>Not interested<div class="faint small">See fewer posts like this</div></div></button><button class="opt" data-action="report">${I.flag}<div>Report</div></button>`,(sh,close)=>{const el=$$('[data-lesson]',p).find(n=>n.dataset.lesson===String(x.id));$$('[data-action]',sh).forEach(b=>b.onclick=()=>act(x,b,el,close));});}
    sheet(`<div class="fyp-overline">@SHUKR · ${esc(topicLabel(topics,x.topic)).toUpperCase()}</div><h2 class="fyp-sheet-title">${esc(x.title)}</h2><p class="fyp-hook">${esc(x.hook)}</p><div class="fyp-body">${esc(x.body).replace(/\n/g,'<br>')}</div><div class="fyp-takeaway"><span>Try this today</span><p>${esc(x.takeaway)}</p></div>
      <div class="fyp-lesson-tools"><button class="btn ${x.completed?'soft':'accent'}" data-action="complete">${x.completed?I.check:I.cap} ${x.completed?'Learned':'I learned this'}</button><button class="btn ghost" data-action="quiz">${I.brain} ${x.quizResult?'Review quiz':'Quick quiz'}</button><button class="btn ghost fyp-listen" data-action="listen" aria-pressed="false">${I.headphones} Listen</button></div>
      <div class="fyp-overline" style="margin-top:18px">SOURCES</div><div class="fyp-sources" data-action-host="source">${sourceHTML(x.sources)}</div>
      <button class="opt" data-action="ask">${I.chat}<div>Explore this with Alim</div></button><button class="opt" data-action="less">${I.x}<div>Not for me<div class="faint small">Hide this lesson from For you</div></div></button><button class="opt" data-action="report">${I.flag}<div>Report post / copyright concern</div></button><a href="#/rights" class="opt">${I.info||I.book}<div>Content & rights policy</div></a>`,(sh,close)=>{
      const el=$$('[data-lesson]',p).find(n=>n.dataset.lesson===String(x.id));
      $$('[data-action]',sh).forEach(b=>b.onclick=()=>act(x,b,el,close));
    });
  }
  function shareSheet(x,el) {
    const url=x.sponsored?x.ad.link:`${location.origin}/#/fyp?post=${encodeURIComponent(x.id)}`, text=x.sponsored?`${x.ad.brand}: ${x.title}`:x.ugc?`${x.hook||'Check out this post'} — on Shukr`:`${x.title} — ${x.hook||''}`.trim(), enc=encodeURIComponent;
    const targets=[
      ['whatsapp','WhatsApp','#25D366',`https://wa.me/?text=${enc(text+'\n'+url)}`],
      ['wastatus','WA Status','#128C7E',`https://wa.me/?text=${enc(text+'\n'+url)}`],
      ['instagram','Instagram','linear-gradient(45deg,#FEDA75,#FA7E1E,#D62976,#962FBF,#4F5BD5)','instagram'],
      ['messenger','Messenger','linear-gradient(45deg,#0099FF,#A033FF,#FF5280)',`fb-messenger://share/?link=${enc(url)}`],
      ['facebook','Facebook','#1877F2',`https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`],
      ['telegram','Telegram','#229ED9',`https://t.me/share/url?url=${enc(url)}&text=${enc(text)}`],
      ['x','X','#000000',`https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}`],
      ['sms','SMS','#34C759',`sms:?&body=${enc(text+' '+url)}`],
      ['mail','Email','#7A5AF8',`mailto:?subject=${enc(x.title||'Shukr')}&body=${enc(text+'\n\n'+url)}`],
      ['linkedin','LinkedIn','#0A66C2',`https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`],
      ['reddit','Reddit','#FF4500',`https://www.reddit.com/submit?url=${enc(url)}&title=${enc(text)}`]
    ];
    const m=x.media||{},dl=m.ugc&&(m.src||m.slides?.[0]?.src);
    const record=async()=>{if(x.sponsored)return;try{const r=await api(`/fyp/${encodeURIComponent(x.id)}/action`,{body:{action:'share',value:true}});Object.assign(x,r);updateCounts(x);}catch{}};
    const copy=async t=>{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(t);else{const a=document.createElement('textarea');a.value=t;document.body.append(a);a.select();document.execCommand('copy');a.remove();}};
    const util=(k,label,icon,on)=>`<button class="fyp-share-target" data-share="${k}"><span class="${on?'on':''}">${icon}</span><b>${label}</b></button>`;
    sheet(`<h3 class="fyp-share-title">Share to</h3>
      ${x.sponsored?'':`<div class="shs-wrap"><div class="shs-row" id="shareDm"><button class="shs-p shs-story" data-story><span class="shs-av">${state.user?.avatar?`<img src="${escAttr(state.user.avatar)}" alt="">`:esc((state.user?.name||'Y')[0].toUpperCase())}<i>+</i></span><b>Add to story</b><small>24 hours</small></button><span class="muted small shs-load">Loading friends…</span></div>
        <input class="input shs-find" id="shsF" placeholder="Search friends" autocomplete="off"><input class="input shs-msg" id="shsT" placeholder="Add a message…" maxlength="500" hidden><button class="btn accent block shs-send" id="shsS" hidden>Send</button></div>`}
      <div class="fyp-share-grid">${targets.map(([k,l,c,href])=>`<a class="fyp-share-target" data-share="${k}" ${k==='instagram'?'href="#" data-ig':`href="${escAttr(href)}" target="_blank" rel="noopener noreferrer"`}><span style="background:${c}">${BRAND[k==='wastatus'?'whatsapp':k]}</span><b>${l}</b></a>`).join('')}</div>
      <div class="fyp-share-grid fyp-share-utils">
        ${x.sponsored?'':util('repost',x.reposted?'Reposted':'Repost',TT.repost,x.reposted)}
        ${util('copy','Copy link',I.copy)}
        ${navigator.share?util('more','More',I.more):''}
        ${dl?util('download','Save video',BRAND.download):''}
        ${util('qr','QR code',BRAND.qr)}
        ${x.sponsored?'':util('save',x.saved?'Saved':'Add to Saved',TT.save,x.saved)}
        ${x.sponsored?'':util('notint','Not interested',BRAND.notint)}
        ${util('report','Report',I.flag)}
      </div>
      <button class="btn ghost block fyp-share-cancel" data-share="cancel">Cancel</button>`,(sh,close)=>{
      // Instagram-style: Add to story + friends (avatar + @username), multi-select, optional message, search.
      const row=$('#shareDm',sh);if(row){const picked=new Set();let all=[];
        const pill=u=>`<button class="shs-p ${picked.has(u.id)?'on':''}" data-dm="${u.id}"><span class="shs-av">${u.avatar?`<img src="${escAttr(u.avatar)}" alt="" loading="lazy">`:esc((u.name||u.username||'?')[0].toUpperCase())}<i class="shs-ck">✓</i></span><b>${esc(u.name||u.username)}</b><small>@${esc(u.username||'')}</small></button>`;
        const draw=list=>{$$('[data-dm],.shs-load,.shs-none',row).forEach(n=>n.remove());row.insertAdjacentHTML('beforeend',list.length?list.map(pill).join(''):'<span class="muted small shs-none">Follow people to send them posts</span>');
          $$('[data-dm]',row).forEach(b=>b.onclick=()=>{const id=+b.dataset.dm;picked.has(id)?picked.delete(id):picked.add(id);b.classList.toggle('on');haptic(8);const n=picked.size;$('#shsT',sh).hidden=$('#shsS',sh).hidden=!n;$('#shsS',sh).textContent=n>1?`Send separately (${n})`:'Send';});};
        api('/share/targets').then(r=>{all=r.users||[];draw(all);}).catch(()=>draw([]));
        let t;$('#shsF',sh).oninput=e=>{clearTimeout(t);const q=e.target.value.trim().toLowerCase();t=setTimeout(async()=>{if(!q)return draw(all);const loc=all.filter(u=>(u.username||'').toLowerCase().includes(q)||(u.name||'').toLowerCase().includes(q));if(loc.length)return draw(loc);try{draw((await api('/search/people?q='+encodeURIComponent(q))).users||[]);}catch{}},220);};
        $('#shsS',sh).onclick=async()=>{const b=$('#shsS',sh);b.disabled=true;try{await api('/share/dm',{body:{to:[...picked],postId:x.id,text:$('#shsT',sh).value}});record();close();toast(picked.size>1?`Sent to ${picked.size} friends`:'Sent');}catch(e){toast(e.message);b.disabled=false;}};
        $('[data-story]',row).onclick=async()=>{const b=$('[data-story]',row);b.disabled=true;try{await api('/stories/reshare',{body:{postId:x.id}});record();haptic(14);$('b',b).textContent='Added ✓';setTimeout(close,500);toast('Added to your story');}catch(e){toast(e.message);b.disabled=false;}};
      }
      $$('a[data-share]',sh).forEach(a=>a.onclick=async e=>{
        if(a.hasAttribute('data-ig')){e.preventDefault();try{if(navigator.share&&dl){const blob=await fetch(dl).then(r=>r.blob());const f=new File([blob],'shukr.'+(blob.type.split('/')[1]||'mp4'),{type:blob.type});if(navigator.canShare?.({files:[f]})){await navigator.share({files:[f],text});record();return close();}}await copy(url);toast('Link copied — paste it in Instagram');location.href='instagram://app';}catch(e){if(e.name!=='AbortError')toast('Link copied — paste it in Instagram');}return;}
        record();setTimeout(close,150);
      });
      $$('button[data-share]',sh).forEach(b=>b.onclick=async()=>{
        const k=b.dataset.share;
        if(k==='cancel')return close();
        if(k==='repost'||k==='save'){close();return act(x,$(`[data-action="${k}"]`,el),el);}
        if(k==='notint'){close();return act(x,{dataset:{action:'less'}},el);}
        if(k==='report'){close();return act(x,{dataset:{action:'report'}},el);}
        if(k==='dm'){close();return go('/messages');}
        if(k==='copy'){try{await copy(url);toast('Link copied');record();close();}catch(e){toast('Couldn’t copy — long-press to copy: '+url);}return;}
        if(k==='more'){try{await navigator.share({title:x.title||'Shukr',text,url});record();close();}catch(e){if(e.name!=='AbortError')toast(e.message);}return;}
        if(k==='download'){const a=document.createElement('a');a.href=dl;a.download='shukr-'+x.id.slice(-8)+'.'+dl.split('.').pop();document.body.append(a);a.click();a.remove();toast('Downloading…');record();return close();}
        if(k==='qr'){close();sheet(`<h3 style="text-align:center">Scan to open</h3><div class="fyp-qr"><img alt="QR code for this post" src="https://api.qrserver.com/v1/create-qr-code/?size=480x480&margin=12&data=${enc(url)}"></div><p class="muted small" style="text-align:center;word-break:break-all">${esc(url)}</p>`);}
      });
    });
  }
  async function act(x,b,el,closeSheet) {
    haptic(b?.dataset?.action==='like'?12:6);
    if(b.dataset.action==='manage'){pauseMedia();return managePost(x,{onChange:nx=>{Object.assign(x,nx);const cap=$('.fyp-caption p, .fyp-caption .fyp-hook',el);if(cap)cap.textContent=x.hook||'';},onDelete:()=>{el.remove();items.splice(items.indexOf(x),1);toast('Post deleted');}});}
    const action=b.dataset.action;
    if(['caption','more','comment','quiz','share','report','source'].includes(action)) {pauseMedia();stopSpeech();}
    if(x.sponsored&&action==='caption'){window.open(x.ad.link,'_blank','noopener');api(`/ads/${encodeURIComponent(x.id)}/click`,{body:{}}).catch(()=>{});return;}
    if(action==='follow'){const au=x.author||{};b.disabled=true;try{const r=await api('/social/follow/'+encodeURIComponent(au.username),{body:{follow:!au.isFollowing}});items.filter(y=>y.author?.username===au.username).forEach(y=>y.author.isFollowing=r.following);$$('[data-lesson]',p).forEach(c=>{const y=items.find(z=>String(z.id)===c.dataset.lesson);const f=$('[data-action="follow"]',c);if(y&&f&&y.author?.username===au.username){f.classList.toggle('on',r.following);f.innerHTML=r.following?TT.check:TT.plus;}});toast(r.following?`Following @${au.username}`:`Unfollowed @${au.username}`);}catch(e){toast(e.message);}finally{b.disabled=false;}return;}
    if(action==='gift')return giftSheet(x);
    if(action==='caption'||action==='more')return lessonSheet(x);
    if(action==='comment')return comments(x);
    if(action==='share')return shareSheet(x,el);
    if(action==='source')return lessonSheet(x);
    if(action==='repost'){
      b.disabled=true;try{const r=await api(`/fyp/${encodeURIComponent(x.id)}/action`,{body:{action:'repost',value:!x.reposted}});Object.assign(x,r);b.classList.toggle('on',!!x.reposted);b.setAttribute('aria-pressed',String(!!x.reposted));updateCounts(x);toast(x.reposted?'Reposted to your profile':'Repost removed');}catch(e){toast(e.message);}finally{b.disabled=false;}return;
    }
    if(action==='delete'){closeSheet&&closeSheet();if(!confirm('Delete this post? This can’t be undone.'))return;try{await api(`/social/posts/${encodeURIComponent(x.id)}`,{method:'DELETE'});toast('Post deleted');load();}catch(e){toast(e.message);}return;}
    if(action==='ask'){closeSheet&&closeSheet();return askAlim(`Teach me more about this lesson: ${x.title}. ${x.body}\nSources: ${(x.sources||[]).map(s=>s.url).join(' ')}\nPlease cite reliable sources and distinguish explanation from religious rulings.`,'teach');}
    if(action==='less'){try {await api(`/fyp/${encodeURIComponent(x.id)}/action`,{body:{action:'hide',value:true}});closeSheet&&closeSheet();toast('Lesson hidden');load();}catch(e){toast(e.message);}return;}
    if(action==='report'){closeSheet&&closeSheet();return sheet(`<h3>Report this post</h3><form id="postReportForm"><label class="lbl">Reason</label><select class="input" name="reason"><option value="copyright">Copyright concern</option><option value="misinformation">Inaccurate teaching</option><option value="abuse">Abuse</option><option value="other">Other</option></select><label class="lbl">Context / original source URL</label><textarea class="input" name="details" minlength="10" maxlength="2000" required rows="4"></textarea><button class="btn accent block" style="margin-top:12px">Submit for review</button><p class="err" role="alert"></p></form>`,(sh,done)=>{$('#postReportForm',sh).onsubmit=async e=>{e.preventDefault();const f=e.target,b=$('button',f);b.disabled=true;try{await api('/social/reports',{body:{lessonId:x.id,reason:f.reason.value,details:f.details.value}});done();toast('Report saved for administrator review.');}catch(e){$('.err',f).textContent=e.message;b.disabled=false;}};});}
    if(action==='listen') {
      if(!window.speechSynthesis||!window.SpeechSynthesisUtterance)return toast('Read aloud is not available in this browser.');
      if(speech){stopSpeech();return;}pauseMedia();
      speech=new SpeechSynthesisUtterance(`${x.title}. ${x.hook}. ${x.body}. Try this today. ${x.takeaway}`);speech.lang='en';speech.rate=.95;
      speech.onend=stopSpeech;speech.onerror=()=>{stopSpeech();toast('Read aloud is unavailable on this device.');};duckNasheed(true);b.classList.add('on');b.setAttribute('aria-pressed','true');speechSynthesis.speak(speech);return;
    }
    if(action==='quiz'){closeSheet&&closeSheet();return quiz(x);}
    if(['like','save','complete'].includes(action)) {
      if(!b)return;b.disabled=true;
      try { const field={like:'liked',save:'saved',complete:'completed'}[action];const value=action==='complete'?true:!x[field];const r=await api(`/fyp/${encodeURIComponent(x.id)}/action`,{body:{action,value}});Object.assign(x,r);if(!alive)return;
        if(action==='complete'){b.innerHTML=`${I.check} Learned`;b.className='btn soft';toast('Learning recorded. Try putting it into practice.');progress();const em=el&&$('.fyp-caption em',el);if(em)em.textContent=em.textContent.replace(/tap to learn more$/,'✓ learned');}
        else{b.classList.toggle('on',!!x[field]);b.setAttribute('aria-pressed',String(!!x[field]));if(action==='like'&&x.liked){b.classList.remove('pop');void b.offsetWidth;b.classList.add('pop');}if(action==='save')toast(x.saved?'Saved to your collection':'Removed from saved');}
        updateCounts(x);
      }catch(e){toast(e.message);}finally{b.disabled=false;}
    }
  }
  async function giftSheet(x) {
    let cfg,plans;try{[cfg,plans]=await Promise.all([api('/pay/config'),api('/me/plans')]);}catch(e){return toast(e.message);}
    sheet(`<h3 class="fyp-share-title">Send a gift to @${esc(x.author?.username||'creator')}</h3><div class="gift-bal">${TT.gift} <b id="giftCoins">${plans.coins}</b> coins <a href="#/premium?coins=1">Top up</a></div><div class="gift-grid">${cfg.gifts.map(([id,name,emo,coins])=>`<button class="gift" data-gift="${id}"><span>${emo}</span><b>${esc(name)}</b><small>${coins} coins</small></button>`).join('')}</div>`,(sh,close)=>{
      $$('[data-gift]',sh).forEach(b=>b.onclick=async()=>{b.disabled=true;try{const r=await api('/gifts',{body:{gift:b.dataset.gift,postId:x.id}});$('#giftCoins',sh).textContent=r.coins;toast(`${r.gift.emoji} ${r.gift.name} sent!`);const burst=$$('[data-lesson]',p).find(n=>n.dataset.lesson===String(x.id));if(burst){const g=document.createElement('div');g.className='gift-fly';g.textContent=r.gift.emoji;$('.fyp-media-stage',burst).append(g);setTimeout(()=>g.remove(),1800);}close();}catch(e){if(e.status===402){close();go('/premium?coins=1');}toast(e.message);b.disabled=false;}});
    });
  }
  function comments(x) {
    const path=`/fyp/${encodeURIComponent(x.id)}/comments`;
    sheet(`<h3 class="fyp-comments-title">Comments <span id="fypCommentTotal"></span></h3><div id="fypComments" class="fyp-comments" aria-live="polite"></div><form id="fypCommentForm" class="fyp-comment-form"><div class="avatar">${esc((state.user?.name||'Y')[0].toUpperCase())}</div><textarea class="input" id="fypCommentBody" aria-label="Add a comment" maxlength="1000" required rows="1" placeholder="Add a thoughtful comment…"></textarea><button type="submit" class="fyp-comment-send" aria-label="Post comment">${I.send||I.fwd}</button></form><p id="fypCommentError" class="err" role="alert"></p>`,sh=>{
      const error=$('#fypCommentError',sh),list=$('#fypComments',sh),form=$('#fypCommentForm',sh);
      const reload=async()=>{
        const r=await api(path);if(!alive||!sh.isConnected)return;
        x.counts={...x.counts,comments:r.total};updateCounts(x);$('#fypCommentTotal',sh).textContent=r.total?`· ${r.total}`:'';
        list.innerHTML=r.comments.length?r.comments.map(c=>`<article><div class="avatar">${esc((c.displayName||'L')[0].toUpperCase())}</div><div class="grow"><header><strong>${esc(c.displayName||'Learner')}</strong>${c.isMine?`<button data-delete-comment="${escAttr(c.id)}" aria-label="Delete your comment">Delete</button>`:''}</header><p>${esc(c.body).replace(/\n/g,'<br>')}</p></div></article>`).join(''):'<p class="muted small">No comments yet. Make room for a thoughtful conversation.</p>';
        $$('[data-delete-comment]',list).forEach(b=>b.onclick=async()=>{b.disabled=true;error.textContent='';try{await api(`${path}/${encodeURIComponent(b.dataset.deleteComment)}`,{method:'DELETE'});await reload();}catch(e){error.textContent=e.message;b.disabled=false;}});
      };
      list.textContent='Loading comments…';reload().catch(e=>{error.textContent=e.message;list.innerHTML='<button class="btn ghost" id="fypCommentsRetry">Retry comments</button>';$('#fypCommentsRetry',list).onclick=()=>reload().catch(e=>error.textContent=e.message);});
      form.onsubmit=async e=>{e.preventDefault();const input=$('#fypCommentBody',sh),button=$('button[type="submit"]',form),body=input.value.trim();if(!body)return;button.disabled=true;error.textContent='';try{await api(path,{body:{body}});input.value='';await reload();}catch(e){error.textContent=e.message;}finally{button.disabled=false;}};
    });
  }
  function quiz(x) {
    sheet(`<div class="fyp-overline">RECALL, NOT JUST SCROLL</div><h3>${esc(x.quiz.question)}</h3><div id="fypAnswers" class="fyp-answers">${x.quiz.options.map((o,i)=>`<button class="btn ghost block" data-answer="${i}">${esc(o)}</button>`).join('')}</div><div id="fypFeedback" role="status"></div>`,(sh)=>{
      const show=r=>{$$('[data-answer]',sh).forEach(b=>{b.disabled=true;b.classList.toggle('on',+b.dataset.answer===r.selected);});$('#fypFeedback',sh).innerHTML=`<h3>${r.correct?'You’ve got it.':'A useful thing to learn.'}</h3><p>${esc(r.explanation)}</p><div class="faint small">Your first answer is recorded. Learning matters more than a perfect score.</div>`;};
      if(x.quizResult)return show(x.quizResult);
      $$('[data-answer]',sh).forEach(b=>b.onclick=async()=>{const buttons=$$('[data-answer]',sh);buttons.forEach(b=>b.disabled=true);try{const r=await api(`/fyp/${encodeURIComponent(x.id)}/quiz`,{body:{answer:+b.dataset.answer}});x.quizResult=r;show(r);}catch(e){toast(e.message);buttons.forEach(b=>b.disabled=false);}});
    });
  }
  async function load() {
    const mine=++request;stopSpeech();disposeMedia();p.innerHTML='<div class="fyp-loading"><span class="spin"></span></div>';
    try {const r=await api(`/fyp?tab=${tab}&topic=${encodeURIComponent(topic)}&format=${format}&offset=${offset}&limit=10${post?'&post='+encodeURIComponent(post):''}`);if(!alive||mine!==request)return;items=r.items;topics=r.topics;hasMore=r.hasMore;nextOffset=r.nextOffset;draw();}
    catch(e){if(!alive||mine!==request)return;p.innerHTML=`<div class="empty"><h2>Couldn’t load your feed</h2><p>${esc(e.message)}</p><button class="btn" id="fypRetry">Try again</button></div>`;$('#fypRetry',p).onclick=load;}
  }
  await load();
}

const fmtN = n => compact(Number(n)||0);
const thumbOf = x => { const m=x.media||{}; const src=m.poster||(x.format==='reel'?'':m.src)||m.slides?.[0]?.src||''; return /^\/(ugc|media\/(fyp|house))\//.test(src)?src:''; };
function gridHTML(list, emptyMsg, mine) {
  if (!list) return `<div class="tt-empty"><div class="tt-empty-ic">${I.lock||I.x}</div><b>This list is private</b></div>`;
  if (!list.length) return `<div class="tt-empty"><p class="muted small">${emptyMsg}</p></div>`;
  if(mine)list=[...list].sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0));
  return `<div class="tt-grid">${list.map(x=>{const t=thumbOf(x),vid=x.format==='reel',src=x.media?.src||'';return `<a class="tt-cell" href="#/fyp?post=${encodeURIComponent(x.id)}">${t?`<img src="${escAttr(t)}" alt="" loading="lazy">`:vid&&/^\/(ugc|media\/(fyp|house))\//.test(src)?`<video src="${escAttr(src)}#t=0.5" muted playsinline preload="metadata"></video>`:''}<span class="tt-type">${x.format==='carousel'?(I.layers||I.copy):''}</span>${x.views!=null?`<span class="tt-views">${I.play} ${fmtN(x.views)}</span>`:''}${x.pinned?'<span class="tt-pin">Pinned</span>':''}${mine&&x.visibility&&x.visibility!=='everyone'?`<span class="tt-priv">${I.lock}</span>`:''}${mine?`<button class="tt-own" data-own="${escAttr(x.id)}" aria-label="Manage post">${I.more}</button>`:''}</a>`;}).join('')}</div>`;
}
// TikTok-style profile: yours (/profile) or someone else’s (/u/:username)
export async function viewProfile(username) {
  const own=!username;
  const p=shell(own?'Profile':'@'+username,{back:own?null:'/fyp',right:own?`<a class="tt-earn" href="#/earn" aria-label="Earn money"><span class="ec">$</span><span class="eb"><b>Earn</b><small id="earnBal"></small></span></a>`:''});
  if(own){const eb=$('.tt-earn');eb&&eb.addEventListener('click',()=>localStorage.setItem('shukr.earnSeen','1'));
    api('/earn/summary').then(s=>{const el=$('#earnBal');if(!el)return;const to=+s.balance||0;let t0=null;const step=ts=>{t0??=ts;const k=Math.min(1,(ts-t0)/900);el.textContent='$'+(to*(1-Math.pow(1-k,3))).toFixed(2);if(k<1)requestAnimationFrame(step);};requestAnimationFrame(step);
      if(!to){const tips=['Start earning','Invite & get paid'];let i=0;setInterval(()=>{const e=$('#earnBal');if(e)e.textContent=tips[i++%tips.length];},2600);}
      else{const r=eb.getBoundingClientRect(),pop=document.createElement('i');pop.className='tt-earn-pop';pop.textContent='+$'+to.toFixed(2);pop.style.left=(r.left+18)+'px';pop.style.top=(r.bottom+2)+'px';document.body.append(pop);setTimeout(()=>pop.remove(),1500);}}).catch(()=>{});}mountSocialTabbar(own?'profile':'');
  p.classList.add('tt-profile');p.innerHTML='<div class="loading"><span class="spin"></span></div>';let alive=true;onCleanup(()=>alive=false);
  let d;try{d=await api('/social/profile'+(own?'':'/'+encodeURIComponent(username)));}catch(e){p.innerHTML=`<div class="empty"><h2>${e.status===404?'Account not found':'Couldn’t load profile'}</h2><p>${esc(e.message)}</p></div>`;return;}
  if(!alive)return;
  const pr=d.profile,me=pr.me;
  if(me&&!state.user.username)state.user.username=pr.username;
  let tagged=[];try{tagged=(await api('/social/tagged/'+encodeURIComponent(d.profile.username))).posts;}catch{}
  let story=null;try{story=(await api('/stories/user/'+encodeURIComponent(d.profile.username))).group;}catch{}
  const tabs=[['posts',I.grid||I.layers||I.copy,'Posts',d.posts],['reposts',TT.repost,'Reposts',d.reposts],['liked',TT.heart,'Liked',d.liked],['tagged',I.tagged,'Tagged',tagged]];if(me)tabs.push(['saved',TT.save,'Saved',d.saved]);
  const avatar=pr.avatar?`<img src="${escAttr(pr.avatar)}" alt="">`:esc((pr.name||pr.username||'?')[0].toUpperCase());
  p.innerHTML=`<header class="tt-head"><div class="tt-av-wrap"><button class="tt-story-ring ${story?(story.allSeen?'seen':'live'):''}" id="ttStory" aria-label="${story?'View story':me?'Add to your story':'Profile photo'}"><div class="avatar lg">${avatar}</div></button>${me?'<a class="tt-add-story" href="#/create?type=story" aria-label="Add to your story">+</a>':''}</div><h1>${esc(pr.name)}</h1><div class="tt-handle">@${esc(pr.username)}${pr.pronouns?` <span class="tt-pron">· ${esc(pr.pronouns)}</span>`:''}</div>${pr.category?`<div class="tt-cat">${esc(pr.category)}</div>`:''}
    <div class="tt-stats"><button data-list="following"><strong>${fmtN(pr.following)}</strong><span>Following</span></button><button data-list="followers"><strong id="ttFollowers">${fmtN(pr.followers)}</strong><span>Followers</span></button><div><strong>${fmtN(pr.likes)}</strong><span>Likes</span></div></div>
    <div class="tt-actions">${me?`<a class="btn ghost" id="ttEdit" href="#/profile/edit">Edit profile</a><a class="btn ghost" href="#/creator">${I.chart} Creator</a><a class="btn ghost tt-sq" id="ttMenu" href="#/profile/settings" aria-label="Settings and privacy">${I.menu}</a>`
      :`<button class="btn ${pr.isFollowing?'ghost':'accent'}" id="ttFollow">${pr.isFollowing?'Following':pr.followsYou?'Follow back':'Follow'}</button><button class="btn ghost" id="ttMsg">Message</button><button class="btn ghost tt-sq" id="ttTip" aria-label="Send a tip">${I.dollar}</button><button class="btn ghost tt-sq" id="ttMore" aria-label="More options">${I.more||'⋯'}</button>`}</div>
    ${pr.bio?`<p class="tt-bio">${esc(pr.bio).replace(/@([a-z0-9_.]{2,30})/gi,'<a href="#/u/$1">@$1</a>')}</p>`:me?'<p class="tt-bio faint">Tap Edit profile to add a bio.</p>':''}
    ${(pr.website||pr.links.length)?`<div class="tt-links">${[pr.website?{title:pr.website.replace(/^https?:\/\/(www\.)?/,'').replace(/\/$/,''),url:pr.website}:null,...pr.links].filter(Boolean).slice(0,3).map(l=>`<a href="${escAttr(l.url)}" target="_blank" rel="noopener nofollow ugc">${I.link||'🔗'} ${esc(l.title)}</a>`).join('')}</div>`:''}</header>
    ${d.locked?`<div class="tt-empty"><div class="tt-empty-ic">${I.lock||I.x}</div><b>This account is private</b><p class="muted small">Follow this account to see their videos.</p></div>`:`
    <nav class="tt-tabs" role="tablist">${tabs.map(([k,ic,l],i)=>`<button role="tab" class="${i===0?'on':''}" data-pt="${k}" aria-label="${l}">${ic}<small class="tt-tl">${l}</small>${me&&k!=='posts'&&k!=='saved'&&((k==='reposts'&&!pr.privacy.show_reposts)||(k==='liked'&&!pr.privacy.show_liked))?`<i class="tt-lock">${I.lock||''}</i>`:''}</button>`).join('')}</nav>
    ${tabs.map(([k,,l,list],i)=>`<section data-pane="${k}" ${i?'hidden':''}>${me&&(k==='reposts'||k==='liked')?`<label class="tt-privacy"><span>${k==='reposts'?'Show my reposts to others':'Show my liked videos to others'}</span><span class="toggle"><input type="checkbox" data-priv="${k==='reposts'?'show_reposts':'show_liked'}" ${pr.privacy[k==='reposts'?'show_reposts':'show_liked']?'checked':''}><span></span></span></label>`:''}${gridHTML(list,k==='posts'?(me?'Share your first post — tap Create below.':'No posts yet.'):k==='reposts'?'Reposted videos appear here.':k==='liked'?'Liked videos appear here.':k==='tagged'?(me?'Posts you’re tagged in appear here.':'No posts tagging @'+esc(pr.username)+' yet.'):'Saved videos appear here.',me&&k==='posts')}</section>`).join('')}`}`;
  bindGo(p);
  $('#ttTip',p)?.addEventListener('click',()=>import('./views-earn.js').then(m=>m.tipSheet(pr.username)));
  $('#ttStory',p).onclick=()=>{if(story)openStories([pr.username],0,()=>viewProfile(username));else if(me)go('/create?type=story');};
  $$('[data-own]',p).forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();const x=(d.posts||[]).find(y=>y.id===b.dataset.own);if(x)managePost(x,{onChange:()=>viewProfile(username),onDelete:()=>{toast('Post deleted');viewProfile(username);}});});
  $$('[data-pt]',p).forEach(b=>b.onclick=()=>{$$('[data-pt]',p).forEach(x=>x.classList.toggle('on',x===b));$$('[data-pane]',p).forEach(x=>x.hidden=x.dataset.pane!==b.dataset.pt);});
  const wantTab=new URLSearchParams((location.hash.split('?')[1]||'')).get('tab');if(wantTab)$(`[data-pt="${wantTab}"]`,p)?.click();
  $$('[data-priv]',p).forEach(c=>c.onchange=async()=>{try{await api('/social/privacy',{method:'PUT',body:{[c.dataset.priv]:c.checked}});toast(c.checked?'Visible to others':'Only you can see this');viewProfile(username);}catch(e){toast(e.message);c.checked=!c.checked;}});
  $$('[data-list]',p).forEach(b=>b.onclick=async()=>{try{const r=await api(`/social/follows/${encodeURIComponent(pr.username)}/${b.dataset.list}`);sheet(`<h3 class="fyp-share-title">${b.dataset.list==='followers'?'Followers':'Following'}</h3>${r.users.length?r.users.map(u=>`<a class="tt-user" href="#/u/${escAttr(u.username)}"><span class="avatar">${u.avatar?`<img src="${escAttr(u.avatar)}" alt="">`:esc((u.name||u.username)[0].toUpperCase())}</span><span class="grow"><b>${esc(u.name||u.username)}</b><small>@${esc(u.username)}</small></span>${u.me?'':`<span class="tt-pill ${u.is_following?'':'on'}">${u.is_following?'Following':'Follow'}</span>`}</a>`).join(''):'<p class="muted" style="text-align:center">No one yet.</p>'}`);}catch(e){toast(e.message);}});
  const fb=$('#ttFollow',p);if(fb)fb.onclick=async()=>{fb.disabled=true;try{const r=await api('/social/follow/'+encodeURIComponent(pr.username),{body:{follow:!pr.isFollowing}});pr.isFollowing=r.following;fb.textContent=r.following?'Following':'Follow';fb.className='btn '+(r.following?'ghost':'accent');$('#ttFollowers',p).textContent=fmtN(r.followers);}catch(e){toast(e.message);}finally{fb.disabled=false;}};
  const mb=$('#ttMsg',p);if(mb)mb.onclick=async()=>{try{const c=await api('/social/messages/start',{body:{username:pr.username}});go('/messages?id='+encodeURIComponent(c.conversation.id));}catch(e){toast(e.message);}};
  const more=$('#ttMore',p);if(more)more.onclick=()=>sheet(`<h3>@${esc(pr.username)}</h3>
    <button class="opt" data-o="share"><span class="e">${TT.share}</span><div>Share profile</div></button>
    <button class="opt" data-o="copy"><span class="e">${I.copy||'⧉'}</span><div>Copy profile link</div></button>
    ${pr.followsYou?`<button class="opt" data-o="remove"><span class="e">${I.x}</span><div>Remove follower</div></button>`:''}
    <button class="opt" data-o="report"><span class="e">${I.flag||'⚑'}</span><div>Report</div></button>
    <button class="opt danger" data-o="block"><span class="e">${I.lock||'⛔'}</span><div>${pr.youBlocked?'Unblock':'Block'}</div></button>`,(sh,close)=>{
    const url=`${location.origin}/#/u/${pr.username}`;
    $$('[data-o]',sh).forEach(b=>b.onclick=async()=>{const o=b.dataset.o;close();try{
      if(o==='share'){if(navigator.share)await navigator.share({title:pr.name,url});else{await navigator.clipboard.writeText(url);toast('Link copied');}}
      else if(o==='copy'){await navigator.clipboard.writeText(url);toast('Link copied');}
      else if(o==='remove'){await api('/social/remove-follower/'+encodeURIComponent(pr.username),{body:{}});toast('Follower removed');}
      else if(o==='report'){sheet(`<h3>Report @${esc(pr.username)}</h3>${['Spam or scam','Pretending to be someone','Hate or harassment','Inappropriate content','Under 13','Something else'].map(r=>`<button class="opt" data-r="${escAttr(r)}"><div>${esc(r)}</div></button>`).join('')}`,(s2,c2)=>{$$('[data-r]',s2).forEach(x=>x.onclick=async()=>{c2();try{await api('/social/report',{body:{kind:'profile',id:pr.username,reason:x.dataset.r}});}catch{}toast('Thanks — our team will review this account.');});});}
      else if(o==='block'){const block=!pr.youBlocked;if(block&&!confirm(`Block @${pr.username}? They won’t be able to find your profile, see your videos or message you.`))return;await api('/social/block/'+encodeURIComponent(pr.username),{body:{block}});toast(block?'Blocked':'Unblocked');if(block)go('/fyp');else viewProfile(username);}
    }catch(e){if(e&&e.name!=='AbortError')toast(e.message||'Couldn’t do that');}});
  });
}
export async function viewLearningProfile() { return viewProfile(); }

// ---------- Manage your own post: edit caption/cover/visibility/comments/pin, save, delete ----------
const VIS = { everyone: 'Everyone', followers: 'Followers only', private: 'Only me' };
// Facebook-style "Boost post", labelled Advertise: goal → audience → budget & duration → estimated reach → pay.
export function advertiseSheet(x) {
  let goal = 'views', days = 7, daily = 5;
  const G = [['views', 'More views', 'Show this post to more people', I.play], ['profile', 'More profile visits', 'Grow your followers', I.user], ['website', 'More website visits', 'Send people to your link', I.link || I.send], ['messages', 'More messages', 'Get people to message you', TT.comment]];
  const est = () => { const b = days * daily, r = Math.floor(b / 5 * 1000); return { b, lo: Math.round(r * 0.7), hi: r }; };
  sheet(`<h3>Advertise this post</h3><p class="small muted" style="margin-top:-4px">Reach more people across Shukr.</p>
    <label class="lbl">Goal</label><div class="adv-goals">${G.map(([k, t, d, ic]) => `<button class="adv-goal ${goal === k ? 'on' : ''}" data-g="${k}"><span>${ic || ''}</span><div><b>${t}</b><small>${d}</small></div><i></i></button>`).join('')}</div>
    <div id="advLink" hidden><label class="lbl">Website</label><input class="input" id="advUrl" placeholder="https://your-site.com" inputmode="url"></div>
    <label class="lbl">Audience</label><div class="seg" id="advAge">${['18+', '18-24', '25-34', '35-54', '55+'].map((a, i) => `<button data-a="${a}" class="${i ? '' : 'on'}">${a}</button>`).join('')}</div>
    <label class="lbl">Duration</label><div class="seg">${[1, 3, 7, 14, 30].map(d => `<button data-d="${d}" class="${d === days ? 'on' : ''}">${d}d</button>`).join('')}</div>
    <label class="lbl">Daily budget <b id="advDaily">$${daily}</b></label><input type="range" id="advR" min="2" max="100" step="1" value="${daily}" style="width:100%">
    <div class="adv-est"><div><small>Total</small><b id="advTot"></b></div><div><small>Estimated reach</small><b id="advReach"></b></div></div>
    <button class="btn accent block" id="advGo">Advertise</button><p class="small faint" style="margin-top:8px">Your ad is reviewed before it runs. It appears in the For You feed labelled “Sponsored”.</p>`, (sh, close) => {
    const upd = () => { const e = est(); $('#advTot', sh).textContent = '$' + e.b.toFixed(2); $('#advReach', sh).textContent = e.lo.toLocaleString() + '–' + e.hi.toLocaleString(); $('#advDaily', sh).textContent = '$' + daily; $('#advLink', sh).hidden = goal !== 'website'; };
    let age = '18+';
    $$('[data-g]', sh).forEach(b => b.onclick = () => { goal = b.dataset.g; $$('[data-g]', sh).forEach(y => y.classList.toggle('on', y === b)); upd(); });
    $$('[data-d]', sh).forEach(b => b.onclick = () => { days = +b.dataset.d; $$('[data-d]', sh).forEach(y => y.classList.toggle('on', y === b)); upd(); });
    $$('[data-a]', sh).forEach(b => b.onclick = () => { age = b.dataset.a; $$('[data-a]', sh).forEach(y => y.classList.toggle('on', y === b)); });
    $('#advR', sh).oninput = e => { daily = +e.target.value; upd(); }; upd();
    $('#advGo', sh).onclick = async () => { const b = $('#advGo', sh); b.disabled = true;
      try { const r = await api('/ads/boost', { body: { postId: x.id, goal, days, dailyUsd: daily, ages: age, link: $('#advUrl', sh)?.value } }); close();
        const { checkout } = await import('./views-money.js'); checkout(r.checkout, () => toast('Ad submitted for review')); }
      catch (e) { toast(e.message); b.disabled = false; } };
  });
}
export function managePost(x, { onChange, onDelete } = {}) {
  const put = async body => { const r = await api('/social/posts/' + encodeURIComponent(x.id), { method: 'PUT', body }); Object.assign(x, r.publication); onChange && onChange(r.publication); return r.publication; };
  const src = x.media?.src || '';
  sheet(`<h3>Your post</h3>
    <button class="opt opt-adv" data-m="advertise"><span class="e">${I.send}</span><div>Advertise<div class="d">Get more views, followers or customers</div></div></button>
    <button class="opt" data-m="edit"><span class="e">${I.edit || '✎'}</span><div>Edit caption & topic</div></button>
    ${x.format === 'reel' ? `<button class="opt" data-m="cover"><span class="e">${I.image}</span><div>Change cover</div></button>` : ''}
    <button class="opt" data-m="vis"><span class="e">${I.lock}</span><div>Who can watch<div class="d">${VIS[x.visibility || 'everyone']}</div></div></button>
    <button class="opt" data-m="comments"><span class="e">${TT.comment}</span><div>${x.allowComments === false ? 'Turn comments on' : 'Turn comments off'}</div></button>
    <button class="opt" data-m="dl"><span class="e">${BRAND.download}</span><div>${x.allowDownload === false ? 'Allow others to save' : 'Stop others saving'}</div></button>
    <button class="opt" data-m="pin"><span class="e">${I.star}</span><div>${x.pinned ? 'Unpin from profile' : 'Pin to profile'}</div></button>
    ${src ? `<a class="opt" data-m="save" href="${escAttr(src)}" download><span class="e">${BRAND.download}</span><div>Save to device</div></a>` : ''}
    <button class="opt danger" data-m="delete"><span class="e">${I.trash}</span><div>Delete</div></button>`, (sh, close) => {
    $$('[data-m]', sh).forEach(b => b.onclick = async e => {
      const m = b.dataset.m; if (m === 'save') return; close();
      try {
        if (m === 'advertise') return advertiseSheet(x);
        if (m === 'edit') return editSheet();
        if (m === 'cover') return coverSheet();
        if (m === 'vis') return sheet(`<h3>Who can watch</h3>${Object.entries(VIS).map(([k, l]) => `<button class="ep-choice ${(x.visibility || 'everyone') === k ? 'on' : ''}" data-v="${k}"><span>${l}</span><i></i></button>`).join('')}`, (s2, c2) => $$('[data-v]', s2).forEach(v => v.onclick = async () => { c2(); await put({ visibility: v.dataset.v }); toast('Saved'); }));
        if (m === 'comments') { await put({ allowComments: x.allowComments === false }); return toast(x.allowComments === false ? 'Comments off' : 'Comments on'); }
        if (m === 'dl') { await put({ allowDownload: x.allowDownload === false }); return toast('Saved'); }
        if (m === 'pin') { await put({ pinned: !x.pinned }); return toast(x.pinned ? 'Pinned to your profile' : 'Unpinned'); }
        if (m === 'delete') { if (!confirm('Delete this post? This can’t be undone.')) return; await api('/social/posts/' + encodeURIComponent(x.id), { method: 'DELETE' }); onDelete && onDelete(); }
      } catch (er) { toast(er.message); }
    });
  });
  function editSheet() {
    const TOP = [['quran', 'Quran'], ['sunnah', 'Sunnah'], ['character', 'Character'], ['wellbeing', 'Wellbeing'], ['learning', 'Learning'], ['world', 'World']];
    sheet(`<h3>Edit post</h3><label class="lbl">Caption</label><textarea class="input" id="ec" rows="5" maxlength="2200">${esc(x.hook || '')}</textarea>
      <div class="ep-meta"><span></span><span id="ecn"></span></div>
      <label class="lbl">Topic</label><div class="chips wrap">${TOP.map(([k, l]) => `<button class="chip ${x.topic === k ? 'on' : ''}" data-t="${k}">${l}</button>`).join('')}</div>
      <button class="btn accent block" style="margin-top:14px" id="es">Save</button><p class="err"></p>`, (s2, c2) => {
      let topic = x.topic; const ta = $('#ec', s2), cnt = () => $('#ecn', s2).textContent = `${ta.value.length}/2200`; ta.oninput = cnt; cnt();
      $$('[data-t]', s2).forEach(b => b.onclick = () => { topic = b.dataset.t; $$('[data-t]', s2).forEach(y => y.classList.toggle('on', y === b)); });
      $('#es', s2).onclick = async () => { try { await put({ caption: ta.value, topic }); c2(); toast('Post updated'); } catch (er) { $('.err', s2).textContent = er.message; } };
    });
  }
  function coverSheet() {
    sheet(`<h3>Change cover</h3><p class="muted small">Pick a frame from your video, or upload a photo.</p>
      <video id="cv" src="${escAttr(src)}" playsinline muted preload="auto" style="width:100%;max-height:52vh;border-radius:14px;background:#000"></video>
      <input type="range" id="ct" min="0" max="100" step="0.1" value="0" style="width:100%;accent-color:var(--accent)">
      <div class="row" style="gap:8px;margin-top:8px"><button class="btn accent grow" id="cuse">Use this frame</button><label class="btn ghost grow">Upload photo<input type="file" accept="image/*" hidden id="cup"></label></div><p class="err"></p>`, (s2, c2) => {
      const v = $('#cv', s2), r = $('#ct', s2);
      v.onloadedmetadata = () => { r.max = v.duration || 0; r.value = x.media?.coverTime || 0; v.currentTime = +r.value; };
      r.oninput = () => { v.currentTime = +r.value; };
      const upload = async blob => { const m = await fetch('/api/social/media', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob, credentials: 'same-origin' }).then(async res => { const j = await res.json(); if (!res.ok) throw new Error(j.error || 'Upload failed'); return j; }); return m.media.id; };
      $('#cuse', s2).onclick = async () => { try { const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0); const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', .88)); await put({ posterId: await upload(blob), coverTime: +r.value }); c2(); toast('Cover updated'); } catch (er) { $('.err', s2).textContent = er.message; } };
      $('#cup', s2).onchange = async e => { const f = e.target.files[0]; if (!f) return; try { await put({ posterId: await upload(f) }); c2(); toast('Cover updated'); } catch (er) { $('.err', s2).textContent = er.message; } };
    });
  }
}
