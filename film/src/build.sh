#!/usr/bin/env bash
# Full pipeline: footage frames -> picture frames -> soundtrack -> final MP4s in ../
#   ./build.sh [work_dir]      (work_dir holds the multi-GB frame dumps; default: ./out)
set -euo pipefail
cd "$(dirname "$0")"
PY=${PYTHON:-python3}
WORK=${1:-out}; mkdir -p "$WORK" out
[ -f frames/manifest.js ] || ./prepare.sh
$PY render.py --format wide --scale 2 --out "$WORK/wide4k"      # 3840x2160
$PY render.py --format tall --scale 1 --out "$WORK/tall"        # 1080x1920
$PY audio.py
A=out/soundtrack.wav
X264="-c:v libx264 -preset slow -pix_fmt yuv420p -profile:v high -movflags +faststart"
AAC="-c:a aac -ar 48000"
enc() { ffmpeg -nostdin -v error -y -framerate 30 -i "$1/%05d.jpg" -i $A "${@:3}" -shortest "$2"; echo "  $2  $(du -h "$2" | cut -f1)"; }
# masters
enc "$WORK/wide4k" ../Lipro_Academy_Cinematic_4K.mp4 $X264 -crf 23 -maxrate 6M -bufsize 12M -level 5.1 $AAC -b:a 256k
enc "$WORK/tall"   ../Lipro_Academy_Reels_9x16.mp4   $X264 -crf 21 -maxrate 5M -bufsize 10M $AAC -b:a 256k
# website (loaded only when the visitor presses play)
enc "$WORK/wide4k" ../lipro-film-web-16x9.mp4 -vf scale=1280:720:flags=lanczos $X264 -crf 26 -maxrate 1500k -bufsize 3M $AAC -b:a 128k
enc "$WORK/tall"   ../lipro-film-web-9x16.mp4 -vf scale=720:1280:flags=lanczos $X264 -crf 26 -maxrate 1500k -bufsize 3M $AAC -b:a 128k
# animated logo intro / outro (1080p, cut from the master picture + soundtrack)
cut() { ffmpeg -nostdin -v error -y -framerate 30 -start_number "$3" -i "$WORK/wide4k/%05d.jpg" -ss "$2" -i $A -frames:v "$4" \
        -vf "scale=1920:1080:flags=lanczos,fade=t=out:st=$5:d=0.5" -af "afade=t=out:st=$5:d=0.5" $X264 -crf 20 $AAC -b:a 192k -shortest "$1"; echo "  $1  $(du -h "$1" | cut -f1)"; }
cut ../Lipro_Logo_Intro.mp4 0    0    195 6.0
cut ../Lipro_Logo_Outro.mp4 68.0 2040 270 8.5
# posters
ffmpeg -nostdin -v error -y -i "$WORK/wide4k/00168.jpg" -vf scale=1280:720:flags=lanczos -q:v 3 ../poster-16x9.jpg
ffmpeg -nostdin -v error -y -i "$WORK/tall/00168.jpg"   -vf scale=720:1280:flags=lanczos -q:v 3 ../poster-9x16.jpg
