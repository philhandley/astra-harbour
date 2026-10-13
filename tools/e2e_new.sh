#!/usr/bin/env bash
# Plays a round of each newer game level (Line, Make 100, Gulls) in headless Chrome, one at a time.
HERE="$(cd "$(dirname "$0")" && pwd)"
W="${1:-wrong=1}"
for spec in "tables&key=5&level=4" "tables&key=mix&level=4" "bonds&key=100&level=1" "bonds&key=100&level=2" "bonds&key=100&level=3" "gulls&key=10&level=1" "gulls&key=10&level=2" "gulls&key=10&level=3" "gulls&key=20&level=1"; do
  name="e2e-$(echo "$spec" | tr '&=' '--')"
  res=$(bash "$HERE/shot.sh" "$name" "dev/test-e2e.html?game=$spec&$W&secs=290" 1280,1000 300 | grep E2E | sed 's/", source.*//' | tail -3 | tr '\n' ' ')
  echo "$spec :: $res"
done
