import { test, expect } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

test("駕駛指針時速表以公里顯示前進與倒車，其他乘員保留速度讀數", async ({
  browser,
}, testInfo) => {
  const crew = await tankCrew(browser);
  try {
    await crew.driver.screenshot({
      path: testInfo.outputPath("driver-speedometer.png"),
    });
    const dial = crew.driver.getByRole("group", { name: "駕駛時速表" });
    await expect(dial).toBeVisible();
    await expect(dial).toContainText("km/h");
    for (const page of [crew.gunner, crew.loader])
      await expect(page.locator(".speed-readout")).toHaveText("速度 0.0 m/s");
    await crew.driver.keyboard.down("s");
    await Promise.all([
      expect(dial.getByTestId("tank-speed")).toHaveText("10.8"),
      expect(crew.gunner.getByTestId("tank-speed")).toHaveText("3.0"),
      expect(crew.loader.getByTestId("tank-speed")).toHaveText("3.0"),
    ]);
    await expect(crew.driver.getByTestId("tank-motion")).toHaveText("倒車");
    await expect(dial.locator(".speed-needle")).not.toHaveAttribute(
      "transform",
      "rotate(-120 80 80)",
    );
    await crew.driver.keyboard.up("s");
    await expect(dial.getByTestId("tank-speed")).toHaveText("0.0");
    await crew.driver.keyboard.down("w");
    await Promise.all([
      expect(dial.getByTestId("tank-speed")).toHaveText("21.6"),
      expect(crew.gunner.getByTestId("tank-speed")).toHaveText("6.0"),
      expect(crew.loader.getByTestId("tank-speed")).toHaveText("6.0"),
    ]);
    await expect(crew.driver.getByTestId("tank-motion")).toHaveText("前進");
    await crew.driver.keyboard.up("w");
    await Promise.all(
      [crew.driver, crew.gunner, crew.loader].map((page) =>
        expect(page.getByTestId("tank-speed")).toHaveText("0.0"),
      ),
    );
  } finally {
    await crew.close();
  }
});
