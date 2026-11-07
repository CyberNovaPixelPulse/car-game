import { expect, type Page } from "@playwright/test";
import { aimAtHeading, tankCrew } from "./tank-helpers";

export const staleContacts = (page: Page) =>
  page.locator('.navigation-enemy[data-observation="stale"]');

/** Real crew arrangement: the driver and main gun face away; the loader's
 * visible MG canvas is the only observer until ordinary Tab enters repair. */
export async function repairWithFreshLastKnown(
  c: Awaited<ReturnType<typeof tankCrew>>,
) {
  await aimAtHeading(c.gunner, 180);
  await c.driver.keyboard.down("d");
  await expect
    .poll(
      async () =>
        Number(
          (await c.driver.getByTestId("hull-heading").textContent())!.replace(
            "°",
            "",
          ),
        ),
      { intervals: [25] },
    )
    .toBeGreaterThan(65);
  await c.driver.keyboard.up("d");
  await expect(c.driver.getByTestId("tank-motion")).toHaveText("靜止");
  await c.loader.keyboard.press("Tab");
  await expect(c.loader.getByTestId("loader-mode")).toHaveText("機槍模式");
  await c.loader.keyboard.down("a");
  await expect(
    c.loader.locator(
      '.navigation-enemy[data-observation="current"][aria-label="觀測敵車 四號 H 型"]',
    ),
  ).toHaveCount(1);
  await c.loader.keyboard.up("a");
  await expect
    .poll(
      async () =>
        Number(
          (await c.loader.getByTestId("tank-health").textContent())!.split(
            "/",
          )[0],
        ),
      { timeout: 45000 },
    )
    .toBeLessThanOrEqual(82);
  // Read only the visible health: keep observing through an actual damage-free
  // three seconds, instead of reading the repair deadline from a hidden mode.
  await c.loader.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const health = document.querySelector('[data-testid="tank-health"]')!;
        let text = health.textContent;
        let stable: ReturnType<typeof setTimeout>;
        const observer = new MutationObserver(() => {
          if (health.textContent === text) return;
          text = health.textContent;
          clearTimeout(stable);
          stable = setTimeout(done, 3100);
        });
        const done = () => {
          clearTimeout(deadline);
          observer.disconnect();
          resolve();
        };
        const deadline = setTimeout(() => {
          clearTimeout(stable);
          observer.disconnect();
          reject(new Error("未找到真實敵彈後三秒的維修機會"));
        }, 20000);
        stable = setTimeout(done, 3100);
        observer.observe(health, {
          childList: true,
          characterData: true,
          subtree: true,
        });
      }),
  );
  await c.loader.keyboard.press("Tab");
  await expect(c.loader.getByTestId("loader-mode")).toHaveText("維修模式");
  await expect(staleContacts(c.loader)).toHaveCount(1);
  // Observe the first public onset at frame cadence. A visibility matcher's
  // retry backoff can miss an actually displayed circle before the next hit.
  const onset = c.loader.waitForFunction(
    () => {
      const circle = document.querySelector<HTMLElement>(
        '[data-testid="repair-calibration"]',
      );
      return !!circle && !circle.hidden;
    },
    undefined,
    { timeout: 4500 },
  );
  await c.loader.keyboard.down("r");
  await (await onset).dispose();
  await expect(c.loader.getByTestId("repair-calibration")).toBeVisible({
    timeout: 4500,
  });
  await expect(staleContacts(c.loader)).toHaveCount(1);
}
