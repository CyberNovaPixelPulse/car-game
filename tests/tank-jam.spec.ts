import { test, expect, type Page } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

async function stopAt(page: Page, success: boolean) {
  // Observe the actual rendered meter; never access core state or force a result.
  await expect
    .poll(
      async () => {
        const needle = await page.getByTestId("jam-needle").boundingBox();
        const zone = await page.getByTestId("jam-zone").boundingBox();
        if (!needle || !zone) return false;
        return success
          ? needle.x > zone.x + zone.width * 0.25 &&
              needle.x < zone.x + zone.width * 0.7
          : needle.x < zone.x - 25 || needle.x > zone.x + zone.width + 25;
      },
      { intervals: [16], timeout: 12000 },
    )
    .toBe(true);
  await page.keyboard.press("Space");
}

test("卡彈保留進度；放開 R 不清除；停針成功後續裝同一發", async ({
  browser,
}) => {
  const crew = await tankCrew(browser, "loader", 0, 2);
  try {
    await crew.loader.keyboard.down("r");
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText("卡彈");
    await crew.loader.keyboard.up("r");
    const firstZone = await crew.loader.getByTestId("jam-zone").boundingBox();
    const progress = await crew.loader
      .getByTestId("load-progress")
      .textContent();
    await crew.loader.waitForTimeout(450);
    await expect(crew.loader.getByTestId("load-progress")).toHaveText(
      progress!,
    );
    await crew.loader.keyboard.down("r");
    await crew.loader.waitForTimeout(400);
    await expect(crew.gunner.getByTestId("chamber-state")).toHaveText("卡彈");
    await crew.loader.keyboard.down("c");
    await expect(crew.loader.getByTestId("loader-status")).toHaveText(
      "蹲下避險・無法工作",
    );
    const crouchedNeedle = await crew.loader
      .getByTestId("jam-needle")
      .boundingBox();
    await crew.loader.keyboard.press("Space");
    await crew.loader.waitForTimeout(300);
    await expect(crew.loader.getByTestId("jam-result")).toHaveText(
      "按空白鍵停針",
    );
    expect((await crew.loader.getByTestId("jam-needle").boundingBox())!.x).toBe(
      crouchedNeedle!.x,
    );
    await expect(crew.loader.getByTestId("load-progress")).toHaveText(
      progress!,
    );
    await crew.loader.keyboard.up("c");
    await stopAt(crew.loader, true);
    await expect(crew.loader.getByTestId("jam-result")).toHaveText(
      "解除成功，繼續裝填",
    );
    await expect(crew.gunner.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.loader.keyboard.up("r");
    await crew.loader.screenshot({
      path: "/tmp/car-game-to-spec/visual27-final/regression/visual18/jam-cleared.png",
    });
    await crew.gunner.keyboard.press("Space");
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText("空膛");
    await expect(crew.loader.getByTestId("loader-status")).toContainText(
      "暈眩",
    );
    await crew.loader.keyboard.down("r");
    await crew.loader.keyboard.press("Space");
    await crew.loader.waitForTimeout(300);
    await expect(crew.loader.getByTestId("loader-status")).toContainText(
      "暈眩",
    );
    await expect(crew.loader.getByTestId("load-progress")).toHaveText("0");
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText("卡彈");
    await crew.loader.keyboard.up("r");
    expect(
      (await crew.loader.getByTestId("jam-zone").boundingBox())!.x,
    ).not.toBe(firstZone!.x);
    await stopAt(crew.loader, true);
    await crew.loader.keyboard.down("r");
    await expect(crew.gunner.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.loader.keyboard.up("r");
  } finally {
    await crew.close();
  }
});

test("客端裝填手失敗停針凍結一秒，重試沿用目標和進度，砲手不能代解", async ({
  browser,
}) => {
  const crew = await tankCrew(browser, "gunner", 0, 1);
  try {
    await crew.loader.setViewportSize({ width: 1280, height: 720 });
    await crew.loader.keyboard.down("r");
    await expect(crew.gunner.getByTestId("chamber-state")).toHaveText("卡彈");
    await crew.loader.keyboard.up("r");
    const progress = await crew.loader
      .getByTestId("load-progress")
      .textContent();
    const zone = await crew.loader.getByTestId("jam-zone").boundingBox();
    await crew.gunner.keyboard.press("Space");
    await crew.driver.keyboard.press("Space");
    await expect(crew.loader.getByTestId("jam-result")).toHaveText(
      "按空白鍵停針",
    );
    await stopAt(crew.loader, false);
    await expect(crew.loader.getByTestId("jam-result")).toContainText(
      "未命中，重試倒數",
    );
    const stopped = await crew.loader.getByTestId("jam-needle").boundingBox();
    await crew.loader.keyboard.press("Space");
    await crew.loader.waitForTimeout(300);
    expect((await crew.loader.getByTestId("jam-needle").boundingBox())!.x).toBe(
      stopped!.x,
    );
    await expect(crew.loader.getByTestId("load-progress")).toHaveText(
      progress!,
    );
    expect((await crew.loader.getByTestId("jam-zone").boundingBox())!.x).toBe(
      zone!.x,
    );
    await crew.loader.screenshot({
      path: "/tmp/car-game-to-spec/visual27-final/regression/visual18/jam-failed.png",
    });
    await expect(crew.loader.getByTestId("jam-result")).toHaveText(
      "按空白鍵停針",
    );
    await crew.loader.screenshot({
      path: "/tmp/car-game-to-spec/visual27-final/regression/visual18/jam-retry.png",
    });
    await stopAt(crew.loader, true);
    await expect(crew.loader.getByTestId("jam-result")).toHaveText(
      "解除成功，繼續裝填",
    );
    await expect(crew.gunner.getByTestId("chamber-state")).toHaveText("裝填中");
    await expect(crew.loader.getByTestId("load-progress")).toHaveText(
      progress!,
    );
    await crew.loader.keyboard.down("r");
    await expect(crew.gunner.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.loader.keyboard.up("r");
  } finally {
    await crew.close();
  }
});
