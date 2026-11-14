#!/usr/bin/env bash
# Extracts the real academy training shots from promo-video.mp4 as frame sequences
# (cropped to drop the editor watermark, retimed with frame blending for slow motion).
set -euo pipefail
cd "$(dirname "$0")"
SRC=../../promo-video.mp4
rm -rf frames && mkdir -p frames
# name start end speed
CLIPS="
wide 21.0 24.6 0.8
kidball 33.4 34.65 0.4
dribble 24.8 25.9 0.45
hurdle_close 10.5 12.6 0.6
cones 35.5 37.8 0.6
pass 38.4 41.2 0.7
coach1 13.4 14.7 0.5
coach2 41.6 44.5 0.7
jump 52.3 54.0 0.5
hurdles_wide 3.3 7.8 1.0
discipline 17.6 20.3 0.8
lineup 60.0 62.3 0.6
kidjump 32.1 33.3 0.5
coach3 65.3 69.0 0.8
"
echo "$CLIPS" | while read -r name s e sp; do
  [ -z "$name" ] && continue
  mkdir -p "frames/$name"
  dur=$(python3 -c "print($e-$s)")
  ffmpeg -nostdin -v error -y -ss "$s" -t "$dur" -i "$SRC" -an \
    -vf "crop=664:1180:28:100,setpts=PTS/$sp,minterpolate=fps=30:mi_mode=blend,unsharp=5:5:0.6" \
    -q:v 2 "frames/$name/%04d.jpg"
  ffmpeg -nostdin -v error -y -framerate 30 -i "frames/$name/%04d.jpg" -vf "scale=54:96,gblur=sigma=1.2" -q:v 4 "frames/$name/b%04d.jpg"
  echo "\"$name\": $(ls frames/$name | grep -vc '^b'),"
done | tee frames/_counts.txt
python3 - <<'PY'
import re,json
d=dict(re.findall(r'"(\w+)": (\d+)',open('frames/_counts.txt').read()))
open('frames/manifest.js','w').write('window.CLIPS='+json.dumps({k:int(v) for k,v in d.items()})+';\n')
PY
