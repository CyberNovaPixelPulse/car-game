import assert from "node:assert/strict";
import { test } from "node:test";
import type { CrewRole } from "../web/crew";
import { GameRuntime } from "../web/game-runtime";
import { Session } from "../web/network";
import {
  AIM,
  BATTLEFIELD,
  DRIVE,
  HILL_192_LEVEL,
  TankCore,
} from "../web/tank-core";
import type { OccupationLevel } from "../web/tank-occupation";
import { FIRE } from "../web/tank-weapons";

const roles: CrewRole[] = ["driver", "gunner", "loader"];
const start = { participants: [0, 1, 2], seed: 1000, practice: true };
// The focused rule fixtures stay small while the playable level is expanded.
const fixture: OccupationLevel = {
  id: "hill-192",
  battlefield: BATTLEFIELD,
  spawn: { x: 0, z: 0, yaw: 0 },
  zone: { x: 0, z: -9, radius: 6.5 },
  captureSeconds: 12,
  decayPerSecond: 0.12,
  enemies: [{ kind: "panzer", x: 18, z: -9 }],
};

function startOccupation(level: OccupationLevel) {
  const core = new TankCore((slot) => roles[slot]);
  core.start({ ...start, occupation: level });
  return core;
}

test("an occupation can be won with normal solo controls and restarted", () => {
  let now = 0;
  const runtime = new GameRuntime(new Session(), () => now);
  const frame = (seconds: number) => {
    now += seconds * 1000;
    return runtime.frame(now).view;
  };
  runtime.startPractice(1000, "driver", HILL_192_LEVEL);
  assert.equal(frame(0).weapon.targets.length, HILL_192_LEVEL.enemies.length);
  assert.equal(frame(0).occupation?.phase, "approach");

  runtime.startPractice(1000, "driver", fixture);
  runtime.setInput(DRIVE.forward);
  assert.equal(frame(2).occupation?.phase, "capturing");
  runtime.setInput(0);
  const won = frame(fixture.captureSeconds + 1);
  assert.equal(won.occupation?.progress, 1);
  assert.equal(won.battle.won, true);
  assert.equal(won.battle.failed, false);
  assert.equal(frame(1).time, won.time);

  runtime.startPractice(1001, "driver", fixture);
  const fresh = frame(0);
  assert.equal(fresh.battle.won, false);
  assert.equal(fresh.occupation?.progress, 0);
  assert.equal(fresh.weapon.targets.length, fixture.enemies.length);
  assert.equal(fresh.time, 0);
});

test("a living enemy entering the occupied zone pauses capture and withdrawal decays it", () => {
  const level: OccupationLevel = {
    ...fixture,
    spawn: { x: -5, z: -9, yaw: 0 },
    enemies: [{ kind: "panzer", x: 13, z: -9 }],
  };
  const core = startOccupation(level);
  core.step(2);
  assert.equal(core.view().occupation?.phase, "capturing");
  assert.ok(core.view().occupation!.progress > 0);
  core.step(4);
  const occupation = core.view().occupation!;
  assert.equal(occupation.phase, "contested");
  const beforeRetreat = occupation.progress;
  core.step(1);
  assert.equal(occupation.progress, beforeRetreat);
  assert.equal(core.view().battle.won, false);

  core.input(0, DRIVE.reverse);
  core.step(2);
  core.input(0, 0);
  assert.equal(occupation.phase, "retreating");
  assert.ok(occupation.progress > 0 && occupation.progress < beforeRetreat);
  core.step(8);
  assert.equal(occupation.progress, 0);
  assert.equal(occupation.phase, "approach");
});

test("pause and solo role switching preserve occupation and game time", () => {
  let now = 0;
  const runtime = new GameRuntime(new Session(), () => now);
  const level: OccupationLevel = {
    ...fixture,
    spawn: { x: fixture.zone.x, z: fixture.zone.z, yaw: 0 },
    enemies: [],
  };
  runtime.startPractice(1000, "driver", level);
  now = 1000;
  runtime.pausePractice(true);
  const state = runtime.presentation.view();
  const frozen = { time: state.time, progress: state.occupation!.progress };
  assert.ok(frozen.progress > 0);
  runtime.switchPracticeRole("gunner");
  now = 20000;
  const paused = runtime.frame(now).view;
  assert.equal(paused.time, frozen.time);
  assert.equal(paused.occupation?.progress, frozen.progress);
  runtime.pausePractice(false);
  now = 21000;
  const resumed = runtime.frame(now).view;
  assert.ok(resumed.time > frozen.time);
  assert.ok(resumed.occupation!.progress > frozen.progress);
});

test("a parked occupation driver can hand over the tank and aim before directing AI to move", () => {
  let now = 0;
  const runtime = new GameRuntime(new Session(), () => now);
  const frame = (seconds: number) => {
    now += seconds * 1000;
    return runtime.frame(now).view;
  };
  const level = {
    ...fixture,
    enemies: [{ kind: "panzer", x: 30, z: -31, readyAfter: 100 }],
  } satisfies OccupationLevel;
  runtime.startPractice(1000, "driver", level);
  runtime.setInput(DRIVE.forward);
  frame(2);
  runtime.setInput(0);
  const parked = frame(2.2);
  const { x, z, speed } = parked.tank;
  const progress = parked.occupation!.progress;
  const time = parked.time;
  assert.ok(z < 0);
  assert.equal(speed, 0);
  assert.ok(progress > 0);
  assert.equal(parked.weapon.chamber, "loaded");

  runtime.pausePractice(true);
  runtime.switchPracticeRole("gunner");
  assert.equal(runtime.practice?.driverStopped, true);
  assert.equal(runtime.practice?.driverStatus, "依指令停車");
  const frozen = frame(1.5);
  assert.equal(frozen.time, time);
  assert.equal(frozen.occupation?.progress, progress);
  assert.equal(frozen.weapon.chamber, "loaded");

  runtime.pausePractice(false);
  runtime.setInput(AIM.up);
  const aimed = frame(1);
  assert.ok(aimed.turret.pitch > 0);
  assert.deepEqual([aimed.tank.x, aimed.tank.z, aimed.tank.speed], [x, z, 0]);
  runtime.action(FIRE);
  assert.equal(aimed.weapon.shotsFired, 1);

  runtime.pausePractice(true);
  runtime.switchPracticeRole("loader");
  assert.equal(frame(1).weapon.chamber, "ejecting");
  runtime.pausePractice(false);
  runtime.commandPractice({ type: "toggle-driver" });
  assert.equal(runtime.practice?.driverStopped, false);
  const driving = frame(3);
  assert.ok(Math.hypot(driving.tank.x - x, driving.tank.z - z) > 0.2);
});

test("the occupation AI gunner requires authorization before warning and firing", () => {
  let now = 0;
  const runtime = new GameRuntime(new Session(), () => now);
  runtime.startPractice(1000, "driver", {
    ...fixture,
    enemies: [{ kind: "panzer", x: 0, z: -12, readyAfter: 100 }],
  });
  assert.equal(runtime.practice?.firing, false);
  const state = runtime.presentation.view();
  assert.equal(state.weapon.chamber, "empty");
  now = 8000;
  // The command advances old time before it grants permission.
  runtime.commandPractice({ type: "toggle-fire" });
  assert.equal(state.weapon.chamber, "loaded");
  assert.equal(state.weapon.shotsFired, 0);
  assert.equal(runtime.practice?.gunnerStatus, "待命・等候交戰指令");
  assert.ok(state.time >= 7.99);
  assert.equal(runtime.practice?.firing, true);

  now += 500;
  runtime.frame(now);
  assert.equal(state.weapon.shotsFired, 0);
  assert.match(runtime.practice!.gunnerStatus, /即將開火/);
  now += 1500;
  runtime.frame(now);
  assert.equal(state.weapon.shotsFired, 1);

  runtime.startPractice(1000, "driver");
  assert.equal(runtime.practice?.firing, true);
  runtime.startPractice(1000, "driver", fixture);
  assert.equal(runtime.practice?.firing, false);
});

test("occupation engagement orders still require the AI gunner to see a target", () => {
  let now = 0;
  const runtime = new GameRuntime(new Session(), () => now);
  runtime.startPractice(1000, "driver", {
    ...fixture,
    enemies: [{ kind: "panzer", x: 0, z: -36, readyAfter: 100 }],
  });
  runtime.commandPractice({ type: "toggle-fire" });
  now = 6000;
  const state = runtime.frame(now).view;
  assert.equal(state.weapon.chamber, "loaded");
  assert.equal(state.weapon.shotsFired, 0);
  assert.equal(runtime.practice?.gunnerStatus, "搜尋可見敵車");
});

test("defeat and restart coexist with the original free practice", () => {
  const level: OccupationLevel = {
    ...fixture,
    enemies: [{ kind: "panzer", x: 0, z: -8, readyAfter: 0 }],
  };
  const core = startOccupation(level);
  core.step(150);
  assert.equal(core.view().tank.hp, 0);
  assert.equal(core.view().battle.failed, true);
  assert.equal(core.view().battle.won, false);

  core.start({ ...start, occupation: level });
  assert.equal(core.view().battle.failed, false);
  assert.ok(core.view().tank.hp > 0);
  assert.equal(core.view().occupation?.progress, 0);

  core.start(start);
  assert.equal(core.view().occupation, undefined);
  assert.equal(core.view().weapon.targets.length, 0);
  core.startPracticeRound();
  assert.equal(core.practiceRound, 1);
  assert.equal(core.view().weapon.targets.length, 1);
  core.start({ ...start, practice: false });
  assert.equal(core.view().occupation, undefined);
  assert.equal(core.view().battle.wave, 1);
  assert.equal(core.view().weapon.targets.length, 2);
});
