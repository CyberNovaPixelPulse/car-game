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
}
export const createRepairState = (): RepairState => ({
  status: "inactive",
  blockedUntil: 0,
  activeSeconds: 0,
});

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
}

export function validRepair(
  repair: RepairState | undefined,
): repair is RepairState {
  return (
    !!repair &&
    REPAIR_STATUSES.includes(repair.status) &&
    [repair.blockedUntil, repair.activeSeconds].every(Number.isFinite) &&
    repair.blockedUntil >= 0 &&
    repair.activeSeconds >= 0
  );
}
