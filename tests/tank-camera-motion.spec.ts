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
