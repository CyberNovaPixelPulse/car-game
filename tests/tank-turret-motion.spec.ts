import { expect, test } from "@playwright/test";

test("車頂機槍連射時準星短促震動，停射回穩並可接續維修", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "單人練習", exact: true }).click();
  await page.getByRole("button", { name: "擔任裝填手", exact: true }).click();
  await page.getByRole("button", { name: "開始練習", exact: true }).click();
  await page.getByRole("img", { name: "車內炮膛與彈藥架" }).click();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("loader-mode")).toHaveText("機槍模式");

  const visibleSight = page.locator(".sight:visible");
  const offsets = () =>
    visibleSight.evaluate(
      (sight) =>
        new Promise<number[]>((resolve) => {
          const viewport = sight.parentElement!.getBoundingClientRect();
          const center = viewport.top + viewport.height / 2;
          const start = performance.now();
          const samples: number[] = [];
          function frame(now: number) {
            const box = sight.getBoundingClientRect();
            samples.push(Math.abs(box.top + box.height / 2 - center));
            if (now - start > 500) resolve(samples);
            else requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        }),
    );
  await page.keyboard.down("Space");
  const firing = await offsets();
  await page.keyboard.up("Space");
  await expect
    .poll(async () =>
      Number(await page.getByTestId("mg-shot-count").textContent()),
    )
    .toBeGreaterThan(1);
  const stopped = await offsets();
  expect(Math.max(...firing)).toBeGreaterThan(1.5);
  expect(stopped.at(-1)).toBeLessThan(1);
  const shots = await page.getByTestId("mg-shot-count").innerText();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("loader-mode")).toHaveText("維修模式");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("mg-shot-count")).toHaveText(shots);
});

test("砲塔啟動、反向與停止時準星跟隨真實砲管並回正", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "單人練習", exact: true }).click();
  await page.getByRole("button", { name: "擔任砲手", exact: true }).click();
  await page.getByRole("button", { name: "開始練習", exact: true }).click();
  await page.getByRole("img", { name: "主炮戰場視野" }).click();
  const horizontalOffset = () =>
    page.locator(".sight").evaluate((sight) => {
      const view = sight.parentElement!.getBoundingClientRect();
      const box = sight.getBoundingClientRect();
      return box.left + box.width / 2 - view.left - view.width / 2;
    });
  const sample = () =>
    expect.poll(horizontalOffset, { intervals: [20, 40, 60] });
  await page.keyboard.down("ArrowRight");
  await sample().toBeGreaterThan(2);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.down("ArrowLeft");
  await sample().toBeLessThan(-2);
  await page.keyboard.up("ArrowLeft");
  await expect
    .poll(async () => Math.abs(await horizontalOffset()))
    .toBeLessThan(0.5);
});
