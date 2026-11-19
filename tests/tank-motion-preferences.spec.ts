import { expect, test, type Page } from "@playwright/test";

async function practice(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "單人練習", exact: true }).click();
  await page.getByRole("button", { name: "擔任砲手", exact: true }).click();
  await page.getByRole("button", { name: "開始練習", exact: true }).click();
  await expect(page.getByTestId("chamber-state")).toHaveText("主炮就緒");
  await page.getByRole("button", { name: "調整鏡頭強度" }).click();
}

test("原生強度設定保留焦點、各軸獨立，重新整理仍採用玩家選擇", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await practice(page);
  const master = page.getByRole("slider", { name: "整體強度" });
  const impact = page.getByRole("slider", { name: "瞬間衝擊" });
  const continuous = page.getByRole("slider", { name: "持續晃動" });
  for (const slider of [master, impact, continuous])
    await expect(slider).toHaveValue("100");
  await page.getByRole("button", { name: "減少持續晃動" }).click();
  await expect(continuous).toHaveValue("25");
  await impact.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await expect(impact).toBeFocused();
  await expect(impact).toHaveValue("5");
  await expect(master).toHaveValue("100");
  await expect(page.getByTestId("shot-count")).toHaveText("0");
  await expect(page.getByTestId("turret-heading")).toHaveText("0.0°");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await practice(page);
  await expect(impact).toHaveValue("5");
  await expect(continuous).toHaveValue("25");
});

test("減少動態效果首次進入使用低衝擊，持續晃動關閉", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await practice(page);
  await expect(page.getByRole("slider", { name: "瞬間衝擊" })).toHaveValue(
    "35",
  );
  await expect(page.getByRole("slider", { name: "持續晃動" })).toHaveValue("0");
});
