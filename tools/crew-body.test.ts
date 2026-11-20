import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { battleProjection } from "../web/tank-battle-view.ts";
import { STILL_HEAD } from "../web/tank-camera-motion.ts";
import { TankCrewRig } from "../web/tank-crew-rig.ts";
import { DRIVE } from "../web/tank-core.ts";
import { TankDriverControls } from "../web/tank-driver-controls.ts";
import { DRIVER_VIEW } from "../web/tank-driver-view.ts";
import { applyHeadOffset } from "../web/tank-head-camera.ts";

const sides = ["left", "right"] as const;
const palmCenter = new THREE.Vector3(0, 0.095, -0.032);

async function loadRig() {
  const bytes = readFileSync(
    new URL("../public/assets/closeups/crew-body.glb", import.meta.url),
  );
  const loader = new GLTFLoader();
  // The actual skin, armature and vertices matter here. Image decoding is
  // performed by the game when it prepares the driver's view.
  loader.register(() => ({
    name: "GeometryOnly",
    loadMaterial: async () => new THREE.MeshStandardMaterial(),
  }));
  const { scene } = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  return new TankCrewRig(scene);
}

function getLever(driver: TankDriverControls, side: (typeof sides)[number]) {
  const lever = driver.root.getObjectByName(
    side === "left" ? "LeftSteeringLever" : "RightSteeringLever",
  );
  assert.ok(lever);
  return lever;
}

test("the exported crew rig drives each lever and keeps both palms attached", async () => {
  const rig = await loadRig();
  const driver = new TankDriverControls(rig);
  assert.equal(rig.root.getObjectByName("CrewHeadMesh")?.visible, false);
  const upper = rig.bones.left.forearm.position.length();
  const lower = rig.bones.left.hand.position.length();
  const last = { left: 0, right: 0 };

  for (const [time, keys, x, y] of [
    [0, 0, 0, 0],
    [0.12, DRIVE.left, 0, 0],
    [0.23, DRIVE.left, 0.025, 0.022],
    [0.35, 0, -0.027, -0.005],
    [0.49, DRIVE.right, 0.008, -0.007],
    [0.65, DRIVE.right, 0, 0],
    [0.88, 0, 0, 0],
  ]) {
    driver.advance(time, keys);
    driver.pose({ ...STILL_HEAD, x, y, pitch: x, roll: y });
    for (const side of sides) {
      const { upperArm, forearm, hand } = rig.bones[side];
      const shoulderPosition = upperArm.getWorldPosition(new THREE.Vector3());
      const elbowPosition = forearm.getWorldPosition(new THREE.Vector3());
      const wristPosition = hand.getWorldPosition(new THREE.Vector3());
      assert.ok(
        Math.abs(shoulderPosition.distanceTo(elbowPosition) - upper) < 1e-6,
      );
      assert.ok(
        Math.abs(elbowPosition.distanceTo(wristPosition) - lower) < 1e-6,
      );
      const lever = getLever(driver, side);
      const grip = lever.getObjectByName("SteeringGrip");
      assert.ok(grip);
      const gripPosition = grip.getWorldPosition(new THREE.Vector3());
      const handPosition = hand.localToWorld(palmCenter.clone());
      assert.ok(handPosition.distanceTo(gripPosition) < 1e-6);
      // A or D only pulls its own lever. Opposite steering and releasing
      // decay continuously back toward neutral.
      if (keys & DRIVE[side]) assert.ok(lever.rotation.x < last[side]);
      else assert.ok(lever.rotation.x >= last[side]);
      last[side] = lever.rotation.x;
    }
  }
  assert.ok(Math.abs(last.left) < 0.001);
  assert.ok(Math.abs(last.right) < 0.001);
});

test("both grips sit in the normal driving view and below the clear throat", async () => {
  const rig = await loadRig();
  const driver = new TankDriverControls(rig);
  const aspect = 16 / 9;
  const camera = new THREE.PerspectiveCamera(
    THREE.MathUtils.radToDeg(battleProjection("driver", aspect).verticalFov),
    aspect,
    0.1,
    180,
  );
  const throatZ = -DRIVER_VIEW.openingDistance;
  const throatY =
    DRIVER_VIEW.openingDistance * Math.tan(DRIVER_VIEW.verticalFov / 2);
  const throatX =
    DRIVER_VIEW.openingDistance * Math.tan(DRIVER_VIEW.horizontalFov / 2);
  const uniform = rig.root.getObjectByName("CrewUniform");
  assert.ok(uniform);
  const world = new THREE.Vector3();

  for (const [time, keys, offset] of [
    [0, 0, STILL_HEAD],
    [0.3, DRIVE.left, { ...STILL_HEAD, y: -0.018, pitch: 0.022, roll: -0.016 }],
    [0.6, DRIVE.right, { ...STILL_HEAD, y: 0.019, pitch: -0.024, roll: 0.014 }],
  ] as const) {
    driver.advance(time, keys);
    driver.pose(offset);
    camera.position.set(0, 0, 0);
    camera.quaternion.identity();
    applyHeadOffset(camera, offset, true);
    camera.updateMatrixWorld(true);
    for (const side of sides) {
      const grip = getLever(driver, side).getObjectByName("SteeringGrip")!;
      const projected = grip.getWorldPosition(world).project(camera);
      assert.ok(Math.abs(projected.x) < 1);
      assert.ok(projected.y > -1 && projected.y < 0);
    }
    driver.root.updateMatrixWorld(true);
    uniform.traverse((part) => {
      if (!(part instanceof THREE.SkinnedMesh)) return;
      part.skeleton.update();
      for (
        let index = 0;
        index < part.geometry.attributes.position.count;
        index++
      ) {
        part.getVertexPosition(index, world);
        part.localToWorld(world);
        if (world.z <= throatZ || world.z >= camera.position.z - camera.near)
          continue;
        const through =
          (throatZ - camera.position.z) / (world.z - camera.position.z);
        const x = THREE.MathUtils.lerp(camera.position.x, world.x, through);
        const y = THREE.MathUtils.lerp(camera.position.y, world.y, through);
        assert.ok(
          Math.abs(x) >= throatX || y <= -throatY || y >= throatY,
          "a crew vertex covers the clear opening",
        );
      }
    });
  }
});
