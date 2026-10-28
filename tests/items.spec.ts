import { test, expect } from "@playwright/test";
import {
  player,
  createRoom,
  joinRoom,
  startRace,
  acquire,
  driveStep,
} from "./helpers";
test("玩家拾取道具箱並使用兩秒加速，其他車手同步看見", async ({ browser }) => {
  const host = await player(browser, "橘子"),
    code = await createRoom(host),
    guest = await player(browser, "葡萄");
  await joinRoom(guest, code);
  await startRace(host, guest);
  await acquire(host, 0, "渦輪糖");
  const [bx, by] = await host
    .getByTestId("box-1")
    .evaluate((el) => [
      Number(el.getAttribute("x")) + Number(el.getAttribute("width")) / 2,
      Number(el.getAttribute("y")) + Number(el.getAttribute("height")) / 2,
    ]);
  let reached = false;
  for (let i = 0; i < 180; i++) {
    await driveStep(host, 0);
    const [x, y] = (await host.getByTestId("car-0").getAttribute("transform"))!
      .match(/-?\d+(?:\.\d+)?/g)!
      .map(Number);
    if (Math.hypot(x - bx, y - by) < 25) {
      reached = true;
      break;
    }
    await host.waitForTimeout(60);
  }
  expect(reached).toBeTruthy();
  await expect(host.getByTestId("held-item")).toHaveText("渦輪糖");
  await expect(guest.getByTestId("box-1")).toHaveAttribute(
    "aria-label",
    "道具箱可拾取",
  );
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
test("兩位車手同時接近同一道具箱，只會一人取得道具", async ({ browser }) => {
  const host = await player(browser, "橘子"),
    code = await createRoom(host),
    guest = await player(browser, "葡萄");
  await joinRoom(guest, code);
  await startRace(host, guest);
  await Promise.all([host.keyboard.down("w"), guest.keyboard.down("w")]);
  await expect(host.getByTestId("box-0")).toHaveAttribute(
    "aria-label",
    "道具箱等待重生",
  );
  await Promise.all([host.keyboard.up("w"), guest.keyboard.up("w")]);
  await expect
    .poll(async () => {
      const held = await Promise.all(
        [host, guest].map((p) => p.getByTestId("held-item").textContent()),
      );
      return held.filter((item) => item !== "空道具欄").length;
    })
    .toBe(1);
  await expect(guest.getByTestId("box-0")).toHaveAttribute(
    "aria-label",
    "道具箱等待重生",
  );
  await guest.context().close();
  await host.context().close();
});
