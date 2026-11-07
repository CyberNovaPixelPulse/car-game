import { test, expect, type Page } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

const evidence =
  process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/39";
const hp = async (page: Page) =>
  Number((await page.getByTestId("tank-health").textContent())!.split("/")[0]);
async function noHealing(page: Page, milliseconds = 400) {
  const before = await hp(page);
  await page.waitForTimeout(milliseconds);
  // Real enemies may still damage the hull. A blocked repair must never add HP.
  expect(await hp(page)).toBeLessThanOrEqual(before);
}
/** A remote pause notice can precede the host's final frozen snapshot. Require
 * public work/HP to settle within 1s; a live 0.1s countdown cannot pass this
 * 250ms stability barrier. The subsequent 4.2s freeze assertion stays exact. */
async function frozenRepairReadout(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ status: string; health: string }>((resolve, reject) => {
        const read = () => ({
          status: document.querySelector('[data-testid="repair-status"]')!
            .textContent!,
          health: document.querySelector('[data-testid="tank-health"]')!
            .textContent!,
        });
        let current = read();
        const done = () => {
          clearTimeout(deadline);
          observer.disconnect();
          resolve(current);
        };
        let settled = setTimeout(done, 250);
        const deadline = setTimeout(() => {
          clearTimeout(settled);
          observer.disconnect();
          reject(new Error("暫停後公開維修倒數或血量仍持續改變"));
        }, 1000);
        const observer = new MutationObserver(() => {
          const next = read();
          if (next.status === current.status && next.health === current.health)
            return;
          current = next;
          clearTimeout(settled);
          settled = setTimeout(done, 250);
        });
        observer.observe(document.querySelector(".battle-station")!, {
          childList: true,
          characterData: true,
          subtree: true,
        });
      }),
  );
}
async function repairMode(page: Page) {
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("loader-mode")).toHaveText("維修模式");
}

test("移動、原地轉向、蹲下、放開R與切工作立即停止維修，重新停穩可續修", async ({
  browser,
}) => {
  const c = await tankCrew(browser, "gunner");
  try {
    await repairMode(c.loader);
    await expect(c.loader.getByTestId("tank-health")).not.toHaveText(
      "100/100",
      { timeout: 20000 },
    );
    await c.loader.keyboard.down("r");
    await c.driver.keyboard.down("s");
    await expect(c.loader.getByTestId("repair-status")).toContainText(
      "停車並停止轉向",
    );
    await noHealing(c.loader);
    await c.driver.keyboard.up("s");
    await expect(c.driver.getByTestId("tank-speed")).toHaveText("0.0");
    await c.driver.keyboard.down("d");
    await expect(c.loader.getByTestId("repair-status")).toContainText(
      "停車並停止轉向",
    );
    await expect(c.driver.getByTestId("tank-speed")).toHaveText("0.0");
    await noHealing(c.loader);
    await c.driver.keyboard.up("d");
    await c.loader.keyboard.down("c");
    await expect(c.loader.getByTestId("repair-status")).toContainText(
      "蹲下避險",
    );
    await noHealing(c.loader);
    await c.loader.keyboard.up("c");
    await expect(c.loader.getByTestId("repair-status")).toContainText(
      "維修中",
      { timeout: 6500 },
    );
    await c.loader.keyboard.up("r");
    await expect(c.loader.getByTestId("repair-status")).toContainText("按住 R");
    await noHealing(c.loader);
    await c.loader.keyboard.down("r");
    await expect(c.loader.getByTestId("repair-status")).toContainText("維修中");
    await c.loader.keyboard.press("Tab");
    await expect(c.loader.getByTestId("loader-mode")).toHaveText("裝填模式");
    await noHealing(c.loader);
    await c.loader.keyboard.up("r");
    await repairMode(c.loader);
    await c.loader.keyboard.down("r");
    await expect(c.loader.getByTestId("repair-status")).toContainText(
      "維修中",
      { timeout: 6500 },
    );
    await c.loader.keyboard.up("r");
  } finally {
    await c.close();
  }
});

test("受擊禁修與有效維修都在缺員時凍結，原職位重連不補算或自動續修", async ({
  browser,
}) => {
  const c = await tankCrew(browser, "gunner");
  try {
    await repairMode(c.loader);
    await expect(c.loader.getByTestId("repair-status")).toContainText(
      "受擊等待",
      { timeout: 20000 },
    );
    await c.driver.goto("about:blank");
    await expect(c.loader.getByTestId("battle-pause")).toBeVisible();
    const frozenWait = await frozenRepairReadout(c.loader);
    const waiting = frozenWait.status;
    const damaged = frozenWait.health;
    await c.loader.waitForTimeout(4200);
    await expect(c.loader.getByTestId("repair-status")).toHaveText(waiting!);
    await expect(c.loader.getByTestId("tank-health")).toHaveText(damaged!);
    await c.driver.goto("/");
    await expect(c.loader.getByTestId("battle-pause")).toBeHidden();
    await expect(c.loader.getByTestId("repair-status")).toContainText(
      "受擊等待",
    );
    await c.loader.keyboard.down("r");
    await c.loader.waitForTimeout(500);
    await expect(c.loader.getByTestId("tank-health")).toHaveText(damaged!);
    await expect(c.loader.getByTestId("repair-status")).toContainText(
      "維修中",
      { timeout: 4500 },
    );
    await c.driver.goto("about:blank");
    await expect(c.loader.getByTestId("battle-pause")).toBeVisible();
    const frozenWork = await frozenRepairReadout(c.loader);
    const repaired = frozenWork.health;
    const working = frozenWork.status;
    await c.loader.keyboard.up("r");
    await c.loader.waitForTimeout(4200);
    await expect(c.loader.getByTestId("tank-health")).toHaveText(repaired!);
    await expect(c.loader.getByTestId("repair-status")).toHaveText(working!);
    await c.loader.setViewportSize({ width: 1280, height: 720 });
    await c.loader.screenshot({ path: `${evidence}/repair-paused-1280.png` });
    await c.driver.goto("/");
    await expect(c.loader.getByTestId("battle-pause")).toBeHidden();
    await expect(c.loader.getByTestId("loader-mode")).toHaveText("維修模式");
    await expect(c.loader.getByTestId("repair-status")).toContainText("按住 R");
    await c.loader.waitForTimeout(500);
    await Promise.all(
      [c.loader, c.gunner, c.driver].map((p) =>
        expect(p.getByTestId("tank-health")).toHaveText(repaired!),
      ),
    );
    await c.loader.keyboard.down("r");
    await expect(c.loader.getByTestId("repair-status")).toContainText("維修中");
    await c.loader.keyboard.up("r");
  } finally {
    await c.close();
  }
});

test("維修保留AP卡彈，空白鍵不能排除其他工作的故障", async ({ browser }) => {
  const c = await tankCrew(browser, "gunner", 0, 1);
  try {
    await c.loader.keyboard.press("2");
    await c.loader.keyboard.down("r");
    await expect(c.loader.getByTestId("chamber-state")).toHaveText("卡彈");
    await c.loader.keyboard.up("r");
    const zone = await c.loader.getByTestId("jam-zone").getAttribute("style");
    await repairMode(c.loader);
    await c.loader.keyboard.press("Space");
    await c.loader.keyboard.down("r");
    await c.loader.waitForTimeout(400);
    await expect(c.loader.getByTestId("chamber-state")).toHaveText("卡彈");
    await expect(c.loader.getByTestId("load-progress")).toHaveText("40");
    await expect(c.loader.getByTestId("chamber-shell")).toHaveText(
      "穿甲彈（已鎖定）",
    );
    await c.loader.keyboard.up("r");
    await c.loader.keyboard.press("Tab");
    await expect(c.loader.getByTestId("loader-mode")).toHaveText("裝填模式");
    await expect(c.loader.getByTestId("chamber-state")).toHaveText("卡彈");
    await expect(c.loader.getByTestId("jam-zone")).toBeVisible();
    await expect(c.loader.getByTestId("jam-zone")).toHaveAttribute(
      "style",
      zone!,
    );
    await expect(c.loader.getByTestId("jam-result")).toHaveText("按空白鍵停針");
  } finally {
    await c.close();
  }
});

test("維修仍有退殼預警、C蹲下與固定五秒暈眩", async ({ browser }) => {
  const c = await tankCrew(browser);
  try {
    await c.loader.keyboard.down("r");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    await repairMode(c.loader);
    await c.loader.keyboard.down("c");
    await c.gunner.keyboard.press("Space");
    await expect(c.loader.getByTestId("ejection-warning")).toContainText(
      "按住 C",
    );
    await expect(c.loader.getByTestId("ejection-warning")).toBeInViewport();
    await expect(c.loader.getByTestId("chamber-state")).toHaveText("空膛");
    await expect(c.loader.getByTestId("loader-status")).toContainText("蹲下");
    await c.loader.keyboard.up("c");
    await c.loader.keyboard.press("Tab");
    await c.loader.keyboard.down("r");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    await repairMode(c.loader);
    await c.gunner.keyboard.press("Space");
    await expect(c.loader.getByTestId("repair-status")).toContainText("暈眩");
    const stunnedAt = Date.now();
    const remaining = Number(
      (await c.loader.getByTestId("stun-remaining").textContent())!.split(
        " ",
      )[0],
    );
    expect(remaining).toBeGreaterThan(4.3);
    expect(remaining).toBeLessThanOrEqual(5);
    await c.loader.keyboard.down("r");
    await c.loader.keyboard.press("Tab");
    await noHealing(c.loader);
    await expect(c.loader.getByTestId("loader-mode")).toHaveText("維修模式");
    await c.loader.setViewportSize({ width: 1280, height: 720 });
    await c.loader.screenshot({ path: `${evidence}/repair-stunned-1280.png` });
    await expect(c.loader.getByTestId("stun-remaining")).toHaveText("", {
      timeout: 6000,
    });
    expect(Date.now() - stunnedAt).toBeGreaterThanOrEqual(4300);
    expect(Date.now() - stunnedAt).toBeLessThan(6500);
    await c.loader.keyboard.up("r");
  } finally {
    await c.close();
  }
});

test("維修模式血量歸零立即失敗，不能復活；同房換職新局重設修理", async ({
  browser,
}) => {
  const c = await tankCrew(browser, "gunner");
  try {
    await repairMode(c.loader);
    for (const p of [c.loader, c.gunner, c.driver]) {
      await expect(p.getByTestId("battle-result")).toHaveText("戰鬥失敗", {
        timeout: 85000,
      });
      await expect(p.getByTestId("tank-health")).toHaveText("0/100");
    }
    await c.loader.keyboard.down("r");
    await c.loader.keyboard.press("Space");
    await c.loader.waitForTimeout(1000);
    for (const p of [c.loader, c.gunner, c.driver])
      await expect(p.getByTestId("tank-health")).toHaveText("0/100");
    await expect(c.loader.getByTestId("repair-status")).toContainText(
      "無法維修復活",
    );
    await c.loader.keyboard.up("r");
    await c.gunner
      .getByRole("button", { name: "回到房間", exact: true })
      .click();
    for (const [p, role] of [
      [c.loader, "砲手"],
      [c.driver, "駕駛"],
      [c.gunner, "裝填手"],
    ] as const) {
      await expect(p.getByTestId("room-code")).toHaveText(c.code);
      await p.getByRole("button", { name: `擔任${role}`, exact: true }).click();
      await p.getByRole("button", { name: "準備", exact: true }).click();
    }
    await c.gunner
      .getByRole("button", { name: "開始戰鬥", exact: true })
      .click();
    await expect(c.gunner.getByTestId("loader-mode")).toHaveText("裝填模式");
    await repairMode(c.gunner);
    await expect(c.gunner.getByTestId("repair-status")).toHaveText(
      "車體完好・100 / 100 HP",
    );
    for (const p of [c.loader, c.gunner, c.driver])
      await expect(p.getByTestId("tank-health")).toHaveText("100/100");
  } finally {
    await c.close();
  }
});

test("三秒禁修期間再次被真實敵彈命中，倒數從最新傷害重算", async ({
  browser,
}) => {
  const c = await tankCrew(browser);
  try {
    await repairMode(c.loader);
    const pair = await c.loader.evaluate(
      () =>
        new Promise<{ gap: number; status: string }>((resolve, reject) => {
          const health = document.querySelector('[data-testid="tank-health"]')!;
          let previous = Number(health.textContent!.split("/")[0]);
          let lastHit = -Infinity;
          const timeout = setTimeout(() => {
            observer.disconnect();
            reject(new Error("未觀察到三秒內相繼命中的正常敵彈"));
          }, 45000);
          const observer = new MutationObserver(() => {
            const current = Number(health.textContent!.split("/")[0]);
            if (current < previous) {
              const now = performance.now();
              const gap = now - lastHit;
              lastHit = now;
              if (gap < 3000) {
                clearTimeout(timeout);
                observer.disconnect();
                resolve({
                  gap,
                  status: document.querySelector(
                    '[data-testid="repair-status"]',
                  )!.textContent!,
                });
              }
            }
            previous = current;
          });
          observer.observe(health, {
            childList: true,
            characterData: true,
            subtree: true,
          });
        }),
    );
    expect(pair.gap).toBeGreaterThan(0);
    expect(pair.status).toMatch(/受擊等待・[23]\.\d 秒後可維修/);
    // At the old hit's deadline, the newest hit still blocks repair. The real
    // countdown must therefore survive the old deadline instead of clearing.
    await c.loader.waitForTimeout(3100 - pair.gap);
    await expect(c.loader.getByTestId("repair-status")).toContainText(
      "受擊等待",
    );
    await c.loader.screenshot({
      path: `${evidence}/repair-repeated-hit-1440.png`,
    });
  } finally {
    await c.close();
  }
});
