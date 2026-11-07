import { test, expect } from "@playwright/test";
import { tankCrew, observeTiger } from "./tank-helpers";
test("裝填手選彈經連線同步，開裝後鎖定至發射且保留進度", async ({
  browser,
}) => {
  const c = await tankCrew(browser, "gunner");
  try {
    await c.loader.keyboard.press("2");
    await expect(c.gunner.getByTestId("selected-shell")).toHaveText("穿甲彈");
    await c.loader.keyboard.down("r");
    await expect
      .poll(async () =>
        Number(await c.loader.getByTestId("load-progress").textContent()),
      )
      .toBeGreaterThan(20);
    await c.loader.keyboard.up("r");
    await c.loader.waitForTimeout(200);
    const progress = await c.loader.getByTestId("load-progress").textContent();
    await c.loader.keyboard.press("1");
    await expect(c.gunner.getByTestId("chamber-shell")).toHaveText(
      "穿甲彈（已鎖定）",
    );
    await expect(c.loader.getByTestId("selected-shell")).toHaveText("穿甲彈");
    await expect(c.loader.getByTestId("load-progress")).toHaveText(progress!);
    await c.loader.keyboard.down("r");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    await c.loader.keyboard.press("1");
    await expect(c.gunner.getByTestId("chamber-shell")).toHaveText(
      "穿甲彈（已鎖定）",
    );
    await c.gunner.keyboard.press("Space");
    await c.gunner.keyboard.press("Space");
    await expect(c.gunner.getByTestId("shot-count")).toHaveText("1");
    await c.loader.keyboard.press("1");
    await expect(c.gunner.getByTestId("selected-shell")).toHaveText("高爆彈");
  } finally {
    await c.close();
  }
});

for (const [key, direct, adjacent] of [
  ["1", 100, 360],
  ["2", 20, 360],
] as const) {
  test(`${key === "1" ? "高爆直接命中" : "穿甲直接高傷"}以敵車呈現，掩體後虎式不受波及`, async ({
    browser,
  }) => {
    const c = await tankCrew(browser);
    try {
      await c.loader.keyboard.press(key);
      await c.loader.keyboard.down("r");
      await expect(c.gunner.getByTestId("chamber-state")).toHaveText(
        "主炮就緒",
      );
      await c.loader.keyboard.up("r");
      await c.gunner.keyboard.press("Space");
      await expect(c.gunner.getByTestId("target-status")).toContainText(
        `四號 H 型 ${direct}/200`,
      );
      // Wait for its normal flank and actually look before checking hidden HP.
      await observeTiger(c);
      await expect(c.gunner.getByTestId("target-status")).toContainText(
        `虎式 I 型 ${adjacent}/360`,
      );
      await c.gunner.screenshot({
        path: `/tmp/car-game-spec30/evidence/37/legacy/visual27-final/regression/visual17/${key === "1" ? "he" : "ap"}-impact.png`,
        fullPage: true,
      });
      await c.loader.screenshot({
        path: `/tmp/car-game-spec30/evidence/37/legacy/visual27-final/regression/visual17/${key === "1" ? "he" : "ap"}-loader.png`,
        fullPage: true,
      });
    } finally {
      await c.close();
    }
  });
}

test("近距高爆會傷敵而不傷共用坦克，仍可裝填下一發擊毀", async ({
  browser,
}) => {
  const c = await tankCrew(browser);
  try {
    await c.driver.keyboard.down("w");
    await c.driver.waitForTimeout(1650);
    await c.driver.keyboard.up("w");
    await expect(c.driver.getByTestId("tank-speed")).toHaveText("0.0", {
      timeout: 5000,
    });
    await c.loader.keyboard.down("r");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    const healthBefore = await c.gunner
      .getByTestId("tank-health")
      .textContent();
    await c.gunner.keyboard.press("Space");
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "四號 H 型 100/200",
    );
    for (const p of [c.driver, c.loader, c.gunner])
      await expect(p.getByTestId("tank-health")).toHaveText(healthBefore!);
    await c.gunner.screenshot({
      path: "/tmp/car-game-spec30/evidence/37/legacy/visual27-final/regression/visual17/near-he.png",
      fullPage: true,
    });
    await c.loader.keyboard.down("r");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    await c.gunner.keyboard.press("Space");
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "四號 H 型 0/200 · 已擊毀",
    );
    await expect(c.gunner.getByTestId("shot-count")).toHaveText("2");
  } finally {
    await c.close();
  }
});

test("蹲下與暈眩封鎖選彈；射出後可預選但退殼前不能開裝", async ({
  browser,
}) => {
  const c = await tankCrew(browser, "gunner");
  try {
    await c.loader.keyboard.down("c");
    await expect(c.loader.getByTestId("loader-status")).toContainText("蹲下");
    await c.loader.keyboard.press("2");
    await expect(c.gunner.getByTestId("selected-shell")).toHaveText("高爆彈");
    await c.loader.keyboard.up("c");
    await c.loader.keyboard.press("2");
    await expect(c.gunner.getByTestId("selected-shell")).toHaveText("穿甲彈");
    await c.loader.keyboard.down("r");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    await c.gunner.keyboard.press("Space");
    await c.loader.keyboard.press("1");
    await expect(c.gunner.getByTestId("selected-shell")).toHaveText("高爆彈");
    await c.loader.keyboard.down("r");
    await expect(c.loader.getByTestId("chamber-state")).toHaveText("正在退殼");
    await expect(c.loader.getByTestId("load-progress")).toHaveText("0");
    await c.loader.keyboard.up("r");
    await expect(c.loader.getByTestId("loader-status")).toContainText("暈眩");
    await c.loader.keyboard.press("2");
    await expect(c.gunner.getByTestId("selected-shell")).toHaveText("高爆彈");
    await expect(c.loader.getByTestId("loader-status")).toContainText(
      "可以工作",
    );
    await c.loader.keyboard.press("2");
    await expect(c.gunner.getByTestId("selected-shell")).toHaveText("穿甲彈");
  } finally {
    await c.close();
  }
});

test("穿甲彈在卡彈與蹲下期間保持鎖定，排除故障後仍射出穿甲", async ({
  browser,
}) => {
  const c = await tankCrew(browser, "loader", 0, 1);
  try {
    await c.loader.keyboard.press("2");
    await c.loader.keyboard.down("r");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("卡彈");
    await c.loader.keyboard.press("1");
    await expect(c.gunner.getByTestId("chamber-shell")).toHaveText(
      "穿甲彈（已鎖定）",
    );
    await c.loader.keyboard.down("c");
    await expect(c.loader.getByTestId("loader-status")).toContainText("蹲下");
    await c.loader.keyboard.press("1");
    await c.loader.waitForTimeout(300);
    await expect(c.loader.getByTestId("load-progress")).toHaveText("40");
    await expect(c.gunner.getByTestId("chamber-shell")).toHaveText(
      "穿甲彈（已鎖定）",
    );
    await c.loader.screenshot({
      path: "/tmp/car-game-spec30/evidence/37/legacy/visual27-final/regression/visual17/ap-jammed-crouch.png",
      fullPage: true,
    });
    await c.loader.keyboard.up("c");
    await expect
      .poll(
        async () => {
          const n = await c.loader.getByTestId("jam-needle").boundingBox();
          const z = await c.loader.getByTestId("jam-zone").boundingBox();
          return (
            !!n &&
            !!z &&
            n.x > z.x + z.width * 0.25 &&
            n.x < z.x + z.width * 0.7
          );
        },
        { intervals: [16], timeout: 12000 },
      )
      .toBe(true);
    await c.loader.keyboard.press("Space");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    await expect(c.gunner.getByTestId("chamber-shell")).toHaveText(
      "穿甲彈（已鎖定）",
    );
    await c.gunner.keyboard.press("Space");
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "四號 H 型 20/200",
    );
    await observeTiger(c);
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "虎式 I 型 360/360",
    );
  } finally {
    await c.close();
  }
});
