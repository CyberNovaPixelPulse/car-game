import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TankCore } from "../web/tank-core.ts";
import { LoaderHands } from "../web/tank-loader-hands.ts";
import { LoaderRepair } from "../web/tank-loader-repair.ts";
import { LoaderRounds } from "../web/tank-loader-rounds.ts";
import { createWeaponState } from "../web/tank-weapons.ts";

async function loadModel(filename: string) {
  const bytes = readFileSync(
    new URL(`../public/assets/closeups/${filename}.glb`, import.meta.url),
  );
  // Keep the authored mesh, skin and bind pose without decoding images in Node.
  const loader = new GLTFLoader().register(() => ({
    name: "GeometryOnly",
    loadMaterial: async () => new THREE.MeshStandardMaterial(),
  }));
  const model = await loader.parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
  return model.scene;
}

async function dressedHands() {
  const hands = new LoaderHands();
  assert.ok(hands.dress(await loadModel("loader-gloves")));
  return hands;
}

function palmPad(glove: THREE.Object3D, shell: THREE.Object3D) {
  // The bearing pad is measured in world units from the wrist pivot.
  const pad = new THREE.Vector3(0, 0.047, -0.034).divideScalar(glove.scale.y);
  return shell.worldToLocal(glove.localToWorld(pad));
}

test("the loader carries and pushes every shell with fixed arm lengths and shoulder width", async () => {
  const hands = await dressedHands();
  const shoulders = hands.group.getObjectsByProperty("name", "UpperArm");
  const elbows = hands.group.getObjectsByProperty("name", "Forearm");
  const wrists = hands.group.getObjectsByProperty("name", "Wrist");
  for (const joints of [shoulders, elbows, wrists])
    assert.equal(joints.length, 2);
  const gloves = [hands.left.glove, hands.right.glove];
  const rack = new THREE.Group();
  const rounds = new LoaderRounds(rack, () => new THREE.Group());
  const weapon = createWeaponState();
  weapon.chamber = "loading";
  const shoulder = new THREE.Vector3();
  const elbow = new THREE.Vector3();
  const wrist = new THREE.Vector3();
  const cuff = new THREE.Vector3();
  const upperArm = new THREE.Vector3();
  const forearm = new THREE.Vector3();
  const palmToFingers = new THREE.Vector3();
  const rotation = new THREE.Quaternion();

  for (const [index, type] of (["he", "ap", "smoke"] as const).entries()) {
    weapon.chamberShell = type;
    const shell = rack.children[index];
    const lastTurn = [new THREE.Quaternion(), new THREE.Quaternion()];
    const lastShoulder = [new THREE.Vector3(), new THREE.Vector3()];
    let carryFlex = 0;
    for (let step = 1; step <= 1000; ++step) {
      weapon.loadProgress = step / 1000;
      rounds.present(weapon, hands, true, 0);
      hands.group.updateMatrixWorld(true);

      for (const [side, glove] of gloves.entries()) {
        shoulders[side].getWorldPosition(shoulder);
        elbows[side].getWorldPosition(elbow);
        wrists[side].getWorldPosition(wrist);
        glove.localToWorld(cuff.set(0, -0.044, 0));
        upperArm.subVectors(elbow, shoulder);
        forearm.subVectors(wrist, elbow);
        assert.ok(
          Math.abs(upperArm.length() - 0.4608) < 1e-6,
          "upper arm stretches",
        );
        assert.ok(
          Math.abs(forearm.length() - 0.4096) < 1e-6,
          "forearm stretches",
        );
        assert.ok(wrist.distanceTo(cuff) < 1e-6, "sleeve separates from glove");
        // Measure the authored glove's palm-to-fingers axis against the actual
        // wrist and elbow bones, including the slide from the casing to its base.
        const rearBearing = side === 0 && step >= 397 && step <= 900;
        const frontBearing = side === 1 && step >= 160 && step <= 700;
        if (rearBearing || frontBearing) {
          palmToFingers.set(0, 1, 0).transformDirection(glove.matrixWorld);
          const wristBend = THREE.MathUtils.radToDeg(
            forearm.angleTo(palmToFingers),
          );
          const limit = rearBearing ? 65 : 45;
          assert.ok(
            wristBend < limit,
            `${type} ${step / 10}%: ${rearBearing ? "rear" : "front"} wrist bends ${wristBend.toFixed(1)}° under load`,
          );
        }
        const flex = THREE.MathUtils.radToDeg(upperArm.angleTo(forearm));
        assert.ok(flex >= 20 - 1e-6, "elbow locks straight at full reach");
        assert.ok(flex < 141, "elbow folds into the upper arm");
        if (side === 0 && step === 580) {
          carryFlex = flex;
          assert.ok(
            flex > 75,
            "rear elbow must bend beneath the carried shell",
          );
        }
        if (side === 0 && step === 850) {
          assert.ok(flex < 80, "rear elbow must extend during the push");
          assert.ok(
            carryFlex - flex > 30,
            "rear elbow angle barely changes from carry to push",
          );
        }
        wrists[side].getWorldQuaternion(rotation);
        if (step > 1) {
          assert.ok(
            rotation.angleTo(lastTurn[side]) < Math.PI / 5,
            "sleeve twists abruptly",
          );
          assert.ok(
            shoulder.distanceTo(lastShoulder[side]) < 0.14,
            "shoulder jumps",
          );
        }
        lastTurn[side].copy(rotation);
        lastShoulder[side].copy(shoulder);
      }
      assert.ok(
        Math.abs(lastShoulder[0].distanceTo(lastShoulder[1]) - 0.42) < 1e-6,
        "shoulders slide apart on the torso",
      );

      if (step >= 360 && step <= 700) {
        const front = palmPad(gloves[1], shell);
        assert.ok(
          front.x > 0 && front.y < 0,
          "front hand must cradle the lower side",
        );
        assert.ok(
          Math.abs(front.z + 0.158) < 0.012,
          "front hand slides along the case",
        );
        assert.ok(
          Math.abs(Math.hypot(front.x, front.y) - 0.095) < 0.012,
          "front hand loses contact",
        );
      }
      if (step >= 440 && step <= 580) {
        const rear = palmPad(gloves[0], shell);
        assert.ok(
          rear.x < 0 && rear.y < 0 && rear.z > 0.1 && rear.z < 0.25,
          "rear palm must cradle the underside of the rear cylinder",
        );
        assert.ok(
          Math.abs(Math.hypot(rear.x, rear.y) - 0.095) < 0.012,
          "rear palm loses contact under the carried shell",
        );
        if (step === 580) {
          assert.ok(
            rear.x < rear.y,
            "rear palm must hold the outer lower side",
          );
        }
      }
      if (step >= 770 && step <= 900) {
        const rear = palmPad(gloves[0], shell);
        assert.ok(
          Math.abs(rear.z - 0.313) < 0.018,
          "rear palm separates from the base",
        );
        assert.ok(
          Math.hypot(rear.x, rear.y) < 0.105,
          "rear palm misses the base",
        );
        if (step === 850) {
          assert.ok(
            Math.hypot(rear.x, rear.y) < 0.02,
            "push misses the center of the base",
          );
          const released = palmPad(gloves[1], shell);
          assert.ok(
            Math.hypot(released.x, released.y) > 0.2,
            "front hand still holds the shell after release",
          );
        }
      }
    }
  }
});

test("entering repair after loading keeps cuffs joined and the wrench on the fastener", async () => {
  const hands = await dressedHands();
  const scene = new THREE.Scene();
  scene.add(hands.group);
  const rounds = new LoaderRounds(scene, () => new THREE.Group());
  const state = new TankCore(() => "loader").view();
  state.weapon.chamber = "loading";
  state.weapon.loadProgress = 0.85;
  rounds.present(state.weapon, hands, true, 0);
  const panel = await loadModel("repair-panel");
  const repair = LoaderRepair.bind(panel, scene, hands);
  assert.ok(repair);
  const tool = hands.right.glove.getObjectByName("SocketWrench");
  const fastener = panel.getObjectByName("Fastener");
  assert.ok(tool && fastener);
  const wrists = hands.group.getObjectsByProperty("name", "Wrist");
  const gloves = [hands.left.glove, hands.right.glove];
  state.weapon.mode = "repair";
  state.repair.status = "repairing";
  for (const result of ["idle", "active"] as const) {
    state.repair.calibration.result = result;
    for (let step = 0; step <= 60; step++) {
      state.repair.activeSeconds = state.repair.calibration.elapsed = step / 60;
      repair.present(state, Infinity);
      scene.updateMatrixWorld(true);
      for (const [side, wrist] of wrists.entries()) {
        const cuff = gloves[side].localToWorld(new THREE.Vector3(0, -0.044, 0));
        assert.ok(
          wrist.getWorldPosition(new THREE.Vector3()).distanceTo(cuff) < 1e-6,
          "repair cuff separates after loading",
        );
      }
      assert.equal(tool.visible, result === "idle");
      if (tool.visible) {
        const socket = tool.getWorldPosition(new THREE.Vector3());
        assert.ok(
          socket.distanceTo(fastener.getWorldPosition(new THREE.Vector3())) <
            1e-6,
          "wrench misses the fastener",
        );
      }
    }
  }
});
