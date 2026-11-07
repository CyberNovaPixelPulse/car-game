import { test, expect } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

const number = async (locator: import("@playwright/test").Locator) =>
  Number((await locator.textContent())!.replace(/[^\d.-]/g, ""));

test("非房主砲手長按方向鍵雙軸加速，放開約半秒停下", async ({ browser }) => {
  const crew = await tankCrew(browser);
  try {
    // Observe only the public HUD and trusted native keys. Browser timestamps
    // keep protocol/screenshot latency out of the acceleration measurement.
    await crew.gunner.evaluate(() => {
      const samples: { at: number; yaw: number; pitch: number }[] = [];
      const keys: { at: number; code: string; type: string }[] = [];
      const read = (id: string) =>
        Number(
          document
            .querySelector(`[data-testid="${id}"]`)!
            .textContent!.replace(/[^\d.-]/g, ""),
        );
      const observer = new MutationObserver(() =>
        samples.push({
          at: performance.now(),
          yaw: read("turret-yaw-rate"),
          pitch: read("turret-pitch-rate"),
        }),
      );
      for (const id of ["turret-yaw-rate", "turret-pitch-rate"])
        observer.observe(document.querySelector(`[data-testid="${id}"]`)!, {
          childList: true,
          characterData: true,
          subtree: true,
        });
      for (const type of ["keydown", "keyup"])
        addEventListener(type, (event) => {
          const key = event as KeyboardEvent;
          if (key.isTrusted && ["ArrowRight", "ArrowUp"].includes(key.code))
            keys.push({ at: performance.now(), code: key.code, type });
        });
      (window as any).__aimObservation = { samples, keys, observer };
    });
    await crew.gunner.keyboard.down("ArrowRight");
    await crew.gunner.keyboard.down("ArrowUp");
    await crew.gunner.waitForTimeout(850);
    await crew.gunner.keyboard.up("ArrowRight");
    await crew.gunner.keyboard.up("ArrowUp");
    await expect(crew.gunner.getByTestId("turret-yaw-rate")).toHaveText(
      "0.0°/s",
    );
    await expect(crew.gunner.getByTestId("turret-pitch-rate")).toHaveText(
      "0.0°/s",
    );
    const observation = await crew.gunner.evaluate(() => {
      const entry = (window as any).__aimObservation;
      entry.observer.disconnect();
      return { samples: entry.samples, keys: entry.keys } as {
        samples: { at: number; yaw: number; pitch: number }[];
        keys: { at: number; code: string; type: string }[];
      };
    });
    await test.info().attach("held-aim-visible-hud", {
      body: JSON.stringify(observation, null, 2),
      contentType: "application/json",
    });
    for (const [axis, code, maximum] of [
      ["yaw", "ArrowRight", 48.7],
      ["pitch", "ArrowUp", 28.6],
    ] as const) {
      const down = observation.keys.find(
        (key) => key.code === code && key.type === "keydown",
      )!.at;
      const up = observation.keys.find(
        (key) => key.code === code && key.type === "keyup",
      )!.at;
      const peak = observation.samples.find(
        (sample) => sample[axis] >= maximum - 0.2,
      );
      expect(peak, `${axis} reaches its retained speed cap`).toBeDefined();
      expect(peak!.at - down).toBeGreaterThan(300);
      expect(peak!.at - down).toBeLessThan(800);
      expect(
        Math.max(...observation.samples.map((sample) => sample[axis])),
      ).toBeLessThanOrEqual(maximum + 0.1);
      const stopped = observation.samples.find(
        (sample) => sample.at > up && sample[axis] === 0,
      );
      expect(stopped, `${axis} coasts to rest`).toBeDefined();
      expect(stopped!.at - up).toBeGreaterThan(300);
      expect(stopped!.at - up).toBeLessThan(800);
    }
    expect(
      await number(crew.gunner.getByTestId("turret-heading")),
    ).toBeGreaterThan(10);
    expect(
      await number(crew.gunner.getByTestId("turret-pitch")),
    ).toBeGreaterThan(5);
    await expect(crew.gunner.getByTestId("hull-heading")).toHaveText("0°");
  } finally {
    await crew.close();
  }
});

test("長按不依賴重複事件，反向先煞停再反轉，其他職位不能轉砲", async ({
  browser,
}) => {
  const crew = await tankCrew(browser);
  try {
    const rate = crew.gunner.getByTestId("turret-yaw-rate");
    for (const page of [crew.driver, crew.loader]) {
      await page.keyboard.down("ArrowRight");
      await page.keyboard.down("ArrowUp");
      await page.waitForTimeout(650);
      await page.keyboard.up("ArrowRight");
      await page.keyboard.up("ArrowUp");
    }
    await expect(rate).toHaveText("0.0°/s");
    await expect(crew.gunner.getByTestId("turret-pitch")).toHaveText("0.0°");
    await crew.gunner.keyboard.down("ArrowRight");
    await expect(rate).toHaveText("48.7°/s");
    // Repeated native keydown while held must not add impulses or exceed the cap.
    await crew.gunner.keyboard.down("ArrowRight");
    await expect(rate).toHaveText("48.7°/s");
    await crew.gunner.keyboard.up("ArrowRight");
    await crew.gunner.keyboard.down("ArrowLeft");
    await crew.gunner.waitForTimeout(120);
    expect(await number(rate)).toBeGreaterThan(0);
    expect(await number(rate)).toBeLessThan(45);
    await expect.poll(() => number(rate)).toBeLessThan(-5);
    await expect(rate).toHaveText("-48.7°/s");
    await crew.gunner.keyboard.up("ArrowLeft");
    await expect(rate).toHaveText("0.0°/s");
    await crew.gunner.keyboard.down("d");
    await crew.gunner.mouse.move(200, 200);
    await crew.gunner.mouse.move(800, 500);
    await crew.gunner.keyboard.up("d");
    await expect(rate).toHaveText("0.0°/s");
  } finally {
    await crew.close();
  }
});

test("房主砲手長按至俯仰限位，車身轉向帶動世界朝向但不改寫砲塔相對角", async ({
  browser,
}) => {
  const crew = await tankCrew(browser, "gunner");
  const heading = () => number(crew.gunner.getByTestId("turret-heading"));
  const hull = () => number(crew.gunner.getByTestId("hull-heading"));
  const relative = async () => ((await heading()) - (await hull()) + 360) % 360;
  try {
    await crew.gunner.keyboard.down("ArrowRight");
    await crew.gunner.keyboard.down("ArrowUp");
    await expect(crew.gunner.getByTestId("turret-yaw-rate")).toHaveText(
      "48.7°/s",
    );
    await expect(crew.gunner.getByTestId("turret-pitch")).toHaveText("28.6°");
    await expect(crew.gunner.getByTestId("turret-pitch-rate")).toHaveText(
      "0.0°/s",
    );
    await crew.gunner.keyboard.up("ArrowRight");
    await crew.gunner.keyboard.up("ArrowUp");
    await expect(crew.gunner.getByTestId("turret-yaw-rate")).toHaveText(
      "0.0°/s",
    );
    await expect(crew.gunner.getByTestId("hull-heading")).toHaveText("0°");
    const beforeRelative = await relative();
    const beforeHeading = await heading();
    await crew.driver.keyboard.down("d");
    await expect.poll(hull).toBeGreaterThan(20);
    await crew.driver.keyboard.up("d");
    await crew.driver.waitForTimeout(600);
    expect(await heading()).toBeGreaterThan(beforeHeading + 20);
    expect(Math.abs((await relative()) - beforeRelative)).toBeLessThan(0.7);
    await crew.gunner.keyboard.down("ArrowDown");
    await expect(crew.gunner.getByTestId("turret-pitch")).toHaveText("-10.3°");
    await expect(crew.gunner.getByTestId("turret-pitch-rate")).toHaveText(
      "0.0°/s",
    );
    await crew.gunner.keyboard.up("ArrowDown");
  } finally {
    await crew.close();
  }
});

test("持續長按可水平繞行整圈且轉速有上限", async ({ browser }) => {
  const crew = await tankCrew(browser);
  try {
    await crew.gunner.screenshot({
      path: "/tmp/car-game-spec30/evidence/32/gunner-before.png",
      fullPage: true,
    });
    // Observe the public instruments in-page so reading each frame over CDP
    // does not stretch the held turn beyond the actual battle lifetime.
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
    await crew.gunner.keyboard.down("ArrowRight");
    await crew.gunner.waitForTimeout(8500);
    await crew.gunner.keyboard.up("ArrowRight");
    const observation = await crew.gunner.evaluate(() => {
      const entry = (window as any).__aimInstrumentObservation;
      entry.observer.disconnect();
      delete (window as any).__aimInstrumentObservation;
      return entry.observation as { wrapped: boolean; maximumRate: number };
    });
    expect(observation.maximumRate).toBeLessThanOrEqual(48.8);
    expect(observation.wrapped).toBeTruthy();
    await crew.gunner.screenshot({
      path: "/tmp/car-game-spec30/evidence/32/gunner-after.png",
      fullPage: true,
    });
    await expect(crew.gunner.getByTestId("hull-heading")).toHaveText("0°");
  } finally {
    await crew.close();
  }
});

test("非房主砲手長按與重複開火鍵不會射出再次裝好的下一發", async ({
  browser,
}) => {
  const crew = await tankCrew(browser);
  try {
    await crew.loader.keyboard.down("r");
    await expect(crew.gunner.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.loader.keyboard.up("r");
    await crew.loader.keyboard.down("c");
    await crew.gunner.keyboard.down("Space");
    await crew.gunner.keyboard.down("Space");
    await expect(crew.gunner.getByTestId("shot-count")).toHaveText("1");
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText("空膛");
    await crew.loader.keyboard.up("c");
    await crew.loader.keyboard.down("r");
    await expect(crew.gunner.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.loader.keyboard.up("r");
    await crew.gunner.keyboard.down("Space");
    await crew.gunner.waitForTimeout(200);
    await expect(crew.gunner.getByTestId("shot-count")).toHaveText("1");
    await crew.gunner.keyboard.up("Space");
    await crew.gunner.keyboard.press("Space");
    await expect(crew.gunner.getByTestId("shot-count")).toHaveText("2");
  } finally {
    await crew.close();
  }
});
