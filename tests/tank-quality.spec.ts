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
