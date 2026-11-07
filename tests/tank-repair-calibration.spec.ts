import { test, expect, type Page } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

const evidence =
  process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/40";
const hp = async (page: Page) =>
  Number((await page.getByTestId("tank-health").textContent())!.split("/")[0]);
async function repairMode(page: Page) {
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("loader-mode")).toHaveText("維修模式");
}

test("實際維修才啟動兩秒圓形校準，正常空白鍵完美成功額外3HP並由三方共享", async ({
  browser,
}) => {
  const c = await tankCrew(browser, "gunner", 0, 1972);
  try {
    await repairMode(c.loader);
    await expect
      .poll(() => hp(c.loader), { timeout: 45000 })
      .toBeLessThanOrEqual(82);
    await c.loader.keyboard.down("r");
    await expect(c.loader.getByTestId("repair-calibration")).toBeVisible({
      timeout: 12000,
    });
    await expect(
      c.loader.getByTestId("repair-calibration"),
    ).toHaveAccessibleName("維修時機校準");
    // All observations are visible user readouts. The actual keyboard still
    // travels over WebRTC to the host's authoritative needle and HP rule.
    await expect
      .poll(
        async () => {
          const text = await c.loader
            .getByTestId("repair-calibration-position")
            .textContent();
          const [needle, , , perfectStart, perfectEnd] = text!
            .match(/[\d.]+/g)!
            .map(Number);
          return (
            needle >= (perfectStart + perfectEnd) / 2 - 8 &&
            needle <= (perfectStart + perfectEnd) / 2
          );
        },
        { intervals: [10], timeout: 1800 },
      )
      .toBe(true);
    const before = await hp(c.loader);
    await c.loader.keyboard.press("Space");
    await expect(c.loader.getByTestId("repair-calibration-result")).toHaveText(
      "完美校準・額外 +3 HP",
    );
    const after = await hp(c.loader);
    expect(after - before).toBeGreaterThanOrEqual(3);
    expect(after - before).toBeLessThan(3.7);
    await c.loader.keyboard.up("r");
    await expect(c.loader.getByTestId("repair-status")).not.toContainText(
      "維修中",
    );
    const shared = await c.loader.getByTestId("tank-health").textContent();
    for (const page of [c.driver, c.gunner]) {
      await expect(page.getByTestId("tank-health")).toHaveText(shared!);
      await expect(page.getByTestId("repair-calibration-result")).toHaveText(
        "完美校準・額外 +3 HP",
      );
    }
    await c.loader.screenshot({
      path: `${evidence}/calibration-perfect-1440.png`,
    });
  } finally {
    await c.close();
  }
});

test("校準中放開R立即失敗，兩秒停修保留既有HP且重複空白鍵不能重結算", async ({
  browser,
}) => {
  const c = await tankCrew(browser, "gunner", 0, 1972);
  try {
    await repairMode(c.loader);
    await expect
      .poll(() => hp(c.loader), { timeout: 45000 })
      .toBeLessThanOrEqual(82);
    await c.loader.keyboard.down("r");
    await expect(c.loader.getByTestId("repair-calibration")).toBeVisible({
      timeout: 12000,
    });
    const before = await hp(c.loader);
    await c.loader.keyboard.up("r");
    await expect(c.loader.getByTestId("repair-calibration-result")).toHaveText(
      "校準失敗・停修兩秒",
      { timeout: 1200 },
    );
    expect(await hp(c.loader)).toBeGreaterThanOrEqual(before);
    await expect(c.loader.getByTestId("repair-calibration")).toBeHidden();
    await c.loader.keyboard.down("r");
    await expect(c.loader.getByTestId("repair-status")).toContainText(
      "校準失敗等待",
    );
    const remaining = () =>
      c.loader
        .getByTestId("repair-status")
        .textContent()
        .then((text) => Number(text!.match(/[\d.]+/)![0]));
    const start = await remaining();
    expect(start).toBeGreaterThan(1.5);
    expect(start).toBeLessThanOrEqual(2);
    await c.loader.keyboard.press("Space");
    await c.loader.keyboard.press("Space");
    await c.loader.waitForTimeout(400);
    expect(await hp(c.loader)).toBeLessThanOrEqual(before + 0.2);
    expect(await remaining()).toBeLessThan(start - 0.2);
    await expect(c.loader.getByTestId("repair-calibration-result")).toHaveText(
      "校準失敗・停修兩秒",
    );
    await c.loader.keyboard.up("r");
  } finally {
    await c.close();
  }
});
