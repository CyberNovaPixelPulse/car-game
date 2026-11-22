import * as THREE from "three";
import { TankCrewRig } from "./tank-crew-rig";

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, -1);
const scale = 1.2;
const sides = [
  { side: "left", sign: -1 },
  { side: "right", sign: 1 },
] as const;

/** The better fitted legacy sleeves meet this jacket at their shared shoulders. */
export class TankLoaderUniform {
  private readonly shoulders = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly ankle = new THREE.Vector3();
  private readonly knee = new THREE.Vector3();
  private readonly toes = new THREE.Vector3();
  private readonly inverse = new THREE.Quaternion();
  private readonly foot = new THREE.Quaternion();
  private readonly weightShift = new THREE.Quaternion();

  constructor(readonly rig: TankCrewRig) {
    rig.setFirstPerson(true);
    const arms = rig.root.getObjectByName("CrewArms");
    if (!arms) throw new Error("缺少裝填手的制服袖口接點。");
    arms.visible = false;
    const { left, right } = rig.bones;
    const a = left.upperArm.getWorldPosition(this.shoulders);
    const b = right.upperArm.getWorldPosition(this.position);
    rig.root.worldToLocal(a.lerp(b, 0.5));
    rig.root.scale.setScalar(scale);
    rig.root.name = "LoaderUniform";
  }

  pose(
    shoulders: THREE.Vector3,
    orientation: THREE.Quaternion,
    deckHeight: number,
    crouching = false,
    roll = 0,
  ) {
    const { root } = this.rig;
    this.rig.resetPose();
    root.quaternion
      .copy(orientation)
      .multiply(this.weightShift.setFromAxisAngle(FORWARD, roll));
    this.inverse.copy(root.quaternion).invert();
    this.forward.set(0, 0, -1).applyQuaternion(orientation);
    this.forward.y = 0;
    this.forward.normalize();
    this.right.crossVectors(this.forward, UP);
    root.position
      .copy(this.shoulders)
      .multiplyScalar(-scale)
      .applyQuaternion(root.quaternion)
      .add(shoulders);
    if (crouching) {
      root.position.y -= 1.06;
      root.position.addScaledVector(this.forward, -0.13);
    }
    this.toes.copy(this.forward).addScaledVector(UP, -0.14).normalize();
    this.foot.setFromUnitVectors(UP, this.toes.applyQuaternion(this.inverse));
    for (const { side, sign } of sides) {
      this.ankle
        .copy(root.position)
        .addScaledVector(this.right, sign * (crouching ? 0.23 : 0.16))
        .addScaledVector(this.forward, crouching ? -0.06 : 0.09);
      this.ankle.y = deckHeight + 0.095;
      this.ankle
        .sub(root.position)
        .applyQuaternion(this.inverse)
        .divideScalar(scale);
      this.knee.set(sign * 0.15, crouching ? 0.04 : -0.26, -0.53);
      this.rig.poseLeg(side, this.ankle, this.knee, this.foot);
    }
  }
}
