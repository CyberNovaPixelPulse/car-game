import { test, expect } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

// Native window focus needs a real window; the remaining battle checks stay headless.
test.use({ headless: false });
const number = async (locator: import("@playwright/test").Locator) =>
  Number((await locator.textContent())!.replace(/[^\d.-]/g, ""));

test("砲手離焦、缺員暫停與重新連線後不延續長按或自動開火", async ({
  browser,
}) => {
  const crew = await tankCrew(
    browser,
    "loader",
    0,
    1000,
    undefined,
    undefined,
    {
      headless: false,
    },
  );
  try {
    // Playwright normally forces every page to stay focused. Disable that
    // browser-only emulation so real window/tab focus reaches the game.
    const focus = await crew.gunner.context().newCDPSession(crew.gunner);
    await focus.send("Emulation.setFocusEmulationEnabled", { enabled: false });
    const rate = crew.gunner.getByTestId("turret-yaw-rate");
    await crew.loader.keyboard.down("r");
    await expect(crew.gunner.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.loader.keyboard.up("r");
    await crew.gunner.bringToFront();
    await expect
      .poll(() => crew.gunner.evaluate(() => document.hasFocus()))
      .toBe(true);
    await crew.gunner.keyboard.down("ArrowRight");
    await expect(rate).toHaveText("48.7°/s");
    const beforeBlur = await number(crew.gunner.getByTestId("turret-heading"));
    const otherTab = await crew.gunner.context().newPage();
    await otherTab.goto("about:blank");
    await otherTab.bringToFront();
    await expect
      .poll(() => crew.gunner.evaluate(() => document.hasFocus()))
      .toBe(false);
    await otherTab.waitForTimeout(850);
    await crew.gunner.bringToFront();
    await expect(rate).toHaveText("0.0°/s");
    const afterBlur = await number(crew.gunner.getByTestId("turret-heading"));
    // The retained cap and half-second coast travel about 12 degrees. A
    // hidden tab must release before returning, rather than turning for the
    // entire away interval and only then beginning its coast.
    expect((afterBlur - beforeBlur + 360) % 360).toBeLessThan(25);
    await otherTab.close();
    await crew.gunner.bringToFront();
    await crew.gunner.keyboard.up("ArrowRight");
    const stopped = await crew.gunner
      .getByTestId("turret-heading")
      .textContent();
    await crew.gunner.waitForTimeout(700);
    await expect(crew.gunner.getByTestId("turret-heading")).toHaveText(
      stopped!,
    );

    await crew.gunner.keyboard.down("ArrowRight");
    await expect(rate).toHaveText("48.7°/s");
    await crew.driver.goto("about:blank");
    await expect(crew.gunner.getByTestId("battle-pause")).toBeVisible();
    // The room notice and final authority snapshot travel separately. Establish
    // the final visible paused compass value before checking an exact freeze.
    let pausedHeading = "";
    let stableReadings = 0;
    await expect
      .poll(
        async () => {
          const current = (await crew.gunner
            .getByTestId("turret-heading")
            .textContent())!;
          stableReadings = current === pausedHeading ? stableReadings + 1 : 0;
          pausedHeading = current;
          return stableReadings;
        },
        { intervals: [50] },
      )
      .toBeGreaterThanOrEqual(2);
    const frozen = await crew.gunner
      .getByTestId("turret-heading")
      .textContent();
    await crew.gunner.keyboard.down("ArrowUp");
    await crew.gunner.keyboard.down("Space");
    await crew.gunner.waitForTimeout(700);
    await expect(crew.gunner.getByTestId("turret-heading")).toHaveText(frozen!);
    await crew.driver.goto("/");
    await expect(crew.gunner.getByTestId("battle-pause")).toBeHidden();
    await expect(rate).toHaveText("0.0°/s");
    await expect(crew.gunner.getByTestId("turret-pitch-rate")).toHaveText(
      "0.0°/s",
    );
    await expect(crew.gunner.getByTestId("shot-count")).toHaveText("0");
    await crew.gunner.keyboard.up("ArrowRight");
    await crew.gunner.keyboard.up("ArrowUp");
    await crew.gunner.keyboard.up("Space");

    await crew.gunner.keyboard.down("ArrowRight");
    await expect(rate).toHaveText("48.7°/s");
    await crew.gunner.goto("about:blank");
    await expect(crew.loader.getByTestId("battle-pause")).toBeVisible();
    await crew.gunner.goto("/");
    await expect(
      crew.gunner.getByRole("heading", { name: "砲手工作站", exact: true }),
    ).toBeVisible();
    await expect(crew.loader.getByTestId("battle-pause")).toBeHidden();
    await expect(rate).toHaveText("0.0°/s");
    const restored = await crew.gunner
      .getByTestId("turret-heading")
      .textContent();
    await crew.gunner.waitForTimeout(700);
    await expect(crew.gunner.getByTestId("turret-heading")).toHaveText(
      restored!,
    );
    await expect(crew.gunner.getByTestId("shot-count")).toHaveText("0");
  } finally {
    await crew.close();
  }
});
