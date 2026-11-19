/**
 * Renders every synthesized one-shot to WAV for listening outside the game:
 *   npx tsx tools/render-audio-preview.ts [output-dir]
 * Continuous layers (engine, tracks, turret) are built live in WebAudio and
 * are not included here.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ONE_SHOTS,
  VARIANTS,
  renderOneShot,
  wav,
} from "../web/tank-audio-synth.ts";

const rate = 48000;
const out = resolve(process.argv[2] ?? "output/audio-preview");
mkdirSync(out, { recursive: true });
for (const kind of ONE_SHOTS)
  for (let take = 0; take < VARIANTS[kind]; take++) {
    const samples = renderOneShot(kind, rate, take);
    let peak = 0;
    for (const v of samples) {
      if (!Number.isFinite(v)) throw new Error(`${kind}:${take} has NaN/Inf`);
      peak = Math.max(peak, Math.abs(v));
    }
    const file = join(out, `${kind}-${take + 1}.wav`);
    writeFileSync(file, wav(samples, rate));
    console.log(
      `${file}  ${(samples.length / rate).toFixed(2)}s  peak ${peak.toFixed(2)}`,
    );
  }
