import * as THREE from "three";
import { LoaderHands } from "./tank-loader-hands";
import type { ShellType, WeaponState } from "./tank-weapons";

// Cup centres match the exported Blender rack. Every type has its own mesh
// throughout pickup, transport and insertion; only the chambered one is hidden.
const RACK = {
  he: { z: -0.12, paint: 0x627044 },
  ap: { z: -0.39, paint: 0x455769 },
  smoke: { z: -0.66, paint: 0xadb4a4 },
};
const LEFT_REST = new THREE.Vector3(0.72, 0.97, 1.39);
const RIGHT_REST = new THREE.Vector3(1.33, 1.05, 1.18);
const phase = THREE.MathUtils.smoothstep;

export class LoaderRounds {
  private rounds = new Map<ShellType, THREE.Group>();
  private wrist = new THREE.Vector3();
  private fingers = new THREE.Vector3();
  private palm = new THREE.Vector3();
  private previousShot = -1;
  private previouslyJammed = false;
  private jamChangedAt = -Infinity;

  constructor(
    parent: THREE.Object3D,
    makeShell: (paint: number) => THREE.Group,
  ) {
    for (const type of ["he", "ap", "smoke"] as const) {
      const round = makeShell(RACK[type].paint);
      parent.add(round);
      this.rounds.set(type, round);
    }
  }

  /** Only a change observed on this round starts a gesture. A restored view
   * immediately adopts the current pose, including an already stuck round. */
  jamTravel(w: WeaponState, time: number, working: boolean) {
    const active = w.jam.active;
    if (!working || w.chamber !== "loading") {
      this.previousShot = -1;
      this.jamChangedAt = -Infinity;
      return active ? 0.045 : 0;
    }
    if (this.previousShot !== w.shotsFired) this.jamChangedAt = -Infinity;
    else if (active !== this.previouslyJammed) this.jamChangedAt = time;
    this.previousShot = w.shotsFired;
    this.previouslyJammed = active;

    const t = THREE.MathUtils.clamp((time - this.jamChangedAt) / 0.28, 0, 1);
    // A short drive into the obstruction, then a firm grip throughout retries.
    if (active) return 0.045 * t + 0.095 * Math.sin(Math.PI * t);
    // A successful stop pulls the same round free and settles back into position.
    if (w.jam.result === "cleared")
      return 0.045 * (1 - t) - 0.11 * Math.sin(Math.PI * t);
    return 0;
  }

  present(
    w: WeaponState,
    hands: LoaderHands,
    canWork: boolean,
    jamTravel: number,
  ) {
    hands.group.visible = false;
    for (const [type, round] of this.rounds) {
      const inChamber = type === w.chamberShell;
      round.visible = !(inChamber && w.chamber === "loaded");
      const p = inChamber && w.chamber === "loading" ? w.loadProgress : 0;
      round.position.set(-1.4, 0.857, RACK[type].z);
      round.rotation.set(Math.PI / 2, 0, 0);
      if (!p) continue;
      // Lift upright out of the retention strap before swinging clear of the handwheel.
      const lift = phase(p, 0.16, 0.35);
      const swing = phase(p, 0.35, 0.62);
      const push = phase(p, 0.62, 0.9);
      round.position.x += 1.4 * swing;
      round.position.y +=
        0.67 * lift - 0.057 * swing + 0.12 * Math.sin(swing * Math.PI);
      round.position.z =
        THREE.MathUtils.lerp(RACK[type].z, 0.6, phase(p, 0.34, 0.49)) -
        1.59 * push;
      round.rotation.x *= 1 - swing;
      round.position.x += jamTravel;
      round.rotation.z -= jamTravel * 0.8;
      if (!canWork) continue;
      hands.group.visible = true;
      round.updateMatrixWorld();
      this.grip(hands, round, p);
    }
  }

  private grip(hands: LoaderHands, round: THREE.Object3D, p: number) {
    const reach = phase(p, 0, 0.16);
    const leftRelease = phase(p, 0.7, 0.82);
    const rightRelease = phase(p, 0.9, 1);
    // Each contact point and palm rotates with the carried round.
    this.wrist.set(0.087, -0.058, -0.14).applyMatrix4(round.matrixWorld);
    this.wrist.lerp(LEFT_REST, 1 - reach * (1 - leftRelease));
    this.fingers.set(0, 0, -1).transformDirection(round.matrixWorld);
    this.palm.set(-0.84, 0.54, 0).transformDirection(round.matrixWorld);
    hands.left.place(this.wrist, this.fingers, this.palm);

    const heel = phase(p, 0.49, 0.64);
    this.wrist
      .set(0.109 * (1 - heel), 0, 0.17 + 0.17 * heel)
      .applyMatrix4(round.matrixWorld);
    this.wrist.lerp(RIGHT_REST, 1 - reach * (1 - rightRelease));
    this.fingers.set(0, 1, 0).transformDirection(round.matrixWorld);
    this.palm.set(heel - 1, 0, -heel).transformDirection(round.matrixWorld);
    hands.right.place(this.wrist, this.fingers, this.palm);
  }
}
