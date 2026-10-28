import { test, expect } from "@playwright/test";
import { player, createRoom, joinRoom, startRace } from "./helpers";
test("重連期間信令服務失聯，恢復後仍可按鍵回到原席位", async ({ browser }) => {
  const host = await player(browser, "橘子"),
    code = await createRoom(host),
    guest = await player(browser, "葡萄");
  await joinRoom(guest, code);
  await startRace(host, guest);
  await guest.goto("about:blank");
  await expect(host.getByTestId("car-1")).toHaveAttribute(
    "aria-label",
    /斷線幽靈車/,
  );
  await guest
    .context()
    .route("http://127.0.0.1:4274/**", (route) => route.abort());
  await guest.goto("/");
  await expect(guest.getByRole("button", { name: "重新連線" })).toBeVisible({
    timeout: 25000,
  });
  await guest.context().unroute("http://127.0.0.1:4274/**");
  await guest.getByRole("button", { name: "重新連線" }).click();
  await expect(
    guest.getByRole("heading", { name: "比賽進行中" }),
  ).toBeVisible();
  await expect(host.getByTestId("car-1")).not.toHaveAttribute(
    "aria-label",
    /斷線幽靈車/,
  );
  await guest.context().close();
  await host.context().close();
});
