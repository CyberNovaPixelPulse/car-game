import assert from "node:assert/strict";
import { test } from "node:test";
import type { CrewRole } from "../web/crew";
import { GameRuntime } from "../web/game-runtime";
import { Session } from "../web/network";
import { AIM, DRIVE, HILL_192_LEVEL, TankCore } from "../web/tank-core";
import { AIMING, TEAM_INTEL_SECONDS } from "../web/tank-settings";
import { terrainSegmentHit, type TerrainHeightGrid } from "../web/tank-terrain";
import { FIRE, LOAD, SELECT_AP, WEAPON_TIMING } from "../web/tank-weapons";

const level = HILL_192_LEVEL;
const roles: CrewRole[] = ["driver", "gunner", "loader"];
const start = { participants: [0, 1, 2], seed: 1000, practice: true };

function solo(role: CrewRole) {
  let now = 0;
  const runtime = new GameRuntime(new Session(), () => now);
  runtime.startPractice(1000, role, level);
  return {
    runtime,
    step(seconds: number) {
      now += seconds * 1000;
      return runtime.frame(now).view;
    },
  };
}

test("a segment with clear endpoints still hits the shared terrain diagonal", () => {
  const valley: TerrainHeightGrid = {
    minX: 0,
    minZ: 0,
    spacing: 10,
    elevations: [
      [0, 8],
      [8, 0],
    ],
  };
  assert.equal(terrainSegmentHit(valley, [0, 4, 0], [10, 4, 10]), 0.25);
  assert.equal(terrainSegmentHit(valley, [0, 9, 0], [10, 9, 10]), undefined);
});

test("Hill 192 deploys separated guards and a moving patrol, and allows a normal 200 m main-gun hit", () => {
  const { runtime, step } = solo("gunner");
  runtime.setViewAspect(16 / 9);
  runtime.commandPractice({ type: "toggle-driver" });
  const initial = step(0);
  const guard = initial.weapon.targets[0];
  const patrol = initial.weapon.targets.at(-1)!;
  const guardDistance = Math.hypot(
    guard.x - initial.tank.x,
    guard.z - initial.tank.z,
  );
  const patrolStart = patrol.x;
  assert.equal(guardDistance, 200);
  assert.ok(Math.abs(patrol.x - guard.x) >= 170);
  const settled = step(WEAPON_TIMING.load + 0.25);
  assert.equal(guard.phase, "guarding");
  assert.equal(guard.z, 125);
  assert.equal(patrol.phase, "patrolling");
  assert.ok(patrol.x - patrolStart > 2);
  assert.equal(settled.battle.shots, 0);
  assert.ok(
    settled.intel.contacts.some(
      (contact) => contact.id === guard.id && contact.visible,
    ),
  );
  assert.equal(settled.weapon.chamberShell, "ap");

  runtime.setInput(AIM.up);
  step(0.145);
  runtime.setInput(0);
  step(0.3);
  runtime.action(FIRE);
  const impact = step(0.45);
  assert.equal(impact.tank.x, level.spawn.x);
  assert.equal(impact.tank.z, level.spawn.z);
  assert.equal(impact.weapon.shotsFired, 1);
  assert.equal(guard.hp, 20);
  assert.ok(Math.abs(impact.weapon.impacts[0].z - guard.z) < guard.depth);
});

test("an actual nearby Hill 192 stone building stops sight and cannon fire", () => {
  const core = new TankCore((slot) => roles[slot]);
  core.start({
    ...start,
    occupation: {
      ...level,
      spawn: { x: -183, z: 113, yaw: Math.PI / 2 },
      enemies: [level.enemies[1]],
    },
  });
  core.input(1, 0, 16 / 9);
  core.action(2, SELECT_AP);
  core.input(2, LOAD);
  core.step(WEAPON_TIMING.load + 0.1);
  core.input(2, 0);
  assert.ok(core.view().intel.contacts[0].visible);

  core.input(0, DRIVE.forward);
  core.step(1.2);
  core.input(0, 0);
  core.step(1);
  const { tank, weapon, intel } = core.view();
  const target = weapon.targets[0];
  const stale = intel.contacts[0];
  assert.equal(stale.visible, false);
  assert.ok(stale.observedAt < core.view().time);
  assert.ok(Math.hypot(target.x - tank.x, target.z - tank.z) < 60);

  const yaw = Math.atan2(target.x - tank.x, tank.z - target.z) - tank.yaw;
  core.input(1, AIM.right, 16 / 9);
  core.step(yaw / AIMING.maxYawRate);
  core.input(1, 0, 16 / 9);
  core.step(0.55);
  assert.equal(core.view().intel.contacts[0].observedAt, stale.observedAt);
  core.action(1, FIRE);
  core.step(0.14);
  assert.equal(target.hp, target.maxHp);
  assert.ok(Math.abs(weapon.impacts[0].x - -163.5) < 0.3);
  core.step(TEAM_INTEL_SECONDS);
  assert.equal(core.view().intel.contacts.length, 0);
});

test("solo players can capture without a charge, or pass the point and be defeated by the guarding group", () => {
  const capture = solo("driver");
  capture.runtime.setInput(DRIVE.forward);
  capture.step(29);
  capture.runtime.setInput(0);
  assert.equal(capture.step(15).battle.won, true);

  const expose = solo("driver");
  expose.runtime.setInput(DRIVE.forward);
  expose.step(35);
  expose.runtime.setInput(0);
  expose.step(2);
  expose.runtime.pausePractice(true);
  expose.runtime.switchPracticeRole("loader");
  expose.runtime.pausePractice(false);
  const ending = expose.step(45);
  assert.equal(ending.tank.hp, 0);
  assert.equal(ending.battle.failed, true);
  assert.equal(ending.battle.won, false);
  assert.ok(ending.battle.shots > 5);
});

test("the production southern approach lures a guard into a live capture and crew fire resumes it", () => {
  const { runtime, step } = solo("driver");
  runtime.setViewAspect(16 / 9);

  runtime.setInput(DRIVE.forward);
  step(33);
  runtime.setInput(0);
  assert.equal(step(2).occupation?.phase, "retreating");

  runtime.setInput(DRIVE.reverse);
  step(9);
  runtime.setInput(0);
  assert.equal(step(2).occupation?.phase, "capturing");
  const contested = step(3);
  assert.equal(contested.occupation?.phase, "contested");
  const progress = contested.occupation!.progress;
  assert.ok(progress > 0 && progress < 1);
  const guard = contested.weapon.targets[0];
  const { x, z, radius } = level.zone;
  assert.ok(Math.hypot(guard.x - x, guard.z - z) <= radius);
  assert.ok(guard.hp > 0);
  assert.equal(step(0.75).occupation?.progress, progress);

  runtime.commandPractice({ type: "toggle-fire" });
  const secured = step(16);
  assert.equal(guard.hp, 0);
  assert.equal(secured.occupation?.progress, 1);
  assert.equal(secured.battle.won, true);
});
