import { expect, test, type Page } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

const motion = (page: Page) =>
  page.getByRole("button", { name: "鏡頭震動", exact: true });

// Measure only the visible reticle's displacement relative to its own viewport.
// Start on the replicated shot counter so a slower client's samples still
// describe the same authority-accepted shot.
async function observeShot(page: Page) {
  return page.locator(".sight:visible").evaluate(async (sight) => {
    const viewport = sight.parentElement!.getBoundingClientRect();
    const shots = document.querySelector('[data-testid="shot-count"]')!;
    const deadline = performance.now() + 8000;
    let first: number | undefined;
    let peak = 0;
    while (performance.now() < deadline) {
      const time = await new Promise<number>((resolve) =>
        requestAnimationFrame(resolve),
      );
      if (shots.textContent !== "1") continue;
      first ??= time;
      const box = sight.getBoundingClientRect();
      const offset = Math.hypot(
        (box.left + box.width / 2 - viewport.left - viewport.width / 2) /
          viewport.height,
        (box.top + box.height / 2 - viewport.top - viewport.height / 2) /
          viewport.height,
      );
      peak = Math.max(peak, offset);
      if (time - first >= 700) break;
    }
    return { sawShot: first !== undefined, peak };
  });
}

test("三人房間在行駛與機槍連射中開炮，各端呈現自己的震動選擇並可重連", async ({
  browser,
}) => {
  const crew = await tankCrew(browser);
  try {
    await crew.loader.keyboard.down("r");
    await expect(crew.gunner.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.loader.keyboard.up("r");
    await crew.loader.keyboard.press("Tab");
    await expect(crew.loader.getByTestId("loader-mode")).toHaveText("機槍模式");
    await motion(crew.loader).click();
    await expect(motion(crew.loader)).toHaveAttribute("aria-pressed", "false");
    await expect(motion(crew.gunner)).toHaveAttribute("aria-pressed", "true");

    await crew.driver.keyboard.down("s");
    await expect
      .poll(async () =>
        Number(await crew.gunner.getByTestId("tank-speed").textContent()),
      )
      .toBeLessThan(-0.5);
    await crew.loader.getByRole("img", { name: "機槍戰場視野" }).click();
    await crew.loader.keyboard.down("Space");
    await expect
      .poll(async () =>
        Number(await crew.loader.getByTestId("mg-shot-count").textContent()),
      )
      .toBeGreaterThan(0);

    const [gunner, loader] = await Promise.all([
      observeShot(crew.gunner),
      observeShot(crew.loader),
      crew.gunner.keyboard.press("Space"),
    ]);
    await crew.loader.keyboard.up("Space");
    await crew.driver.keyboard.up("s");
    expect(gunner.sawShot && loader.sawShot).toBe(true);
    expect(gunner.peak).toBeGreaterThan(0.008);
    expect(gunner.peak).toBeLessThan(0.12);
    expect(loader.peak).toBeLessThan(0.001);

    // The host keeps the same battle while the (remote) gunner reconnects.
    const rounds = await crew.loader.getByTestId("mg-shot-count").innerText();
    await crew.gunner.goto("about:blank");
    await expect(crew.loader.getByTestId("battle-pause")).toBeVisible();
    await crew.gunner.goto("/");
    await expect(crew.loader.getByTestId("battle-pause")).toBeHidden();
    await expect(crew.gunner.getByTestId("shot-count")).toHaveText("1");
    await expect(crew.loader.getByTestId("mg-shot-count")).toHaveText(rounds);
    await expect(motion(crew.loader)).toHaveAttribute("aria-pressed", "false");
    await expect(motion(crew.gunner)).toHaveAttribute("aria-pressed", "true");
  } finally {
    await crew.close();
  }
});
