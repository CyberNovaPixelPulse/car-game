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
    followReach = true,
  ) {
    hands.group.visible = false;
    hands.leanToward();
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
      round.position.x = THREE.MathUtils.lerp(rack.x, 0, swing) + 0.62 * carry;
      round.position.y +=
        0.085 * carry +
        0.67 * lift -
        0.057 * swing +
        0.12 * Math.sin(swing * Math.PI);
      round.position.z =
        THREE.MathUtils.lerp(rack.z[type], 0.6, phase(p, 0.34, 0.49)) -
        1.59 * push +
        0.1 * carry;
      round.rotation.x *= 1 - swing;
      round.position.x += jamTravel;
      // The second hand takes the weight once, then both wrists level the round.
      const catchWeight = Math.sin(Math.PI * phase(p, 0.385, 0.55));
      round.position.y -= 0.032 * catchWeight;
      round.rotation.z += 0.07 * catchWeight - jamTravel * 0.8;
      if (!canWork) continue;
      hands.group.visible = true;
      round.updateMatrixWorld();
      if (followReach) {
        const lean = phase(p, 0, 0.18) * (1 - phase(p, 0.89, 1));
        hands.leanToward(round.position, lean);
      }
      this.grip(hands, round, p);
    }
  }

  private grip(hands: LoaderHands, round: THREE.Object3D, p: number) {
    const reach = phase(p, 0, 0.16);
    const guide = reach * (1 - phase(p, 0.7, 0.82));
    // Measure from the wrist pivot to the loaded pad of the modelled glove.
    // The contact point belongs to the shell, so wrapping the fingers cannot
    // rotate the wrist through the brass when the shell tips out of its rack.
    const palmLength = 0.047;
    const padDepth = 0.034;
    const lift = phase(p, 0.22, 0.36);
    const cradle = phase(p, 0.29, 0.49);
    const radialAngle = THREE.MathUtils.lerp(-0.57, -0.45, cradle);
    const x = Math.cos(radialAngle);
    const y = Math.sin(radialAngle);
    const wrap = THREE.MathUtils.lerp(-0.7, -1.0, cradle);
    const radius = THREE.MathUtils.lerp(0.089, 0.095, lift);
    // The right hand takes the exposed nose above the strap. Once lifted it
    // rolls underneath the front third, with the fingers reaching up the near side.
    this.fingers.set(y * Math.sin(wrap), -x * Math.sin(wrap), -Math.cos(wrap));
    this.palm.set(-x, -y, 0);
    this.wrist
      .set(radius * x, radius * y, THREE.MathUtils.lerp(-0.407, -0.158, lift))
      .addScaledVector(this.fingers, -palmLength)
      .addScaledVector(this.palm, -padDepth - 0.003 * cradle)
      .applyMatrix4(round.matrixWorld)
      .lerp(RIGHT_REST, 1 - guide)
      .addScaledVector(hands.lean, 1 - guide);
    this.fingers.transformDirection(round.matrixWorld);
    this.palm.transformDirection(round.matrixWorld);
    hands.right.place(this.wrist, this.fingers, this.palm, 0.12 + 0.19 * guide);

    const catchUp = phase(p, 0.312, 0.397);
    const seated = phase(p, 0.38, 0.44);
    const support = catchUp * (1 - phase(p, 0.9, 1));
    const slide = phase(p, 0.425, 0.53);
    const heel = phase(p, 0.505, 0.6);
    const turn = heel * Math.PI * 0.5;
    const sine = Math.sin(turn);
    const cosine = Math.cos(turn);
    // From the opposite side, the left palm catches the heavy rear half. It
    // slides along the case, clears the raised rim and flattens on the base.
    // Roll outwards around the heel. During the regrip the fingers point
    // forward along the case, then sweep upwards across the exposed base.
    const turnFingers = THREE.MathUtils.lerp(
      -1.12 * phase(p, 0.397, 0.47),
      -4.0,
      heel,
    );
    const across = Math.cos(turnFingers);
    const inward = Math.sin(turnFingers);
    this.fingers.set(
      0.8 * across + 0.6 * sine * inward,
      -0.6 * across + 0.8 * sine * inward,
      cosine * inward,
    );
    this.palm.set(0.6 * cosine, 0.8 * cosine, -sine);
    // Reach the far side around the projecting base before settling against it.
    const baseRadius =
      THREE.MathUtils.lerp(0.095, 0.109, phase(slide, 0.41, 0.95)) *
        (1 - 0.56 * phase(heel, 0.18, 1) - 0.44 * phase(p, 0.6, 0.74)) +
      0.18 * (1 - seated);
    const clearLip = phase(heel, 0.23, 0.5) * (1 - phase(heel, 0.7, 1));
    const baseZ =
      THREE.MathUtils.lerp(0.167, 0.313, slide) +
      0.205 * (1 - seated) +
      0.009 * Math.sin(Math.PI * heel) +
      0.025 * clearLip;
    this.wrist
      .set(-0.6 * baseRadius, -0.8 * baseRadius, baseZ)
      .addScaledVector(this.fingers, -palmLength)
      .addScaledVector(this.palm, -padDepth)
      .applyMatrix4(round.matrixWorld)
      .lerp(LEFT_REST, 1 - support)
      .addScaledVector(hands.lean, 1 - support);
    this.fingers.transformDirection(round.matrixWorld);
    this.palm.transformDirection(round.matrixWorld);
    hands.left.place(
      this.wrist,
      this.fingers,
      this.palm,
      0.03 + 0.27 * seated * support * (1 - heel),
    );
  }
}
