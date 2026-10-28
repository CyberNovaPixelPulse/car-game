#!/usr/bin/env bash
set -euo pipefail
export POCKET_EMSDK_DIR="${TMPDIR:-/tmp}/pocket-circuit-emsdk"
bash scripts/setup-emsdk.sh
export EMCC="$POCKET_EMSDK_DIR/upstream/emscripten/emcc"
npm run build
