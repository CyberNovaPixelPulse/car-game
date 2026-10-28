import { expect, type Browser, type Page } from "@playwright/test";
export async function player(browser: Browser, name: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  // Control only the browser entropy boundary used for the race seed. Room codes
  // and seat tokens still use real randomness; no game state is injected.
  await context.addInitScript(() => {
    const original = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = <T extends ArrayBufferView>(array: T): T => {
      if (array instanceof Uint32Array && array.length === 1) {
        array[0] = 26;
        return array;
      }
      return original(array) as T;
    };
  });
  await page.goto("/");
  await page.getByLabel("你的車手名").fill(name);
  return page;
}
export async function createRoom(page: Page) {
  await page.getByRole("button", { name: "建立私人房間" }).click();
  await expect(page.getByTestId("room-code")).toHaveText(/^[A-Z2-9]{6}$/);
  return (await page.getByTestId("room-code").textContent())!;
}
export async function joinRoom(page: Page, code: string) {
  await page.getByRole("textbox", { name: "房間代碼" }).fill(code);
  await page.getByRole("button", { name: "加入", exact: true }).click();
}
export async function startRace(host: Page, guest: Page, count = 2) {
  await expect(guest.getByTestId("members").locator("li")).toHaveCount(count);
  await host.getByRole("button", { name: "開始比賽" }).click();
  await expect(guest.getByTestId("countdown")).toBeVisible();
  await expect(guest.getByTestId("countdown")).toBeHidden();
}
/** Steer using only the visible minimap and HUD, with real keyboard events. */
const drivingKeys = new WeakMap<Page, Set<string>>();
export async function releaseDriving(page: Page) {
  for (const key of ["w", "s", "a", "d"]) await page.keyboard.up(key);
  drivingKeys.delete(page);
}
export async function driveStep(page: Page, slot: number) {
  const visible = await page.locator(".pit-panel").evaluate((panel, slot) => {
    const car = panel.querySelector(`[data-testid="car-${slot}"]`),
      track = panel.querySelector("#course-map");
    if (!car || !track) return null;
    return {
      pose: car.getAttribute("transform")!,
      course: ["cx", "cy", "rx", "ry"].map((k) =>
        Number(track.getAttribute(k)),
      ),
      speed: Number(panel.querySelector('[data-testid="speed"]')?.textContent),
      held: panel.querySelector('[data-testid="held-item"]')?.textContent,
    };
  }, slot);
  if (!visible) return;
  const [x, y, degrees] = visible.pose.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  const [cx, cy, rx, ry] = visible.course;
  const theta = Math.atan2((y - cy) / ry, (x - cx) / rx),
    tx = cx + rx * Math.cos(theta + 0.3),
    ty = cy + ry * Math.sin(theta + 0.3);
  let error = Math.atan2(ty - y, tx - x) - (degrees * Math.PI) / 180;
  error = Math.atan2(Math.sin(error), Math.cos(error));
  const desired = new Set<string>([
    visible.speed > 260 || Math.abs(error) > 0.8 ? "s" : "w",
  ]);
  if (error > 0.07) desired.add("d");
  else if (error < -0.07) desired.add("a");
  const previous = drivingKeys.get(page) || new Set<string>();
  for (const key of previous)
    if (!desired.has(key)) await page.keyboard.up(key);
  for (const key of desired)
    if (!previous.has(key)) await page.keyboard.down(key);
  drivingKeys.set(page, desired);
  return visible.held;
}
export async function acquire(
  page: Page,
  slot: number,
  name: string,
  timeout = 60000,
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const held = await driveStep(page, slot);
    if (held === name) {
      await releaseDriving(page);
      return;
    }
    if (held && held !== "空道具欄") await page.keyboard.press("Space");
    await page.waitForTimeout(70);
  }
  throw new Error(`未能從賽道取得 ${name}`);
}
