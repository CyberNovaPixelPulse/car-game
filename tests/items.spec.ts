import { test, expect } from "@playwright/test";
import { player, createRoom, joinRoom, startRace, acquire } from "./helpers";
test("玩家拾取道具箱並使用兩秒加速，其他車手同步看見", async ({ browser }) => {
  const host = await player(browser, "橘子"),
    code = await createRoom(host),
    guest = await player(browser, "葡萄");
  await joinRoom(guest, code);
  await startRace(host, guest);
  await acquire(host, 0, "渦輪糖");
  await host.keyboard.up("w");
  await host.keyboard.press("Space");
  await expect(host.getByTestId("effects")).toContainText("道具加速");
  await expect(host.getByTestId("held-item")).toHaveText("空道具欄");
  await expect(guest.getByTestId("car-0")).toHaveAttribute(
    "aria-label",
    /加速中/,
  );
  await expect(host.getByTestId("effects")).not.toContainText("道具加速");
  await expect(guest.locator('[aria-label="道具箱可拾取"]')).toHaveCount(4);
  await guest.context().close();
  await host.context().close();
});
