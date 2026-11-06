import { test, expect } from "@playwright/test";
import { tankCrew } from "./tank-helpers";

test("裝填中斷可續接，砲手就緒後射擊靶標，再退殼裝下一發", async ({
  browser,
}) => {
  const crew = await tankCrew(browser);
  try {
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText("空膛");
    await crew.loader.keyboard.down("r");
    await expect
      .poll(async () =>
        Number(await crew.loader.getByTestId("load-progress").textContent()),
      )
      .toBeGreaterThan(20);
    await crew.loader.keyboard.up("r");
    await crew.loader.waitForTimeout(150);
    const paused = Number(
      await crew.loader.getByTestId("load-progress").textContent(),
    );
    await crew.loader.waitForTimeout(400);
    expect(
      Number(await crew.loader.getByTestId("load-progress").textContent()),
    ).toBe(paused);
    await crew.loader.keyboard.down("r");
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.loader.keyboard.up("r");
    await expect(crew.gunner.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.gunner.keyboard.press("Space");
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText(
      "正在退殼",
    );
    await expect(crew.gunner.getByTestId("shot-count")).toHaveText("1");
    await expect(crew.gunner.getByTestId("target-status")).toContainText(
      "正前靶 100/200",
    );
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText("空膛");
    await crew.loader.keyboard.down("r");
    await expect(crew.gunner.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.loader.keyboard.up("r");
  } finally {
    await crew.close();
  }
});

test("只有裝填手能裝彈、只有砲手能射擊，連點不會複製同一發", async ({
  browser,
}) => {
  const crew = await tankCrew(browser, "gunner");
  try {
    await crew.gunner.keyboard.press("Space");
    await expect(crew.gunner.getByTestId("shot-count")).toHaveText("0");
    await crew.gunner.keyboard.down("r");
    await crew.driver.keyboard.down("r");
    await crew.loader.waitForTimeout(400);
    await crew.gunner.keyboard.up("r");
    await crew.driver.keyboard.up("r");
    await expect(crew.loader.getByTestId("load-progress")).toHaveText("0");
    await crew.loader.keyboard.down("r");
    await expect(crew.gunner.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.loader.keyboard.up("r");
    await crew.loader.keyboard.press("Space");
    await crew.driver.keyboard.press("Space");
    await crew.gunner.waitForTimeout(150);
    await expect(crew.gunner.getByTestId("shot-count")).toHaveText("0");
    await crew.gunner.keyboard.press("Space");
    await crew.gunner.keyboard.press("Space");
    await crew.gunner.keyboard.press("Space");
    await crew.loader.keyboard.down("r");
    await expect(crew.loader.getByTestId("chamber-state")).toHaveText(
      "正在退殼",
    );
    await crew.loader.waitForTimeout(200);
    await expect(crew.loader.getByTestId("load-progress")).toHaveText("0");
    await expect(crew.gunner.getByTestId("shot-count")).toHaveText("1");
    await expect(crew.gunner.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.loader.keyboard.up("r");
    await expect(crew.loader.getByTestId("shot-count")).toHaveText("1");
  } finally {
    await crew.close();
  }
});

test("仰射砲彈確實飛行後落地，未命中靶標不會憑空擊毀", async ({ browser }) => {
  const crew = await tankCrew(browser);
  try {
    await crew.gunner.keyboard.press("w");
    await crew.gunner.keyboard.press("w");
    await crew.loader.keyboard.down("r");
    await expect(crew.gunner.getByTestId("chamber-state")).toHaveText(
      "主炮就緒",
    );
    await crew.loader.keyboard.up("r");
    await crew.gunner.keyboard.press("Space");
    await expect(crew.gunner.getByTestId("flight-status")).toHaveText(
      "砲彈飛行中",
    );
    await crew.gunner.waitForTimeout(600);
    await expect(crew.gunner.getByTestId("flight-status")).toHaveText(
      "砲彈飛行中",
    );
    await expect(crew.gunner.getByTestId("target-status")).toContainText(
      "完好",
    );
    await expect(crew.gunner.getByTestId("flight-status")).toHaveText("", {
      timeout: 8000,
    });
    await expect(crew.gunner.getByTestId("target-status")).toContainText(
      "完好",
    );
  } finally {
    await crew.close();
  }
});
