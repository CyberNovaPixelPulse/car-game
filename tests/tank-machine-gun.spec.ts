import { test, expect } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

test("Tab互斥切換，保留裝填進度且機槍按住瞄準放開停止", async ({ browser }) => {
  const crew = await tankCrew(browser, "gunner");
  try {
    await crew.loader.keyboard.down("r");
    await expect.poll(async () => Number(await crew.loader.getByTestId("load-progress").textContent())).toBeGreaterThan(20);
    await crew.loader.keyboard.up("r");
    await crew.loader.keyboard.press("Tab");
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("機槍模式");
    await expect(crew.loader.getByRole("img", { name: "機槍戰場視野" })).toBeVisible();
    await expect(crew.loader.locator(".breech-assembly")).toBeHidden();
    const saved = await crew.loader.getByTestId("load-progress").textContent();
    await crew.loader.keyboard.down("r");
    await crew.loader.keyboard.down("d");
    await crew.loader.waitForTimeout(500);
    await crew.loader.keyboard.up("d");
    await expect(crew.loader.getByTestId("mg-heading")).not.toHaveText("0.0°");
    await crew.loader.waitForTimeout(200);
    const heading = await crew.loader.getByTestId("mg-heading").textContent();
    await crew.loader.waitForTimeout(400);
    await expect(crew.loader.getByTestId("mg-heading")).toHaveText(heading!);
    await expect(crew.gunner.getByTestId("turret-heading")).toHaveText("0.0°");
    await expect(crew.loader.getByTestId("load-progress")).toHaveText(saved!);
    await crew.loader.keyboard.up("r");
    await crew.loader.keyboard.press("Tab");
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("裝填模式");
    await expect(crew.loader.getByRole("img", { name: "機槍戰場視野" })).toBeHidden();
    await crew.loader.keyboard.down("r");
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await crew.loader.keyboard.up("r");
  } finally { await crew.close(); }
});
