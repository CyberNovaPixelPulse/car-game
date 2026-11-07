import { copyFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

test("Tab互斥切換，保留裝填進度且機槍按住瞄準放開停止", async ({ browser }) => {
  const crew = await tankCrew(browser, "gunner");
  try {
    await crew.loader.keyboard.down("r");
    await expect
      .poll(async () =>
        Number(await crew.loader.getByTestId("load-progress").textContent()),
      )
      .toBeGreaterThan(20);
    await crew.loader.keyboard.up("r");
    await crew.loader.keyboard.press("Tab");
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("機槍模式");
    await expect(
      crew.loader.getByRole("img", { name: "機槍戰場視野" }),
    ).toBeVisible();
    await expect(
      crew.loader.getByRole("img", { name: "車內炮膛與彈藥架" }),
    ).toBeHidden();
    await expect(crew.loader.getByTestId("mg-status")).toBeInViewport();
    await crew.loader.setViewportSize({ width: 1280, height: 720 });
    await expect(crew.loader.getByTestId("mg-status")).toBeInViewport();
    await crew.loader.screenshot({
      path: "/tmp/car-game-to-spec/visual27-final/regression/visual20/mg-laptop.png",
    });
    const saved = await crew.loader.getByTestId("load-progress").textContent();
    await crew.loader.keyboard.down("r");
    await crew.loader.keyboard.down("d");
    await crew.loader.keyboard.down("w");
    await crew.loader.waitForTimeout(500);
    await crew.loader.keyboard.up("d");
    await crew.loader.keyboard.up("w");
    await expect(crew.loader.getByTestId("mg-pitch")).not.toHaveText("-2.3°");
    await expect(crew.loader.getByTestId("mg-heading")).not.toHaveText("0.0°");
    await crew.loader.waitForTimeout(200);
    const heading = await crew.loader.getByTestId("mg-heading").textContent();
    await crew.loader.waitForTimeout(400);
    await expect(crew.loader.getByTestId("mg-heading")).toHaveText(heading!);
    await expect(crew.gunner.getByTestId("turret-heading")).toHaveText("0.0°");
    await expect(crew.loader.getByTestId("load-progress")).toHaveText(saved!);
    await crew.loader.keyboard.up("r");
    await crew.loader.keyboard.press("Tab");
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("維修模式");
    await crew.loader.keyboard.press("Tab");
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("裝填模式");
    await expect(
      crew.loader.getByRole("img", { name: "機槍戰場視野" }),
    ).toBeHidden();
    await crew.loader.keyboard.down("r");
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.loader.keyboard.up("r");
  } finally {
    await crew.close();
  }
});

test("機槍連射小傷害，五秒過熱且切模式不能繞過三秒冷卻", async ({
  browser,
}) => {
  const crew = await tankCrew(browser, "gunner");
  try {
    await crew.loader.keyboard.press("Space");
    await crew.loader.keyboard.press("Tab");
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("機槍模式");
    await expect(crew.loader.getByTestId("mg-shot-count")).toHaveText("0");
    const burstAt = Date.now();
    await crew.loader.keyboard.down("Space");
    await expect
      .poll(async () =>
        Number(await crew.loader.getByTestId("mg-shot-count").textContent()),
      )
      .toBeGreaterThan(5);
    await expect(crew.gunner.getByTestId("target-status")).toContainText(
      "受損",
    );
    await expect(crew.loader.getByTestId("mg-status")).toHaveText(
      "過熱・強制冷卻",
      { timeout: 6500 },
    );
    const overheatedAt = Date.now();
    expect(overheatedAt - burstAt).toBeGreaterThan(4700);
    expect(overheatedAt - burstAt).toBeLessThan(6200);
    await crew.loader.keyboard.up("Space");
    const shots = await crew.loader.getByTestId("mg-shot-count").textContent();
    await crew.loader.keyboard.press("Tab");
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("維修模式");
    await crew.loader.keyboard.press("Tab");
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("裝填模式");
    await crew.loader.keyboard.down("Space");
    await crew.loader.keyboard.press("Tab");
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("機槍模式");
    console.log("MG mode return elapsed from burst", Date.now() - burstAt);
    await expect(crew.loader.getByTestId("mg-shot-count")).toHaveText(shots!);
    await expect(crew.loader.getByTestId("mg-status")).toHaveText(
      "過熱・強制冷卻",
    );
    await crew.loader.keyboard.up("Space");
    await expect(crew.loader.getByTestId("mg-status")).toHaveText("可以射擊", {
      timeout: 3500,
    });
    // The first observed overheat snapshot may arrive after its deadline began.
    // Measure the full ~5s burst + ~3s lock from the actual physical key event.
    expect(Date.now() - burstAt).toBeGreaterThan(7700);
    expect(Date.now() - burstAt).toBeLessThan(9500);
    const hp = Number(
      (await crew.gunner.getByTestId("target-status").textContent())!.match(
        /四號 H 型 (\d+)/,
      )![1],
    );
    expect(hp).toBeGreaterThan(100);
    await Promise.all(
      [crew.loader, crew.driver, crew.gunner].map((page) =>
        expect(page.getByTestId("tank-health")).toHaveText("100/100"),
      ),
    );

    await crew.loader.keyboard.down("Space");
    await expect
      .poll(async () =>
        Number(await crew.loader.getByTestId("mg-shot-count").textContent()),
      )
      .toBeGreaterThan(Number(shots));
    await crew.loader.keyboard.up("Space");
    await expect
      .poll(async () =>
        Number(await crew.loader.getByTestId("mg-heat").textContent()),
      )
      .toBe(0);
    await crew.loader.keyboard.down("Space");
    await expect(crew.loader.getByTestId("mg-status")).toHaveText(
      "過熱・強制冷卻",
      { timeout: 6500 },
    );
    await crew.loader.screenshot({
      path: "/tmp/car-game-to-spec/visual27-final/regression/visual20/mg-overheated.png",
    });
    await crew.loader.keyboard.up("Space");
  } finally {
    await crew.close();
  }
});

test("跨機槍模式保留AP卡彈，蹲下與退殼暈眩封鎖全部工作", async ({
  browser,
}) => {
  const crew = await tankCrew(
    browser,
    "gunner",
    0,
    1,
    "/tmp/car-game-to-spec/visual27-final/regression/visual20/recordings",
  );
  const video = crew.loader.video();
  try {
    await crew.loader.keyboard.press("2");
    await crew.loader.keyboard.down("r");
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText("卡彈");
    await crew.loader.keyboard.up("r");
    const zone = await crew.loader.getByTestId("jam-zone").boundingBox();
    await crew.loader.keyboard.press("Tab");
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("機槍模式");
    await crew.loader.keyboard.press("1");
    await crew.loader.keyboard.down("r");
    await crew.loader.keyboard.down("Space");
    await expect
      .poll(async () =>
        Number(await crew.loader.getByTestId("mg-shot-count").textContent()),
      )
      .toBeGreaterThan(3);
    await crew.loader.keyboard.down("c");
    await expect(crew.loader.getByTestId("loader-status")).toContainText(
      "蹲下",
    );
    await crew.loader.keyboard.press("Tab");
    await crew.loader.keyboard.down("d");
    await crew.loader.waitForTimeout(200);
    const shots = await crew.loader.getByTestId("mg-shot-count").textContent();
    const heading = await crew.loader.getByTestId("mg-heading").textContent();
    await crew.loader.waitForTimeout(300);
    await expect(crew.loader.getByTestId("mg-shot-count")).toHaveText(shots!);
    await expect(crew.loader.getByTestId("mg-heading")).toHaveText(heading!);
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("機槍模式");
    await expect(crew.loader.getByTestId("chamber-shell")).toHaveText(
      "穿甲彈（已鎖定）",
    );
    await expect(crew.loader.getByTestId("load-progress")).toHaveText("40");
    await crew.loader.keyboard.up("d");
    await crew.loader.keyboard.up("Space");
    await crew.loader.keyboard.up("r");
    await crew.loader.keyboard.up("c");
    await crew.loader.keyboard.press("Tab");
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("維修模式");
    await crew.loader.keyboard.press("Tab");
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("裝填模式");
    await expect(crew.loader.getByTestId("jam-result")).toHaveText(
      "按空白鍵停針",
    );
    expect((await crew.loader.getByTestId("jam-zone").boundingBox())!.x).toBe(
      zone!.x,
    );
    await expect
      .poll(
        async () => {
          const needle = await crew.loader
            .getByTestId("jam-needle")
            .boundingBox();
          const goal = await crew.loader.getByTestId("jam-zone").boundingBox();
          return (
            !!needle &&
            !!goal &&
            needle.x > goal.x + goal.width * 0.25 &&
            needle.x < goal.x + goal.width * 0.65
          );
        },
        { intervals: [16], timeout: 12000 },
      )
      .toBe(true);
    await crew.loader.keyboard.press("Space");
    await expect(crew.loader.getByTestId("jam-result")).toContainText(
      "解除成功",
    );
    await crew.loader.keyboard.down("r");
    await expect(crew.gunner.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.loader.keyboard.up("r");
    await crew.loader.keyboard.press("Tab");
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("機槍模式");
    await crew.loader.setViewportSize({ width: 1280, height: 720 });
    await crew.loader.keyboard.down("c");
    await expect(crew.loader.getByTestId("loader-status")).toContainText(
      "蹲下",
    );
    await crew.gunner.keyboard.press("Space");
    await expect(crew.loader.getByTestId("ejection-warning")).toContainText(
      "按住 C",
    );
    await crew.loader.screenshot({
      path: "/tmp/car-game-to-spec/visual27-final/regression/visual20/mg-warning.png",
    });
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText("空膛");
    await expect(crew.loader.getByTestId("loader-status")).toContainText(
      "蹲下",
    );
    await crew.loader.keyboard.up("c");
    await crew.loader.keyboard.press("Tab");
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("維修模式");
    await crew.loader.keyboard.press("Tab");
    await crew.loader.keyboard.down("r");
    await expect(crew.gunner.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.loader.keyboard.up("r");
    await crew.loader.keyboard.press("Tab");
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("機槍模式");
    await crew.gunner.keyboard.press("Space");
    await expect(crew.loader.getByTestId("loader-status")).toContainText(
      "暈眩",
    );
    const stunnedShots = await crew.loader
      .getByTestId("mg-shot-count")
      .textContent();
    const stunnedHeading = await crew.loader
      .getByTestId("mg-heading")
      .textContent();
    await crew.loader.keyboard.press("Tab");
    await crew.loader.keyboard.down("r");
    await crew.loader.keyboard.down("Space");
    await crew.loader.keyboard.down("d");
    await crew.driver.keyboard.down("s");
    await crew.gunner.keyboard.press("d");
    await expect(crew.driver.getByTestId("tank-motion")).toHaveText("倒車");
    await expect(crew.gunner.getByTestId("turret-yaw-rate")).not.toHaveText(
      "0.0°/s",
    );
    await crew.loader.waitForTimeout(500);
    await expect(crew.loader.getByTestId("mg-shot-count")).toHaveText(
      stunnedShots!,
    );
    await expect(crew.loader.getByTestId("mg-heading")).toHaveText(
      stunnedHeading!,
    );
    await expect(crew.loader.getByTestId("load-progress")).toHaveText("0");
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("機槍模式");
    await crew.loader.screenshot({
      path: "/tmp/car-game-to-spec/visual27-final/regression/visual20/mg-stunned.png",
    });
    await crew.loader.keyboard.up("Space");
    await crew.loader.keyboard.up("r");
    await crew.loader.keyboard.up("d");
    await crew.driver.keyboard.up("s");
  } finally {
    await crew.close();
    if (video)
      await copyFile(
        await video.path(),
        "/tmp/car-game-to-spec/visual27-final/regression/visual20/mg-session.webm",
      );
  }
});

test("客端立即Tab接按住空白，不因舊模式快照漏掉連射", async ({ browser }) => {
  const crew = await tankCrew(browser, "gunner");
  try {
    await crew.loader.keyboard.down("Tab");
    await crew.loader.keyboard.down("Space");
    await crew.loader.keyboard.up("Tab");
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("機槍模式");
    await expect
      .poll(async () =>
        Number(await crew.loader.getByTestId("mg-shot-count").textContent()),
      )
      .toBeGreaterThan(0);
    await crew.loader.keyboard.up("Space");
    await crew.loader.keyboard.press("Tab");
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("維修模式");
    await crew.loader.keyboard.press("Tab");
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("裝填模式");
    const shots = await crew.loader.getByTestId("mg-shot-count").textContent();
    await crew.loader.keyboard.down("Space");
    await crew.loader.waitForTimeout(400);
    await expect(crew.loader.getByTestId("mg-shot-count")).toHaveText(shots!);
    await crew.loader.keyboard.up("Space");
  } finally {
    await crew.close();
  }
});
