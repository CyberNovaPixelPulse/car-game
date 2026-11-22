import type { Page } from "@playwright/test";

/** Install a read-only observer before physical input. Distance is measured in
 * viewport heights so different display sizes describe the same visual angle. */
export async function observeSight(page: Page) {
  const observation = await page
    .locator(".sight:visible")
    .evaluateHandle((sight) => {
      const viewport = sight.parentElement!;
      let peak = 0,
        last = 0,
        frames = 0,
        frame = 0;
      function sample() {
        const view = viewport.getBoundingClientRect();
        const mark = sight.getBoundingClientRect();
        last =
          Math.hypot(
            mark.left + mark.width / 2 - view.left - view.width / 2,
            mark.top + mark.height / 2 - view.top - view.height / 2,
          ) / view.height;
        peak = Math.max(peak, last);
        frames++;
        frame = requestAnimationFrame(sample);
      }
      sample();
      return () => {
        cancelAnimationFrame(frame);
        return { peak, last, frames };
      };
    });
  return async () => {
    try {
      return await observation.evaluate((finish) => finish());
    } finally {
      await observation.dispose();
    }
  };
}
