import { test, expect } from "@playwright/test";
import { player, createRoom, joinRoom, startRace, driveStep } from "./helpers";
test("斷線變幽靈後可回到原席位；房主離線會結束比賽", async ({ browser }) => {
  const host = await player(browser, "橘子"),
    code = await createRoom(host),
    guest = await player(browser, "葡萄");
  await joinRoom(guest, code);
  await startRace(host, guest);
  await guest.goto("about:blank");
  await expect(host.getByTestId("car-1")).toHaveAttribute(
    "aria-label",
    /斷線幽靈車/,
  );
  await guest.goto("/");
  await expect(
    guest.getByRole("heading", { name: "比賽進行中" }),
  ).toBeVisible();
  await expect(host.getByTestId("car-1")).not.toHaveAttribute(
    "aria-label",
    /斷線幽靈車/,
  );
  await expect(host.locator("#markers > g")).toHaveCount(2);
  await host.context().close();
  await expect(guest.getByRole("status")).toContainText("房主已離線", {
    timeout: 25000,
  });
  await expect(
    guest.getByRole("button", { name: "建立私人房間" }),
  ).toBeVisible();
  await guest.context().close();
});
test("未回到比賽者列為未完賽，已連線車手完賽後正常結算", async ({
  browser,
}) => {
  const host = await player(browser, "橘子"),
    code = await createRoom(host),
    guest = await player(browser, "葡萄");
  await joinRoom(guest, code);
  await startRace(host, guest);
  await guest.goto("about:blank");
  await expect(host.getByTestId("car-1")).toHaveAttribute(
    "aria-label",
    /斷線幽靈車/,
  );
  const deadline = Date.now() + 60000;
  while (
    Date.now() < deadline &&
    !(await host.getByRole("heading", { name: "本場成績" }).isVisible())
  ) {
    await driveStep(host, 0);
    await host.waitForTimeout(70);
  }
  await expect(host.getByTestId("results")).toContainText("葡萄 未完賽");
  await guest.goto("/");
  await expect(guest.getByRole("status")).toContainText("已結束");
  await guest.context().close();
  await host.context().close();
});
