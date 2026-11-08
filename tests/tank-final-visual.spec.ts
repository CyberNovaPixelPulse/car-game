import { test, expect } from "@playwright/test";
import { tankCrew } from "./tank-helpers";
const out =
  process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/final-visual";
async function capture(page: any, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.screenshot({ path: `${out}/${name}.png` });
  await page.screenshot({ path: `${out}/${name}-full.png`, fullPage: true });
}
test("最終入口、三職戰鬥及機槍桌面矩陣", async ({ browser, page }) => {
  await page.goto("/");
  for (const [width, height] of [
    [390, 844],
    [1440, 1050],
  ] as const) {
    await page.setViewportSize({ width, height });
    await capture(page, `entry-${width}`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByLabel("乘員名稱").fill("畫面驗收");
  await page.getByLabel("房間代碼").fill("BAD");
  await page.getByRole("button", { name: "加入房間", exact: true }).click();
  await capture(page, "entry-error-1440");
  const c = await tankCrew(browser);
  try {
    for (const [width, height] of [
      [1280, 720],
      [1440, 1050],
    ] as const) {
      for (const [p, role] of [
        [c.driver, "driver"],
        [c.gunner, "gunner"],
        [c.loader, "loader"],
      ] as const) {
        await p.setViewportSize({ width, height });
        await capture(p, `battle-${role}-${width}`);
        await expect(
          p.getByRole("button", { name: "離開房間", exact: true }),
        ).toBeVisible();
      }
    }
    await expect(
      c.driver.getByRole("img", { name: "駕駛裝甲觀察窗" }),
    ).toBeVisible();
    await expect(
      c.loader.getByRole("img", { name: "車內炮膛與彈藥架" }),
    ).toBeVisible();
    await c.loader.keyboard.press("Tab");
    for (const [width, height] of [
      [1280, 720],
      [1440, 1050],
    ] as const) {
      await c.loader.setViewportSize({ width, height });
      await capture(c.loader, `battle-mg-${width}`);
    }
    await expect(
      c.loader.getByRole("img", { name: "車內炮膛與彈藥架" }),
    ).toBeHidden();
    await c.driver.goto("about:blank");
    for (const [p, role] of [
      [c.loader, "loader"],
      [c.gunner, "gunner"],
    ] as const) {
      await p.setViewportSize({ width: 1280, height: 720 });
      await expect(p.getByTestId("battle-pause")).toBeInViewport();
      await expect(
        p.getByRole("heading", { name: /工作站$/ }),
      ).toBeInViewport();
      await capture(p, `pause-${role}-1280`);
      await expect(
        p.getByRole("button", { name: "離開房間", exact: true }),
      ).toBeInViewport();
    }
    await c.driver.goto("/");
    await expect(
      c.driver.getByRole("heading", { name: "駕駛工作站" }),
    ).toBeVisible();
    await c.driver.waitForLoadState("networkidle");
    await expect(c.driver.getByTestId("battle-pause")).toBeHidden();
    await c.gunner.goto("about:blank");
    await c.driver.setViewportSize({ width: 1280, height: 720 });
    await expect(c.driver.getByTestId("battle-pause")).toBeInViewport();
    await expect(
      c.driver.getByRole("heading", { name: "駕駛工作站" }),
    ).toBeInViewport();
    await capture(c.driver, "pause-driver-1280");
    await expect(
      c.driver.getByRole("button", { name: "離開房間", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await c.gunner.goto("/");
    await expect(c.gunner.getByTestId("battle-pause")).toBeHidden();
  } finally {
    await c.close();
  }
});
