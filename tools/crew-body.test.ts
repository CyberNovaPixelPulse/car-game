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
  loader.register((parser) => ({
    name: "GeometryOnly",
    loadMaterial: async (index: number) =>
      new THREE.MeshStandardMaterial({
        name: parser.json.materials[index].name,
      }),
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

test("each exported hand is continuous and has all finger joints", async () => {
  const rig = await loadRig();
  const arms = rig.root.getObjectByName("CrewArms")!;
  const skin = arms.children.find(
    (part): part is THREE.SkinnedMesh =>
      part instanceof THREE.SkinnedMesh &&
      part.material instanceof THREE.Material &&
      part.material.name === "Crew skin and natural nails",
  );
  assert.ok(skin);
  const position = skin.geometry.attributes.position;
  const index = skin.geometry.index!;
  assert.ok(index);
  const meshes = [0, 1].map(() => ({
    edges: new Map<string, number>(),
    vertices: new Set<string>(),
    faces: 0,
  }));
  // glTF may duplicate a vertex at a UV seam. Weld its position for the
  // topology check so these joins count as skin and not as holes.
  const key = (i: number) =>
    [position.getX(i), position.getY(i), position.getZ(i)]
      .map((value) => Math.round(value * 1e6))
      .join(",");
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const face = [key(a), key(index.getX(i + 1)), key(index.getX(i + 2))];
    const hand = meshes[position.getX(a) > 0 ? 1 : 0];
    hand.faces++;
    for (let j = 0; j < 3; j++) {
      hand.vertices.add(face[j]);
      const edge = [face[j], face[(j + 1) % 3]].sort().join("|");
      hand.edges.set(edge, (hand.edges.get(edge) ?? 0) + 1);
    }
  }
  for (const { edges, vertices, faces } of meshes) {
    assert.equal(vertices.size - edges.size + faces, 2);
    assert.ok([...edges.values()].every((n) => n === 2));
  }
  for (const side of sides) {
    const suffix = side === "left" ? "L" : "R";
    for (const finger of ["Thumb", "Index", "Middle", "Ring", "Pinky"]) {
      let parent: THREE.Object3D = rig.bones[side].hand;
      for (const joint of ["Base", "Middle", "Tip"]) {
        const bone = parent.children.find(
          (part) => part.name === finger + joint + suffix,
        );
        assert.ok(bone instanceof THREE.Bone);
        parent = bone;
      }
    }
  }
});

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

test("both grips and wrists fit between the HUD panels below the clear throat", async () => {
  const rig = await loadRig();
  const driver = new TankDriverControls(rig);
  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 180);
  const viewports = [
    // The inner edges of the map and the driver help/AI panels, with padding.
    { width: 824, height: 743, left: 182, right: 460 },
    { width: 1280, height: 720, left: 182, right: 916 },
  ];
  const throatZ = -DRIVER_VIEW.openingDistance;
  const throatY =
    DRIVER_VIEW.openingDistance * Math.tan(DRIVER_VIEW.verticalFov / 2);
  const throatX =
    DRIVER_VIEW.openingDistance * Math.tan(DRIVER_VIEW.horizontalFov / 2);
  const uniform = rig.root.getObjectByName("CrewUniform");
  assert.ok(uniform);
  const arms = rig.root.getObjectByName("CrewArms");
  assert.ok(arms);
  const world = new THREE.Vector3();

  for (const [time, keys, offset] of [
    [0, 0, STILL_HEAD],
    [0.3, DRIVE.left, { ...STILL_HEAD, y: -0.018, pitch: 0.022, roll: -0.016 }],
    [0.6, DRIVE.right, { ...STILL_HEAD, y: 0.019, pitch: -0.024, roll: 0.014 }],
    [0.9, DRIVE.left, { ...STILL_HEAD, x: 0.022, y: -0.018, roll: -0.016 }],
    [1.2, DRIVE.right, { ...STILL_HEAD, x: -0.022, y: 0.019, roll: 0.014 }],
  ] as const) {
    driver.advance(time, keys);
    driver.pose(offset);
    camera.position.set(0, 0, 0);
    camera.quaternion.identity();
    applyHeadOffset(camera, offset, true);
    camera.updateMatrixWorld(true);
    for (const { width, height, left, right } of viewports) {
      camera.aspect = width / height;
      camera.fov = THREE.MathUtils.radToDeg(
        battleProjection("driver", camera.aspect).verticalFov,
      );
      camera.updateProjectionMatrix();
      for (const side of sides) {
        const grip = getLever(driver, side).getObjectByName("SteeringGrip")!;
        for (const part of [grip, rig.bones[side].hand]) {
          const projected = part.getWorldPosition(world).project(camera);
          const x = ((projected.x + 1) * width) / 2;
          assert.ok(
            x > left && x < right,
            `${part.name} is behind the HUD at ${width} px`,
          );
          assert.ok(
            projected.y > -1 && projected.y < 0,
            `${part.name} is cropped at ${width} px`,
          );
        }
      }
    }
    driver.root.updateMatrixWorld(true);
    const assertOpeningClear = (part: THREE.Object3D) => {
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
    };
    uniform.traverse(assertOpeningClear);
    arms.traverse(assertOpeningClear);
  }
});
