import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { disposeArt } from "./tank-art-materials";
import { TankCrewRig } from "./tank-crew-rig";
import { LoaderBody, type LoaderHandTarget } from "./tank-loader-body";
import { LoaderHands } from "./tank-loader-hands";
import { TankLoaderUniform } from "./tank-loader-uniform";
import { FIRING_FEEDBACK, MG_RULES } from "./tank-settings";
import type { buildBrowning } from "./tank-vehicle-procedural";
import { loaderCanWork, type WeaponState } from "./tank-weapons";

type Browning = ReturnType<typeof buildBrowning>;
const phase = THREE.MathUtils.smoothstep;
const clamp = THREE.MathUtils.clamp;
const GRIP_PAD = 0.032 * 1.22;
const GRIP_REACH = 0.058 * 1.22;
const ENTER_SECONDS = 0.38;
const X = new THREE.Vector3(1, 0, 0);
const coverTab = new THREE.Vector3(0.065, 0.034, 0.34);
const feedTab = new THREE.Vector3(-0.038, 0.054, -0.15);
const slideTab = new THREE.Vector3(0.034, 0, 0);
const zero = new THREE.Vector3();

function handTarget(): LoaderHandTarget {
  return {
    wrist: new THREE.Vector3(),
    fingers: new THREE.Vector3(),
    palm: new THREE.Vector3(),
    contact: 0,
  };
}

export class TankLoaderMachineGun {
  readonly root = new THREE.Group();
  readonly body = new LoaderBody();
  private readonly left = handTarget();
  private readonly right = handTarget();
  private readonly transfer = handTarget();
  private readonly chest = new THREE.Vector3();
  private readonly contact = new THREE.Vector3();
  private readonly orientation = new THREE.Quaternion();
  private readonly inverseRoot = new THREE.Quaternion();
  private readonly bodyLean = new THREE.Quaternion();
  private entryAt?: number;

  constructor(
    private readonly gun: Browning,
    private readonly uniform: TankLoaderUniform,
    private readonly hands: LoaderHands,
  ) {
    this.root.name = "LoaderMachineGunOperator";
    this.root.add(uniform.rig.root, hands.group);
  }

  static async load(
    gun: Browning,
    manager: THREE.LoadingManager,
    cancelled: () => boolean,
  ) {
    const [rig, gloves] = await Promise.allSettled([
      TankCrewRig.load(manager),
      new GLTFLoader(manager).loadAsync("/assets/closeups/loader-gloves.glb"),
    ]);
    const hands = new LoaderHands();
    let attached = false;
    try {
      if (cancelled()) return;
      if (rig.status !== "fulfilled" || gloves.status !== "fulfilled")
        throw new Error("無法載入車頂機槍動作。");
      const uniform = new TankLoaderUniform(rig.value);
      if (!hands.dress(gloves.value.scene))
        throw new Error("無法載入車頂機槍手套。");
      const operator = new TankLoaderMachineGun(gun, uniform, hands);
      attached = true;
      return operator;
    } finally {
      if (!attached) {
        const sources: THREE.Object3D[] = [hands.group];
        if (rig.status === "fulfilled") sources.push(rig.value.root);
        if (gloves.status === "fulfilled") sources.push(gloves.value.scene);
        disposeArt(sources);
      }
    }
  }

  leave() {
    this.entryAt = undefined;
  }

  stamp(weapon: WeaponState, time: number) {
    if (weapon.mode !== "machine-gun") {
      this.leave();
      return "inactive";
    }
    if (this.entryAt === undefined || time < this.entryAt) this.entryAt = time;
    const moving =
      time - this.entryAt < ENTER_SECONDS ||
      time < (weapon.mg.belt?.reloadUntil ?? 0) ||
      time < weapon.mg.coolUntil ||
      time < weapon.mg.flashUntil;
    return `${weapon.mg.shots}:${weapon.mg.belt?.rounds}:${moving ? time : "ready"}`;
  }

  present(weapon: WeaponState, time: number) {
    this.root.visible = weapon.mode === "machine-gun";
    if (!this.root.visible) return;
    const { mg } = weapon;
    const reloadUntil = mg.belt?.reloadUntil ?? 0;
    const reloading = time < reloadUntil;
    const reload = reloading
      ? clamp(1 - (reloadUntil - time) / MG_RULES.reload, 0, 1)
      : 0;
    const openCover =
      phase(reload, 0.13, 0.34) * (1 - phase(reload, 0.62, 0.8));
    const reachFeed =
      phase(reload, 0.18, 0.36) * (1 - phase(reload, 0.64, 0.83));
    const insert = phase(reload, 0.36, 0.62);
    const reachingCover =
      phase(reload, 0, 0.13) * (1 - phase(reload, 0.76, 0.85));
    const reachingSlide =
      phase(reload, 0.75, 0.86) * (1 - phase(reload, 0.92, 1));
    const charging =
      phase(reload, 0.83, 0.94) * (1 - phase(reload, 0.94, 0.99));
    const coolingRemaining = mg.coolUntil - time;
    const waiting =
      phase(MG_RULES.cooldown - coolingRemaining, 0, 0.24) *
      phase(coolingRemaining, 0, 0.23) *
      (1 - Math.max(reachingCover, reachingSlide));
    const arrival = phase(time - (this.entryAt ?? time), 0, ENTER_SECONDS);
    const contact = loaderCanWork(weapon, time) ? arrival : 0;
    const shotAge = time - (mg.flashUntil - FIRING_FEEDBACK.machineGun);
    const kick =
      mg.shots > 0 && shotAge >= 0 && time < mg.flashUntil
        ? Math.sin(Math.PI * clamp(shotAge / FIRING_FEEDBACK.machineGun, 0, 1))
        : 0;
    this.gun.cover.rotation.x = -1.12 * openCover;
    this.gun.slide.position.z = -0.06 + 0.08 * charging + 0.022 * kick;
    this.gun.belt.position.x = reloading ? -0.14 * (1 - insert) : 0.025 * kick;
    const visibleRounds =
      reloading && reload >= 0.32
        ? this.gun.links.length
        : (mg.belt?.rounds ?? MG_RULES.beltCapacity);
    this.gun.links.forEach((link, i) => (link.visible = i < visibleRounds));

    this.target(this.left, this.gun.leftGrip, zero, -1);
    this.target(this.right, this.gun.rightGrip, zero, 1);
    this.right.wrist.y -= (0.11 - 0.025 * kick) * waiting;
    this.right.wrist.x += 0.06 * waiting;
    this.right.wrist.z += 0.06 * waiting;
    if (reachFeed) {
      this.target(this.transfer, this.gun.belt, feedTab, -1, true);
      this.transferTo(this.left, reachFeed);
    }
    if (reachingCover) {
      this.target(this.transfer, this.gun.cover, coverTab, 1, true);
      this.transferTo(this.right, reachingCover);
    }
    if (reachingSlide) {
      this.target(this.transfer, this.gun.slide, slideTab, 1);
      this.transferTo(this.right, reachingSlide);
    }
    this.left.contact = this.right.contact = contact;
    const lean = Math.max(reachFeed, reachingCover, reachingSlide);
    this.chest.set(0.035, -0.25 - lean * 0.06, 0.1 - lean * 0.23);
    this.bodyLean.setFromAxisAngle(X, -0.12 - 0.19 * lean);
    this.body.setMachineGunStation(this.chest, this.bodyLean);
    this.body.solveStation(this.left, this.right);
    this.uniform.pose(this.chest, this.bodyLean, -1.42);
    this.hands.group.visible = true;
    this.hands.left.poseWork(
      this.body.left,
      (0.72 - 0.34 * reachFeed) * contact,
    );
    this.hands.right.poseWork(
      this.body.right,
      (0.72 - 0.44 * waiting - 0.25 * Math.max(reachingCover, reachingSlide)) *
        contact,
    );
  }

  private target(
    hand: LoaderHandTarget,
    part: THREE.Object3D,
    tab: THREE.Vector3,
    side: number,
    fromAbove = false,
  ) {
    this.root.getWorldQuaternion(this.inverseRoot).invert();
    this.orientation
      .copy(part.getWorldQuaternion(this.orientation))
      .premultiply(this.inverseRoot);
    hand.fingers
      .set(-side, fromAbove ? -0.26 : 0.04, fromAbove ? -0.3 : -0.08)
      .normalize()
      .applyQuaternion(this.orientation);
    hand.palm
      .set(0, fromAbove ? -0.92 : -0.07, fromAbove ? -0.39 : -1)
      .normalize()
      .applyQuaternion(this.orientation);
    hand.fingers
      .addScaledVector(hand.palm, -hand.fingers.dot(hand.palm))
      .normalize();
    part.localToWorld(this.contact.copy(tab));
    this.root.worldToLocal(this.contact);
    hand.wrist
      .copy(this.contact)
      .addScaledVector(hand.fingers, -GRIP_REACH)
      .addScaledVector(hand.palm, -GRIP_PAD);
  }

  private transferTo(hand: LoaderHandTarget, weight: number) {
    hand.wrist.lerp(this.transfer.wrist, weight);
    hand.palm.lerp(this.transfer.palm, weight).normalize();
    hand.fingers.lerp(this.transfer.fingers, weight).normalize();
  }
}
