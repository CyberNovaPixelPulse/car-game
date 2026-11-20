import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { disposeArt } from "./tank-art-materials";
import { TankCrewRig } from "./tank-crew-rig";
import type { HeadOffset } from "./tank-camera-motion";
import type { TankState } from "./tank-core";

const PALM_GRIP = new THREE.Vector3(0, 0.095, -0.032);
const BOOT_ROTATION = new THREE.Quaternion().setFromUnitVectors(
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -0.13, -0.9915).normalize(),
);
const controls = [
  {
    side: "left",
    sign: -1,
    axis: "yaw",
    name: "Traverse",
    x: -0.114,
    y: -0.18,
    radius: 0.044,
    crank: 0.03,
    phase: 0.44,
    ratio: -6,
  },
  {
    side: "right",
    sign: 1,
    axis: "pitch",
    name: "Elevation",
    x: -0.016,
    y: -0.19,
    radius: 0.039,
    crank: 0.023,
    phase: -0.5,
    ratio: 7,
  },
] as const;
type Control = (typeof controls)[number];

function handwheel(
  control: Control,
  paint: THREE.MeshStandardMaterial,
  steel: THREE.MeshStandardMaterial,
  rubber: THREE.MeshStandardMaterial,
) {
  const mount = new THREE.Group();
  const { radius, crank, name } = control;
  mount.name = `${name}Housing`;
  mount.position.set(control.x, control.y, -0.528);
  const housing = new THREE.Mesh(
    new THREE.CylinderGeometry(radius + 0.006, radius + 0.014, 0.038, 24),
    paint,
  );
  housing.rotation.x = Math.PI / 2;
  housing.position.z = -0.015;
  mount.add(housing);

  const wheel = new THREE.Group();
  wheel.name = `${name}Wheel`;
  wheel.position.z = 0.016;
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.0055, 12, 36),
    steel,
  );
  wheel.add(rim);
  for (const turn of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
    const spoke = new THREE.Mesh(
      new RoundedBoxGeometry(0.012, radius, 0.008, 2, 0.0025),
      paint,
    );
    spoke.position.set(
      -Math.sin(turn) * radius * 0.5,
      Math.cos(turn) * radius * 0.5,
      0,
    );
    spoke.rotation.z = turn;
    wheel.add(spoke);
  }
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.014, 12),
    steel,
  );
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.009, 0.011, 0.045, 16),
    steel,
  );
  shaft.rotation.x = Math.PI / 2;
  shaft.position.set(0, crank, 0.022);
  const handle = new THREE.Mesh(
    new THREE.SphereGeometry(0.019, 16, 12),
    rubber,
  );
  handle.name = `${name}Handle`;
  handle.position.set(0, crank, 0.052);
  wheel.add(shaft, handle);
  mount.add(wheel);
  return { mount, wheel, handle };
}

/** The two crank wheels and their hands share the sight's nominal local frame. */
export class TankGunnerControls {
  readonly root = new THREE.Group();
  private readonly wheels: Record<
    Control["axis"],
    ReturnType<typeof handwheel>
  >;
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

  constructor(readonly rig: TankCrewRig) {
    this.root.name = "GunnerControls";
    rig.setFirstPerson(true);
    const paint = new THREE.MeshStandardMaterial({
      color: 0x414636,
      roughness: 0.84,
      metalness: 0.28,
    });
    const steel = new THREE.MeshStandardMaterial({
      color: 0x68665a,
      roughness: 0.67,
      metalness: 0.58,
    });
    const rubber = new THREE.MeshStandardMaterial({
      color: 0x292822,
      roughness: 0.88,
    });
    const plate = new THREE.Mesh(
      new RoundedBoxGeometry(0.268, 0.27, 0.053, 3, 0.012),
      paint,
    );
    plate.name = "GunnerGearbox";
    plate.position.set(-0.075, -0.29, -0.558);
    const bottom = new THREE.Mesh(
      new RoundedBoxGeometry(0.291, 0.048, 0.081, 3, 0.008),
      steel,
    );
    bottom.position.set(-0.075, -0.388, -0.538);

    const wheels = {} as TankGunnerControls["wheels"];
    for (const control of controls) {
      const wheel = handwheel(control, paint, steel, rubber);
      wheels[control.axis] = wheel;
      this.root.add(wheel.mount);
    }
    this.wheels = wheels;
    const lamp = new THREE.PointLight(0xf6ddb5, 0.38, 1.1, 2);
    lamp.position.set(0.18, 0.04, -0.17);
    this.root.add(plate, bottom, rig.root, lamp);
  }

  static async load(manager: THREE.LoadingManager, cancelled: () => boolean) {
    const rig = await TankCrewRig.load(manager);
    if (cancelled()) {
      disposeArt(rig.root);
      return undefined;
    }
    return new TankGunnerControls(rig);
  }

  pose(turret: TankState["turret"], offset: Readonly<HeadOffset>) {
    const { root, bones } = this.rig;
    this.rig.resetPose();
    root.position.set(-0.045 + offset.x * 0.45, -0.554 + offset.y * 0.4, 0.016);
    bones.chest.rotateX(-0.12 + turret.pitchRate * 0.075 + offset.pitch * 0.72);
    bones.chest.rotateZ(turret.yawRate * 0.045 + offset.roll * 0.84);
    for (const control of controls) {
      const { side, sign, axis, phase, ratio } = control;
      const { wheel, handle } = this.wheels[axis];
      // The traverse ratio is integral so a wrap of the authoritative yaw
      // cannot make the wheel or wrist jump. Release settles with the turret.
      wheel.rotation.z = phase + turret[axis] * ratio;
      this.yAxis.set(-sign * 0.075, 0.29, -1).normalize();
      this.xAxis.set(0, -sign, 0);
      this.xAxis
        .addScaledVector(this.yAxis, -this.xAxis.dot(this.yAxis))
        .normalize();
      this.zAxis.crossVectors(this.xAxis, this.yAxis);
      this.palm.setFromRotationMatrix(
        this.basis.makeBasis(this.xAxis, this.yAxis, this.zAxis),
      );
      this.wrist.copy(PALM_GRIP).applyQuaternion(this.palm).multiplyScalar(-1);
      this.wrist
        .add(this.grip.copy(handle.position).applyEuler(wheel.rotation))
        .add(wheel.position)
        .add(wheel.parent!.position)
        .sub(root.position);
      this.elbow.set(sign * 0.23, -0.025, -0.21);
      this.rig.poseArm(side, this.wrist, this.elbow, this.palm);
      this.ankle.set(sign * 0.165, -0.44, -0.47);
      this.knee.set(sign * 0.16, 0.11, -0.38);
      this.rig.poseLeg(side, this.ankle, this.knee, BOOT_ROTATION);
    }
  }
}
