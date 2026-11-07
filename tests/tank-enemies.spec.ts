import { test, expect } from "@playwright/test";
import { tankCrew, aimAtHeading, observeTiger } from "./tank-helpers";

test("敵車接近並預告開火，敵彈扣除三人共用血量直至一致失敗", async ({
  browser,
}) => {
  const c = await tankCrew(browser);
  try {
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "四號 H 型",
    );
    await expect(c.gunner.getByTestId("enemy-warning")).toContainText("瞄準", {
      timeout: 20000,
    });
    await expect(c.gunner.getByTestId("enemy-warning")).toBeInViewport();
    await c.gunner.screenshot({
      path: "/tmp/car-game-spec30/evidence/37/legacy/visual27-final/regression/visual21/enemy-warning.png",
      fullPage: false,
    });
    await expect(c.gunner.getByTestId("tank-health")).not.toHaveText(
      "100/100",
      { timeout: 20000 },
    );
    const health = await c.gunner.getByTestId("tank-health").textContent();
    for (const page of [c.driver, c.loader])
      await expect(page.getByTestId("tank-health")).toHaveText(health!);
    for (const page of [c.driver, c.loader, c.gunner]) {
      await expect(page.getByTestId("damage-warning")).toContainText("命中");
      await expect(page.getByRole("heading", { name: "戰鬥失敗" })).toBeVisible(
        { timeout: 70000 },
      );
      await expect(page.getByTestId("tank-health")).toHaveText("0/100");
    }
    await c.driver.screenshot({
      path: "/tmp/car-game-spec30/evidence/37/legacy/visual27-final/regression/visual21/defeat-driver.png",
      fullPage: true,
    });
    await c.gunner.screenshot({
      path: "/tmp/car-game-spec30/evidence/37/legacy/visual27-final/regression/visual21/defeat-gunner.png",
      fullPage: true,
    });
  } finally {
    await c.close();
  }
});

for (const [key, remaining] of [
  ["1", 100],
  ["2", 20],
] as const) {
  test(`${key === "1" ? "高爆" : "穿甲"}能擊毀四號，敵彈已扣血後己方主炮仍不自傷`, async ({
    browser,
  }) => {
    const c = await tankCrew(browser);
    try {
      await c.loader.keyboard.press(key);
      for (const hp of [remaining, 0]) {
        await c.loader.keyboard.down("r");
        await expect(c.gunner.getByTestId("chamber-state")).toHaveText(
          "主炮就緒",
        );
        await c.loader.keyboard.up("r");
        const beforeAttack = await c.gunner
          .getByTestId("tank-health")
          .textContent();
        await expect(c.gunner.getByTestId("tank-health")).not.toHaveText(
          beforeAttack!,
          { timeout: 20000 },
        );
        const before = await c.gunner.getByTestId("tank-health").textContent();
        await c.loader.keyboard.down("c");
        await c.gunner.keyboard.press("Space");
        await expect(c.gunner.getByTestId("target-status")).toContainText(
          `四號 H 型 ${hp}/200`,
        );
        for (const p of [c.driver, c.loader, c.gunner])
          await expect(p.getByTestId("tank-health")).toHaveText(before!);
        await expect(c.loader.getByTestId("chamber-state")).toHaveText("空膛");
        await c.loader.keyboard.up("c");
      }
      await expect(c.gunner.getByTestId("target-status")).toContainText(
        "已擊毀",
      );
      await observeTiger(c);
      await expect(c.gunner.getByTestId("target-status")).toContainText(
        "虎式 I 型 360/360",
      );
    } finally {
      await c.close();
    }
  });
}

test("擊毀近處四號後，乘員利用石牆遮蔽虎式且己方炮火不能穿牆", async ({
  browser,
}) => {
  const c = await tankCrew(browser);
  try {
    // Clear the nearby tank through ordinary play before seeking cover from
    // the farther Tiger; a Panzer already around a wall is not protected LOS.
    await c.loader.keyboard.press("2");
    for (const remaining of [20, 0]) {
      await c.loader.keyboard.down("r");
      await expect(c.gunner.getByTestId("chamber-state")).toHaveText(
        "主炮就緒",
      );
      await c.loader.keyboard.up("r");
      await c.loader.keyboard.down("c");
      await c.gunner.keyboard.press("Space");
      await expect(c.gunner.getByTestId("target-status")).toContainText(
        `四號 H 型 ${remaining}/200`,
      );
      await expect(c.loader.getByTestId("chamber-state")).toHaveText("空膛");
      await c.loader.keyboard.up("c");
    }
    // Driver follows the gunner's spoken heading/instrument instructions; no world-state access.
    await c.loader.keyboard.down("r");
    await c.driver.keyboard.down("s");
    await new Promise((resolve) => setTimeout(resolve, 8000));
    await c.driver.keyboard.up("s");
    await expect(c.driver.getByTestId("tank-speed")).toHaveText("0.0");
    await c.driver.keyboard.down("d");
    await expect
      .poll(
        async () =>
          Number(
            (await c.gunner.getByTestId("hull-heading").textContent())!.replace(
              "°",
              "",
            ),
          ),
        { intervals: [16] },
      )
      .toBeGreaterThanOrEqual(65);
    await c.driver.keyboard.up("d");
    await new Promise((resolve) => setTimeout(resolve, 600));
    const heading = async () =>
      Number(
        (await c.gunner.getByTestId("hull-heading").textContent())!.replace(
          "°",
          "",
        ),
      );
    // The gunner gives visible heading corrections. Braking/coasting and network
    // delivery can overshoot a fixed held duration; do not assume a 90° turn.
    for (let correction = 0; correction < 8; correction++) {
      const error = 90 - (await heading());
      if (Math.abs(error) <= 2) break;
      const key = error > 0 ? "d" : "a";
      const duration = Math.max(
        50,
        Math.min(260, Math.sqrt(Math.abs(error)) * 80),
      );
      await c.driver.keyboard.down(key);
      await new Promise((resolve) => setTimeout(resolve, duration));
      await c.driver.keyboard.up(key);
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
    expect(await heading()).toBeGreaterThanOrEqual(88);
    expect(await heading()).toBeLessThanOrEqual(92);
    console.log("cover settled visible heading", await heading());
    await c.driver.keyboard.down("w");
    await Promise.all([
      aimAtHeading(c.gunner, 0),
      (async () => {
        await new Promise((resolve) => setTimeout(resolve, 2600));
        await c.driver.keyboard.up("w");
      })(),
    ]);
    await expect(c.driver.getByTestId("tank-speed")).toHaveText("0.0");
    await expect(c.gunner.getByTestId("turret-yaw-rate")).toHaveText("0.0°/s");
    console.log(
      "cover firing visible pose",
      await c.gunner.getByTestId("hull-heading").textContent(),
      await c.gunner.getByTestId("turret-heading").textContent(),
      await c.driver.getByTestId("tank-contact").textContent(),
    );
    const coverStarted = Date.now();
    const health = await c.gunner.getByTestId("tank-health").textContent();
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    await c.loader.keyboard.down("c");
    await c.gunner.keyboard.press("Space");
    await expect(c.gunner.getByTestId("flight-status")).toHaveText("砲彈命中");
    // The four-second observation starts at the public HP baseline. A slow
    // screenshot must not extend it into the enemy's legitimate later flank.
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, 4000 - (Date.now() - coverStarted))),
    );
    console.log("cover sample elapsed", Date.now() - coverStarted);
    await Promise.all(
      [c.gunner, c.loader, c.driver].map((p) =>
        expect(p.getByTestId("tank-health")).toHaveText(health!),
      ),
    );
    // This lateral position can see part of the flanking Tiger around cover.
    // Shared observed HP verifies that the actual blocked shot did no damage;
    // the initial fully hidden Tiger is covered by tank-scouting.spec.ts.
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "虎式 I 型 360/360",
    );
    await c.gunner.screenshot({
      path: "/tmp/car-game-spec30/evidence/37/legacy/visual27-final/regression/visual21/cover.png",
      fullPage: true,
    });
    // Cover delays the enemy; its normal flank must eventually expose this position.
    await expect(c.gunner.getByTestId("enemy-warning")).toContainText("瞄準", {
      timeout: 20000,
    });
    await expect(c.gunner.getByTestId("tank-health")).not.toHaveText(health!, {
      timeout: 20000,
    });
    await c.gunner.screenshot({
      path: "/tmp/car-game-spec30/evidence/37/legacy/visual27-final/regression/visual21/cover-flanked.png",
      fullPage: true,
    });
  } finally {
    await c.close();
  }
});

test("虎式繞過前牆接近，重裝耐打且可用兩發穿甲擊毀", async ({ browser }) => {
  const c = await tankCrew(browser);
  async function shot(key: string) {
    await c.loader.keyboard.press(key);
    await c.loader.keyboard.down("r");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    await c.loader.keyboard.down("c");
    await c.gunner.keyboard.press("Space");
    await expect(c.loader.getByTestId("chamber-state")).toHaveText("空膛");
    await c.loader.keyboard.up("c");
  }
  try {
    await shot("1");
    await shot("1");
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "四號 H 型 0/200",
    );
    await c.gunner.waitForTimeout(23000);
    await aimAtHeading(c.gunner, 320);
    await expect
      .poll(async () =>
        Number(
          (await c.gunner.getByTestId("turret-heading").textContent())!.replace(
            "°",
            "",
          ),
        ),
      )
      .toBeGreaterThan(300);
    await expect(c.gunner.getByTestId("turret-yaw-rate")).toHaveText("0.0°/s");
    await c.gunner.screenshot({
      path: "/tmp/car-game-spec30/evidence/37/legacy/visual27-final/regression/visual21/tiger-approach.png",
      fullPage: true,
    });
    await shot("2");
    await expect(c.gunner.getByTestId("target-status")).toContainText(
      "虎式 I 型 180/360",
    );
    await shot("2");
    // Clearing both first-wave enemies brings real reinforcements, replacing
    // obsolete wreck IDs instead of retaining targets from the earlier wave.
    await expect(c.gunner.getByTestId("wave-status")).toHaveText(
      "第 2 / 3 波 · 目前觀測敵車 3",
    );
    await expect(c.gunner.getByTestId("battle-result")).toBeHidden();
    await c.gunner.screenshot({
      path: "/tmp/car-game-spec30/evidence/37/legacy/visual27-final/regression/visual21/tiger-wreck.png",
      fullPage: true,
    });
  } finally {
    await c.close();
  }
});

test("敵彈先扣血後，裝填手機槍會實傷敵車並保留己方血量與虎式上限", async ({
  browser,
}) => {
  const c = await tankCrew(browser, "gunner");
  try {
    await expect(c.gunner.getByTestId("tank-health")).not.toHaveText(
      "100/100",
      { timeout: 20000 },
    );
    const panzerHit = await c.gunner
      .getByTestId("damage-warning")
      .textContent();
    // Observe actual incoming impacts, not the reload label at muzzle launch.
    // This first Panzer hit is followed by a distinct Tiger hit and the next
    // Panzer hit; only then begin the ordinary first MG burst.
    const health = await c.gunner.evaluate(
      (panzerHit) =>
        new Promise<string>((resolve, reject) => {
          const notice = document.querySelector(
            '[data-testid="damage-warning"]',
          )!;
          const hp = document.querySelector('[data-testid="tank-health"]')!;
          let last = notice.textContent ?? "";
          let tigerHit = Boolean(last && last !== panzerHit);
          const timer = setTimeout(() => {
            observer.disconnect();
            reject(new Error("未觀察到兩類敵車的真命中循環"));
          }, 30000);
          const observer = new MutationObserver(() => {
            const text = notice.textContent ?? "";
            if (!text || text === last) return;
            last = text;
            if (text !== panzerHit) tigerHit = true;
            else if (tigerHit) {
              clearTimeout(timer);
              observer.disconnect();
              resolve(hp.textContent!);
            }
          });
          observer.observe(notice, {
            childList: true,
            characterData: true,
            subtree: true,
          });
        }),
      panzerHit,
    );
    await c.loader.keyboard.press("Tab");
    await c.loader.keyboard.down("Space");
    // Observe the same visible count in-browser; Node poll backoff needlessly
    // extended the burst into the next incoming enemy shell.
    await c.loader.waitForFunction(
      () =>
        Number(
          document.querySelector('[data-testid="mg-shot-count"]')?.textContent,
        ) >= 12,
      undefined,
      { timeout: 10000 },
    );
    await c.loader.keyboard.up("Space");
    await Promise.all(
      [c.gunner, c.loader, c.driver].map((page) =>
        expect(page.getByTestId("tank-health")).toHaveText(health!),
      ),
    );
    await expect
      .poll(async () => {
        const text = await c.loader
          .getByTestId("mg-target-status")
          .textContent();
        return Number(text!.match(/四號 H 型 (\d+)\/200/)?.[1]);
      })
      .toBeLessThan(195);
    await observeTiger(c);
    await expect(c.loader.getByTestId("mg-target-status")).toContainText(
      "虎式 I 型 360/360",
    );

    await c.loader.screenshot({
      path: "/tmp/car-game-spec30/evidence/37/legacy/visual27-final/regression/visual21/mg-enemy-damage.png",
      fullPage: true,
    });
  } finally {
    await c.close();
  }
});
