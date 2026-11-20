import assert from "node:assert/strict";
import { test } from "node:test";
import type { CrewRole } from "../web/crew";
import { GameRuntime } from "../web/game-runtime";
import { Session } from "../web/network";
import { BATTLEFIELD, DRIVE, HILL_192_LEVEL, TankCore } from "../web/tank-core";
import type { OccupationLevel } from "../web/tank-occupation";

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
