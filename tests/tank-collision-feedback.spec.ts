import { expect, test } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

test("兩次真正撞牆都帶動砲手視野，持續頂牆時準星回穩", async ({ browser }) => {
  const crew = await tankCrew(browser);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      // Observe displayed reticle and contact text together. The driver uses
      // regular controls, while a different crew station sees the same impact.
      const observation = crew.gunner.locator(".sight").evaluate((sight) => {
        const contact = document.querySelector('[data-testid="tank-contact"]')!;
        const viewport = sight.parentElement!.getBoundingClientRect();
        const center = viewport.top + viewport.height / 2;
        return new Promise<{ peak: number; settled: number }>(
          (resolve, reject) => {
            const deadline = performance.now() + 14000;
            let hit = 0;
            let peak = 0;
            let settled = 0;
            function frame(now: number) {
              if (!hit && contact.textContent === "車體受阻") hit = now;
              if (hit) {
                const rect = sight.getBoundingClientRect();
                const displacement = Math.abs(
                  rect.top + rect.height / 2 - center,
                );
                if (now - hit < 420) peak = Math.max(peak, displacement);
                if (now - hit > 700) settled = Math.max(settled, displacement);
                if (now - hit >= 1150) return resolve({ peak, settled });
              }
              if (now > deadline) return reject(new Error("未到達牆面"));
              requestAnimationFrame(frame);
            }
            requestAnimationFrame(frame);
          },
        );
      });
      await crew.driver.keyboard.down("w");
      const { peak, settled } = await observation;
      expect(peak).toBeGreaterThan(3);
      expect(settled).toBeLessThan(peak / 2);
      await crew.driver.keyboard.up("w");
      if (attempt === 0) {
        await crew.driver.keyboard.down("s");
        await expect(crew.driver.getByTestId("tank-speed")).toHaveText("10.8");
        await crew.driver.keyboard.up("s");
        await expect(crew.driver.getByTestId("tank-speed")).toHaveText("0.0");
        await expect(crew.gunner.getByTestId("tank-contact")).toHaveText(
          "車體正常",
        );
      }
    }
  } finally {
    await crew.close();
  }
});
