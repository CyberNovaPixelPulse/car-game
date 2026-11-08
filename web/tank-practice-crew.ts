import { CREW_ROLES, type CrewRole } from "./crew";
import { TankCore, BATTLEFIELD, AIM, DRIVE } from "./tank-core";
import {
  JAM_RULES,
  BALLISTICS,
  DRIVING,
  REPAIR_RULES,
  PRACTICE_RULES,
} from "./tank-settings";
import { nextCoverWaypoint } from "./tank-enemies";
import { createTeamIntel, stepTeamIntel } from "./tank-intel";
import {
  CROUCH,
  LOAD,
  MODE,
  FIRE,
  SELECT_AP,
  SELECT_HE,
  SELECT_SMOKE,
  STOP_JAM,
  type ShellType,
} from "./tank-weapons";

/** Local crew sends the same role-checked controls as a human. No state injection. */
export class PracticeCrew {
  shell: ShellType = "ap";
  loaderStatus = "等待工作";
  gunnerStatus = "等待交戰";
  firing = true;
  driverStopped = false;
  driverStatus = "等待交戰";
  private escapeGoal?: { x: number; z: number };
  private searchPoint = 0;
  private fireAt?: number;
  constructor(
    private core: TankCore,
    private role: CrewRole,
  ) {}
  switchRole(role: CrewRole) {
    this.role = role;
    this.escapeGoal = undefined;
    this.fireAt = undefined;
    this.searchPoint = 0;
  }
  roleOf(slot: number): CrewRole | undefined {
    return slot === 0
      ? this.role
      : CREW_ROLES.filter((role) => role !== this.role)[slot - 1];
  }
  private botSlot(role: CrewRole) {
    return [1, 2].find((slot) => this.roleOf(slot) === role);
  }
  step(elapsed: number) {
    let remaining = elapsed;
    while (remaining > 0) {
      const dt = Math.min(remaining, PRACTICE_RULES.stepSeconds);
      this.drive();
      this.load();
      this.aim();
      this.core.step(dt);
      remaining -= dt;
    }
  }
  private drive() {
    const slot = this.botSlot("driver");
    if (slot === undefined) return;
    const state = this.core.view(),
      tank = state.tank;
    const stop = (status: string) => {
      this.driverStatus = status;
      this.core.input(slot, 0);
    };
    if (this.driverStopped) return stop("依指令停車");
    if (state.weapon.mode === "repair") return stop("停車配合維修");
    if (
      state.battle.failed ||
      !state.weapon.targets.some((target) => target.hp > 0)
    )
      return stop("等待交戰・停車");
    const target = state.intel.contacts.find(
      (contact) => contact.visible && contact.hp > 0,
    );
    const search = [
      [8, -9],
      [24, 6],
      [-5, 8],
      [-24, 24],
    ][this.searchPoint];
    const goal = target ?? { x: search[0], z: search[1] };
    const distance = Math.hypot(goal.x - tank.x, goal.z - tank.z);
    const braking = (tank.speed * tank.speed) / (2 * DRIVING.coast);
    if (
      !this.escapeGoal &&
      target &&
      distance <= PRACTICE_RULES.driverStopDistance + braking
    )
      return stop("交戰停車");
    if (!target && distance < PRACTICE_RULES.searchArrival)
      this.searchPoint = (this.searchPoint + 1) % 4;
    const size = BATTLEFIELD.tankRadius * Math.SQRT2;
    let [x, z] = nextCoverWaypoint(
      { ...tank, width: size, depth: size },
      goal,
      BATTLEFIELD.cover,
    );
    // A human can park legally inside the navigator's extra safety margin.
    // Retain an outward goal until clear, rather than steering toward a zero vector.
    if (
      !this.escapeGoal &&
      (Math.hypot(x - tank.x, z - tank.z) < 0.1 || tank.blocked)
    ) {
      const margin = BATTLEFIELD.tankRadius + 0.2;
      const cover = BATTLEFIELD.cover.find(
        (c) =>
          Math.abs(tank.x - c.x) < c.width / 2 + margin &&
          Math.abs(tank.z - c.z) < c.depth / 2 + margin,
      );
      if (cover) {
        const exits = [
          { x: cover.x - cover.width / 2 - margin - 0.5, z: tank.z },
          { x: cover.x + cover.width / 2 + margin + 0.5, z: tank.z },
          { x: tank.x, z: cover.z - cover.depth / 2 - margin - 0.5 },
          { x: tank.x, z: cover.z + cover.depth / 2 + margin + 0.5 },
        ];
        this.escapeGoal = exits.sort(
          (a, b) =>
            Math.hypot(a.x - tank.x, a.z - tank.z) -
            Math.hypot(b.x - tank.x, b.z - tank.z),
        )[0];
      } else return stop("路線受阻・可換職調整車身");
    }
    if (this.escapeGoal) {
      x = this.escapeGoal.x;
      z = this.escapeGoal.z;
    }
    const escapeDistance = Math.hypot(x - tank.x, z - tank.z);
    if (
      this.escapeGoal &&
      escapeDistance <= PRACTICE_RULES.escapeArrival &&
      Math.abs(tank.speed) < 0.1
    ) {
      this.escapeGoal = undefined;
      return stop("脫困完成");
    }
    const normalize = (angle: number) =>
      Math.atan2(Math.sin(angle), Math.cos(angle));
    let error = normalize(Math.atan2(x - tank.x, -(z - tank.z)) - tank.yaw);
    const reverse = !!this.escapeGoal && Math.abs(error) > Math.PI / 2;
    if (reverse) error = normalize(error + Math.PI);
    const correction = error - tank.turnRate * PRACTICE_RULES.steeringDamping;
    let keys =
      Math.abs(correction) > PRACTICE_RULES.steeringTolerance
        ? correction > 0
          ? DRIVE.right
          : DRIVE.left
        : 0;
    if (
      Math.abs(error) < PRACTICE_RULES.driveAlignment &&
      (!this.escapeGoal ||
        escapeDistance > braking + PRACTICE_RULES.escapeArrival)
    )
      keys |= reverse ? DRIVE.reverse : DRIVE.forward;
    this.driverStatus = this.escapeGoal
      ? "正在脫困・退出掩體邊界"
      : "前進中・接近交戰區";
    this.core.input(slot, keys);
  }
  private aim() {
    const slot = this.botSlot("gunner");
    if (slot === undefined) return;
    const state = this.core.view();
    // The AI has its own 16:9 optical view, independent of the player's canvas.
    this.core.input(slot, 0, PRACTICE_RULES.observerAspect);
    if (
      state.battle.failed ||
      !state.weapon.targets.some((target) => target.hp > 0)
    ) {
      this.fireAt = undefined;
      this.gunnerStatus = "等待交戰";
      return;
    }
    const observation = { ...state, intel: createTeamIntel() };
    stepTeamIntel(
      observation,
      [{ role: "gunner", aspect: PRACTICE_RULES.observerAspect }],
      BATTLEFIELD.cover,
    );
    const target = observation.intel.contacts.find(
      (contact) => contact.visible && contact.hp > 0,
    );
    if (!target) {
      this.fireAt = undefined;
      this.gunnerStatus = "搜尋可見敵車";
      this.core.input(slot, AIM.right, PRACTICE_RULES.observerAspect);
      return;
    }
    const dx = target.x - state.tank.x,
      dz = target.z - state.tank.z;
    const range = Math.hypot(dx, dz);
    const yawError = Math.atan2(
      Math.sin(Math.atan2(dx, -dz) - state.tank.yaw - state.turret.yaw),
      Math.cos(Math.atan2(dx, -dz) - state.tank.yaw - state.turret.yaw),
    );
    const flight = Math.max(0, range - 4.8) / BALLISTICS.speed;
    const pitch = Math.atan2(
      1.8 - 2.48 + (BALLISTICS.gravity * flight * flight) / 2,
      range,
    );
    const pitchError = pitch - state.turret.pitch;
    const axis = (
      error: number,
      rate: number,
      positive: number,
      negative: number,
    ) => {
      const correction = error - rate * PRACTICE_RULES.aimDamping;
      return correction > PRACTICE_RULES.aimTolerance
        ? positive
        : correction < -PRACTICE_RULES.aimTolerance
          ? negative
          : 0;
    };
    this.core.input(
      slot,
      axis(yawError, state.turret.yawRate, AIM.right, AIM.left) |
        axis(pitchError, state.turret.pitchRate, AIM.up, AIM.down),
      PRACTICE_RULES.observerAspect,
    );
    const settled =
      Math.abs(yawError) < PRACTICE_RULES.fireYawTolerance &&
      Math.abs(pitchError) < PRACTICE_RULES.firePitchTolerance &&
      Math.abs(state.turret.yawRate) < PRACTICE_RULES.fireRateTolerance &&
      Math.abs(state.turret.pitchRate) < PRACTICE_RULES.fireRateTolerance;
    if (!this.firing || !settled || state.weapon.chamber !== "loaded") {
      this.fireAt = undefined;
      this.gunnerStatus = !this.firing
        ? "已暫停自動開火"
        : settled
          ? "等待主炮裝填"
          : "轉砲瞄準";
      return;
    }
    this.fireAt ??= state.time + PRACTICE_RULES.firingWarning;
    this.gunnerStatus = `即將開火・${Math.max(0, this.fireAt - state.time).toFixed(1)} 秒後射擊，注意退殼`;
    if (state.time >= this.fireAt) {
      this.core.action(slot, FIRE);
      this.fireAt = undefined;
      this.gunnerStatus = "主炮已射擊・注意退殼";
    }
  }
  private load() {
    const slot = this.botSlot("loader");
    if (slot === undefined) return;
    const { weapon: w, time, battle, tank, repair, intel } = this.core.view();
    if (battle.failed) {
      this.core.input(slot, 0);
      return;
    }
    if (time < w.stunnedUntil) {
      this.core.input(slot, 0);
      this.loaderStatus = "暈眩・等待恢復";
      return;
    }
    if (w.chamber === "ejecting") {
      this.loaderStatus = "蹲下避殼";
      this.core.input(slot, CROUCH);
      return;
    }
    const stopped =
      Math.abs(tank.speed) <= REPAIR_RULES.stoppedSpeed &&
      Math.abs(tank.turnRate) <= REPAIR_RULES.stoppedTurnRate;
    const danger = intel.contacts.some(
      (contact) => contact.visible && contact.phase === "warning",
    );
    const repairGap =
      w.chamber === "loaded" &&
      stopped &&
      !danger &&
      (tank.hp < 100 || repair.calibration.result === "active");
    if (repairGap) {
      if (w.mode !== "repair") {
        this.core.input(slot, 0);
        this.core.action(slot, MODE);
        this.loaderStatus = "切換維修工作";
        return;
      }
      this.core.input(slot, LOAD);
      const calibration = repair.calibration;
      const needle = calibration.elapsed / REPAIR_RULES.calibrationDuration;
      if (
        calibration.result === "active" &&
        Math.abs(
          needle - calibration.target - REPAIR_RULES.calibrationWidth / 4,
        ) < PRACTICE_RULES.calibrationTolerance
      )
        this.core.action(slot, STOP_JAM);
      this.loaderStatus =
        time < repair.blockedUntil
          ? "維修等待・受擊或校準後停修"
          : calibration.result === "active"
            ? "維修校準中"
            : "停車維修中";
      return;
    }
    this.core.input(slot, 0);
    if (w.mode !== "loading") {
      this.loaderStatus = "切換裝填工作";
      this.core.action(slot, MODE);
      return;
    }
    if (w.jam.active) {
      this.loaderStatus = "排除卡彈";
      if (
        w.jam.result === "trying" &&
        Math.abs(w.jam.needle - w.jam.zone - JAM_RULES.width / 2) <
          PRACTICE_RULES.jamTolerance
      )
        this.core.action(slot, STOP_JAM);
      return;
    }
    if (w.chamber === "loaded") {
      this.loaderStatus = "主炮已裝填";
      return;
    }
    this.core.action(
      slot,
      { he: SELECT_HE, ap: SELECT_AP, smoke: SELECT_SMOKE }[this.shell],
    );
    this.loaderStatus = "裝填中";
    this.core.input(slot, LOAD);
  }
}
