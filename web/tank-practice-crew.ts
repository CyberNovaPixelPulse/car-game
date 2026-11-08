import { CREW_ROLES, type CrewRole } from "./crew";
import { TankCore, BATTLEFIELD, AIM, DRIVE } from "./tank-core";
import { JAM_RULES, BALLISTICS, DRIVING, REPAIR_RULES } from "./tank-settings";
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
  private searchPoint = 0;
  private fireAt?: number;
  constructor(
    private core: TankCore,
    private role: CrewRole,
  ) {}
  switchRole(role: CrewRole) {
    this.role = role;
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
      const dt = Math.min(remaining, 0.025);
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
    const state = this.core.view();
    const tank = state.tank;
    let keys = 0;
    if (this.driverStopped) this.driverStatus = "依指令停車";
    else if (state.weapon.mode === "repair") this.driverStatus = "停車配合維修";
    else if (
      state.battle.failed ||
      !state.weapon.targets.some((target) => target.hp > 0)
    )
      this.driverStatus = "等待交戰・停車";
    else {
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
      const stopDistance = 10 + (tank.speed * tank.speed) / (2 * DRIVING.coast);
      if (target && distance <= stopDistance) this.driverStatus = "交戰停車";
      else {
        if (!target && distance < 2)
          this.searchPoint = (this.searchPoint + 1) % 4;
        const size = BATTLEFIELD.tankRadius * Math.SQRT2;
        const [x, z] = nextCoverWaypoint(
          { ...tank, width: size, depth: size },
          goal,
          BATTLEFIELD.cover,
        );
        const error = Math.atan2(
          Math.sin(Math.atan2(x - tank.x, -(z - tank.z)) - tank.yaw),
          Math.cos(Math.atan2(x - tank.x, -(z - tank.z)) - tank.yaw),
        );
        const correction = error - tank.turnRate * 0.25;
        keys =
          Math.abs(correction) > 0.06
            ? correction > 0
              ? DRIVE.right
              : DRIVE.left
            : 0;
        if (Math.abs(error) < 0.2 && !tank.blocked) keys |= DRIVE.forward;
        // A blocked approach turns clear before trying forward again; never warp.
        if (tank.blocked) keys = DRIVE.reverse | DRIVE.right;
        this.driverStatus = "前進中・接近交戰區";
      }
    }
    this.core.input(slot, keys);
  }
  private aim() {
    const slot = this.botSlot("gunner");
    if (slot === undefined) return;
    const state = this.core.view();
    // The AI has its own 16:9 optical view, independent of the player's canvas.
    this.core.input(slot, 0, 16 / 9);
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
      [{ role: "gunner", aspect: 16 / 9 }],
      BATTLEFIELD.cover,
    );
    const target = observation.intel.contacts.find(
      (contact) => contact.visible && contact.hp > 0,
    );
    if (!target) {
      this.fireAt = undefined;
      this.gunnerStatus = "搜尋可見敵車";
      this.core.input(slot, AIM.right, 16 / 9);
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
      const correction = error - rate * 0.3;
      return correction > 0.025 ? positive : correction < -0.025 ? negative : 0;
    };
    this.core.input(
      slot,
      axis(yawError, state.turret.yawRate, AIM.right, AIM.left) |
        axis(pitchError, state.turret.pitchRate, AIM.up, AIM.down),
      16 / 9,
    );
    const settled =
      Math.abs(yawError) < 0.07 &&
      Math.abs(pitchError) < 0.06 &&
      Math.abs(state.turret.yawRate) < 0.15 &&
      Math.abs(state.turret.pitchRate) < 0.15;
    if (!this.firing || !settled || state.weapon.chamber !== "loaded") {
      this.fireAt = undefined;
      this.gunnerStatus = !this.firing
        ? "已暫停自動開火"
        : settled
          ? "等待主炮裝填"
          : "轉砲瞄準";
      return;
    }
    this.fireAt ??= state.time + 1.2;
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
        ) < 0.015
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
        Math.abs(w.jam.needle - w.jam.zone - JAM_RULES.width / 2) < 0.025
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
