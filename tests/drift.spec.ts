import { test, expect } from "@playwright/test";
import { player, createRoom, joinRoom, startRace } from "./helpers";
test("有效甩尾放開後短暫加速，且另一位玩家看見同樣效果", async ({
  browser,
}) => {
  const host = await player(browser, "橘子"),
    code = await createRoom(host),
    guest = await player(browser, "葡萄");
  await joinRoom(guest, code);
  await startRace(host, guest);
  await host.keyboard.down("w");
  await expect
    .poll(async () => Number(await host.getByTestId("speed").textContent()))
    .toBeGreaterThan(100);
  await host.keyboard.down("Shift");
  await host.keyboard.down("d");
  await host.waitForTimeout(650);
  await host.keyboard.up("Shift");
  await host.keyboard.up("d");
  await expect(host.getByTestId("effects")).toContainText("甩尾加速");
  await expect(guest.getByTestId("car-0")).toHaveAttribute(
    "aria-label",
    /加速中/,
  );
  await host.keyboard.up("w");
  await expect(host.getByTestId("effects")).not.toContainText("甩尾加速");
  await guest.context().close();
  await host.context().close();
});
