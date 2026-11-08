import { test, expect, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import {
  tankCrew,
  aimAtHeading,
  observeTiger,
  aimAtObservedEnemy,
} from "./tank-helpers";

const evidence =
  process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/38/waves";
const health = async (page: Page) =>
  Number((await page.getByTestId("tank-health").textContent())!.split("/")[0]);

/** The loader uses the actual wave reinforcement grace to repair while the
 * gunner watches the new contacts. A real visible needle decides the work key. */
async function repairDuringReinforcement(
  c: Awaited<ReturnType<typeof tankCrew>>,
) {
  const before = await health(c.loader);
  await c.loader.keyboard.press("Tab");
  await c.loader.keyboard.press("Tab");
  await expect(c.loader.getByTestId("loader-mode")).toHaveText("維修模式");
  const captureTiming = process.env.TANK_PUBLIC_INPUT_TIMING === "1";
  // Read the first actually painted 8° band locally. Serial browser RPC polls
  // can miss this 44ms stimulus despite requesting a 10ms polling interval.
  const perfectBand = c.loader.evaluate(
    (captureTiming) =>
      new Promise<{ values: number[]; observedAt: number }>(
        (resolve, reject) => {
          const circle = document.querySelector<HTMLElement>(
            '[data-testid="repair-calibration"]',
          )!;
          const readout = document.querySelector(
            '[data-testid="repair-calibration-position"]',
          )!;
          const timing: { resolvedAt?: number; keys: object[] } = { keys: [] };
          const key = (event: KeyboardEvent) => {
            if (event.code !== "Space") return;
            const target =
              event.target instanceof HTMLElement ? event.target : null;
            timing.keys.push({
              at: performance.timeOrigin + performance.now(),
              type: event.type,
              trusted: event.isTrusted,
              targetTag: target?.tagName,
              targetTestId: target?.dataset.testid,
              focused: document.hasFocus(),
              visibility: document.visibilityState,
              readout: readout.textContent,
              health: document.querySelector('[data-testid="tank-health"]')
                ?.textContent,
              result: document.querySelector(
                '[data-testid="repair-calibration-result"]',
              )?.textContent,
            });
          };
          if (captureTiming) {
            document.addEventListener("keydown", key, true);
            document.addEventListener("keyup", key, true);
            (window as any).__repairPublicInputTiming = {
              timing,
              dispose: () => {
                document.removeEventListener("keydown", key, true);
                document.removeEventListener("keyup", key, true);
              },
            };
          }
          let active = false;
          let deadline: ReturnType<typeof setTimeout>;
          const finish = (values?: number[]) => {
            clearTimeout(deadline);
            observer.disconnect();
            const observedAt = performance.timeOrigin + performance.now();
            timing.resolvedAt = observedAt;
            values
              ? resolve({ values, observedAt })
              : reject(new Error("實際圓針未在原期限內呈現完美操作區"));
          };
          const observe = () => {
            if (circle.hidden) return;
            if (!active) {
              active = true;
              clearTimeout(deadline);
              deadline = setTimeout(() => finish(), 1800);
            }
            const values = readout.textContent!.match(/[\d.]+/g)!.map(Number);
            const [needle, , , start, end] = values;
            if (needle >= (start + end) / 2 - 8 && needle <= (start + end) / 2)
              finish(values);
          };
          const observer = new MutationObserver(observe);
          deadline = setTimeout(() => finish(), 10000);
          observer.observe(document.querySelector(".battle-station")!, {
            childList: true,
            characterData: true,
            attributes: true,
            subtree: true,
          });
          observe();
        },
      ),
    captureTiming,
  );
  const onset = c.loader.waitForFunction(
    () => {
      const circle = document.querySelector<HTMLElement>(
        '[data-testid="repair-calibration"]',
      );
      return !!circle && !circle.hidden;
    },
    undefined,
    { timeout: 10000 },
  );
  await c.loader.keyboard.down("r");
  await (await onset).dispose();
  await expect(c.loader.getByTestId("repair-calibration")).toBeVisible({
    timeout: 10000,
  });
  const {
    values: [needle, , , start, end],
    observedAt,
  } = await perfectBand;
  const responseAt = Date.now();
  // No async matcher between the observed timing band and the real work key.
  await c.loader.keyboard.press("Space");
  const inputReturnedAt = Date.now();
  if (captureTiming) {
    const timing = await c.loader.evaluate(() => {
      const observation = (window as any).__repairPublicInputTiming;
      observation.dispose();
      delete (window as any).__repairPublicInputTiming;
      return observation.timing;
    });
    await writeFile(
      `${evidence}/perfect-public-input-${responseAt}.json`,
      JSON.stringify(
        {
          observedAt,
          responseAt,
          inputReturnedAt,
          values: [needle, start, end],
          ...timing,
        },
        null,
        2,
      ),
    );
  }
  expect(needle >= (start + end) / 2 - 8 && needle <= (start + end) / 2).toBe(
    true,
  );
  await expect(c.loader.getByTestId("repair-calibration-result")).toHaveText(
    "完美校準・額外 +3 HP",
  );
  await c.loader.keyboard.up("r");
  // Key-up is transported to the authority. Its public ready status confirms
  // repair has stopped before fixing the exact shared-health comparison target.
  await expect(c.loader.getByTestId("repair-status")).toHaveText(
    "已停穩・按住 R 維修",
  );
  let restored: number | undefined;
  await expect
    .poll(
      async () => {
        const current = await health(c.loader);
        const stable = current === restored;
        restored = current;
        return stable;
      },
      { timeout: 1500, intervals: [100] },
    )
    .toBe(true);
  expect(restored).toBeGreaterThan(before + 8);
  await Promise.all(
    [c.driver, c.gunner, c.loader].map(async (page) => {
      await expect(page.getByTestId("tank-health")).toHaveText(
        `${restored}/100`,
      );
      await expect(page.getByTestId("repair-calibration-result")).toHaveText(
        "完美校準・額外 +3 HP",
      );
    }),
  );
  await c.loader.screenshot({
    path: `${evidence}/repaired-wave-${await c.loader
      .getByTestId("wave-status")
      .textContent()
      .then((t) => t!.match(/第 (\d)/)![1])}.png`,
  });
  await c.loader.keyboard.press("Tab");
  await expect(c.loader.getByTestId("loader-mode")).toHaveText("裝填模式");
}

test("三位乘員看見同一個第一波與目前觀測敵車數", async ({ browser }) => {
  const c = await tankCrew(browser);
  try {
    for (const page of [c.driver, c.gunner, c.loader]) {
      await page.setViewportSize({ width: 1280, height: 720 });
      await expect(page.getByTestId("wave-status")).toHaveText(
        "第 1 / 3 波 · 目前觀測敵車 1",
      );
      await expect(page.getByTestId("wave-status")).toBeInViewport();
    }
    await c.loader.screenshot({
      path: `${evidence}/wave-hud-loader.png`,
    });
  } finally {
    await c.close();
  }
});

async function loadAndFire(
  c: Awaited<ReturnType<typeof tankCrew>>,
  shell = "2",
  aim?: () => Promise<void>,
) {
  const loading = (async () => {
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
  })();
  // Separate crew members work together rather than exposing the stationary
  // tank while serially waiting for each other's aim and loading tasks.
  await Promise.all([loading, aim?.()]);
  // Read the painted bearing again after loading in case the enemy moved.
  await aim?.();
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
  const c = await tankCrew(
    browser,
    "loader",
    0,
    1000,
    process.env.TANK_EVIDENCE_DIR
      ? `${process.env.TANK_EVIDENCE_DIR}/win-videos`
      : undefined,
  );
  try {
    await loadAndFire(c);
    const oldContacts = await c.gunner
      .locator(".navigation-enemy")
      .evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("data-contact")!),
      );
    await loadAndFire(c);
    // Observe its ordinary flank and report its actual map bearing. A fixed
    // wait and stale 320° guess can waste the crew's remaining health.
    await observeTiger(c);
    await expect(c.gunner.getByTestId("turret-yaw-rate")).toHaveText("0.0°/s");
    await loadAndFire(c, "2", () => aimAtObservedEnemy(c.gunner, "虎式 I 型"));
    await loadAndFire(c, "2", () => aimAtObservedEnemy(c.gunner, "虎式 I 型"));
    for (const page of [c.driver, c.loader, c.gunner])
      await expect(page.getByTestId("wave-status")).toHaveText(
        "第 2 / 3 波 · 目前觀測敵車 3",
      );
    for (const id of oldContacts)
      for (const page of [c.driver, c.loader, c.gunner])
        await expect(
          page.locator(`.navigation-enemy[data-contact="${id}"]`),
        ).toHaveCount(0);
    await Promise.all([
      repairDuringReinforcement(c),
      aimAtHeading(c.gunner, 0),
    ]);
    await expect(c.gunner.getByTestId("turret-yaw-rate")).toHaveText("0.0°/s");
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
      await loadAndFire(c, "2", () =>
        aimAtObservedEnemy(c.gunner, "四號 H 型", 0),
      );
      await loadAndFire(c, "2", () =>
        aimAtObservedEnemy(c.gunner, "四號 H 型", 0),
      );
      if (wave === 2) {
        for (const page of [c.driver, c.loader, c.gunner])
          await expect(page.getByTestId("wave-status")).toHaveText(
            "第 3 / 3 波 · 目前觀測敵車 3",
          );
        // Same-battle work survives the actual wave transition; only a new
        // battle resets repair/calibration. Health is carried, never refilled.
        for (const page of [c.driver, c.loader, c.gunner]) {
          await expect(
            page.getByTestId("repair-calibration-result"),
          ).toHaveText("完美校準・額外 +3 HP");
          expect(await health(page)).toBeGreaterThan(0);
          expect(await health(page)).toBeLessThan(100);
        }
        await Promise.all([
          repairDuringReinforcement(c),
          aimAtHeading(c.gunner, 0),
        ]);
      } else {
        await observeTiger(c);
        await loadAndFire(c, "2", () =>
          aimAtObservedEnemy(c.gunner, "虎式 I 型"),
        );
        await loadAndFire(c, "2", () =>
          aimAtObservedEnemy(c.gunner, "虎式 I 型"),
        );
      }
    }
    for (const page of [c.driver, c.loader, c.gunner])
      await expect(
        page.getByRole("heading", { name: "戰鬥勝利", exact: true }),
      ).toBeVisible();
    for (const [page, role] of [
      [c.driver, "driver"],
      [c.loader, "loader"],
      [c.gunner, "gunner"],
    ] as const) {
      for (const [width, height] of [
        [1280, 720],
        [1440, 1050],
      ] as const) {
        await page.setViewportSize({ width, height });
        await expect(
          page.getByRole("heading", { name: "戰鬥勝利", exact: true }),
        ).toBeInViewport();
        await expect(page.getByTestId("tank-health")).toBeInViewport();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: `${evidence}/victory-${role}-${width}.png`,
        });
        await page.screenshot({
          path: `${evidence}/victory-${role}-${width}-full.png`,
          fullPage: true,
        });
      }
    }
  } finally {
    await c.close();
  }
});

const replayTest = test.extend<{ crewCleanup: (() => Promise<void>)[] }>({
  crewCleanup: async ({}, use) => {
    await use([]);
  },
});
replayTest.afterEach(async ({ crewCleanup }) => {
  const results = await Promise.allSettled(crewCleanup.map((close) => close()));
  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length)
    throw new AggregateError(
      failed.map((result) => result.reason),
      "Replay crew cleanup failed",
    );
});

replayTest(
  "血量歸零一致失敗且停止操作，同房回廳換職準備並重設新戰鬥",
  async ({ browser, crewCleanup }) => {
    test.setTimeout(180000);
    const c = await tankCrew(
      browser,
      "loader",
      0,
      1000,
      `${evidence}/replay-videos`,
    );
    crewCleanup.push(c.close);
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
    ] as const) {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `${evidence}/defeat-${role}.png`,
      });
      await page.screenshot({
        path: `${evidence}/defeat-${role}-full.png`,
        fullPage: true,
      });
    }
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
      await expect(page.locator(".navigation-enemy")).toHaveCount(0);
      await expect(page.getByTestId("crew-list")).toContainText("尚未選擇職位");
      await expect(page.getByTestId("crew-list")).not.toContainText("已準備");
    }
    for (const [page, role] of [
      [c.loader, "loader"],
      [c.driver, "driver"],
      [c.gunner, "gunner"],
    ] as const) {
      await expect(page.getByTestId("room-code")).toBeInViewport();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `${evidence}/return-${role}-1280.png`,
      });
      await page.screenshot({
        path: `${evidence}/return-${role}-1280-full.png`,
        fullPage: true,
      });
    }
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
      path: `${evidence}/swapped-crew-ready.png`,
    });
    await host.getByRole("button", { name: "開始戰鬥", exact: true }).click();
    for (const page of [c.loader, c.driver, c.gunner]) {
      await expect(page.getByTestId("tank-health")).toHaveText("100/100");
      await expect(page.getByTestId("wave-status")).toHaveText(
        "第 1 / 3 波 · 目前觀測敵車 1",
      );
      await expect(page.getByTestId("battle-result")).toBeHidden();
      await expect(
        page.locator('.navigation-enemy[data-observation="stale"]'),
      ).toHaveCount(0);
      await expect(
        page.locator('.navigation-enemy[data-observation="current"]'),
      ).toHaveCount(1);
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
        path: `${evidence}/new-round-${role}.png`,
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
  },
);
