import { test, expect } from "@playwright/test";

test.use({ actionTimeout: 10_000 });

test("原生練習控制保留鍵盤焦點，Space 收合面板而不開炮", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "單人練習", exact: true }).click();
  await page.getByRole("button", { name: "擔任砲手", exact: true }).click();
  await page.getByRole("button", { name: "開始練習", exact: true }).click();
  await expect(page.getByTestId("chamber-state")).toHaveText("主炮就緒");
  const select = page.getByLabel("AI 下一發彈種");
  await select.focus();
  await select.selectOption("he");
  await expect(select).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(select).toBeFocused();
  await expect(page.getByTestId("turret-heading")).toHaveText("0.0°");
  await page.locator(".practice-controls summary").focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".practice-controls")).not.toHaveAttribute("open");
  await expect(page.getByTestId("shot-count")).toHaveText("0");
});

test("情境教學可關閉，收合面板後仍可暫停與恢復", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "單人練習", exact: true }).click();
  await page.getByRole("button", { name: "擔任砲手", exact: true }).click();
  await page.getByRole("button", { name: "開始練習", exact: true }).click();
  await expect(page.getByTestId("practice-hint")).toContainText("方向鍵");
  await page.getByLabel("顯示情境教學").uncheck();
  await expect(page.getByTestId("practice-hint")).toBeHidden();
  await page.getByText("練習控制", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "AI 停車", exact: true }),
  ).toBeHidden();
  await page.getByRole("button", { name: "暫停練習", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "繼續練習", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "繼續練習", exact: true }).click();
  await page.getByText("練習控制", { exact: true }).click();
  await expect(
    page.getByRole("button", { name: "開始交戰", exact: true }),
  ).toBeVisible();
});

test("暫停換職保留部分裝填，AI 接手後完成而不重開戰況", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "單人練習", exact: true }).click();
  await page.getByRole("button", { name: "擔任裝填手", exact: true }).click();
  await page.getByRole("button", { name: "開始練習", exact: true }).click();
  await page.locator('canvas[aria-label="車內炮膛與彈藥架"]').click();
  await page.keyboard.down("r");
  await expect
    .poll(async () =>
      Number(await page.getByTestId("load-progress").textContent()),
    )
    .toBeGreaterThan(5);
  await page.getByRole("button", { name: "暫停練習", exact: true }).click();
  await page.keyboard.up("r");
  const progress = await page.getByTestId("load-progress").textContent();
  const shell = await page.getByTestId("chamber-shell").textContent();
  await page.getByRole("button", { name: "切換為砲手", exact: true }).click();
  await expect(page.locator(".battle-overview h2")).toBeVisible();
  await expect(page.getByTestId("load-progress")).toHaveText(progress!);
  await expect(page.getByTestId("chamber-shell")).toHaveText(shell!);
  await expect(page.getByTestId("tank-health")).toHaveText("100/100");
  await page.waitForTimeout(500);
  await expect(page.getByTestId("load-progress")).toHaveText(progress!);
  await page.getByRole("button", { name: "繼續練習", exact: true }).click();
  await expect(page.getByTestId("chamber-state")).toHaveText("主炮就緒");
  await page.locator("canvas").click();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("shot-count")).toHaveText("1");
});

test("AI 裝填手在真實受擊等待後停車維修", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "單人練習", exact: true }).click();
  await page.getByRole("button", { name: "擔任駕駛", exact: true }).click();
  await page.getByRole("button", { name: "開始練習", exact: true }).click();
  await page.getByRole("button", { name: "暫停 AI 開火", exact: true }).click();
  await page.getByRole("button", { name: "開始交戰", exact: true }).click();
  const hp = async () =>
    Number(
      (await page.getByTestId("tank-health").textContent())!.split("/")[0],
    );
  await expect.poll(hp, { timeout: 30_000 }).toBeLessThan(100);
  const damaged = await hp();
  await expect(page.getByTestId("ai-loader-status")).toContainText("維修");
  await expect.poll(hp).toBeGreaterThan(damaged + 1);
  await expect(page.getByTestId("ai-loader-status")).toContainText("維修");
  await expect(page.getByTestId("ai-gunner-status")).toContainText("暫停");
});

test("AI 駕駛接近交戰區且服從停車與恢復指令", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "單人練習", exact: true }).click();
  await page.getByRole("button", { name: "擔任砲手", exact: true }).click();
  await page.getByRole("button", { name: "開始練習", exact: true }).click();
  await page.getByRole("button", { name: "AI 停車", exact: true }).click();
  await page.getByRole("button", { name: "開始交戰", exact: true }).click();
  await expect(page.getByTestId("ai-driver-status")).toContainText(
    "依指令停車",
  );
  await expect(page.getByTestId("tank-speed")).toHaveText("0.0");
  await page.getByRole("button", { name: "恢復 AI 駕駛", exact: true }).click();
  await expect(page.getByTestId("tank-speed")).not.toHaveText("0.0");
  await page.getByRole("button", { name: "AI 停車", exact: true }).click();
  await expect(page.getByTestId("tank-speed")).toHaveText("0.0");
  await expect(page.getByTestId("ai-driver-status")).toContainText(
    "依指令停車",
  );
});

test("真人裝填後 AI 砲手先提醒再射擊，停火指令保留膛內砲彈", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = <T extends ArrayBufferView>(array: T): T => {
      if (array instanceof Uint32Array && array.length === 1) {
        array[0] = 1000;
        return array;
      }
      return original(array);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "單人練習", exact: true }).click();
  await page.getByRole("button", { name: "擔任裝填手", exact: true }).click();
  await page.getByRole("button", { name: "開始練習", exact: true }).click();
  await page.getByRole("button", { name: "暫停 AI 開火", exact: true }).click();
  await page.getByRole("button", { name: "開始交戰", exact: true }).click();
  await page.locator('canvas[aria-label="車內炮膛與彈藥架"]').click();
  await page.keyboard.down("r");
  await expect(page.getByTestId("chamber-state")).toHaveText("主炮就緒");
  await page.keyboard.up("r");
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("shot-count")).toHaveText("0");
  await page.getByRole("button", { name: "恢復 AI 開火", exact: true }).click();
  await expect(page.getByTestId("ai-gunner-status")).toContainText("即將開火");
  await page.locator('canvas[aria-label="車內炮膛與彈藥架"]').click();
  await page.keyboard.down("c");
  await expect(page.getByTestId("shot-count")).toHaveText("1");
  await expect(page.getByTestId("chamber-state")).toHaveText("空膛");
  await page.keyboard.up("c");
  await expect(page.getByTestId("loader-status")).not.toContainText("暈眩");
});

test("AI 裝填手供彈、避殼並把指定彈種留給下一發", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "單人練習", exact: true }).click();
  await page.getByRole("button", { name: "擔任砲手", exact: true }).click();
  await page.getByRole("button", { name: "開始練習", exact: true }).click();
  await expect(page.getByTestId("chamber-state")).toHaveText("主炮就緒");
  const first = await page.getByTestId("chamber-shell").textContent();
  await page.getByLabel("AI 下一發彈種").selectOption("smoke");
  await expect(page.getByTestId("chamber-shell")).toHaveText(first!);
  await page.locator("canvas").click();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("shot-count")).toHaveText("1");
  await expect(page.getByTestId("chamber-state")).toHaveText("主炮就緒");
  await expect(page.getByTestId("chamber-shell")).toHaveText(
    "煙霧彈（已鎖定）",
  );
  await expect(page.getByTestId("ai-loader-status")).not.toContainText("暈眩");
});

test("單人練習不連線即可駕駛、暫停並返回首頁", async ({ page }) => {
  const peers: string[] = [];
  page.on("websocket", (ws) => {
    if (new URL(ws.url()).pathname.includes("/peer")) peers.push(ws.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "單人練習", exact: true }).click();
  await page.getByRole("button", { name: "擔任駕駛", exact: true }).click();
  await page.getByRole("button", { name: "開始練習", exact: true }).click();
  await expect(page.getByRole("img", { name: "駕駛裝甲觀察窗" })).toBeVisible();
  await expect(page.getByTestId("practice-status")).toContainText("等待交戰");
  await page.locator("canvas").click();
  await page.keyboard.down("s");
  await expect(page.getByTestId("tank-speed")).toHaveText("10.8");
  await page.getByRole("button", { name: "暫停練習", exact: true }).click();
  const speed = await page.getByTestId("tank-speed").textContent();
  await page.waitForTimeout(600);
  await expect(page.getByTestId("tank-speed")).toHaveText(speed!);
  await page.keyboard.up("s");
  await page.getByRole("button", { name: "繼續練習", exact: true }).click();
  await expect(page.getByTestId("tank-speed")).toHaveText("0.0");
  await page.getByRole("button", { name: "離開練習", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "建立房間", exact: true }),
  ).toBeVisible();
  expect(peers).toEqual([]);
});

test("練習只在按下開始後產生單敵，重來回到無敵車與完整血量", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "單人練習", exact: true }).click();
  await page.getByRole("button", { name: "擔任砲手", exact: true }).click();
  await page.getByRole("button", { name: "開始練習", exact: true }).click();
  await expect(page.getByTestId("practice-status")).toContainText("等待交戰");
  await expect(page.getByTestId("target-status")).toContainText("沒有觀測");
  await page.getByRole("button", { name: "開始交戰", exact: true }).click();
  await expect(page.getByTestId("practice-status")).toContainText("第 1 輪");
  await expect(page.getByTestId("target-status")).toContainText(
    "四號 H 型 200/200",
  );
  await expect(
    page.getByRole("button", { name: "交戰中", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "暫停練習", exact: true }).click();
  await page.getByRole("button", { name: "重新開始練習", exact: true }).click();
  await expect(page.getByTestId("practice-status")).toContainText("等待交戰");
  await expect(page.getByTestId("tank-health")).toHaveText("100/100");
  await expect(page.getByTestId("target-status")).toContainText("沒有觀測");
});
