import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

test("駕駛離頁全場暫停，裝填與戰況凍結，原職位重連後安全續玩", async ({
  browser,
}) => {
  const c = await tankCrew(browser);
  try {
    await c.loader.setViewportSize({ width: 1280, height: 720 });
    const normalView = await c.loader
      .getByRole("img", { name: "車內炮膛與彈藥架" })
      .boundingBox();
    await c.loader.keyboard.down("r");
    await expect(c.loader.getByTestId("load-progress")).not.toHaveText("0");
    await c.driver.goto("about:blank");
    for (const page of [c.loader, c.gunner]) {
      await expect(page.getByTestId("battle-pause")).toContainText("等待駕駛");
      await expect(page.getByTestId("battle-pause")).toBeVisible();
    }
    await expect(c.loader.getByTestId("battle-pause")).toBeVisible();
    await expect(c.gunner.getByTestId("battle-pause")).toBeVisible();
    await c.loader.screenshot({
      path: "/tmp/car-game-to-spec/ticket24-loader-pause-fixed-1280.png",
      fullPage: true,
    });
    const leave = await c.loader
      .getByRole("button", { name: "離開房間", exact: true })
      .boundingBox();
    expect(leave!.y + leave!.height).toBeLessThanOrEqual(720);
    const progress = await c.loader.getByTestId("load-progress").textContent();
    const health = await c.gunner.getByTestId("tank-health").textContent();
    const enemies = await c.gunner.getByTestId("target-status").textContent();
    await c.loader.keyboard.up("r");
    await c.gunner.keyboard.press("d");
    await c.loader.waitForTimeout(1800);
    await expect(c.loader.getByTestId("load-progress")).toHaveText(progress!);
    await expect(c.gunner.getByTestId("tank-health")).toHaveText(health!);
    await expect(c.gunner.getByTestId("target-status")).toHaveText(enemies!);
    await expect(c.gunner.getByTestId("turret-yaw-rate")).toHaveText("0.0°/s");
    await c.driver.goto("/tank.html");
    await expect(
      c.driver.getByRole("heading", { name: "駕駛工作站" }),
    ).toBeVisible();
    for (const page of [c.driver, c.loader, c.gunner])
      await expect(page.getByTestId("battle-pause")).toBeHidden();
    await expect(c.loader.getByTestId("load-progress")).toHaveText(progress!);
    const resumedView = await c.loader
      .getByRole("img", { name: "車內炮膛與彈藥架" })
      .boundingBox();
    expect(resumedView!.height).toBe(normalView!.height);
    await c.loader.waitForTimeout(500);
    await expect(c.loader.getByTestId("load-progress")).toHaveText(progress!);
    await c.loader.keyboard.down("r");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
  } finally {
    await c.close();
  }
});

test("缺員以現實60秒到期回同房，舊戰鬥不能續接，新局須三職全員準備", async ({
  browser,
}) => {
  test.setTimeout(115000);
  const c = await tankCrew(browser);
  try {
    await c.driver.goto("about:blank");
    await expect(c.loader.getByTestId("battle-pause")).toContainText(
      "等待駕駛",
    );
    const pausedAt = Date.now();
    // This deliberately waits real wall time; production reconnect rules are never shortened.
    await c.loader.waitForTimeout(57000);
    await expect(
      c.loader.getByRole("heading", { name: "裝填手工作站" }),
    ).toBeVisible();
    await expect(c.gunner.getByTestId("battle-pause")).toBeVisible();
    await expect(
      c.loader.getByRole("heading", { name: "乘員集合" }),
    ).toBeVisible({ timeout: 8000 });
    const elapsed = Date.now() - pausedAt;
    expect(elapsed).toBeGreaterThanOrEqual(59000);
    expect(elapsed).toBeLessThan(65000);
    for (const page of [c.loader, c.gunner]) {
      await expect(page.getByTestId("room-code")).toHaveText(c.code);
      await expect(page.getByTestId("crew-list").locator("li")).toHaveCount(2);
      await expect(page.getByTestId("crew-list")).toContainText("尚未選擇職位");
      await expect(page.getByRole("status")).toContainText("60 秒");
    }
    await expect(
      c.loader.getByRole("button", { name: "開始戰鬥", exact: true }),
    ).toBeDisabled();
    await c.driver.goto("/tank.html");
    await expect(c.driver.getByRole("status")).toContainText("已結束");
    await expect(
      c.driver.getByRole("heading", { name: "駕駛工作站" }),
    ).toHaveCount(0);
    await c.driver.getByLabel("乘員名稱").fill("原駕駛重新集合");
    await c.driver.getByLabel("房間代碼").fill(c.code);
    await c.driver
      .getByRole("button", { name: "加入房間", exact: true })
      .click();
    await expect(c.driver.getByTestId("crew-list").locator("li")).toHaveCount(
      3,
    );
    for (const [page, role] of [
      [c.loader, "裝填手"],
      [c.gunner, "砲手"],
      [c.driver, "駕駛"],
    ] as const)
      await page
        .getByRole("button", { name: `擔任${role}`, exact: true })
        .click();
    for (const page of [c.loader, c.gunner])
      await page.getByRole("button", { name: "準備", exact: true }).click();
    await expect(
      c.loader.getByRole("button", { name: "開始戰鬥", exact: true }),
    ).toBeDisabled();
    await c.driver.getByRole("button", { name: "準備", exact: true }).click();
    await expect(
      c.loader.getByRole("button", { name: "開始戰鬥", exact: true }),
    ).toBeEnabled();
    await c.loader
      .getByRole("button", { name: "開始戰鬥", exact: true })
      .click();
    for (const page of [c.loader, c.gunner, c.driver]) {
      await expect(page.getByTestId("tank-health")).toHaveText("100/100");
      await expect(page.getByTestId("wave-status")).toContainText(
        "第 1 / 3 波",
      );
      await expect(page.getByTestId("battle-pause")).toBeHidden();
    }
  } finally {
    await c.close();
  }
});

test("非房主裝填手帶同一發卡彈重連，原職位與目標區保留", async ({
  browser,
}) => {
  const c = await tankCrew(browser, "gunner", 0, 1);
  try {
    await c.loader.keyboard.down("r");
    await expect(c.loader.getByTestId("chamber-state")).toHaveText("卡彈");
    await c.loader.keyboard.up("r");
    const zone = await c.loader.getByTestId("jam-zone").getAttribute("style");
    await c.loader.goto("about:blank");
    for (const page of [c.driver, c.gunner])
      await expect(page.getByTestId("battle-pause")).toContainText(
        "等待裝填手",
      );
    await c.driver.screenshot({
      path: "/tmp/car-game-to-spec/ticket24-paused-driver.png",
      fullPage: true,
    });
    await c.gunner.screenshot({
      path: "/tmp/car-game-to-spec/ticket24-paused-gunner.png",
      fullPage: true,
    });
    const hp = await c.gunner.getByTestId("tank-health").textContent();
    await c.gunner.waitForTimeout(1500);
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("卡彈");
    await expect(c.gunner.getByTestId("tank-health")).toHaveText(hp!);
    await c.loader.goto("/tank.html");
    await expect(
      c.loader.getByRole("heading", { name: "裝填手工作站" }),
    ).toBeVisible();
    await expect(c.loader.getByTestId("chamber-state")).toHaveText("卡彈");
    await expect(c.loader.getByTestId("load-progress")).toHaveText("40");
    await expect(c.loader.getByTestId("jam-zone")).toHaveAttribute(
      "style",
      zone!,
    );
    await expect(c.loader.getByTestId("jam-result")).toHaveText("按空白鍵停針");
    for (const page of [c.driver, c.loader, c.gunner])
      await expect(page.getByTestId("battle-pause")).toBeHidden();
  } finally {
    await c.close();
  }
});

test("非房主砲手離頁凍結卡彈指針，全員恢復後才繼續移動", async ({
  browser,
}) => {
  const c = await tankCrew(browser, "loader", 0, 2);
  try {
    await c.loader.keyboard.down("r");
    await expect(c.loader.getByTestId("chamber-state")).toHaveText("卡彈");
    await c.loader.keyboard.up("r");
    await c.gunner.goto("about:blank");
    for (const page of [c.driver, c.loader]) {
      await expect(page.getByTestId("battle-pause")).toContainText("等待砲手");
      await expect(page.getByTestId("battle-pause")).toBeVisible();
    }
    const needle = await c.loader
      .getByTestId("jam-needle")
      .getAttribute("style");
    const zone = await c.loader.getByTestId("jam-zone").getAttribute("style");
    await c.loader.waitForTimeout(1600);
    await expect(c.loader.getByTestId("jam-needle")).toHaveAttribute(
      "style",
      needle!,
    );
    await expect(c.loader.getByTestId("load-progress")).toHaveText("40");
    await c.gunner.goto("/tank.html");
    await expect(
      c.gunner.getByRole("heading", { name: "砲手工作站" }),
    ).toBeVisible();
    await expect(c.loader.getByTestId("jam-zone")).toHaveAttribute(
      "style",
      zone!,
    );
    await expect(c.loader.getByTestId("jam-needle")).not.toHaveAttribute(
      "style",
      needle!,
    );
    await expect(c.loader.getByTestId("load-progress")).toHaveText("40");
  } finally {
    await c.close();
  }
});

test("真實會合服務暫時中斷時可明確重試並恢復原駕駛席", async ({ browser }) => {
  const c = await tankCrew(browser);
  let relayPid: number | undefined;
  try {
    await c.driver.goto("about:blank");
    await expect(c.loader.getByTestId("battle-pause")).toContainText(
      "等待駕駛",
    );
    const peerPort = String(Number(process.env.PEER_PORT || 4274));
    const pids = [
      ...new Set(
        execFileSync("lsof", ["-t", `-iTCP:${peerPort}`, "-sTCP:LISTEN"], {
          encoding: "utf8",
        })
          .trim()
          .split(/\s+/),
      ),
    ];
    expect(pids).toHaveLength(1);
    relayPid = Number(pids[0]);
    const cwd = execFileSync(
      "lsof",
      ["-a", "-p", String(relayPid), "-d", "cwd", "-Fn"],
      { encoding: "utf8" },
    );
    expect(cwd.split("\n")).toContain(`n${process.cwd()}`);
    console.log(
      `Pausing actual own PeerServer PID ${relayPid}, port ${peerPort}, cwd ${process.cwd()}`,
    );
    process.kill(relayPid, "SIGSTOP");
    await c.driver.goto("/tank.html");
    await expect(c.driver.getByRole("status")).toContainText("逾時", {
      timeout: 24000,
    });
    await expect(
      c.driver.getByRole("button", { name: "重新連線", exact: true }),
    ).toBeVisible();
    process.kill(relayPid, "SIGCONT");
    relayPid = undefined;
    await c.driver
      .getByRole("button", { name: "重新連線", exact: true })
      .click();
    await expect(
      c.driver.getByRole("heading", { name: "駕駛工作站" }),
    ).toBeVisible({ timeout: 20000 });
    for (const page of [c.driver, c.loader, c.gunner])
      await expect(page.getByTestId("battle-pause")).toBeHidden();
  } finally {
    if (relayPid !== undefined) process.kill(relayPid, "SIGCONT");
    await c.close();
  }
});

test("缺員超過八秒仍保留煙幕與五秒暈眩，重連後只走剩餘遊戲時間", async ({
  browser,
}) => {
  const c = await tankCrew(browser);
  try {
    await c.loader.keyboard.press("3");
    await c.loader.keyboard.down("r");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    await c.gunner.keyboard.press("Space");
    await expect(c.gunner.getByTestId("smoke-status")).toHaveText(
      "煙幕遮蔽視線",
    );
    await expect(c.loader.getByTestId("loader-status")).toContainText("暈眩");
    await c.driver.goto("about:blank");
    await expect(c.loader.getByTestId("battle-pause")).toContainText(
      "等待駕駛",
    );
    await expect(c.loader.getByTestId("battle-pause")).toBeVisible();
    const stun = await c.loader.getByTestId("stun-remaining").textContent();
    const health = await c.gunner.getByTestId("tank-health").textContent();
    await c.loader.screenshot({
      path: "/tmp/car-game-to-spec/ticket24-paused-stun.png",
      fullPage: true,
    });
    await c.gunner.screenshot({
      path: "/tmp/car-game-to-spec/ticket24-paused-smoke.png",
      fullPage: true,
    });
    await c.loader.waitForTimeout(9000);
    await expect(c.loader.getByTestId("stun-remaining")).toHaveText(stun!);
    await expect(c.gunner.getByTestId("smoke-status")).toHaveText(
      "煙幕遮蔽視線",
    );
    await expect(c.gunner.getByTestId("tank-health")).toHaveText(health!);
    await c.driver.goto("/tank.html");
    await expect(
      c.driver.getByRole("heading", { name: "駕駛工作站" }),
    ).toBeVisible();
    await expect(c.loader.getByTestId("loader-status")).toContainText("暈眩");
    await expect(c.gunner.getByTestId("smoke-status")).toHaveText(
      "煙幕遮蔽視線",
    );
    await expect(c.loader.getByTestId("stun-remaining")).toHaveText("", {
      timeout: 6000,
    });
    await expect(c.gunner.getByTestId("smoke-status")).toHaveText("視線清晰", {
      timeout: 8500,
    });
  } finally {
    await c.close();
  }
});

test("缺員時機槍熱度與強制冷卻凍結，恢復不補算或自動開火", async ({
  browser,
}) => {
  const c = await tankCrew(browser);
  try {
    await c.loader.keyboard.press("Tab");
    await expect(c.loader.getByTestId("loader-mode")).toHaveText("機槍模式");
    await c.loader.keyboard.down("Space");
    await expect(c.loader.getByTestId("mg-status")).toHaveText(
      "過熱・強制冷卻",
      { timeout: 7500 },
    );
    await c.driver.goto("about:blank");
    await expect(c.loader.getByTestId("battle-pause")).toContainText(
      "等待駕駛",
    );
    await c.loader.keyboard.up("Space");
    const heat = await c.loader.getByTestId("mg-heat").textContent();
    const cooldown = await c.loader.getByTestId("mg-cooldown").textContent();
    const shots = await c.loader.getByTestId("mg-shot-count").textContent();
    await c.loader.waitForTimeout(4200);
    await expect(c.loader.getByTestId("mg-heat")).toHaveText(heat!);
    await expect(c.loader.getByTestId("mg-cooldown")).toHaveText(cooldown!);
    await expect(c.loader.getByTestId("mg-shot-count")).toHaveText(shots!);
    await c.driver.goto("/tank.html");
    await expect(
      c.driver.getByRole("heading", { name: "駕駛工作站" }),
    ).toBeVisible();
    await expect(c.loader.getByTestId("mg-status")).toHaveText(
      "過熱・強制冷卻",
    );
    await expect(c.loader.getByTestId("mg-status")).toHaveText("可以射擊", {
      timeout: 4000,
    });
    await c.loader.waitForTimeout(300);
    await expect(c.loader.getByTestId("mg-shot-count")).toHaveText(shots!);
    await expect(c.loader.getByTestId("loader-mode")).toHaveText("機槍模式");
  } finally {
    await c.close();
  }
});

test("房主實際離開直接結束房間，其他職位不接任房主", async ({ browser }) => {
  const c = await tankCrew(browser);
  try {
    await c.loader
      .getByRole("button", { name: "離開房間", exact: true })
      .click();
    for (const page of [c.driver, c.gunner]) {
      await expect(page.getByRole("status")).toContainText("房主已離線", {
        timeout: 15000,
      });
      await expect(
        page.getByRole("heading", { name: "與隊友集合" }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "建立房間", exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId("room-code")).toHaveCount(0);
    }
  } finally {
    await c.close();
  }
});

test("退殼預警遇斷線保留未退空殼，恢復後才判定退殼與暈眩", async ({
  browser,
}) => {
  const c = await tankCrew(browser);
  try {
    await c.loader.keyboard.down("r");
    await expect(c.gunner.getByTestId("chamber-state")).toHaveText("主炮就緒");
    await c.loader.keyboard.up("r");
    await c.gunner.keyboard.press("Space");
    await expect(c.loader.getByTestId("ejection-warning")).toContainText(
      "按住 C",
    );
    await c.gunner.goto("about:blank");
    await expect(c.loader.getByTestId("battle-pause")).toContainText(
      "等待砲手",
    );
    await expect(c.loader.getByTestId("chamber-state")).toHaveText("正在退殼");
    await c.loader.waitForTimeout(1500);
    await expect(c.loader.getByTestId("chamber-state")).toHaveText("正在退殼");
    await expect(c.loader.getByTestId("loader-status")).not.toContainText(
      "暈眩",
    );
    await c.gunner.goto("/tank.html");
    await expect(c.loader.getByTestId("chamber-state")).toHaveText("空膛");
    await expect(c.loader.getByTestId("loader-status")).toContainText("暈眩");
  } finally {
    await c.close();
  }
});
