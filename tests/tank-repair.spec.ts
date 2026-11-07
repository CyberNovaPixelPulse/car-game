import { test, expect } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

const evidence =
  process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/39";

test("裝填手循環三種工作，維修車內與主炮工作互斥且保留同發彈種與進度", async ({
  browser,
}) => {
  const c = await tankCrew(browser, "gunner");
  try {
    await c.loader.keyboard.press("2");
    await c.loader.keyboard.down("r");
    await expect(c.loader.getByTestId("load-progress")).not.toHaveText("0");
    await c.loader.keyboard.up("r");
    await c.loader.keyboard.press("Tab");
    await expect(c.loader.getByTestId("loader-mode")).toHaveText("機槍模式");
    const progress = await c.loader.getByTestId("load-progress").textContent();
    await c.loader.keyboard.press("Tab");
    await expect(c.loader.getByTestId("loader-mode")).toHaveText("維修模式");
    await expect(
      c.loader.getByRole("img", { name: "車內炮膛與彈藥架" }),
    ).toBeVisible();
    await expect(c.loader.getByRole("img", { name: /戰場視野/ })).toHaveCount(
      0,
    );
    await expect(c.loader.getByTestId("repair-status")).toHaveText(
      "車體完好・100 / 100 HP",
    );
    await c.loader.keyboard.down("r");
    await c.loader.keyboard.press("1");
    await c.loader.keyboard.press("Space");
    await c.loader.waitForTimeout(500);
    await expect(c.loader.getByTestId("load-progress")).toHaveText(progress!);
    await expect(c.loader.getByTestId("chamber-shell")).toContainText("穿甲彈");
    await expect(c.loader.getByTestId("mg-shot-count")).toHaveText("0");
    await c.loader.keyboard.up("r");
    await c.loader.screenshot({ path: `${evidence}/repair-interior-1440.png` });
    await c.loader.keyboard.press("Tab");
    await expect(c.loader.getByTestId("loader-mode")).toHaveText("裝填模式");
    await expect(c.loader.getByTestId("load-progress")).toHaveText(progress!);
    await c.loader.keyboard.down("r");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
  } finally {
    await c.close();
  }
});

test("真實敵彈後等待三秒，停穩維修每秒2HP並同步至三方，最多100且可重複", async ({
  browser,
}) => {
  const c = await tankCrew(browser);
  try {
    await c.loader.keyboard.press("Tab");
    await c.loader.keyboard.press("Tab");
    await expect(c.loader.getByTestId("loader-mode")).toHaveText("維修模式");
    await c.loader.keyboard.down("r");
    const recoveryDelay = c.loader.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const health = document.querySelector('[data-testid="tank-health"]')!;
          let previous = Number(health.textContent!.split("/")[0]);
          let lastHit = 0;
          const observer = new MutationObserver(() => {
            const current = Number(health.textContent!.split("/")[0]);
            if (current < previous) lastHit = performance.now();
            else if (current > previous && lastHit) {
              observer.disconnect();
              resolve(performance.now() - lastHit);
            }
            previous = current;
          });
          observer.observe(health, {
            childList: true,
            characterData: true,
            subtree: true,
          });
        }),
    );
    await expect(c.gunner.getByTestId("tank-health")).not.toHaveText(
      "100/100",
      { timeout: 20000 },
    );
    await expect(c.loader.getByTestId("repair-status")).toContainText(
      "受擊等待",
    );
    const damaged = await c.loader.getByTestId("tank-health").textContent();
    await c.loader.waitForTimeout(1000);
    await expect(c.loader.getByTestId("tank-health")).toHaveText(damaged!);
    await expect(c.loader.getByTestId("repair-status")).toContainText(
      "維修中",
      { timeout: 4000 },
    );
    const elapsedToRecovery = await recoveryDelay;
    expect(elapsedToRecovery).toBeGreaterThanOrEqual(2900);
    expect(elapsedToRecovery).toBeLessThan(3500);
    // Sample only public health text and a real wall-clock interval, after the
    // authoritative wait has ended. No game object, world state or timer hook.
    const sample = await c.loader.evaluate(
      () =>
        new Promise<{ before: number; after: number; ms: number }>(
          (resolve) => {
            const hp = () =>
              Number(
                document
                  .querySelector('[data-testid="tank-health"]')!
                  .textContent!.split("/")[0],
              );
            const before = hp();
            const began = performance.now();
            setTimeout(
              () =>
                resolve({ before, after: hp(), ms: performance.now() - began }),
              1000,
            );
          },
        ),
    );
    expect(sample.after - sample.before).toBeGreaterThanOrEqual(1.7);
    expect(sample.after - sample.before).toBeLessThanOrEqual(2.3);
    expect(sample.ms).toBeGreaterThanOrEqual(990);
    await expect(c.loader.getByTestId("tank-health")).toHaveText("100/100", {
      timeout: 4500,
    });
    await c.loader.keyboard.up("r");
    await Promise.all(
      [c.driver, c.loader, c.gunner].map((p) =>
        expect(p.getByTestId("tank-health")).toHaveText("100/100"),
      ),
    );
    await c.loader.screenshot({ path: `${evidence}/repair-full-1440.png` });
    // Continuing enemy fire supplies a second real damaged state; no materials
    // or one-use repair allowance prevents the next repair cycle.
    await expect(c.loader.getByTestId("tank-health")).not.toHaveText(
      "100/100",
      { timeout: 12000 },
    );
    await expect(c.loader.getByTestId("repair-status")).toContainText(
      "受擊等待",
    );
    await c.loader.keyboard.down("r");
    await expect(c.loader.getByTestId("repair-status")).toContainText(
      "維修中",
      { timeout: 6500 },
    );
    await c.loader.keyboard.up("r");
    await expect(c.loader.getByTestId("repair-status")).toContainText("按住 R");
    const stopped = await c.loader.getByTestId("tank-health").textContent();
    await c.loader.waitForTimeout(500);
    await Promise.all(
      [c.driver, c.loader, c.gunner].map((p) =>
        expect(p.getByTestId("tank-health")).toHaveText(stopped!),
      ),
    );
  } finally {
    await c.close();
  }
});
