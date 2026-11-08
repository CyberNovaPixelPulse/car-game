#!/bin/sh
# Rebuild every tank glTF from source. Override BLENDER to point at another install.
set -e
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
sh "$ROOT/tools/blender/fetch_sources.sh"
for kind in ${*:-sherman panzer tiger}; do
  "$BLENDER" --background --factory-startup --python "$ROOT/tools/blender/build_tank.py" -- \
    --kind "$kind" --out "$ROOT/public/art/vehicles/$kind.glb" | grep '^\[tank-art\]'
done
