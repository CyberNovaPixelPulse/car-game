import type { MotionStation } from "./tank-camera-motion";
import type { TankState } from "./tank-core";

// The loader's camera looks from (1.35, 1.55) toward (-0.05, -0.7)
// in the turret interior's horizontal plane.
const interiorLookYaw = Math.atan2(-1.4, 2.25);

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
