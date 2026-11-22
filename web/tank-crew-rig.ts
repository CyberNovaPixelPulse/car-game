import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { disposeArt } from "./tank-art-materials";

export type CrewSide = "left" | "right";

function findBone(root: THREE.Object3D, name: string) {
  const bone = root.getObjectByName(
    THREE.PropertyBinding.sanitizeNodeName(name),
  );
  if (!(bone instanceof THREE.Bone)) throw new Error(`缺少乘員骨骼 ${name}`);
  return bone;
}

function sideBones(root: THREE.Object3D, suffix: "L" | "R") {
  return {
    upperArm: findBone(root, `UpperArm.${suffix}`),
    forearm: findBone(root, `Forearm.${suffix}`),
    hand: findBone(root, `Hand.${suffix}`),
    thigh: findBone(root, `Thigh.${suffix}`),
    shin: findBone(root, `Shin.${suffix}`),
    foot: findBone(root, `Foot.${suffix}`),
  };
}

const BONE_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * One owned full-body rig, in metres around the pelvis. Seat-specific code
 * positions the root, then supplies joint targets in its coordinates:
 * right +X, up +Y and forward -Z. The head is hidden only at first-person eyes.
 */
export class TankCrewRig {
  readonly bones;
  private readonly rest: {
    bone: THREE.Bone;
    position: THREE.Vector3;
    rotation: THREE.Quaternion;
  }[] = [];
  private readonly first = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly bend = new THREE.Vector3();
  private readonly middle = new THREE.Vector3();
  private readonly end = new THREE.Vector3();
  private readonly goal = new THREE.Vector3();
  private readonly origin = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();
  private readonly parent = new THREE.Quaternion();
  private readonly rotation = new THREE.Quaternion();
  private readonly align = new THREE.Quaternion();

  constructor(readonly root: THREE.Object3D) {
    this.bones = {
      pelvis: findBone(root, "Pelvis"),
      chest: findBone(root, "Chest"),
      neck: findBone(root, "Neck"),
      head: findBone(root, "Head"),
      left: sideBones(root, "L"),
      right: sideBones(root, "R"),
    };
    root.traverse((object) => {
      if (object instanceof THREE.Bone)
        this.rest.push({
          bone: object,
          position: object.position.clone(),
          rotation: object.quaternion.clone(),
        });
      // The original A-pose bounds would cull the lowered first-person hands.
      if (object instanceof THREE.SkinnedMesh) object.frustumCulled = false;
    });
  }

  static async load(manager: THREE.LoadingManager) {
    const asset = await new GLTFLoader(manager).loadAsync(
      "/assets/closeups/crew-body.glb",
    );
    try {
      return new TankCrewRig(asset.scene);
    } catch (error) {
      disposeArt(asset.scene);
      throw error;
    }
  }

  setFirstPerson(firstPerson: boolean) {
    const head = this.root.getObjectByName("CrewHeadMesh");
    if (head) head.visible = !firstPerson;
  }

  resetPose() {
    for (const { bone, position, rotation } of this.rest) {
      bone.position.copy(position);
      bone.quaternion.copy(rotation);
    }
  }

  poseArm(
    side: CrewSide,
    wrist: THREE.Vector3,
    elbowPole: THREE.Vector3,
    handOrientation?: THREE.Quaternion,
  ) {
    const { upperArm, forearm, hand } = this.bones[side];
    this.poseLimb(upperArm, forearm, hand, wrist, elbowPole, handOrientation);
  }

  poseLeg(
    side: CrewSide,
    ankle: THREE.Vector3,
    kneePole: THREE.Vector3,
    footOrientation?: THREE.Quaternion,
  ) {
    const { thigh, shin, foot } = this.bones[side];
    this.poseLimb(thigh, shin, foot, ankle, kneePole, footOrientation);
  }

  private poseLimb(
    upper: THREE.Bone,
    lower: THREE.Bone,
    tip: THREE.Bone,
    target: THREE.Vector3,
    pole: THREE.Vector3,
    tipOrientation: THREE.Quaternion | undefined,
  ) {
    const first = this.root.worldToLocal(upper.getWorldPosition(this.first));
    const direction = this.direction.subVectors(target, first);
    const distance = direction.length();
    if (distance < 1e-6) return;
    direction.divideScalar(distance);
    const upperLength = lower.position.length();
    const lowerLength = tip.position.length();
    // Clamp unreachable requests to a slightly bent limb. Never scale bones.
    const reach = THREE.MathUtils.clamp(
      distance,
      Math.abs(upperLength - lowerLength) + 0.001,
      upperLength + lowerLength - 0.001,
    );
    const a = (reach ** 2 + upperLength ** 2 - lowerLength ** 2) / (2 * reach);
    const b = Math.sqrt(Math.max(0, upperLength ** 2 - a ** 2));
    const bend = this.bend.subVectors(pole, first);
    bend.addScaledVector(direction, -bend.dot(direction));
    if (bend.lengthSq() < 1e-8) return;
    const middle = this.middle
      .copy(first)
      .addScaledVector(direction, a)
      .addScaledVector(bend.normalize(), b);
    const end = this.end.copy(first).addScaledVector(direction, reach);
    this.aimBone(upper, middle);
    this.aimBone(lower, end);
    if (tipOrientation) {
      this.root.getWorldQuaternion(this.rotation).multiply(tipOrientation);
      tip.parent!.getWorldQuaternion(this.parent).invert();
      tip.quaternion.copy(this.parent.multiply(this.rotation));
    }
  }

  private aimBone(bone: THREE.Bone, localTarget: THREE.Vector3) {
    this.root.localToWorld(this.goal.copy(localTarget));
    bone.getWorldPosition(this.origin);
    this.goal.sub(this.origin).normalize();
    bone.getWorldQuaternion(this.rotation);
    this.axis.copy(BONE_AXIS).applyQuaternion(this.rotation);
    this.align.setFromUnitVectors(this.axis, this.goal).multiply(this.rotation);
    bone.parent!.getWorldQuaternion(this.parent).invert();
    bone.quaternion.copy(this.parent.multiply(this.align));
  }
}
