import assert from "node:assert/strict";
import { test } from "node:test";
import { TankCore, type TankState } from "../web/tank-core";
import { MG_FIRE, MG_RULES } from "../web/tank-machine-gun";
import { CROUCH, MODE } from "../web/tank-weapons";

const loader = 2;

function startMachineGun() {
  const core = new TankCore((participant) =>
    participant === loader ? "loader" : "gunner",
  );
  core.start({ participants: [loader, 1], seed: 1000, practice: true });
  core.action(loader, MODE);
  return core;
}

function holdUntilReload(core: TankCore) {
  core.input(loader, MG_FIRE);
  for (let step = 0; step < 800; step++) {
    core.step(0.025);
    const { time, weapon } = core.view();
    if ((weapon.mg.belt?.reloadUntil ?? 0) > time) return;
  }
  assert.fail("a held trigger should run out the belt within 20 game seconds");
}

test("the roof machine gun spends rounds only on authorized shots and auto-resumes after reloading", () => {
  const core = startMachineGun();
  core.input(1, MG_FIRE);
  core.input(loader, CROUCH | MG_FIRE);
  core.step(0.5);
  assert.equal(core.view().weapon.mg.shots, 0);
  assert.equal(core.view().weapon.mg.belt?.rounds, MG_RULES.beltCapacity);

  holdUntilReload(core);
  const { mg } = core.view().weapon;
  assert.equal(mg.shots, MG_RULES.beltCapacity);
  assert.equal(mg.belt?.rounds, 0);
  core.step(MG_RULES.reload / 2);
  assert.equal(mg.shots, MG_RULES.beltCapacity);
  const readyTime = Math.max(mg.coolUntil, mg.belt!.reloadUntil);
  core.step(readyTime - core.view().time + 0.025);
  assert.equal(mg.shots, MG_RULES.beltCapacity + 1);
  assert.equal(mg.belt?.rounds, MG_RULES.beltCapacity - 1);
});

test("an empty belt can start reloading on the same tick as overheat", () => {
  const core = startMachineGun();
  const restored: TankState = JSON.parse(core.snapshot());
  restored.weapon.mg.heat = 1 - 0.025 / MG_RULES.burst;
  restored.weapon.mg.belt = { rounds: 1, reloadUntil: 0 };
  core.restore(JSON.stringify(restored));

  core.input(loader, MG_FIRE);
  core.step(0.025);
  const { time, weapon } = core.view();
  assert.equal(weapon.mg.shots, 1);
  assert.equal(weapon.mg.belt?.rounds, 0);
  assert.ok((weapon.mg.belt?.reloadUntil ?? 0) > time);
  assert.ok(weapon.mg.coolUntil > time);
});

for (const gate of ["reload", "cooldown"] as const) {
  test(`the roof machine gun waits for both gates when ${gate} finishes first`, () => {
    const core = startMachineGun();
    const restored: TankState = JSON.parse(core.snapshot());
    const firstDeadline = 0.25;
    const secondDeadline = 0.8;
    restored.weapon.mg.belt = {
      rounds: 0,
      reloadUntil: gate === "reload" ? firstDeadline : secondDeadline,
    };
    restored.weapon.mg.heat = 1;
    restored.weapon.mg.coolUntil =
      gate === "cooldown" ? firstDeadline : secondDeadline;
    core.restore(JSON.stringify(restored));

    core.input(loader, MG_FIRE);
    core.step(0.5);
    const { mg } = core.view().weapon;
    assert.equal(mg.shots, 0);
    assert.equal(
      mg.belt?.rounds,
      gate === "reload" ? MG_RULES.beltCapacity : 0,
    );

    core.step(0.35);
    assert.equal(mg.shots, 1);
    assert.equal(mg.belt?.rounds, MG_RULES.beltCapacity - 1);
  });
}

test("a committed reload freezes during pause and finishes after release and a mode switch", () => {
  const core = startMachineGun();
  holdUntilReload(core);
  const { time, weapon } = core.view();
  const { mg } = weapon;
  const reloadUntil = mg.belt!.reloadUntil;
  core.input(loader, 0);
  core.pause(true);
  core.step(10);
  assert.equal(core.view().time, time);
  assert.equal(mg.belt?.reloadUntil, reloadUntil);
  assert.equal(mg.belt?.rounds, 0);

  core.pause(false);
  core.action(loader, MODE);
  assert.equal(weapon.mode, "repair");
  core.step(Math.max(MG_RULES.reload, MG_RULES.cooldown) + 0.1);
  assert.equal(mg.belt?.rounds, MG_RULES.beltCapacity);
  assert.equal(mg.belt?.reloadUntil, 0);
  assert.equal(mg.shots, MG_RULES.beltCapacity);

  core.action(loader, MODE);
  core.action(loader, MODE);
  assert.equal(weapon.mode, "machine-gun");
  core.step(0.15);
  assert.equal(mg.shots, MG_RULES.beltCapacity);
  core.input(loader, MG_FIRE);
  core.step(0.025);
  assert.equal(mg.shots, MG_RULES.beltCapacity + 1);
});

test("snapshots that predate belts still restore and initialize on the next step", () => {
  const core = startMachineGun();
  const restored: TankState = JSON.parse(core.snapshot());
  delete restored.weapon.mg.belt;
  core.restore(JSON.stringify(restored));
  core.input(loader, MG_FIRE);
  core.step(0.025);
  assert.equal(core.view().weapon.mg.shots, 1);
  assert.equal(core.view().weapon.mg.belt?.rounds, MG_RULES.beltCapacity - 1);
});
