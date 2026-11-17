import { test, expect, type Page } from "@playwright/test";
import { withPerfectCalibration } from "./tank-calibration";

async function mountReadouts(page: Page, showOnRepair = false) {
  await page.setContent(`
    <section>
      <div data-testid="repair-calibration" hidden>
        <p data-testid="repair-calibration-position">
          指針 25° · 目標 60°–110° · 完美 74°–95°
        </p>
      </div>
    </section>
    <p data-testid="tank-health">82/100</p>
    <output data-testid="keys"></output>
  `);
  await page.evaluate((show) => {
    const panel = document.querySelector<HTMLElement>(
      '[data-testid="repair-calibration"]',
    )!;
    const keys = document.querySelector('[data-testid="keys"]')!;
    const record = (event: KeyboardEvent) => {
      keys.append(`${event.type}:${event.code}:${event.isTrusted} `);
      if (show && event.type === "keydown" && event.code === "KeyR")
        panel.hidden = false;
    };
    document.addEventListener("keydown", record);
    document.addEventListener("keyup", record);
  }, showOnRepair);
}

async function expectObservationRemoved(page: Page) {
  expect(
    await page.evaluate(() =>
      Object.getOwnPropertyNames(window).filter((key) =>
        key.startsWith("__tankPublicCalibration"),
      ),
    ),
  ).toEqual([]);
}

const unexpectedResult = async () => {
  throw new Error("Result callback should not run");
};

test("校準 HUD 未出現逾時會放開 R 並移除瀏覽器觀察", async ({ page }) => {
  await mountReadouts(page);
  await expect(
    withPerfectCalibration(
      page,
      { appearanceTimeoutMs: 450, inputTimeoutMs: 800 },
      unexpectedResult,
    ),
  ).rejects.toThrow("Public calibration did not appear before the deadline");
  await expect(page.getByTestId("keys")).toHaveText(
    "keydown:KeyR:true keyup:KeyR:true",
  );
  await expectObservationRemoved(page);
});

test("完美區逾時保留主要錯誤及放鍵失敗", async ({ page }) => {
  await mountReadouts(page, true);
  const release = page.keyboard.up.bind(page.keyboard);
  const releaseError = new Error("Injected keyup acknowledgment failure");
  page.keyboard.up = async (key) => {
    await release(key);
    throw releaseError;
  };
  try {
    const failure = await withPerfectCalibration(
      page,
      { appearanceTimeoutMs: 1500, inputTimeoutMs: 200 },
      unexpectedResult,
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([
      expect.objectContaining({
        message:
          "Public needle did not reach the requested perfect window before the deadline",
      }),
      expect.objectContaining({
        message: "Release repair key",
        cause: releaseError,
      }),
    ]);
    await expect(page.getByTestId("keys")).toHaveText(
      "keydown:KeyR:true keyup:KeyR:true",
    );
    await expectObservationRemoved(page);
  } finally {
    page.keyboard.up = release;
  }
});

test("頁面切換取消等待中的維修校準", async ({ page }) => {
  await mountReadouts(page);
  const outcome = withPerfectCalibration(
    page,
    { appearanceTimeoutMs: 10000, inputTimeoutMs: 1800 },
    unexpectedResult,
  ).catch((error: unknown) => error);
  await expect(page.getByTestId("keys")).toHaveText("keydown:KeyR:true");
  await page.goto("data:text/html,<p>Next page</p>");
  expect(await outcome).toMatchObject({
    message: "Calibration page navigated",
  });
  await expectObservationRemoved(page);
});

test("HUD 安裝失敗會清除已建立的 binding 且不按 R", async ({ page }) => {
  await mountReadouts(page);
  await page
    .getByTestId("repair-calibration-position")
    .evaluate((node) => node.remove());
  await expect(
    withPerfectCalibration(
      page,
      { appearanceTimeoutMs: 1000, inputTimeoutMs: 800 },
      unexpectedResult,
    ),
  ).rejects.toThrow("Public calibration HUD or Chromium binding is missing");
  await expect(page.getByTestId("keys")).toBeEmpty();
  await expectObservationRemoved(page);
});
