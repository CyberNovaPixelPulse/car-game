import { observeSight } from "./tank-sight-observation";
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
  await page.getByRole("button", { name: "調整鏡頭強度" }).click();
  await page.getByRole("slider", { name: "持續晃動" }).press("Home");
  await page.getByRole("button", { name: "關閉強度設定" }).click();
  await page.getByRole("img", { name: "主炮戰場視野" }).click();

  async function shoot(expectedCount: number) {
    const finish = await observeSight(page);
    await page.keyboard.press("Space");
    await expect(page.getByTestId("shot-count")).toHaveText(
      String(expectedCount),
    );
    await page.waitForTimeout(850); // Observe the shot, rebound and return to idle.
    return finish();
  }
  const enabled = await shoot(1);
  expect(enabled.peak).toBeGreaterThan(0.008);
  expect(enabled.last).toBeLessThan(0.001);

  await motion.click();
  await expect(motion).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("chamber-state")).toHaveText("主炮就緒");
  await page.getByRole("img", { name: "主炮戰場視野" }).click();
  const disabled = await shoot(2);
  expect(disabled.frames).toBeGreaterThan(1);
  expect(disabled.peak).toBeLessThan(0.001);
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
