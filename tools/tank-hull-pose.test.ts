import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import type { CrewRole } from "../web/crew";
import { battleView } from "../web/tank-battle-view";
import { STILL_HEAD } from "../web/tank-camera-motion";
import { DRIVE, HILL_192_LEVEL, TankCore } from "../web/tank-core";
import { DRIVER_VIEW, driverView } from "../web/tank-driver-view";
import { applyHeadOffset } from "../web/tank-head-camera";
import { restingHullPitch } from "../web/tank-suspension";
import { FIRE, LOAD, SELECT_AP } from "../web/tank-weapons";
import { cannonPivot, cannonWorldPose } from "../web/tank-world-pose";

const roles: CrewRole[] = ["driver", "gunner", "loader"];
const start = { participants: [0, 1, 2], seed: 1000, practice: true };
const tolerance = 1e-6;

function loadRound(core: TankCore) {
  core.action(2, SELECT_AP);
  core.input(2, LOAD);
  core.step(3.25);
  core.input(2, 0);
  assert.equal(core.view().weapon.chamber, "loaded");
}

function direction(yaw: number, pitch: number) {
  return new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
  );
}

test("the Hill 192 road pitches the hull, sights, and fired shell before the hull settles", () => {
  const core = new TankCore((slot) => roles[slot]);
  const level = { ...HILL_192_LEVEL, enemies: [] };
  core.start({ ...start, occupation: level });
  loadRound(core);
  const { tank, turret, weapon } = core.view();
  const initialPitch = tank.pitch!;
  const initialSight = battleView(tank, turret, "gunner").pitch;
  assert.ok(initialPitch > 0.025);
  assert.ok(
    Math.abs(initialSight) < tolerance,
    "start aligned with the horizon",
  );

  core.input(0, DRIVE.forward);
  core.step(1.7);
  assert.ok(tank.speed > 3);
  assert.ok(tank.z > level.spawn.z + 2);
  assert.ok(tank.pitch! - initialPitch > 0.015);
  const sight = battleView(tank, turret, "gunner");
  const bore = direction(sight.yaw, sight.pitch);
  assert.ok(sight.pitch - initialSight > 0.015);

  // The comfort motion is offset after the nominal aim. It changes where the
  // crosshair projects, while the projectile still follows the sight's axis.
  const camera = new THREE.PerspectiveCamera(65, 16 / 9, 0.1, 740);
  camera.position.set(sight.x, sight.y, sight.z);
  camera.lookAt(camera.position.clone().add(bore));
  applyHeadOffset(camera, { ...STILL_HEAD, pitch: -0.034, yaw: 0.015 });
  assert.ok(
    camera.getWorldDirection(new THREE.Vector3()).distanceTo(bore) > 0.02,
  );
  core.action(1, FIRE);
  const shot = weapon.projectiles[0];
  assert.ok(
    new THREE.Vector3(shot.vx, shot.vy, shot.vz).normalize().distanceTo(bore) <
      tolerance,
  );
  const pivot = cannonPivot(tank);
  const muzzle = new THREE.Vector3(pivot.x, pivot.y, pivot.z).addScaledVector(
    bore,
    4.8,
  );
  assert.ok(
    muzzle.distanceTo(new THREE.Vector3(shot.x, shot.y, shot.z)) < tolerance,
  );
  assert.ok(
    Math.abs(weapon.lastShotPose!.hullPitch! - tank.pitch!) < tolerance,
  );

  core.input(0, 0);
  core.step(3);
  assert.equal(tank.speed, 0);
  const parkedPitch = restingHullPitch(level.battlefield.terrain!, tank);
  assert.ok(Math.abs(tank.pitch! - parkedPitch) < 0.0002);
  const { z, pitch } = tank;
  core.step(1);
  assert.equal(tank.z, z);
  assert.ok(Math.abs(tank.pitch! - pitch!) < 0.0002);
});

test("the tilted turret angles agree with its model and the driver eye follows its actual opening", () => {
  const hull = { x: 14, y: 22, z: -32, yaw: 1.43, pitch: 0.13 };
  const turret = { yaw: 1.12, pitch: -0.11 };
  const right = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const world = cannonWorldPose(hull, turret);
  const model = new THREE.Vector3(0, 0, -1)
    .applyAxisAngle(right, turret.pitch)
    .applyAxisAngle(up, -turret.yaw)
    .applyAxisAngle(right, hull.pitch)
    .applyAxisAngle(up, -hull.yaw);
  assert.ok(model.distanceTo(direction(world.yaw, world.pitch)) < tolerance);
  const driver = driverView(hull);
  const eye = new THREE.Vector3(
    DRIVER_VIEW.eye.right,
    DRIVER_VIEW.eye.height,
    -DRIVER_VIEW.eye.forward,
  )
    .applyAxisAngle(right, hull.pitch)
    .applyAxisAngle(up, -hull.yaw)
    .add(new THREE.Vector3(hull.x, hull.y, hull.z));
  assert.ok(
    eye.distanceTo(new THREE.Vector3(driver.x, driver.y, driver.z)) < tolerance,
  );
  assert.equal(driver.pitch, hull.pitch);
  assert.equal(driver.horizontalFov, DRIVER_VIEW.horizontalFov);
  assert.equal(driver.verticalFov, DRIVER_VIEW.verticalFov);
});

test("a flat practice snapshot keeps its original pose fields and launch geometry", () => {
  const core = new TankCore((slot) => roles[slot]);
  core.start(start);
  loadRound(core);
  core.action(1, FIRE);
  const saved = JSON.parse(core.snapshot());
  assert.equal("pitch" in saved.tank, false);
  assert.deepEqual(Object.keys(saved.weapon.lastShotPose), [
    "x",
    "z",
    "yaw",
    "pitch",
    "hullYaw",
  ]);
  assert.equal(saved.weapon.projectiles[0].y, 2.48);
  assert.equal(saved.weapon.projectiles[0].vy, 0);
});
