import * as THREE from "three";
import rack from "./tank-loader-rack.json";
import { LoaderHands } from "./tank-loader-hands";
import type { ShellType, WeaponState } from "./tank-weapons";

// Cup centres match the exported Blender rack. Every type has its own mesh
// throughout pickup, transport and insertion; only the chambered one is hidden.
const SHELL_PAINT = { he: 0x627044, ap: 0x455769, smoke: 0xadb4a4 };
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
      const round = makeShell(SHELL_PAINT[type]);
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
      round.position.set(rack.x, rack.cupBaseY + 0.318, rack.z[type]);
      round.rotation.set(Math.PI / 2, 0, 0);
      if (!p) continue;
      // Lift upright out of the retention strap before swinging clear of the handwheel.
      const lift = phase(p, 0.16, 0.35);
      const swing = phase(p, 0.35, 0.62);
      const push = phase(p, 0.62, 0.9);
      // Draw the weight in toward the torso before the lead hand guides it into the breech.
      const carry = swing * (1 - phase(p, 0.55, 0.82));
      round.position.x = THREE.MathUtils.lerp(rack.x, 0, swing) + 0.95 * carry;
      round.position.y +=
        0.67 * lift - 0.057 * swing + 0.12 * Math.sin(swing * Math.PI);
      round.position.z =
        THREE.MathUtils.lerp(rack.z[type], 0.6, phase(p, 0.34, 0.49)) -
        1.59 * push +
        0.17 * carry;
      round.rotation.x *= 1 - swing;
      round.position.x += jamTravel;
      // The second hand takes the weight once, then both wrists level the round.
      const catchWeight = Math.sin(Math.PI * phase(p, 0.385, 0.55));
      round.position.y -= 0.032 * catchWeight;
      round.rotation.z += 0.07 * catchWeight - jamTravel * 0.8;
      if (!canWork) continue;
      hands.group.visible = true;
      round.updateMatrixWorld();
      this.grip(hands, round, p);
    }
  }

  private grip(hands: LoaderHands, round: THREE.Object3D, p: number) {
    const reach = phase(p, 0, 0.16);
    const guideRelease = phase(p, 0.7, 0.82);
    const baseRelease = phase(p, 0.9, 1);
    // Each contact point and palm rotates with the carried round.
    // Pick up above the retention strap, then slide to the carrying grip.
    const slide = phase(p, 0.22, 0.35);
    const guideContactZ = THREE.MathUtils.lerp(-0.38, -0.14, slide);
    const guideRadius = THREE.MathUtils.lerp(0.125, 0.13, slide);
    this.wrist
      .set(0.84 * guideRadius, -0.54 * guideRadius, guideContactZ)
      .applyMatrix4(round.matrixWorld);
    this.wrist.lerp(RIGHT_REST, 1 - reach * (1 - guideRelease));
    // Fingers cross the casing while the thumb opposes them on the near side.
    this.fingers.set(0.34, 0.53, -0.78).transformDirection(round.matrixWorld);
    this.palm.set(-0.84, 0.54, 0).transformDirection(round.matrixWorld);
    hands.right.place(
      this.wrist,
      this.fingers,
      this.palm,
      0.12 + 0.48 * reach * (1 - guideRelease),
    );

    // Slide to the rim first. Rotating diagonally through this corner would
    // carry the wrist through solid brass when moving from the side to the base.
    const toRim = phase(p, 0.48, 0.59);
    const heel = phase(p, 0.585, 0.7);
    const angle = (heel * Math.PI) / 2;
    const rimClearance = 0.028 + 0.008 * toRim * (1 - phase(heel, 0.1, 0.45));
    this.wrist
      .set(
        0.108 + rimClearance * Math.cos(angle) - 0.108 * phase(heel, 0.6, 1),
        -0.02,
        0.17 + 0.145 * toRim + 0.034 * Math.sin(angle),
      )
      .applyMatrix4(round.matrixWorld);
    // The free hand comes underneath after the round clears the fixed strap.
    const support = phase(p, 0.24, 0.39);
    this.wrist.lerp(LEFT_REST, 1 - support * (1 - baseRelease));
    this.fingers.set(0, 1, 0).transformDirection(round.matrixWorld);
    this.palm
      .set(-Math.cos(angle), 0, -Math.sin(angle))
      .transformDirection(round.matrixWorld);
    // The heel of the hand flattens for the final push into the breech.
    hands.left.place(
      this.wrist,
      this.fingers,
      this.palm,
      0.1 + 0.58 * support * (1 - heel) * (1 - baseRelease),
    );
  }
}
