import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { LoaderHands } from "../web/tank-loader-hands.ts";
import { LoaderRounds } from "../web/tank-loader-rounds.ts";
import type { WeaponState } from "../web/tank-weapons.ts";

test("both sleeves follow their own glove through pickup, carry and release", async () => {
  const buffer = readFileSync(
    new URL("../public/assets/closeups/loader-gloves.glb", import.meta.url),
  );
  // The shipped meshes, skin weights and bind poses load normally. These
  // geometric checks don't need image decoding or a graphics context.
  const loader = new GLTFLoader().register(() => ({
    name: "GeometryOnly",
    loadMaterial: async () => new THREE.MeshStandardMaterial(),
  }));
  const { scene } = await loader.parseAsync(
    buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ),
    "",
  );
  const hands = new LoaderHands();
  assert.ok(hands.dress(scene));
  const bones = hands.group.getObjectsByProperty("name", "Wrist");
  assert.equal(bones.length, 2);
  const shoulders = hands.group.getObjectsByProperty("name", "UpperArm");
  const elbows = hands.group.getObjectsByProperty("name", "Forearm");
  const gloves = [hands.left.glove, hands.right.glove];
  const rack = new THREE.Group();
  const rounds = new LoaderRounds(rack, () => new THREE.Group());
  const tip = new THREE.Vector3();
  const actual = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const forearm = new THREE.Vector3();
  const upperArm = new THREE.Vector3();
  for (const type of ["ap", "he", "smoke"] as const) {
    for (const follow of [true, false]) {
      const lastTurn = [new THREE.Quaternion(), new THREE.Quaternion()];
      const lastShoulder = [new THREE.Vector3(), new THREE.Vector3()];
      for (let step = 1; step <= 1000; ++step) {
        const loading = {
          chamber: "loading",
          chamberShell: type,
          loadProgress: step / 1000,
        } as WeaponState;
        rounds.present(loading, hands, true, 0, follow);
        hands.group.updateMatrixWorld(true);
        if (step === 580) {
          const carried = rack.children.find((round) => round.rotation.x < 0.4);
          assert.ok(carried, "one shell has swung into the hands");
          const palmPads = gloves.map((glove) =>
            carried.worldToLocal(
              glove.localToWorld(
                new THREE.Vector3(0, 0.047, -0.034).divideScalar(glove.scale.y),
              ),
            ),
          );
          const [rear, front] = palmPads;
          assert.ok(
            rear.z > 0.3 && rear.y < 0.01,
            "rear palm must meet the base",
          );
          assert.ok(
            front.z < -0.1 && front.y < 0 && front.x > 0,
            "front palm must cradle the visible lower side",
          );
          assert.ok(
            Math.abs(Math.hypot(front.x, front.y) - 0.095) < 0.012,
            "front palm floats away from the shell",
          );
        }
        for (const [side, wrist] of bones.entries()) {
          gloves[side].localToWorld(tip.set(0, -0.044, 0));
          assert.ok(
            wrist.getWorldPosition(actual).distanceTo(tip) < 1e-6,
            "cloth separates from the glove",
          );
          wrist.getWorldQuaternion(rotation);
          elbows[side].getWorldPosition(upperArm);
          forearm.subVectors(actual, upperArm);
          shoulders[side].getWorldPosition(actual);
          upperArm.sub(actual);
          if (side === 0 && step === 580)
            assert.ok(
              upperArm.angleTo(forearm) > Math.PI / 4,
              "rear elbow must bend under the load",
            );
          if (side === 0 && step === 850)
            assert.ok(
              upperArm.angleTo(forearm) < Math.PI / 4,
              "rear elbow must extend on the push",
            );
          assert.ok(
            upperArm.angleTo(forearm) < (141 * Math.PI) / 180,
            "elbow folds into the upper arm",
          );
          if (step > 1) {
            assert.ok(
              rotation.angleTo(lastTurn[side]) < Math.PI / 5,
              "sleeve twists abruptly",
            );
            assert.ok(
              actual.distanceTo(lastShoulder[side]) < 0.14,
              "shoulder jumps during release",
            );
          }
          lastTurn[side].copy(rotation);
          lastShoulder[side].copy(actual);
        }
      }
    }
  }
});
