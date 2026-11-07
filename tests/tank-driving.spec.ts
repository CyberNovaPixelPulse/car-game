import { test, expect } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

test("非房主駕駛從受限裝甲觀察窗操控同車，裝填手仍留在車內", async ({
  browser,
}) => {
  const crew = await tankCrew(browser);
  try {
    await expect(crew.driver.getByTestId("tank-speed")).toHaveText("0.0");
    await expect(
      crew.gunner.getByRole("img", { name: "主炮戰場視野" }),
    ).toBeVisible();
    await expect(
      crew.driver.getByRole("img", { name: "駕駛裝甲觀察窗" }),
    ).toBeVisible();
    await expect(crew.driver.getByText(/觀察窗固定朝車頭/)).toBeVisible();
    await expect(
      crew.loader.getByRole("img", { name: /戰場視野/ }),
    ).toHaveCount(0);
    await expect(
      crew.loader.getByRole("img", { name: "車內炮膛與彈藥架" }),
    ).toBeVisible();
    await crew.gunner.keyboard.down("ArrowUp");
    await expect
      .poll(async () =>
        Number(
          (await crew.gunner
            .getByTestId("turret-pitch")
            .textContent())!.replace("°", ""),
        ),
      )
      .toBeGreaterThan(5);
    await crew.gunner.keyboard.up("ArrowUp");
    await expect(crew.driver.getByTestId("tank-speed")).toHaveText("0.0");
    const before = await crew.driver
      .getByRole("img", { name: "駕駛裝甲觀察窗" })
      .screenshot();
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
    const after = await crew.driver
      .getByRole("img", { name: "駕駛裝甲觀察窗" })
      .screenshot();
    expect(before.equals(after)).toBe(false);
  } finally {
    await crew.close();
  }
});

test("駕駛可原地轉向再倒車，三人車況保持一致", async ({ browser }) => {
  const crew = await tankCrew(browser);
  try {
    const before = await crew.driver
      .getByRole("img", { name: "駕駛裝甲觀察窗" })
      .screenshot();
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
    const after = await crew.driver
      .getByRole("img", { name: "駕駛裝甲觀察窗" })
      .screenshot();
    expect(before.equals(after)).toBe(false);
    await crew.driver.keyboard.down("s");
    await expect(crew.driver.getByTestId("tank-motion")).toHaveText("倒車");
    await expect(crew.gunner.getByTestId("tank-motion")).toHaveText("倒車");
    await crew.driver.keyboard.up("s");
    await expect(crew.driver.getByTestId("tank-motion")).toHaveText("靜止");
  } finally {
    await crew.close();
  }
});

test("前進遇固定石牆會受阻，倒車能脫離，砲手視野真實呈現場景移動", async ({
  browser,
}) => {
  const crew = await tankCrew(browser);
  try {
    await crew.loader.keyboard.press("Tab");
    const loaderBefore = await crew.loader
      .getByRole("img", { name: "機槍戰場視野" })
      .screenshot();
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
    const loaderAfter = await crew.loader
      .getByRole("img", { name: "機槍戰場視野" })
      .screenshot();
    expect(loaderBefore.equals(loaderAfter)).toBe(false);
    for (const [page, role] of [
      [crew.driver, "driver"],
      [crew.gunner, "gunner"],
      [crew.loader, "loader-mg"],
    ] as const)
      await page.screenshot({
        path: `/tmp/car-game-spec30/evidence/31/blocked-${role}.png`,
      });
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
