import { expect, test } from "@playwright/test";

test("砲手開炮時準星偏移後回穩，關閉鏡頭震動後仍可再次開炮", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "單人練習", exact: true }).click();
  await page.getByRole("button", { name: "擔任砲手", exact: true }).click();
  await page.getByRole("button", { name: "開始練習", exact: true }).click();
  await expect(page.getByTestId("chamber-state")).toHaveText("主炮就緒");
  const motion = page.getByRole("button", { name: "鏡頭震動", exact: true });
  await expect(motion).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("img", { name: "主炮戰場視野" }).click();

  // Read the displayed sight once per painted frame, including a frame before
  // the real keypress. The loader AI supplies both rounds through normal work.
  async function shoot() {
    const observation = page.locator(".sight").evaluate(
      (sight) =>
        new Promise<number[]>((resolve) => {
          const top = sight.getBoundingClientRect().top;
          const samples: number[] = [];
          const start = performance.now();
          function sample(now: number) {
            samples.push(sight.getBoundingClientRect().top - top);
            if (now - start < 1250) requestAnimationFrame(sample);
            else resolve(samples);
          }
          requestAnimationFrame(sample);
        }),
    );
    await page.keyboard.press("Space");
    return observation;
  }
  const enabled = await shoot();
  await expect(page.getByTestId("shot-count")).toHaveText("1");
  expect(Math.max(...enabled.map(Math.abs))).toBeGreaterThan(1);
  expect(Math.abs(enabled.at(-1)!)).toBeLessThan(1);

  await motion.click();
  await expect(motion).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("chamber-state")).toHaveText("主炮就緒");
  await page.getByRole("img", { name: "主炮戰場視野" }).click();
  const disabled = await shoot();
  await expect(page.getByTestId("shot-count")).toHaveText("2");
  expect(Math.max(...disabled.map(Math.abs))).toBeLessThan(1);
});

test("敵車開炮先帶來附近震動，砲手受擊時血量下降且強衝擊回穩", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await page.goto("/");
  await page.getByRole("button", { name: "單人練習", exact: true }).click();
  await page.getByRole("button", { name: "擔任砲手", exact: true }).click();
  await page.getByRole("button", { name: "開始練習", exact: true }).click();
  await page.getByRole("button", { name: "AI 停車", exact: true }).click();
  await page.getByRole("button", { name: "開始交戰", exact: true }).click();

  // Track the near muzzle blast before HP loss and the ensuing direct hit separately.
  // The parked crew leaves the gun unfired throughout this observation.
  const displacement = await page.locator(".sight").evaluate(async (sight) => {
    const health = document.querySelector('[data-testid="tank-health"]')!;
    const initial = sight.getBoundingClientRect();
    const limit = performance.now() + 30_000;
    const distances: number[] = [];
    let beforeDamage = 0;
    let hitAt: number | undefined;
    while (performance.now() < limit) {
      const now = await new Promise<number>((resolve) =>
        requestAnimationFrame(resolve),
      );
      const bounds = sight.getBoundingClientRect();
      const displacement = Math.hypot(
        bounds.x - initial.x,
        bounds.y - initial.y,
      );
      if (health.textContent === "100/100") {
        beforeDamage = Math.max(beforeDamage, displacement);
        continue;
      }
      hitAt ??= now;
      distances.push(displacement);
      if (now - hitAt >= 850) break;
    }
    return { beforeDamage, afterHit: distances };
  });
  await expect(page.getByTestId("tank-health")).not.toHaveText("100/100");
  await expect(page.getByTestId("shot-count")).toHaveText("0");
  expect(displacement.beforeDamage).toBeGreaterThan(1.5);
  expect(Math.max(...displacement.afterHit)).toBeGreaterThan(
    displacement.beforeDamage,
  );
  expect(displacement.afterHit.at(-1)).toBeLessThan(2);
});
