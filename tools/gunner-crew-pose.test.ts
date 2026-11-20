import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { AIM, TankCore } from "../web/tank-core.ts";
import { TankCrewRig } from "../web/tank-crew-rig.ts";
import { TankGunnerControls } from "../web/tank-gunner-controls.ts";
import { STILL_HEAD } from "../web/tank-camera-motion.ts";
import { battleProjection } from "../web/tank-battle-view.ts";
import { applyHeadOffset } from "../web/tank-head-camera.ts";

async function gunner() {
  const bytes = readFileSync(
    new URL("../public/assets/closeups/crew-body.glb", import.meta.url),
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
  return new TankGunnerControls(new TankCrewRig(scene));
}

const left = {
  side: "left",
  wheel: "TraverseWheel",
  handle: "TraverseHandle",
} as const;
const right = {
  side: "right",
  wheel: "ElevationWheel",
  handle: "ElevationHandle",
} as const;

test("accepted traverse and elevation operate separate wheels and settle on release", async () => {
  const controls = await gunner();
  const core = new TankCore(() => "gunner");
  core.start({ participants: [0], seed: 1, practice: true });
  const visible = (wheel: string) =>
    controls.root
      .getObjectByName(wheel)!
      .getWorldQuaternion(new THREE.Quaternion());
  const pose = () => {
    controls.pose(core.view().turret, STILL_HEAD);
    return [visible(left.wheel), visible(right.wheel)];
  };
  const start = pose();

  core.input(0, AIM.left, 16 / 9);
  core.step(0.42);
  const aimedLeft = pose();
  assert.ok(aimedLeft[0].angleTo(start[0]) > 0.3);
  assert.ok(aimedLeft[1].angleTo(start[1]) < 1e-6);

  // The authoritative angle winds through zero on reversing a left turn.
  core.input(0, AIM.right, 16 / 9);
  let previous = aimedLeft[0];
  for (let i = 0; i < 48; i++) {
    core.step(0.02);
    const [current] = pose();
    assert.ok(current.angleTo(previous) < 0.12, "the wheel skips across zero");
    previous = current;
  }

  core.input(0, 0, 16 / 9);
  core.step(0.65);
  const beforeElevation = pose();
  core.input(0, AIM.up, 16 / 9);
  core.step(0.43);
  const aimedUp = pose();
  assert.ok(aimedUp[0].angleTo(beforeElevation[0]) < 1e-6);
  assert.ok(aimedUp[1].angleTo(beforeElevation[1]) > 0.3);
  core.input(0, 0, 16 / 9);
  core.step(0.65);
  const released = pose();
  core.step(0.5);
  const rested = pose();
  assert.ok(rested[0].angleTo(released[0]) < 1e-6);
  assert.ok(rested[1].angleTo(released[1]) < 1e-6);

  core.input(0, AIM.down | AIM.right, 16 / 9);
  core.step(0.43);
  const downAndRight = pose();
  assert.ok(downAndRight[0].angleTo(rested[0]) > 0.3);
  assert.ok(downAndRight[1].angleTo(rested[1]) > 0.3);
  assert.ok(core.view().turret.pitchRate < 0);
});

test("the skin follows the crank handles without blocking the gunner's sight", async () => {
  const controls = await gunner();
  const plate = controls.root.getObjectByName("GunnerGearbox")!;
  const box = new THREE.Box3().setFromObject(plate).expandByScalar(-0.003);
  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 180);
  const world = new THREE.Vector3();
  for (let step = 0; step < 24; step++) {
    const offset = {
      ...STILL_HEAD,
      x: 0.017 * Math.sin(step),
      y: 0.016 * Math.cos(step),
      pitch: 0.025 * Math.sin(step + 0.44),
      roll: 0.014 * Math.cos(step),
    };
    controls.pose(
      {
        yaw: (step / 24) * Math.PI * 2,
        pitch: step % 2 ? -0.18 : 0.5,
        yawRate: 0.85 * Math.sin(step),
        pitchRate: 0.5 * Math.cos(step),
      },
      offset,
    );
    controls.root.updateMatrixWorld(true);
    for (const { side, handle } of [left, right]) {
      const { hand, forearm } = controls.rig.bones[side];
      const grip = hand.localToWorld(new THREE.Vector3(0, 0.095, -0.032));
      const target = controls.root
        .getObjectByName(handle)!
        .getWorldPosition(world);
      assert.ok(grip.distanceTo(target) < 1e-6);
      const fingertip = new THREE.Vector3(0, 1, 0).transformDirection(
        hand.matrixWorld,
      );
      const approach = hand
        .getWorldPosition(new THREE.Vector3())
        .sub(forearm.getWorldPosition(world));
      assert.ok(fingertip.angleTo(approach) < Math.PI / 3, "wrist overextends");
    }

    camera.position.set(0, 0, 0);
    camera.quaternion.identity();
    applyHeadOffset(camera, offset);
    camera.updateMatrixWorld(true);
    for (const [width, height] of [
      [824, 743],
      [1280, 720],
    ]) {
      camera.aspect = width / height;
      camera.fov = THREE.MathUtils.radToDeg(
        battleProjection("gunner", camera.aspect).verticalFov,
      );
      camera.updateProjectionMatrix();
      for (const { handle } of [left, right]) {
        const target = controls.root
          .getObjectByName(handle)!
          .getWorldPosition(world);
        target.project(camera);
        const x = ((target.x + 1) * width) / 2;
        assert.ok(x > 182 && x < width - 364, "handle hides behind HUD");
        assert.ok(
          target.y > -1 && target.y < -0.2,
          "handle leaves the lower work area",
        );
      }
    }

    // Check body and console geometry, including deferred split arm meshes.
    controls.root.traverseVisible((part) => {
      if (!(part instanceof THREE.Mesh)) return;
      if (part instanceof THREE.SkinnedMesh) part.skeleton.update();
      for (
        let index = 0;
        index < part.geometry.attributes.position.count;
        index++
      ) {
        part.getVertexPosition(index, world);
        part.localToWorld(world);
        if (part instanceof THREE.SkinnedMesh)
          assert.ok(!box.containsPoint(world), "crew skin enters the gearbox");
        if (world.z >= camera.position.z - camera.near) continue;
        world.project(camera);
        assert.ok(
          Math.abs(world.x) > 0.18 || Math.abs(world.y) > 0.2,
          "control or skin crosses the aiming region",
        );
      }
    });
  }
});
