import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { HeadOffset } from "./tank-camera-motion";
import { disposeArt } from "./tank-art-materials";
import { DRIVE } from "./tank-core";
import { TankCrewRig, type CrewSide } from "./tank-crew-rig";

const LEVER_CENTER_X = -0.055;
const LEVER_PIVOT_X = 0.112;
const HANDLE_X = 0.052;
const LEVER_Y = -0.575;
const LEVER_Z = -0.279;
const GRIP_HEIGHT = 0.423;
const GRIP_IN_HAND = new THREE.Vector3(0, 0.095, -0.032);
const UP = new THREE.Vector3(0, 1, 0);
const BACK = new THREE.Vector3(0, 0, 1);
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
  private readonly levers: Record<
    CrewSide,
    { pivot: THREE.Group; grip: THREE.Mesh }
  >;
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
  private readonly palmTilt = new THREE.Quaternion();
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
    const levers = {} as TankDriverControls["levers"];
    for (const { name, sign } of sides) {
      const lever = new THREE.Group();
      lever.name = name === "left" ? "LeftSteeringLever" : "RightSteeringLever";
      lever.position.set(
        LEVER_CENTER_X + sign * LEVER_PIVOT_X,
        LEVER_Y,
        LEVER_Z,
      );
      // Floor pivots straddle the driver's legs; the handles bend inward into
      // the clear part of the cockpit between the map and the work panel.
      const x = sign * (HANDLE_X - LEVER_PIVOT_X);
      const base = new THREE.Mesh(
        new RoundedBoxGeometry(0.081, 0.044, 0.095, 3, 0.009),
        steel,
      );
      base.position.copy(lever.position);
      const shaft = new THREE.Vector3(x, GRIP_HEIGHT, 0);
      const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.016, shaft.length(), 14),
        steel,
      );
      rod.position.copy(shaft).multiplyScalar(0.5);
      rod.quaternion.setFromUnitVectors(UP, shaft.normalize());
      const grip = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.018, 0.07, 5, 20),
        graphite,
      );
      grip.name = "SteeringGrip";
      grip.position.set(x, GRIP_HEIGHT, 0);
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.021, 0.019, 0.012, 20),
        steel,
      );
      collar.position.set(x, GRIP_HEIGHT - 0.049, 0);
      lever.add(rod, grip, collar);
      levers[name] = { pivot: lever, grip };
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
      const angle = -this.positions[name] * 0.08;
      const { pivot, grip } = this.levers[name];
      pivot.rotation.x = angle;
      this.grip
        .copy(grip.position)
        .applyEuler(pivot.rotation)
        .add(pivot.position);
      // Orient each palm inward around its lever, with the forearms angled
      // slightly upward from the handles.
      this.xAxis.set(0, -sign * Math.cos(angle), -sign * Math.sin(angle));
      this.yAxis.set(sign * 0.24, 0, -1);
      this.yAxis
        .addScaledVector(this.xAxis, -this.yAxis.dot(this.xAxis))
        .normalize();
      this.zAxis.crossVectors(this.xAxis, this.yAxis);
      this.palm
        .setFromRotationMatrix(
          this.basis.makeBasis(this.xAxis, this.yAxis, this.zAxis),
        )
        .multiply(this.palmTilt.setFromAxisAngle(BACK, -sign * 0.32));
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
