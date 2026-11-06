import { test, expect } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

test("非房主駕駛操控同車，砲手可看戰場但駕駛與裝填手看不到外部", async ({
  browser,
}) => {
  const crew = await tankCrew(browser);
  try {
    await expect(crew.driver.getByTestId("tank-speed")).toHaveText("0.0");
    await expect(
      crew.gunner.getByRole("img", { name: "主炮戰場視野" }),
    ).toBeVisible();
    await expect(crew.driver.locator("canvas")).toHaveCount(0);
    await expect(crew.loader.locator("canvas")).toHaveCount(0);
    await crew.gunner.keyboard.down("w");
    await crew.gunner.waitForTimeout(500);
    await crew.gunner.keyboard.up("w");
    await expect(crew.driver.getByTestId("tank-speed")).toHaveText("0.0");
    await crew.driver.keyboard.down("w");
    await expect
      .poll(async () =>
        Number(await crew.driver.getByTestId("tank-speed").textContent()),
      )
      .toBeGreaterThan(1);
    await expect
      .poll(async () =>
        Number(await crew.gunner.getByTestId("tank-speed").textContent()),
      )
      .toBeGreaterThan(1);
    await crew.driver.keyboard.up("w");
    await expect(crew.driver.getByTestId("tank-motion")).toHaveText("靜止");
  } finally {
    await crew.close();
  }
});

test("駕駛可原地轉向再倒車，三人車況保持一致", async ({ browser }) => {
  const crew = await tankCrew(browser);
  try {
    await crew.driver.keyboard.down("d");
    await expect
      .poll(async () =>
        Number(
          (await crew.gunner
            .getByTestId("hull-heading")
            .textContent())!.replace("°", ""),
        ),
      )
      .toBeGreaterThan(15);
    await expect(crew.driver.getByTestId("tank-speed")).toHaveText("0.0");
    await crew.driver.keyboard.up("d");
    await crew.driver.keyboard.down("s");
    await expect(crew.driver.getByTestId("tank-motion")).toHaveText("倒車");
    await expect(crew.gunner.getByTestId("tank-motion")).toHaveText("倒車");
    await crew.driver.keyboard.up("s");
    await expect(crew.driver.getByTestId("tank-motion")).toHaveText("靜止");
    await expect(crew.driver.getByTestId("hull-heading")).toHaveCount(0);
  } finally {
    await crew.close();
  }
});

test("前進遇固定石牆會受阻，倒車能脫離，砲手視野真實呈現場景移動", async ({
  browser,
}) => {
  const crew = await tankCrew(browser);
  try {
    const before = await crew.gunner
      .getByRole("img", { name: "主炮戰場視野" })
      .screenshot();
    await crew.driver.keyboard.down("w");
    await expect(crew.driver.getByTestId("tank-contact")).toHaveText(
      "車體受阻",
      { timeout: 12000 },
    );
    await expect(crew.gunner.getByTestId("tank-contact")).toHaveText(
      "車體受阻",
    );
    const after = await crew.gunner
      .getByRole("img", { name: "主炮戰場視野" })
      .screenshot();
    expect(before.equals(after)).toBe(false);
    await crew.driver.keyboard.up("w");
    await crew.driver.keyboard.down("s");
    await expect(crew.driver.getByTestId("tank-motion")).toHaveText("倒車");
    await expect(crew.driver.getByTestId("tank-contact")).toHaveText(
      "車體正常",
    );
    await crew.driver.keyboard.up("s");
  } finally {
    await crew.close();
  }
});
