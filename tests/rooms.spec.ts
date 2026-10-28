import { test, expect } from "@playwright/test";
import { player, createRoom, joinRoom } from "./helpers";
test("無效房間代碼顯示明確錯誤，仍可建立新房間", async ({ browser }) => {
  const page = await player(browser, "迷路車手");
  await joinRoom(page, "ZZZZZZ");
  await expect(page.getByRole("status")).toContainText("找不到這個房間", {
    timeout: 25000,
  });
  await createRoom(page);
  await page.context().close();
});
test("五人可使用房間代碼加入，第六人被拒絕", async ({ browser }) => {
  const host = await player(browser, "房主");
  const code = await createRoom(host);
  const guests = [];
  for (let i = 1; i <= 4; i++) {
    const guest = await player(browser, `車手${i}`);
    guests.push(guest);
    await joinRoom(guest, code);
    await expect(guest.getByTestId("members").locator("li")).toHaveCount(i + 1);
  }
  await expect(host.getByTestId("members").locator("li")).toHaveCount(5);
  const sixth = await player(browser, "第六位");
  await joinRoom(sixth, code);
  await expect(sixth.getByRole("status")).toContainText("房間已滿");
  for (const page of [sixth, ...guests, host]) await page.context().close();
});
