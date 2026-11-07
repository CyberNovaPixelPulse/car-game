import { test, expect } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

test("煙霧彈沿用三彈選擇、開裝鎖定與安全退殼後可再裝其他彈", async ({
  browser,
}) => {
  const c = await tankCrew(browser, "gunner");
  try {
    await c.loader.keyboard.press("3");
    await expect(c.loader.getByTestId("selected-shell")).toHaveText("煙霧彈");
    await c.loader.keyboard.down("r");
    await expect(c.loader.getByTestId("load-progress")).not.toHaveText("0");
    await c.loader.keyboard.up("r");
    await c.loader.keyboard.press("1");
    await expect(c.loader.getByTestId("chamber-shell")).toHaveText(
      "煙霧彈（已鎖定）",
    );
    await c.loader.keyboard.press("Tab");
    await c.loader.keyboard.press("2");
    await expect(c.loader.getByTestId("selected-shell")).toHaveText("煙霧彈");
    await c.loader.keyboard.press("Tab");
    await c.loader.keyboard.down("r");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    await c.loader.keyboard.down("c");
    await c.gunner.keyboard.press("Space");
    await expect(c.gunner.getByTestId("flight-status")).toHaveText("砲彈命中");
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "四號 H 型 200/200",
    );
    await expect(c.loader.getByTestId("chamber-state")).toHaveText("空膛");
    await c.loader.keyboard.up("c");
    await c.loader.keyboard.press("2");
    await c.loader.keyboard.down("r");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await expect(c.gunner.getByTestId("chamber-shell")).toHaveText(
      "穿甲彈（已鎖定）",
    );
  } finally {
    await c.close();
  }
});

test("煙幕在命中處同步遮住主炮與機槍視線並於約八秒遊戲時間消散", async ({
  browser,
}) => {
  const c = await tankCrew(browser);
  try {
    await c.loader.keyboard.press("3");
    await c.loader.keyboard.down("r");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    await c.loader.keyboard.press("Tab");
    await c.loader.keyboard.down("c");
    const firedAt = Date.now();
    await c.gunner.keyboard.press("Space");
    await expect(c.gunner.getByTestId("smoke-status")).toHaveText(
      "煙幕遮蔽視線",
    );
    await expect(c.loader.getByTestId("smoke-status")).toHaveText(
      "煙幕遮蔽視線",
    );
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "煙幕遮蔽，無法辨認敵車",
    );
    await expect(c.loader.getByTestId("mg-target-status")).toContainText(
      "煙幕遮蔽，無法辨認敵車",
    );
    await c.gunner.screenshot({
      path: "/tmp/car-game-to-spec/visual27-final/regression/visual22/smoke-gunner.png",
    });
    await c.loader.screenshot({
      path: "/tmp/car-game-to-spec/visual27-final/regression/visual22/smoke-mg.png",
    });
    await c.driver.screenshot({
      path: "/tmp/car-game-to-spec/visual27-final/regression/visual22/smoke-driver.png",
    });
    await expect(c.gunner.getByTestId("smoke-status")).toHaveText("視線清晰", {
      timeout: 10000,
    });
    expect(Date.now() - firedAt).toBeGreaterThanOrEqual(7500);
    expect(Date.now() - firedAt).toBeLessThan(11000);
    await expect(c.loader.getByTestId("smoke-status")).toHaveText("視線清晰");
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "四號 H 型 200/200",
    );
    await c.gunner.screenshot({
      path: "/tmp/car-game-to-spec/visual27-final/regression/visual22/cleared-gunner.png",
    });
  } finally {
    await c.close();
  }
});

test("煙幕讓敵車短暫射最後已見位置後搜尋，乘員可移位逃離舊射線", async ({
  browser,
}) => {
  const c = await tankCrew(
    browser,
    "loader",
    0,
    1000,
    "/tmp/car-game-to-spec/visual27-final/regression/visual22/search-video",
  );
  try {
    await c.loader.keyboard.press("3");
    await c.loader.keyboard.down("r");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    await expect(c.gunner.getByTestId("tank-health")).not.toHaveText(
      "100/100",
      { timeout: 20000 },
    );
    const health = await c.gunner.getByTestId("tank-health").textContent();
    await c.loader.keyboard.down("c");
    await c.gunner.keyboard.press("Space");
    await expect(c.gunner.getByTestId("smoke-status")).toHaveText(
      "煙幕遮蔽視線",
    );
    await expect(c.loader.getByTestId("chamber-state")).toHaveText("空膛");
    await c.loader.keyboard.up("c");
    // Actual driver instruments + gunner heading guide a diagonal displacement.
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
      .toBeGreaterThan(35);
    await c.driver.keyboard.up("d");
    await c.loader.keyboard.press("Tab");
    await Promise.all([
      c.loader.keyboard.down("a"),
      c.driver.keyboard.down("w"),
    ]);
    await expect(c.driver.getByTestId("tank-speed")).not.toHaveText("0.0");
    await Promise.all([
      (async () => {
        for (let i = 0; i < 5; i++) await c.gunner.keyboard.press("a");
      })(),
      c.driver.waitForTimeout(2000),
    ]);
    await Promise.all([c.driver.keyboard.up("w"), c.loader.keyboard.up("a")]);
    await expect(c.driver.getByTestId("tank-speed")).toHaveText("0.0");
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "煙幕遮蔽",
    );
    await c.loader.screenshot({
      path: "/tmp/car-game-to-spec/visual27-final/regression/visual22/smoke-transfer-mg.png",
    });
    // This public combat feedback contains phase only, never hidden coordinates/HP.
    await expect(c.gunner.getByTestId("enemy-activity")).toContainText("搜尋", {
      timeout: 3000,
    });
    for (const p of [c.gunner, c.driver, c.loader])
      await expect(p.getByTestId("tank-health")).toHaveText(health!);
    await c.gunner.screenshot({
      path: "/tmp/car-game-to-spec/visual27-final/regression/visual22/smoke-search.png",
    });
    await expect(c.gunner.getByTestId("target-status")).not.toContainText(
      "煙幕遮蔽",
      { timeout: 7000 },
    );
    await expect(c.gunner.getByTestId("enemy-warning")).toContainText("瞄準", {
      timeout: 10000,
    });
    await expect(c.gunner.getByTestId("tank-health")).not.toHaveText(health!, {
      timeout: 8000,
    });
  } finally {
    await c.close();
  }
});

test("敵車已預告時放煙，仍射向最後已見點，側移後不再精準追蹤", async ({
  browser,
}) => {
  const c = await tankCrew(
    browser,
    "loader",
    0,
    1000,
    "/tmp/car-game-to-spec/visual27-final/regression/visual22/last-known-video",
  );
  try {
    await c.loader.keyboard.press("3");
    await Promise.all([
      c.loader.keyboard.down("r"),
      c.driver.keyboard.down("d"),
      (async () => {
        for (let i = 0; i < 5; i++) await c.gunner.keyboard.press("a");
      })(),
    ]);
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
    await expect(c.gunner.getByTestId("turret-yaw-rate")).toHaveText("0.0°/s");
    let previousHeading = "",
      stableReadings = 0;
    await expect
      .poll(
        async () => {
          const heading = (await c.gunner
            .getByTestId("hull-heading")
            .textContent())!;
          stableReadings = heading === previousHeading ? stableReadings + 1 : 0;
          previousHeading = heading;
          return stableReadings;
        },
        { intervals: [100] },
      )
      .toBeGreaterThanOrEqual(3);
    const actualHull = Number(previousHeading.replace("°", ""));
    expect(actualHull).toBeGreaterThanOrEqual(85);
    expect(actualHull).toBeLessThanOrEqual(100);
    const actualGun = Number(
      (await c.gunner.getByTestId("turret-heading").textContent())!.replace(
        "°",
        "",
      ),
    );
    expect(Math.min(actualGun, 360 - actualGun)).toBeLessThan(6);
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    // The second real exterior observer watches the old shot lane to the west
    // while the driver will move east. Its recording can show the actual shell.
    await c.loader.keyboard.press("Tab");
    await c.loader.keyboard.down("a");
    await expect
      .poll(
        async () => {
          const heading = Number(
            (await c.loader.getByTestId("mg-heading").textContent())!.replace(
              "°",
              "",
            ),
          );
          return heading >= 265 && heading <= 280;
        },
        { intervals: [16] },
      )
      .toBe(true);
    await c.loader.keyboard.up("a");
    await expect(c.gunner.getByTestId("enemy-warning")).toContainText(
      "四號 H 型",
      { timeout: 16000 },
    );
    await c.loader.keyboard.down("c");
    await Promise.all([
      c.gunner.keyboard.press("Space"),
      c.driver.keyboard.down("w"),
    ]);
    await expect(c.gunner.getByTestId("smoke-status")).toHaveText(
      "煙幕遮蔽視線",
    );
    await expect(c.gunner.getByTestId("enemy-activity")).toContainText(
      "最後已見位置",
    );
    await c.driver.waitForTimeout(1800);
    await c.driver.keyboard.up("w");
    await expect(c.driver.getByTestId("tank-speed")).toHaveText("0.0");
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "煙幕遮蔽",
    );
    await expect(c.gunner.getByTestId("enemy-activity")).toContainText("搜尋", {
      timeout: 2000,
    });
    for (const p of [c.driver, c.loader, c.gunner])
      await expect(p.getByTestId("tank-health")).toHaveText("100/100");
  } finally {
    await c.close();
  }
});

test("砲彈正常穿過煙幕命中敵車，煙後穿甲與高爆傷害仍可交戰", async ({
  browser,
}) => {
  const c = await tankCrew(browser);
  async function load(key: string) {
    await c.loader.keyboard.press(key);
    await c.loader.keyboard.down("r");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    await c.loader.keyboard.down("c");
  }
  async function fire() {
    await c.gunner.keyboard.press("Space");
    await expect(c.gunner.getByTestId("flight-status")).toHaveText("砲彈命中");
    await expect(c.loader.getByTestId("chamber-state")).toHaveText("空膛");
    await c.loader.keyboard.up("c");
  }
  try {
    await load("3");
    await fire();
    await expect(c.gunner.getByTestId("smoke-status")).toHaveText(
      "煙幕遮蔽視線",
    );
    await load("2");
    await expect(c.gunner.getByTestId("smoke-status")).toHaveText(
      "煙幕遮蔽視線",
    );
    await fire();
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "煙幕遮蔽",
    );
    await expect(c.gunner.getByTestId("shot-count")).toHaveText("2");
    await expect(c.gunner.getByTestId("smoke-status")).toHaveText("視線清晰", {
      timeout: 10000,
    });
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "四號 H 型 20/200",
    );
    await load("1");
    await fire();
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "四號 H 型 0/200",
    );
    await c.gunner.screenshot({
      path: "/tmp/car-game-to-spec/visual27-final/regression/visual22/after-through-smoke.png",
    });
  } finally {
    await c.close();
  }
});
