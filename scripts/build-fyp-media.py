#!/usr/bin/env python3
"""Reproducible original editorial art. Pillow + ffmpeg; no network or paid AI.
All lesson text/sources remain unchanged. Reel summaries are captioned, silent,
24-second explanations; the full sourced lesson remains in the feed JSON.
"""
import collections
import json
import math
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/media/fyp'
DATA = ROOT / 'public/data/fyp-lessons.json'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
INK = '#ecf2eb'
MUTED = '#a8beb7'
BG = '#102923'
COLORS = {'quran':'#e9bd71','sunnah':'#9eddb4','character':'#eda68b','wellbeing':'#b4b2ef','learning':'#a4cce9','world':'#e4ce87'}
LABELS = {'quran':'QURAN REFLECTION','sunnah':'SUNNAH IN PRACTICE','character':'EVERYDAY CHARACTER','wellbeing':'EMOTIONAL WELLBEING','learning':'LEARN HOW TO LEARN','world':'OUR REMARKABLE WORLD'}

def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else FONT, size)

def text(d, s, xy, size=25, color=INK, bold=False, width=610, spacing=7):
    f = font(size, bold)
    lines = []
    for paragraph in s.split('\n'):
        line = ''
        for word in paragraph.split():
            trial = (line + ' ' + word).strip()
            if d.textlength(trial, font=f) > width and line:
                lines.append(line)
                line = word
            else:
                line = trial
        lines.append(line)
    x, y = xy
    for line in lines:
        d.text((x,y), line, font=f, fill=color)
        y += size + spacing
    return y

def diagram(d, lesson, n, progress=1):
    """Each of the 30 lessons has a concept-specific original drawing."""
    topic = lesson['topic']; c = COLORS[topic]
    def line(points, color=c, width=5): d.line(points, fill=color, width=width)
    def circle(x,y,r,fill=None,outline=c,w=4): d.ellipse((x-r,y-r,x+r,y+r),fill=fill,outline=outline,width=w)
    def box(x,y,w,h,label,fill='#1b3c32',size=23):
        d.rounded_rectangle((x,y,x+w,y+h),radius=18,fill=fill,outline=c,width=2)
        text(d,label,(x+18,y+18),size,width=w-32)
    def label(s,x,y,size=23): text(d,s,(x,y),size,c,bold=True,width=610-x+50)
    def arrow(a,b):
        line([a,b]); ang=math.atan2(b[1]-a[1],b[0]-a[0])
        for delta in [-.55,.55]: line([b,(b[0]-17*math.cos(ang+delta),b[1]-17*math.sin(ang+delta))])
    # All art occupies y=300..660; animated movement is semantic, not footage.
    if topic == 'quran':
        if n == 0:
            for j,(s,xx,yy) in enumerate([('NOTICE',70,325),('GIVE THANKS',275,430),('USE WELL',450,535)]):
                circle(xx+70,yy+35,57,fill='#294638'); label(s,xx-10,yy+104,20)
                if j<2: arrow((xx+120,yy+70),(xx+195,yy+105))
            circle(140,360,16+8*math.sin(progress*math.pi),fill=c)
        elif n == 1:
            for j,s in enumerate(['WATER','SOIL','TRANSPORT','PREPARATION']):
                x=64+(j%2)*310;y=315+(j//2)*145
                box(x,y,280,100,s); circle(x+232,y+50,13,fill=c)
            line([(204,415),(204,440),(514,440),(514,460)])
            label('One meal. Many layers of support.',70,625,23)
        elif n == 2:
            for x,r,s in [(180,70,'NOTICE'),(360,85,'REMEMBER'),(540,70,'THANK')]:
                circle(x,450,r); label(s,x-68,565,19)
            arrow((250,450),(275,450));arrow((445,450),(470,450))
        elif n == 3:
            box(92,330,536,148,'A blessing I can acknowledge',size=29)
            d.polygon([(180,478),(205,515),(235,478)],fill=c)
            label('GRATITUDE',90,565);label('WITHOUT COMPARISON',310,605,21)
        else:
            for x,y in [(165,390),(360,520),(550,390)]:
                circle(x,y,48);circle(x,y-10,12);d.arc((x-25,y,x+25,y+30),180,360,fill=c,width=4)
            line([(210,420),(310,490)]);line([(410,490),(505,420)])
            label('ASK',125,590);label('LISTEN',310,610);label('KNOW',510,590)
    elif topic == 'sunnah':
        if n == 0:
            circle(360,460,142);circle(360,460,109,outline=MUTED,w=2)
            angle=-math.pi/2 + .25*math.sin(progress*2*math.pi)
            tip=(360+115*math.cos(angle),460+115*math.sin(angle))
            d.polygon([tip,(335,490),(360,475),(385,490)],fill=c)
            label('PURPOSE',300,305);label('Check your own direction.',160,630)
        elif n == 1:
            box(100,320,520,150,'Before you press send...',size=31)
            for j,s in enumerate(['TRUTHFUL?','USEFUL?','CONSIDERATE?']):
                circle(115+j*205,560,14,fill=c);label(s,70+j*205,600,17)
        elif n == 2:
            for x in [100,400]:
                d.polygon([(x,405),(x+100,315),(x+200,405)],outline=c,width=5)
                d.rectangle((x+15,405,x+185,580),outline=c,width=4)
                d.rectangle((x+75,485,x+125,580),outline=c,width=3)
            arrow((300,520),(395,520));label('KEEP SHARED SPACE CLEAR',100,625)
        elif n == 3:
            line([(110,565),(580,565)],width=7)
            for i in range(3):box(125+i*125,430-i*30,105,125+i*30,'TASK',size=18)
            arrow((555,460),(610,360));label('ASK WHAT WOULD HELP',120,620)
        else:
            box(90,325,540,105,'A fair correction',size=30)
            arrow((360,445),(360,495));box(165,515,390,105,'One useful adjustment',size=26)
    elif topic == 'character':
        if n == 0:
            box(85,315,550,120,'No reply yet.',size=34)
            for j,x in enumerate([315,350,385]):
                circle(x,465,7+5*(.5+.5*math.sin(progress*math.pi*8-j)),fill=c)
            box(85,510,550,100,'The reason is still unknown.',size=27)
            label('OBSERVATION',110,280,18);label('PAUSE BEFORE THE STORY',135,635,21)
        elif n == 1:
            for x in [180,360,540]:
                circle(x,420,45);d.arc((x-23,415,x+23,445),0,180,fill=c,width=4)
            box(135,525,450,100,'Humour without a target',size=27)
            line([(225,420),(315,420)]);line([(405,420),(495,420)])
        elif n == 2:
            for j,s in enumerate(['SPECIFIC CONCERN','CLEAR REQUEST','NO PERSONAL ATTACK']):
                box(100,310+j*110,520,85,s,size=24)
        elif n == 3:
            line([(360,335),(360,590)],width=8);line([(180,400),(540,400)])
            for x in [180,540]:
                line([(x,400),(x-65,520),(x+65,520),(x,400)])
                d.arc((x-65,485,x+65,555),0,180,fill=c,width=5)
            label('SAME STANDARD',230,625)
        else:
            for x in [190,510]:
                circle(x,385,40);line([(x,430),(x,545)],width=9);line([(x-55,475),(x+55,475)])
            line([(100,565),(620,565)],width=5);label('EQUAL BASIC RESPECT',170,615)
    elif topic == 'wellbeing':
        if n == 0:
            r=108+12*math.sin(progress*math.pi*2)
            circle(275,465,135,fill='#243c3e',outline='#b4b2ef');circle(450,465,r,fill='#40534b',outline='#e4ce87')
            label('HARD',190,450);label('GOOD',420,450)
            label('Both can be true today.',180,635)
        elif n == 1:
            for r in [140,100,60]:circle(360,455,r,outline=c,w=3)
            box(180,600,360,64,'ONE NEXT STEP',size=22)
        elif n == 2:
            circle(205,435,88,fill=c);circle(245,407,80,fill=BG,outline=BG)
            for j in range(4):box(350+j*65,490-j*40,48,135,'',fill='#40534b')
            label('MAKE REST REGULAR',150,625)
        elif n == 3:
            for r in [135,95,52]:circle(360,460,r)
            arrow((560,350),(420,420));label('WANDER. NOTICE. RETURN.',115,635,24)
        else:
            box(75,340,335,95,'Have time to talk?',size=25)
            box(290,510,350,95,'A small invitation',size=25)
            line([(240,435),(240,470),(465,470),(465,510)])
    elif topic == 'learning':
        if n == 0:
            for j,s in enumerate(['CLOSE NOTES','RECALL','CHECK + REPAIR']):
                box(100,310+j*112,520,82,s,size=28)
                if j<2:arrow((360,397+j*112),(360,418+j*112))
            circle(570,350+224*progress,12,fill=c)
        elif n == 1:
            box(80,315,560,270,'RETURN ACROSS DAYS',size=26)
            for j in range(7):
                x=110+j*73
                d.rectangle((x,425,x+50,490),outline=MUTED,width=2)
                if j in [0,2,5]:circle(x+25,457,14,fill=c)
            label('Short encounters. Time between.',110,625,23)
        elif n == 2:
            box(85,320,245,155,'SOURCE',size=28);box(390,450,245,155,'YOUR WORDS',size=26)
            arrow((330,395),(390,490));label('Explain. Example. Check.',110,635)
        elif n == 3:
            for j,s in enumerate(['1. DEFINE THE TASK','2. WORK WITH FOCUS','3. CHECK THE RESULT']):box(100,310+j*110,520,85,s,size=25)
        else:
            for j,h in enumerate([140,70,185,110]):
                x=135+j*120;d.rounded_rectangle((x,560-h,x+65,560),radius=8,fill=c if j!=1 else '#e9bd71')
            arrow((280,320),(280,465));label('USE A SELF-CHECK TO PRIORITISE',75,620,22)
    else:
        if n in [0,1]:
            circle(115,455,48,fill='#e4ce87');
            for yy in [385,455,525]:arrow((180,yy),(265,yy))
            circle(450,455,143,fill='#25465a',outline='#91c8d8')
            d.pieslice((307,312,593,598),90,270,fill='#70a9aa')
            for yy in [390,455,520]:line([(328,yy),(570,yy)],color='#94b5b3',width=2)
            d.ellipse((395,315,505,595),outline='#94b5b3',width=2)
            # Equatorial location moves around the globe while illumination stays fixed.
            angle=progress*2*math.pi
            if n==0:circle(450+132*math.cos(angle),455+30*math.sin(angle),11,fill='#ffe6a9')
            else:
                circle(345,455,10,fill='#ffe6a9');circle(555,455,10,fill='#ffe6a9')
            label('DAY',320,620);label('NIGHT',500,620)
            d.arc((300,290,600,625),280,345,fill=c,width=5)
        elif n == 2:
            circle(195,450,85,fill='#407b85');d.arc((80,330,310,575),220,340,fill=c,width=5)
            circle(500,450,42,fill=c);d.ellipse((370,330,630,575),outline=MUTED,width=3);circle(595,530,17,fill='#407b85')
            label('ROTATION',110,620);label('ORBIT',460,620)
        elif n == 3:
            for j in range(5):
                x=100+j*130;circle(x,455,46,fill='#a9bfc2')
                if j<4:d.ellipse((x-46,409,x+46-j*22,501),fill=BG)
                circle(x,455,46,outline=MUTED,w=2)
            label('SAME MOON. CHANGING VIEW.',115,620,24)
        else:
            for j in range(100):
                x=112+(j%20)*25;y=330+(j//20)*45
                circle(x,y,8,fill='#85c6de' if j<97 else '#e4ce87',outline=BG,w=0)
            label('ABOUT 97% IN THE OCEAN',115,595,26)
            label('Not all water is usable freshwater.',100,640,22)


def render(lesson,n,caption,stage=0,video=False,progress=1):
    # Every format is a true 9:16 canvas (720x1280) so it fills a phone screen edge to edge.
    # Layout keeps text inside the platform safe zone: top 150px (tabs), right 120px (action rail),
    # bottom 300px (caption + nav). Artwork is drawn at y=300..660 by diagram(), shifted down by OY.
    h=1280; OY=150
    im=Image.new('RGB',(720,h),BG);d=ImageDraw.Draw(im);c=COLORS[lesson['topic']]
    # soft colour wash so the frame isn't flat
    for i in range(0,h,8):
        t=i/h; d.rectangle((0,i,720,i+8),fill=(int(16+10*t),int(41-8*t),int(35+14*t)))
    # draw diagram on an offscreen strip (its own coordinates are y=300..680)
    strip=Image.new('RGB',(720,720),BG);sd=ImageDraw.Draw(strip)
    for x in range(40,720,80): sd.line((x,290,x,670),fill='#16332c',width=1)
    diagram(sd,lesson,n,progress)
    strip=strip.crop((0,285,720,685)).resize((600,333),Image.Resampling.LANCZOS)
    text(d,'SHUKR / '+LABELS[lesson['topic']],(44,OY),18,c,True,width=540)
    y=text(d,lesson['title'],(44,OY+42),42,INK,True,width=560,spacing=8)
    text(d,('ORIGINAL ANIMATION' if video else ['01 / NOTICE','02 / UNDERSTAND','03 / TRY IT'][stage]),(44,y+10),17,MUTED,width=540)
    top=max(y+50,OY+200)
    mask=Image.new('L',strip.size,0);ImageDraw.Draw(mask).rounded_rectangle((0,0)+strip.size,radius=24,fill=255)
    im.paste(strip,(30,top),mask)
    cy=top+360
    footer=h-330
    for size in ([32,29,26,24] if video else [30,27,25,23]):
        probe=Image.new('RGB',(720,h));pd=ImageDraw.Draw(probe)
        if text(pd,caption,(44,cy),size,INK,True,width=540,spacing=9)<=footer-14: break
    bottom=text(d,caption,(44,cy),size,INK,True,width=540,spacing=9)
    if bottom>footer-10: raise ValueError(f'Caption overflow: {lesson["id"]}, {bottom}, {footer}')
    source=lesson['sources'][0]['title'].split(' — ')[0]
    text(d,'SOURCE / '+source,(44,footer),19,'#c3d3cd',width=540)
    note='Explanatory reflection • not a quotation' if lesson['topic'] in ['quran','sunnah','character'] else ('General wellbeing • not treatment' if lesson['topic']=='wellbeing' else 'Original educational diagram • not to scale' if lesson['topic']=='world' else 'Study practice • check against your source')
    text(d,note,(44,footer+30),17,MUTED,width=540)
    return im


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    lessons=json.loads(DATA.read_text()); seen=collections.Counter(); reels=[]
    # Publish all static artwork and the exact shared JSON contract before video work.
    for lesson in lessons:
        n=seen[lesson['topic']];seen[lesson['topic']]+=1
        fmt='reel' if n==0 else 'carousel' if n in [1,2] else 'image'
        lesson['format']=fmt
        stem=lesson['id'];url='/media/fyp/'+stem
        alt=f"Original illustrated explanation: {lesson['title']}. {lesson['takeaway']}"
        if fmt=='reel':
            poster=OUT/(stem+'.webp')
            render(lesson,n,lesson['hook'],video=True,progress=.15).resize((720,1280),Image.Resampling.LANCZOS).save(poster,quality=82)
            lesson['media']={'src':url+'.mp4','poster':url+'.webp','alt':alt,'durationSeconds':24}
            reels.append((lesson,n))
        elif fmt=='carousel':
            captions=[lesson['hook'],lesson['body'].split('. ')[0]+'.',lesson['takeaway']]
            slides=[]
            for stage,caption in enumerate(captions):
                suffix=f'-{stage+1}.webp'
                render(lesson,n,caption,stage).save(OUT/(stem+suffix),quality=82)
                slides.append({'src':url+suffix,'alt':f'Slide {stage+1} of 3: {caption} Original concept diagram for {lesson["title"]}.'})
            lesson['media']={'src':slides[0]['src'],'alt':alt,'slides':slides}
        else:
            render(lesson,n,lesson['takeaway']).save(OUT/(stem+'.webp'),quality=82)
            lesson['media']={'src':url+'.webp','alt':alt}
    DATA.write_text(json.dumps(lessons,ensure_ascii=False,indent=2)+'\n')
    print('Static artwork and 30 media contracts written.',flush=True)
    for lesson,n in reels:
        target=OUT/(lesson['id']+'.mp4')
        # Original ambient bed: a slow, soft major-chord pad synthesised here (no samples, no vocals, no licensing).
        chords={'quran':[220,277.18,329.63],'sunnah':[196,246.94,293.66],'character':[174.61,220,261.63],'wellbeing':[164.81,207.65,246.94],'learning':[233.08,293.66,349.23],'world':[146.83,185,220]}
        f=chords[lesson['topic']]
        pad='+'.join(f"0.18*sin(2*PI*{x}*t)*(0.6+0.4*sin(2*PI*0.{3+i}*t))+0.06*sin(2*PI*{x*2}*t)" for i,x in enumerate(f))
        audio=f"aevalsrc='({pad})*0.55':s=44100:d=24,afade=t=in:d=2,afade=t=out:st=21.5:d=2.5,lowpass=f=2400,aecho=0.6:0.5:180:0.25"
        cmd=['/usr/local/bin/ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s','720x1280','-r','12','-i','-','-f','lavfi','-i',audio,'-map','0:v','-map','1:a','-c:v','libx264','-preset','fast','-crf','27','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-shortest','-movflags','+faststart',str(target)]
        proc=subprocess.Popen(cmd,stdin=subprocess.PIPE)
        captions=[lesson['hook'],lesson['body'].split('. ')[0]+'.',lesson['takeaway']]
        try:
            for frame in range(288):
                stage=min(2,frame//96)
                im=render(lesson,n,captions[stage],stage,True,frame/287)
                proc.stdin.write(im.tobytes())
        finally:
            proc.stdin.close()
        if proc.wait()!=0: raise RuntimeError(f'ffmpeg failed: {target}')
        print(f'Rendered {target}',flush=True)
    files=list(OUT.glob('*'))
    print(json.dumps({'formats':dict(collections.Counter(x['format'] for x in lessons)),'files':len(files),'bytes':sum(p.stat().st_size for p in files)},indent=2))

if __name__=='__main__':main()
