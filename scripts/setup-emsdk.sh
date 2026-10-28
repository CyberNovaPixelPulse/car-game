#!/usr/bin/env bash
set -euo pipefail
sdk_dir="${POCKET_EMSDK_DIR:-${TMPDIR:-/tmp}/pocket-circuit-emsdk}"
if [ ! -f "$sdk_dir/emsdk.py" ]; then
  git clone --depth 1 --branch 4.0.15 https://github.com/emscripten-core/emsdk.git "$sdk_dir"
fi
python3 "$sdk_dir/emsdk.py" install 4.0.15
python3 "$sdk_dir/emsdk.py" activate 4.0.15
printf '\nCompiler: %s/upstream/emscripten/emcc\n' "$sdk_dir"
