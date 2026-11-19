import { test } from "node:test";
import assert from "node:assert/strict";
import type { CrewRole } from "../web/crew";
import { DRIVE, TankCore } from "../web/tank-core";
import { FIRE, LOAD, WEAPON_TIMING } from "../web/tank-weapons";

const driver = 0;
const gunner = 1;
const loader = 2;
const roles = new Map<number, CrewRole>([
  [driver, "driver"],
  [gunner, "gunner"],
  [loader, "loader"],
]);

function startBattle() {
  const core = new TankCore((participant) => roles.get(participant));
  // This seed gives the first load no jam.
  core.start({ participants: [driver, gunner, loader], seed: 1000 });
  return core;
}

test("only the driver can move the tank forward", () => {
  const core = startBattle();
  const startingZ = core.view().tank.z;

  core.input(gunner, DRIVE.forward);
  core.step(0.5);
  assert.equal(core.view().tank.z, startingZ);

  core.input(driver, DRIVE.forward);
  core.step(0.5);
  assert.ok(core.view().tank.z < startingZ);
});

test("the gunner can fire only after the loader chambers a round", () => {
  const core = startBattle();

  core.input(loader, LOAD);
  core.step(0.5);
  assert.equal(core.view().weapon.chamber, "loading");
  core.action(gunner, FIRE);
  assert.equal(core.view().weapon.shotsFired, 0);

  core.step(WEAPON_TIMING.load);
  assert.equal(core.view().weapon.chamber, "loaded");
  core.action(driver, FIRE);
  core.action(loader, FIRE);
  assert.equal(core.view().weapon.chamber, "loaded");

  core.action(gunner, FIRE);
  assert.equal(core.view().weapon.shotsFired, 1);
  assert.equal(core.view().weapon.chamber, "ejecting");
});

test("pausing freezes battle time and preserves an in-progress load", () => {
  const core = startBattle();
  core.input(loader, LOAD);
  core.step(0.5);
  const {
    time,
    weapon: { loadProgress },
  } = core.view();
  assert.ok(loadProgress > 0);

  core.pause(true);
  core.step(1);
  assert.equal(core.view().time, time);
  assert.equal(core.view().weapon.loadProgress, loadProgress);

  core.pause(false);
  core.input(loader, LOAD);
  core.step(0.5);
  assert.ok(core.view().time > time);
  assert.ok(core.view().weapon.loadProgress > loadProgress);
});
