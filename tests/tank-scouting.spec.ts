import { test, expect, type Page } from "@playwright/test";
import { aimAtHeading, tankCrew } from "./tank-helpers";

const evidence =
  process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/37";
const markers = (page: Page) =>
  page.locator('.navigation-enemy[data-observation="current"]');

for (const hostRole of ["gunner", "loader"] as const)
  test(`固定掩體後的敵車不洩漏，主炮與駕駛實際轉離後車內乘員不能發現敵車 (${hostRole}房主)`, async ({
    browser,
  }) => {
    const c = await tankCrew(browser, hostRole);
    try {
      await expect(c.gunner.getByTestId("target-status")).toContainText(
        "四號 H 型 200/200",
      );
      await expect(c.gunner.getByTestId("target-status")).not.toContainText(
        "虎式",
      );
      for (const p of [c.driver, c.gunner, c.loader]) {
        await expect(markers(p)).toHaveCount(1);
        await expect(p.getByTestId("wave-status")).toHaveText(
          "第 1 / 3 波 · 目前觀測敵車 1",
        );
      }
      // Gunner watches the rear. The driver's real forward slit still sees the Panzer.
      await aimAtHeading(c.gunner, 180);
      await expect(markers(c.loader)).toHaveCount(1);
      // The driver's hull turns east, putting the Panzer outside the 60° opening.
      await c.driver.keyboard.down("d");
      await expect
        .poll(
          async () =>
            Number(
              (await c.driver
                .getByTestId("hull-heading")
                .textContent())!.replace("°", ""),
            ),
          { intervals: [50] },
        )
        .toBeGreaterThan(65);
      await c.driver.keyboard.up("d");
      await expect(c.driver.getByTestId("tank-motion")).toHaveText("靜止");
      for (const p of [c.driver, c.gunner, c.loader])
        await expect(markers(p)).toHaveCount(0);
      await expect(c.gunner.getByTestId("target-status")).toContainText(
        "最後已知",
      );
      await expect(c.gunner.getByTestId("enemy-warning")).toHaveText("");
      await expect(c.gunner.getByTestId("enemy-activity")).toHaveText("");
      await c.gunner.screenshot({ path: `${evidence}/unobserved-gunner.png` });

      // MG becomes the sole observer by aiming back to the formerly visible lane.
      await c.loader.keyboard.press("Tab");
      await c.loader.keyboard.down("a");
      await expect(markers(c.loader)).toHaveCount(1);
      await c.loader.keyboard.up("a");
      for (const p of [c.driver, c.gunner, c.loader])
        await expect(markers(p)).toHaveCount(1);
      await expect(c.gunner.getByTestId("target-status")).toContainText(
        "四號 H 型",
      );
      const shared = await c.gunner.locator(".navigation-contacts").innerHTML();
      for (const p of [c.driver, c.loader])
        await expect
          .poll(() => p.locator(".navigation-contacts").innerHTML())
          .toBe(shared);
      for (const [page, role] of [
        [c.driver, "driver"],
        [c.gunner, "gunner"],
        [c.loader, "mg"],
      ] as const) {
        await page.screenshot({
          path: `${evidence}/${hostRole}-mg-shared-${role}-1440.png`,
        });
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.waitForTimeout(300);
        const bounds = (await page
          .locator(".battle-navigation")
          .boundingBox())!;
        expect(bounds.y).toBeGreaterThanOrEqual(role === "driver" ? 480 : 0);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(720);
        await page.screenshot({
          path: `${evidence}/${hostRole}-mg-shared-${role}-720.png`,
        });
        await page.setViewportSize({ width: 1440, height: 1050 });
      }
      // Actual elevation removes the target below the MG's vertical frustum.
      await c.loader.keyboard.down("w");
      await expect(markers(c.loader)).toHaveCount(0);
      await c.loader.keyboard.up("w");
      await c.loader.keyboard.down("s");
      await expect(markers(c.loader)).toHaveCount(1);
      await c.loader.keyboard.up("s");
      // Repair is interior: retained MG orientation supplies no discoveries.
      await c.loader.keyboard.press("Tab");
      await expect(c.loader.getByTestId("loader-mode")).toHaveText("維修模式");
      for (const p of [c.driver, c.gunner, c.loader])
        await expect(markers(p)).toHaveCount(0);
      await c.loader.screenshot({
        path: `${evidence}/interior-no-scouting.png`,
      });
      await c.loader.keyboard.press("Tab");
      await expect(c.loader.getByTestId("loader-mode")).toHaveText("裝填模式");
      await expect(markers(c.loader)).toHaveCount(0);
      await c.loader.keyboard.press("Tab");
      for (const p of [c.driver, c.gunner, c.loader])
        await expect(markers(p)).toHaveCount(1);
    } finally {
      await c.close();
    }
  });

test("主炮觀測依實際長寬比改變，垂直65度不會被當成水平視野", async ({
  browser,
}) => {
  const c = await tankCrew(browser, "gunner");
  try {
    await aimAtHeading(c.gunner, 180);
    await c.driver.keyboard.down("d");
    await expect
      .poll(
        async () =>
          Number(
            (await c.driver.getByTestId("hull-heading").textContent())!.replace(
              "°",
              "",
            ),
          ),
        { intervals: [50] },
      )
      .toBeGreaterThan(75);
    await c.driver.keyboard.up("d");
    // Wait for actual hull coast before aiming by the world compass.
    await c.driver.waitForTimeout(600);
    await aimAtHeading(c.gunner, 40);
    await c.gunner.setViewportSize({ width: 900, height: 1050 });
    await expect(markers(c.gunner)).toHaveCount(0);
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "最後已知",
    );
    await c.gunner.screenshot({ path: `${evidence}/projection-narrow.png` });
    await c.gunner.setViewportSize({ width: 1440, height: 720 });
    await expect(markers(c.gunner)).toHaveCount(1);
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "四號 H 型",
    );
    for (const p of [c.driver, c.loader])
      await expect(markers(p)).toHaveCount(1);
    await c.gunner.waitForTimeout(300);
    await c.gunner.screenshot({ path: `${evidence}/projection-wide.png` });
  } finally {
    await c.close();
  }
});
