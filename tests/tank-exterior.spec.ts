import { test, expect } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

test("砲手在筆電視窗能同時看戰場準星、方向、血量及主炮狀態", async ({
  browser,
}) => {
  const c = await tankCrew(browser);
  try {
    await c.gunner.setViewportSize({ width: 1280, height: 720 });
    await expect(
      c.gunner.getByRole("img", { name: "主炮戰場視野" }),
    ).toBeInViewport({ ratio: 1 });
    await expect(c.gunner.locator(".sight")).toBeInViewport({ ratio: 1 });
    for (const id of [
      "tank-health",
      "hull-heading",
      "turret-heading",
      "chamber-state",
    ])
      await expect(c.gunner.getByTestId(id)).toBeInViewport({ ratio: 1 });
    await c.gunner.screenshot({
      path: "/tmp/car-game-spec30/evidence/31/regression/visual25/gunner-laptop.png",
    });
    await c.gunner.setViewportSize({ width: 1440, height: 1050 });
    await c.gunner.screenshot({
      path: "/tmp/car-game-spec30/evidence/31/regression/visual25/gunner-desktop.png",
    });
    await c.driver.setViewportSize({ width: 1280, height: 720 });
    await expect(
      c.driver.getByRole("img", { name: "駕駛裝甲觀察窗" }),
    ).toBeInViewport({ ratio: 1 });
    await c.driver.screenshot({
      path: "/tmp/car-game-spec30/evidence/31/driver-1280x720.png",
    });
    await c.driver.setViewportSize({ width: 1440, height: 1050 });
    await c.driver.screenshot({
      path: "/tmp/car-game-spec30/evidence/31/driver-1440x1050.png",
    });
  } finally {
    await c.close();
  }
});

test("機槍外部視角在筆電仍保留方向準星與工作狀態", async ({ browser }) => {
  const c = await tankCrew(browser);
  try {
    await c.loader.setViewportSize({ width: 1280, height: 720 });
    await c.loader.keyboard.press("Tab");
    await expect(
      c.loader.getByRole("img", { name: "機槍戰場視野" }),
    ).toBeVisible();
    await expect(c.loader.getByTestId("mg-status")).toBeInViewport({
      ratio: 1,
    });
    await c.loader.screenshot({
      path: "/tmp/car-game-spec30/evidence/31/regression/visual25/machine-gun-laptop.png",
    });
  } finally {
    await c.close();
  }
});

test("缺員等待時砲手與裝填手的提示與離房按鈕均在筆電視窗內", async ({
  browser,
}) => {
  const c = await tankCrew(browser);
  try {
    for (const p of [c.loader, c.gunner])
      await p.setViewportSize({ width: 1280, height: 720 });
    await c.driver.goto("about:blank");
    for (const [role, p] of [
      ["gunner", c.gunner],
      ["loader", c.loader],
    ] as const) {
      await expect(p.getByTestId("battle-pause")).toBeInViewport({ ratio: 1 });
      await expect(
        p.getByRole("button", { name: "離開房間", exact: true }),
      ).toBeInViewport({ ratio: 1 });
      await p.screenshot({
        path: `/tmp/car-game-spec30/evidence/31/regression/visual25/final/${role}-waiting-1280.png`,
      });
    }
  } finally {
    await c.close();
  }
});
