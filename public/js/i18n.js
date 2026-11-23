// Live UI translation layer. Walks visible interface text, swaps in cached translations, and keeps up with
// new screens via a MutationObserver. Never touches: Arabic scripture (.ar, lang=ar), user-generated text
// (captions, comments, bios, names, chat), inputs, code — anything inside [data-no-i18n] or translate="no".
const KEY = 'shukr.lang', CACHE = 'shukr.i18n.';
let lang = 'en', dict = {}, rtl = false, observer = null, timer = null, inflight = false;
try { lang = localStorage.getItem(KEY) || 'en'; } catch {}
const pending = new Set(), asked = new Set();
const SKIP_SEL = 'script,style,textarea,input,select,code,pre,.ar,body [lang="ar"],[data-no-i18n],[translate="no"],.md,.msg,.fyp-caption,.tt-bio,.tt-head h1,.tt-handle,.tt-user,.ep-v,.mosque-name,.post .pb,.post .who,.um-person,.um-card,.um-story,.tj-words,.tj-cmp,.notranslate,.lang-list';
const ORIG = new WeakMap(); // text node -> English source
const OUT = new WeakMap();  // text node -> value we last wrote (so our own writes are ignored)
const ATTRS = ['placeholder', 'aria-label', 'title'];

export const currentLang = () => lang;
let langsP = null;
export function languages() { return langsP || (langsP = fetch('/data/languages.json').then(r => r.json())); }
function loadDict() { try { dict = JSON.parse(localStorage.getItem(CACHE + lang) || '{}'); } catch { dict = {}; } }
function saveDict() { try { localStorage.setItem(CACHE + lang, JSON.stringify(dict)); } catch {} }
const useful = t => t.length >= 2 && t.length <= 400 && /[A-Za-z]{2}/.test(t);

function doText(node) {
  const p = node.parentElement; if (!p || p.closest(SKIP_SEL)) return;
  // A node whose value differs from what we wrote was changed by the app → that's the new English source.
  if (!ORIG.has(node) || (OUT.has(node) && node.nodeValue !== OUT.get(node))) { ORIG.set(node, node.nodeValue); OUT.delete(node); }
  const src = ORIG.get(node), key = src.trim(); if (!useful(key)) return;
  let val = src;
  if (lang !== 'en') { const t = dict[key]; if (t) val = src.replace(key, t); else if (!asked.has(key)) pending.add(key); }
  if (node.nodeValue !== val) { node.nodeValue = val; }
  OUT.set(node, val);
}
function doAttrs(el) {
  if (el.closest(SKIP_SEL) && !el.matches('input,textarea')) return;
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue; const k = 'data-i18n-' + a;
    let src = el.getAttribute(k); const cur = el.getAttribute(a);
    if (src == null || (cur !== src && cur !== dict[src.trim()])) { src = cur; el.setAttribute(k, src); }
    const key = src.trim(); if (!useful(key)) continue;
    const want = lang === 'en' ? src : (dict[key] || src); if (lang !== 'en' && !dict[key] && !asked.has(key)) pending.add(key);
    if (cur !== want) el.setAttribute(a, want);
  }
}
function walk(root) {
  if (!root || !document.body) return;
  if (root.nodeType === 3) { doText(root); schedule(); return; }
  if (root.nodeType !== 1 || root.closest?.(SKIP_SEL)) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) doText(n);
  if (root.matches('[placeholder],[aria-label],[title]')) doAttrs(root);
  root.querySelectorAll('[placeholder],[aria-label],[title]').forEach(doAttrs);
  schedule();
}
function schedule() { if (!pending.size || lang === 'en') return; clearTimeout(timer); timer = setTimeout(flush, 200); }
async function flush() {
  if (inflight) return schedule();
  const batch = [...pending].filter(s => !(s in dict)).slice(0, 120); batch.forEach(s => { pending.delete(s); asked.add(s); });
  if (!batch.length) return; inflight = true; const forLang = lang;
  try {
    const r = await fetch('/api/i18n/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ lang: forLang, strings: batch }) });
    if (r.ok && forLang === lang) { const { map } = await r.json(); Object.assign(dict, map); saveDict(); }
  } catch {} finally { inflight = false; }
  if (forLang === lang) { pause(); walk(document.body); resume(); }
  if (pending.size) schedule();
}
const pause = () => observer && observer.disconnect();
const resume = () => observer && document.body && observer.observe(document.body, { childList: true, subtree: true, characterData: true });
function applyDir() { const h = document.documentElement; h.lang = lang; h.dir = rtl ? 'rtl' : 'ltr'; h.classList.toggle('rtl', rtl); }
export async function setLanguage(code) {
  const list = await languages(); const L = list.find(l => l.code === code) || list[0];
  lang = L.code; rtl = !!L.rtl; try { localStorage.setItem(KEY, lang); } catch {}
  loadDict(); asked.clear(); pending.clear(); applyDir(); pause(); walk(document.body); resume();
}
export async function initI18n() {
  try { const L = (await languages()).find(l => l.code === lang); rtl = !!(L && L.rtl); } catch {}
  loadDict(); applyDir();
  observer = new MutationObserver(muts => {
    if (lang === 'en') return; pause();
    try { for (const m of muts) { if (m.type === 'characterData') walk(m.target); else m.addedNodes.forEach(walk); } } finally { resume(); }
  });
  resume(); if (lang !== 'en') { pause(); walk(document.body); resume(); }
}
