# MASTER PROMPT — "Shukr" Muslim Companion App (rebuild & extend)

Paste everything below into a fresh session (Hermes / Claude Code / Codex / Cursor). It is self-contained.

---

## 0. Ground rules for the builder

- **Budget:** the owner has capped AI spend on the provider. Work in the **phases in §9, in order**, deploy after every phase, and keep the app working after each phase so a budget cut-off never leaves it broken.
- **Test before you report.** After each phase:
  - run the server locally;
  - hit every new API route with curl;
  - open the UI in a headless mobile viewport (390×844);
  - screenshot each new screen and check for JS console errors.
  - Fix bugs and re-test until clean. **Never claim something works without real test output.**
- **Never print, log or paste secrets** (API keys, VAPID private key, passwords). Read them from env vars only.
- **Explicit confirmation required** before deleting anything, or sharing or editing the user's Google Drive files.
- **Islamic content rule:** the chatbot cites Quran, authentic Sunnah and **published fatwas** (IslamQA, IslamWeb, SeekersGuidance, Dar al-Ifta, Permanent Committee, etc., with links). It **never issues its own fatwa**.
- **Scope:** PWA only for now. No App Store / Play Store build, but keep the code wrapper-friendly (Capacitor later).

---

## 1. What already exists (current state)

**Live URL:** https://shukr-1467.roarai.app (installable PWA)
**Source:** `/opt/data/projects/shukr`

**Hosting:** Roar AI (https://cloud.roar-ai.com). The Roar AI MCP is connected in Hermes as akmal@terminusapp.ai (org Terminus).
- App id: `e7e0ccd1-830e-4945-8066-4ee44de8aa9a` (deployed from files, region `lk`).

**Redeploy steps:**
1. Call `mcp__Roar_AI__create_upload_link` with `appId`.
2. In the project folder, run:
   `tar -czf - --exclude=node_modules --exclude=.git --exclude=.env.local . | curl -sS --fail-with-body -T - -H 'content-type: application/gzip' -H 'x-roar-upload-code: <code>' https://cloud.roar-ai.com/upload`
3. Call `mcp__Roar_AI__deploy_upload {uploadId}`.
4. Call `mcp__Roar_AI__get_deploy_status {appId, waitSeconds:50}`.

**Database:** the free Roar plan has a limit of 2 managed DBs, both used by other apps.
- The app therefore uses **embedded Postgres (PGlite, `@electric-sql/pglite`)**.
- The data dir is gzip-snapshotted to the app's private **S3 bucket** (`S3_*` env vars injected by Roar) every 20 s and on SIGTERM, then restored on boot. This was verified to survive a redeploy.
- If the owner tops up ($5+), switch to managed Postgres via `add_app_database` (the code already supports `DATABASE_URL`).

**AI:** the deployed app gets `ROAR_API_KEY` and `ROAR_BASE_URL` (OpenAI-compatible, already ends in `/v1`) automatically. The app has a $20/month hard AI cap.
- Chat: `claude-sonnet-5-5`. Background tasks: `claude-haiku-5-5`. Embeddings: `text-embedding-3-small`.
- **Verified capabilities on this gateway:**
  - **Web search:** `"tools":[{"type":"web_search"}]`. Works with streaming, and combined with function tools. About $0.01 per search.
  - **TTS:** `POST $ROAR_BASE_URL/audio/speech` with `{"model":"tts-1","voice":"alloy","input":"…"}`, returns audio/mpeg.
  - **STT:** `POST $ROAR_BASE_URL/audio/transcriptions` (multipart: `file`, `model=whisper-large-v3-turbo`), returns `{"text":…}`.
  - **Function / tool calling** works (OpenAI format). Vision via `image_url` parts. PDFs via `file` parts.
  - Streaming SSE works. Always stream chat (non-streamed requests time out at about 2 min).
- A local test key lives in `/opt/data/projects/shukr/.env.local` (git-ignored, $10 cap). Load it with `set -a; . ./.env.local; set +a`.

**Stack:**
- Node 18+, Express, `pg`, `@electric-sql/pglite`, `@aws-sdk/client-s3`, `web-push`, `adhan`.
- Vanilla-JS SPA (no build step).
- Files: `server.js`, `public/index.html`, `public/app.js`, `public/styles.css`, `public/sw.js`, `public/manifest.webmanifest`, `public/icons/*`, `public/vendor/adhan.js`.

**Features already built (keep and improve):**
- **Auth:**
  - Email + password (scrypt), cookie sessions.
  - Delete-account endpoint (`DELETE /api/account`) and JSON export.
- **Gratitude journal:**
  - Daily prompt and mood (1–5).
  - The AI extracts every blessing into a category, then adds tags and a reflection citing an ayah or hadith.
- **Blessings tab:** all recorded blessings, categories, favourites, search, and "remember this blessing" resurfacing.
- **AI companion (currently named "Noor", to be renamed "Alim"):**
  - Streaming chat with modes: coach, teach, reflect, istikhara.
  - Long-term memory: facts, people, goals, struggles, preferences, learned, wins.
    - Extracted after every chat or journal entry.
    - Deduped by embedding cosine > 0.9.
    - Recalled by similarity + importance + recency.
  - A memory management page.
  - Conversation list in a drawer, auto-titles.
- **Learn:** AI micro-lessons with a 3-question quiz. Completed lessons are saved as "learned" memories.
- **Dhikr:** tasbih with 10 presets, Tasbih of Fatimah mode, custom dhikr, and a daily goal.
- **Adhkar (Hisnul Muslim, from hisnmuslim.com API):**
  - Morning, evening, sleep, waking, after-salah, istikhara, worry, anguish.
  - Arabic, transliteration and English, a repeat counter, and audio.
- **Prayer times:**
  - adhan.js calculation, plus logging per prayer (on time / jama'ah / late / missed).
  - Quran pages and fasting log; tahajjud times.
- **Insights:**
  - Streaks (journal, morning, evening, dhikr goal, all 5 prayers, any practice).
  - Week-over-week stats, mood trend, and Pearson correlations of habits vs mood.
  - **On-device logistic regression** "good-day model".
  - Blessing themes and weekday consistency.
  - An AI-written insights card.
- **Push reminders (Web Push, VAPID keys auto-generated and stored in the DB):**
  - Prayer times, morning/evening adhkar, journal, streak-at-risk, sleep and Friday reminders.
  - A server tick runs every 60 s.
- **Also built:** Qibla page, 99 Names, ayah of the day, Hijri date, light/dark themes, offline shell via the service worker.
- **UI:** Claude-mobile look.
  - Cream `#F5F4EE` background, terracotta `#C96442` accent.
  - Serif headings (Source Serif 4), Inter body, Amiri for Arabic.

**Known bugs to fix:**
- **The dhikr counter does not work reliably.** The tap target is re-rendered on every tap via `innerHTML`, so rebinding loses taps. The ring is also too small.
- **Prayer times are not Muslim Pro–accurate for Colombo.** See §3.
- **Emoji / ﷺ glyphs rendered as tofu** in some fonts. Use SVG icons and make sure the font stack covers U+FDFA.
- **Bottom tab bar must be removed.** Navigation should use the left menu only.
- **Insights card wording:** label it "Last 7 days", not "This week".

---

## 2. Owner's full feature request (verbatim intent, all required)

1. **Fix the dhikr counter.**
   - The tap button must fill **more than ¾ of the screen**.
   - **Every tap vibrates the phone** (`navigator.vibrate`; iOS Safari has no vibrate API, so add an audible/visual tick fallback and document it).
   - No missed taps: bind once and update text nodes only.
2. **Test the whole app after building.** No errors. Re-run and fix until it's clean.
3. **Quran section:**
   - Arabic (Uthmani) + **Abdullah Yusuf Ali** English, plus a selector for **any international translation** (118 editions across 48 languages via alquran.cloud, including Sinhala, Tamil and Urdu).
   - **Audio recitation** that's easy to play: per-ayah and whole-surah, reciter choice, continuous play, highlighting of the current ayah.
   - **Auto progress tracking:** last read position, pages and ayahs read per day, khatam progress %, and a streak.
   - **"Gems" shortcuts:** Al-Waqi'ah (56), Al-Mulk (67), Al-Baqarah (2), Ya-Sin (36), Al-Kahf (18), Ar-Rahman (55), As-Sajdah (32), Ad-Dukhan (44), Al-Fatihah (1), Ayat al-Kursi (2:255), last 2 ayat of Baqarah (2:285–286), the 3 Quls (112–114), and Al-Insan (76).
   - **Ayah of the day.**
4. **Hadith section** (separate from Quran):
   - Books: Bukhari, Muslim, Abu Dawud, Tirmidhi, Nasa'i, Ibn Majah, Muwatta Malik, Nawawi 40, Hadith Qudsi 40, Dehlawi 40.
   - Browse by book and chapter, Arabic + English, search, bookmarks, hadith of the day.
5. **Hifz (memorisation) section:**
   - Pick surahs/ayahs to memorise, with a per-ayah status (new, learning, memorised, needs review).
   - **Spaced-repetition review queue** (SM-2).
   - A hide-words / reveal practice mode and repeat-ayah audio looping.
   - A progress tracker (ayahs and juz memorised).
6. **Tajweed learning section:**
   - Lessons on the rules: makharij, noon sakinah & tanween (izhar, idgham, iqlab, ikhfa), meem sakinah, madd types, qalqalah, ghunnah, tafkheem/tarqeeq, and waqf signs.
   - Colour-coded tajweed text (the alquran.cloud `quran-tajweed` edition has inline markup like `[h:4[ٱ]…`; parse it into coloured spans with a legend).
   - **Mic recording with assessment:**
     1. Record via MediaRecorder.
     2. Transcribe with Whisper (`whisper-large-v3-turbo`, language `ar`).
     3. Diff against the target ayah (normalised Arabic, word-level) to show missed, extra and wrong words.
     4. Have the LLM give tajweed feedback based on the diff.
   - State clearly that this is an **AI estimate, not a certified teacher**, and recommend a qualified teacher for ijazah-level correction.
7. **Chatbot renamed "Alim":**
   - Should have the features of ChatGPT:
     - streaming;
     - markdown;
     - copy, edit and resend, regenerate;
     - stop button;
     - conversation history with search, rename and delete;
     - image upload (vision), file/PDF upload;
     - **web browsing** (Roar `web_search` tool), shown with source links.
   - **Voice mode:**
     - A **mic button** for speech-to-text (Whisper) in the composer.
     - A full **hands-free voice conversation mode**: record, transcribe, reply with Alim, speak it via TTS `tts-1`, then loop. A big animated orb UI, tap to interrupt.
   - **"Infinite" memory:**
     - Store every message permanently.
     - Embed all messages and memories and do semantic recall over the whole history (RAG) on every turn.
     - Keep a rolling summary per conversation and a "life summary" of the user that is updated periodically.
     - Expose tools to the model: `save_memory`, `search_memory`, `update_memory`, `forget_memory`.
     - Note: "infinite" = unlimited stored history plus retrieval, not an infinite context window.
   - Learns and teaches the user (lessons + memory of what was learned).
   - **References Quran, Sunnah and published fatwas only.** It must:
     - search the web restricted to reputable fatwa sites when asked a fiqh question;
     - quote and link the fatwa;
     - give the scholar or institution name;
     - never give its own ruling, and say "consult a qualified scholar" for personal cases.
8. **Insights from chats:**
   - Mine conversations and journal entries for recurring emotions, triggers, struggles, strengths and growth over time.
   - Teach the user about their patterns in order "to make me a better human": character (akhlaq) development, suggested practices, and progress tracking.
   - Keep the existing statistics and ML (correlations + logistic model).
9. **Gratitude reminders using recorded blessings:**
   - Push notifications that quote one of the user's own past blessings ("3 weeks ago you thanked Allah for… say Alhamdulillah").
   - Set a schedule (1–3× per day).
10. **Akhirah reminders:**
    - Scheduled push and in-app reflections on the **grave (qabr), Jannah, Jahannam, the Sirat, and Qiyamah**, each with a Quran ayah or authentic hadith reference.
    - Content must be accurate and cited (build a curated JSON of 40+ items with references).
    - Toggle on/off and set frequency.
11. **Prayer-time reminders:** a notification + **vibration buzz only, no adhan sound** (`silent:false` with `vibrate:[200,100,200]` and no custom sound).
12. **Prayer times accurate to Muslim Pro for Colombo.** See §3.
13. **Calendar:**
    - Dual **Hijri + Gregorian** month view.
    - Islamic events: Ramadan, Eids, Day of Arafah, Ashura, Isra–Mi'raj, Laylat al-Qadr (last 10 nights), the white days (13–15), and Mondays/Thursdays for sunnah fasting.
    - A Hijri adjustment setting (±2 days).
14. **Audiobooks section** (public-domain LibriVox audiobooks hosted on archive.org):
    - Player with chapters, resume position, playback speed, and a sleep timer.
15. **Soft background nasheed on launch:**
    - **Mute toggle** always visible, remembered.
    - Respect autoplay rules: browsers block autoplay with sound, so start on first tap with a gentle fade-in.
    - Default volume about 0.25, looped.
16. **Dark mode toggle, default LIGHT.** Plus **themes** (e.g. Claude Cream, Emerald, Midnight, Sand, Rose, High-contrast) and an Arabic font-size slider.
17. **Customisation:** toggles to **show/hide each section** in the menu, reorder the home cards, and choose which home widgets appear.
18. **Navigation:** a **left side menu only** (a hamburger drawer like Claude mobile; on tablet/desktop a persistent left sidebar). **No bottom tab bar.**
19. **Qibla** using the **phone compass**:
    - iOS `DeviceOrientationEvent.requestPermission` and `webkitCompassHeading`.
    - Android `deviceorientationabsolute`.
    - Calibration hint and a vibration when aligned.
20. **Ummah section (social):**
    - Usernames (unique), profile with avatar/bio/location, follow, posts (text + image), likes, comments.
    - Share a blessing or dua request, plus a "make dua for me" button with a counter.
    - Moderation:
      - AI auto-moderation (Haiku) on every post/comment;
      - report button;
      - block user;
      - an admin role for the owner (akmal@terminusapp.ai) with a moderation queue.
    - Privacy: private profile option.
21. **Mosque finder:**
    - **OpenStreetMap map (Leaflet)** of nearby mosques (Overpass API, `amenity=place_of_worship` + `religion=muslim`).
    - Each mosque has an **"Open in Google Maps" directions** button: `https://www.google.com/maps/dir/?api=1&destination=LAT,LNG`.
    - Overpass endpoints: `https://overpass-api.de/api/interpreter` returns 406 from the sandbox, so call it from the browser or with a proper User-Agent. `https://maps.mail.ru/osm/tools/overpass/api/interpreter` works as a fallback.
22. **Store publishing:** **skipped for now (PWA only).** Keep the code Capacitor-ready.
23. **Polish and test everything.** Bugs get fixed and re-tested until clean.

### Extra additions approved ("any additions you can think of")
- **Already built, keep:** 99 Names, journaling prompts, data export.
- **New:**
  - Zakat calculator.
  - Fasting tracker (Ramadan + sunnah fasts).
  - Dua collection by occasion (from Hisnul Muslim chapters, e.g. travel, illness, anxiety).
  - Daily checklist widget.
  - Weekly AI review.
  - Share-card image of a blessing or ayah.

---

## 3. Prayer times — match Muslim Pro (Colombo)

Muslim Pro's own page for Colombo (city id 1248991) shows `applied_convention_key: "MWL"` but the times do **not** match standard MWL (18°/17°).

**Ground truth scraped from muslimpro.com (Asia/Colombo):**

| Date | Fajr | Sunrise | Dhuhr | Asr | Maghrib | Isha |
|---|---|---|---|---|---|---|
| 2026-11-15 | 04:41 | 06:00 | 11:56 | 15:18 | 17:50 | 19:02 |
| 2026-11-16 | 04:42 | 06:02 | 11:57 | 15:19 | 17:50 | 19:03 |
| 2026-11-17 | 04:42 | 06:02 | 11:57 | 15:19 | 17:50 | 19:03 |
| 2026-11-18 | 04:42 | 06:02 | 11:57 | 15:19 | 17:50 | 19:03 |

(7 days, 2026-11-15 → 2026-11-21, are embedded in the page's JSON as `"prayer_times":[{"date":…,"times":[fajr,sunrise,dhuhr,asr,maghrib,isha]}]`.)

**Best fit found with adhan.js** (coords 6.9271, 79.8612, Shafi Asr):
- `CalculationMethod.Other()` with **fajrAngle 19.6–19.7, ishaAngle 18**, `adjustments {dhuhr:+1, asr:+1}`, `rounding: Nearest`.
- This matches within ±1 min on all days.

**Implement:**
1. A "Muslim Pro (Sri Lanka)" preset with those parameters, set as the default when the timezone is `Asia/Colombo`.
2. Optionally, a server route `/api/muslimpro?cityId=` that fetches `https://www.muslimpro.com/Prayer-times-<anything>-<cityId>` (works server-side with a mobile UA). It should regex out the `prayer_times` array, cache it for 24 h, and use it as the source of truth when available, with adhan.js as fallback.
3. A city search via `https://geocoding-api.open-meteo.com/v1/search?name=…` (its `id` equals the GeoNames id, which Muslim Pro uses as its city id, e.g. Colombo = 1248991).

**Verify:** a test script compares the app's computed times against the scraped Muslim Pro times for Colombo for 7 days and asserts the difference is ≤ 1 min.

---

## 4. Data already downloaded (in `public/data/`)

- `quran-meta.json`: 114 surahs (names, ayah counts, Meccan/Medinan), 30 juz starts, 604 page starts.
- `quran-ar.json`: full Uthmani Arabic, `[surah][ayah]` (1.37 MB).
- `quran-en-yusufali.json`: full Yusuf Ali, `[surah][ayah]` (0.9 MB).
- `quran-pages.json`: Mushaf page number per ayah.
- `quran-translations.json`: 118 translation editions (`id`, `lang`, `name`).
  - Load any of them live from `https://api.alquran.cloud/v1/surah/{n}/editions/quran-uthmani,{id}` (CORS-enabled).
- `hadith-books.json`: 10 collections with chapters (first/last hadith numbers).
  - Load a chapter live: `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/{eng|ara}-{book}/sections/{n}.min.json`.
  - Single-hadith URLs fail on jsDelivr (package-size limit), so always load **sections**.
- `audiobooks.json`: 7 LibriVox books with archive.org MP3 track lists:
  - Pickthall's *Meaning of the Glorious Koran* (69 tracks);
  - *Confessions of al-Ghazali*;
  - al-Mawardi's *Adab al-Dunya wa'l-Din*;
  - *Mystics of Islam*;
  - *Spirit of Islam*;
  - *Travels of Ibn Battuta*;
  - Burton's *Pilgrimage*.
- `adhkar.json`: the 8 Hisnul Muslim categories (from hisnmuslim.com API `https://www.hisnmuslim.com/api/en/{chapter}.json`; chapters 27 morning/evening, 28 sleep, 1 waking, 25 after salah, 26 istikhara, 34 worry, 35 anguish). Audio at `https://www.hisnmuslim.com/audio/ar/{ID}.mp3`.
- `names.json` (99 Names); `ayat.json` (35 curated gratitude ayat).
- `public/audio/nasheed.mp3`: **"Alhamdulillah" by Jawad Syed, vocal-only nasheed, CC BY 3.0** (Wikimedia Commons). 64 kbps mono with fade-in, 1.5 MB. **Credit it in Settings → About.**

**Quran audio CDN (verified):**
- Per ayah: `https://cdn.islamic.network/quran/audio/{bitrate}/{reciter}/{globalAyahNumber}.mp3`.
- Whole surah: `https://cdn.islamic.network/quran/audio-surah/128/ar.alafasy/{surah}.mp3`.

| Reciter id | Working per-ayah bitrates |
|---|---|
| `ar.alafasy` | 128, 64 (surah files also at 128) |
| `ar.abdulbasitmurattal` | 192, 64 |
| `ar.husary` | 128, 64 |
| `ar.minshawi` | 128 |
| `ar.abdurrahmaansudais` | 192, 64 |
| `ar.mahermuaiqly` | 128, 64 |
| `ar.saoodshuraym` | 64 |
| `ar.hudhaify` | 128, 64 |
| `ar.husarymujawwad` | 128, 64 |
| `ar.muhammadayyoub` | 128 |
| `ar.abdullahbasfar` | 192, 64 |
| `en.walk` (English, Sahih Intl) | 192 |

- Alternative whole-surah source with CORS: `https://download.quranicaudio.com/quran/mishaari_raashid_al_3afaasee/{NNN}.mp3`.
- Global ayah number = cumulative ayah index (compute from `quran-meta.json`).

---

## 5. Architecture to build

- **Keep:** Express + PGlite/S3 snapshot (or managed Postgres if `DATABASE_URL` exists), vanilla JS (or Preact via ESM CDN if needed), no build step, and a service worker for offline (cache the Quran JSON and the shell).
- **Split `app.js` into modules** (`/public/js/*.js`, ES modules): core, nav, home, journal, blessings, alim, voice, quran, hadith, hifz, tajweed, dhikr, adhkar, prayer, calendar, qibla, mosques, ummah, audiobooks, insights, settings.
- **New DB tables:**
  - `quran_progress`, `quran_reads` (daily)
  - `bookmarks`
  - `hifz_items` (surah, ayah, status, ease, interval, due)
  - `tajweed_attempts`
  - `hadith_bookmarks`
  - Ummah: `profiles` (username unique), `follows`, `posts`, `comments`, `likes`, `dua_requests`, `reports`, `blocks`
  - `akhirah_sent`, `blessing_reminders_sent`
  - `message_embeddings` (for infinite memory RAG)
  - `conversation_summaries`, `user_summary`
  - `settings` (theme, sections, home layout, nasheed mute, reminder schedules)
- **Endpoints:**
  - `/api/stt` (multipart → Roar Whisper)
  - `/api/tts` (text → mp3 stream)
  - `/api/chat` (SSE, with tools: `web_search` + memory functions + `quran_lookup` + `hadith_search`)
  - `/api/tajweed/assess`
  - `/api/mosques?lat&lng` (Overpass proxy with UA + cache)
  - `/api/muslimpro`
  - `/api/ummah/*`
  - `/api/hifz/*`
  - `/api/quran/progress`
  - `/api/insights/patterns` (chat-mining)
- **Push:** keep `web-push`. Add these reminder kinds, each with toggles and times in Settings:
  - blessing-quote
  - akhirah (qabr / jannah / jahannam / sirat / qiyamah)
  - quran daily goal
  - hifz review due
  - prayer (buzz, no sound)
- **Cost control:**
  - Default chat model `claude-haiku-5-5`, with a "Deep" toggle that uses `claude-sonnet-5-5`.
  - Web search only when needed (model decides via the tool).
  - Cache insights daily.
  - Keep the app's $20/month cap.

---

## 6. UI / UX spec

- **Claude mobile style.**
  - Light: cream background `#F5F4EE`, white cards, terracotta accent `#C96442`.
  - Fonts: serif headings (Source Serif 4), Inter body, Amiri / Scheherazade for Arabic.
  - Soft borders and radius 16–20.
  - **Default theme: light.**
- **Left drawer menu only:** hamburger at the top left, sections grouped, user hidden sections removed, recent Alim chats listed below (like Claude's sidebar). On ≥ 900 px the sidebar is persistent.
- **Top bar:** menu · title · nasheed mute/unmute icon · new-chat pencil.
- **Dhikr screen:**
  - A full-screen tap zone (≥ 75 % of the viewport height), a big count, a progress ring around it, and the phrase above.
  - Haptic on each tap and a stronger pattern on completing a round.
  - No re-render on tap.
- **Alim chat:** like ChatGPT/Claude.
  - Composer controls: attach (image/PDF), mic (dictate), voice-mode orb button, send/stop.
  - Messages show web sources as chips.
  - Edit last message; regenerate.
- **Accessibility:** tap targets ≥ 44 px, `prefers-reduced-motion`, and contrast that meets WCAG AA.
- **Branding:** the app icon is the existing crescent + star (`public/icons/`). Don't use Anthropic's logo shape for Alim; use an 8-point Islamic star (khatam).

---

## 7. Content sources (cite in an About page)

- Quran text and translations: alquran.cloud (Tanzil). Yusuf Ali translation.
- Audio: islamic.network CDN and quranicaudio.com.
- Hadith: fawazahmed0/hadith-api (sunnah.com-derived).
- Adhkar: Hisnul Muslim (hisnmuslim.com).
- Audiobooks: LibriVox / archive.org (public domain).
- Nasheed: Jawad Syed, CC BY 3.0.
- Maps: © OpenStreetMap contributors (ODbL).
- Prayer calculation: adhan.js plus the Muslim Pro–matched preset.

---

## 8. Definition of done (testing checklist)

For each phase, run an automated smoke test script (`tests/smoke.sh` or a node script) plus a headless-browser pass. All of the following must hold:

- [ ] Every API route returns 2xx for valid input and a clean 4xx for invalid input.
- [ ] Every screen loads in a 390×844 viewport with **zero console errors**. Capture screenshots and review them visually.
- [ ] The dhikr counter records 50 rapid taps = 50, persists after reload, and `navigator.vibrate` is called (stub it in the test).
- [ ] Colombo prayer times are within ±1 min of the Muslim Pro values in §3.
- [ ] Quran: open surah 67, Yusuf Ali shows, audio plays (HEAD 200), and progress updates after scrolling or marking read.
- [ ] Hadith: Bukhari chapter 1 loads Arabic + English.
- [ ] Alim:
  - streams a reply;
  - web-search question returns sources;
  - a memory saved in chat A is recalled in a new chat B;
  - STT round-trip: TTS a phrase, then STT it, and the text matches.
- [ ] Tajweed: upload a recorded/TTS Arabic sample, and the diff + feedback render.
- [ ] Ummah: two test users, follow, post, like, comment, report. Moderation blocks an abusive post. **Delete test users afterwards.**
- [ ] Mosque finder returns mosques near Colombo and the Google Maps link format is correct.
- [ ] Push: subscribe and the test notification is sent (200 from the push service).
- [ ] Data survives a redeploy (PGlite snapshot restore).
- [ ] Light is the default; the dark toggle works; themes apply; hidden sections disappear from the menu.
- [ ] The nasheed starts on first interaction, mute persists across reloads.
- [ ] Remove all test data and accounts before handing over.

---

## 9. Build phases (deploy + test after each)

1. **Foundations & fixes:**
   - Left-drawer-only nav and theme system (light default, dark toggle, themes, section toggles).
   - Nasheed with mute.
   - Rename Noor → Alim.
   - **Rebuilt dhikr counter.**
   - Muslim Pro prayer preset and buzz-only prayer notifications.
   - Hijri + Gregorian calendar.
2. **Quran:**
   - Reader (Arabic + Yusuf Ali + any translation).
   - Audio player with reciters.
   - Auto progress tracking and khatam.
   - Gems.
   - Ayah of the day.
   - Bookmarks.
3. **Hadith + Hifz + Tajweed:**
   - Hadith browser.
   - Hifz SRS tracker.
   - Tajweed lessons + colour-coded text + mic assessment.
4. **Alim upgrade:**
   - ChatGPT features.
   - Web browsing with sources.
   - Mic dictation + voice mode.
   - Infinite memory (RAG over all history + summaries).
   - Fatwa-citation policy.
5. **Insights & reminders:**
   - Chat-pattern mining.
   - Akhlaq growth.
   - Blessing-quote reminders.
   - Akhirah reminders (curated, cited).
   - Weekly review.
6. **Ummah + Mosques + Audiobooks + extras:**
   - Social with moderation.
   - OSM mosque finder with Google Maps directions.
   - Audiobooks player.
   - Zakat calculator.
   - Fasting tracker.
   - Duas by occasion.
7. **Final QA pass:**
   - Full checklist (§8).
   - Fix and re-test until clean.
   - Clean test data.
   - Final deploy.
   - Short report to the owner: what changed, what's verified, what's left.

**After each phase, report briefly:** what shipped, test results, and the live URL. Stop if the budget limit is hit; the app must remain working.
