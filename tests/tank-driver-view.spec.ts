import { test, expect, type Page } from "@playwright/test";

test("房主駕駛的真實外景資產阻擋準備票，取消與換職不留下過期視野", async ({
  browser,
}) => {
  const pages: Page[] = [];
  let release!: () => void;
  const assetGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested = false;
  try {
    for (const name of ["駕駛房主", "砲手乘員", "裝填乘員"]) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      const page = await context.newPage();
      pages.push(page);
      await page.goto("/");
      await page.getByLabel("乘員名稱").fill(name);
    }
    const [host, gunner, loader] = pages;
    await host.getByRole("button", { name: "建立房間", exact: true }).click();
    const code = (await host.getByTestId("room-code").textContent())!;
    for (const page of [gunner, loader]) {
      await page.getByLabel("房間代碼").fill(code);
      await page.getByRole("button", { name: "加入房間", exact: true }).click();
    }
    for (const page of pages)
      await expect(page.getByTestId("crew-list").locator("li")).toHaveCount(3);
    await host.route("**/art/sky/*.hdr", async (route) => {
      requested = true;
      await assetGate;
      await route.continue().catch(() => {});
    });
    await host.getByRole("button", { name: "擔任駕駛", exact: true }).click();
    await host.getByRole("button", { name: "準備", exact: true }).click();
    await expect.poll(() => requested).toBe(true);
    await expect(
      host.getByText("正在準備工作畫面", { exact: false }),
    ).toBeVisible();
    for (const page of pages) {
      await expect(
        page
          .getByTestId("crew-list")
          .locator("li")
          .filter({ hasText: "駕駛房主" }),
      ).toContainText("未準備");
    }
    await expect(
      host.getByRole("button", { name: "開始戰鬥", exact: true }),
    ).toBeDisabled();
    await host.getByRole("button", { name: "取消準備", exact: true }).click();
    await host.getByRole("button", { name: "擔任砲手", exact: true }).click();
    const oldAsset = host.waitForResponse((response) =>
      response.url().endsWith(".hdr"),
    );
    release();
    await oldAsset;
    await host.unroute("**/art/sky/*.hdr");
    await expect(
      host.getByRole("button", { name: "準備", exact: true }),
    ).toBeVisible();
    await expect(host.getByTestId("crew-list").locator(".is-me")).toContainText(
      "未準備",
    );
    await expect(host.locator("canvas")).toHaveCount(0);
    for (const [page, role] of [
      [host, "駕駛"],
      [gunner, "砲手"],
      [loader, "裝填手"],
    ] as const) {
      await page
        .getByRole("button", { name: `擔任${role}`, exact: true })
        .click();
      await page.getByRole("button", { name: "準備", exact: true }).click();
    }
    await host.getByRole("button", { name: "開始戰鬥", exact: true }).click();
    await expect(
      host.getByRole("img", { name: "駕駛裝甲觀察窗" }),
    ).toBeInViewport({ ratio: 1 });
    await host.screenshot({
      path: `${process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/31"}/legacy-host-driver-1280x720.png`,
    });
    await host.keyboard.down("w");
    for (const page of [host, gunner])
      await expect(page.getByTestId("tank-motion")).toHaveText("前進");
    await host.keyboard.up("w");
    for (const page of [host, gunner])
      await expect(page.getByTestId("tank-motion")).toHaveText("靜止");
    await host.getByRole("button", { name: "離開房間", exact: true }).click();
    for (const page of pages) {
      await expect(page.getByLabel("乘員名稱")).toBeVisible();
      await expect(page.locator("canvas")).toHaveCount(0);
    }
  } finally {
    release();
    for (const page of pages) await page.context().close();
  }
});
