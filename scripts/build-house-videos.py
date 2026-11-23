#!/usr/bin/env python3
"""Render Shukr house videos (720x1280, ~16-22s): animated nature/abstract backgrounds, loud clear TTS voiceover
or a voice-only nasheed bed, burned-in captions. No musical instruments anywhere.
Usage: python3 scripts/build-house-videos.py  (needs ROAR_API_KEY/ROAR_BASE_URL; ffmpeg-static)"""
import os, json, subprocess, urllib.request, pathlib, textwrap
ROOT = pathlib.Path(__file__).resolve().parent.parent
FF = os.environ.get('FFMPEG') or str(ROOT / 'node_modules/ffmpeg-static/ffmpeg')
OUT = ROOT / 'public/media/house'; OUT.mkdir(parents=True, exist_ok=True)
TMP = pathlib.Path(os.environ.get('TMPDIR', '/tmp')) / 'house'; TMP.mkdir(parents=True, exist_ok=True)
KEY, BASE = os.environ['ROAR_API_KEY'], os.environ['ROAR_BASE_URL']
FONT = '/opt/data/tools/fonts/BricolageGrotesque%5Bopsz,wdth,wght%5D.ttf'
AR = '/opt/data/tools/fonts/Amiri-Bold.ttf'

def tts(text, voice, path, speed=1.0):
    req = urllib.request.Request(BASE + '/audio/speech', data=json.dumps({'model': 'tts-1', 'voice': voice, 'input': text, 'speed': speed}).encode(),
                                 headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY})
    path.write_bytes(urllib.request.urlopen(req, timeout=90).read())

def run(args): (lambda r: r.returncode and (_ for _ in ()).throw(RuntimeError(r.stderr[-600:])))(subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', *args], capture_output=True, text=True))
def dur(p):
    r = subprocess.run([FF, '-i', str(p), '-f', 'null', '-'], capture_output=True, text=True).stderr
    import re; m = re.search(r'Duration: (\d+):(\d+):([\d.]+)', r); return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])

# Animated backgrounds built only from ffmpeg sources (fast): gradients + gentle motion + particles.
BG = {
  'dawn': "gradients=s=720x1280:r=30:speed=0.015:c0=0xFF7A3D:c1=0xFFC86B:c2=0x7A3CF6:c3=0xFF3D6E:nb_colors=4",
  'ocean': "gradients=s=720x1280:r=30:speed=0.02:c0=0x02294A:c1=0x0E7C9B:c2=0x1BB3B0:c3=0x053B5E:nb_colors=4",
  'forest': "gradients=s=720x1280:r=30:speed=0.012:c0=0x0B3D1E:c1=0x2E7D32:c2=0x9CCC65:c3=0x123F2A:nb_colors=4",
  'desert': "gradients=s=720x1280:r=30:speed=0.012:c0=0xC2662D:c1=0xF2B66D:c2=0x8E3B1F:c3=0xF5D7A1:nb_colors=4",
  'night': "gradients=s=720x1280:r=30:speed=0.01:c0=0x03041A:c1=0x1B1F4A:c2=0x3A1C5C:c3=0x0A0F2E:nb_colors=4",
  'rain': "gradients=s=720x1280:r=30:speed=0.012:c0=0x1F2B38:c1=0x45607A:c2=0x22313F:c3=0x5C7A93:nb_colors=4",
  'rose': "gradients=s=720x1280:r=30:speed=0.015:c0=0xE3164E:c1=0x8E2DE2:c2=0x4A00E0:c3=0xFF6B8B:nb_colors=4",
  'aurora': "gradients=s=720x1280:r=30:speed=0.018:c0=0x0B1E3F:c1=0x20D5B5:c2=0x6B3CF6:c3=0x0B3D2E:nb_colors=4",
}
# Nature texture layer: drifting light particles / stars / rain streaks (noise-based, cheap)
TEX = {
  'stars': "[t]noise=alls=12:allf=t,eq=brightness=-0.35:contrast=3,format=gray,colorkey=black:0.3:0.1[tx]",
  'soft': "[t]boxblur=20,eq=brightness=0.04[tx]",
}

def esc(t): return t.replace('\\', '\\\\').replace(':', '\\:').replace("'", "\u2019").replace('%', '\\%')
def wrap_lines(text, width): return textwrap.wrap(text, width)

def render(slug, bg, voice_text, voice, captions, arabic=None, bed=None, speed=0.95, tex=None):
    vo = TMP / f'{slug}_vo.mp3'
    tts(voice_text, voice, vo, speed)
    d = dur(vo) + 2.2
    if bed: d = max(d, min(22.0, dur(bed) * 2), 14.0)  # nature videos: nasheed carries the clip
    # caption timing: split equally across voice duration
    seg = (d - 1.5) / max(1, len(captions))
    draws = []
    if arabic:
        draws.append(f"drawtext=fontfile={AR}:text='{esc(arabic)}':fontsize=112:fontcolor=white:x=(w-tw)/2:y=h*0.30:alpha='clip(t/0.8\\,0\\,1)':shadowcolor=black@0.35:shadowx=0:shadowy=4")
    for i, c in enumerate(captions):
        t0, t1 = 0.5 + i * seg, 0.5 + (i + 1) * seg
        lines = wrap_lines(c, 18)
        for k, ln in enumerate(lines):
            y = f"h*0.50+{k*70}-{(len(lines)-1)*35}"
            draws.append(f"drawtext=fontfile='{FONT}':text='{esc(ln)}':fontsize=54:fontcolor=white:box=1:boxcolor=black@0.28:boxborderw=14:x=(w-tw)/2:y={y}:enable='between(t\\,{t0:.2f}\\,{t1:.2f})':alpha='clip((t-{t0:.2f})/0.25\\,0\\,1)'")
    vf = ','.join(['zoompan=z=\'min(1.0+on/2400\\,1.08)\':d=1:s=720x1280:fps=30', 'vignette=PI/4', 'drawbox=x=0:y=ih*0.22:w=iw:h=ih*0.42:color=black@0.18:t=fill', *draws, 'format=yuv420p'])
    # Audio: loud, clear voice (compressed & normalised). Optional voice-only nasheed bed underneath (ducked).
    if bed:
        af = (f"[1:a]aresample=44100,highpass=f=70,acompressor=threshold=-20dB:ratio=3,adelay=1200|1200,apad,atrim=0:{d:.2f},asplit=2[v1][v2];"
              f"[2:a]aresample=44100,aloop=loop=-1:size=2000000000,atrim=0:{d:.2f},volume=0.55,afade=t=in:d=1.5,afade=t=out:st={d-2:.2f}:d=2[b];"
              f"[b][v1]sidechaincompress=threshold=0.04:ratio=5:attack=20:release=400[bd];[bd][v2]amix=inputs=2:normalize=0,loudnorm=I=-12:TP=-1:LRA=9,alimiter=limit=0.95[a]")
        inputs = ['-f', 'lavfi', '-i', BG[bg] + f':d={d:.2f}', '-i', str(vo), '-i', str(bed)]
    else:
        af = "[1:a]aresample=44100,highpass=f=70,acompressor=threshold=-20dB:ratio=3,apad=pad_dur=2,loudnorm=I=-12:TP=-1:LRA=8,alimiter=limit=0.95[a]"
        inputs = ['-f', 'lavfi', '-i', BG[bg] + f':d={d:.2f}', '-i', str(vo)]
    out = OUT / f'{slug}.mp4'
    run([*inputs, '-filter_complex', f"[0:v]{vf}[vv];{af}", '-map', '[vv]', '-map', '[a]', '-t', f'{d:.2f}', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24',
         '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', str(out)])
    run(['-ss', '2.5', '-i', str(out), '-frames:v', '1', '-q:v', '4', str(OUT / f'{slug}.jpg')])
    return round(d, 1)

def nasheed_bed(slug, text):
    """Voice-only nasheed bed: lead + harmonies + hum, heavy room reverb (no instruments)."""
    raw = TMP / f'{slug}_n.mp3'; tts(text, 'onyx', raw, 0.8)
    bed = TMP / f'{slug}_bed.mp3'
    run(['-i', str(raw), '-filter_complex',
         "[0:a]aformat=sample_rates=44100:channel_layouts=mono,asplit=4[a][b][c][d];[b]asetrate=44100*0.7492,aresample=44100,atempo=1.3348,volume=0.5[lo];"
         "[c]asetrate=44100*1.3348,aresample=44100,atempo=0.7492,volume=0.35[hi];[d]lowpass=f=400,asetrate=22050,aresample=44100,atempo=2,volume=0.4[hum];"
         "[a][lo][hi][hum]amix=inputs=4:normalize=0,aecho=0.85:0.9:180|360|540:0.45|0.3|0.2,lowpass=f=5000,loudnorm=I=-18[o]", '-map', '[o]', '-ac', '2', str(bed)])
    return bed

VIDEOS = [
  # slug, account, bg, arabic, voice, voiceover text, captions, caption-for-post, topic, nasheed-bed-text
  ('shukrdaily-morning', 'shukrdaily', 'dawn', 'الحمد لله', 'nova', "Before you check your phone this morning, say Alhamdulillah. You woke up. Your heart is beating. That alone is a gift most people forget to thank Allah for.",
   ['Before you check your phone…', 'say Alhamdulillah.', 'You woke up.', 'That alone is a gift.'], 'Start your day with shukr 🌅 Comment “Alhamdulillah” if you’re grateful today', 'wellbeing', None),
  ('shukrreminders-sabr', 'shukrreminders', 'rose', 'إن مع العسر يسرا', 'onyx', "Allah says: indeed, with hardship comes ease. Not after it. With it. Whatever you are carrying today, the ease is already on its way.",
   ['Indeed, with hardship', 'comes ease. (94:6)', 'Not after it. With it.', 'Ease is on its way.'], 'For whoever needs this today 🤍 Qur’an 94:6', 'quran', None),
  ('shukrreminders-dua', 'shukrreminders', 'rain', 'ادعوني أستجب لكم', 'echo', "Your Lord said: call upon Me, I will respond to you. So stop holding back. Ask Him for the big things. Ask Him for the small things. He loves to be asked.",
   ['“Call upon Me,', 'I will respond to you.”', '(40:60)', 'He loves to be asked.'], 'Make du‘a right now. He’s listening 🤲 Qur’an 40:60', 'quran', None),
  ('shukrfacts-water', 'shukrfacts', 'ocean', 'وجعلنا من الماء كل شيء حي', 'fable', "Every living thing is made from water. Your body is about sixty percent water. The Qur'an said it fourteen hundred years ago: We made every living thing from water.",
   ['Your body is about', '60 percent water.', '“We made every living', 'thing from water.” (21:30)'], 'SubhanAllah 💧 Qur’an 21:30', 'world', None),
  ('shukrfacts-honey', 'shukrfacts', 'desert', 'فيه شفاء للناس', 'fable', "A single bee makes about a twelfth of a teaspoon of honey in its whole life. And Allah says about honey: in it is healing for people.",
   ['One bee makes', '1/12 teaspoon of honey', 'in its whole life.', '“In it is healing.” (16:69)'], 'The miracle in your spoon 🍯 Qur’an 16:69', 'world', None),
  ('shukrnature-forest', 'shukrnature', 'forest', 'سبحان الله', 'nova', "Look at the trees. They praise Him without words.",
   ['Every leaf glorifies Him.', 'SubhanAllah.'], 'Nature with a nasheed 🌿 “Everything in the heavens and earth glorifies Allah” (57:1)', 'world', 'SubhanAllah, SubhanAllah. Wal hamdulillah. La ilaha illallah. Allahu Akbar.'),
  ('shukrnature-night', 'shukrnature', 'night', 'الله أكبر', 'onyx', "Step outside tonight. Look up. Every star is a sign for those who reflect.",
   ['Step outside tonight.', 'Look up.', 'Allahu Akbar.'], 'Night sky nasheed ✨ Qur’an 3:190', 'world', 'Allahu Akbar, Allahu Akbar. SubhanAllah, wal hamdulillah.'),
  ('shukrnature-aurora', 'shukrnature', 'aurora', 'ما شاء الله', 'nova', "Colours across the sky. Painted by the One who created everything.",
   ['Painted by', 'the One who', 'created everything.'], 'MashaAllah 🌌 nasheed: SubhanAllah', 'world', 'MashaAllah, tabarakAllah. SubhanAllah, SubhanAllah.'),
]
if __name__ == '__main__':
    meta = []
    for slug, acct, bg, ar, voice, text, caps, post, topic, bed_text in VIDEOS:
        if (OUT / f'{slug}.mp4').exists() and os.environ.get('FORCE') != '1' and slug not in os.environ.get('REDO', ''):
            meta.append({'slug': slug, 'account': acct, 'caption': post, 'topic': topic, 'duration': round(dur(OUT / f'{slug}.mp4'), 1)}); continue
        bed = nasheed_bed(slug, bed_text) if bed_text else None
        d = render(slug, bg, text, voice, caps, ar, bed, speed=0.95)
        meta.append({'slug': slug, 'account': acct, 'caption': post, 'topic': topic, 'duration': d})
        print('rendered', slug, d)
    (OUT / 'videos.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1))
