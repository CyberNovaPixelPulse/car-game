import { test, expect } from "@playwright/test";
import { tankCrew } from "./tank-helpers";
import {
  repairWithFreshLastKnown,
  staleContacts,
} from "./tank-integration-helpers";

const evidence =
  process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/41";

test("活躍校準與最後已知敵情同時缺員凍結，畫質切換與原職位重連保留同次工作", async ({
  browser,
}) => {
  const c = await tankCrew(
    browser,
    "gunner",
    0,
    1972,
    `${evidence}/combined-pause-videos`,
  );
  try {
    await repairWithFreshLastKnown(c);
    await c.driver.goto("about:blank");
    await expect(c.loader.getByTestId("battle-pause")).toContainText(
      "等待駕駛",
    );
    await c.loader.waitForTimeout(300);
    const read = async () => ({
      ...(await c.loader.evaluate(() => {
        const marker = document.querySelector(
          '.navigation-enemy[data-observation="stale"]',
        )!;
        return {
          contact: [
            marker.getAttribute("x"),
            marker.getAttribute("y"),
            marker.getAttribute("opacity"),
          ],
          health: document.querySelector('[data-testid="tank-health"]')!
            .textContent!,
          circle: document.querySelector(
            '[data-testid="repair-calibration-position"]',
          )!.textContent!,
        };
      })),
      intel: await c.gunner.getByTestId("target-status").textContent(),
    });
    const frozen = await read();
    await expect(
      c.loader.getByTestId("repair-calibration-result"),
    ).toContainText("重新按住 R");
    await c.loader.keyboard.up("r");
    await c.loader
      .getByRole("combobox", { name: "畫質", exact: true })
      .selectOption("high");
    await c.loader.setViewportSize({ width: 1280, height: 720 });
    await c.loader.waitForTimeout(6100);
    expect(await read()).toEqual(frozen);
    await expect(c.gunner.locator(".navigation-contacts")).toHaveJSProperty(
      "innerHTML",
      await c.loader.locator(".navigation-contacts").innerHTML(),
    );
    await c.loader.screenshot({
      path: `${evidence}/combined-calibration-stale-paused-720.png`,
    });
    await c.loader.setViewportSize({ width: 1440, height: 1050 });
    expect(await read()).toEqual(frozen);
    await c.loader.screenshot({
      path: `${evidence}/combined-calibration-stale-paused-1440.png`,
    });
    const resumed = c.gunner
      .waitForFunction(() => {
        if (
          !document.querySelector<HTMLElement>('[data-testid="battle-pause"]')
            ?.hidden
        )
          return false;
        const marker = document.querySelector(
          '.navigation-enemy[data-observation="stale"]',
        );
        return (
          marker && [
            marker.getAttribute("x"),
            marker.getAttribute("y"),
            marker.getAttribute("opacity"),
          ]
        );
      })
      .then((h) => h.jsonValue());
    const returning = c.driver.goto("/");
    const contact = await resumed;
    if (!contact) throw new Error("恢復時未呈現原位舊情報");
    expect(contact.slice(0, 2)).toEqual(frozen.contact.slice(0, 2));
    expect(Number(contact[2])).toBeGreaterThan(
      Number(frozen.contact[2]) - 0.15,
    );
    await expect(
      c.loader.getByTestId("repair-calibration-position"),
    ).toHaveText(frozen.circle);
    await expect(c.loader.getByTestId("tank-health")).toHaveText(frozen.health);
    await c.loader.keyboard.down("r");
    await expect(
      c.loader.getByTestId("repair-calibration-position"),
    ).not.toHaveText(frozen.circle);
    await c.loader.keyboard.up("r");
    await expect(c.loader.getByTestId("repair-calibration-result")).toHaveText(
      "校準失敗・停修兩秒",
    );
    await returning;
    await expect(
      c.driver.getByRole("heading", { name: "駕駛工作站" }),
    ).toBeVisible();
    await expect(
      c.driver.getByTestId("repair-calibration-result"),
    ).toContainText("校準失敗");
    await expect(
      c.loader.getByRole("combobox", { name: "畫質", exact: true }),
    ).toHaveValue("high");
    await expect(
      c.driver.getByRole("combobox", { name: "畫質", exact: true }),
    ).toHaveValue("medium");
  } finally {
    await c.close();
  }
});
