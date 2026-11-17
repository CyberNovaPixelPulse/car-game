import { expect, test } from "@playwright/test";
import type { CrewRole } from "../web/crew";
import { GameRuntime } from "../web/game-runtime";
import { Session } from "../web/network";
import { ENEMY_RULES } from "../web/tank-settings";

// Local authority tests. The clock can reach a command before another frame.
function startPractice(role: CrewRole) {
  let now = 0;
  const runtime = new GameRuntime(new Session(), () => now);
  runtime.startPractice(1000, role);
  return {
    runtime,
    setTime: (milliseconds: number) => {
      now = milliseconds;
    },
    frame: () => runtime.frame(now).view,
    view: () => runtime.presentation.view(),
  };
}

test("停車先結算 AI 駕駛已經行駛的時間", () => {
  const { runtime, setTime, frame, view } = startPractice("gunner");
  runtime.commandPractice({ type: "start-round" });
  setTime(500);
  runtime.commandPractice({ type: "toggle-driver" });
  expect(runtime.practice?.driverStopped).toBe(true);
  expect(view().tank.speed).toBeGreaterThan(0);

  setTime(3000);
  expect(frame().tank.speed).toBe(0);
});

test("停火先結算指令收到前已到期的 AI 射擊", () => {
  const { runtime, setTime, frame, view } = startPractice("driver");
  setTime(5000);
  expect(frame().weapon.chamber).toBe("loaded");
  runtime.commandPractice({ type: "start-round" });
  setTime(5100);
  frame();
  expect(runtime.practice?.gunnerStatus).toContain("即將開火");

  setTime(6500);
  runtime.commandPractice({ type: "toggle-fire" });
  expect(runtime.practice?.firing).toBe(false);
  expect(view().weapon.shotsFired).toBe(1);
});

test("選彈先結算舊偏好下已開始的裝填", () => {
  const { runtime, setTime, view } = startPractice("gunner");
  setTime(500);
  runtime.commandPractice({ type: "select-shell", shell: "smoke" });

  expect(runtime.practice?.shell).toBe("smoke");
  expect(view().weapon.chamber).toBe("loading");
  expect(view().weapon.chamberShell).toBe("ap");
});

test("暫停時可保留彈種偏好，開戰輪次以恢復後的收件時間起算", () => {
  const { runtime, setTime, view } = startPractice("gunner");
  runtime.pausePractice(true);

  setTime(1000);
  runtime.commandPractice({ type: "select-shell", shell: "smoke" });
  runtime.commandPractice({ type: "start-round" });
  expect(runtime.practice?.round).toBe(0);
  expect(view().time).toBe(0);
  expect(view().weapon.targets).toHaveLength(0);

  setTime(2000);
  runtime.pausePractice(false);
  setTime(2500);
  runtime.commandPractice({ type: "start-round" });
  expect(runtime.practice?.round).toBe(1);
  expect(view().weapon.chamberShell).toBe("smoke");
  expect(view().time).toBeCloseTo(0.5);
  expect(view().weapon.targets).toHaveLength(1);
  expect(view().weapon.targets[0].readyAt).toBeCloseTo(
    0.5 + ENEMY_RULES.spawnGrace,
  );
});
