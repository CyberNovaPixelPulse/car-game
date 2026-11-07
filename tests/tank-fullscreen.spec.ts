import { test, expect, type Page } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

const evidence =
  process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/34";

async function fullscreen(page: Page, active: boolean) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.fullscreenElement?.classList.contains("battle-station") ??
          false,
      ),
    )
    .toBe(active);
  await expect(
    page.getByRole("button", {
      name: active ? "退出全螢幕" : "進入全螢幕",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", String(active));
  await expect(page.locator("#station-fullscreen")).toBeEnabled();
}

async function visibleBattle(page: Page, view: string) {
  for (const element of [
    page.getByRole("img", { name: view, exact: true }),
    page.getByTestId("tank-health"),
    page.getByTestId("wave-status"),
    page.locator("#station-fullscreen"),
    page.locator("#station-leave"),
  ]) {
    await expect(element).toBeInViewport({ ratio: 1 });
  }
  await expect
    .poll(() =>
      page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>(
          ".battle-station canvas",
        )!;
        const box = canvas.getBoundingClientRect();
        return [
          box.x,
          box.y,
          box.width === innerWidth,
          box.height === innerHeight,
        ];
      }),
    )
    .toEqual([0, 0, true, true]);
}

test("每位乘員自行以可信按鈕進出完整工作站全螢幕，鍵盤啟用不誤射", async ({
  browser,
}) => {
  const c = await tankCrew(browser);
  try {
    await c.loader.keyboard.down("r");
    await expect(c.loader.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    for (const page of [c.loader, c.driver, c.gunner]) {
      expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
      await fullscreen(page, false);
    }
    for (const [page, role, view] of [
      [c.driver, "driver", "駕駛裝甲觀察窗"],
      [c.gunner, "gunner", "主炮戰場視野"],
      [c.loader, "loading", "車內炮膛與彈藥架"],
    ] as const) {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page
        .getByRole("button", { name: "進入全螢幕", exact: true })
        .click();
      await fullscreen(page, true);
      await visibleBattle(page, view);
      if (page === c.gunner) {
        const before = await page.getByTestId("turret-heading").textContent();
        await page.keyboard.down("ArrowRight");
        await expect(page.getByTestId("turret-heading")).not.toHaveText(
          before!,
        );
        await page.keyboard.up("ArrowRight");
        await expect(page.getByTestId("turret-yaw-rate")).toHaveText("0.0°/s");
      }
      await page.screenshot({
        path: `${evidence}/${role}-fullscreen-1280.png`,
      });
      for (const other of [c.loader, c.driver, c.gunner].filter(
        (other) => other !== page,
      ))
        await fullscreen(other, false);
      await page.keyboard.press("Escape");
      await fullscreen(page, false);
      await page
        .getByRole("button", { name: "進入全螢幕", exact: true })
        .press("Space");
      await fullscreen(page, true);
      await page
        .getByRole("button", { name: "退出全螢幕", exact: true })
        .press("Space");
      await fullscreen(page, false);
      await visibleBattle(page, view);
      await expect(c.gunner.getByTestId("shot-count")).toHaveText("0");
      await expect(c.gunner.getByTestId("chamber-state")).toHaveText(
        "主炮就緒",
      );
      await page.setViewportSize({ width: 1440, height: 1050 });
      await visibleBattle(page, view);
    }
    // Focused display controls retain native keyboard behavior, including Tab.
    await c.loader.locator("#station-fullscreen").press("Tab");
    await expect(c.loader.getByTestId("loader-mode")).toHaveText("裝填模式");
    await c.loader.locator("#station-sound").press("Space");
    await expect(c.loader.locator("#station-sound")).toHaveText("音效：關");
    await expect(c.loader.getByTestId("jam-result")).toHaveText("按空白鍵停針");
    await c.loader
      .getByRole("img", { name: "車內炮膛與彈藥架", exact: true })
      .click({ position: { x: 700, y: 600 } });
    await c.loader.keyboard.press("Tab");
    await expect(c.loader.getByTestId("loader-mode")).toHaveText("機槍模式");
  } finally {
    await c.close();
  }
});

test("瀏覽器權限不開放全螢幕時有可見提示，音效控制後仍能裝填及留在同房", async ({
  browser,
}) => {
  const contexts = await Promise.all(
    [0, 1, 2].map(() =>
      browser.newContext({
        baseURL:
          process.env.BASE_URL ||
          `http://127.0.0.1:${process.env.WEB_PORT || 4273}`,
        viewport: { width: 1280, height: 720 },
      }),
    ),
  );
  try {
    // Intercepted main-document responses have no local IP classification in
    // Chromium; keep the local test relay reachable via its real permission.
    await contexts[0].grantPermissions(["local-network-access"]);
    // Real browser Permissions Policy, not replacement fullscreen functions.
    await contexts[0].route("**/", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          "permissions-policy": "fullscreen=()",
        },
      });
    });
    const pages = await Promise.all(
      contexts.map((context) => context.newPage()),
    );
    const [loader, driver, gunner] = pages;
    for (const [index, page] of pages.entries()) {
      await page.goto("/");
      await page.getByLabel("乘員名稱").fill(`全螢幕權限乘員${index}`);
    }
    await loader.getByRole("button", { name: "建立房間", exact: true }).click();
    const code = await loader.getByTestId("room-code").textContent();
    for (const page of [driver, gunner]) {
      await page.getByLabel("房間代碼").fill(code!);
      await page.getByRole("button", { name: "加入房間", exact: true }).click();
    }
    for (const [page, role] of [
      [loader, "裝填手"],
      [driver, "駕駛"],
      [gunner, "砲手"],
    ] as const) {
      await page
        .getByRole("button", { name: `擔任${role}`, exact: true })
        .click();
      await page.getByRole("button", { name: "準備", exact: true }).click();
    }
    await loader.getByRole("button", { name: "開始戰鬥", exact: true }).click();
    await expect(loader.locator("#station-display-status")).toContainText(
      "此瀏覽器無法使用全螢幕",
    );
    await expect(loader.locator("#station-fullscreen")).toBeDisabled();
    expect(await loader.evaluate(() => document.fullscreenEnabled)).toBe(false);
    expect(await loader.evaluate(() => document.fullscreenElement)).toBeNull();
    await visibleBattle(loader, "車內炮膛與彈藥架");
    await loader.locator("#station-sound").click();
    await loader.keyboard.down("r");
    await expect(loader.getByTestId("load-progress")).not.toHaveText("0");
    await loader.keyboard.up("r");
    await expect(gunner.getByTestId("load-progress")).not.toHaveText("0");
    await loader.screenshot({ path: `${evidence}/policy-fallback-1280.png` });
    await driver
      .getByRole("button", { name: "進入全螢幕", exact: true })
      .click();
    await fullscreen(driver, true);
    await expect(
      loader.getByRole("heading", { name: "裝填手工作站", exact: true }),
    ).toBeVisible();
    await expect(gunner.getByTestId("shot-count")).toHaveText("0");
    await loader.locator("#station-leave").click();
    for (const page of pages)
      await expect(page.getByLabel("乘員名稱")).toBeVisible();
    expect(await driver.evaluate(() => document.fullscreenElement)).toBeNull();
  } finally {
    for (const context of contexts) await context.close();
  }
});

test("全螢幕保留裝填與三工作，缺員暫停、結算、同房重玩及離房清除顯示狀態", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const c = await tankCrew(browser);
  try {
    await c.loader.setViewportSize({ width: 1280, height: 720 });
    await c.loader.keyboard.down("r");
    await expect
      .poll(async () =>
        Number(await c.loader.getByTestId("load-progress").textContent()),
      )
      .toBeGreaterThan(10);
    await c.loader.keyboard.up("r");
    let progress = "";
    await expect
      .poll(async () => {
        const now = (await c.loader
          .getByTestId("load-progress")
          .textContent())!;
        const same = now === progress;
        progress = now;
        return same;
      })
      .toBe(true);
    await c.loader.locator("#station-fullscreen").click();
    await fullscreen(c.loader, true);
    await expect(c.loader.getByTestId("load-progress")).toHaveText(progress);
    await expect(
      c.loader.getByRole("img", {
        name: "北方固定朝上的戰場導航",
        exact: true,
      }),
    ).toBeInViewport({ ratio: 1 });
    await c.loader.screenshot({
      path: `${evidence}/loading-fullscreen-1280.png`,
    });
    for (const [mode, name, view] of [
      ["機槍模式", "mg", "機槍戰場視野"],
      ["維修模式", "repair", "車內炮膛與彈藥架"],
    ] as const) {
      await c.loader.keyboard.press("Tab");
      await expect(c.loader.getByTestId("loader-mode")).toHaveText(mode);
      await visibleBattle(c.loader, view);
      await expect(c.loader.getByTestId("load-progress")).toHaveText(progress);
      await c.loader.screenshot({
        path: `${evidence}/${name}-fullscreen-1280.png`,
      });
    }
    await c.loader.setViewportSize({ width: 1440, height: 1050 });
    await visibleBattle(c.loader, "車內炮膛與彈藥架");
    await c.loader.screenshot({
      path: `${evidence}/repair-fullscreen-1440.png`,
    });
    await c.driver.goto("about:blank");
    await expect(c.loader.getByTestId("battle-pause")).toBeInViewport({
      ratio: 1,
    });
    await c.loader.screenshot({
      path: `${evidence}/pause-fullscreen-1440.png`,
    });
    await c.loader.locator("#station-fullscreen").click();
    await fullscreen(c.loader, false);
    await c.loader.locator("#station-fullscreen").click();
    await fullscreen(c.loader, true);
    await c.driver.goto("/");
    await expect(c.loader.getByTestId("battle-pause")).toBeHidden();
    await expect(c.loader.getByTestId("loader-mode")).toHaveText("維修模式");
    await expect(c.loader.getByTestId("load-progress")).toHaveText(progress);
    await c.loader.keyboard.press("Tab");
    await expect(c.loader.getByTestId("loader-mode")).toHaveText("裝填模式");
    await expect(c.loader.getByTestId("load-progress")).toHaveText(progress);
    // Natural enemy damage reaches the ordinary authoritative failure result.
    await expect(c.loader.getByTestId("battle-result")).toHaveText("戰鬥失敗", {
      timeout: 130000,
    });
    await fullscreen(c.loader, true);
    for (const [width, height] of [
      [1280, 720],
      [1440, 1050],
    ] as const) {
      await c.loader.setViewportSize({ width, height });
      await expect(
        c.loader.getByRole("button", { name: "回到房間", exact: true }),
      ).toBeInViewport({ ratio: 1 });
      await expect(c.loader.locator("#station-leave")).toBeInViewport({
        ratio: 1,
      });
      await c.loader.screenshot({
        path: `${evidence}/result-fullscreen-${width}.png`,
      });
    }
    await c.loader
      .getByRole("button", { name: "回到房間", exact: true })
      .click();
    for (const [page, role] of [
      [c.loader, "裝填手"],
      [c.driver, "駕駛"],
      [c.gunner, "砲手"],
    ] as const) {
      await expect(page.getByTestId("room-code")).toHaveText(c.code);
      await expect
        .poll(() => page.evaluate(() => document.fullscreenElement === null))
        .toBe(true);
      await expect(page.locator("#station-fullscreen")).toHaveCount(0);
      await page
        .getByRole("button", { name: `擔任${role}`, exact: true })
        .click();
      await page.getByRole("button", { name: "準備", exact: true }).click();
    }
    await c.loader
      .getByRole("button", { name: "開始戰鬥", exact: true })
      .click();
    for (const page of [c.loader, c.driver, c.gunner])
      await fullscreen(page, false);
    await expect(c.loader.getByTestId("load-progress")).toHaveText("0");
    await c.driver.locator("#station-fullscreen").click();
    await fullscreen(c.driver, true);
    await c.driver.locator("#station-leave").click();
    await expect(c.driver.getByLabel("乘員名稱")).toBeVisible();
    expect(
      await c.driver.evaluate(() => document.fullscreenElement),
    ).toBeNull();
    await expect(c.loader.getByTestId("battle-pause")).toBeVisible();
    await c.loader.locator("#station-fullscreen").click();
    await fullscreen(c.loader, true);
    await c.loader.locator("#station-leave").click();
    for (const page of [c.loader, c.gunner]) {
      await expect(page.getByLabel("乘員名稱")).toBeVisible();
      expect(await page.evaluate(() => document.fullscreenElement)).toBeNull();
      await expect(page.locator("#station-fullscreen")).toHaveCount(0);
    }
    await c.loader.screenshot({ path: `${evidence}/left-room-manual.png` });
  } finally {
    await c.close();
  }
});
