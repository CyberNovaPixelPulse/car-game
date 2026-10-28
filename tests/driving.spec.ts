import { test, expect } from "@playwright/test";
test("玩家可在瀏覽器用兩組按鍵駕駛並煞車", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "自由練習" }).click();
  await expect(page.getByRole("heading", { name: "自由練習中" })).toBeVisible();
  const speed = page.getByTestId("speed");
  await page.keyboard.down("w");
  await expect
    .poll(async () => Number(await speed.textContent()))
    .toBeGreaterThan(30);
  await page.keyboard.up("w");
  await page.keyboard.down("s");
  await expect
    .poll(async () => Number(await speed.textContent()))
    .toBeLessThan(10);
  await page.keyboard.up("s");
  await page.keyboard.down("ArrowUp");
  await expect
    .poll(async () => Number(await speed.textContent()))
    .toBeGreaterThan(30);
  await page.keyboard.up("ArrowUp");
  await expect(page.locator("canvas")).toBeVisible();
});
