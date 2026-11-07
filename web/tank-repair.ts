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
  /** Shared gameplay-clock deadline. Future calibration penalties extend it with max(). */
  blockedUntil: number;
  /** Effective repair work only; preserved across modes/waves and frozen during reconnect. */
  activeSeconds: number;
  calibration: {
    id: number;
    result: "idle" | "active" | "success" | "perfect" | "failed";
    elapsed: number;
    target: number;
    nextAt: number;
    randomState: number;
  };
}
export const createRepairState = (seed = 1): RepairState => {
  const repair: RepairState = {
    status: "inactive",
    blockedUntil: 0,
    activeSeconds: 0,
    calibration: {
      id: 0,
      result: "idle",
      elapsed: 0,
      target: 0,
      nextAt: 0,
      randomState: seed >>> 0,
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
/** Only the authority invokes this from the loader's discrete work-key action. */
export function stopRepairCalibration(state: TankState) {
  const { repair, weapon, tank } = state;
  const c = repair.calibration;
  if (
    weapon.mode !== "repair" ||
    c.result !== "active" ||
    repair.status !== "repairing"
  )
    return;
  const needle = c.elapsed / REPAIR_RULES.calibrationDuration;
  const perfectStart =
    c.target + (REPAIR_RULES.calibrationWidth - REPAIR_RULES.perfectWidth) / 2;
  if (needle < c.target || needle > c.target + REPAIR_RULES.calibrationWidth)
    return;
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
  if (repair.status !== "repairing") return;
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
  const c = repair.calibration;
  if (c.result === "active")
    c.elapsed = Math.min(REPAIR_RULES.calibrationDuration, c.elapsed + dt);
  else if (repair.activeSeconds >= c.nextAt) {
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
    [repair.blockedUntil, repair.activeSeconds].every(Number.isFinite) &&
    repair.blockedUntil >= 0 &&
    repair.activeSeconds >= 0 &&
    !!repair.calibration &&
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
