#!/bin/sh
# Download the CC0 Poly Haven textures the tank bake reads, and verify each SHA-256.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)/sources"
grep -v '^#' "$DIR/manifest.tsv" | while IFS="$(printf '\t')" read -r file sum author page; do
  [ -n "$file" ] || continue
  asset="${file%_*_2k.jpg}"; asset="${asset%_nor}"
  if [ ! -f "$DIR/$file" ]; then
    curl -fsSL -o "$DIR/$file" "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/$asset/$file"
  fi
  echo "$sum  $DIR/$file" | shasum -a 256 -c - >/dev/null || { echo "checksum mismatch: $file" >&2; exit 1; }
done
echo "tank texture sources ready"
