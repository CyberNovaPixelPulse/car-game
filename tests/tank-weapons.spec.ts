import { test, expect, type Page } from "@playwright/test";
import { tankCrew, nativeTaps, elevateCannon } from "./tank-helpers";

test("裝填中斷可續接，砲手就緒後射擊敵車，再退殼裝下一發", async ({
  browser,
}) => {
  const crew = await tankCrew(browser);
  try {
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText("空膛");
    await crew.loader.keyboard.down("r");
    await expect
      .poll(async () =>
        Number(await crew.loader.getByTestId("load-progress").textContent()),
      )
      .toBeGreaterThan(20);
    await crew.loader.keyboard.up("r");
    await crew.loader.waitForTimeout(150);
    const paused = Number(
      await crew.loader.getByTestId("load-progress").textContent(),
    );
    await crew.loader.waitForTimeout(400);
    expect(
      Number(await crew.loader.getByTestId("load-progress").textContent()),
    ).toBe(paused);
    await crew.loader.keyboard.down("r");
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.loader.keyboard.up("r");
    await expect(crew.gunner.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await observeWeaponHud(crew.loader);
    await crew.loader.keyboard.down("c");
    await crew.gunner.keyboard.press("Space");
    await expect
      .poll(() =>
        crew.loader.evaluate(() =>
          (window as any).__weaponHudObservation.timeline.some(
            (row: { chamber: string; progress: string; shots: string }) =>
              row.chamber === "正在退殼" &&
              row.progress === "0" &&
              row.shots === "1",
          ),
        ),
      )
      .toBe(true);
    await expect(crew.gunner.getByTestId("shot-count")).toHaveText("1");
    await expect(crew.gunner.getByTestId("target-status")).toContainText(
      "四號 H 型 100/200",
    );
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText("空膛");
    const ejection = await crew.loader.evaluate(() => {
      const entry = (window as any).__weaponHudObservation;
      entry.observer.disconnect();
      delete (window as any).__weaponHudObservation;
      return entry.timeline as {
        chamber: string;
        progress: string;
        shots: string;
      }[];
    });
    expect(
      ejection
        .filter((row) => row.chamber === "正在退殼")
        .every((row) => row.progress === "0" && row.shots === "1"),
    ).toBe(true);
    await crew.loader.keyboard.up("c");
    await crew.loader.keyboard.down("r");
    await expect(crew.gunner.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.loader.keyboard.up("r");
  } finally {
    await crew.close();
  }
});

test("只有裝填手能裝彈、只有砲手能射擊，連點不會複製同一發", async ({
  browser,
}) => {
  const crew = await tankCrew(browser, "gunner");
  try {
    await crew.gunner.keyboard.press("Space");
    await expect(crew.gunner.getByTestId("shot-count")).toHaveText("0");
    await crew.gunner.keyboard.down("r");
    await crew.driver.keyboard.down("r");
    await crew.loader.waitForTimeout(400);
    await crew.gunner.keyboard.up("r");
    await crew.driver.keyboard.up("r");
    await expect(crew.loader.getByTestId("load-progress")).toHaveText("0");
    await crew.loader.keyboard.down("r");
    await expect(crew.gunner.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.loader.keyboard.up("r");
    await crew.loader.keyboard.press("Space");
    await crew.driver.keyboard.press("Space");
    await crew.gunner.waitForTimeout(150);
    await expect(crew.gunner.getByTestId("shot-count")).toHaveText("0");
    // Observe only the loader's real visible HUD before the short ejection window.
    // Serial Playwright round trips can finish after that 0.8s window has ended.
    await observeWeaponHud(crew.loader);
    await crew.loader.keyboard.down("c");
    // Held R now spans the entire warning/ejection, including when crouched.
    await crew.loader.keyboard.down("r");
    // Three genuinely rapid trusted keydown/up pairs, not three delayed RPCs.
    await nativeTaps(crew.gunner, 3, 0, "Space");
    await expect
      .poll(async () =>
        crew.loader.evaluate(() =>
          (window as any).__weaponHudObservation.timeline.some(
            (row: { chamber: string; progress: string; shots: string }) =>
              row.chamber === "正在退殼" &&
              row.progress === "0" &&
              row.shots === "1",
          ),
        ),
      )
      .toBe(true);
    await expect(crew.gunner.getByTestId("shot-count")).toHaveText("1");
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText("空膛");
    await expect(crew.loader.getByTestId("load-progress")).toHaveText("0");
    const observed = await crew.loader.evaluate(() => {
      const entry = (window as any).__weaponHudObservation;
      entry.observer.disconnect();
      delete (window as any).__weaponHudObservation;
      return entry.timeline as {
        chamber: string;
        progress: string;
        shots: string;
        at: number;
      }[];
    });
    expect(
      observed
        .filter((row) => row.chamber === "正在退殼")
        .every((row) => row.progress === "0" && row.shots === "1"),
    ).toBe(true);
    await crew.loader.keyboard.up("c");
    await expect(crew.gunner.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.loader.keyboard.up("r");
    await expect(crew.loader.getByTestId("shot-count")).toHaveText("1");
  } finally {
    await crew.close();
  }
});

test("仰射砲彈確實飛行後落地，未命中敵車不會憑空擊毀", async ({ browser }) => {
  const crew = await tankCrew(browser);
  try {
    await elevateCannon(crew.gunner);
    await crew.loader.keyboard.down("r");
    await expect(crew.gunner.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.loader.keyboard.up("r");
    await crew.gunner.keyboard.press("Space");
    await expect(crew.gunner.getByTestId("flight-status")).toHaveText(
      "砲彈飛行中",
    );
    await crew.gunner.waitForTimeout(600);
    await expect(crew.gunner.getByTestId("flight-status")).toHaveText(
      "砲彈飛行中",
    );
    await expect(crew.gunner.getByTestId("target-status")).toContainText(
      "完好",
    );
    await expect(crew.gunner.getByTestId("flight-status")).toHaveText("", {
      timeout: 8000,
    });
    await expect(crew.gunner.getByTestId("target-status")).toContainText(
      "完好",
    );
  } finally {
    await crew.close();
  }
});

/** Preserve actual short public HUD transitions before serial RPCs return. */
async function observeWeaponHud(page: Page) {
  await page.evaluate(() => {
    const chamber = document.querySelector('[data-testid="chamber-state"]')!;
    const progress = document.querySelector('[data-testid="load-progress"]')!;
    const shots = document.querySelector('[data-testid="shot-count"]')!;
    const timeline: {
      chamber: string;
      progress: string;
      shots: string;
      at: number;
    }[] = [];
    const observer = new MutationObserver(() => {
      const row = {
        chamber: chamber.textContent!,
        progress: progress.textContent!,
        shots: shots.textContent!,
        at: performance.timeOrigin + performance.now(),
      };
      const prior = timeline.at(-1);
      if (
        !prior ||
        row.chamber !== prior.chamber ||
        row.progress !== prior.progress ||
        row.shots !== prior.shots
      )
        timeline.push(row);
    });
    for (const node of [chamber, progress, shots])
      observer.observe(node, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    (window as any).__weaponHudObservation = { timeline, observer };
  });
}
