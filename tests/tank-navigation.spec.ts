import { test, expect, type Page } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

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
      await expect(map(page).locator('[aria-label="固定掩體"] rect')).toHaveCount(4);
      await expect(map(page).locator('[aria-label="地形示意"]')).toBeVisible();
      await expect(map(page).locator('[aria-label="己方車頭"]')).toBeVisible();
      // A vertical SVG stroke has a zero-width geometry box, so Playwright's
      // box-based visibility helper calls it hidden even while it is painted.
      expect(await map(page).locator('[aria-label="主炮方向"]').evaluate((line) => {
        const style = getComputedStyle(line);
        return style.stroke !== "none" && style.visibility === "visible" &&
          (line as SVGGeometryElement).getTotalLength() > 0;
      })).toBe(true);
      await expect(page.locator(".battle-navigation")).toContainText("北");
      await expect(page.locator(".battle-navigation")).toContainText("84 × 84 m");
      await page.screenshot({ path: `${evidence}/map-${role}-1440.png` });
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
      await crew.loader.screenshot({ path: `${evidence}/map-loader-${mode}-1440.png` });
    }
  } finally {
    await crew.close();
  }
});
