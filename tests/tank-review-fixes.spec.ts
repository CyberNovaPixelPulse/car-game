import { test, expect } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

test("結算期間離線的非房主釋放席位，同房正常重新加入換職再戰", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const c = await tankCrew(browser);
  try {
    for (const page of [c.loader, c.driver, c.gunner]) {
      await expect(
        page.getByRole("heading", { name: "戰鬥失敗", exact: true }),
      ).toBeVisible({ timeout: 120000 });
      await expect(page.getByTestId("tank-health")).toHaveText("0/100");
    }
    await c.gunner.goto("about:blank");
    // Real transport heartbeat expiry; results have no disconnected-member indicator.
    await c.loader.waitForTimeout(10000);
    await c.loader
      .getByRole("button", { name: "回到房間", exact: true })
      .click();
    await expect(c.loader.getByTestId("crew-list").locator("li")).toHaveCount(
      2,
    );
    await c.gunner.goto("/");
    await c.gunner.getByLabel("乘員名稱").fill("重返乘員");
    await c.gunner.getByLabel("房間代碼").fill(c.code);
    await c.gunner
      .getByRole("button", { name: "加入房間", exact: true })
      .click();
    for (const page of [c.loader, c.driver, c.gunner]) {
      await expect(page.getByTestId("room-code")).toHaveText(c.code);
      await expect(page.getByTestId("crew-list").locator("li")).toHaveCount(3);
    }
    for (const [page, role] of [
      [c.loader, "駕駛"],
      [c.driver, "砲手"],
      [c.gunner, "裝填手"],
    ] as const) {
      await page
        .getByRole("button", { name: `擔任${role}`, exact: true })
        .click();
      for (const other of [c.loader, c.driver, c.gunner].filter(
        (p) => p !== page,
      ))
        await expect(
          other.getByRole("button", { name: `擔任${role}`, exact: true }),
        ).toBeDisabled();
      await page.getByRole("button", { name: "準備", exact: true }).click();
    }
    await c.loader.screenshot({
      path: "/tmp/car-game-spec30/evidence/37/legacy/review-fixes/rejoined-unique-roles.png",
    });
    await c.loader
      .getByRole("button", { name: "開始戰鬥", exact: true })
      .click();
    for (const page of [c.loader, c.driver, c.gunner]) {
      await expect(page.getByTestId("tank-health")).toHaveText("100/100");
      await expect(page.getByTestId("wave-status")).toHaveText(
        "第 1 / 3 波 · 目前觀測敵車 1",
      );
    }
    await c.gunner.keyboard.down("r");
    await expect(c.driver.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.gunner.keyboard.up("r");
    await c.gunner.keyboard.down("c");
    await c.driver.keyboard.press("Space");
    await expect(c.driver.getByTestId("shot-count")).toHaveText("1");
    await c.gunner.keyboard.up("c");
    await c.driver.screenshot({
      path: "/tmp/car-game-spec30/evidence/37/legacy/review-fixes/rejoined-new-round-shot.png",
    });
  } finally {
    await c.close();
  }
});
