# Shukr — licences, permissions & copyright checklist
Last reviewed: 23 Nov 2026. Status: ✅ cleared · ⚠️ condition to keep · ❌ permission needed before enabling

## ❌ Permission / licence still needed
| Item | What's needed | Current state |
|---|---|---|
| Quran recitation audio (every ayah) | Written commercial licence from a reciter/producer (allow streaming + caching, with credit), or commission a qari and own the recordings. Alternative partner: Quran Foundation API (check commercial terms). | Hidden. Turn on with env `LICENSED_RECITATION=1` after licence. |
| Makkah (Masjid al-Haram) adhan | Permission from the General Authority for the Affairs of the Two Holy Mosques or the recording owner. All Makkah uploads found were copied from YouTube. | Not included; never label another recording "Makkah". |
| Famous nasheeds (e.g. Soldiers of Allah, The Way of the Tears, Muhammad al-Muqit, Sami Yusuf, Maher Zain, Omar Esa, Bukhatir) | Licence from each artist/label. | Not included. |
| Quran translations other than Pickthall (Sahih International, Khattab, Hilali-Khan, Asad, Diyanet, Urdu/Tamil/Sinhala etc.) | Publisher permission per translation. Free-for-commercial option: ClearQuran (Khattab) text+English audio — CC BY-ND + commercial grant; no word changes, credit required. | Only Pickthall (public domain) shown. |
| Map tiles at very large scale | OpenFreeMap is free but has no SLA. At scale: self-host tiles (Protomaps/OpenMapTiles, set `MAP_STYLE_URL`) or a paid provider (MapTiler/Stadia). | Using OpenFreeMap. |
| Google Maps inside the app (if ever wanted) | Google Maps Platform billing + ToS (no copying Google places data into our DB). | Only free "Open in Google Maps" / directions links used. |
| "Shukr" name & logo | Trademark search + registration in key markets. | Not done. |
| DMCA / takedown (user uploads) | Register a DMCA agent with US Copyright Office; publish takedown policy; keep rights-confirmation on upload. | Rights confirmation exists; agent not registered. |
| App-store / legal docs | Privacy policy, Terms, GDPR/children's-privacy (COPPA) review, payments merchant agreement (PayHere). | Partly drafted in-app; needs legal review. |

## ⚠️ Cleared, but conditions must be kept
| Item | Licence | Condition |
|---|---|---|
| Quran Arabic text (Tanzil) | CC BY 3.0 | Credit + link tanzil.net; text must stay verbatim. |
| Pickthall English (1930) | Public domain | Credit translator. |
| Hadith Arabic (fawazahmed0/hadith-api) | Unlicense / PD | — |
| English of hadith, 40 Hadith, Qudsi, duas, adhkar, akhirah | Shukr's own (AI) translations | Recommend scholar review for accuracy. Old publisher English removed (backup in cache/scratch/data-backup). |
| 20 adhan recordings (Commons/Freesound) | CC0 / CC BY / CC BY-SA | Keep credits page (#/sounds/credits). CC BY-SA files we trimmed must stay under CC BY-SA. |
| 61 library sounds (nasheeds, vocals, nature) | CC0 / CC BY / CC BY-SA / PD | Same as above. Do a human listen for instruments on the 20 newest (AI check was inconsistent). |
| Users' own studio nasheeds & uploads | User-owned | Rights confirmation on upload; takedown process. |
| Map data | OpenStreetMap ODbL | Attribution must stay visible on the map. |
| MapLibre GL (BSD-3), Leaflet (BSD-2), adhan-js (MIT) | Open source | Keep licence files in /public/vendor. |
| Fonts Amiri, Figtree | SIL OFL | Keep licence. |
| Twemoji stickers | CC BY 4.0 | Credit (on credits page). |
| LibriVox audiobooks | Public domain (US) | Check PD status per country before featuring. |
| Prayer times | Own calculation (Muslim Pro scraping removed) | Don't name or scrape other apps. |
| AI features (Alim, TTS, captions) | Roar AI / model provider terms | Check commercial-use terms of the providers; disclose AI voices. |

## Minor clean-ups
- Editor hint text mentions "TikTok" ("like photo mode on TikTok") and Earn mentions Instagram/TikTok share targets — fine for sharing, but avoid using other brands' names in marketing.
- FYP house videos/images in public/media: confirm each is Shukr-made/AI-generated or licensed.
