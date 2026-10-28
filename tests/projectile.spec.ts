import { test, expect } from "@playwright/test";
import {
  player,
  createRoom,
  joinRoom,
  startRace,
  acquire,
  driveStep,
} from "./helpers";
test("前方攻擊未命中時會正常離場，對手不會受到減速", async ({ browser }) => {
  const host = await player(browser, "橘子"),
    code = await createRoom(host),
    guest = await player(browser, "葡萄");
  await joinRoom(guest, code);
  await startRace(host, guest);
  await acquire(host, 0, "彈彈球");
  await host.keyboard.up("w");
  await host.keyboard.up("a");
  await host.keyboard.up("d");
  await host.keyboard.press("Space");
  await expect(guest.locator('[aria-label="前方攻擊"]')).toHaveCount(1);
  await expect(guest.locator('[aria-label="前方攻擊"]')).toHaveCount(0, {
    timeout: 4000,
  });
  await expect(guest.getByTestId("effects")).not.toContainText("受到減速");
  await guest.context().close();
  await host.context().close();
});
test("前方攻擊命中等待中的車手，減速效果同步且會到期", async ({ browser }) => {
  const host = await player(browser, "橘子"),
    code = await createRoom(host),
    guest = await player(browser, "葡萄");
  await joinRoom(guest, code);
  await startRace(host, guest);
  await acquire(host, 0, "彈彈球", 20000);
  let fired = false;
  for (let i = 0; i < 550; i++) {
    const parse = (s: string) => s.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const [x, y, a] = parse(
      (await host.getByTestId("car-0").getAttribute("transform"))!,
    );
    const [gx, gy] = parse(
      (await host.getByTestId("car-1").getAttribute("transform"))!,
    );
    const angle = Math.atan2(gy - y, gx - x) - (a * Math.PI) / 180;
    const error = Math.atan2(Math.sin(angle), Math.cos(angle));
    await host.keyboard.down("w");
    if (error > 0.04) {
      await host.keyboard.up("a");
      await host.keyboard.down("d");
    } else if (error < -0.04) {
      await host.keyboard.up("d");
      await host.keyboard.down("a");
    } else {
      await host.keyboard.up("a");
      await host.keyboard.up("d");
    }
    if (
      Math.hypot(gx - x, gy - y) < 240 &&
      Math.hypot(gx - x, gy - y) > 45 &&
      Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) < 0.13
    ) {
      await host.keyboard.press("Space");
      fired = true;
      break;
    }
    await host.waitForTimeout(60);
  }
  expect(fired).toBeTruthy();
  await expect(guest.getByTestId("effects")).toContainText("受到減速");
  await expect(host.getByTestId("car-1")).toHaveAttribute(
    "aria-label",
    /減速中/,
  );
  await expect(guest.getByTestId("effects")).not.toContainText("受到減速");
  await guest.context().close();
  await host.context().close();
});
