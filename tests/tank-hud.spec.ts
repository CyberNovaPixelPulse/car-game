import { test, expect, type Page } from "@playwright/test";
import { tankCrew } from "./tank-helpers";
import { appendFile } from "node:fs/promises";

const evidence =
  process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/33";
async function fullBattle(page: Page, view: string) {
  const scene = page.getByRole("img", { name: view, exact: true });
  if (view === "主炮戰場視野")
    await expect(
      page.getByText("按住方向鍵左右轉砲", { exact: false }),
    ).toBeVisible();
  await expect(scene).toBeInViewport({ ratio: 1 });
  // The visible render surface itself reaches every page edge; armour is real 3D.
  const size = page.viewportSize()!;
  await expect
    .poll(async () => {
      const box = await scene.boundingBox();
      return box && [box.x, box.y, box.width, box.height];
    })
    .toEqual([0, 0, size.width, size.height]);
  for (const element of [
    page.getByRole("heading", { name: /工作站$/ }),
    page.getByTestId("tank-health"),
    page.getByTestId("tank-speed"),
    page.getByTestId("hull-heading"),
    page.getByTestId("wave-status"),
    page.getByRole("button", { name: "離開房間", exact: true }),
  ])
    await expect(element).toBeInViewport({ ratio: 1 });
  expect(
    await page.evaluate(() => ({
      x: scrollX,
      y: scrollY,
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    })),
  ).toEqual({ x: 0, y: 0, width: size.width, height: size.height });
}
async function capture(page: Page, name: string) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${evidence}/${name}.png` });
  const observation = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      ".battle-station canvas",
    );
    const gl = canvas?.getContext("webgl2");
    const debug = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      epochMs: Date.now(),
      performanceMs: performance.now(),
      width: innerWidth,
      height: innerHeight,
      screen: [screen.width, screen.height],
      fullscreen: !!document.fullscreenElement,
      buffer: canvas ? [canvas.width, canvas.height] : null,
      renderer:
        gl && debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
      quality:
        document.querySelector<HTMLSelectElement>("#station-quality")?.value,
      health: document.querySelector('[data-testid="tank-health"]')
        ?.textContent,
      chamber: document.querySelector('[data-testid="chamber-state"]')
        ?.textContent,
      danger: document.querySelector('[data-testid="ejection-warning"]')
        ?.textContent,
      stun: document.querySelector('[data-testid="stun-remaining"]')
        ?.textContent,
    };
  });
  await appendFile(
    `${evidence}/hud-capture-manifest.jsonl`,
    JSON.stringify({
      name,
      path: `${evidence}/${name}.png`,
      sourceSha: process.env.TANK_SOURCE_SHA || "working-tree",
      ...observation,
    }) + "\n",
  );
}

async function captureFullscreen(page: Page, name: string, view: string) {
  await page.getByRole("button", { name: "進入全螢幕", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await fullBattle(page, view);
  await capture(page, `${name}-fullscreen`);
  await page.getByRole("button", { name: "退出全螢幕", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(false);
}

test("三職位與裝填手三種工作鋪滿頁面，角落資訊和缺員離房控制同屏", async ({
  browser,
}) => {
  const c = await tankCrew(browser);
  try {
    for (const [width, height] of [
      [1280, 720],
      [1440, 1050],
    ] as const) {
      for (const [page, role, view] of [
        [c.driver, "driver", "駕駛裝甲觀察窗"],
        [c.gunner, "gunner", "主炮戰場視野"],
        [c.loader, "loading", "車內炮膛與彈藥架"],
      ] as const) {
        await page.setViewportSize({ width, height });
        await fullBattle(page, view);
        await capture(page, `${role}-${width}`);
        await captureFullscreen(page, `${role}-${width}`, view);
      }
      for (const [mode, name, view] of [
        ["機槍模式", "mg", "機槍戰場視野"],
        ["維修模式", "repair", "車內炮膛與彈藥架"],
      ] as const) {
        await c.loader.keyboard.press("Tab");
        await expect(c.loader.getByTestId("loader-mode")).toHaveText(mode);
        await fullBattle(c.loader, view);
        await expect(c.loader.getByTestId("loader-mode")).toBeInViewport({
          ratio: 1,
        });
        await capture(c.loader, `${name}-${width}`);
        await captureFullscreen(c.loader, `${name}-${width}`, view);
      }
      await c.loader.keyboard.press("Tab");
      await expect(c.loader.getByTestId("loader-mode")).toHaveText("裝填模式");
    }
    await c.driver.goto("about:blank");
    for (const [page, role] of [
      [c.loader, "loading"],
      [c.gunner, "gunner"],
    ] as const) {
      await page.setViewportSize({ width: 1280, height: 720 });
      await expect(page.getByTestId("battle-pause")).toBeInViewport({
        ratio: 1,
      });
      await expect(
        page.getByRole("heading", { name: /工作站$/ }),
      ).toBeInViewport({ ratio: 1 });
      await expect(
        page.getByRole("button", { name: "離開房間", exact: true }),
      ).toBeInViewport({ ratio: 1 });
      await capture(page, `pause-${role}-1280`);
    }
    await c.loader
      .getByRole("button", { name: "離開房間", exact: true })
      .click();
    await expect(c.gunner.getByLabel("乘員名稱")).toBeVisible();
    await expect(
      c.gunner.getByRole("button", { name: "建立房間", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await capture(c.gunner, "return-menu-1280");
  } finally {
    await c.close();
  }
});

test("危險、三種工作暫停與戰鬥結算保持可讀，回同房及窄入口恢復手冊", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const c = await tankCrew(browser, "loader", 0, 2);
  try {
    for (const page of [c.driver, c.gunner, c.loader])
      await page.setViewportSize({ width: 1280, height: 720 });
    await c.loader.keyboard.down("r");
    await expect(c.loader.getByTestId("chamber-state")).toHaveText("卡彈");
    await c.loader.keyboard.up("r");
    await expect(
      c.loader.getByRole("region", { name: "卡彈排除" }),
    ).toBeInViewport({ ratio: 1 });
    await capture(c.loader, "danger-jam-1280");
    await expect
      .poll(
        async () => {
          const needle = await c.loader.getByTestId("jam-needle").boundingBox();
          const zone = await c.loader.getByTestId("jam-zone").boundingBox();
          return !!(
            needle &&
            zone &&
            needle.x > zone.x + zone.width * 0.25 &&
            needle.x < zone.x + zone.width * 0.6
          );
        },
        { intervals: [16] },
      )
      .toBe(true);
    await c.loader.keyboard.press("Space");
    await expect(c.loader.getByTestId("jam-result")).toHaveText(
      "解除成功，繼續裝填",
    );
    await c.loader.keyboard.down("r");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    await c.gunner.keyboard.press("Space");
    await expect(c.loader.getByTestId("ejection-warning")).toContainText(
      "彈殼即將退出",
    );
    await expect(c.loader.getByTestId("ejection-warning")).toBeInViewport({
      ratio: 1,
    });
    await capture(c.loader, "danger-ejection-1280");
    await expect(c.loader.getByTestId("loader-status")).toContainText("暈眩");
    await expect(c.loader.getByTestId("stun-remaining")).toBeInViewport({
      ratio: 1,
    });
    await capture(c.loader, "danger-stunned-1280");
    await expect(c.loader.getByTestId("loader-status")).not.toContainText(
      "暈眩",
      { timeout: 6500 },
    );
    await c.loader.keyboard.press("Tab");
    await expect(c.loader.getByTestId("loader-mode")).toHaveText("機槍模式");
    await c.loader.keyboard.down("Space");
    await expect(c.loader.getByTestId("mg-status")).toHaveText(
      "過熱・強制冷卻",
    );
    await c.loader.keyboard.up("Space");
    await expect(c.loader.getByTestId("mg-cooldown")).toBeInViewport({
      ratio: 1,
    });
    await capture(c.loader, "danger-overheated-1280");
    await c.driver.goto("about:blank");
    await expect(c.loader.getByTestId("battle-pause")).toBeInViewport({
      ratio: 1,
    });
    await capture(c.loader, "pause-mg-1280");
    await c.driver.goto("/");
    await expect(c.loader.getByTestId("battle-pause")).toBeHidden();
    await c.loader.keyboard.press("Tab");
    await expect(c.loader.getByTestId("loader-mode")).toHaveText("維修模式");
    await c.driver.goto("about:blank");
    await expect(c.loader.getByTestId("battle-pause")).toBeInViewport({
      ratio: 1,
    });
    await expect(c.loader.getByTestId("repair-status")).toBeInViewport({
      ratio: 1,
    });
    await expect(c.loader.getByTestId("tank-health")).toBeInViewport({
      ratio: 1,
    });
    await capture(c.loader, "pause-repair-1280");
    await c.driver.goto("/");
    await expect(c.loader.getByTestId("battle-pause")).toBeHidden();
    await c.gunner.goto("about:blank");
    await expect(c.driver.getByTestId("battle-pause")).toBeInViewport({
      ratio: 1,
    });
    await c.driver.waitForLoadState("networkidle");
    await fullBattle(c.driver, "駕駛裝甲觀察窗");
    await capture(c.driver, "pause-driver-1280");
    await c.gunner.goto("/");
    await expect(c.loader.getByTestId("battle-pause")).toBeHidden();
    for (const page of [c.driver, c.gunner, c.loader]) {
      await expect(page.getByTestId("battle-result")).toHaveText("戰鬥失敗", {
        timeout: 120000,
      });
      await expect(page.getByTestId("battle-result")).toBeVisible();
    }
    await expect(
      c.loader.getByRole("region", { name: "車內維修" }),
    ).toBeHidden();
    for (const [width, height] of [
      [1280, 720],
      [1440, 1050],
    ] as const) {
      for (const [page, role] of [
        [c.driver, "driver"],
        [c.gunner, "gunner"],
        [c.loader, "repair"],
      ] as const) {
        await page.setViewportSize({ width, height });
        for (const element of [
          page.getByTestId("battle-result"),
          page.getByTestId("tank-health"),
          page.getByRole("button", { name: "回到房間", exact: true }),
          page.getByRole("button", { name: "離開房間", exact: true }),
        ])
          await expect(element).toBeInViewport({ ratio: 1 });
        await capture(page, `result-${role}-${width}`);
      }
    }
    await c.gunner
      .getByRole("button", { name: "回到房間", exact: true })
      .click();
    for (const page of [c.driver, c.gunner, c.loader]) {
      await expect(page.getByTestId("room-code")).toHaveText(c.code);
      await expect(page.getByTestId("room-code")).toBeInViewport({ ratio: 1 });
    }
    await capture(c.gunner, "same-room-return-1440");
    await c.gunner.setViewportSize({ width: 390, height: 844 });
    expect(
      await c.gunner.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await capture(c.gunner, "same-room-lobby-390");
    await c.loader
      .getByRole("button", { name: "離開房間", exact: true })
      .click();
    await expect(c.gunner.getByLabel("乘員名稱")).toBeVisible();
    await c.gunner.setViewportSize({ width: 390, height: 844 });
    await expect(c.gunner.getByLabel("乘員名稱")).toBeInViewport({ ratio: 1 });
    expect(
      await c.gunner.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await capture(c.gunner, "return-entry-390");
  } finally {
    await c.close();
  }
});
