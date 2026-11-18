import * as THREE from "three";

/**
 * The loader's own arms, seen from his eyes: he swings a round off the ready
 * rack, turns it nose-first behind the breech, shoves it in with both hands
 * and rams the last stretch home with his right fist. Purely presentation:
 * the pose is a function of the authoritative load progress.
 */
const UPPER = 0.33;
const FORE = 0.31;
const UP = new THREE.Vector3(0, 1, 0);

interface Arm {
  shoulder: THREE.Vector3;
  pole: THREE.Vector3;
  upper: THREE.Mesh;
  fore: THREE.Mesh;
  hand: THREE.Group;
}

export class LoaderHands {
  readonly group = new THREE.Group();
  private arms: Arm[];
  private materials: THREE.Material[] = [];
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private c = new THREE.Vector3();
  private m = new THREE.Matrix4();

  constructor() {
    const sleeve = this.mat(0x5a5a3c, 0.95);
    const cuff = this.mat(0x4a4a30, 0.95);
    const glove = this.mat(0x5b3d25, 0.75);
    const seam = this.mat(0x3b2716, 0.8);
    this.arms = [-1, 1].map((side) => {
      const upper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.058, 0.07, 1, 12),
        sleeve,
      );
      const fore = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.058, 1, 12),
        sleeve,
      );
      const hand = this.buildHand(side, glove, seam, cuff);
      for (const part of [upper, fore]) {
        part.castShadow = true;
        this.group.add(part);
      }
      this.group.add(hand);
      return {
        shoulder: new THREE.Vector3(),
        pole: new THREE.Vector3(side * 0.8, -1, 0.3).normalize(),
        upper,
        fore,
        hand,
      };
    });
    this.group.visible = false;
  }

  private mat(color: number, roughness: number) {
    const material = new THREE.MeshStandardMaterial({ color, roughness });
    this.materials.push(material);
    return material;
  }

  /** Gloved hand: palm faces local -Z, fingers point local +Y. */
  private buildHand(
    side: number,
    glove: THREE.Material,
    seam: THREE.Material,
    cuff: THREE.Material,
  ) {
    const hand = new THREE.Group();
    const palm = new THREE.Mesh(
      new THREE.BoxGeometry(0.085, 0.095, 0.035),
      glove,
    );
    palm.position.y = 0.02;
    hand.add(palm);
    const wrist = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.046, 0.07, 10),
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
    stitch.position.set(0, 0.02, 0.019);
    hand.add(stitch);
    hand.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    return hand;
  }

  /**
   * Pose both arms. `round` is the shell group (body along local Z, nose at -Z);
   * `progress` is the load progress 0..1; `shake` rattles a jammed round.
   * Returns the shell's pose so the scene can place it.
   */
  pose(
    camera: THREE.Camera,
    round: THREE.Object3D,
    progress: number,
    shake: number,
    crouching: boolean,
  ) {
    this.group.visible = true;
    const p = progress;
    const ease = (t: number) => t * t * (3 - 2 * t);
    const clamp = THREE.MathUtils.clamp;
    // Shell path: lift off the rack, turn nose-first, then shove it home.
    const lift = ease(clamp(p / 0.3, 0, 1));
    const align = ease(clamp((p - 0.3) / 0.15, 0, 1));
    const push = ease(clamp((p - 0.45) / 0.45, 0, 1));
    const ram = ease(clamp((p - 0.9) / 0.1, 0, 1));
    const rack = this.a.set(1.5, 1.0, 0.25);
    const top = this.b.set(1.05, 1.82, 0.95);
    const cradle = this.c.set(0.28, 1.56, 0.98);
    // Quadratic Bezier from the rack, over the top, to the cradle.
    const u = lift;
    round.position
      .copy(rack)
      .multiplyScalar((1 - u) * (1 - u))
      .addScaledVector(top, 2 * u * (1 - u))
      .addScaledVector(cradle, u * u);
    round.rotation.set(
      (Math.PI / 2) * (1 - lift),
      0.5 * (1 - align) * lift,
      0.3 * Math.sin(lift * Math.PI),
    );
    if (p > 0.3) {
      round.position.lerp(this.a.set(0, 1.47, 0.95), align);
      round.position.z = THREE.MathUtils.lerp(round.position.z, -0.25, push);
      round.position.z -= 0.25 * ram;
    }
    if (shake > 0) {
      round.position.x += Math.sin(shake * 61) * 0.012;
      round.position.y += Math.sin(shake * 47) * 0.01;
      round.rotation.z += Math.sin(shake * 53) * 0.04;
    }
    round.updateMatrixWorld();

    // Shoulders hang below and either side of the eye.
    camera.updateMatrixWorld();
    const eye = camera.getWorldPosition(this.a);
    const drop = crouching ? 0.22 : 0.3;
    this.arms[0].shoulder.set(eye.x - 0.2, eye.y - drop, eye.z + 0.08);
    this.arms[1].shoulder.set(eye.x + 0.2, eye.y - drop, eye.z + 0.02);

    const axis = this.b.set(0, 0, -1).transformDirection(round.matrixWorld);
    // Left hand cradles the case from below; it lets go for the final ram.
    const leftGrip = round.localToWorld(new THREE.Vector3(-0.03, -0.12, 0.02));
    const leftRest = new THREE.Vector3(0.75, 1.25, 1.0);
    const left = leftGrip.lerp(leftRest, ram);
    this.reach(
      this.arms[0],
      left,
      new THREE.Vector3().copy(axis).lerp(UP, 0.2).normalize(),
      UP,
    );
    // Right hand grips the base, then becomes a fist driving it forward.
    const right = round.localToWorld(new THREE.Vector3(0.0, 0.0, 0.345));
    if (ram > 0) right.addScaledVector(axis, -0.02 * ram);
    this.reach(this.arms[1], right, UP, axis);
    return round;
  }

  hide() {
    this.group.visible = false;
  }

  /** Two-bone arm from shoulder to hand, elbow bent towards the pole. */
  private reach(
    arm: Arm,
    target: THREE.Vector3,
    fingers: THREE.Vector3,
    palm: THREE.Vector3,
  ) {
    const reach = UPPER + FORE - 0.02;
    const toHand = target.clone().sub(arm.shoulder);
    let distance = toHand.length();
    // Out of reach: the loader leans in, so the shoulder follows the hand.
    if (distance > reach) {
      arm.shoulder.addScaledVector(toHand.normalize(), distance - reach);
      toHand.copy(target).sub(arm.shoulder);
      distance = reach;
    }
    const dir = toHand.clone().normalize();
    const along =
      (distance * distance + UPPER * UPPER - FORE * FORE) / (2 * distance);
    const lift = Math.sqrt(Math.max(0, UPPER * UPPER - along * along));
    const bend = arm.pole
      .clone()
      .addScaledVector(dir, -arm.pole.dot(dir))
      .normalize();
    const elbow = arm.shoulder
      .clone()
      .addScaledVector(dir, along)
      .addScaledVector(bend, lift);
    this.segment(arm.upper, arm.shoulder, elbow);
    this.segment(arm.fore, elbow, target);
    // Palm normal (-Z) faces `palm`; fingers (+Y) run along `fingers`.
    const z = palm.clone().negate().normalize();
    const y = fingers.clone().addScaledVector(z, -fingers.dot(z)).normalize();
    const x = new THREE.Vector3().crossVectors(y, z);
    arm.hand.quaternion.setFromRotationMatrix(this.m.makeBasis(x, y, z));
    arm.hand.position.copy(target);
  }

  private segment(mesh: THREE.Mesh, from: THREE.Vector3, to: THREE.Vector3) {
    const d = to.clone().sub(from);
    mesh.position.copy(from).addScaledVector(d, 0.5);
    mesh.scale.set(1, d.length(), 1);
    mesh.quaternion.setFromUnitVectors(UP, d.normalize());
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }
}
