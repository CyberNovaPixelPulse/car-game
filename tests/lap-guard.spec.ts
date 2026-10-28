import { test, expect } from "@playwright/test";
import { player, createRoom, joinRoom, startRace } from "./helpers";
test("反覆前後跨起點不會增加圈數，空按甩尾也不會加速", async ({ browser }) => {
  const host = await player(browser, "橘子"),
    code = await createRoom(host),
    guest = await player(browser, "葡萄");
  await joinRoom(guest, code);
  await startRace(host, guest);
  await host.keyboard.press("Shift");
  await expect(host.getByTestId("effects")).toHaveText("");
  await host.keyboard.down("s");
  await host.waitForTimeout(700);
  await host.keyboard.up("s");
  await host.keyboard.down("w");
  await host.waitForTimeout(1700);
  await host.keyboard.up("w");
  await expect(host.getByTestId("lap")).toHaveText("1 / 3");
  await guest.context().close();
  await host.context().close();
});
