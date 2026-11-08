#!/bin/sh
# Rebuild the Normandy map art (about 12 minutes of baking). Override BLENDER to point at another install.
set -e
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
sh "$ROOT/tools/blender/fetch_sources.sh"
python3 "$ROOT/tools/blender/fetch_map_sources.py"
"$BLENDER" --background --factory-startup --python "$ROOT/tools/blender/build_map.py" -- \
  --stage final --out "$ROOT/public/art/map" | grep '^\[map\]'
