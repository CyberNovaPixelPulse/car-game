import { test, expect, type Page } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

const evidence =
  process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/40";
const hp = async (page: Page) =>
  Number((await page.getByTestId("tank-health").textContent())!.split("/")[0]);
async function repairMode(page: Page) {
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByTestId("loader-mode")).toHaveText("維修模式");
}

test("實際維修才啟動兩秒圓形校準，正常空白鍵完美成功額外3HP並由三方共享", async ({
  browser,
}) => {
  const c = await tankCrew(browser, "gunner", 0, 1972);
  try {
    await repairMode(c.loader);
    await expect
      .poll(() => hp(c.loader), { timeout: 45000 })
      .toBeLessThanOrEqual(82);
    await c.loader.keyboard.down("r");
    await expect(c.loader.getByTestId("repair-calibration")).toBeVisible({
      timeout: 12000,
    });
    await expect(
      c.loader.getByTestId("repair-calibration"),
    ).toHaveAccessibleName("維修時機校準");
    // All observations are visible user readouts. The actual keyboard still
    // travels over WebRTC to the host's authoritative needle and HP rule.
    await expect
      .poll(
        async () => {
          const text = await c.loader
            .getByTestId("repair-calibration-position")
            .textContent();
          const [needle, , , perfectStart, perfectEnd] = text!
            .match(/[\d.]+/g)!
            .map(Number);
          return (
            needle >= (perfectStart + perfectEnd) / 2 - 8 &&
            needle <= (perfectStart + perfectEnd) / 2
          );
        },
        { intervals: [10], timeout: 1800 },
      )
      .toBe(true);
    const before = await hp(c.loader);
    await c.loader.keyboard.press("Space");
    await expect(c.loader.getByTestId("repair-calibration-result")).toHaveText(
      "完美校準・額外 +3 HP",
    );
    const after = await hp(c.loader);
    expect(after - before).toBeGreaterThanOrEqual(3);
    expect(after - before).toBeLessThan(3.7);
    await c.loader.keyboard.up("r");
    await expect(c.loader.getByTestId("repair-status")).not.toContainText(
      "維修中",
    );
    const shared = await c.loader.getByTestId("tank-health").textContent();
    for (const page of [c.driver, c.gunner]) {
      await expect(page.getByTestId("tank-health")).toHaveText(shared!);
      await expect(page.getByTestId("repair-calibration-result")).toHaveText(
        "完美校準・額外 +3 HP",
      );
    }
    await c.loader.screenshot({
      path: `${evidence}/calibration-perfect-1440.png`,
    });
  } finally {
    await c.close();
  }
});

test("校準中放開R立即失敗，兩秒停修保留既有HP且重複空白鍵不能重結算", async ({
  browser,
}) => {
  const c = await tankCrew(browser, "gunner", 0, 1972);
  try {
    await repairMode(c.loader);
    await expect
      .poll(() => hp(c.loader), { timeout: 45000 })
      .toBeLessThanOrEqual(82);
    await c.loader.keyboard.down("r");
    await expect(c.loader.getByTestId("repair-calibration")).toBeVisible({
      timeout: 12000,
    });
    const before = await hp(c.loader);
    await c.loader.keyboard.up("r");
    await expect(c.loader.getByTestId("repair-calibration-result")).toHaveText(
      "校準失敗・停修兩秒",
      { timeout: 1200 },
    );
    expect(await hp(c.loader)).toBeGreaterThanOrEqual(before);
    await expect(c.loader.getByTestId("repair-calibration")).toBeHidden();
    await c.loader.keyboard.down("r");
    await expect(c.loader.getByTestId("repair-status")).toContainText(
      "校準失敗等待",
    );
    const remaining = () =>
      c.loader
        .getByTestId("repair-status")
        .textContent()
        .then((text) => Number(text!.match(/[\d.]+/)![0]));
    const start = await remaining();
    expect(start).toBeGreaterThan(1.5);
    expect(start).toBeLessThanOrEqual(2);
    await c.loader.keyboard.press("Space");
    await c.loader.keyboard.press("Space");
    await c.loader.waitForTimeout(400);
    expect(await hp(c.loader)).toBeLessThanOrEqual(before + 0.2);
    expect(await remaining()).toBeLessThan(start - 0.2);
    await expect(c.loader.getByTestId("repair-calibration-result")).toHaveText(
      "校準失敗・停修兩秒",
    );
    await c.loader.keyboard.up("r");
  } finally {
    await c.close();
  }
});

test("活躍校準在真實缺員暫停原位凍結，重連需重新按R且不額外失敗", async ({
  browser,
}) => {
  const c = await tankCrew(browser, "gunner", 0, 1972);
  try {
    await repairMode(c.loader);
    await expect
      .poll(() => hp(c.loader), { timeout: 45000 })
      .toBeLessThanOrEqual(82);
    await c.loader.keyboard.down("r");
    await expect(c.loader.getByTestId("repair-calibration")).toBeVisible({
      timeout: 12000,
    });
    await c.driver.goto("about:blank");
    await expect(c.loader.getByTestId("battle-pause")).toBeVisible();
    await expect(
      c.loader.getByTestId("repair-calibration-result"),
    ).toContainText("校準中", { timeout: 1200 });
    await c.loader.waitForTimeout(300);
    const position = await c.loader
      .getByTestId("repair-calibration-position")
      .textContent();
    const health = await c.loader.getByTestId("tank-health").textContent();
    await c.loader.keyboard.up("r");
    await c.loader.waitForTimeout(4200);
    await expect(
      c.loader.getByTestId("repair-calibration-position"),
    ).toHaveText(position!);
    await expect(c.loader.getByTestId("tank-health")).toHaveText(health!);
    await c.loader.setViewportSize({ width: 1280, height: 720 });
    await c.loader.screenshot({
      path: `${evidence}/calibration-paused-1280.png`,
    });
    await c.driver.goto("/");
    await expect(c.loader.getByTestId("battle-pause")).toBeHidden();
    await expect(c.loader.getByTestId("loader-mode")).toHaveText("維修模式");
    await c.loader.waitForTimeout(500);
    await expect(
      c.loader.getByTestId("repair-calibration-position"),
    ).toHaveText(position!);
    await expect(c.loader.getByTestId("tank-health")).toHaveText(health!);
    await expect(
      c.loader.getByTestId("repair-calibration-result"),
    ).toContainText("重新按住 R");
    await c.loader.keyboard.down("r");
    await expect
      .poll(
        () => c.loader.getByTestId("repair-calibration-position").textContent(),
        { intervals: [50], timeout: 1000 },
      )
      .not.toBe(position);
    await c.loader.keyboard.up("r");
    await expect(c.loader.getByTestId("repair-calibration-result")).toHaveText(
      "校準失敗・停修兩秒",
    );
  } finally {
    await c.close();
  }
});

test("一般校準只額外1HP，三至六秒實際工作後才開始且不改主炮或機槍", async ({
  browser,
}) => {
  const c = await tankCrew(browser, "loader", 0, 1972);
  try {
    await repairMode(c.loader);
    await expect
      .poll(() => hp(c.loader), { timeout: 45000 })
      .toBeLessThanOrEqual(82);
    const worked = c.loader.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const health = document.querySelector('[data-testid="tank-health"]')!;
          const circle = document.querySelector<HTMLElement>(
            '[data-testid="repair-calibration"]',
          )!;
          let previous = Number(health.textContent!.split("/")[0]);
          let restored = 0;
          const observer = new MutationObserver(() => {
            const current = Number(health.textContent!.split("/")[0]);
            restored += Math.max(0, current - previous);
            previous = current;
            if (!circle.hidden) {
              observer.disconnect();
              resolve(restored / 2);
            }
          });
          observer.observe(document.querySelector(".battle-station")!, {
            childList: true,
            characterData: true,
            attributes: true,
            subtree: true,
          });
        }),
    );
    await c.loader.keyboard.down("r");
    await expect(c.loader.getByTestId("repair-calibration")).toBeVisible({
      timeout: 12000,
    });
    expect(await worked).toBeGreaterThanOrEqual(2.9);
    expect(await worked).toBeLessThanOrEqual(6.1);
    await expect
      .poll(
        async () => {
          const values = (await c.loader
            .getByTestId("repair-calibration-position")
            .textContent())!
            .match(/[\d.]+/g)!
            .map(Number);
          expect(values[2] - values[1]).toBeCloseTo(90, 0);
          expect(values[4] - values[3]).toBeGreaterThanOrEqual(21);
          expect(values[4] - values[3]).toBeLessThanOrEqual(22);
          return values[0] >= values[1] + 12 && values[0] <= values[1] + 25;
        },
        { intervals: [10], timeout: 1200 },
      )
      .toBe(true);
    const before = await hp(c.loader);
    await c.loader.keyboard.press("Space");
    await expect(c.loader.getByTestId("repair-calibration-result")).toHaveText(
      "校準成功・額外 +1 HP",
    );
    expect((await hp(c.loader)) - before).toBeGreaterThanOrEqual(1);
    expect((await hp(c.loader)) - before).toBeLessThan(1.7);
    await c.loader.keyboard.press("Space");
    await c.loader.keyboard.up("r");
    await expect(c.loader.getByTestId("repair-status")).not.toContainText(
      "維修中",
    );
    const shared = await c.loader.getByTestId("tank-health").textContent();
    for (const page of [c.driver, c.gunner])
      await expect(page.getByTestId("tank-health")).toHaveText(shared!);
    await expect(c.gunner.getByTestId("shot-count")).toHaveText("0");
    await expect(c.loader.getByTestId("chamber-state")).toHaveText("空膛");
    await c.loader.keyboard.press("Tab");
    await c.loader.keyboard.press("Tab");
    await expect(c.loader.getByTestId("mg-shot-count")).toHaveText("0");
  } finally {
    await c.close();
  }
});

test("按錯、換工作、蹲下、平移與原地轉向都令目前校準只失敗一次", async ({
  browser,
}) => {
  test.setTimeout(240000);
  const c = await tankCrew(browser, "gunner", 0, 1972);
  try {
    await repairMode(c.loader);
    await expect
      .poll(() => hp(c.loader), { timeout: 65000 })
      .toBeLessThanOrEqual(70);
    let previousTarget = "";
    for (const interruption of ["按錯", "切模式", "蹲下", "平移", "原地轉向"]) {
      await test.step(interruption, async () => {
        await c.loader.keyboard.down("r");
        await expect(c.loader.getByTestId("repair-calibration")).toBeVisible({
          timeout: 30000,
        });
        const position = (await c.loader
          .getByTestId("repair-calibration-position")
          .textContent())!;
        const target = position.split("目標")[1];
        expect(target).not.toBe(previousTarget);
        previousTarget = target;
        console.info(
          interruption,
          position,
          await c.loader.getByTestId("repair-status").textContent(),
          await hp(c.loader),
        );
        if (interruption === "按錯") {
          await expect
            .poll(
              async () => {
                const [needle, start, end] = (await c.loader
                  .getByTestId("repair-calibration-position")
                  .textContent())!
                  .match(/[\d.]+/g)!
                  .map(Number);
                return needle < start - 20 || needle > end + 20;
              },
              { intervals: [10], timeout: 1000 },
            )
            .toBe(true);
          await c.loader.keyboard.press("Space");
        } else if (interruption === "切模式")
          await c.loader.keyboard.press("Tab");
        else if (interruption === "蹲下") await c.loader.keyboard.down("c");
        else await c.driver.keyboard.down(interruption === "平移" ? "w" : "d");
        for (const page of [c.loader, c.gunner, c.driver])
          await expect(
            page.getByTestId("repair-calibration-result"),
          ).toHaveText("校準失敗・停修兩秒", { timeout: 1500 });
        await c.loader.keyboard.up("r");
        await c.loader.keyboard.up("c");
        await c.driver.keyboard.up("w");
        await c.driver.keyboard.up("d");
        if (interruption === "切模式") {
          await c.loader.keyboard.press("Tab");
          await c.loader.keyboard.press("Tab");
          await expect(c.loader.getByTestId("loader-mode")).toHaveText(
            "維修模式",
          );
        }
        await expect(c.driver.getByTestId("tank-motion")).toHaveText("靜止");
      });
    }
  } finally {
    await c.close();
  }
});

test("實際敵彈中斷校準，三秒受擊與兩秒失敗取較晚且兩種等待一起凍結", async ({
  browser,
}) => {
  const c = await tankCrew(browser, "gunner", 0, 1000);
  try {
    await repairMode(c.loader);
    await expect
      .poll(() => hp(c.loader), { timeout: 45000 })
      .toBeLessThanOrEqual(82);
    await c.loader.keyboard.down("r");
    await expect(c.loader.getByTestId("repair-calibration")).toBeVisible({
      timeout: 12000,
    });
    const before = await hp(c.loader);
    await expect
      .poll(() => hp(c.loader), { intervals: [20], timeout: 1800 })
      .toBeLessThan(before);
    await expect(c.loader.getByTestId("repair-calibration-result")).toHaveText(
      "校準失敗・停修兩秒",
    );
    const needle = Number(
      (await c.loader
        .getByTestId("repair-calibration-position")
        .textContent())!.match(/[\d.]+/)![0],
    );
    expect(needle).toBeLessThan(330); // Real damage, before the two-second missed-input deadline.
    await expect(c.loader.getByTestId("repair-status")).toContainText(
      "受擊等待",
    );
    const remaining = Number(
      (await c.loader.getByTestId("repair-status").textContent())!.match(
        /[\d.]+/,
      )![0],
    );
    expect(remaining).toBeGreaterThan(2.5);
    expect(remaining).toBeLessThanOrEqual(3);
    await c.driver.goto("about:blank");
    await expect(c.loader.getByTestId("battle-pause")).toBeVisible();
    await c.loader.waitForTimeout(300);
    const wait = await c.loader.getByTestId("repair-status").textContent();
    const health = await c.loader.getByTestId("tank-health").textContent();
    await c.loader.keyboard.up("r");
    await c.loader.waitForTimeout(4200);
    await expect(c.loader.getByTestId("repair-status")).toHaveText(wait!);
    await expect(c.loader.getByTestId("tank-health")).toHaveText(health!);
    await c.driver.goto("/");
    await expect(c.loader.getByTestId("battle-pause")).toBeHidden();
    await expect(c.loader.getByTestId("repair-status")).toContainText(
      "受擊等待",
    );
    await c.loader.keyboard.press("Tab");
    await c.loader.keyboard.press("Tab");
    await c.loader.keyboard.press("Tab");
    await expect(c.loader.getByTestId("repair-status")).toContainText(
      "受擊等待",
    );
    await expect(c.loader.getByTestId("repair-calibration")).toBeHidden();
  } finally {
    await c.close();
  }
});

test("非房主裝填手本人離頁後重連原職位，保留校準目標並等待重新按R", async ({
  browser,
}) => {
  const c = await tankCrew(browser, "gunner", 0, 1972);
  try {
    await repairMode(c.loader);
    await expect
      .poll(() => hp(c.loader), { timeout: 45000 })
      .toBeLessThanOrEqual(82);
    await c.loader.keyboard.down("r");
    await expect(c.loader.getByTestId("repair-calibration")).toBeVisible({
      timeout: 12000,
    });
    const target = (await c.loader
      .getByTestId("repair-calibration-position")
      .textContent())!.split("目標")[1];
    await c.loader.goto("about:blank");
    await expect(c.gunner.getByTestId("battle-pause")).toBeVisible();
    await expect(
      c.gunner.getByTestId("repair-calibration-result"),
    ).toContainText("校準中");
    await c.gunner.waitForTimeout(300);
    const frozen = await c.gunner
      .getByTestId("repair-calibration-result")
      .textContent();
    const health = await c.gunner.getByTestId("tank-health").textContent();
    await c.gunner.waitForTimeout(4200);
    await expect(c.gunner.getByTestId("repair-calibration-result")).toHaveText(
      frozen!,
    );
    await expect(c.gunner.getByTestId("tank-health")).toHaveText(health!);
    await c.loader.goto("/");
    await expect(c.loader.getByTestId("loader-mode")).toHaveText("維修模式");
    await expect(c.loader.getByTestId("repair-calibration-result")).toHaveText(
      frozen!,
    );
    expect(
      (await c.loader
        .getByTestId("repair-calibration-position")
        .textContent())!.split("目標")[1],
    ).toBe(target);
    await expect(c.loader.getByTestId("tank-health")).toHaveText(health!);
    await c.loader.keyboard.up("r");
    await c.loader.keyboard.down("r");
    await expect
      .poll(
        () => c.loader.getByTestId("repair-calibration-result").textContent(),
        { intervals: [30], timeout: 1000 },
      )
      .not.toBe(frozen);
    await c.loader.keyboard.up("r");
  } finally {
    await c.close();
  }
});
