import { INTERIOR_VIEW } from "./tank-battle-view";
import type { MotionStation } from "./tank-camera-motion";
import type { TankState } from "./tank-core";

const interiorLookYaw = Math.atan2(
  INTERIOR_VIEW.targetX - INTERIOR_VIEW.eyeX,
  INTERIOR_VIEW.eyeZ - INTERIOR_VIEW.targetZ,
);

export function stationHeading(state: TankState, station: MotionStation) {
  switch (station) {
    case "driver":
      return state.tank.yaw;
    case "machine-gun":
      return state.tank.yaw + state.weapon.mg.yaw;
    case "gunner":
      return state.tank.yaw + state.turret.yaw;
    default:
      return state.tank.yaw + state.turret.yaw + interiorLookYaw;
  }
}
