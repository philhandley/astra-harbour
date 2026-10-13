#!/usr/bin/env bash
# Usage: tools/shot.sh <name> <url-path-and-query> [W,H] [max-seconds]
# Headless Chrome (real GPU, WebGPU on) screenshot of http://127.0.0.1:8600/<path>, taken when the page calls
# shotReady() from dev/shotkit.js (it adds &shot=<name> to the URL), or after max-seconds. Prints console lines.
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/shots"
mkdir -p "$OUT"
NAME="$1"; PATHQ="$2"; SIZE="${3:-1280,800}"; SECS="${4:-40}"
case "$PATHQ" in *\?*) SEP='&';; *) SEP='?';; esac
rm -rf "$OUT/profile-$NAME"
timeout $((SECS + 30)) "/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --enable-unsafe-webgpu \
  --no-first-run --user-data-dir="$OUT/profile-$NAME" --window-size="$SIZE" --hide-scrollbars --autoplay-policy=no-user-gesture-required \
  --enable-logging=stderr --v=0 --screenshot="$OUT/$NAME.png" "http://127.0.0.1:8600/$PATHQ${SEP}shot=$NAME&wait=$SECS" 2>&1 | grep -E "CONSOLE" | grep -v powerPreference | sed -E 's/^.*CONSOLE[^"]*"//' | head -${LINES:-60}
rm -rf "$OUT/profile-$NAME"
echo "-> $OUT/$NAME.png"
