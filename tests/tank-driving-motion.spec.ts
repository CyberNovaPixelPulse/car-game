import { expect, test } from "@playwright/test";

test("砲手可從視野感受 AI 駕駛起步，停車且關閉震動後回到基準瞄準方向", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "單人練習", exact: true }).click();
  await page.getByRole("button", { name: "擔任砲手", exact: true }).click();
  await page.getByRole("button", { name: "開始練習", exact: true }).click();
  await expect(page.getByTestId("chamber-state")).toHaveText("主炮就緒");
  const sight = page.locator(".sight");
  const displacement = () =>
    sight.evaluate((element) => {
      const mark = element.getBoundingClientRect();
      const viewport = element.parentElement!.getBoundingClientRect();
      return Math.abs(
        mark.top + mark.height / 2 - viewport.top - viewport.height / 2,
      );
    });
  await page.getByRole("button", { name: "開始交戰", exact: true }).click();
  await expect
    .poll(async () =>
      Number(await page.getByTestId("tank-speed").textContent()),
    )
    .toBeGreaterThan(0.5);
  await expect
    .poll(displacement, { intervals: [30, 50, 80] })
    .toBeGreaterThan(1);
  await expect(page.getByTestId("shot-count")).toHaveText("0");
  await page.getByRole("button", { name: "AI 停車", exact: true }).click();
  await expect(page.getByTestId("tank-speed")).toHaveText("0.0");
  await page.getByRole("button", { name: "鏡頭震動", exact: true }).click();
  await expect.poll(displacement).toBeLessThan(0.2);
  await expect(page.getByTestId("turret-pitch")).toHaveText("0.0°");
});
