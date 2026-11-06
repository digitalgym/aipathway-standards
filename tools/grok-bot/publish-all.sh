#!/usr/bin/env bash
# bash tools/grok-bot/publish-all.sh <work dir>
# Publish every pack in <work dir>/packs that has no link yet. Publishing
# sticks after about 40 bots in one app session, so after each pass this
# restarts Grok Bot in dev mode and resumes. Pass the work dir as C:/... on
# Windows, not /c/..., because node reads it.
D="$1"
HERE="$(cd "$(dirname "$0")" && pwd)"
for attempt in 1 2 3 4; do
  REST=$(node -e "const fs=require('fs');const f='$D/grok-links.json';const l=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):{};console.log(fs.readdirSync('$D/packs').map(f=>f.replace('.json','')).filter(s=>!l[s]).join(' '))")
  [ -z "$REST" ] && { echo "all done"; break; }
  echo "pass $attempt: $(echo $REST | wc -w) left"
  node "$HERE/publish.cjs" "$D" $REST 2>&1 | grep -E "^[a-z0-9-]+: (https|FAILED)" | cut -c1-110
  powershell -NoProfile -ExecutionPolicy Bypass -File "$HERE/start.ps1" >/dev/null
done
