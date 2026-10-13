#!/usr/bin/env bash
# Plays a round of every game level in headless Chrome (one at a time) and prints PASS/FAIL per run.
# Usage: bash tools/e2e_all.sh [wrong=1]
HERE="$(cd "$(dirname "$0")" && pwd)"
W="${1:-wrong=1}"
for spec in "tables&key=5&level=1" "tables&key=2&level=2" "tables&key=mix&level=3" "bonds&key=10&level=1" "bonds&key=20&level=2" "bonds&key=10&level=3" "bonds&key=20&level=1"; do
  name="e2e-$(echo "$spec" | tr '&=' '--')"
  res=$(bash "$HERE/shot.sh" "$name" "dev/test-e2e.html?game=$spec&$W&secs=290" 1280,1000 300 | grep E2E | sed 's/", source.*//' | tail -3 | tr '\n' ' ')
  echo "$spec :: $res"
done
