import { test, expect } from "@playwright/test";

test("根目錄直接提供三人坦克房間與桌機鍵盤說明", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("乘員名稱")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "建立房間", exact: true }),
  ).toBeVisible();
  await expect(page.locator("body")).toContainText("鍵盤");
  await expect(page).toHaveTitle("三人坦克合作戰鬥");
});

test("720高視窗從捲動的大廳正常開戰後，各職標題與血量立即可見", async ({
  browser,
}) => {
  const { tankCrew } = await import("./tank-helpers");
  const c = await tankCrew(
    browser,
    "loader",
    0,
    1000,
    "/tmp/car-game-to-spec/visual27-final/start-transition-videos",
  );
  try {
    for (const page of [c.driver, c.loader, c.gunner]) {
      await expect(
        page.getByRole("heading", { name: /工作站$/ }),
      ).toBeInViewport();
      await expect(page.getByTestId("tank-health")).toBeInViewport();
    }
  } finally {
    await c.close();
  }
});
