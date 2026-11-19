import { expect, test } from "@playwright/test";

test("裝填手在兩種車內工作中能轉頭與回正，轉頭期間仍可裝填", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.getByRole("button", { name: "單人練習", exact: true }).click();
  await page.getByRole("button", { name: "擔任裝填手", exact: true }).click();
  await page.getByRole("button", { name: "開始練習", exact: true }).click();
  const interior = page.getByRole("img", { name: "車內炮膛與彈藥架" });
  await expect(interior).toBeVisible();
  const motion = page.getByRole("button", { name: "鏡頭震動", exact: true });
  if ((await motion.getAttribute("aria-pressed")) === "true")
    await motion.click();
  await page.mouse.click(640, 360);

  // Sample only the work surface; HUD timers and training controls lie outside it.
  const frame = () =>
    page.screenshot({ clip: { x: 550, y: 330, width: 180, height: 130 } });
  for (const mode of ["裝填模式", "維修模式"]) {
    await expect(page.getByTestId("loader-mode")).toHaveText(mode);
    const center = await frame();
    for (const key of ["ArrowLeft", "ArrowRight"]) {
      await page.keyboard.down(key);
      await expect.poll(async () => !(await frame()).equals(center)).toBe(true);
      await page.keyboard.up(key);
      await expect.poll(async () => (await frame()).equals(center)).toBe(true);
    }
    if (mode === "裝填模式") {
      await page.keyboard.down("ArrowRight");
      await page.keyboard.down("r");
      await expect
        .poll(async () =>
          Number(await page.getByTestId("load-progress").textContent()),
        )
        .toBeGreaterThan(10);
      await page.keyboard.up("r");
      await page.keyboard.up("ArrowRight");
      await page.keyboard.press("Tab");
      await expect(page.getByTestId("loader-mode")).toHaveText("機槍模式");
      await page.keyboard.press("Tab");
    }
  }
});

test("窄視窗中維修讀數留在車內工作面的側邊", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 650 });
  await page.goto("/");
  await page.getByRole("button", { name: "單人練習", exact: true }).click();
  await page.getByRole("button", { name: "擔任裝填手", exact: true }).click();
  await page.getByRole("button", { name: "開始練習", exact: true }).click();
  await expect(page.getByTestId("loader-mode")).toHaveText("裝填模式");
  await page.mouse.click(360, 325);
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("loader-mode")).toHaveText("機槍模式");
  await page.keyboard.press("Tab");
  const panel = page.getByRole("region", { name: "車內維修" });
  await expect(panel).toBeInViewport({ ratio: 1 });
  const bounds = (await panel.boundingBox())!;
  expect(bounds.x).toBeGreaterThan(720 / 2);
});
