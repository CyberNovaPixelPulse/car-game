import type { TankState } from "./tank-core";
import { REPAIR_RULES, TANK_RULES } from "./tank-settings";

export const REPAIR_STATUSES = [
  "inactive",
  "destroyed",
  "stunned",
  "crouching",
  "moving",
  "waiting",
  "full",
  "ready",
  "repairing",
] as const;
export interface RepairState {
  status: (typeof REPAIR_STATUSES)[number];
  /** Latest damage/calibration deadline on the shared gameplay clock. */
  blockedUntil: number;
  /** Effective repair work only; preserved across modes/waves and frozen during reconnect. */
  activeSeconds: number;
  failureUntil: number;
  calibration: {
    id: number;
    result: "idle" | "active" | "success" | "perfect" | "failed";
    elapsed: number;
    target: number;
    nextAt: number;
    randomState: number;
    /** Room pause clears physical keys; the attempt resumes only after fresh R. */
    suspended: boolean;
  };
}
export const createRepairState = (seed = 1): RepairState => {
  const repair: RepairState = {
    status: "inactive",
    blockedUntil: 0,
    activeSeconds: 0,
    failureUntil: 0,
    calibration: {
      id: 0,
      result: "idle",
      elapsed: 0,
      target: 0,
      nextAt: 0,
      randomState: seed >>> 0,
      suspended: false,
    },
  };
  scheduleCalibration(repair);
  return repair;
};
function random(repair: RepairState) {
  const c = repair.calibration;
  c.randomState = (Math.imul(c.randomState, 1664525) + 1013904223) >>> 0;
  return c.randomState / 4294967296;
}
function scheduleCalibration(repair: RepairState) {
  repair.calibration.nextAt =
    repair.activeSeconds +
    REPAIR_RULES.calibrationMinWork +
    random(repair) * REPAIR_RULES.calibrationWorkRange;
}
function failCalibration(state: TankState) {
  const { repair, time } = state;
  if (repair.calibration.result !== "active") return;
  repair.calibration.result = "failed";
  repair.calibration.suspended = false;
  repair.failureUntil = time + REPAIR_RULES.failureWait;
  repair.blockedUntil = Math.max(repair.blockedUntil, repair.failureUntil);
  scheduleCalibration(repair);
}
/** Only the authority invokes this from the loader's discrete work-key action. */
export function stopRepairCalibration(state: TankState) {
  const { repair, weapon, tank } = state;
  const c = repair.calibration;
  if (
    weapon.mode !== "repair" ||
    c.result !== "active" ||
    c.suspended ||
    (repair.status !== "repairing" && repair.status !== "full")
  )
    return;
  const needle = c.elapsed / REPAIR_RULES.calibrationDuration;
  const perfectStart =
    c.target + (REPAIR_RULES.calibrationWidth - REPAIR_RULES.perfectWidth) / 2;
  if (needle < c.target || needle > c.target + REPAIR_RULES.calibrationWidth) {
    failCalibration(state);
    repair.status = "waiting";
    return;
  }
  c.result =
    needle >= perfectStart && needle <= perfectStart + REPAIR_RULES.perfectWidth
      ? "perfect"
      : "success";
  tank.hp = Math.min(
    TANK_RULES.maxHp,
    tank.hp +
      (c.result === "perfect"
        ? REPAIR_RULES.perfectHp
        : REPAIR_RULES.successHp),
  );
  scheduleCalibration(repair);
}

/** Host-only repair, after incoming damage and this step's actual hull movement. */
export function stepRepair(state: TankState, held: boolean, dt: number) {
  const { repair, weapon, tank, battle, time } = state;
  repair.blockedUntil = Math.max(
    repair.blockedUntil,
    battle.lastHitAt + REPAIR_RULES.damageWait,
  );
  repair.status =
    tank.hp <= 0 || battle.failed
      ? "destroyed"
      : weapon.mode !== "repair" || battle.won
        ? "inactive"
        : time < weapon.stunnedUntil
          ? "stunned"
          : weapon.crouching
            ? "crouching"
            : Math.abs(tank.speed) > REPAIR_RULES.stoppedSpeed ||
                Math.abs(tank.turnRate) > REPAIR_RULES.stoppedTurnRate
              ? "moving"
              : time < repair.blockedUntil
                ? "waiting"
                : tank.hp >= TANK_RULES.maxHp
                  ? "full"
                  : !held
                    ? "ready"
                    : "repairing";
  const c = repair.calibration;
  if (c.result === "active" && c.suspended) {
    // Safe room clears are not regular interruptions. Once live again, merely
    // waiting for fresh R retains the exact needle and target; moving, getting
    // hit or changing work still interrupts the attempt normally.
    if (!held && (repair.status === "ready" || repair.status === "full"))
      return;
    c.suspended = false;
  }
  // Reaching full HP caps healing but does not discard an already active
  // calibration. All other normal interruptions settle that one attempt once.
  if (
    c.result === "active" &&
    repair.status !== "repairing" &&
    !(repair.status === "full" && held)
  ) {
    failCalibration(state);
    if (repair.status === "ready" || repair.status === "full")
      repair.status = "waiting";
  }
  if (
    repair.status !== "repairing" &&
    !(repair.status === "full" && c.result === "active" && held)
  )
    return;
  // The first eligible substep may straddle a wait deadline. Only credit the
  // part after that deadline, never a renderer frame or a wall-time pause.
  const work = Math.min(
    dt,
    Math.max(0, time - repair.blockedUntil),
    (TANK_RULES.maxHp - tank.hp) / REPAIR_RULES.hpPerSecond,
  );
  tank.hp = Math.min(
    TANK_RULES.maxHp,
    tank.hp + REPAIR_RULES.hpPerSecond * work,
  );
  repair.activeSeconds += work;
  if (c.result === "active") {
    c.elapsed = Math.min(REPAIR_RULES.calibrationDuration, c.elapsed + dt);
    if (c.elapsed >= REPAIR_RULES.calibrationDuration) {
      failCalibration(state);
      repair.status = "waiting";
    }
  } else if (repair.activeSeconds >= c.nextAt) {
    c.id++;
    c.elapsed = 0;
    c.target = random(repair) * (1 - REPAIR_RULES.calibrationWidth);
    c.result = "active";
  }
}

export function validRepair(
  repair: RepairState | undefined,
): repair is RepairState {
  return (
    !!repair &&
    REPAIR_STATUSES.includes(repair.status) &&
    [repair.blockedUntil, repair.activeSeconds, repair.failureUntil].every(
      Number.isFinite,
    ) &&
    repair.blockedUntil >= 0 &&
    repair.activeSeconds >= 0 &&
    repair.failureUntil >= 0 &&
    !!repair.calibration &&
    typeof repair.calibration.suspended === "boolean" &&
    [
      repair.calibration.id,
      repair.calibration.elapsed,
      repair.calibration.target,
      repair.calibration.nextAt,
      repair.calibration.randomState,
    ].every(Number.isFinite) &&
    Number.isInteger(repair.calibration.id) &&
    repair.calibration.id >= 0 &&
    ["idle", "active", "success", "perfect", "failed"].includes(
      repair.calibration.result,
    ) &&
    repair.calibration.elapsed >= 0 &&
    repair.calibration.elapsed <= REPAIR_RULES.calibrationDuration &&
    repair.calibration.target >= 0 &&
    repair.calibration.target <= 1 - REPAIR_RULES.calibrationWidth &&
    repair.calibration.nextAt >= 0 &&
    Number.isInteger(repair.calibration.randomState) &&
    repair.calibration.randomState >= 0 &&
    repair.calibration.randomState <= 0xffffffff
  );
}
