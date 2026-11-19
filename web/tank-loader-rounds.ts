import * as THREE from "three";
import rack from "./tank-loader-rack.json";
import { LoaderBody } from "./tank-loader-body";
import { LoaderHands } from "./tank-loader-hands";
import type { ShellType, WeaponState } from "./tank-weapons";

// Cup centres match the exported Blender rack. Every type has its own mesh
// throughout pickup, transport and insertion; only the chambered one is hidden.
const SHELL_PAINT = { he: 0x627044, ap: 0x455769, smoke: 0xadb4a4 };
const handTarget = () => ({
  wrist: new THREE.Vector3(),
  fingers: new THREE.Vector3(),
  palm: new THREE.Vector3(),
  contact: 0,
});
const phase = THREE.MathUtils.smoothstep;

export class LoaderRounds {
  private rounds = new Map<ShellType, THREE.Group>();
  readonly body = new LoaderBody();
  readonly focus = new THREE.Vector3();
  activePose = false;
  private lead = handTarget();
  private rear = handTarget();
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
    fixedView = false,
  ) {
    hands.group.visible = false;
    this.activePose = false;
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
      this.activePose = true;
      this.focus.set(0, 0, 0.05 + 0.17 * push).applyMatrix4(round.matrixWorld);
      this.grip(hands, round, p, fixedView);
    }
  }

  private grip(
    hands: LoaderHands,
    round: THREE.Object3D,
    p: number,
    fixedView: boolean,
  ) {
    const reach = phase(p, 0, 0.16);
    const guide = reach * (1 - phase(p, 0.7, 0.82));
    // Measure from the wrist pivot to the loaded pad of the modelled glove.
    // The contact point belongs to the shell, so wrapping the fingers cannot
    // rotate the wrist through the brass when the shell tips out of its rack.
    const palmLength = 0.047;
    const padDepth = 0.034;
    const lift = phase(p, 0.22, 0.36);
    const cradle = phase(p, 0.29, 0.49);
    const radialAngle = THREE.MathUtils.lerp(-1.05, -1.1, cradle);
    const x = Math.cos(radialAngle);
    const y = Math.sin(radialAngle);
    const wrap = THREE.MathUtils.lerp(1.15, 0.8, cradle);
    const radius = THREE.MathUtils.lerp(0.089, 0.095, lift);
    // The right hand takes the exposed nose above the strap. Once lifted it
    // rolls under the front third and curls its fingers around the lower wall.
    this.lead.fingers.set(
      y * Math.sin(wrap),
      -x * Math.sin(wrap),
      -Math.cos(wrap),
    );
    this.lead.palm.set(-x, -y, 0);
    this.lead.wrist
      .set(radius * x, radius * y, THREE.MathUtils.lerp(-0.407, -0.158, lift))
      .addScaledVector(this.lead.fingers, -palmLength)
      .addScaledVector(this.lead.palm, -padDepth - 0.003 * cradle)
      .applyMatrix4(round.matrixWorld);
    this.lead.fingers.transformDirection(round.matrixWorld);
    this.lead.palm.transformDirection(round.matrixWorld);
    this.lead.contact = guide;

    const catchUp = phase(p, 0.312, 0.397);
    const seated = phase(p, 0.38, 0.44);
    const support = catchUp * (1 - phase(p, 0.9, 1));
    const slide = phase(p, 0.57, 0.676);
    const heel = phase(p, 0.648, 0.766);
    const bearing = THREE.MathUtils.lerp(0.28, Math.atan2(0.8, 0.6), heel);
    const side = Math.cos(bearing);
    const under = Math.sin(bearing);
    const turn = heel * Math.PI * 0.5;
    const sine = Math.sin(turn);
    const cosine = Math.cos(turn);
    // From the opposite side, the left palm catches the heavy rear half. It
    // slides along the case, clears the raised rim and flattens on the base.
    // Roll outwards around the heel. During the regrip the fingers point
    // forward along the case, then sweep upwards across the exposed base.
    const turnFingers = THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(0.6, -1.5, phase(p, 0.385, 0.5)),
      -3.7,
      heel,
    );
    const across = Math.cos(turnFingers);
    const inward = Math.sin(turnFingers);
    this.rear.fingers.set(
      under * across + side * sine * inward,
      -side * across + under * sine * inward,
      cosine * inward,
    );
    this.rear.palm.set(side * cosine, under * cosine, -sine);
    // Reach the far side around the projecting base before settling against it.
    const baseRadius =
      THREE.MathUtils.lerp(0.095, 0.109, phase(slide, 0.41, 0.95)) *
        (1 - 0.56 * phase(heel, 0.18, 1) - 0.44 * phase(p, 0.766, 0.82)) +
      0.18 * (1 - seated);
    const clearLip = phase(heel, 0.23, 0.5) * (1 - phase(heel, 0.7, 1));
    const baseZ =
      THREE.MathUtils.lerp(0.214, 0.313, slide) +
      0.205 * (1 - seated) +
      0.009 * Math.sin(Math.PI * heel) +
      0.025 * clearLip;
    this.rear.wrist
      .set(-side * baseRadius, -under * baseRadius, baseZ)
      .addScaledVector(this.rear.fingers, -palmLength)
      .addScaledVector(this.rear.palm, -padDepth)
      .applyMatrix4(round.matrixWorld);
    this.rear.fingers.transformDirection(round.matrixWorld);
    this.rear.palm.transformDirection(round.matrixWorld);
    this.rear.contact = support;
    this.body.solve(p, this.rear, this.lead);
    const rearGrip = 0.03 + 0.48 * seated * support * (1 - heel);
    const leadGrip = 0.12 + 0.28 * guide;
    if (fixedView) {
      // In the stationary accessibility view the observer stays behind the
      // character. Bring the sleeve attachments to that observer's lap.
      const { left, right } = this.body;
      hands.left.place(left.wrist, left.fingers, left.palm, rearGrip);
      hands.right.place(right.wrist, right.fingers, right.palm, leadGrip);
    } else {
      hands.left.poseWork(this.body.left, rearGrip);
      hands.right.poseWork(this.body.right, leadGrip);
    }
  }
}
