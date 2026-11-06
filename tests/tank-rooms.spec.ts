import { test, expect, type Browser, type Page } from "@playwright/test";

async function crew(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/tank.html");
  await page.getByLabel("乘員名稱").fill(name);
  return page;
}
async function create(page: Page) {
  await page.getByRole("button", { name: "建立房間", exact: true }).click();
  await expect(page.getByTestId("room-code")).toHaveText(/^[A-Z2-9]{6}$/);
  return (await page.getByTestId("room-code").textContent())!;
}
async function join(page: Page, code: string) {
  await page.getByLabel("房間代碼").fill(code);
  await page.getByRole("button", { name: "加入房間", exact: true }).click();
}

test("三人選唯一職位並全員準備，房主可擔任裝填手且只有房主能開始", async ({
  browser,
}) => {
  const host = await crew(browser, "房主"),
    code = await create(host);
  const driver = await crew(browser, "駕駛員"),
    gunner = await crew(browser, "砲手員");
  try {
    await join(driver, code);
    await expect(
      host.getByRole("button", { name: "開始戰鬥", exact: true }),
    ).toBeDisabled();
    await join(gunner, code);
    for (const page of [host, driver, gunner])
      await expect(page.getByTestId("crew-list").locator("li")).toHaveCount(3);
    await host.getByRole("button", { name: "擔任裝填手", exact: true }).click();
    await driver.getByRole("button", { name: "擔任駕駛", exact: true }).click();
    await gunner.getByRole("button", { name: "擔任砲手", exact: true }).click();
    await expect(
      driver.getByRole("button", { name: "開始戰鬥", exact: true }),
    ).toHaveCount(0);
    await expect(
      gunner.getByRole("button", { name: "開始戰鬥", exact: true }),
    ).toHaveCount(0);
    await host.getByRole("button", { name: "準備", exact: true }).click();
    await driver.getByRole("button", { name: "準備", exact: true }).click();
    await expect(
      host.getByRole("button", { name: "開始戰鬥", exact: true }),
    ).toBeDisabled();
    await gunner.getByRole("button", { name: "準備", exact: true }).click();
    await expect(
      host.getByRole("button", { name: "開始戰鬥", exact: true }),
    ).toBeEnabled();
    await host.getByRole("button", { name: "開始戰鬥", exact: true }).click();
    await expect(
      host.getByRole("heading", { name: "裝填手工作站", exact: true }),
    ).toBeVisible();
    await expect(
      driver.getByRole("heading", { name: "駕駛工作站", exact: true }),
    ).toBeVisible();
    await expect(
      gunner.getByRole("heading", { name: "砲手工作站", exact: true }),
    ).toBeVisible();
    for (const page of [host, driver, gunner])
      await expect(page.getByRole("button", { name: /^擔任/ })).toHaveCount(0);
  } finally {
    for (const page of [host, driver, gunner]) await page.context().close();
  }
});

test("第三人可加入、第四人被拒絕，職位同時競爭仍只有一名乘員取得", async ({
  browser,
}) => {
  const host = await crew(browser, "房主"),
    code = await create(host);
  const a = await crew(browser, "甲"),
    b = await crew(browser, "乙"),
    fourth = await crew(browser, "第四位");
  try {
    await join(a, code);
    await join(b, code);
    await expect(a.getByTestId("crew-list").locator("li")).toHaveCount(3);
    await expect(b.getByTestId("crew-list").locator("li")).toHaveCount(3);
    await a.getByRole("button", { name: "擔任駕駛", exact: true }).focus();
    await b.getByRole("button", { name: "擔任駕駛", exact: true }).focus();
    await Promise.all([a.keyboard.press("Space"), b.keyboard.press("Space")]);
    for (const page of [host, a, b])
      await expect(
        page
          .getByTestId("crew-list")
          .locator("li")
          .filter({ hasText: "駕駛 ·" }),
      ).toHaveCount(1);
    await join(fourth, code);
    await expect(fourth.getByRole("status")).toContainText("房間已滿");
    await expect(host.getByTestId("crew-list").locator("li")).toHaveCount(3);
  } finally {
    for (const page of [fourth, b, a, host]) await page.context().close();
  }
});

test("更換職位會取消自己的準備，房主擔任駕駛也可開始", async ({ browser }) => {
  const host = await crew(browser, "房主"),
    code = await create(host);
  const gunner = await crew(browser, "砲手員"),
    loader = await crew(browser, "裝填員");
  try {
    await host.getByRole("button", { name: "擔任砲手", exact: true }).click();
    await host.getByRole("button", { name: "準備", exact: true }).click();
    await expect(
      host.getByRole("button", { name: "取消準備", exact: true }),
    ).toBeVisible();
    await host.getByRole("button", { name: "擔任駕駛", exact: true }).click();
    await expect(
      host.getByRole("button", { name: "準備", exact: true }),
    ).toBeVisible();
    await join(gunner, code);
    await join(loader, code);
    await gunner.getByRole("button", { name: "擔任砲手", exact: true }).click();
    await loader
      .getByRole("button", { name: "擔任裝填手", exact: true })
      .click();
    for (const page of [host, gunner, loader])
      await page.getByRole("button", { name: "準備", exact: true }).click();
    await host.getByRole("button", { name: "開始戰鬥", exact: true }).click();
    await expect(
      host.getByRole("heading", { name: "駕駛工作站", exact: true }),
    ).toBeVisible();
    await expect(
      gunner.getByRole("heading", { name: "砲手工作站", exact: true }),
    ).toBeVisible();
    await expect(
      loader.getByRole("heading", { name: "裝填手工作站", exact: true }),
    ).toBeVisible();
  } finally {
    for (const page of [host, gunner, loader]) await page.context().close();
  }
});

test("無效代碼有明確提示，之後可建立房間；房主離開會結束隊友房間", async ({
  browser,
}) => {
  const host = await crew(browser, "房主"),
    guest = await crew(browser, "隊友");
  try {
    await join(guest, "ZZZZZZ");
    await expect(guest.getByRole("status")).toContainText("找不到這個房間", {
      timeout: 25000,
    });
    const code = await create(host);
    await join(guest, code);
    await expect(guest.getByTestId("crew-list").locator("li")).toHaveCount(2);
    await host.getByRole("button", { name: "離開房間", exact: true }).click();
    await expect(guest.getByRole("status")).toContainText("房主已離線");
    await expect(
      guest.getByRole("button", { name: "建立房間", exact: true }),
    ).toBeVisible();
  } finally {
    for (const page of [host, guest]) await page.context().close();
  }
});
