import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { HeadOffset } from "./tank-camera-motion";
import { disposeArt } from "./tank-art-materials";
import { DRIVE } from "./tank-core";
import { TankCrewRig, type CrewSide } from "./tank-crew-rig";

const LEVER_X = 0.136;
const LEVER_Y = -0.566;
const LEVER_Z = -0.243;
const GRIP_HEIGHT = 0.423;
const GRIP_IN_HAND = new THREE.Vector3(0, 0.095, -0.032);
const FOOT_ROTATION = new THREE.Quaternion().setFromUnitVectors(
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -0.13, -0.9915).normalize(),
);
const sides = [
  { name: "left", sign: -1, key: DRIVE.left },
  { name: "right", sign: 1, key: DRIVE.right },
] as const;

/** The two steering levers, hands and boots share the armoured window's mount. */
export class TankDriverControls {
  readonly root = new THREE.Group();
  private readonly levers: Record<CrewSide, THREE.Group>;
  private readonly positions: Record<CrewSide, number> = { left: 0, right: 0 };
  private readonly grip = new THREE.Vector3();
  private readonly wrist = new THREE.Vector3();
  private readonly elbow = new THREE.Vector3();
  private readonly ankle = new THREE.Vector3();
  private readonly knee = new THREE.Vector3();
  private readonly xAxis = new THREE.Vector3();
  private readonly yAxis = new THREE.Vector3();
  private readonly zAxis = new THREE.Vector3();
  private readonly basis = new THREE.Matrix4();
  private readonly palm = new THREE.Quaternion();
  private previousTime: number | undefined;

  constructor(readonly rig: TankCrewRig) {
    rig.setFirstPerson(true);
    this.root.name = "DriverControls";
    const steel = new THREE.MeshStandardMaterial({
      color: 0x51564a,
      roughness: 0.71,
      metalness: 0.62,
    });
    const graphite = new THREE.MeshStandardMaterial({
      color: 0x292b24,
      roughness: 0.89,
    });
    const levers = {} as Record<CrewSide, THREE.Group>;
    for (const { name, sign } of sides) {
      const lever = new THREE.Group();
      lever.name = name === "left" ? "LeftSteeringLever" : "RightSteeringLever";
      lever.position.set(sign * LEVER_X, LEVER_Y, LEVER_Z);
      const base = new THREE.Mesh(
        new RoundedBoxGeometry(0.081, 0.044, 0.095, 3, 0.009),
        steel,
      );
      base.position.copy(lever.position);
      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.016, GRIP_HEIGHT, 14),
        steel,
      );
      rod.position.y = GRIP_HEIGHT / 2;
      const grip = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.018, 0.07, 5, 20),
        graphite,
      );
      grip.name = "SteeringGrip";
      grip.position.y = GRIP_HEIGHT;
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.021, 0.019, 0.012, 20),
        steel,
      );
      collar.position.y = GRIP_HEIGHT - 0.049;
      lever.add(rod, grip, collar);
      levers[name] = lever;
      this.root.add(base, lever);
    }
    this.levers = levers;
    this.root.add(rig.root);
    const lamp = new THREE.PointLight(0xf9ddae, 0.27, 1.1, 2);
    lamp.position.set(0.28, -0.105, 0.08);
    this.root.add(lamp);
    this.pose({ x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0 });
  }

  static async load(manager: THREE.LoadingManager, cancelled: () => boolean) {
    const rig = await TankCrewRig.load(manager);
    if (cancelled()) {
      disposeArt(rig.root);
      return undefined;
    }
    return new TankDriverControls(rig);
  }

  advance(time: number, keys: number) {
    const dt = time - (this.previousTime ?? time);
    this.previousTime = time;
    const amount = dt < 0 || dt > 0.35 ? 1 : 1 - Math.exp(-24 * dt);
    for (const { name, key } of sides) {
      const target = keys & key ? 1 : 0;
      this.positions[name] = THREE.MathUtils.lerp(
        this.positions[name],
        target,
        amount,
      );
      if (Math.abs(this.positions[name] - target) < 0.0001)
        this.positions[name] = target;
    }
    return `${this.positions.left}:${this.positions.right}`;
  }

  pose(offset: Readonly<HeadOffset>) {
    const { root, bones } = this.rig;
    this.rig.resetPose();
    // The wrists stay attached to the grips. Small transmitted forces move
    // the shoulders and knees in relation to the fixed cockpit and levers.
    root.position.set(offset.x * 0.48, -0.565 + offset.y * 0.36, 0.196);
    bones.chest.rotateX(-0.13 + offset.pitch * 0.85);
    bones.chest.rotateZ(offset.roll * 1.05);
    for (const { name, sign } of sides) {
      const angle = -this.positions[name] * 0.14;
      const lever = this.levers[name];
      lever.rotation.x = angle;
      this.grip
        .set(0, GRIP_HEIGHT, 0)
        .applyEuler(lever.rotation)
        .add(lever.position);
      // Hand Y points along its fingers. Rotate X along the lever so the
      // fingers wrap across its length and the palm faces inward.
      this.xAxis.set(0, -sign * Math.cos(angle), -sign * Math.sin(angle));
      this.yAxis.set(-sign * 0.18, 0, -1);
      this.yAxis
        .addScaledVector(this.xAxis, -this.yAxis.dot(this.xAxis))
        .normalize();
      this.zAxis.crossVectors(this.xAxis, this.yAxis);
      this.palm.setFromRotationMatrix(
        this.basis.makeBasis(this.xAxis, this.yAxis, this.zAxis),
      );
      this.wrist
        .copy(GRIP_IN_HAND)
        .applyQuaternion(this.palm)
        .multiplyScalar(-1)
        .add(this.grip)
        .sub(root.position);
      this.elbow.set(sign * 0.4, 0.05, -0.16);
      this.rig.poseArm(name, this.wrist, this.elbow, this.palm);
      this.ankle.set(sign * 0.17, -0.35, -0.55);
      this.knee.set(
        sign * (0.13 + offset.x * 0.6),
        0.25 + offset.y * 2.8,
        -0.42,
      );
      this.rig.poseLeg(name, this.ankle, this.knee, FOOT_ROTATION);
    }
  }
}
