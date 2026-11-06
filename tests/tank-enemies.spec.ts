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
    await expect(c.gunner.getByTestId("enemy-warning")).toBeInViewport();
    await c.gunner.screenshot({
      path: "/tmp/car-game-to-spec/visual21/enemy-warning.png",
      fullPage: false,
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
    await c.driver.screenshot({
      path: "/tmp/car-game-to-spec/visual21/defeat-driver.png",
      fullPage: true,
    });
    await c.gunner.screenshot({
      path: "/tmp/car-game-to-spec/visual21/defeat-gunner.png",
      fullPage: true,
    });
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
      await c.loader.keyboard.press(key);
      for (const hp of [remaining, 0]) {
        await c.loader.keyboard.down("r");
        await expect(c.gunner.getByTestId("chamber-state")).toHaveText(
          "主炮就緒",
        );
        await c.loader.keyboard.up("r");
        const beforeAttack = await c.gunner
          .getByTestId("tank-health")
          .textContent();
        await expect(c.gunner.getByTestId("tank-health")).not.toHaveText(
          beforeAttack!,
          { timeout: 20000 },
        );
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

test("擊毀近處四號後，乘員利用石牆遮蔽虎式且己方炮火不能穿牆", async ({
  browser,
}) => {
  const c = await tankCrew(browser);
  try {
    // Clear the nearby tank through ordinary play before seeking cover from
    // the farther Tiger; a Panzer already around a wall is not protected LOS.
    await c.loader.keyboard.press("2");
    for (const remaining of [20, 0]) {
      await c.loader.keyboard.down("r");
      await expect(c.gunner.getByTestId("chamber-state")).toHaveText(
        "主炮就緒",
      );
      await c.loader.keyboard.up("r");
      await c.loader.keyboard.down("c");
      await c.gunner.keyboard.press("Space");
      await expect(c.gunner.getByTestId("target-status")).toContainText(
        `四號 H 型 ${remaining}/200`,
      );
      await expect(c.loader.getByTestId("chamber-state")).toHaveText("空膛");
      await c.loader.keyboard.up("c");
    }
    // Driver follows the gunner's spoken heading/instrument instructions; no world-state access.
    await c.loader.keyboard.down("r");
    await c.driver.keyboard.down("s");
    await new Promise((resolve) => setTimeout(resolve, 8000));
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
      .toBeGreaterThanOrEqual(65);
    await c.driver.keyboard.up("d");
    await new Promise((resolve) => setTimeout(resolve, 600));
    const heading = async () =>
      Number(
        (await c.gunner.getByTestId("hull-heading").textContent())!.replace(
          "°",
          "",
        ),
      );
    // The gunner gives visible heading corrections. Braking/coasting and network
    // delivery can overshoot a fixed held duration; do not assume a 90° turn.
    for (let correction = 0; correction < 8; correction++) {
      const error = 90 - (await heading());
      if (Math.abs(error) <= 2) break;
      const key = error > 0 ? "d" : "a";
      const duration = Math.max(
        50,
        Math.min(260, Math.sqrt(Math.abs(error)) * 80),
      );
      await c.driver.keyboard.down(key);
      await new Promise((resolve) => setTimeout(resolve, duration));
      await c.driver.keyboard.up(key);
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    expect(await heading()).toBeGreaterThanOrEqual(88);
    expect(await heading()).toBeLessThanOrEqual(92);
    console.log("cover settled visible heading", await heading());
    await c.driver.keyboard.down("w");
    for (let i = 0; i < 5; i++) await c.gunner.keyboard.press("a");
    await new Promise((resolve) => setTimeout(resolve, 2600));
    await c.driver.keyboard.up("w");
    await expect(c.driver.getByTestId("tank-speed")).toHaveText("0.0");
    await expect(c.gunner.getByTestId("turret-yaw-rate")).toHaveText("0.0°/s");
    console.log(
      "cover firing visible pose",
      await c.gunner.getByTestId("hull-heading").textContent(),
      await c.gunner.getByTestId("turret-heading").textContent(),
      await c.driver.getByTestId("tank-contact").textContent(),
    );
    const coverStarted = Date.now();
    const health = await c.gunner.getByTestId("tank-health").textContent();
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    await c.loader.keyboard.down("c");
    await c.gunner.keyboard.press("Space");
    await expect(c.gunner.getByTestId("flight-status")).toHaveText("砲彈命中");
    // The four-second observation starts at the public HP baseline. A slow
    // screenshot must not extend it into the enemy's legitimate later flank.
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, 4000 - (Date.now() - coverStarted))),
    );
    console.log("cover sample elapsed", Date.now() - coverStarted);
    await Promise.all(
      [c.gunner, c.loader, c.driver].map((p) =>
        expect(p.getByTestId("tank-health")).toHaveText(health!),
      ),
    );
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "四號 H 型 0/200",
    );
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "虎式 I 型 360/360",
    );
    await c.gunner.screenshot({
      path: "/tmp/car-game-to-spec/visual21/cover.png",
      fullPage: true,
    });
    // Cover delays the enemy; its normal flank must eventually expose this position.
    await expect(c.gunner.getByTestId("enemy-warning")).toContainText("瞄準", {
      timeout: 20000,
    });
    await expect(c.gunner.getByTestId("tank-health")).not.toHaveText(health!, {
      timeout: 20000,
    });
    await c.gunner.screenshot({
      path: "/tmp/car-game-to-spec/visual21/cover-flanked.png",
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
    for (let i = 0; i < 3; i++) await c.gunner.keyboard.press("a");
    await expect
      .poll(async () =>
        Number(
          (await c.gunner.getByTestId("turret-heading").textContent())!.replace(
            "°",
            "",
          ),
        ),
      )
      .toBeGreaterThan(300);
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

test("敵彈先扣血後，裝填手機槍會實傷敵車並保留己方血量與虎式上限", async ({
  browser,
}) => {
  const c = await tankCrew(browser, "gunner");
  try {
    await expect(c.gunner.getByTestId("tank-health")).not.toHaveText(
      "100/100",
      { timeout: 20000 },
    );
    const health = await c.gunner.getByTestId("tank-health").textContent();
    await c.loader.keyboard.press("Tab");
    await c.loader.keyboard.down("Space");
    await expect
      .poll(async () =>
        Number(await c.loader.getByTestId("mg-shot-count").textContent()),
      )
      .toBeGreaterThanOrEqual(12);
    await c.loader.keyboard.up("Space");
    await expect(c.loader.getByTestId("mg-target-status")).toContainText(
      "虎式 I 型 360/360",
    );
    await expect
      .poll(async () => {
        const text = await c.loader
          .getByTestId("mg-target-status")
          .textContent();
        return Number(text!.match(/四號 H 型 (\d+)\/200/)?.[1]);
      })
      .toBeLessThan(195);
    for (const p of [c.gunner, c.loader, c.driver])
      await expect(p.getByTestId("tank-health")).toHaveText(health!);
    await c.loader.screenshot({
      path: "/tmp/car-game-to-spec/visual21/mg-enemy-damage.png",
      fullPage: true,
    });
  } finally {
    await c.close();
  }
});
