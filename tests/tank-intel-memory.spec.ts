import { test, expect, type Page } from "@playwright/test";
import { aimAtHeading, tankCrew } from "./tank-helpers";

const evidence =
  process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/38";
const stale = (page: Page) =>
  page.locator('.navigation-enemy[data-observation="stale"]');

test("實際轉離後最後已知敵車停在原位、三方共用舊情報並約五秒淡出", async ({
  browser,
}) => {
  const c = await tankCrew(browser, "gunner");
  try {
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "四號 H 型 200/200",
    );
    await aimAtHeading(c.gunner, 180);
    await c.driver.keyboard.down("d");
    // Observe the actual loss of sight, rather than starting the expiry clock
    // after a longer hull turn has already aged the contact.
    await expect(stale(c.gunner)).toHaveCount(1, { timeout: 3500 });
    const lostAt = Date.now();
    await c.driver.keyboard.up("d");
    await expect
      .poll(
        async () =>
          Number(
            (await c.driver.getByTestId("hull-heading").textContent())!.replace(
              "°",
              "",
            ),
          ),
        { intervals: [25] },
      )
      .toBeGreaterThan(30);
    const position = await stale(c.gunner).evaluate((marker) => [
      marker.getAttribute("x"),
      marker.getAttribute("y"),
    ]);
    const opacity = Number(await stale(c.gunner).getAttribute("opacity"));
    for (const page of [c.driver, c.gunner, c.loader]) {
      await expect(stale(page)).toHaveCount(1);
      await expect(page.getByTestId("wave-status")).toContainText(
        "目前觀測敵車 0 · 舊情報 1",
      );
    }
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "四號 H 型 200/200 · 最後已知",
    );
    await expect(c.gunner.getByTestId("target-status")).not.toContainText(
      /接近中|轉砲瞄準|瞄準預告|重新裝填|最後位置射擊|搜尋中/,
    );
    await expect(c.gunner.getByTestId("enemy-warning")).toHaveText("");
    await expect(c.gunner.getByTestId("enemy-activity")).toHaveText("");
    await c.gunner.waitForTimeout(1500);
    expect(
      await stale(c.gunner).evaluate((marker) => [
        marker.getAttribute("x"),
        marker.getAttribute("y"),
      ]),
    ).toEqual(position);
    expect(Number(await stale(c.gunner).getAttribute("opacity"))).toBeLessThan(
      opacity - 0.2,
    );
    await c.driver.setViewportSize({ width: 1280, height: 720 });
    const bounds = (await c.driver
      .locator(".battle-navigation")
      .boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(480);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(720);
    await c.driver.screenshot({ path: `${evidence}/stale-driver-720.png` });
    await c.gunner.screenshot({ path: `${evidence}/stale-gunner-1440.png` });
    for (const page of [c.driver, c.gunner, c.loader])
      await expect(page.locator(".navigation-enemy")).toHaveCount(0, {
        timeout: 5000,
      });
    expect(Date.now() - lostAt).toBeGreaterThan(3800);
    expect(Date.now() - lostAt).toBeLessThan(6500);
    await expect(c.gunner.getByTestId("target-status")).toHaveText(
      "目前沒有觀測到敵車",
    );
  } finally {
    await c.close();
  }
});

test("真實煙幕的舊情報暫停超過五秒仍原位凍結，原職位重連續接並重新發現", async ({
  browser,
}) => {
  const c = await tankCrew(browser, "gunner");
  try {
    const panzer = c.gunner.locator(
      '.navigation-enemy[data-observation="current"][aria-label="觀測敵車 四號 H 型"]',
    );
    await expect(panzer).toHaveCount(1);
    const approaching = await panzer.evaluate((marker) => [
      marker.getAttribute("x"),
      marker.getAttribute("y"),
    ]);
    await c.loader.keyboard.press("3");
    await c.loader.keyboard.down("r");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    // Establish actual painted movement before hiding this same enemy.
    expect(
      await panzer.evaluate((marker) => [
        marker.getAttribute("x"),
        marker.getAttribute("y"),
      ]),
    ).not.toEqual(approaching);
    await c.loader.keyboard.up("r");
    await c.loader.keyboard.press("Tab");
    await c.loader.keyboard.down("c");
    await c.gunner.keyboard.press("Space");
    await expect(c.gunner.getByTestId("smoke-status")).toHaveText(
      "煙幕遮蔽視線",
    );
    await expect(stale(c.gunner)).toHaveCount(1);
    await c.driver.goto("about:blank");
    await expect(c.gunner.getByTestId("battle-pause")).toContainText(
      "等待駕駛",
    );
    // Pause notification can precede the host's final published snapshot.
    await c.gunner.waitForTimeout(300);
    const frozen = await stale(c.gunner).evaluate((marker) => [
      marker.getAttribute("x"),
      marker.getAttribute("y"),
      marker.getAttribute("opacity"),
    ]);
    const text = (await c.gunner.getByTestId("target-status").textContent())!;
    await expect(c.loader.getByTestId("mg-target-status")).toHaveText(text);
    await c.loader.keyboard.up("c");
    await c.gunner.waitForTimeout(6100);
    expect(
      await stale(c.gunner).evaluate((marker) => [
        marker.getAttribute("x"),
        marker.getAttribute("y"),
        marker.getAttribute("opacity"),
      ]),
    ).toEqual(frozen);
    expect(
      await stale(c.loader).evaluate((marker) => [
        marker.getAttribute("x"),
        marker.getAttribute("y"),
        marker.getAttribute("opacity"),
      ]),
    ).toEqual(frozen);
    await expect(c.gunner.getByTestId("target-status")).toHaveText(text);
    await expect(c.loader.getByTestId("mg-target-status")).toHaveText(text);
    await c.gunner.screenshot({
      path: `${evidence}/smoke-stale-paused-gunner.png`,
    });
    await c.loader.screenshot({
      path: `${evidence}/smoke-stale-paused-mg.png`,
    });
    // Observe the host at resume itself. Rejoining exterior asset preparation
    // can take several valid running seconds before the returned page is drawn.
    const rejoining = c.driver.goto("/");
    await expect(c.gunner.getByTestId("battle-pause")).toBeHidden();
    const resumedOpacity = Number(
      await stale(c.gunner).getAttribute("opacity"),
    );
    expect(resumedOpacity).toBeLessThanOrEqual(Number(frozen[2]));
    expect(resumedOpacity).toBeGreaterThan(Number(frozen[2]) - 0.15);
    await rejoining;
    await expect(
      c.driver.getByRole("heading", { name: "駕駛工作站" }),
    ).toBeVisible();
    for (const page of [c.driver, c.gunner, c.loader]) {
      await expect(page.getByTestId("battle-pause")).toBeHidden();
      await expect(stale(page)).toHaveCount(1);
    }
    await c.gunner.waitForTimeout(500);
    expect(
      await stale(c.driver).evaluate((marker) => [
        marker.getAttribute("x"),
        marker.getAttribute("y"),
      ]),
    ).toEqual(frozen.slice(0, 2));
    expect(Number(await stale(c.gunner).getAttribute("opacity"))).toBeLessThan(
      resumedOpacity,
    );
    await expect(c.gunner.locator(".navigation-enemy")).toHaveCount(0, {
      timeout: 5000,
    });
    await expect(c.gunner.getByTestId("target-status")).toHaveText(
      "目前沒有觀測到敵車",
    );
    await expect(c.gunner.getByTestId("smoke-status")).toHaveText("視線清晰", {
      timeout: 5000,
    });
    for (const page of [c.driver, c.gunner, c.loader])
      await expect(
        page.locator(
          '.navigation-enemy[data-observation="current"][aria-label="觀測敵車 四號 H 型"]',
        ),
      ).toHaveCount(1);
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "四號 H 型 200/200",
    );
    await expect(c.gunner.getByTestId("target-status")).not.toContainText(
      "最後已知",
    );
    expect(
      await panzer.evaluate((marker) => [
        marker.getAttribute("x"),
        marker.getAttribute("y"),
      ]),
    ).not.toEqual(frozen.slice(0, 2));
    await c.gunner.screenshot({
      path: `${evidence}/smoke-rediscovered-gunner.png`,
    });
  } finally {
    await c.close();
  }
});
