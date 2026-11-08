import { execFileSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

test.use({ headless: false });

test(`三位乘員以${process.env.TANK_BROWSER_ESCAPE ? "瀏覽器可信" : "原生"} Esc 退出全螢幕後可立即正常操作`, async ({
  browser,
}) => {
  test.setTimeout(420000);
  test.skip(
    !process.env.TANK_NATIVE_ESCAPE &&
      !process.env.TANK_CUA_ESCAPE &&
      !process.env.TANK_BROWSER_ESCAPE,
    "原生鍵盤補驗需明確啟動 TANK_NATIVE_ESCAPE=1 或 TANK_CUA_ESCAPE=1。",
  );
  test.skip(
    process.platform !== "darwin",
    "此補驗使用 macOS 原生鍵盤，其他平台需相應原生輸入。",
  );
  const c = await tankCrew(browser, "loader", 0, 1000, undefined, undefined, {
    headless: false,
  });
  try {
    const nativeBrowser = await browser.newBrowserCDPSession();
    const { processInfo } = await nativeBrowser.send(
      "SystemInfo.getProcessInfo",
    );
    const pid = processInfo.find((process) => process.type === "browser")?.id;
    if (!pid || !Number.isSafeInteger(pid))
      throw new Error("無法確認本次瀏覽器程序，停止原生輸入。");
    const nativeTarget = `tell application "System Events"\nset testBrowser to first application process whose unix id is ${pid}\nset frontmost of testBrowser to true\n`;
    if (!process.env.TANK_CUA_ESCAPE && !process.env.TANK_BROWSER_ESCAPE)
      execFileSync("/usr/bin/osascript", ["-e", `${nativeTarget}end tell`]);
    for (const [page, role] of [
      [c.driver, "driver"],
      [c.gunner, "gunner"],
      [c.loader, "loading"],
    ] as const) {
      page.on("console", (entry) => {
        if (entry.text().startsWith("Native Escape observation:"))
          appendFileSync(
            `${process.env.TANK_EVIDENCE_DIR}/native-key-events.jsonl`,
            `${JSON.stringify({ role, event: entry.text() })}\n`,
          );
      });
      await page.evaluate(() =>
        document.addEventListener(
          "keydown",
          (event) => {
            if (event.code === "Escape")
              console.info(
                "Native Escape observation:",
                JSON.stringify({
                  trusted: event.isTrusted,
                  focused: document.hasFocus(),
                  fullscreen: !!document.fullscreenElement,
                }),
              );
          },
          true,
        ),
      );
      const focus = await page.context().newCDPSession(page);
      await focus.send("Emulation.setFocusEmulationEnabled", {
        enabled: false,
      });
      await page.bringToFront();
      await expect
        .poll(() => page.evaluate(() => document.hasFocus()))
        .toBe(true);
      await page
        .getByRole("button", { name: "進入全螢幕", exact: true })
        .click();
      await expect
        .poll(() =>
          page.evaluate(() =>
            document.fullscreenElement?.classList.contains("battle-station"),
          ),
        )
        .toBe(true);
      await expect(
        page.getByRole("button", { name: "退出全螢幕", exact: true }),
      ).toBeEnabled();
      // The API event precedes the native macOS window transition. Let that
      // transition finish before a user could act on the fullscreen window.
      await page.waitForTimeout(1200);
      await expect
        .poll(() => page.evaluate(() => document.hasFocus()))
        .toBe(true);
      if (process.env.TANK_CUA_ESCAPE) {
        writeFileSync(
          `${process.env.TANK_EVIDENCE_DIR}/native-ready.json`,
          JSON.stringify({ pid, role, url: page.url() }),
        );
      } else if (process.env.TANK_BROWSER_ESCAPE) {
        await page.keyboard.press("Escape");
      } else
        execFileSync("/usr/bin/osascript", [
          "-e",
          `tell application "System Events"\ntell first application process whose unix id is ${pid} to key code 53\nend tell`,
        ]);
      await expect
        .poll(() => page.evaluate(() => document.fullscreenElement === null), {
          timeout: process.env.TANK_CUA_ESCAPE ? 120000 : 10000,
        })
        .toBe(true);
      await expect(
        page.getByRole("button", { name: "進入全螢幕", exact: true }),
      ).toHaveAttribute("aria-pressed", "false");
      if (role === "gunner") {
        const before = await page.getByTestId("turret-heading").textContent();
        await page.keyboard.down("ArrowRight");
        await expect(page.getByTestId("turret-heading")).not.toHaveText(
          before!,
        );
        await page.keyboard.up("ArrowRight");
      } else if (role === "driver") {
        await page.keyboard.down("w");
        await expect(page.getByTestId("tank-speed")).not.toHaveText("0.0");
        await page.keyboard.up("w");
      } else {
        await page.locator("#station-sound").click();
        await page.keyboard.down("r");
        await expect(page.getByTestId("load-progress")).not.toHaveText("0");
        await page.keyboard.up("r");
      }
      await expect(c.gunner.getByTestId("shot-count")).toHaveText("0");
      await page.screenshot({
        path: `${process.env.TANK_EVIDENCE_DIR || "/tmp/car-game-spec30/evidence/34"}/native-esc-${role}.png`,
      });
    }
  } finally {
    await c.close();
  }
});
