import { copyFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

test("裝填手在真正車內3D工作區操作炮膛，裝填移動可見且無外部視野", async ({
  browser,
}) => {
  const crew = await tankCrew(browser);
  try {
    await crew.loader.setViewportSize({ width: 1280, height: 720 });
    const interior = crew.loader.getByRole("img", { name: "車內炮膛與彈藥架" });
    await expect(interior).toBeVisible();
    await expect(
      crew.loader.getByRole("img", { name: /戰場視野/ }),
    ).toHaveCount(0);
    const before = await interior.screenshot();
    await crew.loader.keyboard.down("r");
    await expect
      .poll(async () =>
        Number(await crew.loader.getByTestId("load-progress").textContent()),
      )
      .toBeGreaterThan(30);
    await crew.loader.keyboard.up("r");
    const during = await interior.screenshot();
    expect(before.equals(during)).toBe(false);
    await expect(crew.loader.getByTestId("load-progress")).toBeInViewport();
    await crew.loader.screenshot({
      path: `${process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/31/regression/visual26"}/legacy-loading.png`,
    });
    await crew.loader.keyboard.down("r");
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.loader.keyboard.up("r");
    await crew.loader.setViewportSize({ width: 1440, height: 1050 });
    await crew.loader.screenshot({
      path: `${process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/31/regression/visual26"}/legacy-loaded-desktop.png`,
    });
    await crew.loader.setViewportSize({ width: 1280, height: 720 });
    await crew.loader.keyboard.press("Tab");
    await expect(
      crew.loader.getByRole("img", { name: "機槍戰場視野" }),
    ).toBeVisible();
    await expect(interior).not.toBeVisible();
    await crew.loader.screenshot({
      path: `${process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/31/regression/visual26"}/legacy-mg.png`,
    });
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.loader.keyboard.press("Tab");
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("維修模式");
    await expect(interior).toBeVisible();
    await crew.loader.keyboard.press("Tab");
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("裝填模式");
    await expect(
      crew.loader.getByRole("img", { name: /戰場視野/ }),
    ).toHaveCount(0);
    await expect(
      crew.driver.getByRole("img", { name: "駕駛裝甲觀察窗" }),
    ).toBeVisible();
  } finally {
    await crew.close();
  }
});

test("關閉機械音效仍可見退殼預警，車內蹲下與暈眩不丟工作狀態", async ({
  browser,
}) => {
  const crew = await tankCrew(
    browser,
    "loader",
    0,
    1000,
    process.env.TANK_EVIDENCE_DIR
      ? `${process.env.TANK_EVIDENCE_DIR}/legacy-interior-video`
      : "/tmp/car-game-spec30/evidence/31/regression/visual26/video",
  );
  const video = crew.loader.video();
  try {
    await crew.loader.setViewportSize({ width: 1280, height: 720 });
    const sound = crew.loader.getByRole("button", { name: "音效：開" });
    await expect(sound).toBeVisible();
    await sound.click();
    await expect(
      crew.loader.getByRole("button", { name: "音效：關" }),
    ).toHaveAttribute("aria-pressed", "false");
    await crew.loader.keyboard.down("r");
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.loader.keyboard.up("r");
    const standing = await crew.loader
      .getByRole("img", { name: "車內炮膛與彈藥架" })
      .screenshot();
    await crew.loader.keyboard.down("c");
    await expect(crew.loader.getByTestId("loader-status")).toContainText(
      "蹲下",
    );
    const ducked = await crew.loader
      .getByRole("img", { name: "車內炮膛與彈藥架" })
      .screenshot();
    expect(standing.equals(ducked)).toBe(false);
    await crew.loader.screenshot({
      path: `${process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/31/regression/visual26"}/legacy-crouched.png`,
    });
    await crew.gunner.keyboard.press("Space");
    await expect(crew.loader.getByTestId("ejection-warning")).toHaveText(
      "彈殼即將退出！按住 C 蹲下避開",
    );
    await expect(crew.loader.getByTestId("ejection-warning")).toBeInViewport();
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText("空膛");
    await crew.loader.keyboard.up("c");
    await expect(crew.loader.getByTestId("loader-status")).not.toContainText(
      "暈眩",
    );
    await crew.loader.keyboard.down("r");
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.loader.keyboard.up("r");
    await crew.gunner.keyboard.press("Space");
    await expect(crew.loader.getByTestId("loader-status")).toContainText(
      "暈眩",
    );
    await expect(crew.loader.getByTestId("stun-remaining")).toBeInViewport();
    await crew.loader.screenshot({
      path: `${process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/31/regression/visual26"}/legacy-stunned.png`,
    });
    await crew.loader.keyboard.down("r");
    await crew.loader.keyboard.press("Tab");
    await crew.loader.waitForTimeout(300);
    await expect(crew.loader.getByTestId("load-progress")).toHaveText("0");
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("裝填模式");
    await crew.loader.keyboard.up("r");
    await expect(crew.loader.getByTestId("loader-status")).toContainText(
      "已恢復",
    );
  } finally {
    await crew.close();
    if (video)
      await copyFile(
        await video.path(),
        `${process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/31/regression/visual26"}/legacy-interior-session.webm`,
      );
  }
});

test("窄視窗的說明與入房表單保持可讀", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByText("需要三位玩家、三台電腦與實體鍵盤。"),
  ).toBeVisible();
  await expect(page.getByLabel("乘員名稱")).toBeInViewport();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: `${process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/31/regression/visual26"}/legacy-narrow-entry.png`,
    fullPage: true,
  });
});
