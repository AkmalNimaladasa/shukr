# Shukr feature-builder brief (shared by all parallel builders)

Project: /opt/data/projects/shukr — Islamic gratitude/learning PWA (Express + embedded PGlite Postgres, vanilla ES modules, bundled by esbuild).
Live: https://shukr-1467.roarai.app. DO NOT deploy. DO NOT edit files owned by other builders (listed in your task). Work ONLY in the files your task names.

## Plug-in architecture (already set up)
- Server: every `lib/features/*.js` is auto-loaded by server.js: `module.exports = function (ctx) { ... }`.
  ctx has: `app` (express), `q(sql, params)` (Postgres; returns {rows}), `auth` (middleware; req.user = {id,email,name,settings}), `wrap(asyncHandler)`,
  `aiChat(messages, {model, json, max_tokens, temperature})` → string, `parseJson(str)`, `FAST_MODEL`, `CHAT_MODEL`, `isAdmin(user)`, `pushUser(userId, payload)`,
  `localParts(tz)` → {day:'YYYY-MM-DD', hh, mm, weekday:'Mon'}, `todayFor(user)`, `prayerTimesFor(settings, day)`.
  Create your own tables lazily: `let ready; const ensure = () => ready ||= q('CREATE TABLE IF NOT EXISTS ...').catch(e => { ready = null; throw e; });`
  (PGlite = real Postgres syntax; JSONB, SERIAL, TIMESTAMPTZ ok). Prefix tables with your feature name. Route prefix `/api/<feature>/...`. Always `auth`.
  Validate/limit all inputs (lengths, numbers), never trust client data, rate-limit writes that cost money (AI).
- Client: create `public/js/features/<name>.js` exporting `export const routes = [[/^\/path$/, (m, q) => viewFn(q), 'sectionKey'], ...]`.
  Register it by adding ONE import line + entry to `MODS` in `public/js/features/index.js` (coordinate: append only, keep alphabetical-ish; tolerate others editing it — re-read before writing, use a minimal patch).
- Menu entries are ALREADY in `public/js/core.js` SECTIONS (paths: /new-to-islam, /creator/analytics, /sunnah, /challenges, /istighfar, /salah-guide, /ayah-finder, /tafsir, /seerah, /barakah, /wealth, /halal-places). Use exactly those paths.
- CSS: append to `public/styles.css` ONLY inside a block starting with a comment `/* ===== feature: <name> ===== */`, use class prefix `<shortname>-`. Use theme vars: --text, --text-2, --text-3, --surface, --surface-2, --border, --border-2, --accent, --bg. Must look right in light AND dark ([data-theme="dark"]) — keep text contrast ≥ 4.5:1. No emoji as icons (some phones show boxes) — use `I.<name>` SVG icons from core.js (I has: menu edit undo back home book quran scroll brain mic wave beads moon sun clock cal gem chart cap compass star starFill gear send stop copy retry save check plus x trash search speaker mute heart heartFill hands chat users pin mosque headphones hourglass flame leaf scale bulb target alert sparkle coin fast dua eye share flag settings mail create bag briefcase tag dollar wallet gift smile camera link globe block image bookmark external lock grid megaphone info user shield more download phone route layers sliders kaaba).
- Client helpers from './core.js' (import from '../core.js'): `$ $$ esc escAttr LS I api state toast vibrate shell bindGo go sheet confirmSheet md localDay hijriParts hijri fmtTime computeTimes PRAYERS empty loadingHTML onCleanup every askAlim saveSettings ring`.
  `shell(title, {back:'/path'})` returns the page element; set `.innerHTML`. `api('/x')` GET, `api('/x', {body})` POST, `api('/x', {method:'PUT', body})`. Errors throw Error(message).
  `askAlim(text)` opens the Alim chatbot with a prompt. `sheet(html, (el, close) => {...})` bottom sheet. `bindGo(root)` wires `data-go="/path"` links.
- Style: colourful, modern, TikTok/Instagram-quality, mobile-first (test at 392×735). Rounded cards, gradients for hero areas, clear hierarchy. Short friendly copy. Never mention commissions/percentages.

## Content rules (STRICT)
- Islamic facts must be accurate with references (Quran surah:ayah; hadith collection + number, only sahih/hasan; say "reported by" when unsure). Prefer well-known, verifiable references. No weak/fabricated hadith. If unsure of a number, cite the collection without a number rather than invent one.
- No copyrighted text: write ALL English yourself (original wording). Quran English must be Pickthall (public domain) from `/data/quran-en-pickthall.json` ([surah][ayah] arrays, 0-indexed) and Arabic from `/data/quran-ar.json`; surah meta `/data/quran-meta.json` ({surahs:[{n,ar,en,tr,ayahs,type}]}).
- No music/instruments. No impersonation of real people. Don't present fiqh rulings as your own; for contested matters say scholars differ and suggest asking a scholar.
- Halal finance: never give personalised investment advice; add "not financial advice — consult a qualified advisor/scholar" notes.

## Testing (required before you report done)
1. `node --check` every server file you wrote. 2. `cd /opt/data/projects/shukr && bash build.sh | head -1` must print `built v=...` (if it fails because of ANOTHER builder's file, report it, don't fix theirs).
3. Start your own server on YOUR assigned port (never 3322): `cd /opt/data/projects/shukr && set -a && . ./.env.local && set +a && (PORT=<port> FFMPEG=$PWD/node_modules/ffmpeg-static/ffmpeg setsid nohup node server.js > /opt/data/cache/scratch/<name>.log 2>&1 &) ; sleep 15`.
   Locally the DB is in-memory per process (fresh each start), so parallel servers on different ports don't clash; data is lost on restart.
4. API smoke test with python urllib: register a user via POST /api/register {email,password:'good-pass-9',name} with header Origin=http://127.0.0.1:<port>; the session cookie is `Secure`, so capture Set-Cookie `sid` and send it manually as `Cookie: sid=...`.
5. Kill your server when done (`kill <pid>` of your own process only — never pkill node/chrome).
Report: files created/changed, endpoints, what you tested and results, anything left undone.
