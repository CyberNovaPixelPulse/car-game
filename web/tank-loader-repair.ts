import * as THREE from "three";
import { disposeArt } from "./tank-art-materials";
import type { TankState } from "./tank-core";
import { LoaderBody, type LoaderHandTarget } from "./tank-loader-body";
import type { LoaderHands } from "./tank-loader-hands";
import { REPAIR_RULES } from "./tank-settings";

const smooth = THREE.MathUtils.smoothstep;
// Each pair matches one point on the fixture with its contact on the modeled glove.
// Glove coordinates are unscaled, with the left-hand mirror already applied.
const heel = new THREE.Vector3(0.0192, 0.0181, -0.0305);
const faceAtBrace = new THREE.Vector3(0.027, 0.035, -0.029);
const braceTurn = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(-0.046, -0.14, 0.15, "ZXY"),
);
const handle = new THREE.Vector3(0.226, 0, 0.032);
const gripCentre = new THREE.Vector3(0, 0.058, -0.032);
// Roll the hand around the grip axis so the knuckles lead into each stroke.
const handleTurn = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(1, 0, 0),
  -0.48,
);
const thumbPad = new THREE.Vector3(-0.0482, 0.089, -0.0446);
// At 80% Pinch the index pad is 32 mm from the thumb. Seat the thumb on
// the outer knurl and the index just inside the opposite beveled lip.
const outerLip = new THREE.Vector3(0.07766, -0.05189, 0.032);
const ringFingers = new THREE.Vector3(-0.94976, 0.30048, 0.08678).normalize();
const ringBack = new THREE.Vector3(-0.03578, -0.38002, 0.92421).normalize();
const ringTurn = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(
    new THREE.Vector3().crossVectors(ringFingers, ringBack).normalize(),
    ringFingers,
    ringBack,
  ),
);
const rimStep = (Math.PI * 2) / 16; // spacing between the modeled knurls
const ringAxis = new THREE.Vector3(0, 0, 1);
const wrenchGrip = 0.86;
const ringPinch = 0.8;

class HandTarget implements LoaderHandTarget {
  readonly wrist = new THREE.Vector3();
  readonly fingers = new THREE.Vector3();
  readonly palm = new THREE.Vector3();
  readonly rotation = new THREE.Quaternion();
  contact = 1;

  match(
    fixture: THREE.Object3D,
    fixturePoint: THREE.Vector3,
    handPoint: THREE.Vector3,
    localRotation: THREE.Quaternion,
    gloveScale: number,
  ) {
    fixture.getWorldQuaternion(this.rotation).multiply(localRotation);
    fixture.localToWorld(this.wrist.copy(fixturePoint));
    this.wrist.sub(
      this.palm
        .copy(handPoint)
        .multiplyScalar(gloveScale)
        .applyQuaternion(this.rotation),
    );
  }

  orient() {
    this.fingers.set(0, 1, 0).applyQuaternion(this.rotation);
    this.palm.set(0, 0, -1).applyQuaternion(this.rotation);
  }
}

function stroke(seconds: number) {
  return (
    -0.18 + 0.52 * Math.sin(seconds * 7.1) + 0.12 * Math.sin(seconds * 12.3)
  );
}

/** Contact points are children of the exported panel, shared with the artist's model. */
export class LoaderRepair {
  readonly body = new LoaderBody();
  private readonly left = new HandTarget();
  private readonly right = new HandTarget();
  private readonly pinch = new HandTarget();
  private readonly front = new THREE.Vector3();
  private observedAttempt?: number;
  private resultAt?: number;
  private parkedAttempt?: number;
  private parkedAngle = 0;
  private workAtFailure?: number;
  private ringStart = 0;
  private readonly rimPoint = new THREE.Vector3();
  private readonly rimTurn = new THREE.Quaternion();

  static bind(asset: THREE.Group, scene: THREE.Scene, hands: LoaderHands) {
    const panel = asset.getObjectByName("RepairPanel");
    const brace = asset.getObjectByName("Brace");
    const fastener = asset.getObjectByName("Fastener");
    const ring = asset.getObjectByName("AdjustmentRing");
    const tool = asset.getObjectByName("SocketWrench");
    if (!panel || !brace || !fastener || !ring || !tool) {
      disposeArt(asset);
      return;
    }
    asset.traverse((part) => {
      if (part instanceof THREE.Mesh)
        part.castShadow = part.receiveShadow = true;
    });
    scene.add(asset);
    panel.position.set(0.73, 1.49, 0.39);
    panel.rotation.y = 0.55;
    panel.visible = false;
    panel.updateWorldMatrix(true, true);
    // Leave the socket seated over the hex while the hand changes grips.
    fastener.add(tool);
    tool.position.set(0, 0, -0.01);
    ring.rotation.z = -0.48;
    tool.visible = false;
    return new LoaderRepair(panel, brace, ring, tool, hands);
  }

  private constructor(
    private readonly panel: THREE.Object3D,
    private readonly brace: THREE.Object3D,
    private readonly ring: THREE.Object3D,
    private readonly tool: THREE.Object3D,
    private readonly hands: LoaderHands,
  ) {
    this.body.setRepairStation(panel);
  }

  /** A mounted view may show the current attempt, but never replay a result it missed. */
  resultAge(state: TankState) {
    const { repair, weapon, time } = state;
    const c = repair.calibration;
    if (
      weapon.mode !== "repair" ||
      weapon.crouching ||
      time < weapon.stunnedUntil ||
      state.battle.failed ||
      state.battle.won ||
      repair.status === "moving"
    ) {
      this.observedAttempt = this.resultAt = undefined;
    } else if (c.result === "active") {
      this.observedAttempt = c.id;
      this.resultAt = undefined;
    } else if (this.observedAttempt === c.id && c.result !== "idle") {
      // Older hosts have no Space timestamp. Their observed successes are still valid.
      this.resultAt ??=
        c.confirmedAt ??
        (c.result === "failed"
          ? repair.failureUntil - REPAIR_RULES.failureWait
          : time);
      const age = time - this.resultAt;
      if (age >= 0 && age < (c.result === "failed" ? 0.58 : 0.43)) return age;
      this.observedAttempt = undefined;
    }
    return Infinity;
  }

  present(state: TankState, resultAge: number) {
    const { repair, weapon } = state;
    const c = repair.calibration;
    this.panel.visible = weapon.mode === "repair";
    const reacting = Number.isFinite(resultAge);
    const calibrating =
      c.result === "active" &&
      !weapon.crouching &&
      state.time >= weapon.stunnedUntil &&
      !state.battle.failed &&
      !state.battle.won;
    const onRing = calibrating || reacting;
    const working = repair.status === "repairing";
    const failed = c.result === "failed";
    if (reacting && failed) this.workAtFailure = repair.activeSeconds;
    const workSinceFailure =
      failed && this.parkedAttempt === c.id && this.workAtFailure !== undefined
        ? repair.activeSeconds - this.workAtFailure
        : Infinity;
    const waitingForGrip =
      workSinceFailure < 0.4 &&
      (repair.status === "waiting" || repair.status === "ready");
    this.tool.visible =
      this.panel.visible && (working || onRing || waitingForGrip);
    if (!this.panel.visible || (!working && !onRing)) return;

    const returnToTool = reacting && working;
    const returning = returnToTool ? smooth(resultAge, 0.11, 0.34) : 0;
    const released =
      reacting && !working
        ? smooth(resultAge, failed ? 0.22 : 0.1, failed ? 0.56 : 0.4)
        : 0;

    // Only credited work moves the ratchet. It stays seated at the last
    // stroke while the fingers operate the adjacent ring.
    const movingAngle = stroke(repair.activeSeconds);
    if (onRing && this.parkedAttempt !== c.id) {
      this.parkedAttempt = c.id;
      if (calibrating) this.workAtFailure = undefined;
      this.parkedAngle = stroke(Math.max(0, repair.activeSeconds - c.elapsed));
      this.ringStart = this.ring.rotation.z;
      // Regrasp at the upper right, clear of the parked handle. Whole knurl
      // spacings retain the same two contact surfaces on a partly turned dial.
      const offset =
        (2 - Math.round((this.ringStart + 0.48) / rimStep)) * rimStep;
      this.rimTurn.setFromAxisAngle(ringAxis, offset);
      this.rimPoint.copy(outerLip).applyQuaternion(this.rimTurn);
      this.rimTurn.multiply(ringTurn);
    }
    const ratcheting = onRing
      ? returnToTool
        ? smooth(resultAge, 0.34, 0.43)
        : 0
      : smooth(workSinceFailure, 0.24, 0.4);
    this.tool.rotation.z = THREE.MathUtils.lerp(
      this.parkedAngle,
      movingAngle,
      ratcheting,
    );

    const scale = this.hands.right.glove.scale.x;
    this.left.match(this.brace, faceAtBrace, heel, braceTurn, scale);
    this.right.match(this.tool, handle, gripCentre, handleTurn, scale);
    // After a failed adjustment both arms start below the bench. Replant the
    // brace and take up the handle before resuming the ratchet stroke.
    const reaching = onRing ? 1 : smooth(workSinceFailure, 0, 0.22);
    let grip = wrenchGrip * (onRing ? 1 : smooth(workSinceFailure, 0.15, 0.24));
    let pinch = 0;
    if (onRing) {
      const confirmed =
        c.confirmedAt !== undefined ||
        c.result === "success" ||
        c.result === "perfect";
      const elapsed = c.elapsed + (reacting && confirmed ? resultAge : 0);
      const fingerClosure = smooth(elapsed, 0.18, 0.26);
      const press =
        reacting && confirmed
          ? Math.sin(Math.PI * Math.min(resultAge / 0.14, 1))
          : 0;
      this.ring.rotation.z =
        this.ringStart +
        0.88 *
          THREE.MathUtils.clamp(
            (c.elapsed - 0.26) / (REPAIR_RULES.calibrationDuration - 0.26),
            0,
            1,
          ) +
        0.14 * press * fingerClosure;
      this.pinch.match(this.ring, this.rimPoint, thumbPad, this.rimTurn, scale);
      // Open the fingers before leaving the handle, arc above the casting,
      // then close around the rim. Reverse the transfer after a success.
      const outbound = smooth(elapsed, 0.04, 0.25);
      const travel = outbound * (1 - returning);
      this.front.set(0, 0, 1).transformDirection(this.panel.matrixWorld);
      this.right.wrist
        .lerp(this.pinch.wrist, travel)
        .addScaledVector(this.front, 0.06 * Math.sin(Math.PI * travel));
      this.right.rotation.slerp(this.pinch.rotation, travel);
      grip *= Math.max(
        1 - smooth(elapsed, 0, 0.09),
        returnToTool ? smooth(resultAge, 0.29, 0.36) : 0,
      );
      pinch =
        ringPinch *
        fingerClosure *
        (returnToTool ? 1 - smooth(resultAge, 0.08, 0.17) : 1);
    }
    this.left.orient();
    this.right.orient();
    this.left.contact = this.right.contact = (1 - released) * reaching;
    this.body.solveRepair(this.left, this.right);
    this.hands.group.visible = true;
    this.hands.left.poseWork(this.body.left, 0);
    this.hands.right.poseWork(
      this.body.right,
      grip * (1 - released),
      pinch * (1 - released),
    );
  }
}
