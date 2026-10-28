import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
mkdirSync("public/wasm", { recursive: true });
const result = spawnSync(
  process.env.EMCC || "emcc",
  [
    "game/simulation.c",
    "game/render.c",
    "-Igame",
    "-std=c11",
    "-Wall",
    "-Wextra",
    "-Werror",
    "-O2",
    "-sUSE_SDL=2",
    "-sMODULARIZE=1",
    "-sEXPORT_NAME=PocketGame",
    "-sENVIRONMENT=web",
    "-sALLOW_MEMORY_GROWTH=1",
    "-sEXPORTED_RUNTIME_METHODS=UTF8ToString,HEAPU8",
    "--no-entry",
    "-o",
    "public/wasm/game.js",
  ],
  { stdio: "inherit" },
);
if (result.error)
  console.error(
    "Install Emscripten 4.0.15 and source emsdk_env.sh, or set EMCC to emcc.",
  );
process.exit(result.status ?? 1);
