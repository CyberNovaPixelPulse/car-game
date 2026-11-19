import * as THREE from "three";
import { INTERIOR_VIEW } from "./tank-battle-view";

// Both segment lengths and the sleeve radius use one fixed scale from the bind pose.
export const LOADER_ARM_SCALE = 1.28;
export const LOADER_ARM_LENGTHS = {
  upper: 0.36 * LOADER_ARM_SCALE,
  fore: 0.32 * LOADER_ARM_SCALE,
} as const;

export interface LoaderHandTarget {
  wrist: THREE.Vector3;
  fingers: THREE.Vector3;
  palm: THREE.Vector3;
  contact: number;
}

const { upper, fore } = LOADER_ARM_LENGTHS;
// Keep a small bend even at the longest reach; the torso makes up the rest.
const reach = Math.sqrt(
  upper ** 2 + fore ** 2 + 2 * upper * fore * Math.cos(Math.PI / 9),
);
const cuffOffset = 0.044 * 1.22;
const halfShoulders = 0.21;
const homeEye = new THREE.Vector3(INTERIOR_VIEW.eyeX, 1.9, INTERIOR_VIEW.eyeZ);
const homeYaw = Math.atan2(
  INTERIOR_VIEW.eyeX - INTERIOR_VIEW.targetX,
  INTERIOR_VIEW.eyeZ - INTERIOR_VIEW.targetZ,
);
const neckOffset = new THREE.Vector3(0, 0.118, -0.008);
const eyeOffset = new THREE.Vector3(0, 0.267, -0.084);
const homeChest = homeEye
  .clone()
  .sub(eyeOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), homeYaw));
const clamp = THREE.MathUtils.clamp;
const smooth = THREE.MathUtils.smoothstep;

class BodyArm {
  readonly shoulder = new THREE.Vector3();
  readonly elbow = new THREE.Vector3();
  readonly cuff = new THREE.Vector3();
  readonly wrist = new THREE.Vector3();
  readonly fingers = new THREE.Vector3();
  readonly palm = new THREE.Vector3();

  private shoulderOffset = new THREE.Vector3();
  private restOffset = new THREE.Vector3();
  private restOrientation = new THREE.Quaternion();
  private handOrientation = new THREE.Quaternion();
  private targetOrientation = new THREE.Quaternion();
  private frame = new THREE.Matrix4();
  private direction = new THREE.Vector3();
  private bend = new THREE.Vector3();
  private cross = new THREE.Vector3();
  private back = new THREE.Vector3();

  // A fully planted hand constrains the chest to its reachable sphere.
  // A free hand imposes no constraint on where the character can stand.
  readonly reachCentre = new THREE.Vector3();
  reachRadius = Infinity;

  constructor(private readonly side: number) {
    this.direction.set(-side * 0.53, 0.2, -0.82).normalize();
    this.back.set(side, 0.12, 0).normalize();
    this.setHandFrame(this.direction, this.back, this.restOrientation);
  }

  private setHandFrame(
    fingers: THREE.Vector3,
    back: THREE.Vector3,
    orientation: THREE.Quaternion,
  ) {
    this.cross.crossVectors(fingers, back).normalize();
    this.direction.crossVectors(back, this.cross).normalize();
    orientation.setFromRotationMatrix(
      this.frame.makeBasis(this.cross, this.direction, back),
    );
  }

  prepare(input: LoaderHandTarget, weight: number, rotation: THREE.Quaternion) {
    this.shoulderOffset
      .set(this.side * halfShoulders, 0, 0)
      .applyQuaternion(rotation);
    this.restOffset
      .set(this.side * 0.3, -0.49, -0.21)
      .applyQuaternion(rotation);
    this.handOrientation.multiplyQuaternions(rotation, this.restOrientation);
    if (weight > 0) {
      this.back.copy(input.palm).normalize().negate();
      this.setHandFrame(input.fingers, this.back, this.targetOrientation);
      this.handOrientation.slerp(this.targetOrientation, weight);
    }
    this.fingers.set(0, 1, 0).applyQuaternion(this.handOrientation);
    this.palm.set(0, 0, -1).applyQuaternion(this.handOrientation);

    this.reachRadius =
      weight > 0 ? reach + (4 * (1 - weight)) / weight : Infinity;
    this.reachCentre
      .copy(input.wrist)
      .addScaledVector(this.fingers, -cuffOffset)
      .sub(this.shoulderOffset);
  }

  articulate(
    origin: THREE.Vector3,
    rotation: THREE.Quaternion,
    input: LoaderHandTarget,
    weight: number,
  ) {
    this.shoulder.copy(origin).add(this.shoulderOffset);
    this.cuff
      .copy(input.wrist)
      .addScaledVector(this.fingers, -cuffOffset)
      .sub(this.shoulder)
      .clampLength(0, reach)
      .add(this.shoulder);
    this.wrist
      .copy(origin)
      .add(this.restOffset)
      .addScaledVector(this.fingers, -cuffOffset);
    this.cuff.lerp(this.wrist, 1 - weight);
    this.direction.subVectors(this.cuff, this.shoulder);
    const requested = this.direction.length();
    if (requested > 1e-9) this.direction.divideScalar(requested);
    else this.direction.set(0, -1, 0).applyQuaternion(rotation);
    const d = clamp(requested, upper - fore + 0.001, reach);
    const along = (upper * upper - fore * fore + d * d) / (2 * d);
    const height = Math.sqrt(Math.max(0, upper * upper - along * along));

    this.bend.set(this.side * 0.82, -0.72, 0.39).applyQuaternion(rotation);
    this.bend.addScaledVector(this.direction, -this.bend.dot(this.direction));
    if (this.bend.lengthSq() < 1e-8) {
      this.cross.set(0, 0, 1).applyQuaternion(rotation);
      this.bend
        .crossVectors(this.direction, this.cross)
        .multiplyScalar(this.side);
    }
    // Swivel the elbow in its hinge plane to follow the hand. Fade the
    // correction when the two directions oppose each other to avoid a flip.
    this.bend.normalize();
    this.cross.copy(this.fingers).negate();
    this.cross.addScaledVector(this.direction, -this.cross.dot(this.direction));
    if (this.cross.lengthSq() > 1e-6) {
      this.cross.normalize();
      this.back.crossVectors(this.bend, this.cross);
      const alignment = this.bend.dot(this.cross);
      const angle = Math.atan2(this.back.dot(this.direction), alignment);
      const swivel = 0.72 * weight * smooth(alignment, -1, -0.7);
      this.bend.applyAxisAngle(this.direction, clamp(angle, -1, 1) * swivel);
    }
    this.elbow
      .copy(this.shoulder)
      .addScaledVector(this.direction, along)
      .addScaledVector(this.bend, height);
    this.cuff.copy(this.shoulder).addScaledVector(this.direction, d);
    this.wrist.copy(this.cuff).addScaledVector(this.fingers, cuffOffset);
  }
}

/** World-space torso and hand pose. Sampleable in any order when the action is
 * paused, restored or interrupted. The camera may turn independently of it. */
export class LoaderBody {
  readonly left = new BodyArm(-1);
  readonly right = new BodyArm(1);
  readonly origin = homeChest.clone();
  readonly rotation = new THREE.Quaternion();
  readonly forward = new THREE.Vector3();
  readonly up = new THREE.Vector3();
  readonly neck = new THREE.Vector3();
  readonly eye = homeEye.clone();
  private anchor = new THREE.Vector3();
  private behind = new THREE.Vector3();
  private angles = new THREE.Euler(0, 0, 0, "YXZ");
  private delta = new THREE.Vector3();
  private axis = new THREE.Vector3();

  solve(progress: number, left: LoaderHandTarget, right: LoaderHandTarget) {
    const active = progress > 0 && progress < 1;
    const wl = active ? clamp(left.contact, 0, 1) : 0;
    const wr = active ? clamp(right.contact, 0, 1) : 0;
    const weight = Math.max(wl, wr);
    let yaw = homeYaw;
    if (weight > 0) {
      this.anchor
        .copy(left.wrist)
        .multiplyScalar(wl)
        .addScaledVector(right.wrist, wr)
        .divideScalar(wl + wr);
      const facing = Math.atan2(
        homeChest.x - this.anchor.x,
        homeChest.z - this.anchor.z,
      );
      yaw += weight * clamp(0.45 * (facing - homeYaw), -0.18, 0.23);
    }
    const push = smooth(progress, 0.57, 0.88);
    const lean = weight * (0.14 + 0.1 * push);
    this.rotation.setFromEuler(this.angles.set(-lean, yaw, 0, "YXZ"));
    this.forward.set(0, 0, -1).applyQuaternion(this.rotation);
    this.up.set(0, 1, 0).applyQuaternion(this.rotation);
    this.origin.copy(homeChest);
    if (weight > 0) {
      this.behind.set(Math.sin(yaw), 0, Math.cos(yaw));
      this.anchor.addScaledVector(this.behind, 0.58 + 0.17 * push);
      this.anchor.x += 0.16 * Math.cos(yaw);
      this.anchor.z -= 0.16 * Math.sin(yaw);
      this.anchor.y = clamp(this.anchor.y + 0.36, 1.36, 1.79) - 0.33 * push;
      this.origin.lerp(this.anchor, weight);
    }
    this.left.prepare(left, wl, this.rotation);
    this.right.prepare(right, wr, this.rotation);
    this.fitChest();
    this.left.articulate(this.origin, this.rotation, left, wl);
    this.right.articulate(this.origin, this.rotation, right, wr);
    this.neck.copy(neckOffset).applyQuaternion(this.rotation).add(this.origin);
    this.eye.copy(eyeOffset).applyQuaternion(this.rotation).add(this.origin);
  }

  // Closest point to the desired chest inside both reach spheres. When moving
  // to either sphere alone violates the other, both wrists constrain the chest
  // to their intersection circle.
  private fitChest() {
    const a = this.left,
      b = this.right;
    const outsideA = this.origin.distanceTo(a.reachCentre) > a.reachRadius;
    const outsideB = this.origin.distanceTo(b.reachCentre) > b.reachRadius;
    if (!outsideA && !outsideB) return;
    for (const [near, far] of [
      [a, b],
      [b, a],
    ]) {
      const d = this.delta.subVectors(this.origin, near.reachCentre).length();
      if (d <= near.reachRadius) continue;
      this.delta.multiplyScalar(near.reachRadius / d).add(near.reachCentre);
      if (this.delta.distanceTo(far.reachCentre) <= far.reachRadius) {
        this.origin.copy(this.delta);
        return;
      }
    }
    this.axis.subVectors(b.reachCentre, a.reachCentre);
    const distance = this.axis.length();
    if (!distance) return;
    this.axis.divideScalar(distance);
    const axial = clamp(
      (a.reachRadius ** 2 - b.reachRadius ** 2 + distance ** 2) /
        (2 * distance),
      -a.reachRadius,
      a.reachRadius,
    );
    const radius = Math.sqrt(Math.max(0, a.reachRadius ** 2 - axial ** 2));
    this.anchor.copy(a.reachCentre).addScaledVector(this.axis, axial);
    this.delta.subVectors(this.origin, this.anchor);
    this.delta.addScaledVector(this.axis, -this.delta.dot(this.axis));
    this.origin
      .copy(this.anchor)
      .addScaledVector(this.delta.normalize(), radius);
  }
}
