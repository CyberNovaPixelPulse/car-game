import {
  expect,
  type Browser,
  type Page,
  type CDPSession,
} from "@playwright/test";

const keyboards = new WeakMap<Page, CDPSession>();

/** Genuine browser key events, scheduled independently of protocol acknowledgement.
 * This keeps a rapid burst / 90ms rhythm rapid while screenshots stall individual RPCs.
 * Sessions are attached before navigation; no post-start warmup, DOM dispatch or clock hook.
 */
export async function nativeTaps(page: Page, count: number, intervalMs = 0) {
  const keyboard = keyboards.get(page)!;
  const pending: Promise<unknown>[] = [];
  for (let i = 0; i < count; i++) {
    pending.push(
      keyboard.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "d",
        code: "KeyD",
        text: "d",
        unmodifiedText: "d",
        windowsVirtualKeyCode: 68,
        autoRepeat: false,
      }),
    );
    pending.push(
      keyboard.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "d",
        code: "KeyD",
        windowsVirtualKeyCode: 68,
      }),
    );
    if (intervalMs && i + 1 < count)
      await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }
  await Promise.all(pending);
}

export async function tankCrew(
  browser: Browser,
  hostRole: "loader" | "gunner" = "loader",
  lobbyWaitMs = 0,
  seed = 1000,
  recordVideoDir?: string,
) {
  const pages: Page[] = [];
  for (const name of hostRole === "loader"
    ? ["裝填房主", "駕駛乘員", "砲手乘員"]
    : ["砲手房主", "駕駛乘員", "裝填乘員"]) {
    const context = await browser.newContext({
      ...(recordVideoDir ? { viewport: { width: 1280, height: 720 } } : {}),
      recordVideo: recordVideoDir
        ? { dir: recordVideoDir, size: { width: 1280, height: 720 } }
        : undefined,
    });
    await context.addInitScript((seed) => {
      const original = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = <T extends ArrayBufferView>(array: T): T => {
        if (array instanceof Uint32Array && array.length === 1) {
          array[0] = seed;
          return array;
        }
        return original(array) as T;
      };
    }, seed);
    const page = await context.newPage();
    keyboards.set(page, await context.newCDPSession(page));
    pages.push(page);
    await page.goto("/tank.html");
    await page.getByLabel("乘員名稱").fill(name);
  }
  const [host, driver, other] = pages;
  const loader = hostRole === "loader" ? host : other;
  const gunner = hostRole === "gunner" ? host : other;
  await host.getByRole("button", { name: "建立房間", exact: true }).click();
  const code = await host.getByTestId("room-code").textContent();
  for (const page of [driver, other]) {
    await page.getByLabel("房間代碼").fill(code!);
    await page.getByRole("button", { name: "加入房間", exact: true }).click();
    await expect(page.getByTestId("crew-list").locator("li")).toHaveCount(
      pages.indexOf(page) + 1,
    );
  }
  for (const [page, role] of [
    [loader, "裝填手"],
    [driver, "駕駛"],
    [gunner, "砲手"],
  ] as const) {
    await page
      .getByRole("button", { name: `擔任${role}`, exact: true })
      .click();
    await page.getByRole("button", { name: "準備", exact: true }).click();
  }
  if (lobbyWaitMs) await host.waitForTimeout(lobbyWaitMs);
  await host.getByRole("button", { name: "開始戰鬥", exact: true }).click();
  for (const page of pages)
    await expect(page.getByRole("heading", { name: /工作站$/ })).toBeVisible();
  return {
    code: code!,
    loader,
    driver,
    gunner,
    close: async () => {
      for (const page of pages) await page.context().close();
    },
  };
}
