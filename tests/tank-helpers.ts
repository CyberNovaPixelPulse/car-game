import { expect, type Browser, type Page } from "@playwright/test";

export async function tankCrew(browser: Browser) {
  const pages: Page[] = [];
  for (const name of ["裝填房主", "駕駛乘員", "砲手乘員"]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    pages.push(page);
    await page.goto("/tank.html");
    await page.getByLabel("乘員名稱").fill(name);
  }
  const [loader, driver, gunner] = pages;
  await loader.getByRole("button", { name: "建立房間", exact: true }).click();
  const code = await loader.getByTestId("room-code").textContent();
  for (const page of [driver, gunner]) {
    await page.getByLabel("房間代碼").fill(code!);
    await page.getByRole("button", { name: "加入房間", exact: true }).click();
    await expect(page.getByTestId("crew-list").locator("li")).toHaveCount(
      pages.indexOf(page) + 1,
    );
  }
  for (const [page, role] of [
    [loader, "裝填手"],
    [driver, "駕駛"],
    [gunner, "砲手"],
  ] as const) {
    await page
      .getByRole("button", { name: `擔任${role}`, exact: true })
      .click();
    await page.getByRole("button", { name: "準備", exact: true }).click();
  }
  await loader.getByRole("button", { name: "開始戰鬥", exact: true }).click();
  for (const page of pages)
    await expect(page.getByRole("heading", { name: /工作站$/ })).toBeVisible();
  return {
    loader,
    driver,
    gunner,
    close: async () => {
      for (const page of pages) await page.context().close();
    },
  };
}
