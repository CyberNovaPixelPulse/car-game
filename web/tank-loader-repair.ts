import * as THREE from "three";
import { disposeArt } from "./tank-art-materials";
import type { TankState } from "./tank-core";
import type { LoaderHands } from "./tank-loader-hands";
import { REPAIR_RULES } from "./tank-settings";

const smooth = THREE.MathUtils.smoothstep;
const RIGHT_REST = new THREE.Vector3(1.33, 1.03, 1.32);
const LEFT_REST = new THREE.Vector3(0.92, 0.99, 1.38);

/** Contact points are children of the exported panel, shared with the artist's model. */
export class LoaderRepair {
  private readonly wrist = new THREE.Vector3();
  private readonly toolWrist = new THREE.Vector3();
  private observedAttempt?: number;
  private resultAt?: number;
  private readonly tangent = new THREE.Vector3();
  private readonly fingers = new THREE.Vector3();
  private readonly palm = new THREE.Vector3();

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
    // The tool's origin is the open socket. The handle passes between palm and curled fingers.
    hands.right.glove.add(tool);
    tool.position.set(-0.162, 0.056, -0.066);
    tool.visible = false;
    return new LoaderRepair(panel, brace, fastener, ring, tool, hands);
  }

  private constructor(
    private readonly panel: THREE.Object3D,
    private readonly brace: THREE.Object3D,
    private readonly fastener: THREE.Object3D,
    private readonly ring: THREE.Object3D,
    private readonly tool: THREE.Object3D,
    private readonly hands: LoaderHands,
  ) {}

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
    const { repair } = state;
    const c = repair.calibration;
    const reacting = Number.isFinite(resultAge);
    const calibrating =
      c.result === "active" &&
      !state.weapon.crouching &&
      state.time >= state.weapon.stunnedUntil &&
      !state.battle.failed &&
      !state.battle.won;
    const onRing = calibrating || reacting;
    const working = repair.status === "repairing";
    this.panel.visible = state.weapon.mode === "repair";
    this.tool.visible = this.panel.visible && working && !onRing;
    if (!this.panel.visible || (!working && !onRing)) return;

    const failed = c.result === "failed";
    const withdraw = reacting
      ? smooth(resultAge, failed ? 0.26 : 0.08, failed ? 0.56 : 0.25)
      : 0;
    this.hands.group.visible = true;
    this.brace.getWorldPosition(this.wrist);
    this.wrist.addScaledVector(
      this.palm.set(0, 0, 1).transformDirection(this.panel.matrixWorld),
      0.033,
    );
    if (!working) this.wrist.lerp(LEFT_REST, withdraw);
    this.palm.negate();
    this.fingers.set(0, 1, 0);
    this.hands.left.place(this.wrist, this.fingers, this.palm);

    this.wrenchGrip(repair.activeSeconds);
    if (onRing) {
      this.toolWrist.copy(this.wrist);
      const confirmed =
        c.confirmedAt !== undefined ||
        c.result === "success" ||
        c.result === "perfect";
      const press =
        reacting && confirmed
          ? Math.sin(Math.PI * Math.min(resultAge / 0.13, 1))
          : 0;
      this.ring.rotation.z =
        -0.48 +
        0.88 * Math.min(c.elapsed / REPAIR_RULES.calibrationDuration, 1) +
        0.14 * press;
      this.wrist.set(0.094, -0.07, 0.096 - 0.034 * press);
      this.ring.localToWorld(this.wrist);
      this.fingers.set(-0.24, 1, 0).transformDirection(this.ring.matrixWorld);
      const reach = smooth(c.elapsed + (reacting ? resultAge * 2 : 0), 0, 0.2);
      this.wrist.lerp(this.toolWrist, 1 - reach).lerp(RIGHT_REST, withdraw);
      if (reacting && working)
        this.wrist.lerp(this.toolWrist, smooth(resultAge, 0.25, 0.43));
    }
    this.hands.right.place(this.wrist, this.fingers, this.palm);
  }

  private wrenchGrip(seconds: number) {
    // Ratchet about the fastener. Only work credited to the shared tank advances the stroke.
    const swing =
      -0.18 + 0.52 * Math.sin(seconds * 7.1) + 0.12 * Math.sin(seconds * 12.3);
    this.tangent
      .set(Math.cos(swing), Math.sin(swing), 0)
      .transformDirection(this.panel.matrixWorld);
    this.fingers
      .set(-Math.sin(swing), Math.cos(swing), 0)
      .transformDirection(this.panel.matrixWorld);
    this.fastener.getWorldPosition(this.wrist);
    const grip = this.tool.position;
    const scale = this.hands.right.glove.scale.x;
    this.wrist
      .addScaledVector(this.tangent, -grip.x * scale)
      .addScaledVector(this.fingers, -grip.y * scale)
      .addScaledVector(this.palm, grip.z * scale);
  }
}
