export type SceneQuality = "low" | "medium" | "high";

/** Total drawing pixels per view, at the equivalent 16:9 resolution. The
 * actual buffer keeps the canvas aspect and caps supersampling at 2x CSS size.
 * This is a local framebuffer budget, independent of HUD, camera and art tier. */
const PIXEL_BUDGET: Record<SceneQuality, number> = {
  low: 1280 * 720,
  medium: 1920 * 1080,
  high: 2560 * 1440,
};

export function scenePixelRatio(
  width: number,
  height: number,
  quality: SceneQuality,
) {
  return Math.min(2, Math.sqrt(PIXEL_BUDGET[quality] / (width * height)));
}
