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
test("持續直行離開路面後，車速會明顯降低", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "自由練習" }).click();
  await page.keyboard.down("w");
  await expect
    .poll(async () => Number(await page.getByTestId("speed").textContent()))
    .toBeGreaterThan(200);
  await expect
    .poll(async () => Number(await page.getByTestId("speed").textContent()))
    .toBeLessThan(80);
  await page.keyboard.up("w");
});
