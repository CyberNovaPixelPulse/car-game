import { test, expect } from "@playwright/test";
import { tankCrew, nativeTaps } from "./tank-helpers";

test("裝填手持續蹲下不能工作，及時蹲下避開退殼後放開可續裝", async ({
  browser,
}) => {
  const crew = await tankCrew(browser);
  try {
    await crew.loader.keyboard.down("c");
    await expect(crew.loader.getByTestId("loader-status")).toHaveText(
      "蹲下避險・無法工作",
    );
    await crew.loader.keyboard.down("r");
    await crew.loader.waitForTimeout(500);
    await expect(crew.loader.getByTestId("load-progress")).toHaveText("0");
    await crew.loader.keyboard.up("c");
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
      { timeout: 20000 },
    );
    await crew.loader.keyboard.up("r");
    await crew.gunner.keyboard.press("Space");
    await expect(crew.loader.getByTestId("ejection-warning")).toContainText(
      "按住 C",
    );
    await crew.loader.keyboard.down("c");
    await crew.loader.screenshot({
      path: "/tmp/car-game-to-spec/visual19/warning.png",
      fullPage: true,
    });
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText("空膛");
    await expect(crew.loader.getByTestId("loader-status")).toHaveText(
      "蹲下避險・無法工作",
    );
    await crew.loader.keyboard.down("r");
    await crew.loader.waitForTimeout(500);
    await expect(crew.loader.getByTestId("load-progress")).toHaveText("0");
    await crew.loader.screenshot({
      path: "/tmp/car-game-to-spec/visual19/ducked.png",
      fullPage: true,
    });
    await crew.loader.keyboard.up("c");
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
      { timeout: 20000 },
    );
    await crew.loader.keyboard.up("r");
  } finally {
    await crew.close();
  }
});

test("站立被彈殼擊中固定五秒不能工作，重新按鍵無效且另外兩人繼續", async ({
  browser,
}) => {
  const crew = await tankCrew(browser, "gunner", 0, 1000, undefined, () => {
    const timing = {} as { space?: number; recovered?: number };
    (window as any).__ejectionPublicTiming = timing;
    document.addEventListener("keydown", (event) => {
      if (event.code === "Space" && event.isTrusted && !event.repeat)
        timing.space ??= performance.timeOrigin + event.timeStamp;
    });
    const find = new MutationObserver(() => {
      const status = document.querySelector('[data-testid="loader-status"]');
      if (!status) return;
      find.disconnect();
      new MutationObserver(() => {
        if (status.textContent === "已恢復・可以工作")
          timing.recovered ??= performance.timeOrigin + performance.now();
      }).observe(status, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    });
    find.observe(document, { childList: true, subtree: true });
  });
  try {
    await crew.loader.keyboard.down("r");
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
      { timeout: 20000 },
    );
    await crew.loader.keyboard.up("r");
    const fireAt = Date.now();
    await nativeTaps(crew.gunner, 1, 0, "Space");
    await expect(crew.loader.getByTestId("loader-status")).toContainText(
      "暈眩",
    );
    await expect(crew.loader.getByTestId("stun-remaining")).toHaveText(
      /^[45]\.\d 秒$/,
    );
    await Promise.all([
      (async () => {
        await crew.loader.keyboard.down("r");
        await crew.loader.keyboard.press("c");
        await crew.loader.keyboard.up("r");
        await crew.loader.keyboard.down("r");
      })(),
      (async () => {
        await crew.driver.keyboard.down("s");
        await expect(crew.driver.getByTestId("tank-motion")).toHaveText("倒車");
      })(),
      (async () => {
        await crew.gunner.keyboard.press("d");
        await expect(crew.gunner.getByTestId("turret-yaw-rate")).not.toHaveText(
          "0.0°/s",
        );
      })(),
    ]);
    // Capture stun in the dedicated interior visual case. A full-page GPU
    // screenshot here can consume the fixed five-second measurement window.
    console.log("stun before wall wait elapsed", Date.now() - fireAt);
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, 5500 - (Date.now() - fireAt))),
    );
    console.log("stun sample elapsed", Date.now() - fireAt);
    await expect(crew.loader.getByTestId("loader-status")).toContainText(
      "暈眩",
    );
    await expect(crew.loader.getByTestId("load-progress")).toHaveText("0");
    await expect(crew.loader.getByTestId("loader-status")).toHaveText(
      "已恢復・可以工作",
      { timeout: 1200 },
    );
    // Space → ~0.8s ejection → fixed 5s stun. Locator polling can first
    // observe the stun hundreds of ms after impact, so time from the key event.
    const [fire, recovery] = await Promise.all([
      crew.gunner.evaluate(
        () => (window as any).__ejectionPublicTiming.space as number,
      ),
      crew.loader.evaluate(
        () => (window as any).__ejectionPublicTiming.recovered as number,
      ),
    ]);
    const observedElapsed = recovery - fire;
    console.log("native Space to visible recovery", observedElapsed);
    expect(observedElapsed).toBeGreaterThanOrEqual(5600);
    expect(observedElapsed).toBeLessThan(6300);
    await expect
      .poll(async () =>
        Number(await crew.loader.getByTestId("load-progress").textContent()),
      )
      .toBeGreaterThan(0);
    await crew.loader.keyboard.up("r");
    await crew.driver.keyboard.up("s");
  } finally {
    await crew.close();
  }
});

test("大廳等候後開局空膛，只有裝填手能蹲且保留已完成進度", async ({
  browser,
}) => {
  const crew = await tankCrew(browser, "loader", 1500);
  try {
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText("空膛");
    await expect(crew.loader.getByTestId("load-progress")).toHaveText("0");
    await crew.driver.keyboard.down("c");
    await crew.gunner.keyboard.down("c");
    await expect(crew.loader.getByTestId("loader-status")).toHaveText(
      "站立・可以工作",
    );
    await crew.loader.keyboard.down("r");
    await expect
      .poll(async () =>
        Number(await crew.loader.getByTestId("load-progress").textContent()),
      )
      .toBeGreaterThan(20);
    await crew.loader.keyboard.down("c");
    await expect(crew.loader.getByTestId("loader-status")).toHaveText(
      "蹲下避險・無法工作",
    );
    const savedProgress = await crew.loader
      .getByTestId("load-progress")
      .textContent();
    await crew.loader.waitForTimeout(500);
    await expect(crew.loader.getByTestId("load-progress")).toHaveText(
      savedProgress!,
    );
    await crew.loader.keyboard.up("c");
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.loader.keyboard.up("r");
    await crew.driver.keyboard.up("c");
    await crew.gunner.keyboard.up("c");
  } finally {
    await crew.close();
  }
});
