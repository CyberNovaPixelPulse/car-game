import { expect, test } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

test("客端換職送出後立即作廢舊準備，延遲房間回覆不會送出舊準備票", async ({
  browser,
}) => {
  const host = await browser.newPage();
  const guest = await browser.newPage();
  let releaseSky!: () => void;
  const skyGate = new Promise<void>((resolve) => {
    releaseSky = resolve;
  });
  let skyRequested = false;
  try {
    await host.goto("/");
    await host.getByLabel("乘員名稱").fill("房主");
    await host.getByRole("button", { name: "建立房間", exact: true }).click();
    const code = (await host.getByTestId("room-code").textContent())!;
    await guest.goto("/");
    await guest.getByLabel("乘員名稱").fill("客端");
    await guest.getByLabel("房間代碼").fill(code);
    await guest.getByRole("button", { name: "加入房間", exact: true }).click();
    await guest.getByRole("button", { name: "擔任砲手", exact: true }).click();
    await expect(
      guest.getByRole("button", { name: "擔任砲手", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await guest.route("**/art/sky/*.hdr", async (route) => {
      skyRequested = true;
      await skyGate;
      await route.continue();
    });
    await guest.getByRole("button", { name: "準備", exact: true }).click();
    await expect.poll(() => skyRequested).toBe(true);
    await host.evaluate(() => {
      const send = RTCDataChannel.prototype.send;
      const delayed: (() => void)[] = [];
      const decoder = new TextDecoder();
      Object.defineProperty(RTCDataChannel.prototype, "send", {
        configurable: true,
        writable: true,
        value(this: RTCDataChannel, data: string | Uint8Array<ArrayBuffer>) {
          const json = typeof data === "string" ? data : decoder.decode(data);
          if (JSON.parse(json).type === "room") {
            delayed.push(() => Reflect.apply(send, this, [data]));
          } else Reflect.apply(send, this, [data]);
        },
      });
      Object.assign(window, {
        flushRoomUpdates: () => {
          RTCDataChannel.prototype.send = send;
          for (const deliver of delayed) deliver();
        },
      });
    });
    await guest
      .getByRole("button", { name: "擔任裝填手", exact: true })
      .click();
    const guestOnHost = host
      .getByTestId("crew-list")
      .locator("li")
      .filter({ hasText: "客端" });
    await expect(guestOnHost).toContainText("裝填手");
    await expect(
      guest.getByRole("button", { name: "擔任砲手", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      guest.getByRole("button", { name: "準備", exact: true }),
    ).toBeDisabled();
    const sky = guest.waitForResponse((response) =>
      response.url().endsWith(".hdr"),
    );
    releaseSky();
    await sky;
    await expect(guestOnHost).toContainText("未準備");
    await host.evaluate(() =>
      (
        window as Window & { flushRoomUpdates?: () => void }
      ).flushRoomUpdates?.(),
    );
    await expect(
      guest.getByRole("button", { name: "擔任裝填手", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      guest.getByTestId("crew-list").locator(".is-me"),
    ).toContainText("未準備");
    await guest.getByRole("button", { name: "準備", exact: true }).click();
    await expect(
      guest.getByTestId("crew-list").locator(".is-me"),
    ).toContainText("已準備");
  } finally {
    releaseSky();
    await guest.context().close();
    await host.context().close();
  }
});

test("裝填手原職重連直接恢復機槍，切換工作保留同一畫布", async ({
  browser,
}) => {
  const crew = await tankCrew(browser, "gunner", 0, 1972);
  const gun = crew.loader.getByRole("img", { name: "機槍戰場視野" });
  try {
    await crew.loader.keyboard.press("Tab");
    await expect(gun).toBeVisible();
    await crew.loader.keyboard.down("Space");
    const shots = () => crew.loader.getByTestId("mg-shot-count").textContent();
    await expect.poll(async () => Number(await shots())).toBeGreaterThan(0);
    await crew.loader.keyboard.up("Space");
    await crew.loader.goto("about:blank");
    await expect(crew.gunner.getByTestId("battle-pause")).toContainText(
      "等待裝填手",
    );
    await crew.loader.goto("/");
    await expect(gun).toBeVisible();
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("機槍模式");
    await expect.poll(async () => Number(await shots())).toBeGreaterThan(0);
    const restored = await gun.elementHandle();
    await crew.loader.keyboard.press("Tab");
    await expect(gun).toHaveCount(0);
    await expect(
      crew.loader.getByRole("img", { name: "車內炮膛與彈藥架" }),
    ).toBeVisible();
    await crew.loader.keyboard.press("Tab");
    await crew.loader.keyboard.press("Tab");
    await expect(gun).toBeVisible();
    expect(
      await gun.evaluate((canvas, previous) => canvas === previous, restored),
    ).toBe(true);
  } finally {
    await crew.close();
  }
});
