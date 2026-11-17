import { expect, test, type Page } from "@playwright/test";

interface TextureObservation {
  loaded: boolean;
  disposals: number;
}

declare global {
  interface Window {
    tankViewProbe: {
      textures: Record<string, TextureObservation[]>;
      contexts: WebGL2RenderingContext[];
    };
  }
}

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const splatA = "/art/map/splat_a.png";
const splatB = "/art/map/splat_b.png";
const firstSplatB = /\/art\/map\/splat_b\.png\?view=1$/;
const grass = "/art/terrain/leafy_grass_diff_1k.jpg";

async function observeViewResources(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "單人練習", exact: true }),
  ).toBeVisible();
  await page.evaluate(async () => {
    // Use the same Three module Vite loaded for the real game. Observe disposal
    // events and actual WebGL contexts without reaching into the game state.
    const url = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .find((url) => new URL(url).pathname.endsWith("/.vite/deps/three.js"));
    if (!url)
      throw new Error("This resource lifecycle test uses the Vite dev server.");
    const three: typeof import("three") = await import(url);
    const probe = (window.tankViewProbe = {
      textures: {} as Record<string, TextureObservation[]>,
      contexts: [] as WebGL2RenderingContext[],
    });

    const load = three.TextureLoader.prototype.load;
    three.TextureLoader.prototype.load = function (
      url,
      onLoad,
      onProgress,
      onError,
    ) {
      const path = new URL(url, location.href).pathname;
      const record = { loaded: false, disposals: 0 };
      const ordinal = (probe.textures[path] ??= []).push(record);
      // Give concurrent requests distinct browser cache keys so the first
      // blocked response cannot also hold the replacement view.
      if (path === "/art/map/splat_b.png") url += `?view=${ordinal}`;
      const texture = load.call(
        this,
        url,
        (texture) => {
          record.loaded = true;
          onLoad?.(texture);
        },
        onProgress,
        onError,
      );
      texture.addEventListener("dispose", () => record.disposals++);
      return texture;
    };

    const canvasContext = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      value(this: HTMLCanvasElement, ...args: unknown[]) {
        const context = Reflect.apply(canvasContext, this, args);
        if (
          context instanceof WebGL2RenderingContext &&
          this.matches("canvas[role=img]")
        )
          probe.contexts.push(context);
        return context;
      },
    });
  });
}

function textureRecords(page: Page, path: string) {
  return page.evaluate(
    (path) => window.tankViewProbe.textures[path] ?? [],
    path,
  );
}

function exteriorContexts(page: Page) {
  return page.evaluate(() =>
    window.tankViewProbe.contexts.map((context) => ({
      connected:
        context.canvas instanceof HTMLCanvasElement &&
        context.canvas.isConnected,
      lost: context.isContextLost(),
    })),
  );
}

async function beginPractice(page: Page, role: "駕駛" | "砲手") {
  const entry = page.getByRole("button", { name: "單人練習", exact: true });
  if (await entry.isVisible()) await entry.click();
  await page.getByRole("button", { name: `擔任${role}`, exact: true }).click();
  await page.getByRole("button", { name: "開始練習", exact: true }).click();
}

test("取消地景準備立即釋放已載素材，晚到貼圖不進入下一職位", async ({
  page,
}) => {
  await observeViewResources(page);
  const releaseLateTexture = gate();
  let lateRequested = false;
  await page.route(
    firstSplatB,
    async (route) => {
      lateRequested = true;
      await releaseLateTexture.promise;
      await route.continue();
    },
    { times: 1 },
  );
  try {
    await beginPractice(page, "駕駛");
    await expect.poll(() => lateRequested).toBe(true);
    await expect
      .poll(() => textureRecords(page, splatA))
      .toEqual([{ loaded: true, disposals: 0 }]);
    await page.getByRole("button", { name: "取消準備", exact: true }).click();
    await expect
      .poll(() => exteriorContexts(page))
      .toEqual([{ connected: false, lost: true }]);
    await expect
      .poll(() => textureRecords(page, splatA))
      .toEqual([{ loaded: true, disposals: 1 }]);
    await expect(page.locator("canvas")).toHaveCount(0);

    await beginPractice(page, "砲手");
    await expect(page.getByRole("img", { name: "主炮戰場視野" })).toBeVisible({
      timeout: 20_000,
    });
    releaseLateTexture.resolve();
    await expect
      .poll(() => textureRecords(page, splatB))
      .toEqual([
        { loaded: true, disposals: 1 },
        { loaded: true, disposals: 0 },
      ]);
    await expect(
      page.getByRole("heading", { name: "砲手工作站" }),
    ).toBeVisible();
    await expect
      .poll(() => exteriorContexts(page))
      .toEqual([
        { connected: false, lost: true },
        { connected: true, lost: false },
      ]);

    await page.getByRole("button", { name: "離開練習", exact: true }).click();
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect
      .poll(() => exteriorContexts(page))
      .toEqual([
        { connected: false, lost: true },
        { connected: false, lost: true },
      ]);
    await expect
      .poll(() => textureRecords(page, splatB))
      .toEqual([
        { loaded: true, disposals: 1 },
        { loaded: true, disposals: 1 },
      ]);
  } finally {
    releaseLateTexture.resolve();
  }
});

test("地景部分載入失敗後掛載程序地圖，已到與晚到的烘焙貼圖各釋放一次", async ({
  page,
}) => {
  await observeViewResources(page);
  const failSplat = gate();
  const releaseGrass = gate();
  const fallbackSoil = "/art/terrain/farm_soil_nor_gl_1k.png";
  await page.route(firstSplatB, async (route) => {
    await failSplat.promise;
    await route.fulfill({
      status: 503,
      body: "intentional terrain asset failure",
    });
  });
  await page.route(`**${grass}`, async (route) => {
    await releaseGrass.promise;
    await route.continue();
  });
  try {
    await beginPractice(page, "駕駛");
    await expect
      .poll(() => textureRecords(page, splatA))
      .toEqual([{ loaded: true, disposals: 0 }]);
    await expect
      .poll(() => textureRecords(page, grass))
      .toEqual([{ loaded: false, disposals: 0 }]);
    failSplat.resolve();
    await expect
      .poll(async () =>
        (await textureRecords(page, fallbackSoil)).some(
          (record) => record.loaded,
        ),
      )
      .toBe(true);
    await expect
      .poll(() => textureRecords(page, splatA))
      .toEqual([{ loaded: true, disposals: 1 }]);
    await expect(page.getByRole("img", { name: "駕駛裝甲觀察窗" })).toBeVisible(
      { timeout: 20_000 },
    );
    await expect
      .poll(() => exteriorContexts(page))
      .toEqual([{ connected: true, lost: false }]);
    releaseGrass.resolve();
    await expect
      .poll(() => textureRecords(page, grass))
      .toEqual([{ loaded: true, disposals: 1 }]);
    await expect(
      page.getByRole("img", { name: "駕駛裝甲觀察窗" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "離開練習", exact: true }).click();
    await expect
      .poll(() => exteriorContexts(page))
      .toEqual([{ connected: false, lost: true }]);
    expect(await textureRecords(page, grass)).toEqual([
      { loaded: true, disposals: 1 },
    ]);
  } finally {
    failSplat.resolve();
    releaseGrass.resolve();
  }
});
