import { mkdir, writeFile } from "node:fs/promises";
import {
  expect,
  type Browser,
  type Page,
  type CDPSession,
} from "@playwright/test";

const keyboards = new WeakMap<Page, CDPSession>();

/** Aim through the visible compass with real held keys, then correct any
 * delivery/coasting error from the compass. No authority state is accessed.
 */
export async function aimAtHeading(page: Page, target: number) {
  const heading = page.getByTestId("turret-heading");
  for (let correction = 0; correction < 8; correction++) {
    const displayed = (await heading.textContent())!;
    const current = Number(displayed.replace("°", ""));
    const error = ((target - current + 540) % 360) - 180;
    if (Math.abs(error) < 1) return;
    const key = error > 0 ? "ArrowRight" : "ArrowLeft";
    // Start with the specified half-second ramp and retained speed. The public
    // readout, rather than an assumed input duration, decides when aim is ready.
    const duration =
      Math.abs(error) > 24.4
        ? Math.abs(error) * 20.5
        : Math.sqrt(Math.abs(error)) * 100;
    await page.keyboard.down(key);
    await page.waitForTimeout(duration);
    await page.keyboard.up(key);
    // Do not accept the pre-keydown zero-rate HUD as a completed coast. The
    // host may not have painted (or a client received) this short pulse yet.
    await expect(heading).not.toHaveText(displayed);
    await expect(page.getByTestId("turret-yaw-rate")).toHaveText("0.0°/s");
  }
  const current = Number((await heading.textContent())!.replace("°", ""));
  expect(Math.abs(((target - current + 540) % 360) - 180)).toBeLessThan(1);
}

export async function elevateCannon(page: Page) {
  await page.keyboard.down("ArrowUp");
  await expect(page.getByTestId("turret-pitch")).toHaveText("28.6°");
  await page.keyboard.up("ArrowUp");
}

/** A real exterior sweep waits for the Tiger's ordinary cover flank. Only the
 * visible map/readout selects the observation, never world coordinates/state. */
export async function observeTiger(c: { gunner: Page }) {
  await aimAtHeading(c.gunner, 320);
  await expect(c.gunner.getByTestId("target-status")).toContainText(
    "虎式 I 型",
    { timeout: 30000 },
  );
}

/** Crew can report a bearing from the actual north-up map. These are the
 * painted rect/arrow coordinates; no hidden world-state mirror is read. */
export async function aimAtObservedEnemy(page: Page, label: string) {
  const map = page.getByRole("img", { name: "北方固定朝上的戰場導航" });
  await expect(
    map.locator(`.navigation-enemy[aria-label="觀測敵車 ${label}"]`),
  ).toHaveCount(1);
  const bearing = await map.evaluate((svg, label) => {
    const marker = svg.querySelector<SVGRectElement>(
      `.navigation-enemy[aria-label="觀測敵車 ${label}"]`,
    )!;
    const player = svg
      .querySelector(".navigation-player")!
      .getAttribute("transform")!
      .match(/-?[\d.]+/g)!
      .map(Number);
    const x = marker.x.baseVal.value + marker.width.baseVal.value / 2;
    const z = marker.y.baseVal.value + marker.height.baseVal.value / 2;
    return (
      ((Math.atan2(x - player[0], -(z - player[1])) * 180) / Math.PI + 360) %
      360
    );
  }, label);
  await aimAtHeading(page, bearing);
}

/** Genuine browser key events, scheduled independently of protocol acknowledgement.
 * This keeps a rapid burst / 90ms rhythm rapid while screenshots stall individual RPCs.
 * Sessions are attached before navigation; no post-start warmup, DOM dispatch or clock hook.
 */
export async function nativeTaps(
  page: Page,
  count: number,
  intervalMs = 0,
  key: "d" | "Space" = "d",
) {
  const keyboard = keyboards.get(page)!;
  const pending: Promise<unknown>[] = [];
  const descriptor =
    key === "Space"
      ? { key: " ", code: "Space", windowsVirtualKeyCode: 32 }
      : { key: "d", code: "KeyD", windowsVirtualKeyCode: 68 };
  for (let i = 0; i < count; i++) {
    pending.push(
      keyboard.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        ...descriptor,
        text: descriptor.key,
        unmodifiedText: descriptor.key,
        autoRepeat: false,
      }),
    );
    pending.push(
      keyboard.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        ...descriptor,
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
  beforeNavigation?: () => void,
  independentBrowserOptions: { headless?: boolean } = {},
) {
  const pages: Page[] = [];
  const separateBrowsers: Browser[] = [];
  const independent = process.env.TANK_THREE_BROWSERS === "1";
  const evidence = process.env.TANK_EVIDENCE_DIR;
  if (evidence) await mkdir(evidence, { recursive: true });
  for (const name of hostRole === "loader"
    ? ["裝填房主", "駕駛乘員", "砲手乘員"]
    : ["砲手房主", "駕駛乘員", "裝填乘員"]) {
    const owner = independent
      ? await browser.browserType().launch({
          channel: "chromium",
          headless: independentBrowserOptions.headless ?? true,
          chromiumSandbox: true,
          ignoreDefaultArgs: ["--enable-unsafe-swiftshader"],
          args: [
            "--disable-background-timer-throttling",
            "--disable-renderer-backgrounding",
            "--disable-backgrounding-occluded-windows",
          ],
        })
      : browser;
    if (independent) separateBrowsers.push(owner);
    const context = await owner.newContext({
      baseURL:
        process.env.BASE_URL ||
        `http://127.0.0.1:${process.env.WEB_PORT || 4273}`,
      viewport: { width: 1440, height: 1050 },
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
    if (process.env.TANK_AUDIO_COLLECTOR) {
      await context.addInitScript({ path: process.env.TANK_AUDIO_COLLECTOR });
      await context.addInitScript(() => {
        addEventListener("keydown", (event) => {
          if (!event.isTrusted || !document.querySelector(".battle-station"))
            return;
          const observer = (window as any).__actualAudioOutputObservation;
          if (
            [
              "KeyR",
              "KeyC",
              "Tab",
              "Space",
              "Digit1",
              "Digit2",
              "Digit3",
            ].includes(event.code)
          )
            observer?.mark(
              `${event.code}; chamber=${document.querySelector('[data-testid="chamber-state"]')?.textContent || "absent"}; mode=${document.querySelector('[data-testid="loader-mode"]')?.textContent || "absent"}`,
            );
        });
      });
    }
    if (beforeNavigation) await context.addInitScript(beforeNavigation);
    const page = await context.newPage();
    if (evidence)
      page.on("response", (response) => {
        const url = new URL(response.url());
        if (
          response.status() === 404 &&
          url.origin ===
            new URL(
              process.env.BASE_URL ||
                `http://127.0.0.1:${process.env.WEB_PORT || 4273}`,
            ).origin
        ) {
          // Static path only: never retain query, headers, peer IDs or payloads.
          if (/^\/(favicon[^/]*|(?:art|assets|web)\/[^?]*)$/.test(url.pathname))
            void writeFile(
              `${evidence}/missing-resource-${pages.length}.json`,
              JSON.stringify({ path: url.pathname, status: 404 }),
            );
        }
      });
    const keyboard = await context.newCDPSession(page);
    keyboards.set(page, keyboard);
    if (evidence) {
      const statuses: Record<string, number> = {};
      keyboard.on("Network.responseReceived", ({ response }) => {
        const url = new URL(response.url);
        if (
          url.origin ===
            new URL(
              process.env.BASE_URL ||
                `http://127.0.0.1:${process.env.WEB_PORT || 4273}`,
            ).origin &&
          /^\/(favicon[^/]*|(?:art|assets)\/[^?]*)$/.test(url.pathname)
        )
          statuses[url.pathname] = response.status;
      });
      await keyboard.send("Network.enable");
      page.on("close", () => {
        void writeFile(
          `${evidence}/resources-${Date.now()}-${pages.indexOf(page)}.json`,
          JSON.stringify(statuses, null, 2),
        );
      });
    }
    pages.push(page);
    await page.goto("/");
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
      for (const [index, page] of pages.entries()) {
        if (evidence && process.env.TANK_AUDIO_COLLECTOR) {
          const audio = await page.evaluate(async () => {
            const observer = (window as any).__actualAudioOutputObservation;
            return observer ? await observer.stop() : null;
          });
          if (audio) {
            for (const stream of audio.streams) {
              await writeFile(
                `${evidence}/audio-${index}-${stream.id}-${Date.now()}.webm`,
                Buffer.from(stream.base64, "base64"),
              );
              delete stream.base64;
            }
            await writeFile(
              `${evidence}/audio-${index}-${Date.now()}.json`,
              JSON.stringify(audio, null, 2),
            );
          }
        }
        await page.context().close();
        if (evidence && page.video() && recordVideoDir?.includes("win-videos"))
          await page
            .video()!
            .saveAs(
              `${evidence}/win-${[hostRole, "driver", hostRole === "loader" ? "gunner" : "loader"][index]}.webm`,
            );
      }
      for (const owner of separateBrowsers) await owner.close();
    },
  };
}
