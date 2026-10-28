import { test, expect } from "@playwright/test";
import { player, createRoom, joinRoom, startRace, acquire } from "./helpers";
test("後方障礙不立即傷到施放者，追車碰到後減速並移除", async ({ browser }) => {
  const host = await player(browser, "橘子"),
    code = await createRoom(host),
    guest = await player(browser, "葡萄");
  await joinRoom(guest, code);
  await startRace(host, guest);
  await acquire(host, 0, "泡泡錐", 15000);
  await host.keyboard.up("w");
  await host.keyboard.press("Space");
  const obstacle = guest.locator('[aria-label="後方障礙"]').first();
  await expect(obstacle).toBeVisible();
  await expect(host.getByTestId("effects")).not.toContainText("受到減速");
  const tx = Number(await obstacle.getAttribute("cx")),
    ty = Number(await obstacle.getAttribute("cy"));
  for (let i = 0; i < 180; i++) {
    const marker = (await guest.getByTestId("car-1").getAttribute("transform"))!
      .match(/-?\d+(?:\.\d+)?/g)!
      .map(Number);
    const angle =
        Math.atan2(ty - marker[1], tx - marker[0]) -
        (marker[2] * Math.PI) / 180,
      error = Math.atan2(Math.sin(angle), Math.cos(angle));
    await guest.keyboard.down("w");
    if (error > 0.05) {
      await guest.keyboard.up("a");
      await guest.keyboard.down("d");
    } else if (error < -0.05) {
      await guest.keyboard.up("d");
      await guest.keyboard.down("a");
    } else {
      await guest.keyboard.up("a");
      await guest.keyboard.up("d");
    }
    if (
      (await guest.getByTestId("effects").textContent())?.includes("受到減速")
    )
      break;
    await guest.waitForTimeout(50);
  }
  await expect(guest.getByTestId("effects")).toContainText("受到減速");
  await expect(host.locator('[aria-label="後方障礙"]')).toHaveCount(0);
  await expect(guest.getByTestId("effects")).not.toContainText("受到減速");
  await guest.context().close();
  await host.context().close();
});
