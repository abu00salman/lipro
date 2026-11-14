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
./encode.sh "$WORK"
