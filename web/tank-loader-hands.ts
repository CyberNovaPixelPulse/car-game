import * as THREE from "three";
import { batchFixedParts } from "./tank-art-materials";
import { INTERIOR_VIEW } from "./tank-battle-view";

const UP = new THREE.Vector3(0, 1, 0);

class GlovedArm {
  readonly glove: THREE.Group;
  private upper: THREE.Mesh;
  private fore: THREE.Mesh;
  private shoulder: THREE.Vector3;
  private elbow = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private y = new THREE.Vector3();
  private z = new THREE.Vector3();
  private x = new THREE.Vector3();
  private basis = new THREE.Matrix4();

  constructor(
    private side: number,
    parent: THREE.Group,
    sleeve: THREE.Material,
    cuff: THREE.Material,
    leather: THREE.Material,
    seam: THREE.Material,
  ) {
    this.upper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.118, 1, 12),
      sleeve,
    );
    this.fore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.056, 0.087, 1, 12),
      sleeve,
    );
    this.glove = this.buildHand(side, leather, seam, cuff);
    this.glove.scale.setScalar(1.22);
    this.upper.castShadow = this.fore.castShadow = true;
    parent.add(this.upper, this.fore, this.glove);
    // The near end of each sleeve stays below the standing eye's field of view.
    this.shoulder = new THREE.Vector3(
      INTERIOR_VIEW.eyeX + side * 0.32,
      1.04,
      INTERIOR_VIEW.eyeZ - side * 0.16,
    );
  }

  place(wrist: THREE.Vector3, fingers: THREE.Vector3, palm: THREE.Vector3) {
    this.elbow.lerpVectors(this.shoulder, wrist, 0.54);
    this.elbow.x += this.side * 0.19;
    this.elbow.y -= 0.22;
    this.segment(this.upper, this.shoulder, this.elbow);
    this.segment(this.fore, this.elbow, wrist);
    this.z.copy(palm).normalize().negate();
    this.y
      .copy(fingers)
      .addScaledVector(this.z, -fingers.dot(this.z))
      .normalize();
    this.x.crossVectors(this.y, this.z);
    this.glove.quaternion.setFromRotationMatrix(
      this.basis.makeBasis(this.x, this.y, this.z),
    );
    this.glove.position.copy(wrist);
  }

  private segment(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3) {
    this.direction.subVectors(to, from);
    mesh.position.copy(from).addScaledVector(this.direction, 0.5);
    mesh.scale.y = this.direction.length();
    mesh.quaternion.setFromUnitVectors(UP, this.direction.normalize());
  }

  /** Gloved hand: palm faces local -Z, fingers point local +Y. */
  private buildHand(
    side: number,
    glove: THREE.Material,
    seam: THREE.Material,
    cuff: THREE.Material,
  ) {
    const hand = new THREE.Group();
    const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), glove);
    palm.scale.set(0.054, 0.059, 0.025);
    palm.position.y = 0.02;
    hand.add(palm);
    const wrist = new THREE.Mesh(
      new THREE.CylinderGeometry(0.048, 0.054, 0.08, 10),
      cuff,
    );
    wrist.position.y = -0.05;
    hand.add(wrist);
    // Four fingers in two joints, curled towards the palm as if gripping.
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 0.021;
      const length = [0.045, 0.05, 0.048, 0.038][i];
      const base = new THREE.Group();
      base.position.set(x, 0.068, 0);
      base.rotation.x = -0.45;
      const first = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.0105, length, 3, 8),
        glove,
      );
      first.position.y = length / 2;
      base.add(first);
      const tip = new THREE.Group();
      tip.position.y = length;
      tip.rotation.x = -0.75;
      const second = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.0095, length * 0.7, 3, 8),
        glove,
      );
      second.position.y = length * 0.35;
      tip.add(second);
      base.add(tip);
      hand.add(base);
    }
    const thumb = new THREE.Group();
    thumb.position.set(-side * 0.045, 0.0, -0.01);
    thumb.rotation.set(-0.5, 0, side * 0.9);
    const thumbMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.012, 0.05, 3, 8),
      glove,
    );
    thumbMesh.position.y = 0.03;
    thumb.add(thumbMesh);
    hand.add(thumb);
    // Stitched back seam reads as a work glove rather than a mitten.
    const stitch = new THREE.Mesh(
      new THREE.BoxGeometry(0.006, 0.08, 0.004),
      seam,
    );
    stitch.position.set(0, 0.02, 0.026);
    hand.add(stitch);
    hand.updateMatrixWorld(true);
    const parts: THREE.Mesh[] = [];
    hand.traverse((part) => {
      if (part instanceof THREE.Mesh) parts.push(part);
    });
    for (const part of parts) hand.attach(part);
    batchFixedParts(hand);
    hand.traverse((part) => {
      if (part instanceof THREE.Mesh) part.castShadow = true;
    });
    return hand;
  }
}

/** One pair of gloves shared by both jobs. Tools attach to the actual glove. */
export class LoaderHands {
  readonly group = new THREE.Group();
  readonly left: GlovedArm;
  readonly right: GlovedArm;
  constructor() {
    const cloth = new THREE.MeshStandardMaterial({
      color: 0x4f5947,
      roughness: 0.96,
    });
    const cuff = new THREE.MeshStandardMaterial({
      color: 0x555044,
      roughness: 1,
    });
    const leather = new THREE.MeshStandardMaterial({
      color: 0x83583b,
      roughness: 0.82,
    });
    const worn = new THREE.MeshStandardMaterial({
      color: 0xae8865,
      roughness: 0.96,
    });
    this.left = new GlovedArm(-1, this.group, cloth, cuff, leather, worn);
    this.right = new GlovedArm(1, this.group, cloth, cuff, leather, worn);
    this.group.visible = false;
  }
}
