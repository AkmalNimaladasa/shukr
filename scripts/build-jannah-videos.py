#!/usr/bin/env python3
"""Jannah Life content generator (@thejannahlife): beautiful animated 9:16 videos describing Jannah strictly as the
Qur'an describes it. Each video = 2-3 AI-painted scenes (no people/faces/animals/text) with slow Ken-Burns motion and
light particles, the Arabic ayah + Pickthall English (public domain) as captions, and audio = Arabic recitation of the ayat ONLY (Quran Foundation verse audio,
reciter credited; no nasheeds, no music). Output: public/media/jannah/<slug>.mp4/.jpg + jannah.json.
Usage: set -a; . ./.env.local; set +a; python3 scripts/build-jannah-videos.py [--only slug] [--limit N]
"""
import os, sys, json, subprocess, urllib.request, base64, pathlib, re, textwrap, random, time
ROOT = pathlib.Path(__file__).resolve().parent.parent
FF = os.environ.get('FFMPEG') or str(ROOT / 'node_modules/ffmpeg-static/ffmpeg')
OUT = ROOT / 'public/media/jannah'; OUT.mkdir(parents=True, exist_ok=True)
TMP = pathlib.Path(os.environ.get('TMPDIR', '/tmp')) / 'jannah'; TMP.mkdir(parents=True, exist_ok=True)
KEY, BASE = os.environ['ROAR_API_KEY'], os.environ['ROAR_BASE_URL'].rstrip('/')
FONT = str(ROOT / 'public/fonts/Figtree.ttf'); AR = str(ROOT / 'public/fonts/Amiri-Bold.ttf')
QAR = json.load(open(ROOT / 'public/data/quran-ar.json')); QEN = json.load(open(ROOT / 'public/data/quran-en-pickthall.json'))
SOUNDS = {s['id']: s for s in json.load(open(ROOT / 'public/sounds/commons.json'))['sounds']}

STYLE = ('Vertical 9:16 luminous dreamlike painting, ultra detailed, soft golden heavenly light, gentle mist, serene and majestic, '
         'NO people, NO faces, NO human or animal figures, NO text, NO letters, NO religious symbols. ')
# Each video: Qur'anic references (verified text pulled from bundled files), scene prompts, caption, nasheed bed.
VIDEOS = [
  dict(slug='rivers-beneath', refs=[(2, 25)], caption='Gardens underneath which rivers flow 🌿 (Qur’an 2:25) #Jannah',
       scenes=['endless lush gardens with crystal rivers flowing beneath fruit trees, emerald grass, golden light',
               'close view of a clear sparkling river winding under heavy fruit-laden branches, glowing water']),
  dict(slug='four-rivers', refs=[(47, 15)], caption='Rivers of water, milk, wine that harms not, and pure honey (Qur’an 47:15) 🍯',
       scenes=['four distinct gentle rivers through a paradise garden: one crystal-clear water, one creamy white, one deep ruby-golden, one amber honey, all glowing softly',
               'a calm river of pure golden amber honey flowing between flowering banks, warm sunlight']),
  dict(slug='shade-extended', refs=[(56, 28), (56, 29), (56, 30), (56, 31)], caption='Thornless lote-trees, clustered plantains, shade extended, water gushing (Qur’an 56:28-31) 🌴',
       scenes=['thornless lote trees and banana trees in tiers of fruit, a vast endless soft shade over green meadows',
               'a gushing waterfall of pure light-filled water into a turquoise pool surrounded by fruit trees']),
  dict(slug='no-idle-talk', refs=[(56, 25), (56, 26)], caption='No idle talk there, nor sin — only “Peace, peace” (Qur’an 56:25-26) 🤍',
       scenes=['a tranquil pearl-white pavilion with flowing silk curtains overlooking a calm garden at golden hour, utterly peaceful',
               'soft rays of light over a still lake with floating lotus flowers and distant pearl palaces']),
  dict(slug='eye-has-not-seen', refs=[(32, 17)], caption='No soul knows what joy is kept hidden for them (Qur’an 32:17) ✨',
       scenes=['a breathtaking otherworldly vista beyond imagination: floating gardens, rivers of light, palaces of pearl and gold above clouds',
               'an ornate golden gate slightly open with brilliant light pouring through onto a path of gems']),
  dict(slug='gardens-of-eden', refs=[(13, 23), (13, 24)], caption='“Peace be unto you because ye persevered” (Qur’an 13:23-24) 🕊️',
       scenes=['majestic gates of paradise with arches of gold and pearl, light flowing out, garden beyond',
               'a welcoming courtyard of white marble and gold with fountains and blossoming trees']),
  dict(slug='green-silk', refs=[(18, 31)], caption='Bracelets of gold, robes of green silk, reclining on couches (Qur’an 18:31) 💚',
       scenes=['luxurious couches with green silk and gold brocade cushions in a garden pavilion, no people',
               'flowing green silk fabric and golden ornaments catching soft light, elegant still life']),
  dict(slug='fruits-near', refs=[(69, 21), (69, 22), (69, 23), (69, 24)], caption='Its clusters of fruit hanging low (Qur’an 69:22-23) 🍇',
       scenes=['grape vines and fruit trees with clusters hanging low within easy reach, high lofty garden, golden light',
               'close-up of glistening grapes, pomegranates and dates on branches with dew drops, warm glow']),
  dict(slug='lofty-rooms', refs=[(39, 20)], caption='Lofty halls with lofty halls above them, rivers flowing beneath (Qur’an 39:20) 🏛️',
       scenes=['tiered lofty palaces of light built one above another over flowing rivers, dreamy sky',
               'grand arched halls opening onto gardens with a river flowing beneath, glowing marble']),
  dict(slug='no-fatigue', refs=[(15, 45), (15, 46), (15, 47), (15, 48)], caption='No weariness there, nor will they be expelled (Qur’an 15:48) 🌸',
       scenes=['serene gardens with springs among flowers, couches facing each other in a pavilion, eternal calm',
               'a spring of clear water bubbling up among white flowers and green moss, soft sunlight']),
  dict(slug='breadth-of-heavens', refs=[(3, 133)], caption='A Garden as wide as the heavens and the earth (Qur’an 3:133) 🌌',
       scenes=['an infinitely vast paradise landscape stretching to the horizon under a sky of stars and soft dawn colours',
               'cosmic view of luminous garden lands floating among clouds and stars, majestic scale']),
  dict(slug='what-souls-desire', refs=[(43, 71)], caption='Therein is all that souls desire and eyes find sweet (Qur’an 43:71) ✨',
       scenes=['trays of gold and goblets on a marble table in a garden pavilion, glowing light, no people',
               'a beautiful garden at sunrise with every kind of flower and fruit, radiant colours']),
]

def call(path, body, timeout=240):
    r = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), headers={'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'})
    return json.loads(urllib.request.urlopen(r, timeout=timeout).read())

def image(prompt, path):
    if path.exists() and path.stat().st_size > 50000: return
    for attempt in range(3):
        try:
            j = call('/images/generations', {'model': os.environ.get('JANNAH_IMAGE_MODEL', 'gpt-image-1-mini'), 'prompt': STYLE + prompt, 'size': '1024x1536', 'n': 1})
            d = j['data'][0]
            path.write_bytes(base64.b64decode(d['b64_json']) if d.get('b64_json') else urllib.request.urlopen(d['url'], timeout=120).read()); return
        except Exception as e:
            print('  image retry', attempt, str(e)[:120]); time.sleep(5)
    raise RuntimeError('image failed')

def run(args):
    r = subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', *args], capture_output=True, text=True)
    if r.returncode: raise RuntimeError(r.stderr[:1500])

def wrap(t, n): return '\n'.join(textwrap.wrap(t, n))
def esc(t): return t.replace('\\', '\\\\').replace(':', '\\:').replace("'", "\u2019").replace('%', '\\%')

def ayah_text(refs):
    ar = ' '.join(QAR[s - 1][a - 1].replace('\ufeff', '') + f' ﴿{a}﴾' for s, a in refs)
    en = ' '.join(QEN[s - 1][a - 1] for s, a in refs)
    ref = f'{refs[0][0]}:{refs[0][1]}' + (f'-{refs[-1][1]}' if len(refs) > 1 else '')
    return ar, en, ref

# Audio = the ayat only (no nasheeds/music): Pickthall's public-domain English, read slowly by an AI voice.
JANNAH_RECITER = os.environ.get('JANNAH_RECITER_URL', 'https://verses.quran.com/Alafasy/mp3/')
JANNAH_RECITER_NAME = os.environ.get('JANNAH_RECITER_NAME', 'Mishary Rashid Alafasy')
def recite(refs, path):
    # Arabic recitation of exactly these ayat (Quran Foundation verse audio, credited), joined with a short breath between ayat.
    if path.exists() and path.stat().st_size > 5000: return
    parts = []
    for s_, a_ in refs:
        p = TMP / f'ar-{s_:03d}{a_:03d}.mp3'
        if not (p.exists() and p.stat().st_size > 2000):
            for attempt in range(3):
                try: p.write_bytes(urllib.request.urlopen(urllib.request.Request(f'{JANNAH_RECITER}{s_:03d}{a_:03d}.mp3', headers={'User-Agent': 'Shukr/1.0'}), timeout=60).read()); break
                except Exception as e: print('  audio retry', attempt, str(e)[:100]); time.sleep(3)
            else: raise RuntimeError('recitation download failed')
        parts.append(p)
    lst = TMP / (path.stem + '.txt'); gap = TMP / 'gap.mp3'
    if not gap.exists(): run(['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '0.5', '-q:a', '4', str(gap)])
    seq = []; [seq.extend([p, gap]) for p in parts]
    inputs = []; [inputs.extend(['-i', str(p)]) for p in seq[:-1]]
    n = len(seq) - 1; fc = ''.join(f'[{k}:a]aresample=44100,aformat=channel_layouts=mono[a{k}];' for k in range(n)) + ''.join(f'[a{k}]' for k in range(n)) + f'concat=n={n}:v=0:a=1[o]'
    run([*inputs, '-filter_complex', fc, '-map', '[o]', '-b:a', '128k', str(path)])
def adur(p):
    return float(subprocess.run([FF.replace('ffmpeg', 'ffprobe') if os.path.exists(FF.replace('ffmpeg', 'ffprobe')) else 'ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(p)], capture_output=True, text=True).stdout.strip() or 0)
def build(v):
    slug = v['slug']; out = OUT / f'{slug}.mp4'
    if out.exists() and out.stat().st_size > 200000: print('skip', slug); return None
    print('build', slug)
    imgs = []
    for i, p in enumerate(v['scenes']):
        f = TMP / f'{slug}-{i}.png'; image(p, f); imgs.append(f)
    ar, en, ref = ayah_text(v['refs'])
    voice = TMP / f'{slug}-arabic.mp3'; recite(v['refs'], voice); vlen = adur(voice)
    # scene length so the video lasts the whole recitation (+1.2 s lead-in, +2 s tail)
    per = max(9.0, (vlen + 3.2 + (len(imgs) - 1)) / len(imgs)); total = per * len(imgs)
    # Ken-Burns per scene (alternating zoom in/out + drift), 30fps, crossfade between scenes
    clips = []
    for i, f in enumerate(imgs):
        c = TMP / f'{slug}-{i}.mp4'; frames = int(per * 30) + 30
        z = "min(1.0+0.0009*on,1.25)" if i % 2 == 0 else "max(1.25-0.0009*on,1.0)"
        run(['-loop', '1', '-i', str(f), '-vf', f"scale=1440:2160:force_original_aspect_ratio=increase,crop=1440:2160,zoompan=z='{z}':x='iw/2-(iw/zoom/2)+{(-1)**i}*on*0.25':y='ih/2-(ih/zoom/2)':d={frames}:s=720x1280:fps=30,"
             "eq=saturation=1.08:contrast=1.03,format=yuv420p", '-frames:v', str(frames), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', str(c)])
        clips.append(c)
    # crossfade chain
    inputs = []; [inputs.extend(['-i', str(c)]) for c in clips]
    fc = ''; last = '[0:v]'; off = per
    for i in range(1, len(clips)):
        fc += f"{last}[{i}:v]xfade=transition=fade:duration=1:offset={off - 1 + (i - 1) * 0}[x{i}];"; last = f'[x{i}]'; off += per - 1 + 1 - 1 + 0
        off = per * (i + 1) - i
    bg = TMP / f'{slug}-bg.mp4'
    if len(clips) > 1: run([*inputs, '-filter_complex', fc.rstrip(';'), '-map', last, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', str(bg)])
    else: bg = clips[0]
    # Captions: the verse is split into short phrases shown one after another — Arabic (gold) above, English (white) below,
    # inside the safe zone (y 170..1000), with a soft darkening gradient behind them.
    dur_bg = total - (len(clips) - 1)
    ar_words, en_words = ar.split(), en.split()
    # English: split at punctuation so each phrase is a complete clause; Arabic split proportionally by word count.
    import re as _re
    en_cl = [c.strip() for c in _re.split(r'(?<=[;:,.!?])\s+', en) if c.strip()]
    target = max(2, min(5, round(len(en_words) / 16))); per_part = len(en_words) / target
    en_parts, cur = [], ''
    for c in en_cl:
        if cur and len((cur + ' ' + c).split()) > per_part * 1.25: en_parts.append(cur); cur = c
        else: cur = (cur + ' ' + c).strip()
    if cur: en_parts.append(cur)
    n = len(en_parts)
    # Arabic: split at waqf (pause) marks, then group to the same number of parts as the English.
    ar_cl = [c.strip() for c in _re.split(r'(?<=[\u06D6\u06D7\u06D8\u06D9\u06DA\u06DB])\s+|(?<=\uFD3F)\s+', ar) if c.strip()]
    if False and len(ar_cl) >= n:
        tot = sum(len(c.split()) for c in ar_cl); ar_parts, cur, acc = [], '', 0
        for c in ar_cl:
            cur = (cur + ' ' + c).strip(); acc += len(c.split())
            if len(ar_parts) < n - 1 and acc >= tot * (len(ar_parts) + 1) / n: ar_parts.append(cur); cur = ''
        if cur: ar_parts.append(cur)
        while len(ar_parts) < n: ar_parts.append('')
    else:
        cum = [0]; [cum.append(cum[-1] + len(p.split())) for p in en_parts]
        ar_parts = [' '.join(ar_words[round(cum[k] / cum[-1] * len(ar_words)):round(cum[k + 1] / cum[-1] * len(ar_words))]) for k in range(n)]
    if n == 1 or not all(ar_parts): ar_parts, en_parts, n = [ar], [en], 1
    t0, t_end = 1.0, dur_bg - 1.2; seg = (t_end - t0) / n
    ttl_f = TMP / f'{slug}-ttl.txt'; ttl_f.write_text('Jannah, as the Qur\u2019an describes it')
    draws = [f"drawtext=fontfile='{FONT}':textfile='{ttl_f}':fontsize=34:fontcolor=white:x=(w-tw)/2:y=130:shadowcolor=black@0.85:shadowx=2:shadowy=2:alpha='min(1,t/1.0)'"]
    for k in range(n):
        a, b = t0 + k * seg, t0 + (k + 1) * seg
        fa = TMP / f'{slug}-a{k}.txt'; fa.write_text(wrap(ar_parts[k], 26))
        fe = TMP / f'{slug}-e{k}.txt'; fe.write_text(wrap(en_parts[k], 30))
        al = f"if(lt(t,{a:.2f}),0,if(lt(t,{a + 0.5:.2f}),(t-{a:.2f})/0.5,if(lt(t,{b - 0.4:.2f}),1,if(lt(t,{b:.2f}),({b:.2f}-t)/0.4,0))))"
        draws.append(f"drawtext=fontfile='{AR}':textfile='{fa}':fontsize=48:line_spacing=18:fontcolor=0xFFE08A:x=(w-tw)/2:y=640-text_h:borderw=2:bordercolor=black@0.55:shadowcolor=black@0.9:shadowx=2:shadowy=2:alpha='{al}'")
        draws.append(f"drawtext=fontfile='{FONT}':textfile='{fe}':fontsize=34:line_spacing=12:fontcolor=white:x=(w-tw)/2:y=680:borderw=1:bordercolor=black@0.5:shadowcolor=black@0.9:shadowx=2:shadowy=2:alpha='{al}'")
    ref_f = TMP / f'{slug}-ref.txt'; ref_f.write_text(f'Qur\u2019an {ref}')
    hdl_f = TMP / f'{slug}-hdl.txt'; hdl_f.write_text('@thejannahlife')
    draws.append(f"drawtext=fontfile='{FONT}':textfile='{ref_f}':fontsize=30:fontcolor=0xFFE9A8:x=(w-tw)/2:y=905:shadowcolor=black@0.8:shadowx=2:shadowy=2:alpha='min(1,max(0,(t-1)/0.8))'")
    draws.append(f"drawtext=fontfile='{FONT}':textfile='{hdl_f}':fontsize=24:fontcolor=white@0.85:x=40:y=950:shadowcolor=black@0.7:shadowx=1:shadowy=1")
    grad = "geq=lum='lum(X,Y)*(1-0.35*clip((Y-H*0.2)/(H*0.25),0,1))':cb='cb(X,Y)':cr='cr(X,Y)'"
    # dark rounded-feel caption panel behind the verse so gold Arabic + white English stay readable on bright scenes
    panel = "drawbox=x=30:y=250:w=iw-60:h=700:color=black@0.45:t=fill"
    vf = f"[0:v]format=yuv420p,{grad},{panel}," + ','.join(draws) + f",fade=t=in:st=0:d=0.8,fade=t=out:st={dur_bg - 1:.2f}:d=1[v]"
    fcs = TMP / f'{slug}-fc.txt'; fcs.write_text(vf + f";[1:a]adelay=1200|1200,apad,atrim=0:{dur_bg:.2f},volume=1.1[a]")
    run(['-i', str(bg), '-i', str(voice), '-filter_complex', fcs.read_text(),
         '-map', '[v]', '-map', '[a]', '-t', f'{dur_bg:.2f}', '-c:v', 'libx264', '-preset', 'medium', '-crf', '27', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', str(out)])
    run(['-ss', '2.5', '-i', str(out), '-frames:v', '1', '-q:v', '4', str(OUT / f'{slug}.jpg')])
    return dict(slug=slug, caption=v['caption'], refs=[f'{s}:{a}' for s, a in v['refs']], duration=round(dur_bg, 1), sound=None, soundTitle=f'Recitation: {JANNAH_RECITER_NAME}', soundArtist='via Quran Foundation (quran.com)', soundLicense='PD')

if __name__ == '__main__':
    only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None
    limit = int(sys.argv[sys.argv.index('--limit') + 1]) if '--limit' in sys.argv else 999
    man_p = OUT / 'jannah.json'; man = json.load(open(man_p)) if man_p.exists() else []
    done = {m['slug'] for m in man}; n = 0
    for v in VIDEOS:
        if only and v['slug'] != only: continue
        if n >= limit: break
        try:
            r = build(v)
            if r:
                man = [m for m in man if m['slug'] != r['slug']] + [r]; json.dump(man, open(man_p, 'w'), ensure_ascii=False, indent=1); n += 1
                print('  ok', r['slug'], r['duration'], 's')
        except Exception as e: print('  FAIL', v['slug'], str(e)[:400])
    print('DONE', len(man))
