import { test, expect } from "@playwright/test";
import { player, createRoom, joinRoom, startRace, acquire } from "./helpers";
test("道具加速仍在作用時，煞車可以把車速降下來", async ({ browser }) => {
  const host = await player(browser, "橘子"),
    code = await createRoom(host),
    guest = await player(browser, "葡萄");
  await joinRoom(guest, code);
  await startRace(host, guest);
  await acquire(host, 0, "渦輪糖");
  await host.keyboard.up("a");
  await host.keyboard.up("d");
  await host.keyboard.press("Space");
  await expect
    .poll(async () => Number(await host.getByTestId("speed").textContent()), {
      timeout: 1000,
      intervals: [20, 30],
    })
    .toBeGreaterThan(380);
  await host.keyboard.up("w");
  await host.keyboard.down("s");
  await expect
    .poll(async () => Number(await host.getByTestId("speed").textContent()), {
      timeout: 450,
      intervals: [20, 30, 50],
    })
    .toBeLessThan(350);
  await expect(host.getByTestId("effects")).toContainText("道具加速");
  await guest.context().close();
  await host.context().close();
});
