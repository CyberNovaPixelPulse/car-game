import { test, expect } from "@playwright/test";
import { tankCrew, aimAtHeading } from "./tank-helpers";

const evidence =
  process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/38/smoke";

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
    await expect(c.loader.getByTestId("loader-mode")).toHaveText("維修模式");
    await c.loader.keyboard.press("Tab");
    await c.loader.keyboard.down("r");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    await c.loader.keyboard.down("c");
    await c.gunner.keyboard.press("Space");
    await expect(c.gunner.getByTestId("flight-status")).toHaveText("砲彈命中");
    await expect(c.gunner.getByTestId("smoke-status")).toHaveText("視線清晰", {
      timeout: 10000,
    });
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
      "四號 H 型 200/200 · 最後已知",
    );
    await expect(c.loader.getByTestId("mg-target-status")).toContainText(
      "四號 H 型 200/200 · 最後已知",
    );
    for (const p of [c.driver, c.gunner, c.loader])
      await expect(
        p.locator('.navigation-enemy[data-observation="current"]'),
      ).toHaveCount(0);
    await expect(c.gunner.getByTestId("enemy-warning")).toHaveText("");
    await expect(c.gunner.getByTestId("enemy-activity")).toHaveText("");
    await c.gunner.screenshot({
      path: `${evidence}/smoke-gunner.png`,
    });
    await c.loader.screenshot({
      path: `${evidence}/smoke-mg.png`,
    });
    await c.driver.screenshot({
      path: `${evidence}/smoke-driver.png`,
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
      path: `${evidence}/cleared-gunner.png`,
    });
  } finally {
    await c.close();
  }
});

test("煙幕遮住四號情報，乘員移位逃離舊射線並在重見敵車後恢復交戰", async ({
  browser,
}) => {
  const c = await tankCrew(
    browser,
    "loader",
    0,
    1000,
    `${evidence}/search-video`,
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
        await aimAtHeading(c.gunner, 0);
      })(),
      (async () => {
        await c.driver.waitForTimeout(2000);
        await Promise.all([
          c.driver.keyboard.up("w"),
          c.loader.keyboard.up("a"),
        ]);
      })(),
    ]);
    await expect(c.driver.getByTestId("tank-speed")).toHaveText("0.0");
    await expect(
      c.gunner.locator(
        '.navigation-enemy[data-observation="current"][aria-label="觀測敵車 四號 H 型"]',
      ),
    ).toHaveCount(0);
    await c.loader.screenshot({
      path: `${evidence}/smoke-transfer-mg.png`,
    });
    // The MG may independently see the flanking Tiger. Hidden Panzer warnings
    // remain absent; moving out of its old shot lane preserves shared HP.
    await expect(c.gunner.getByTestId("enemy-warning")).not.toContainText(
      "四號 H 型",
    );
    for (const p of [c.gunner, c.driver, c.loader])
      await expect(p.getByTestId("tank-health")).toHaveText(health!);
    await c.gunner.screenshot({
      path: `${evidence}/smoke-search.png`,
    });
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "四號 H 型",
      { timeout: 7000 },
    );
    await expect(
      c.gunner.locator(
        '.navigation-enemy[data-observation="current"][aria-label="觀測敵車 四號 H 型"]',
      ),
    ).toHaveCount(1);
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
    `${evidence}/last-known-video`,
  );
  try {
    await c.loader.keyboard.press("3");
    await Promise.all([
      c.loader.keyboard.down("r"),
      c.driver.keyboard.down("d"),
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
      .toBeGreaterThanOrEqual(75);
    await c.driver.keyboard.up("d");
    await expect(c.gunner.getByTestId("turret-yaw-rate")).toHaveText("0.0°/s");
    const settledHull = async () => {
      let previousHeading = "",
        stableReadings = 0;
      await expect
        .poll(
          async () => {
            const heading = (await c.gunner
              .getByTestId("hull-heading")
              .textContent())!;
            stableReadings =
              heading === previousHeading ? stableReadings + 1 : 0;
            previousHeading = heading;
            return stableReadings;
          },
          { intervals: [100] },
        )
        .toBeGreaterThanOrEqual(3);
      return Number(previousHeading.replace("°", ""));
    };
    let actualHull = await settledHull();
    // The real driver corrects an observed coast/transport overshoot before
    // choosing the smoke shot; keep the original 85–100° setup requirement.
    for (
      let correction = 0;
      correction < 8 && (actualHull < 85 || actualHull > 100);
      correction++
    ) {
      const error = ((90 - actualHull + 540) % 360) - 180;
      await c.driver.keyboard.press(error > 0 ? "d" : "a", {
        delay: Math.min(500, Math.sqrt(Math.abs(error) / 80) * 1000),
      });
      actualHull = await settledHull();
    }
    expect(actualHull).toBeGreaterThanOrEqual(85);
    expect(actualHull).toBeLessThanOrEqual(100);
    await aimAtHeading(c.gunner, 0);
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
    await expect(c.gunner.getByTestId("enemy-warning")).not.toContainText(
      "四號 H 型",
    );
    await c.driver.waitForTimeout(1800);
    await c.driver.keyboard.up("w");
    await expect(c.driver.getByTestId("tank-speed")).toHaveText("0.0");
    await expect(
      c.gunner.locator(
        '.navigation-enemy[data-observation="current"][aria-label="觀測敵車 四號 H 型"]',
      ),
    ).toHaveCount(0);
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
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "四號 H 型 200/200 · 最後已知",
    );
    await fire();
    // The five-second memory may expire during this real flight/ejection. A
    // hidden AP hit must never expose the new20HP before sight returns.
    await expect(c.gunner.getByTestId("target-status")).not.toContainText(
      "四號 H 型 20/200",
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
      path: `${evidence}/after-through-smoke.png`,
    });
  } finally {
    await c.close();
  }
});
