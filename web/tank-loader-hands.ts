import * as THREE from "three";
import { INTERIOR_VIEW } from "./tank-battle-view";

const UP = new THREE.Vector3(0, 1, 0);
const SLEEVE_LENGTH = 0.4;

type FingerShape = {
  weights: number[];
  grip: number;
  pinch: number;
};

class GlovedArm {
  readonly glove = new THREE.Group();
  private upper = new THREE.Group();
  private fore = new THREE.Group();
  private shapes: FingerShape[] = [];
  private shoulder: THREE.Vector3;
  private elbow = new THREE.Vector3();
  private cuff = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private along = new THREE.Vector3();
  private back = new THREE.Vector3();
  private across = new THREE.Vector3();
  private basis = new THREE.Matrix4();

  constructor(
    private side: number,
    parent: THREE.Group,
  ) {
    this.glove.scale.setScalar(1.22);
    parent.add(this.upper, this.fore, this.glove);
    this.shoulder = new THREE.Vector3(
      INTERIOR_VIEW.eyeX + side * 0.32,
      1.04,
      INTERIOR_VIEW.eyeZ - side * 0.16,
    );
  }

  dress(hand: THREE.Object3D, fore: THREE.Object3D, upper: THREE.Object3D) {
    // Mirror only the clothing. The wrist basis and wrench socket stay right-handed.
    for (const [piece, anchor] of [
      [hand, this.glove],
      [fore, this.fore],
      [upper, this.upper],
    ]) {
      piece.scale.x *= this.side;
      anchor.add(piece);
      piece.traverse((part) => {
        if (!(part instanceof THREE.Mesh)) return;
        part.castShadow = part.receiveShadow = true;
        const keys = part.morphTargetDictionary;
        if (
          part.morphTargetInfluences &&
          keys?.Grip !== undefined &&
          keys.Pinch !== undefined
        )
          this.shapes.push({
            weights: part.morphTargetInfluences,
            grip: keys.Grip,
            pinch: keys.Pinch,
          });
      });
    }
  }

  place(
    wrist: THREE.Vector3,
    fingers: THREE.Vector3,
    palm: THREE.Vector3,
    grip: number,
    pinch = 0,
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
    for (const shape of this.shapes) {
      shape.weights[shape.grip] = grip;
      shape.weights[shape.pinch] = pinch;
    }

    // Place the end of the sleeve inside the glove opening even when the wrist bends.
    this.cuff
      .copy(wrist)
      .addScaledVector(this.along, -0.044 * this.glove.scale.y);
    this.elbow.lerpVectors(this.shoulder, this.cuff, 0.54);
    this.elbow.x += this.side * 0.19;
    this.elbow.y -= 0.22;
    this.direction.subVectors(this.elbow, this.cuff);
    const length = Math.min(this.direction.length(), 0.53);
    this.direction.normalize();
    // The elbow follows the hand through a turn. Keep the wrist from folding
    // backwards and exposing the hollow edge of the gauntlet.
    const forward = this.direction.dot(this.along);
    if (forward > -0.5) {
      this.direction
        .addScaledVector(this.along, -forward)
        .normalize()
        .multiplyScalar(Math.sqrt(0.75))
        .addScaledVector(this.along, -0.5);
    }
    this.elbow.copy(this.cuff).addScaledVector(this.direction, length);
    this.segment(this.upper, this.shoulder, this.elbow);
    this.segment(this.fore, this.elbow, this.cuff);
    // The cuff turns with the wrist as the palm rolls under the carried round.
    this.fore.quaternion
      .setFromUnitVectors(this.along, this.direction)
      .multiply(this.glove.quaternion);
  }

  private segment(anchor: THREE.Group, from: THREE.Vector3, to: THREE.Vector3) {
    this.direction.subVectors(to, from);
    anchor.position.copy(from).addScaledVector(this.direction, 0.5);
    anchor.scale.y = this.direction.length() / SLEEVE_LENGTH;
    anchor.quaternion.setFromUnitVectors(UP, this.direction.normalize());
  }
}

/** Both jobs use the same pair. The two hands share GPU art but deform independently. */
export class LoaderHands {
  readonly group = new THREE.Group();
  readonly left = new GlovedArm(-1, this.group);
  readonly right = new GlovedArm(1, this.group);
  ready = false;

  constructor() {
    this.group.visible = false;
  }

  dress(asset: THREE.Group) {
    const hand = asset.getObjectByName("WorkGlove");
    const fore = asset.getObjectByName("ForeSleeve");
    const upper = asset.getObjectByName("UpperSleeve");
    if (!hand || !fore || !upper) return false;
    this.left.dress(hand.clone(), fore.clone(), upper.clone());
    this.right.dress(hand, fore, upper);
    this.ready = true;
    return true;
  }
}
