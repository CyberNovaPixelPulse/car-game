import { test, expect } from "@playwright/test";
import { player, createRoom, joinRoom } from "./helpers";
test("房主倒數開賽，另一位玩家能看到駕駛移動", async ({ browser }) => {
  const host = await player(browser, "橘子");
  const code = await createRoom(host);
  await expect(host.getByRole("button", { name: "開始比賽" })).toBeDisabled();
  const guest = await player(browser, "葡萄");
  await joinRoom(guest, code);
  await expect(guest.getByTestId("members").locator("li")).toHaveCount(2);
  await host.getByRole("button", { name: "開始比賽" }).click();
  await expect(guest.getByTestId("countdown")).toBeVisible();
  await expect(guest.getByTestId("countdown")).toBeHidden();
  const before = await guest.getByTestId("car-0").getAttribute("transform");
  await host.keyboard.down("w");
  await expect
    .poll(() => guest.getByTestId("car-0").getAttribute("transform"))
    .not.toBe(before);
  await host.keyboard.up("w");
  await guest.context().close();
  await host.context().close();
});
