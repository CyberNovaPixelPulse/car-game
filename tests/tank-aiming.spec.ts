import { test, expect } from "@playwright/test";
import { tankCrew, nativeTaps } from "./tank-helpers";

const number = async (locator: import("@playwright/test").Locator) =>
  Number((await locator.textContent())!.replace(/[^\d.-]/g, ""));

test("砲手以真實連點累積轉速，放手有慣性，其他職位不能瞄準", async ({
  browser,
}) => {
  const crew = await tankCrew(browser);
  try {
    const rate = crew.gunner.getByTestId("turret-yaw-rate");
    await expect(rate).toHaveText("0.0°/s");
    await crew.driver.keyboard.press("d");
    await crew.loader.keyboard.press("d");
    await expect(rate).toHaveText("0.0°/s");
    await crew.gunner.keyboard.press("d");
    await expect.poll(() => number(rate)).toBeGreaterThan(5);
    const first = await number(rate);
    await crew.gunner.keyboard.press("d");
    await expect.poll(() => number(rate)).toBeGreaterThan(first + 4);
    const before = await number(crew.gunner.getByTestId("turret-heading"));
    await crew.gunner.waitForTimeout(250);
    expect(
      await number(crew.gunner.getByTestId("turret-heading")),
    ).toBeGreaterThan(before);
    await expect(crew.driver.getByTestId("turret-heading")).toHaveCount(0);
    await expect(crew.loader.getByTestId("turret-heading")).toHaveCount(0);
  } finally {
    await crew.close();
  }
});

test("長按不重複推動，快速連點逐次送達且反向先煞停", async ({ browser }) => {
  const crew = await tankCrew(browser);
  try {
    const rate = crew.gunner.getByTestId("turret-yaw-rate");
    await crew.gunner.keyboard.down("d");
    await crew.gunner.keyboard.down("d");
    await crew.gunner.waitForTimeout(300);
    expect(await number(rate)).toBeGreaterThan(0);
    expect(await number(rate)).toBeLessThan(10.4);
    await crew.gunner.keyboard.up("d");
    await expect(rate).toHaveText("0.0°/s");
    for (let i = 0; i < 4; i++) await crew.gunner.keyboard.press("d");
    await expect.poll(() => number(rate)).toBeGreaterThan(32);
    await crew.gunner.keyboard.press("a");
    await expect.poll(() => number(rate)).toBeLessThan(32);
    expect(await number(rate)).toBeGreaterThan(0);
    for (let i = 0; i < 4; i++) await crew.gunner.keyboard.press("a");
    await expect.poll(() => number(rate)).toBeLessThan(-5);
    await expect(rate).toHaveText("0.0°/s");
    await crew.gunner.mouse.move(200, 200);
    await crew.gunner.mouse.move(800, 500);
    await expect(rate).toHaveText("0.0°/s");
  } finally {
    await crew.close();
  }
});

test("房主砲手的連點也逐次生效，俯仰限位且車身朝向獨立", async ({
  browser,
}) => {
  const crew = await tankCrew(browser, "gunner");
  try {
    const rate = crew.gunner.getByTestId("turret-yaw-rate");
    await nativeTaps(crew.gunner, 4);
    await expect.poll(() => number(rate)).toBeGreaterThan(32);
    await expect(crew.gunner.getByTestId("hull-heading")).toHaveText("0°");
    await expect
      .poll(() => number(crew.gunner.getByTestId("turret-heading")))
      .toBeGreaterThan(10);
    for (let i = 0; i < 8; i++) await crew.gunner.keyboard.press("w");
    await expect(crew.gunner.getByTestId("turret-pitch")).toHaveText("28.6°");
    await expect(crew.gunner.getByTestId("turret-pitch-rate")).toHaveText(
      "0.0°/s",
    );
    for (let i = 0; i < 12; i++) {
      await crew.gunner.keyboard.press("s");
      await crew.gunner.waitForTimeout(100);
    }
    await expect(crew.gunner.getByTestId("turret-pitch")).toHaveText("-10.3°");
    await expect(crew.gunner.getByTestId("turret-pitch-rate")).toHaveText(
      "0.0°/s",
    );
    await expect(crew.driver.getByTestId("turret-pitch")).toHaveCount(0);
  } finally {
    await crew.close();
  }
});

test("持續連點可水平繞行整圈且轉速有上限", async ({ browser }) => {
  const crew = await tankCrew(browser);
  try {
    await crew.gunner.screenshot({
      path: "/tmp/car-game-to-spec/visual27-final/regression/visual15/gunner-before.png",
      fullPage: true,
    });
    // Observe the public instruments in-page so reading each frame over CDP
    // does not stretch a 90ms tapping rhythm beyond the actual battle lifetime.
    await crew.gunner.evaluate(() => {
      const heading = document.querySelector('[data-testid="turret-heading"]')!;
      const rate = document.querySelector('[data-testid="turret-yaw-rate"]')!;
      const value = (node: Element) =>
        Number(node.textContent!.replace(/[^\d.-]/g, ""));
      let previous = value(heading);
      const observation = { wrapped: false, maximumRate: value(rate) };
      const observer = new MutationObserver(() => {
        const current = value(heading);
        if (previous > 300 && current < 60) observation.wrapped = true;
        previous = current;
        observation.maximumRate = Math.max(
          observation.maximumRate,
          value(rate),
        );
      });
      for (const node of [heading, rate])
        observer.observe(node, {
          childList: true,
          characterData: true,
          subtree: true,
        });
      (window as any).__aimInstrumentObservation = { observation, observer };
    });
    await nativeTaps(crew.gunner, 105, 90);
    const observation = await crew.gunner.evaluate(() => {
      const entry = (window as any).__aimInstrumentObservation;
      entry.observer.disconnect();
      delete (window as any).__aimInstrumentObservation;
      return entry.observation as { wrapped: boolean; maximumRate: number };
    });
    expect(observation.maximumRate).toBeLessThanOrEqual(48.8);
    expect(observation.wrapped).toBeTruthy();
    await crew.gunner.screenshot({
      path: "/tmp/car-game-to-spec/visual27-final/regression/visual15/gunner-after.png",
      fullPage: true,
    });
    await expect(crew.gunner.getByTestId("hull-heading")).toHaveText("0°");
  } finally {
    await crew.close();
  }
});
