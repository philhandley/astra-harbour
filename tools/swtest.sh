#!/usr/bin/env bash
# Offline test: headless Edge registers sw.js and reports what it cached. Needs: python tools/slowserve.py 8601
HERE="$(cd "$(dirname "$0")" && pwd)"
PROF="$HERE/shots/profile-edge-sw-$$"; rm -rf "$PROF"; mkdir -p "$HERE/shots"
timeout 260 "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --no-first-run --user-data-dir="$PROF" --dump-dom "http://127.0.0.1:8601/dev/test-sw.html?hold=110" 2>/dev/null | grep -o "SWTEST [^<]*" | grep -v "a.join"
rm -rf "$PROF"
