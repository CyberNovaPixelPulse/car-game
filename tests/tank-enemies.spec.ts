import { test, expect } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

test("敵車接近並預告開火，敵彈扣除三人共用血量直至一致失敗", async ({
  browser,
}) => {
  const c = await tankCrew(browser);
  try {
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "四號 H 型",
    );
    await expect(c.gunner.getByTestId("enemy-warning")).toContainText("瞄準", {
      timeout: 20000,
    });
    await expect(c.gunner.getByTestId("tank-health")).not.toHaveText(
      "100/100",
      { timeout: 20000 },
    );
    const health = await c.gunner.getByTestId("tank-health").textContent();
    for (const page of [c.driver, c.loader])
      await expect(page.getByTestId("tank-health")).toHaveText(health!);
    for (const page of [c.driver, c.loader, c.gunner]) {
      await expect(page.getByTestId("damage-warning")).toContainText("命中");
      await expect(page.getByRole("heading", { name: "戰鬥失敗" })).toBeVisible(
        { timeout: 70000 },
      );
      await expect(page.getByTestId("tank-health")).toHaveText("0/100");
    }
  } finally {
    await c.close();
  }
});

for (const [key, remaining] of [
  ["1", 100],
  ["2", 20],
] as const) {
  test(`${key === "1" ? "高爆" : "穿甲"}能擊毀四號，敵彈已扣血後己方主炮仍不自傷`, async ({
    browser,
  }) => {
    const c = await tankCrew(browser);
    try {
      await expect(c.gunner.getByTestId("tank-health")).not.toHaveText(
        "100/100",
        { timeout: 20000 },
      );
      await c.loader.keyboard.press(key);
      for (const hp of [remaining, 0]) {
        await c.loader.keyboard.down("r");
        await expect(c.gunner.getByTestId("chamber-state")).toHaveText(
          "主炮就緒",
        );
        await c.loader.keyboard.up("r");
        const before = await c.gunner.getByTestId("tank-health").textContent();
        await c.loader.keyboard.down("c");
        await c.gunner.keyboard.press("Space");
        await expect(c.gunner.getByTestId("target-status")).toContainText(
          `四號 H 型 ${hp}/200`,
        );
        for (const p of [c.driver, c.loader, c.gunner])
          await expect(p.getByTestId("tank-health")).toHaveText(before!);
        await expect(c.loader.getByTestId("chamber-state")).toHaveText("空膛");
        await c.loader.keyboard.up("c");
      }
      await expect(c.gunner.getByTestId("target-status")).toContainText(
        "已擊毀",
      );
      await expect(c.gunner.getByTestId("target-status")).toContainText(
        "虎式 I 型 360/360",
      );
    } finally {
      await c.close();
    }
  });
}

test("乘員可繞到固定石牆後擋住敵火，己方炮火也不能穿牆傷敵", async ({
  browser,
}) => {
  const c = await tankCrew(browser);
  try {
    // Driver follows the gunner's spoken heading/instrument instructions; no world-state access.
    await c.loader.keyboard.down("r");
    await c.driver.keyboard.down("s");
    await c.driver.waitForTimeout(8000);
    await c.driver.keyboard.up("s");
    await expect(c.driver.getByTestId("tank-speed")).toHaveText("0.0");
    await c.driver.keyboard.down("d");
    await expect
      .poll(
        async () =>
          Number(
            (await c.gunner.getByTestId("hull-heading").textContent())!.replace(
              "°",
              "",
            ),
          ),
        { intervals: [16] },
      )
      .toBeGreaterThanOrEqual(81);
    await c.driver.keyboard.up("d");
    await c.driver.waitForTimeout(500);
    await c.driver.keyboard.down("w");
    for (let i = 0; i < 5; i++) await c.gunner.keyboard.press("a");
    await c.driver.waitForTimeout(2600);
    await c.driver.keyboard.up("w");
    await expect(c.driver.getByTestId("tank-speed")).toHaveText("0.0");
    await expect(c.gunner.getByTestId("turret-yaw-rate")).toHaveText("0.0°/s");
    const health = await c.gunner.getByTestId("tank-health").textContent();
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    await c.loader.keyboard.down("c");
    await c.gunner.keyboard.press("Space");
    await expect(c.gunner.getByTestId("flight-status")).toHaveText("砲彈命中");
    await c.gunner.screenshot({path:"/tmp/car-game-to-spec/visual21/cover-fire.png",fullPage:true});
    await c.gunner.waitForTimeout(4000);
    for (const p of [c.gunner, c.loader, c.driver])
      await expect(p.getByTestId("tank-health")).toHaveText(health!);
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "四號 H 型 200/200",
    );
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "虎式 I 型 360/360",
    );
    await c.gunner.screenshot({
      path: "/tmp/car-game-to-spec/visual21/cover.png",
      fullPage: true,
    });
  } finally {
    await c.close();
  }
});

test("虎式繞過前牆接近，重裝耐打且可用兩發穿甲擊毀", async ({ browser }) => {
  const c = await tankCrew(browser);
  async function shot(key: string) {
    await c.loader.keyboard.press(key);
    await c.loader.keyboard.down("r");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    await c.loader.keyboard.down("c");
    await c.gunner.keyboard.press("Space");
    await expect(c.loader.getByTestId("chamber-state")).toHaveText("空膛");
    await c.loader.keyboard.up("c");
  }
  try {
    await shot("1");
    await shot("1");
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "四號 H 型 0/200",
    );
    await c.gunner.waitForTimeout(23000);
    for (let i = 0; i < 3; i++) await c.gunner.keyboard.press("d");
    await expect(c.gunner.getByTestId("turret-yaw-rate")).toHaveText("0.0°/s");
    await c.gunner.screenshot({
      path: "/tmp/car-game-to-spec/visual21/tiger-approach.png",
      fullPage: true,
    });
    await shot("2");
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "虎式 I 型 180/360",
    );
    await shot("2");
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "虎式 I 型 0/360 · 已擊毀",
    );
    await expect(c.gunner.getByTestId("battle-result")).toBeHidden();
    await c.gunner.screenshot({
      path: "/tmp/car-game-to-spec/visual21/tiger-wreck.png",
      fullPage: true,
    });
  } finally {
    await c.close();
  }
});
