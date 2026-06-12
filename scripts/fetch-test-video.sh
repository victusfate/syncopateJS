#!/usr/bin/env bash
# fetch-test-video.sh — download a short sample of a video to ./videos/.
#
# Why: experiments like beat-prism analyze a video's audio fully client-side,
# which requires a same-origin (local) file — remote URLs such as YouTube are
# CORS-walled. This wraps yt-dlp to fetch a test clip onto disk so it can be
# dropped onto the experiment page. Source videos can be feature-length, so
# by default only a 3-minute sample is downloaded.
#
# Usage:   bash scripts/fetch-test-video.sh [--hq] [--res <height>] <url> [start] [duration|full]
#   bash scripts/fetch-test-video.sh <url>              # first 3 minutes
#   bash scripts/fetch-test-video.sh <url> 45:00        # 3 min from 45:00
#   bash scripts/fetch-test-video.sh <url> 45:00 5:00   # 5 min from 45:00
#   bash scripts/fetch-test-video.sh <url> full         # entire video
#   bash scripts/fetch-test-video.sh --hq <url> full    # highest quality, whole video
#   bash scripts/fetch-test-video.sh --res 2160 <url>   # best ≤2160p, highest fps
#
# --hq merges the best separate video+audio streams instead of the best
# single-file mp4 (~720p on YouTube). Downloads are capped at 2160p by
# default (preferring higher fps, so 4K60 over 8K) — pass --res to change
# the cap, or --res 0 to remove it entirely. Above 1080p
# YouTube serves VP9/AV1, so the result is usually .webm/.mkv — fine for
# Chrome/Edge. Seeing the full format ladder requires a JS runtime (deno
# or node) plus yt-dlp's remotely-fetched EJS solver, which is opt-in;
# this script passes --remote-components ejs:github to enable it (cached
# locally after the first run).
#
# Requires yt-dlp (pip install yt-dlp | brew install yt-dlp); sampling and
# --hq also require ffmpeg (section cutting / stream muxing).
#
# Output: prints the downloaded file path on stdout. ./videos/ is gitignored.
# Idempotent: yt-dlp skips files it has already downloaded.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT/videos"

HQ=0
RES=2160  # default height cap; --res overrides, --res 0 removes the cap
while [[ "${1:-}" == --* ]]; do
  case "$1" in
    --hq) HQ=1; shift ;;
    --res) RES="${2:-0}"; HQ=1; shift 2 ;;  # a height cap implies stream merging
    *) echo "error: unknown option $1" >&2; exit 2 ;;
  esac
done

if [[ $# -lt 1 || $# -gt 3 ]]; then
  echo "usage: bash scripts/fetch-test-video.sh [--hq] [--res <height>] <url> [start] [duration|full]" >&2
  exit 2
fi
URL="$1"
START="${2:-0:00}"
DURATION="${3:-3:00}"

if ! command -v yt-dlp >/dev/null 2>&1; then
  echo "error: yt-dlp not found. Install it: pip install yt-dlp (or brew install yt-dlp)" >&2
  exit 1
fi

# Best single-file mp4 plays anywhere without muxing; --hq merges the best
# separate streams (needs ffmpeg) for the highest available resolution.
FMT='b[ext=mp4]/b'
if [[ $HQ -eq 1 ]]; then
  if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "error: ffmpeg not found (required by --hq to mux video+audio)." >&2
    exit 1
  fi
  FMT='bv*+ba/b'
fi

# Height cap: best stream at or below RES, preferring higher frame rates.
SORT=()
if [[ "$RES" -gt 0 ]]; then
  SORT=(-S "res:${RES},fps")
fi

# "1:23:45" / "23:45" / "45" -> seconds
to_seconds() {
  awk -F: '{ s = 0; for (i = 1; i <= NF; i++) s = s * 60 + $i; print s }' <<<"$1"
}

EXTRA_ARGS=()
if [[ "$START" != "full" ]]; then
  if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "error: ffmpeg not found (required to cut a sample). Install it, or pass 'full' to download the whole video." >&2
    exit 1
  fi
  START_S="$(to_seconds "$START")"
  END_S="$(( START_S + $(to_seconds "$DURATION") ))"
  EXTRA_ARGS+=(--download-sections "*${START_S}-${END_S}" --force-keyframes-at-cuts
               -o "$OUT_DIR/%(title)s_${START_S}s-${END_S}s.%(ext)s")
else
  EXTRA_ARGS+=(-o "$OUT_DIR/%(title)s.%(ext)s")
fi

mkdir -p "$OUT_DIR"

yt-dlp \
  --no-playlist \
  --restrict-filenames \
  --remote-components ejs:github \
  -f "$FMT" \
  "${SORT[@]}" \
  --print after_move:filepath \
  --no-simulate \
  "${EXTRA_ARGS[@]}" \
  "$URL"
