import { test, expect, type Page } from "@playwright/test";
import { aimAtHeading, tankCrew } from "./tank-helpers";

const evidence =
  process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/36";
const map = (page: Page) =>
  page.getByRole("img", { name: "北方固定朝上的戰場導航" });

test("三名乘員與裝填手三種工作共用全場北向導航及固定掩體", async ({
  browser,
}) => {
  const crew = await tankCrew(browser);
  try {
    for (const [page, role] of [
      [crew.driver, "driver"],
      [crew.gunner, "gunner"],
      [crew.loader, "loader-loading"],
    ] as const) {
      await expect(map(page)).toBeVisible();
      await expect(map(page)).toHaveAttribute("viewBox", "-42 -42 84 84");
      await expect(
        map(page).locator('[aria-label="固定掩體"] rect'),
      ).toHaveCount(4);
      await expect(map(page).locator('[aria-label="地形示意"]')).toBeVisible();
      await expect(map(page).locator('[aria-label="己方車頭"]')).toBeVisible();
      // A vertical SVG stroke has a zero-width geometry box, so Playwright's
      // box-based visibility helper calls it hidden even while it is painted.
      expect(
        await map(page)
          .locator('[aria-label="主炮方向"]')
          .evaluate((line) => {
            const style = getComputedStyle(line);
            return (
              style.stroke !== "none" &&
              style.visibility === "visible" &&
              (line as SVGGeometryElement).getTotalLength() > 0
            );
          }),
      ).toBe(true);
      await expect(page.locator(".battle-navigation")).toContainText("北");
      await expect(page.locator(".battle-navigation")).toContainText(
        "84 × 84 m",
      );
      await page.screenshot({ path: `${evidence}/map-${role}-1440.png` });
      await page.setViewportSize({ width: 1280, height: 720 });
      // Native Chromium can capture one stale compositor tile immediately
      // after resize; let presentation settle without touching the game clock.
      await page.waitForTimeout(300);
      await expect(map(page)).toBeVisible();
      const bounds = (await page.locator(".battle-navigation").boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(role === "driver" ? 480 : 0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(1280);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(720);
      await page.screenshot({ path: `${evidence}/map-${role}-720.png` });
      await page.setViewportSize({ width: 1440, height: 1050 });
      await page.waitForTimeout(300);
    }
    for (const [mode, name] of [
      ["machine-gun", "機槍模式"],
      ["repair", "維修模式"],
      ["loading", "裝填模式"],
    ] as const) {
      await crew.loader.keyboard.press("Tab");
      await expect(crew.loader.getByTestId("loader-mode")).toHaveText(name);
      await expect(map(crew.loader)).toBeVisible();
      await expect(crew.loader.locator(".battle-navigation")).toHaveCount(1);
      await crew.loader.screenshot({
        path: `${evidence}/map-loader-${mode}-1440.png`,
      });
      await crew.loader.setViewportSize({ width: 1280, height: 720 });
      await crew.loader.waitForTimeout(300);
      await expect(map(crew.loader)).toBeVisible();
      await crew.loader.screenshot({
        path: `${evidence}/map-loader-${mode}-720.png`,
      });
      await crew.loader.setViewportSize({ width: 1440, height: 1050 });
      await crew.loader.waitForTimeout(300);
    }
  } finally {
    await crew.close();
  }
});

// These are the transforms of the actual painted navigation symbols, not a
// hidden state mirror. Reading them observes exactly what the map displays.
const navigation = async (page: Page) =>
  map(page).evaluate((svg) => {
    const transform = (label: string) =>
      svg.querySelector(`[aria-label="${label}"]`)!.getAttribute("transform")!;
    const position = transform("己方位置")
      .match(/-?[\d.]+/g)!
      .map(Number);
    const angle = (label: string) =>
      Number(transform(label).match(/-?[\d.]+/)![0]);
    return {
      x: position[0],
      z: position[1],
      hull: angle("己方車頭"),
      gun: angle("主炮方向"),
    };
  });

async function stableNavigation(page: Page) {
  let previous = "";
  let stable = 0;
  await expect
    .poll(
      async () => {
        const current = JSON.stringify(await navigation(page));
        stable = current === previous ? stable + 1 : 0;
        previous = current;
        return stable;
      },
      { intervals: [150], timeout: 5000 },
    )
    .toBeGreaterThanOrEqual(3);
  return navigation(page);
}

test("正常行駛與原地轉向同步三方地圖，車頭箭頭與主炮世界方向獨立", async ({
  browser,
}) => {
  const crew = await tankCrew(browser, "gunner");
  try {
    expect(await navigation(crew.gunner)).toEqual({
      x: 0,
      z: 0,
      hull: 0,
      gun: 0,
    });
    const terrain = await map(crew.gunner)
      .locator('[aria-label="地形示意"]')
      .innerHTML();
    await crew.driver.keyboard.down("w");
    await expect(crew.driver.getByTestId("tank-contact")).toHaveText(
      "車體受阻",
      { timeout: 12000 },
    );
    await crew.driver.keyboard.up("w");
    await expect(crew.driver.getByTestId("tank-motion")).toHaveText("靜止");
    const stopped = await stableNavigation(crew.gunner);
    // The initial north wall is at z=-18; the tank stops short of its face.
    expect(stopped.z).toBeLessThan(-12);
    expect(stopped.z).toBeGreaterThan(-15);
    expect(stopped.x).toBe(0);
    expect(stopped.hull).toBe(0);
    for (const page of [crew.driver, crew.loader])
      await expect.poll(() => navigation(page)).toEqual(stopped);

    await aimAtHeading(crew.gunner, 90);
    const aimed = await stableNavigation(crew.gunner);
    expect(aimed.hull).toBe(0);
    expect(aimed.gun).toBeGreaterThan(89);
    expect(aimed.gun).toBeLessThan(91);
    expect(aimed.x).toBe(stopped.x);
    expect(aimed.z).toBe(stopped.z);

    await crew.loader.keyboard.press("Tab");
    await crew.loader.keyboard.press("Tab");
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("維修模式");
    await crew.driver.keyboard.down("d");
    await expect
      .poll(async () => (await navigation(crew.gunner)).hull)
      .toBeGreaterThan(25);
    await crew.driver.keyboard.up("d");
    const turned = await stableNavigation(crew.gunner);
    expect(turned.x).toBe(stopped.x);
    expect(turned.z).toBe(stopped.z);
    expect(turned.hull).toBeGreaterThan(25);
    expect(Math.abs(turned.gun - turned.hull - aimed.gun)).toBeLessThan(0.2);
    const compass = Number(
      (await crew.gunner.getByTestId("turret-heading").textContent())!.replace(
        "°",
        "",
      ),
    );
    expect(Math.abs(turned.gun - compass)).toBeLessThan(0.2);
    for (const [page, role] of [
      [crew.driver, "driver"],
      [crew.gunner, "gunner"],
      [crew.loader, "loader-repair"],
    ] as const) {
      await expect.poll(() => navigation(page)).toEqual(turned);
      await expect(map(page)).toHaveAttribute("viewBox", "-42 -42 84 84");
      expect(
        await map(page).locator('[aria-label="地形示意"]').innerHTML(),
      ).toBe(terrain);
      await page.screenshot({ path: `${evidence}/map-turned-${role}.png` });
    }
    await test.info().attach("visible-navigation-motion", {
      body: JSON.stringify({ stopped, aimed, turned, compass }, null, 2),
      contentType: "application/json",
    });
  } finally {
    await crew.close();
  }
});
