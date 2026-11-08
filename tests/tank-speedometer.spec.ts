import { test, expect } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

test("駕駛指針時速表以公里顯示前進與倒車，其他乘員保留速度讀數", async ({
  browser,
}) => {
  const crew = await tankCrew(browser);
  try {
    await crew.driver.screenshot({ path: "/tmp/car-game-practice-before.png" });
    const dial = crew.driver.getByRole("group", { name: "駕駛時速表" });
    await expect(dial).toBeVisible();
    await expect(dial).toContainText("km/h");
    await crew.driver.keyboard.down("s");
    await expect(dial.getByTestId("tank-speed")).toHaveText("10.8");
    await expect(crew.driver.getByTestId("tank-motion")).toHaveText("倒車");
    await expect(dial.locator(".speed-needle")).not.toHaveAttribute(
      "transform",
      "rotate(-120 80 80)",
    );
    await crew.driver.keyboard.up("s");
    await expect(dial.getByTestId("tank-speed")).toHaveText("0.0");
    await expect(crew.gunner.getByTestId("tank-speed")).toHaveText("0.0");
  } finally {
    await crew.close();
  }
});
