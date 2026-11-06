import { test, expect } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

test("三位乘員看見同一個第一波與存活敵車數", async ({ browser }) => {
  const c = await tankCrew(browser);
  try {
    for (const page of [c.driver, c.gunner, c.loader]) {
      await page.setViewportSize({ width: 1280, height: 720 });
      await expect(page.getByTestId("wave-status")).toHaveText(
        "第 1 / 3 波 · 存活敵車 2",
      );
      await expect(page.getByTestId("wave-status")).toBeInViewport();
    }
    await c.loader.screenshot({
      path: "/tmp/car-game-to-spec/visual23/wave-hud-loader.png",
    });
  } finally {
    await c.close();
  }
});

async function loadAndFire(
  c: Awaited<ReturnType<typeof tankCrew>>,
  shell = "2",
) {
  await c.loader.keyboard.press(shell);
  await c.loader.keyboard.down("r");
  // The loader reads the actual meter and presses Space; jams retain their normal odds.
  const deadline = Date.now() + 20000;
  while (
    (await c.loader.getByTestId("chamber-state").textContent()) !== "主炮就緒"
  ) {
    if (Date.now() > deadline) throw new Error("正常裝填未能完成");
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
    await c.loader.waitForTimeout(30);
  }
  await c.loader.keyboard.up("r");
  await c.loader.keyboard.down("c");
  await c.gunner.keyboard.press("Space");
  await expect
    .poll(
      async () =>
        (await c.loader.getByTestId("battle-result").isVisible()) ||
        (await c.loader.getByTestId("chamber-state").textContent()) === "空膛",
    )
    .toBe(true);
  await c.loader.keyboard.up("c");
}

test("乘員以正常裝填瞄準開火清除三波並一致勝利", async ({ browser }) => {
  test.setTimeout(240000);
  const c = await tankCrew(browser);
  try {
    await loadAndFire(c);
    await loadAndFire(c);
    // The remaining Tiger must actually move around the wall into the sight.
    await c.gunner.waitForTimeout(23000);
    for (let i = 0; i < 3; i++) await c.gunner.keyboard.press("a");
    await expect(c.gunner.getByTestId("turret-yaw-rate")).toHaveText("0.0°/s");
    await loadAndFire(c);
    await loadAndFire(c);
    for (const page of [c.driver, c.loader, c.gunner])
      await expect(page.getByTestId("wave-status")).toHaveText(
        "第 2 / 3 波 · 存活敵車 3",
      );
    for (let i = 0; i < 3; i++) await c.gunner.keyboard.press("d");
    await expect(c.gunner.getByTestId("turret-yaw-rate")).toHaveText("0.0°/s");
    async function turn(key: string, count: number) {
      await expect(c.gunner.getByTestId("battle-result")).toBeHidden();
      // Four rapid taps store more inertia than two separated pairs.
      for (const taps of count === 4 ? [2, 2] : [count]) {
        for (let i = 0; i < taps; i++) await c.gunner.keyboard.press(key);
        await expect(c.gunner.getByTestId("turret-yaw-rate")).not.toHaveText(
          "0.0°/s",
        );
        await expect(c.gunner.getByTestId("turret-yaw-rate")).toHaveText(
          "0.0°/s",
        );
      }
    }
    for (const wave of [2, 3]) {
      await loadAndFire(c, "1");
      // A real HE hit damages all three approaching tanks in this formation.
      if (wave === 2) {
        const visible = await c.gunner
          .getByTestId("target-status")
          .textContent();
        const hp = [...visible!.matchAll(/四號 H 型 (\d+)\/200/g)].map((m) =>
          Number(m[1]),
        );
        expect(hp).toHaveLength(3);
        expect(hp.every((value) => value < 200)).toBe(true);
      }
      await loadAndFire(c, "1");
      await turn("d", 2);
      await loadAndFire(c);
      await turn("a", 4);
      await loadAndFire(c);
      if (wave === 2) {
        for (const page of [c.driver, c.loader, c.gunner])
          await expect(page.getByTestId("wave-status")).toHaveText(
            "第 3 / 3 波 · 存活敵車 4",
          );
        await turn("d", 2);
      } else {
        await turn("d", 2);
        await turn("a", 3);
        await loadAndFire(c);
        await loadAndFire(c);
      }
    }
    for (const page of [c.driver, c.loader, c.gunner])
      await expect(
        page.getByRole("heading", { name: "戰鬥勝利", exact: true }),
      ).toBeVisible();
  } finally {
    await c.close();
  }
});

test("血量歸零一致失敗且停止操作，同房回廳換職準備並重設新戰鬥", async ({
  browser,
}) => {
  test.setTimeout(180000);
  const c = await tankCrew(
    browser,
    "loader",
    0,
    1000,
    "/tmp/car-game-to-spec/visual23/replay-videos",
  );
  try {
    await c.loader.keyboard.press("2");
    await c.loader.keyboard.down("r");
    await expect(c.loader.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    await c.loader.keyboard.press("Tab");
    await expect(c.loader.getByTestId("loader-mode")).toHaveText("機槍模式");
    await c.loader.keyboard.down("d");
    await c.loader.waitForTimeout(350);
    await c.loader.keyboard.up("d");
    await c.loader.keyboard.down("Space");
    await expect
      .poll(async () =>
        Number(await c.loader.getByTestId("mg-shot-count").textContent()),
      )
      .toBeGreaterThan(8);
    await c.loader.keyboard.up("Space");
    for (const page of [c.driver, c.gunner, c.loader]) {
      await expect(
        page.getByRole("heading", { name: "戰鬥失敗", exact: true }),
      ).toBeVisible({ timeout: 120000 });
      await expect(page.getByTestId("tank-health")).toHaveText("0/100");
    }
    for (const [page, role] of [
      [c.driver, "driver"],
      [c.gunner, "gunner"],
      [c.loader, "loader"],
    ] as const)
      await page.screenshot({
        path: `/tmp/car-game-to-spec/visual23/defeat-${role}.png`,
      });
    const shots = await c.gunner.getByTestId("shot-count").textContent();
    const mgShots = await c.loader.getByTestId("mg-shot-count").textContent();
    await c.gunner.keyboard.press("Space");
    await c.loader.keyboard.press("Tab");
    await c.driver.keyboard.down("w");
    await c.driver.waitForTimeout(1000);
    await c.driver.keyboard.up("w");
    await expect(c.driver.getByTestId("tank-speed")).toHaveText("0.0");
    await expect(c.gunner.getByTestId("shot-count")).toHaveText(shots!);
    await expect(c.loader.getByTestId("mg-shot-count")).toHaveText(mgShots!);
    await expect(c.loader.getByTestId("loader-mode")).toHaveText("機槍模式");
    await expect(
      c.gunner.getByRole("button", { name: "回到房間", exact: true }),
    ).toBeVisible({ timeout: 10000 });
    await c.gunner
      .getByRole("button", { name: "回到房間", exact: true })
      .click({ timeout: 10000 });
    const host = c.loader;
    const code = c.code;
    for (const page of [c.driver, c.gunner, c.loader]) {
      await expect(page.getByTestId("room-code")).toHaveText(code!);
      await expect(page.getByTestId("crew-list")).toContainText("尚未選擇職位");
      await expect(page.getByTestId("crew-list")).not.toContainText("已準備");
    }
    await host.screenshot({
      path: "/tmp/car-game-to-spec/visual23/same-room-cleared.png",
    });
    await expect(
      host.getByRole("button", { name: "開始戰鬥", exact: true }),
    ).toBeDisabled();
    for (const [page, role] of [
      [host, "駕駛"],
      [c.driver, "砲手"],
      [c.gunner, "裝填手"],
    ] as const) {
      await page
        .getByRole("button", { name: `擔任${role}`, exact: true })
        .click();
      for (const other of [c.loader, c.driver, c.gunner].filter(
        (p) => p !== page,
      ))
        await expect(
          other.getByRole("button", { name: `擔任${role}`, exact: true }),
        ).toBeDisabled();
      await page.getByRole("button", { name: "準備", exact: true }).click();
      if (role !== "裝填手")
        await expect(
          host.getByRole("button", { name: "開始戰鬥", exact: true }),
        ).toBeDisabled();
    }
    await c.driver
      .getByRole("button", { name: "取消準備", exact: true })
      .click();
    await expect(
      host.getByRole("button", { name: "開始戰鬥", exact: true }),
    ).toBeDisabled();
    await c.driver.getByRole("button", { name: "準備", exact: true }).click();
    await host.screenshot({
      path: "/tmp/car-game-to-spec/visual23/swapped-crew-ready.png",
    });
    await host.getByRole("button", { name: "開始戰鬥", exact: true }).click();
    for (const page of [c.loader, c.driver, c.gunner]) {
      await expect(page.getByTestId("tank-health")).toHaveText("100/100");
      await expect(page.getByTestId("wave-status")).toHaveText(
        "第 1 / 3 波 · 存活敵車 2",
      );
      await expect(page.getByTestId("battle-result")).toBeHidden();
    }
    const newLoader = c.gunner;
    const newGunner = c.driver;
    await expect(newLoader.getByTestId("loader-mode")).toHaveText("裝填模式");
    await expect(newLoader.getByTestId("selected-shell")).toHaveText("高爆彈");
    await expect(newLoader.getByTestId("chamber-state")).toHaveText("空膛");
    await expect(newLoader.getByTestId("load-progress")).toHaveText("0");
    await expect(newLoader.getByTestId("stun-remaining")).toHaveText("");
    await expect(newLoader.getByTestId("mg-shot-count")).toHaveText("0");
    await expect(newLoader.getByTestId("mg-heat")).toHaveText("0");
    await expect(newLoader.getByTestId("mg-heading")).toHaveText("0.0°");
    await expect(newGunner.getByTestId("shot-count")).toHaveText("0");
    await expect(newGunner.getByTestId("turret-heading")).toHaveText("0.0°");
    await expect(newGunner.getByTestId("smoke-status")).toHaveText("視線清晰");
    for (const [page, role] of [
      [c.loader, "driver"],
      [c.driver, "gunner"],
      [c.gunner, "loader"],
    ] as const)
      await page.screenshot({
        path: `/tmp/car-game-to-spec/visual23/new-round-${role}.png`,
      });
    // The swapped roles really work in the new round.
    await newLoader.keyboard.down("r");
    await expect(newGunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await newLoader.keyboard.up("r");
    await newLoader.keyboard.down("c");
    await newGunner.keyboard.press("Space");
    await expect(newGunner.getByTestId("shot-count")).toHaveText("1");
    await expect(newGunner.getByTestId("target-status")).toContainText(
      "四號 H 型 100/200",
    );
    await newLoader.keyboard.up("c");
  } finally {
    await c.close();
  }
});
