import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { tankCrew, nativeTaps } from "./tank-helpers";

test("真實主炮、機槍與敵炮開火的外景火光影像", async ({ browser }) => {
  const dir =
    process.env.TANK_FLASH_EVIDENCE ||
    "/tmp/car-game-to-spec/review-fixes/flash";
  await mkdir(dir, { recursive: true });
  const c = await tankCrew(
    browser,
    "loader",
    0,
    1000,
    `${dir}/video`,
    () => {
      const marks: unknown[] = [];
      (window as any).__publicFiringMarks = marks;
      addEventListener("keydown", (e) => {
        if (e.isTrusted && ["Space", "Tab", "KeyR"].includes(e.code))
          marks.push({
            ms: performance.now(),
            key: e.code,
            shot: document.querySelector('[data-testid="shot-count"]')
              ?.textContent,
            mg: document.querySelector('[data-testid="mg-shot-count"]')
              ?.textContent,
          });
      });
      addEventListener("DOMContentLoaded", () => {
        let last = "";
        new MutationObserver(() => {
          const value = [
            "shot-count",
            "mg-shot-count",
            "enemy-warning",
            "enemy-activity",
            "tank-health",
          ]
            .map(
              (id) =>
                `${id}=${document.querySelector(`[data-testid="${id}"]`)?.textContent || ""}`,
            )
            .join(";");
          if (value !== last) {
            last = value;
            marks.push({ ms: performance.now(), hud: value });
          }
        }).observe(document.body, {
          subtree: true,
          childList: true,
          characterData: true,
        });
      });
    },
    { recordVideoRequired: true },
  );
  try {
    const gpu = await c.gunner.locator("canvas").evaluateAll((canvases) =>
      canvases.map((canvas) => {
        const gl = (canvas as HTMLCanvasElement).getContext("webgl2");
        const ext = gl?.getExtension("WEBGL_debug_renderer_info");
        return ext
          ? gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)
          : "unavailable";
      }),
    );
    await writeFile(`${dir}/actual-gpu.json`, JSON.stringify(gpu));
    await c.loader.keyboard.down("r");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    await c.loader.keyboard.down("c");
    await nativeTaps(c.gunner, 1, 0, "Space");
    await expect(c.gunner.getByTestId("shot-count")).toHaveText("1");
    await c.loader.keyboard.up("c");
    await c.loader.keyboard.press("Tab");
    await expect(c.loader.getByTestId("loader-mode")).toHaveText("機槍模式");
    await c.loader.screenshot({ path: `${dir}/mg-view.png` });
    await c.loader.keyboard.down("Space");
    await expect
      .poll(async () =>
        Number(await c.loader.getByTestId("mg-shot-count").textContent()),
      )
      .toBeGreaterThan(12);
    await c.loader.keyboard.up("Space");
    await c.gunner.screenshot({ path: `${dir}/gunner-view.png` });
    // Natural enemy aim/warning/shot cycle; no state or timer alteration.
    await c.gunner.waitForTimeout(24000);
    await expect(c.gunner.getByTestId("tank-health")).not.toHaveText("100/100");
    for (const [role, page] of [
      ["gunner", c.gunner],
      ["loader", c.loader],
    ] as const) {
      await writeFile(
        `${dir}/${role}-public-marks.json`,
        JSON.stringify(
          await page.evaluate(() => (window as any).__publicFiringMarks),
          null,
          2,
        ),
      );
    }
  } finally {
    await c.close();
    await c.gunner.video()!.saveAs(`${dir}/gunner.webm`);
    await c.loader.video()!.saveAs(`${dir}/loader.webm`);
  }
});
