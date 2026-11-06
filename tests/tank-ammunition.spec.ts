import { test, expect } from "@playwright/test";
import { tankCrew } from "./tank-helpers";
test("裝填手選彈經連線同步，開裝後鎖定至發射且保留進度", async ({
  browser,
}) => {
  const c = await tankCrew(browser, "gunner");
  try {
    await c.loader.keyboard.press("2");
    await expect(c.gunner.getByTestId("selected-shell")).toHaveText("穿甲彈");
    await c.loader.keyboard.down("r");
    await expect
      .poll(async () =>
        Number(await c.loader.getByTestId("load-progress").textContent()),
      )
      .toBeGreaterThan(20);
    await c.loader.keyboard.up("r");
    await c.loader.waitForTimeout(200);
    const progress = await c.loader.getByTestId("load-progress").textContent();
    await c.loader.keyboard.press("1");
    await expect(c.gunner.getByTestId("chamber-shell")).toHaveText(
      "穿甲彈（已鎖定）",
    );
    await expect(c.loader.getByTestId("selected-shell")).toHaveText("穿甲彈");
    await expect(c.loader.getByTestId("load-progress")).toHaveText(progress!);
    await c.loader.keyboard.down("r");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    await c.loader.keyboard.press("1");
    await expect(c.gunner.getByTestId("chamber-shell")).toHaveText(
      "穿甲彈（已鎖定）",
    );
    await c.gunner.keyboard.press("Space");
    await c.gunner.keyboard.press("Space");
    await expect(c.gunner.getByTestId("shot-count")).toHaveText("1");
    await c.loader.keyboard.press("1");
    await expect(c.gunner.getByTestId("selected-shell")).toHaveText("高爆彈");
  } finally {
    await c.close();
  }
});

for (const [key, direct, adjacent] of [
  ["1", 100, 140],
  ["2", 20, 200],
] as const) {
  test(`${key === "1" ? "高爆範圍" : "穿甲直接高傷"}以真實靶標呈現`, async ({
    browser,
  }) => {
    const c = await tankCrew(browser);
    try {
      await c.loader.keyboard.press(key);
      await c.loader.keyboard.down("r");
      await expect(c.gunner.getByTestId("chamber-state")).toHaveText(
        "主炮就緒",
      );
      await c.loader.keyboard.up("r");
      await c.gunner.keyboard.press("Space");
      await expect(c.gunner.getByTestId("target-status")).toContainText(
        `正前靶 ${direct}/200`,
      );
      await expect(c.gunner.getByTestId("target-status")).toContainText(
        `鄰近靶 ${adjacent}/200`,
      );
      await c.gunner.screenshot({
        path: `/tmp/car-game-to-spec/visual17/${key === "1" ? "he" : "ap"}-impact.png`,
        fullPage: true,
      });
      await c.loader.screenshot({
        path: `/tmp/car-game-to-spec/visual17/${key === "1" ? "he" : "ap"}-loader.png`,
        fullPage: true,
      });
    } finally {
      await c.close();
    }
  });
}

test("近距高爆會傷靶而不傷共用坦克，仍可裝填下一發擊毀", async ({
  browser,
}) => {
  const c = await tankCrew(browser);
  try {
    await c.driver.keyboard.down("w");
    await c.driver.waitForTimeout(1650);
    await c.driver.keyboard.up("w");
    await expect(c.driver.getByTestId("tank-speed")).toHaveText("0.0", {
      timeout: 5000,
    });
    await c.loader.keyboard.down("r");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    await c.gunner.keyboard.press("Space");
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "正前靶 100/200",
    );
    for (const p of [c.driver, c.loader, c.gunner])
      await expect(p.getByTestId("tank-health")).toHaveText("100/100");
    await c.gunner.screenshot({
      path: "/tmp/car-game-to-spec/visual17/near-he.png",
      fullPage: true,
    });
    await c.loader.keyboard.down("r");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    await c.gunner.keyboard.press("Space");
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "正前靶 0/200 · 已擊毀",
    );
    await expect(c.gunner.getByTestId("shot-count")).toHaveText("2");
  } finally {
    await c.close();
  }
});
