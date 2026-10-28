import { test, expect } from "@playwright/test";
import {
  player,
  createRoom,
  joinRoom,
  driveStep,
  releaseDriving,
} from "./helpers";

test("五人完整賽局包含甩尾、道具與同房再賽", async ({ browser }) => {
  const host = await player(browser, "橘子"),
    code = await createRoom(host),
    pages = [host];
  for (const name of ["葡萄", "薄荷", "布丁", "莓果"]) {
    const page = await player(browser, name);
    await joinRoom(page, code);
    pages.push(page);
    await expect(page.getByTestId("members").locator("li")).toHaveCount(
      pages.length,
    );
  }
  await host.getByRole("button", { name: "開始比賽" }).click();
  await expect(host.getByTestId("countdown")).toBeVisible();
  await expect(host.getByTestId("countdown")).toBeHidden();
  for (const page of pages)
    await expect(page.locator("#markers > g")).toHaveCount(5);
  let used = 0,
    drifted = false;
  const deadline = Date.now() + 90000;
  while (
    Date.now() < deadline &&
    !(await host.getByRole("heading", { name: "本場成績" }).isVisible())
  ) {
    await Promise.all(
      pages.map(async (page, slot) => {
        const held = await driveStep(page, slot);
        if (held && held !== "空道具欄") {
          await page.keyboard.press("Space");
          used++;
        }
      }),
    );
    if (
      !drifted &&
      Number(await host.getByTestId("speed").textContent()) > 100
    ) {
      await host.keyboard.down("Shift");
      await host.keyboard.down("d");
      await host.waitForTimeout(450);
      await host.keyboard.up("Shift");
      await host.keyboard.up("d");
      await releaseDriving(host);
      drifted = true;
    }
    await host.waitForTimeout(70);
  }
  if (!(await host.getByRole("heading", { name: "本場成績" }).isVisible())) {
    console.log(
      "Race UI at timeout",
      await Promise.all(
        pages.map(async (p) => ({
          title: await p.locator("#panel-title").textContent(),
          race: await p.locator("#race").textContent(),
          message: await p.locator("#message").textContent(),
        })),
      ),
    );
  }
  expect(used).toBeGreaterThan(0);
  expect(drifted).toBeTruthy();
  await expect(host.getByTestId("results").locator("li")).toHaveCount(5);
  const results = await host.getByTestId("results").textContent();
  for (const page of pages)
    await expect(page.getByTestId("results")).toHaveText(results || "");
  await host.getByRole("button", { name: "再賽一場" }).click();
  for (const page of pages) {
    await expect(page.getByTestId("countdown")).toBeVisible();
    await expect(page.getByTestId("lap")).toHaveText("1 / 3");
    await expect(page.getByTestId("held-item")).toHaveText("空道具欄");
  }
  await host.screenshot({
    path: "test-results/five-player-race.png",
    fullPage: true,
  });
  for (const page of pages.reverse()) await page.context().close();
});
