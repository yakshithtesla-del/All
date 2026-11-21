#!/usr/bin/env bash
# Final 2K vertical render of the race short (3402 frames, 1440x2560).
# Usage: bash scripts/render_final.sh    (expects public/audio/mix.wav to exist)
set -euo pipefail
cd "$(dirname "$0")/.."
export TEMP=/tmp/remotion-tmp TMP=/tmp/remotion-tmp
mkdir -p /tmp/remotion-tmp out/race
echo "[render] start $(date -u +%H:%M:%S)"
npx remotion render src/index.ts RaceShort out/race/video.mp4 \
  --codec h264 --crf 16 --scale 1.3333333333333333 \
  --jpeg-quality 90 --log-level info
echo "[render] done $(date -u +%H:%M:%S)"
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames:format=duration \
  -of default=nw=1 out/race/video.mp4
