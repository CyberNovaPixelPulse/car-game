import { test, expect } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

test("三位乘員看見同一個第一波與存活敵車數", async ({ browser }) => {
  const c = await tankCrew(browser);
  try {
    for (const page of [c.driver, c.gunner, c.loader]) {
      await expect(page.getByTestId("wave-status")).toHaveText("第 1 / 3 波 · 存活敵車 2");
    }
  } finally { await c.close(); }
});

async function loadAndFire(c: Awaited<ReturnType<typeof tankCrew>>, shell = "2") {
  await c.loader.keyboard.press(shell);
  await c.loader.keyboard.down("r");
  // The loader reads the actual meter and presses Space; jams retain their normal odds.
  const deadline = Date.now() + 20000;
  while ((await c.loader.getByTestId("chamber-state").textContent()) !== "主炮就緒") {
    if (Date.now() > deadline) throw new Error("正常裝填未能完成");
    if ((await c.loader.getByTestId("chamber-state").textContent()) === "卡彈") {
      const needle = await c.loader.getByTestId("jam-needle").boundingBox();
      const zone = await c.loader.getByTestId("jam-zone").boundingBox();
      if (needle && zone && needle.x > zone.x + zone.width * .25 && needle.x < zone.x + zone.width * .65)
        await c.loader.keyboard.press("Space");
    }
    await c.loader.waitForTimeout(30);
  }
  await c.loader.keyboard.up("r");
  await c.loader.keyboard.down("c");
  await c.gunner.keyboard.press("Space");
  await expect.poll(async () =>
    await c.loader.getByTestId("battle-result").isVisible() ||
    (await c.loader.getByTestId("chamber-state").textContent()) === "空膛"
  ).toBe(true);
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
      await expect(page.getByTestId("wave-status")).toHaveText("第 2 / 3 波 · 存活敵車 3");
    for (let i = 0; i < 3; i++) await c.gunner.keyboard.press("d");
    await expect(c.gunner.getByTestId("turret-yaw-rate")).toHaveText("0.0°/s");
    async function turn(key: string, count: number) {
      await expect(c.gunner.getByTestId("battle-result")).toBeHidden();
      // Four rapid taps store more inertia than two separated pairs.
      for (const taps of count === 4 ? [2, 2] : [count]) {
        for (let i = 0; i < taps; i++) await c.gunner.keyboard.press(key);
        await expect(c.gunner.getByTestId("turret-yaw-rate")).not.toHaveText("0.0°/s");
        await expect(c.gunner.getByTestId("turret-yaw-rate")).toHaveText("0.0°/s");
      }
    }
    for (const wave of [2, 3]) {
      await loadAndFire(c, "1");
      // A real HE hit damages all three approaching tanks in this formation.
      if (wave === 2) {
        const visible = await c.gunner.getByTestId("target-status").textContent();
        const hp = [...visible!.matchAll(/四號 H 型 (\d+)\/200/g)].map((m) => Number(m[1]));
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
          await expect(page.getByTestId("wave-status")).toHaveText("第 3 / 3 波 · 存活敵車 4");
        await turn("d", 2);
      } else {
        await turn("d", 2);
        await turn("a", 3);
        await loadAndFire(c);
        await loadAndFire(c);
      }
    }
    for (const page of [c.driver, c.loader, c.gunner])
      await expect(page.getByRole("heading", { name: "戰鬥勝利", exact: true })).toBeVisible();
  } finally { await c.close(); }
});
