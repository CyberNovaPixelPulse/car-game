import { test, expect } from "@playwright/test";
import { tankCrew, elevateCannon } from "./tank-helpers";

async function loaded(c: Awaited<ReturnType<typeof tankCrew>>, shell = "2") {
  await c.loader.keyboard.press(shell);
  await c.loader.keyboard.down("r");
  const until = Date.now() + 20000;
  while (
    (await c.loader.getByTestId("chamber-state").textContent()) !== "主炮就緒"
  ) {
    if (Date.now() > until) throw Error("normal loading deadline");
    if (
      (await c.loader.getByTestId("chamber-state").textContent()) === "卡彈"
    ) {
      const n = await c.loader.getByTestId("jam-needle").boundingBox();
      const z = await c.loader.getByTestId("jam-zone").boundingBox();
      if (n && z && n.x > z.x + z.width * 0.25 && n.x < z.x + z.width * 0.65)
        await c.loader.keyboard.press("Space");
    }
    await c.loader.waitForTimeout(30);
  }
  await c.loader.keyboard.up("r");
}

async function replay(c: Awaited<ReturnType<typeof tankCrew>>) {
  await c.gunner.getByRole("button", { name: "回到房間", exact: true }).click();
  for (const p of [c.loader, c.gunner, c.driver])
    await expect(p.getByTestId("room-code")).toHaveText(c.code);
  for (const [p, role] of [
    [c.loader, "裝填手"],
    [c.driver, "駕駛"],
    [c.gunner, "砲手"],
  ] as const) {
    await p.getByRole("button", { name: `擔任${role}`, exact: true }).click();
    await p.getByRole("button", { name: "準備", exact: true }).click();
    await expect(
      p.getByRole("button", { name: "取消準備", exact: true }),
    ).toBeVisible();
  }
  await c.loader.getByRole("button", { name: "開始戰鬥", exact: true }).click();
  await expect(c.loader.getByTestId("chamber-state")).toHaveText("空膛");
  await expect(c.loader.getByTestId("stun-remaining")).toHaveText("");
  await expect(c.loader.getByRole("region", { name: "卡彈排除" })).toBeHidden();
  await expect(c.gunner.getByTestId("smoke-status")).toHaveText("視線清晰");
  await expect(c.gunner.getByTestId("flight-status")).toHaveText("");
  await c.loader.keyboard.press("Tab");
  await expect(c.loader.getByTestId("mg-heat")).toBeVisible();
  await expect(c.loader.getByTestId("mg-heat")).toHaveText("0");
  await expect(c.loader.getByTestId("mg-shot-count")).toHaveText("0");
  await c.loader.keyboard.press("Tab");
  await expect(c.loader.getByTestId("loader-mode")).toHaveText("維修模式");
  await expect(c.loader.getByTestId("repair-status")).toHaveText(
    "車體完好・100 / 100 HP",
  );
  await c.loader.keyboard.press("Tab");
  await expect(c.loader.getByTestId("load-progress")).toHaveText("0");
}

test("真正飛行中的砲彈在斷線暫停超過壽命仍凍結，原職位恢復才繼續", async ({
  browser,
}) => {
  const c = await tankCrew(browser);
  try {
    await elevateCannon(c.gunner);
    await loaded(c);
    await c.loader.keyboard.down("c");
    await c.gunner.keyboard.press("Space");
    await expect(c.gunner.getByTestId("flight-status")).toHaveText(
      "砲彈飛行中",
    );
    await c.driver.goto("about:blank");
    await expect(c.gunner.getByTestId("battle-pause")).toBeVisible();
    await c.gunner.waitForTimeout(5500);
    await expect(c.gunner.getByTestId("flight-status")).toHaveText(
      "砲彈飛行中",
    );
    await c.driver.goto("/");
    await expect(
      c.driver.getByRole("heading", { name: "駕駛工作站" }),
    ).toBeVisible();
    await expect(c.gunner.getByTestId("flight-status")).toHaveText("", {
      timeout: 8000,
    });
  } finally {
    await c.close();
  }
});

test("機槍正常掃射確實傷害虎式，兩類敵車共用命中規則", async ({ browser }) => {
  test.setTimeout(100000);
  const c = await tankCrew(browser);
  try {
    for (let i = 0; i < 2; i++) {
      await loaded(c);
      await c.loader.keyboard.down("c");
      await c.gunner.keyboard.press("Space");
      await expect(c.loader.getByTestId("chamber-state")).toHaveText("空膛");
      await c.loader.keyboard.up("c");
    }
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "四號 H 型 0/200",
    );
    await c.loader.waitForTimeout(23000);
    await c.loader.keyboard.press("Tab");
    await c.loader.keyboard.down("Space");
    await c.loader.keyboard.down("a");
    await expect
      .poll(
        async () => {
          const t = await c.gunner.getByTestId("target-status").textContent();
          return Number(t!.match(/虎式 I 型 (\d+)\/360/)?.[1] ?? 360);
        },
        { timeout: 30000 },
      )
      .toBeLessThan(360);
    await c.loader.keyboard.up("a");
    await c.loader.keyboard.up("Space");
    await c.loader.screenshot({
      path: `${process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/32/regression/visual27-final"}/legacy-mg-tiger-hit.png`,
    });
  } finally {
    await c.close();
  }
});

for (const dirty of ["jam", "heat", "smoke-stun", "flight"] as const) {
  test(`正常${dirty}危險保留到失敗，回同房重玩清除`, async ({ browser }) => {
    test.setTimeout(170000);
    const c = await tankCrew(browser, "loader", 0, dirty === "jam" ? 1 : 1000);
    try {
      if (dirty === "jam") {
        await c.loader.keyboard.down("r");
        await expect(c.loader.getByTestId("chamber-state")).toHaveText("卡彈");
        await c.loader.keyboard.up("r");
      } else if (dirty === "heat") {
        await c.loader.keyboard.press("Tab");
      } else {
        await loaded(c, dirty === "flight" ? "2" : "3");
        if (dirty === "flight") {
          await elevateCannon(c.gunner);
        }
      }
      await expect
        .poll(
          async () =>
            Number(
              (await c.gunner.getByTestId("tank-health").textContent())!.split(
                "/",
              )[0],
            ),
          { timeout: 120000 },
        )
        .toBeLessThanOrEqual(10);
      if (dirty === "heat") await c.loader.keyboard.down("Space");
      if (dirty === "smoke-stun" || dirty === "flight") {
        await expect(c.gunner.getByTestId("enemy-warning")).not.toHaveText("", {
          timeout: 12000,
        });
        await c.gunner.keyboard.press("Space");
      }
      if (dirty === "smoke-stun") {
        await expect(c.gunner.getByTestId("smoke-status")).toHaveText(
          "煙幕遮蔽視線",
        );
        await expect(c.loader.getByTestId("stun-remaining")).not.toHaveText("");
      }
      await expect(
        c.gunner.getByRole("heading", { name: "戰鬥失敗", exact: true }),
      ).toBeVisible({ timeout: 15000 });
      if (dirty === "flight")
        await expect(c.gunner.getByTestId("flight-status")).toHaveText(
          "砲彈飛行中",
        );
      if (dirty === "jam")
        await expect(c.loader.getByTestId("chamber-state")).toHaveText("卡彈");
      if (dirty === "heat") {
        await c.loader.keyboard.up("Space");
        await expect(c.loader.getByTestId("mg-heat")).not.toHaveText("0");
      }
      if (dirty === "smoke-stun") {
        await expect(c.gunner.getByTestId("smoke-status")).toHaveText(
          "煙幕遮蔽視線",
        );
        await expect(c.loader.getByTestId("stun-remaining")).not.toHaveText("");
      }
      await c.loader.screenshot({
        path: `${process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/32/regression/visual27-final"}/legacy-dirty-${dirty}-defeat.png`,
      });
      await replay(c);
      await c.loader.screenshot({
        path: `${process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/32/regression/visual27-final"}/legacy-dirty-${dirty}-reset.png`,
      });
      if (dirty !== "jam") {
        await loaded(c);
        await expect(c.gunner.getByTestId("chamber-state")).toHaveText(
          "主炮就緒",
        );
      }
    } finally {
      await c.close();
    }
  });
}
