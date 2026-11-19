import * as THREE from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { LOADER_ARM_SCALE } from "./tank-loader-body";
import { INTERIOR_VIEW } from "./tank-battle-view";

// Pose in the loader's neutral standing frame. Looking around the station must
// never drag the arms or the object the player is touching along with the head.
const eye = new THREE.Vector3(INTERIOR_VIEW.eyeX, 1.9, INTERIOR_VIEW.eyeZ);
const restAxis = new THREE.Vector3(0, 1, 0);
const hingeAxis = new THREE.Vector3(1, 0, 0);
const upperBind = 0.36;
const foreBind = 0.32;
const lengthRatio = upperBind / foreBind;
const garmentWidth = 1.22;
const clamp = THREE.MathUtils.clamp;

type BodyArm = {
  shoulder: THREE.Vector3;
  elbow: THREE.Vector3;
  cuff: THREE.Vector3;
  wrist: THREE.Vector3;
  fingers: THREE.Vector3;
  palm: THREE.Vector3;
};
const unit = new THREE.Vector3(1, 1, 1);
const upperOffset = new THREE.Vector3(0, upperBind, 0);
const foreOffset = new THREE.Vector3(0, foreBind, 0);

type Morph = { weights: number[]; index: number };

class GlovedArm {
  readonly glove = new THREE.Group();
  shoulderDrop = 1.46;
  private sleeve = new THREE.Group();
  private upper?: THREE.Bone;
  private fore?: THREE.Bone;
  private wristBone?: THREE.Bone;
  private grips: Morph[] = [];
  private pinches: Morph[] = [];
  private folds: Morph[] = [];
  private shoulder = new THREE.Vector3();
  private elbow = new THREE.Vector3();
  private cuff = new THREE.Vector3();
  private along = new THREE.Vector3();
  private back = new THREE.Vector3();
  private across = new THREE.Vector3();
  private shoulderRay = new THREE.Vector3();
  private elbowRay = new THREE.Vector3();
  private reach = new THREE.Vector3();
  private upperAxis = new THREE.Vector3();
  private foreAxis = new THREE.Vector3();
  private hinge = new THREE.Vector3();
  private inner = new THREE.Vector3();
  private roll = new THREE.Vector3();
  private scale = new THREE.Vector3();
  private origin = new THREE.Vector3();
  private bend = new THREE.Quaternion();
  private neutral = new THREE.Vector3();
  private neutralTurn = new THREE.Quaternion();
  private handHeading = new THREE.Vector3();
  private cuffTurn = new THREE.Quaternion();
  private basis = new THREE.Matrix4();
  private foreFrame = new THREE.Matrix4();
  private wristFrame = new THREE.Matrix4();

  constructor(
    private side: number,
    parent: THREE.Group,
    private standing: THREE.PerspectiveCamera,
  ) {
    this.glove.scale.setScalar(garmentWidth);
    this.sleeve.scale.x = side;
    this.neutral.set(0.5 * side, 0.6, -0.66).normalize();
    this.neutralTurn.setFromUnitVectors(restAxis, this.neutral);
    parent.add(this.sleeve, this.glove);
  }

  dress(hand: THREE.Object3D, sleeve: THREE.Object3D) {
    const upper = sleeve.getObjectByName("UpperArm");
    const fore = sleeve.getObjectByName("Forearm");
    const wrist = sleeve.getObjectByName("Wrist");
    if (!(
      upper instanceof THREE.Bone &&
      fore instanceof THREE.Bone &&
      wrist instanceof THREE.Bone
    ))
      return false;
    this.upper = upper;
    this.fore = fore;
    this.wristBone = wrist;
    for (const bone of [upper, fore, wrist]) bone.matrixAutoUpdate = false;
    hand.scale.x *= this.side;
    this.glove.add(hand);
    this.sleeve.add(sleeve);
    for (const piece of [sleeve, hand])
      piece.traverse((part) => {
        if (!(part instanceof THREE.Mesh)) return;
        part.castShadow = part.receiveShadow = true;
        // The bind-pose bounds don't enclose the elbow moving sideways in a reach.
        if (part instanceof THREE.SkinnedMesh) part.frustumCulled = false;
        const keys = part.morphTargetDictionary;
        const weights = part.morphTargetInfluences;
        if (!keys || !weights) return;
        if (keys.Grip !== undefined)
          this.grips.push({ weights, index: keys.Grip });
        if (keys.Pinch !== undefined)
          this.pinches.push({ weights, index: keys.Pinch });
        if (keys.ElbowFlex !== undefined)
          this.folds.push({ weights, index: keys.ElbowFlex });
      });
    return true;
  }

  place(
    wrist: THREE.Vector3,
    fingers: THREE.Vector3,
    palm: THREE.Vector3,
    grip: number,
    pinch = 0,
  ) {
    this.poseGlove(wrist, fingers, palm, grip, pinch);
    this.sleeve.scale.set(this.side, 1, 1);
    this.locateJoints();
    this.poseSleeve();
  }

  poseWork(arm: BodyArm, grip: number, pinch = 0) {
    this.poseGlove(arm.wrist, arm.fingers, arm.palm, grip, pinch);
    const scale = LOADER_ARM_SCALE;
    this.shoulder.copy(arm.shoulder);
    this.elbow.copy(arm.elbow);
    this.cuff.copy(arm.cuff);
    if (!this.upper || !this.fore || !this.wristBone) return;
    this.sleeve.position.copy(arm.shoulder);
    this.sleeve.scale.set(this.side * scale, scale, scale);
    this.upperAxis.subVectors(arm.elbow, arm.shoulder);
    this.foreAxis.subVectors(arm.cuff, arm.elbow);
    this.upperAxis.x *= this.side;
    this.foreAxis.x *= this.side;
    this.upperAxis.normalize();
    this.foreAxis.normalize();
    this.hinge.crossVectors(this.upperAxis, this.foreAxis).normalize();
    this.inner.crossVectors(this.hinge, this.upperAxis);
    this.bend.setFromRotationMatrix(
      this.basis.makeBasis(this.hinge, this.upperAxis, this.inner),
    );
    this.upper.matrix.compose(this.origin, this.bend, unit);
    const flex = this.upperAxis.angleTo(this.foreAxis);
    // The cuff and elbow are the original bind offsets. Flexion is a rotation
    // about the elbow's hinge, at the lengths authored in the Blender armature.
    this.cuffTurn.setFromAxisAngle(hingeAxis, flex);
    this.fore.matrix.compose(upperOffset, this.cuffTurn, unit);
    this.bend.multiply(this.cuffTurn);
    this.roll.copy(this.back);
    this.roll.x *= this.side;
    const twist = 0.9 * this.roll.dot(this.hinge);
    this.roll.copy(this.along);
    this.roll.x *= this.side;
    this.inner.crossVectors(this.foreAxis, this.roll);
    const swing = 0.44 * this.inner.length();
    this.roll.copy(this.inner).normalize().applyQuaternion(this.bend.invert());
    this.cuffTurn.setFromAxisAngle(this.roll, swing);
    this.bend.setFromAxisAngle(restAxis, twist);
    this.cuffTurn.multiply(this.bend);
    this.wristBone.matrix.compose(foreOffset, this.cuffTurn, unit);
    const compression = THREE.MathUtils.smoothstep(
      flex,
      Math.PI / 15,
      (11 * Math.PI) / 18,
    );
    for (const shape of this.folds) shape.weights[shape.index] = compression;
  }

  private poseGlove(
    wrist: THREE.Vector3,
    fingers: THREE.Vector3,
    palm: THREE.Vector3,
    grip: number,
    pinch: number,
  ) {
    this.back.copy(palm).normalize().negate();
    this.along
      .copy(fingers)
      .addScaledVector(this.back, -fingers.dot(this.back))
      .normalize();
    this.across.crossVectors(this.along, this.back);
    this.glove.quaternion.setFromRotationMatrix(
      this.basis.makeBasis(this.across, this.along, this.back),
    );
    this.glove.position.copy(wrist);
    for (const shape of this.grips) shape.weights[shape.index] = grip;
    for (const shape of this.pinches) shape.weights[shape.index] = pinch;
    this.cuff.copy(wrist).addScaledVector(this.along, -0.044 * garmentWidth);
  }

  private locateJoints() {
    const standing = this.standing;
    const eye = standing.position;
    const extended = THREE.MathUtils.smoothstep(
      this.cuff.distanceTo(eye),
      1.2,
      2.4,
    );
    // A retracted wrist can be closer than the near plane. Continue toward the
    // lap at a finite depth instead of flipping the projection behind the eye.
    const contact = this.reach
      .copy(this.cuff)
      .applyMatrix4(standing.matrixWorldInverse);
    contact.z = Math.min(-0.34, contact.z);
    this.handHeading
      .copy(this.along)
      .transformDirection(standing.matrixWorldInverse);
    const natural = this.roll
      .copy(contact)
      .addScaledVector(this.handHeading, -0.32);
    natural.z = Math.min(-0.34, natural.z);
    natural.applyMatrix4(standing.projectionMatrix);
    contact.applyMatrix4(standing.projectionMatrix);
    const rest = Math.max(0, -0.85 - contact.y);
    // In a cradle the forearm follows the heel of the palm. As the arm
    // extends, the elbow moves in between the wrist and the loader's shoulder.
    const offsetX = clamp(natural.x - contact.x, -0.26, 0.26);
    const offsetY = clamp(natural.y - contact.y, -0.36, 0.08);
    const nearX = contact.x + this.side * 0.14 + 0.5 * offsetX;
    const farX = THREE.MathUtils.lerp(contact.x, this.side * 0.38, 0.46);
    const x = clamp(
      THREE.MathUtils.lerp(nearX, farX, extended),
      this.side < 0 ? -0.62 : -0.37,
      this.side < 0 ? 0.2 : 0.39,
    );
    const nearY = contact.y - 0.3 + 0.48 * offsetY;
    const farY = THREE.MathUtils.lerp(contact.y, -1.4, 0.43);
    const y =
      clamp(THREE.MathUtils.lerp(nearY, farY, extended), -0.53, 0.12) - rest;
    this.elbowRay.set(x, y, 0).unproject(standing).sub(eye).normalize();
    this.shoulderRay
      .set(this.side * 0.34, -this.shoulderDrop - rest, 0)
      .unproject(standing)
      .sub(eye)
      .normalize();

    // Fit the reach between the work surface and the seated body. The palm
    // chooses the elbow depth as it rolls around the object.
    const offset = this.reach.subVectors(this.cuff, eye);
    const alongRay = offset.dot(this.elbowRay);
    const missSq = Math.max(0, offset.lengthSq() - alongRay * alongRay);
    const cosine = this.elbowRay.dot(this.shoulderRay);
    const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
    const inset = (alongRay * sine) / (lengthRatio + sine);
    const foreLength = Math.max(
      0.34,
      1.025 * Math.sqrt(missSq + inset * inset),
    );
    const projectedLength = Math.sqrt(Math.max(0, foreLength ** 2 - missSq));
    const baseline = this.foreAxis
      .copy(offset)
      .addScaledVector(this.elbowRay, -(alongRay - projectedLength))
      .normalize();
    const align =
      0.75 *
      (1 - THREE.MathUtils.smoothstep(baseline.dot(this.along), -0.38, 0.8));
    const neutralDepth = alongRay - this.along.dot(this.elbowRay) * foreLength;
    const elbowDepth = THREE.MathUtils.lerp(
      alongRay - projectedLength,
      neutralDepth,
      align,
    );
    this.elbow.copy(eye).addScaledVector(this.elbowRay, elbowDepth);
    const fore = this.foreAxis.subVectors(this.cuff, this.elbow);
    const posedLength = THREE.MathUtils.lerp(fore.length(), foreLength, 0.3);
    // A foreshortened forearm gets a stable direction from the palm heel as
    // well as its screen projection, even when elbow and wrist nearly coincide.
    const projectedFore = fore.length();
    const minimumAlong =
      0.23 * projectedFore + Math.max(0, 0.8 * foreLength - projectedFore);
    fore
      .addScaledVector(
        this.along,
        Math.max(0, minimumAlong - fore.dot(this.along)),
      )
      .normalize();
    this.elbow.copy(this.cuff).addScaledVector(fore, -posedLength);
    const elbowOffset = this.reach.subVectors(this.elbow, eye);
    const shoulderProjection = elbowOffset.dot(this.shoulderRay);
    const shoulderMissSq = Math.max(
      0,
      elbowOffset.lengthSq() - shoulderProjection ** 2,
    );
    const upperLength = Math.max(
      lengthRatio * posedLength,
      Math.sqrt(shoulderMissSq) * 1.025,
    );
    const shoulderDepth =
      shoulderProjection +
      (0.95 - 0.65 * extended) *
        Math.sqrt(Math.max(0, upperLength ** 2 - shoulderMissSq));
    this.shoulder
      .copy(eye)
      .addScaledVector(this.shoulderRay, shoulderDepth)
      .sub(this.elbow)
      .setLength(upperLength)
      .add(this.elbow);
    // At the beginning of a catch the resting hand can pass quite close to
    // the torso. Keep the upper arm outside the folded forearm.
    const upper = this.upperAxis
      .subVectors(this.elbow, this.shoulder)
      .normalize();
    const cosineFlex = upper.dot(fore);
    const maxFlex = -0.766; // cos(140 degrees)
    if (cosineFlex < maxFlex) {
      const away = this.roll.set(0, 1, 0);
      away.addScaledVector(fore, -away.dot(fore));
      upper
        .addScaledVector(fore, -cosineFlex)
        .addScaledVector(
          away,
          THREE.MathUtils.smoothstep(-cosineFlex, -maxFlex, 1) * 0.55,
        )
        .normalize()
        .multiplyScalar(Math.sqrt(1 - maxFlex * maxFlex))
        .addScaledVector(fore, maxFlex);
      this.shoulder.copy(this.elbow).addScaledVector(upper, -upperLength);
    }
  }

  private poseSleeve() {
    if (!this.upper || !this.fore || !this.wristBone) return;
    this.sleeve.position.copy(this.shoulder);
    this.upperAxis.subVectors(this.elbow, this.shoulder);
    this.foreAxis.subVectors(this.cuff, this.elbow);
    this.upperAxis.x *= this.side;
    this.foreAxis.x *= this.side;
    const upperLength = this.upperAxis.length();
    const foreLength = this.foreAxis.length();
    const clothWidth =
      garmentWidth *
      (1 + 0.25 * THREE.MathUtils.smoothstep(foreLength, 0.44, 0.92));
    this.upperAxis.normalize();
    this.foreAxis.normalize();
    // Transport the arm's rest frame through the reach. At full extension the
    // geometric bend plane can reverse across a single frame. A bounded roll
    // toward the inside of the elbow keeps the seam continuous there.
    this.bend
      .setFromUnitVectors(this.neutral, this.upperAxis)
      .multiply(this.neutralTurn);
    this.hinge.set(1, 0, 0).applyQuaternion(this.bend);
    const foldRoll = 1.35 * this.foreAxis.dot(this.hinge);
    this.cuffTurn.setFromAxisAngle(this.upperAxis, foldRoll);
    this.bend.premultiply(this.cuffTurn);
    const flex = THREE.MathUtils.smoothstep(
      this.upperAxis.angleTo(this.foreAxis),
      Math.PI / 15,
      (11 * Math.PI) / 18,
    );
    for (const shape of this.folds) shape.weights[shape.index] = flex;
    this.upper.matrix.compose(
      this.origin,
      this.bend,
      this.scale.set(clothWidth, upperLength / upperBind, clothWidth),
    );
    this.bend
      .setFromUnitVectors(this.neutral, this.foreAxis)
      .multiply(this.neutralTurn);
    this.cuffTurn.setFromAxisAngle(this.foreAxis, foldRoll);
    this.bend.premultiply(this.cuffTurn);
    this.hinge.set(1, 0, 0).applyQuaternion(this.bend);
    const joint = this.reach.copy(this.upperAxis).multiplyScalar(upperLength);
    this.foreFrame.compose(
      joint,
      this.bend,
      this.scale.set(clothWidth, foreLength / foreBind, clothWidth),
    );
    this.fore.matrix.copy(this.upper.matrix).invert().multiply(this.foreFrame);
    joint.addScaledVector(this.foreAxis, foreLength);
    // The end of the cuff rolls toward the back of the glove; the elbow
    // stays in its hinge plane during wrist pronation.
    this.roll.copy(this.back);
    this.roll.x *= this.side;
    const twist = 0.9 * this.roll.dot(this.hinge);
    this.cuffTurn.setFromAxisAngle(this.foreAxis, twist).multiply(this.bend);
    this.roll.copy(this.along);
    this.roll.x *= this.side;
    this.inner.crossVectors(this.foreAxis, this.roll);
    const swing = 0.44 * this.inner.length();
    this.bend.setFromAxisAngle(this.inner.normalize(), swing);
    this.cuffTurn.premultiply(this.bend);
    this.wristFrame.compose(
      joint,
      this.cuffTurn,
      this.scale.set(garmentWidth, foreLength / foreBind, garmentWidth),
    );
    this.wristBone.matrix
      .copy(this.foreFrame)
      .invert()
      .multiply(this.wristFrame);
  }
}

/** Both jobs use the same pair. Meshes share art, each arm owns its bone poses. */
export class LoaderHands {
  readonly group = new THREE.Group();
  private standing = new THREE.PerspectiveCamera(58, 16 / 9, 0.05, 16);
  readonly left = new GlovedArm(-1, this.group, this.standing);
  readonly right = new GlovedArm(1, this.group, this.standing);
  ready = false;
  constructor() {
    this.group.visible = false;
    this.standing.position.copy(eye);
    this.standing.lookAt(
      INTERIOR_VIEW.targetX,
      INTERIOR_VIEW.standingTargetY,
      INTERIOR_VIEW.targetZ,
    );
    this.standing.updateMatrixWorld();
  }

  frameTorso(zoom: number) {
    // Widening the lens on a narrow display exposes more of the lap. Keep
    // both sleeve attachments below that lower edge as the player reaches.
    this.left.shoulderDrop = this.right.shoulderDrop = 1.46 / zoom;
  }

  dress(asset: THREE.Group) {
    const hand = asset.getObjectByName("WorkGlove");
    const sleeve = asset.getObjectByName("SleevedArm");
    if (!hand || !sleeve) return false;
    this.ready =
      this.left.dress(hand.clone(), cloneSkeleton(sleeve)) &&
      this.right.dress(hand, sleeve);
    return this.ready;
  }
}
