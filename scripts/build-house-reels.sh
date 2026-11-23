#!/usr/bin/env bash
# Renders 6 original 9:16 reels (720x1280, ~12s) with ambient audio (no music instruments: soft noise/drone + nature-like texture).
set -e
F=/usr/local/bin/ffmpeg; OUT=/opt/data/projects/shukr/public/media/house; mkdir -p "$OUT"
FONT=/opt/data/tools/fonts/Amiri-Bold.ttf; EN="/opt/data/tools/fonts/BricolageGrotesque%5Bopsz,wdth,wght%5D.ttf"
r() { # name, colour expr (geq), arabic, english, sub, audio
  $F -loglevel error -y -f lavfi -i "gradients=s=720x1280:r=30:d=12:speed=0.012:$2,format=yuv420p" \
   -f lavfi -i "$6" -filter_complex "[0:v]drawtext=fontfile=$FONT:text='$3':fontsize=86:fontcolor=white:x=(w-tw)/2:y=h*0.36:alpha='clip(t/1.2\,0\,1)':shadowcolor=black@0.4:shadowx=2:shadowy=3,drawtext=fontfile='$EN':text='$4':fontsize=46:fontcolor=white:x=(w-tw)/2:y=h*0.36+140:alpha='clip((t-1)/1.2\,0\,1)',drawtext=fontfile='$EN':text='$5':fontsize=30:fontcolor=white@0.85:x=(w-tw)/2:y=h*0.36+210:alpha='clip((t-2)/1.2\,0\,1)'[v];[1:a]afade=t=in:d=1.5,afade=t=out:st=10:d=2,volume=0.8[a]" \
   -map "[v]" -map "[a]" -t 12 -c:v libx264 -preset veryfast -crf 26 -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart "$OUT/$1.mp4"
  $F -loglevel error -y -ss 3 -i "$OUT/$1.mp4" -frames:v 1 -q:v 4 "$OUT/$1.jpg"
}
WAVES="anoisesrc=c=brown:a=0.25:d=12,lowpass=f=500,volume='0.6+0.4*sin(2*PI*t/6)':eval=frame"
RAIN="anoisesrc=c=pink:a=0.18:d=12,highpass=f=800,lowpass=f=6000"
WIND="anoisesrc=c=brown:a=0.2:d=12,bandpass=f=300:w=200,volume='0.5+0.5*sin(2*PI*t/4)':eval=frame"
r dawn-sky "c0=0xFF8A5B:c1=0xFFC86B:c2=0x6B3CF6:nb_colors=3" "الحمد لله" "Thankful for a new morning" "Shukr Daily" "$WAVES"
r ocean "c0=0x0A3D62:c1=0x1E90A8:c2=0x0B5E7A:nb_colors=3" "سبحان الله" "Look at the sea He made" "Shukr Nature" "$WAVES"
r night-stars "c0=0x05071A:c1=0x1B1F4A:c2=0x2E1A47:nb_colors=3" "الله أكبر" "Count the stars tonight" "Shukr Nature" "$WIND"
r rain-window "c0=0x2C3E50:c1=0x4A6274:c2=0x1C2833:nb_colors=3" "أستغفر الله" "Rain is mercy - make dua" "Shukr Reminders" "$RAIN"
r golden-field "c0=0xE0A030:c1=0xC0602A:c2=0x8A4B1A:nb_colors=3" "ما شاء الله" "Every grain is a gift" "Shukr Nature" "$WIND"
r calm-heart "c0=0xE3164E:c1=0x8E2DE2:c2=0x4A00E0:nb_colors=3" "تطمئن القلوب" "Remember Him. Find rest." "Shukr Reminders" "$RAIN"
ls -la "$OUT"
