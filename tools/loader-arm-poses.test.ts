import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TankCore } from "../web/tank-core.ts";
import { LoaderHands } from "../web/tank-loader-hands.ts";
import { LoaderRepair } from "../web/tank-loader-repair.ts";
import { LoaderRounds } from "../web/tank-loader-rounds.ts";
import { stepRepair, stopRepairCalibration } from "../web/tank-repair.ts";
import { REPAIR_RULES } from "../web/tank-settings.ts";
import { createWeaponState } from "../web/tank-weapons.ts";

async function loadModel(filename: string) {
  const bytes = readFileSync(
    new URL(`../public/assets/closeups/${filename}.glb`, import.meta.url),
  );
  // Keep the authored mesh, skin and bind pose without decoding images in Node.
  const loader = new GLTFLoader();
  if (filename === "loader-gloves")
    loader.register(() => ({
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

// Locate an authored point on the relaxed leather, then sample that same vertex
// after the Grip and Pinch targets deform it. Exporter vertex ordering may vary.
function leatherPoint(glove: THREE.Object3D, relaxed: THREE.Vector3) {
  const sewn = glove.getObjectByName("SewnWorkGlove");
  assert.ok(sewn);
  let closest:
    { mesh: THREE.Mesh; vertex: number; distance: number } | undefined;
  const point = new THREE.Vector3();
  for (const child of sewn.children) {
    if (!(child instanceof THREE.Mesh)) continue;
    const positions = child.geometry.getAttribute("position");
    for (let vertex = 0; vertex < positions.count; vertex++) {
      const distance = point
        .fromBufferAttribute(positions, vertex)
        .distanceTo(relaxed);
      if (!closest || distance < closest.distance)
        closest = { mesh: child, vertex, distance };
    }
  }
  assert.ok(
    closest && closest.distance < 0.006,
    "leather landmark missing from the exported glove",
  );
  const { mesh, vertex } = closest;
  return () =>
    mesh.localToWorld(mesh.getVertexPosition(vertex, new THREE.Vector3()));
}

function distanceToSurface(part: THREE.Object3D) {
  part.updateWorldMatrix(true, true);
  const inverse = part.matrixWorld.clone().invert();
  const triangles: THREE.Triangle[] = [];
  part.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const matrix = inverse.clone().multiply(node.matrixWorld);
    const positions = node.geometry.getAttribute("position");
    const vertices = Array.from({ length: positions.count }, (_, i) =>
      new THREE.Vector3()
        .fromBufferAttribute(positions, i)
        .applyMatrix4(matrix),
    );
    const indices = node.geometry.getIndex();
    assert.ok(indices);
    for (let i = 0; i < indices.count; i += 3)
      triangles.push(
        new THREE.Triangle(
          vertices[indices.getX(i)],
          vertices[indices.getX(i + 1)],
          vertices[indices.getX(i + 2)],
        ),
      );
  });
  assert.ok(triangles.length);
  const nearest = new THREE.Vector3();
  return (worldPoint: THREE.Vector3) => {
    const local = part.worldToLocal(worldPoint.clone());
    let closest = Infinity;
    for (const triangle of triangles)
      closest = Math.min(
        closest,
        triangle.closestPointToPoint(local, nearest).distanceToSquared(local),
      );
    return Math.sqrt(closest);
  };
}

test("the support hand takes the wrench load without lifting its palm off the panel", async () => {
  const scene = new THREE.Scene();
  const hands = await dressedHands();
  scene.add(hands.group);
  const kit = await loadModel("repair-panel");
  const repair = LoaderRepair.bind(kit, scene, hands);
  const tool = kit.getObjectByName("SocketWrench");
  const panel = kit.getObjectByName("RepairPanel");
  const cuff = hands.group.getObjectsByProperty("name", "Wrist")[0];
  assert.ok(repair && tool && panel && cuff);
  const palm = leatherPoint(
    hands.left.glove,
    new THREE.Vector3(-0.025, 0.021, -0.028),
  );
  const index = leatherPoint(
    hands.left.glove,
    new THREE.Vector3(-0.041, 0.147, -0.015),
  );
  const state = new TankCore(() => "loader").view();
  state.weapon.mode = "repair";
  state.tank.hp = 20;
  let previousAngle: number | undefined;
  const strokes = [];
  for (let frame = 0; frame < 120; frame++) {
    state.time += 1 / 60;
    stepRepair(state, true, 1 / 60);
    repair.present(state, repair.resultAge(state));
    scene.updateMatrixWorld(true);
    const angle = tool.rotation.z;
    if (previousAngle !== undefined && hands.group.visible)
      strokes.push({
        velocity: (angle - previousAngle) * 60,
        heel: palm(),
        tip: index(),
        cuff: cuff.getWorldPosition(new THREE.Vector3()),
      });
    previousAngle = angle;
  }
  strokes.sort((a, b) => a.velocity - b.velocity);
  const loaded = strokes[0],
    relaxed = strokes.at(-1);
  assert.ok(loaded && relaxed && loaded.velocity < -2 && relaxed.velocity > 2);
  assert.ok(
    relaxed.tip.distanceTo(relaxed.heel) - loaded.tip.distanceTo(loaded.heel) >
      0.005,
    "fingers must curl slightly toward the heel on the downstroke",
  );
  assert.ok(
    loaded.heel.distanceTo(relaxed.heel) < 0.002,
    "the supporting palm slides",
  );
  assert.ok(
    loaded.cuff.distanceTo(relaxed.cuff) > 0.003,
    "the sleeve never bears on the wrist",
  );
});

test("the painted index moves past the stationary panel mark during calibration", async () => {
  const kit = await loadModel("repair-panel");
  const scene = new THREE.Scene();
  const hands = await dressedHands();
  scene.add(hands.group);
  const repair = LoaderRepair.bind(kit, scene, hands);
  const casting = kit.getObjectByName("PanelCasting");
  const ring = kit.getObjectByName("AdjustmentRing");
  assert.ok(repair && casting && ring);
  function paintedMark(part: THREE.Object3D) {
    const mesh = part
      .getObjectsByProperty("type", "Mesh")
      .find(
        (node) =>
          node instanceof THREE.Mesh && node.material.name === "IndexEnamel",
      );
    assert.ok(
      mesh instanceof THREE.Mesh,
      "casting and ring each need a visible paint mark",
    );
    mesh.geometry.computeBoundingBox();
    const local = mesh.geometry.boundingBox.getCenter(new THREE.Vector3());
    return () => mesh.localToWorld(local.clone());
  }
  const fixed = paintedMark(casting),
    rotating = paintedMark(ring);
  const pointer = fixed();
  const start = rotating();
  const state = new TankCore(() => "loader").view();
  state.tank.hp = 20;
  state.weapon.mode = "repair";
  for (let frame = 0; frame < 10 * 60; frame++) {
    state.time += 1 / 60;
    stepRepair(state, true, 1 / 60);
    repair.present(state, repair.resultAge(state));
    if (state.repair.calibration.elapsed > 1.4) break;
  }
  assert.ok(start.distanceTo(rotating()) > 0.042, "paint stripe barely moves");
  assert.ok(
    pointer.distanceTo(fixed()) < 1e-6,
    "the reference turns with the dial",
  );
});

for (const expected of ["success", "failed"] as const) {
  test(`the loader turns the ring and returns to the wrench after calibration ${expected}`, async () => {
    const hands = await dressedHands();
    const scene = new THREE.Scene();
    scene.add(hands.group);
    const rounds = new LoaderRounds(scene, () => new THREE.Group());
    const state = new TankCore(() => "loader").view();
    state.weapon.chamber = "loading";
    state.weapon.chamberShell = "he";
    state.weapon.loadProgress = 0.85;
    rounds.present(state.weapon, hands, true, 0);
    scene.updateMatrixWorld(true);
    const gloves = [hands.left.glove, hands.right.glove];
    const loadingPose = gloves.map((glove) =>
      glove.getWorldPosition(new THREE.Vector3()),
    );
    const kit = await loadModel("repair-panel");
    const tool = kit.getObjectByName("SocketWrench");
    const panel = kit.getObjectByName("RepairPanel");
    const fastener = kit.getObjectByName("Fastener");
    const ring = kit.getObjectByName("AdjustmentRing");
    const casting = kit.getObjectByName("PanelCasting");
    assert.ok(tool && panel && fastener && ring && casting);
    const repair = LoaderRepair.bind(kit, scene, hands);
    assert.ok(repair);
    const ringDistance = distanceToSurface(ring);
    const castingDistance = distanceToSurface(casting);
    const toolDistance = distanceToSurface(tool);
    const rightPalm = leatherPoint(
      hands.right.glove,
      new THREE.Vector3(0, 0.054, -0.02),
    );
    const ringFinger = leatherPoint(
      hands.right.glove,
      new THREE.Vector3(0.012, 0.139, -0.017),
    );
    const fingertips = [
      leatherPoint(hands.right.glove, new THREE.Vector3(-0.069, 0.077, -0.019)),
      leatherPoint(hands.right.glove, new THREE.Vector3(-0.041, 0.147, -0.015)),
    ];
    // The thenar pad sits on the thumb side of the relaxed glove.
    const bracePad = leatherPoint(
      hands.left.glove,
      new THREE.Vector3(-0.025, 0.021, -0.028),
    );
    const wrists = hands.group.getObjectsByProperty("name", "Wrist");
    const elbows = hands.group.getObjectsByProperty("name", "Forearm");
    const shoulders = hands.group.getObjectsByProperty("name", "UpperArm");
    const c = state.repair.calibration;
    state.time = 10;
    state.tank.hp = 20;
    state.weapon.mode = "repair";
    let settledAt: number | undefined;
    let stoppedWork: number | undefined;
    let firstRingAngle: number | undefined;
    let lastRingAngle: number | undefined;
    let confirmedAngle: number | undefined;
    let confirmationTravel = 0;
    let firstLocalTips: THREE.Vector3[] | undefined;
    let recovery = false;
    let braced = false;
    let parkedTool: THREE.Quaternion | undefined;
    let withdrew = false;
    let reachedForHandle = false;
    let firstHandle: THREE.Vector3 | undefined;
    let wrenchSweep = 0;
    const dt = 1 / 60;
    for (let frame = 0; frame < 15 * 60; frame++) {
      state.time += dt;
      stepRepair(state, true, dt);
      // Stop just inside the success region, outside the narrower perfect region.
      if (
        expected === "success" &&
        c.result === "active" &&
        c.elapsed / REPAIR_RULES.calibrationDuration >=
          c.target + REPAIR_RULES.calibrationWidth - 0.035
      )
        stopRepairCalibration(state);
      const resultAge = repair.resultAge(state);
      rounds.present(state.weapon, hands, false, 0);
      repair.present(state, resultAge);
      scene.updateMatrixWorld(true);
      if (c.result === expected) {
        settledAt ??= state.time;
        if (expected === "failed") stoppedWork ??= state.repair.activeSeconds;
        if (expected === "success" && Number.isFinite(resultAge)) {
          confirmedAngle ??= ring.rotation.z;
          confirmationTravel = Math.max(
            confirmationTravel,
            ring.rotation.z - confirmedAngle,
          );
        }
      }
      if (!hands.group.visible) continue;
      const onRing = c.result === "active" || Number.isFinite(resultAge);
      const returnedWork =
        stoppedWork === undefined
          ? Infinity
          : state.repair.activeSeconds - stoppedWork;
      const working = !onRing && state.repair.status === "repairing";
      if (working && returnedWork < 0.07 && toolDistance(rightPalm()) > 0.03)
        reachedForHandle = true;
      const ratcheting = working && returnedWork >= 0.4;
      const origins = shoulders.map((joint) =>
        joint.getWorldPosition(new THREE.Vector3()),
      );
      assert.ok(
        Math.abs(origins[0].distanceTo(origins[1]) - 0.42) < 1e-6,
        "repair shoulders separate",
      );
      for (const [side, glove] of gloves.entries()) {
        const elbow = elbows[side].getWorldPosition(new THREE.Vector3());
        const wrist = wrists[side].getWorldPosition(new THREE.Vector3());
        const lower = wrist.clone().sub(elbow);
        const upper = elbow.sub(origins[side]);
        assert.ok(
          Math.abs(upper.length() - 0.4608) < 1e-6,
          "repair upper arm stretches",
        );
        assert.ok(
          Math.abs(lower.length() - 0.4096) < 1e-6,
          "repair forearm stretches",
        );
        const flex = THREE.MathUtils.radToDeg(upper.angleTo(lower));
        assert.ok(
          flex >= 20 - 1e-6 && flex < 145,
          `repair elbow folds ${flex.toFixed(1)}°`,
        );
        const cuff = glove.localToWorld(new THREE.Vector3(0, -0.044, 0));
        assert.ok(wrist.distanceTo(cuff) < 1e-6, "sleeve separates in repair");
        if (ratcheting || c.result === "active") {
          const palm = new THREE.Vector3(0, 1, 0).transformDirection(
            glove.matrixWorld,
          );
          const bend = THREE.MathUtils.radToDeg(palm.angleTo(lower));
          assert.ok(
            bend < 75,
            `${side === 0 ? "bracing" : "working"} wrist bends ${bend.toFixed(1)}°`,
          );
        }
      }

      assert.ok(tool.visible, "wrench disappears during work or hand transfer");
      const socket = fastener.worldToLocal(
        tool.getWorldPosition(new THREE.Vector3()),
      );
      assert.ok(
        Math.hypot(socket.x, socket.y) < 1e-5 &&
          socket.z < -0.005 &&
          socket.z > -0.015,
        "socket must enclose the bolt head",
      );
      const outward = new THREE.Vector3(0, 0, 1).transformDirection(
        panel.matrixWorld,
      );
      const socketAxis = new THREE.Vector3(0, 0, 1).transformDirection(
        tool.matrixWorld,
      );
      assert.ok(
        outward.dot(socketAxis) > 0.999,
        "socket points across the bolt",
      );
      if (ratcheting) {
        const handle = new THREE.Vector3(1, 0, 0).transformDirection(
          tool.matrixWorld,
        );
        firstHandle ??= handle.clone();
        wrenchSweep = Math.max(wrenchSweep, firstHandle.angleTo(handle));
        if (frame % 30 === 0 || settledAt !== undefined) {
          assert.ok(
            castingDistance(bracePad()) < 0.008,
            "left palm floats off the casting",
          );
          for (const pad of [rightPalm(), ringFinger()]) {
            const local = tool.worldToLocal(pad.clone());
            assert.ok(
              local.x > 0.173 && local.x < 0.279 && toolDistance(pad) < 0.007,
              "hand misses the textured handle",
            );
          }
          braced = true;
        }
        if (settledAt !== undefined) {
          recovery = true;
          break;
        }
      }
      if (c.result === "active") {
        const orientation = tool.getWorldQuaternion(new THREE.Quaternion());
        parkedTool ??= orientation.clone();
        assert.ok(
          orientation.angleTo(parkedTool) < 1e-5,
          "unattended ratchet turns during calibration",
        );
      }
      if (
        c.result === "failed" &&
        resultAge > 0.48 &&
        Number.isFinite(resultAge)
      ) {
        assert.ok(
          ringDistance(fingertips[0]()) > 0.03,
          "failed grip never releases the ring",
        );
        withdrew = true;
      }
      if (c.result === "active" && c.elapsed > 0.35 && frame % 8 === 0) {
        assert.ok(
          toolDistance(rightPalm()) > 0.04,
          "right palm remains on the handle while pinching the ring",
        );
        firstRingAngle ??= ring.rotation.z;
        lastRingAngle = ring.rotation.z;
        const tips = fingertips.map((tip) => tip());
        const local = tips.map((tip) => ring.worldToLocal(tip.clone()));
        firstLocalTips ??= local.map((tip) => tip.clone());
        const radii = local.map((point) => Math.hypot(point.x, point.y));
        assert.ok(
          radii[0] - radii[1] > 0.02,
          "thumb and forefinger must oppose each other across the rim",
        );
        for (const [digit, tip] of tips.entries()) {
          assert.ok(
            ringDistance(tip) < 0.01,
            `${digit === 0 ? "thumb" : "index finger"} misses the ring`,
          );
          assert.ok(
            local[digit].distanceTo(firstLocalTips[digit]) < 0.012,
            "fingertip slips while turning the ring",
          );
        }
      }
    }
    assert.ok(
      braced && wrenchSweep > 0.4,
      "ratchet never completed a working stroke",
    );
    assert.ok(
      firstRingAngle !== undefined &&
        lastRingAngle !== undefined &&
        Math.abs(lastRingAngle - firstRingAngle) > 0.1,
      "ring did not turn between the fingertips",
    );
    assert.ok(
      settledAt !== undefined && recovery,
      `wrench did not return after ${expected}`,
    );
    if (expected === "failed")
      assert.ok(
        withdrew && reachedForHandle,
        "failed calibration must withdraw and reach for the handle again",
      );
    else
      assert.ok(
        confirmationTravel > 0.08,
        "the confirmation never presses the ring",
      );
    state.weapon.mode = "loading";
    rounds.present(state.weapon, hands, true, 0);
    repair.present(state, repair.resultAge(state));
    scene.updateMatrixWorld(true);
    assert.equal(panel.visible, false);
    assert.equal(tool.visible, false);
    assert.ok(hands.group.visible);
    for (const [side, glove] of gloves.entries())
      assert.ok(
        glove
          .getWorldPosition(new THREE.Vector3())
          .distanceTo(loadingPose[side]) < 1e-6,
        "loading grip changed after repair",
      );
  });
}
