import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TankCrewRig } from "../web/tank-crew-rig.ts";
import { LOADER_ARM_LENGTHS } from "../web/tank-loader-body.ts";
import { LoaderHands } from "../web/tank-loader-hands.ts";
import { TankLoaderMachineGun } from "../web/tank-loader-machine-gun.ts";
import { LoaderRounds } from "../web/tank-loader-rounds.ts";
import { TankLoaderUniform } from "../web/tank-loader-uniform.ts";
import { MG_RULES } from "../web/tank-settings.ts";
import { createWeaponState } from "../web/tank-weapons.ts";

async function model(name: string) {
  const bytes = readFileSync(
    new URL(`../public/assets/closeups/${name}.glb`, import.meta.url),
  );
  const loader = new GLTFLoader();
  loader.register(() => ({
    name: "GeometryOnly",
    loadMaterial: async () => new THREE.MeshStandardMaterial(),
  }));
  const { scene } = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  return scene;
}

async function clothing() {
  const rig = new TankCrewRig(await model("crew-body"));
  const uniform = new TankLoaderUniform(rig);
  const hands = new LoaderHands();
  assert.ok(hands.dress(await model("loader-gloves")));
  return { uniform, hands };
}

test("the loader's shared jacket stays sewn to its existing arms through a real loading pose", async () => {
  const { uniform, hands } = await clothing();
  const { rig } = uniform;
  const rounds = new LoaderRounds(new THREE.Group(), () => new THREE.Group());
  const weapon = createWeaponState();
  weapon.chamber = "loading";
  weapon.chamberShell = "ap";
  const position = new THREE.Vector3();

  assert.equal(rig.root.getObjectByName("CrewArms")?.visible, false);
  assert.equal(rig.root.getObjectByName("CrewHeadMesh")?.visible, false);
  assert.equal(rig.root.getObjectByName("CrewUniform")?.visible, true);

  for (const progress of [0.17, 0.4, 0.58, 0.85, 0.94]) {
    weapon.loadProgress = progress;
    rounds.present(weapon, hands, true, 0);
    const body = rounds.body;
    uniform.pose(body.origin, body.rotation, 0);
    for (const side of ["left", "right"] as const) {
      assert.ok(
        rig.bones[side].upperArm
          .getWorldPosition(position)
          .distanceTo(body[side].shoulder) < 0.02,
      );
      assert.ok(
        Math.abs(
          body[side].elbow.distanceTo(body[side].shoulder) -
            LOADER_ARM_LENGTHS.upper,
        ) < 1e-6,
      );
    }
  }
});

test("the roof station presents firm grips, then reflects independent reload and cooldown clocks", async () => {
  const { uniform, hands } = await clothing();
  const root = new THREE.Group();
  root.position.set(0, -0.24, -0.7);
  const cover = new THREE.Group();
  cover.position.set(0, 0.103, -0.43);
  const slide = new THREE.Group();
  slide.position.set(0.13, -0.02, -0.06);
  const belt = new THREE.Group();
  const links = Array.from({ length: 8 }, () => new THREE.Group());
  belt.add(...links);
  const leftGrip = new THREE.Object3D();
  const rightGrip = new THREE.Object3D();
  leftGrip.position.set(-0.12, -0.06, 0.153);
  rightGrip.position.set(0.12, -0.06, 0.153);
  root.add(cover, slide, belt, leftGrip, rightGrip);
  const operator = new TankLoaderMachineGun(
    { root, cover, slide, belt, links, leftGrip, rightGrip },
    uniform,
    hands,
  );
  new THREE.Group().add(root, operator.root);
  const weapon = createWeaponState();
  weapon.mode = "machine-gun";
  operator.stamp(weapon, 0);
  operator.present(weapon, 0);
  const resting = operator.body.right.wrist.clone();
  operator.stamp(weapon, 0.45);
  operator.present(weapon, 0.45);
  const gripping = operator.body.right.wrist.clone();
  assert.ok(gripping.distanceTo(resting) > 0.2);
  for (const [side, grip] of [
    ["left", leftGrip],
    ["right", rightGrip],
  ] as const) {
    const arm = operator.body[side];
    const palm = arm.wrist
      .clone()
      .addScaledVector(arm.fingers, 0.058 * 1.22)
      .addScaledVector(arm.palm, 0.032 * 1.22);
    assert.ok(
      grip.getWorldPosition(new THREE.Vector3()).distanceTo(palm) < 1e-5,
    );
  }

  weapon.mg.belt = { rounds: 0, reloadUntil: 1 + MG_RULES.reload };
  weapon.mg.coolUntil = 3.3;
  operator.present(weapon, 1 + MG_RULES.reload * 0.51);
  assert.ok(cover.rotation.x < -0.8);
  assert.ok(links.every((link) => link.visible));
  operator.present(weapon, 1 + MG_RULES.reload * 0.93);
  assert.ok(slide.position.z > -0.015);
  assert.ok(Math.abs(cover.rotation.x) < 1e-6);
  weapon.mg.belt = { rounds: MG_RULES.beltCapacity, reloadUntil: 0 };
  operator.present(weapon, 2.55);
  assert.ok(operator.body.right.wrist.y < gripping.y - 0.05);
  operator.present(weapon, 3.3);
  assert.ok(operator.body.right.wrist.distanceTo(gripping) < 1e-6);
});
