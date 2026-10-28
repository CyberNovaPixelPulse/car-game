import { test, expect } from "@playwright/test";
import { player, createRoom, joinRoom, startRace, driveStep } from "./helpers";
test("兩位玩家實際駕駛三圈，看到一致名次並可重新開賽", async ({ browser }) => {
  const host = await player(browser, "橘子"),
    code = await createRoom(host);
  const guest = await player(browser, "葡萄");
  await joinRoom(guest, code);
  await startRace(host, guest);
  await expect(host.getByTestId("lap")).toHaveText("1 / 3");
  const deadline = Date.now() + 75000;
  while (
    Date.now() < deadline &&
    !(await host.getByRole("heading", { name: "本場成績" }).isVisible())
  ) {
    await Promise.all([driveStep(host, 0), driveStep(guest, 1)]);
    await host.waitForTimeout(70);
  }
  await expect(host.getByRole("heading", { name: "本場成績" })).toBeVisible();
  await expect(guest.getByTestId("results")).toHaveText(
    (await host.getByTestId("results").textContent()) || "",
  );
  await host.getByRole("button", { name: "再賽一場" }).click();
  await expect(guest.getByTestId("countdown")).toBeVisible();
  await expect(host.getByTestId("lap")).toHaveText("1 / 3");
  await guest.context().close();
  await host.context().close();
});
