import { test, expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

test.use({ actionTimeout: 10_000 });

async function practice(page: Page, role: string, seed = 1000) {
  await page.addInitScript((seed) => {
    const original = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = <T extends ArrayBufferView>(array: T): T => {
      if (array instanceof Uint32Array && array.length === 1) {
        array[0] = seed;
        return array;
      }
      return original(array);
    };
  }, seed);
  await page.goto("/");
  await page.getByRole("button", { name: "單人練習", exact: true }).click();
  await page.getByRole("button", { name: `擔任${role}`, exact: true }).click();
  await page.getByRole("button", { name: "開始練習", exact: true }).click();
  await expect(page.getByTestId("practice-status")).toContainText("等待交戰");
}

test("真人駕駛與兩位 AI 擊毀單敵後等待，下一輪沿用戰況", async ({ page }) => {
  await practice(page, "駕駛");
  await page.getByRole("button", { name: "開始交戰", exact: true }).click();
  await expect(page.getByTestId("practice-status")).toContainText(
    "目標已擊毀",
    { timeout: 30_000 },
  );
  const health = await page.getByTestId("tank-health").textContent();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("practice-status")).toContainText("第 1 輪");
  await expect(page.getByTestId("battle-result")).toBeHidden();
  await page.getByRole("button", { name: "下一輪", exact: true }).click();
  await expect(page.getByTestId("practice-status")).toContainText("第 2 輪");
  await expect(page.getByTestId("tank-health")).toHaveText(health!);
});

test("真人砲手用 AI 供彈完成兩發穿甲單敵練習", async ({ page }) => {
  await practice(page, "砲手");
  await page.getByRole("button", { name: "AI 停車", exact: true }).click();
  await page.getByRole("button", { name: "開始交戰", exact: true }).click();
  for (let shot = 1; shot <= 2; shot++) {
    await expect(page.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await page.locator("canvas").click();
    await page.keyboard.press("Space");
    await expect(page.getByTestId("shot-count")).toHaveText(String(shot));
  }
  await expect(page.getByTestId("practice-status")).toContainText("目標已擊毀");
  await expect(page.getByTestId("target-status")).toContainText("已擊毀");
});

test("真人裝填手完成供彈與避殼，AI 隊友擊毀普通敵車", async ({ page }) => {
  await practice(page, "裝填手");
  await page.getByRole("button", { name: "AI 停車", exact: true }).click();
  await page.getByRole("button", { name: "開始交戰", exact: true }).click();
  await page.locator('canvas[aria-label="車內炮膛與彈藥架"]').click();
  await page.keyboard.press("2");
  for (let shot = 1; shot <= 2; shot++) {
    await page.keyboard.down("r");
    await expect(page.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await page.keyboard.up("r");
    await expect(page.getByTestId("ai-fire-warning")).toBeVisible();
    await page.keyboard.down("c");
    await expect(page.getByTestId("shot-count")).toHaveText(String(shot));
    await expect(page.getByTestId("chamber-state")).toHaveText("空膛");
    await page.keyboard.up("c");
  }
  await expect(page.getByTestId("practice-status")).toContainText("目標已擊毀");
  await expect(page.getByTestId("loader-status")).not.toContainText("暈眩");
});

test("機槍熱度與工作模式在暫停往返換職時保留", async ({ page }) => {
  await practice(page, "裝填手");
  await page.locator('canvas[aria-label="車內炮膛與彈藥架"]').click();
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("loader-mode")).toHaveText("機槍模式");
  await page.keyboard.down("Space");
  await expect
    .poll(async () => Number(await page.getByTestId("mg-heat").textContent()))
    .toBeGreaterThan(10);
  await page.getByRole("button", { name: "暫停練習", exact: true }).click();
  await page.keyboard.up("Space");
  const heat = await page.getByTestId("mg-heat").textContent();
  await page.getByRole("button", { name: "切換為駕駛", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "練習暫停" })).toBeVisible();
  await page.getByRole("button", { name: "切換為裝填手", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "練習暫停" })).toBeVisible();
  await expect(page.locator('[data-testid="loader-mode"]')).toHaveText(
    "機槍模式",
  );
  await expect(page.locator('[data-testid="mg-heat"]')).toHaveText(heat!);
  await page.getByRole("button", { name: "繼續練習", exact: true }).click();
  await expect
    .poll(async () => Number(await page.getByTestId("mg-heat").textContent()))
    .toBeLessThan(Number(heat));
});

test("煙霧彈遮住 AI 砲手後不繼續射擊，教學與面板關閉仍保留開火提醒", async ({
  page,
}) => {
  await practice(page, "裝填手");
  await page.getByRole("button", { name: "AI 停車", exact: true }).click();
  await page.getByRole("button", { name: "開始交戰", exact: true }).click();
  await page.locator('canvas[aria-label="車內炮膛與彈藥架"]').click();
  await page.keyboard.press("3");
  await page.keyboard.down("r");
  await expect(page.getByTestId("chamber-state")).toHaveText("主炮就緒");
  await page.keyboard.up("r");
  await page.keyboard.down("c");
  await expect(page.getByTestId("shot-count")).toHaveText("1");
  await expect(page.getByTestId("chamber-state")).toHaveText("空膛");
  await page.keyboard.up("c");
  await page.keyboard.press("2");
  await page.keyboard.down("r");
  await expect(page.getByTestId("chamber-state")).toHaveText("主炮就緒");
  await page.keyboard.up("r");
  await expect(page.getByTestId("ai-gunner-status")).toHaveText("搜尋可見敵車");
  await page.waitForTimeout(1000);
  await expect(page.getByTestId("shot-count")).toHaveText("1");
  await page.getByLabel("顯示情境教學").uncheck();
  await page.getByText("練習控制", { exact: true }).click();
  await expect(page.getByTestId("ai-fire-warning")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("practice-hint")).toBeHidden();
});

test("練習中真實 HP0 失敗後可以完整重來", async ({ page }) => {
  test.setTimeout(240_000);
  await practice(page, "裝填手");
  await page.getByRole("button", { name: "AI 停車", exact: true }).click();
  await page.getByRole("button", { name: "暫停 AI 開火", exact: true }).click();
  await page.getByRole("button", { name: "開始交戰", exact: true }).click();
  await expect(page.getByTestId("battle-result")).toHaveText("戰鬥失敗", {
    timeout: 220_000,
  });
  await expect(page.getByTestId("tank-health")).toHaveText("0/100");
  await page.getByRole("button", { name: "重新開始練習", exact: true }).click();
  await expect(page.getByTestId("practice-status")).toContainText("等待交戰");
  await expect(page.getByTestId("tank-health")).toHaveText("100/100");
  await expect(page.getByTestId("shot-count")).toHaveText("0");
  await expect(page.getByTestId("load-progress")).toHaveText("0");
});

test("單人三職與裝填三模式在兩種桌機尺寸及全螢幕可操作", async ({ page }) => {
  test.setTimeout(120_000);
  const out =
    process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-practice-tests/visual";
  await mkdir(out, { recursive: true });
  for (const size of [
    { width: 1280, height: 720 },
    { width: 1440, height: 1050 },
  ]) {
    await page.setViewportSize(size);
    for (const role of ["駕駛", "砲手", "裝填手"]) {
      await practice(page, role);
      for (const mode of role === "裝填手"
        ? ["裝填", "機槍", "維修"]
        : [role]) {
        if (role === "裝填手" && mode !== "裝填") {
          await page
            .locator(".battle-station")
            .click({ position: { x: 500, y: 300 } });
          await page.keyboard.press("Tab");
          await expect(page.getByTestId("loader-mode")).toHaveText(
            `${mode}模式`,
          );
        }
        for (const full of [false, true]) {
          if (full)
            await page
              .getByRole("button", { name: "進入全螢幕", exact: true })
              .click();
          for (const control of [
            page.getByTestId("tank-health"),
            page.getByTestId("tank-speed"),
            page.getByRole("button", { name: "暫停練習", exact: true }),
            page.getByRole("button", { name: "離開練習", exact: true }),
          ])
            await expect(control).toBeInViewport({ ratio: 1 });
          await page.screenshot({
            path: `${out}/${size.width}-${mode}-${full ? "fullscreen" : "page"}.png`,
          });
          if (full) {
            await expect
              .poll(() => page.evaluate(() => !!document.fullscreenElement))
              .toBe(true);
            await page
              .getByRole("button", { name: "退出全螢幕", exact: true })
              .click();
          }
        }
      }
    }
  }
});
