import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { tankCrew } from "./tank-helpers";

const evidence =
  process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/35";
const quality = (page: Page) =>
  page.getByRole("combobox", { name: "畫質", exact: true });
const drawingBuffer = (page: Page, name: string) =>
  page.getByRole("img", { name, exact: true }).evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    return {
      width: canvas.width,
      height: canvas.height,
      cssWidth: canvas.clientWidth,
      cssHeight: canvas.clientHeight,
    };
  });
const buffer720 = (width: number, height: number) => ({
  width,
  height,
  cssWidth: 1280,
  cssHeight: 720,
});

const health = async (page: Page) =>
  Number((await page.getByTestId("tank-health").textContent())!.split("/")[0]);
const battleKeys = (page: Page) =>
  page.locator(".battle-station").click({ position: { x: 500, y: 600 } });

test("主炮已就緒時畫質選單的空白鍵不開火，返回戰場後同一發仍能正常射擊", async ({
  browser,
}) => {
  const c = await tankCrew(browser, "loader", 0, 1976);
  try {
    await c.loader.keyboard.down("r");
    const deadline = Date.now() + 25000;
    while (
      (await c.loader.getByTestId("chamber-state").textContent()) !== "主炮就緒"
    ) {
      if (Date.now() > deadline) throw new Error("正常裝填未完成");
      if (
        (await c.loader.getByTestId("chamber-state").textContent()) === "卡彈"
      ) {
        const needle = await c.loader.getByTestId("jam-needle").boundingBox();
        const zone = await c.loader.getByTestId("jam-zone").boundingBox();
        if (
          needle &&
          zone &&
          needle.x > zone.x + zone.width * 0.25 &&
          needle.x < zone.x + zone.width * 0.65
        )
          await c.loader.keyboard.press("Space");
      }
      await c.loader.waitForTimeout(20);
    }
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    await c.gunner.keyboard.press("Tab");
    await expect(quality(c.gunner)).toBeFocused();
    await c.gunner.keyboard.press("Space");
    await c.gunner.keyboard.press("Escape");
    await quality(c.gunner).selectOption("high");
    await expect(c.gunner.getByTestId("shot-count")).toHaveText("0");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await battleKeys(c.gunner);
    await c.loader.keyboard.down("c");
    await c.gunner.keyboard.press("Space");
    for (const page of [c.loader, c.gunner])
      await expect(page.getByTestId("shot-count")).toHaveText("1");
    await c.loader.keyboard.up("c");
  } finally {
    await c.close();
  }
});

test("原生選單不轉炮，保留中途裝填與機槍，維修校準跨畫質尺寸全螢幕及缺員暫停不重置", async ({
  browser,
}) => {
  await mkdir(evidence, { recursive: true });
  const c = await tankCrew(browser, "gunner", 0, 1972);
  try {
    for (const page of [c.loader, c.driver, c.gunner])
      await page.setViewportSize({ width: 1280, height: 720 });
    await c.loader.keyboard.press("2");
    await c.loader.keyboard.down("r");
    await expect
      .poll(async () =>
        Number(await c.loader.getByTestId("load-progress").textContent()),
      )
      .toBeGreaterThanOrEqual(25);
    await c.loader.keyboard.up("r");
    await c.loader.waitForTimeout(150);
    const progress = await c.loader.getByTestId("load-progress").textContent();
    const shell = await c.loader.getByTestId("chamber-shell").textContent();
    expect(shell).toBe("穿甲彈（已鎖定）");
    const sameWork = async () => {
      for (const page of [c.loader, c.gunner]) {
        await expect(page.getByTestId("selected-shell")).toHaveText("穿甲彈");
        await expect(page.getByTestId("chamber-shell")).toHaveText(shell!);
        await expect(page.getByTestId("load-progress")).toHaveText(progress!);
        await expect(page.getByTestId("shot-count")).toHaveText("0");
      }
    };
    // Trusted keyboard belongs to the focused native select, not the cannon.
    await c.gunner.keyboard.press("Tab");
    await expect(quality(c.gunner)).toBeFocused();
    await c.gunner.keyboard.press("ArrowUp");
    await c.gunner.keyboard.press("ArrowUp");
    await c.gunner.keyboard.press("Enter");
    await c.gunner.keyboard.press("ArrowDown");
    await c.gunner.keyboard.press("Space");
    await c.gunner.keyboard.press("Escape");
    await expect(c.gunner.getByTestId("turret-heading")).toHaveText("0.0°");
    await expect(c.gunner.getByTestId("turret-yaw-rate")).toHaveText("0.0°/s");
    // Mac's native popup does not commit CDP keyboard selection in this run.
    // Select through Playwright's standard public form-control action; retain
    // the separate assertion that focused arrows/Space never drive the gun.
    await quality(c.gunner).selectOption("low");
    await expect(quality(c.gunner)).toHaveValue("low");
    await sameWork();

    await quality(c.loader).selectOption("high");
    await sameWork();
    await battleKeys(c.loader);
    await c.loader.keyboard.press("Tab");
    await expect(c.loader.getByTestId("loader-mode")).toHaveText("機槍模式");
    await expect
      .poll(() => drawingBuffer(c.loader, "機槍戰場視野"))
      .toEqual(buffer720(2560, 1440));
    await c.loader.keyboard.down("Space");
    await expect
      .poll(async () =>
        Number(await c.loader.getByTestId("mg-shot-count").textContent()),
      )
      .toBeGreaterThanOrEqual(12);
    await c.loader.keyboard.up("Space");
    await c.loader.waitForTimeout(150);
    const shots = await c.loader.getByTestId("mg-shot-count").textContent();
    await quality(c.loader).selectOption("low");
    await expect
      .poll(() => drawingBuffer(c.loader, "機槍戰場視野"))
      .toEqual(buffer720(1280, 720));
    await expect(c.loader.getByTestId("mg-shot-count")).toHaveText(shots!);
    await c.loader.screenshot({ path: `${evidence}/low-mg-720.png` });
    await battleKeys(c.loader);
    await c.loader.keyboard.press("Tab");
    await expect(c.loader.getByTestId("loader-mode")).toHaveText("維修模式");
    await expect
      .poll(() => drawingBuffer(c.loader, "車內炮膛與彈藥架"))
      .toEqual(buffer720(1280, 720));
    await sameWork();

    await expect
      .poll(() => health(c.loader), { timeout: 45000 })
      .toBeLessThanOrEqual(82);
    await c.loader.keyboard.down("r");
    await expect(c.loader.getByTestId("repair-calibration")).toBeVisible({
      timeout: 12000,
    });
    await c.driver.goto("about:blank");
    await expect(c.loader.getByTestId("battle-pause")).toBeVisible();
    await c.loader.waitForTimeout(300);
    const position = await c.loader
      .getByTestId("repair-calibration-position")
      .textContent();
    const target = position!.split("目標")[1];
    const hp = await c.loader.getByTestId("tank-health").textContent();
    await c.loader.keyboard.up("r");
    await quality(c.loader).selectOption("high");
    await c.loader.setViewportSize({ width: 1440, height: 1050 });
    await expect
      .poll(async () => {
        const b = await drawingBuffer(c.loader, "車內炮膛與彈藥架");
        return b.width * b.height;
      })
      .toBeGreaterThan(3_680_000);
    const b = await drawingBuffer(c.loader, "車內炮膛與彈藥架");
    expect(b.width * b.height).toBeLessThanOrEqual(3_686_400);
    expect(Math.abs(b.width / b.height - 1440 / 1050)).toBeLessThan(0.002);
    await c.loader
      .getByRole("button", { name: "進入全螢幕", exact: true })
      .click();
    await expect
      .poll(() =>
        c.loader.evaluate(() =>
          document.fullscreenElement?.matches(".battle-station"),
        ),
      )
      .toBe(true);
    await expect(
      c.loader.getByTestId("repair-calibration-position"),
    ).toHaveText(position!);
    await expect(c.loader.getByTestId("tank-health")).toHaveText(hp!);
    await expect(c.loader.getByTestId("loader-mode")).toHaveText("維修模式");
    await sameWork();
    await c.loader.waitForTimeout(300);
    await c.loader.screenshot({
      path: `${evidence}/high-calibration-paused-fullscreen-1440.png`,
    });
    await writeFile(
      `${evidence}/retained-work.json`,
      JSON.stringify(
        { progress, shell, mgShots: shots, hp, position, nonWideBuffer: b },
        null,
        2,
      ),
    );
    await c.loader
      .getByRole("button", { name: "退出全螢幕", exact: true })
      .click();
    await c.driver.goto("/");
    await expect(c.loader.getByTestId("battle-pause")).toBeHidden();
    await c.loader.waitForTimeout(500);
    await expect(
      c.loader.getByTestId("repair-calibration-position"),
    ).toHaveText(position!);
    await expect(c.loader.getByTestId("tank-health")).toHaveText(hp!);
    await expect(quality(c.loader)).toHaveValue("high");
    await battleKeys(c.loader);
    await c.loader.keyboard.down("r");
    await quality(c.loader).selectOption("low");
    await expect(c.loader.getByTestId("repair-calibration")).toBeVisible();
    expect(
      (await c.loader
        .getByTestId("repair-calibration-position")
        .textContent())!.split("目標")[1],
    ).toBe(target);
    await expect(
      c.loader.getByTestId("repair-calibration-result"),
    ).toContainText("校準中");
    await c.loader.keyboard.up("r");
    await expect(c.loader.getByTestId("repair-calibration-result")).toHaveText(
      "校準失敗・停修兩秒",
    );
    await c.gunner
      .getByRole("button", { name: "離開房間", exact: true })
      .click();
    for (const page of [c.loader, c.driver, c.gunner])
      await expect(page.locator("canvas")).toHaveCount(0);
  } finally {
    await c.close();
  }
});

test("三個職位的低中高畫質更新真實繪圖緩衝，HUD與其他乘員設定獨立", async ({
  browser,
}) => {
  await mkdir(evidence, { recursive: true });
  const c = await tankCrew(browser);
  try {
    const observations = [];
    for (const [page, name, role] of [
      [c.driver, "駕駛裝甲觀察窗", "driver"],
      [c.gunner, "主炮戰場視野", "gunner"],
      [c.loader, "車內炮膛與彈藥架", "loader"],
    ] as const) {
      await page.setViewportSize({ width: 1280, height: 720 });
      await expect(quality(page)).toHaveValue("medium");
      await expect
        .poll(() => drawingBuffer(page, name))
        .toEqual(buffer720(1920, 1080));
      const hud = await page.getByTestId("tank-health").boundingBox();
      for (const [preset, width, height] of [
        ["low", 1280, 720],
        ["high", 2560, 1440],
        ["medium", 1920, 1080],
      ] as const) {
        await quality(page).selectOption(preset);
        await expect
          .poll(() => drawingBuffer(page, name))
          .toEqual(buffer720(width, height));
        expect(await page.getByTestId("tank-health").boundingBox()).toEqual(
          hud,
        );
        await expect(
          page.getByRole("heading", { name: /工作站$/ }),
        ).toBeVisible();
        for (const other of [c.driver, c.gunner, c.loader].filter(
          (other) => other !== page,
        ))
          await expect(quality(other)).toHaveValue("medium");
        observations.push({
          role,
          preset,
          ...(await drawingBuffer(page, name)),
        });
        if (role === "gunner")
          await page.screenshot({
            path: `${evidence}/${preset}-gunner-720.png`,
          });
      }
      await page.screenshot({ path: `${evidence}/medium-${role}-720.png` });
    }
    const renderer = await c.gunner
      .getByRole("img", { name: "主炮戰場視野" })
      .evaluate((element) => {
        const gl = (element as HTMLCanvasElement).getContext("webgl2")!;
        const extension = gl.getExtension("WEBGL_debug_renderer_info");
        return extension
          ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
          : "unavailable";
      });
    await writeFile(
      `${evidence}/actual-buffers.json`,
      JSON.stringify({ renderer, observations }, null, 2),
    );
  } finally {
    await c.close();
  }
});

test("真實GLB載入失敗仍可準備三人房間，程序降級場景沿用所有模式的畫質預算", async ({
  browser,
}) => {
  await mkdir(evidence, { recursive: true });
  const pages: Page[] = [];
  const refused: string[] = [];
  const warnings: string[] = [];
  try {
    for (const name of ["降級裝填房主", "降級駕駛", "降級砲手"]) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      await context.route("**/*.glb", async (route) => {
        refused.push(new URL(route.request().url()).pathname);
        await route.fulfill({
          status: 503,
          contentType: "text/plain",
          body: "Asset unavailable",
        });
      });
      const page = await context.newPage();
      pages.push(page);
      page.on("console", (message) => {
        if (message.type() === "warning" && message.text().includes("改用簡易"))
          warnings.push(message.text().split("\n")[0]);
      });
      await page.goto("/");
      await page.getByLabel("乘員名稱").fill(name);
    }
    const [loader, driver, gunner] = pages;
    await loader.getByRole("button", { name: "建立房間", exact: true }).click();
    const code = await loader.getByTestId("room-code").textContent();
    for (const page of [driver, gunner]) {
      await page.getByLabel("房間代碼").fill(code!);
      await page.getByRole("button", { name: "加入房間", exact: true }).click();
    }
    for (const page of pages)
      await expect(page.getByTestId("crew-list").locator("li")).toHaveCount(3);
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
    for (const [page, name] of [
      [loader, "車內炮膛與彈藥架"],
      [driver, "駕駛裝甲觀察窗"],
      [gunner, "主炮戰場視野"],
    ] as const) {
      await expect(
        page.getByRole("heading", { name: /工作站$/ }),
      ).toBeVisible();
      await expect
        .poll(() => drawingBuffer(page, name))
        .toEqual(buffer720(1920, 1080));
      await quality(page).selectOption("high");
      await expect
        .poll(() => drawingBuffer(page, name))
        .toEqual(buffer720(2560, 1440));
    }
    await gunner.screenshot({
      path: `${evidence}/fallback-high-gunner-720.png`,
    });
    await battleKeys(loader);
    await loader.keyboard.press("Tab");
    await expect(loader.getByTestId("loader-mode")).toHaveText("機槍模式");
    await expect
      .poll(() => drawingBuffer(loader, "機槍戰場視野"))
      .toEqual(buffer720(2560, 1440));
    await quality(loader).selectOption("low");
    await expect
      .poll(() => drawingBuffer(loader, "機槍戰場視野"))
      .toEqual(buffer720(1280, 720));
    await battleKeys(loader);
    await loader.keyboard.press("Tab");
    await expect(loader.getByTestId("loader-mode")).toHaveText("維修模式");
    await expect
      .poll(() => drawingBuffer(loader, "車內炮膛與彈藥架"))
      .toEqual(buffer720(1280, 720));
    expect(refused).toContain("/art/vehicles/sherman.glb");
    expect(refused).toContain("/art/map/normandy.glb");
    expect(warnings.some((warning) => warning.includes("坦克模型"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("地圖模型"))).toBe(true);
    await writeFile(
      `${evidence}/actual-fallback.json`,
      JSON.stringify({ refused, warnings }, null, 2),
    );
    await loader.getByRole("button", { name: "離開房間", exact: true }).click();
    for (const page of pages)
      await expect(page.locator("canvas")).toHaveCount(0);
  } finally {
    for (const page of pages) await page.context().close();
  }
});
