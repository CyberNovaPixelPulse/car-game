import { DRIVER_VIEW, driverView } from "./tank-driver-view";
import {
  cannonWorldPose,
  hullPoint,
  type HullPose,
  type TurretAim,
} from "./tank-world-pose";

/** Horizontal eye and sight line in the turret-fixed loader compartment. */
export const INTERIOR_VIEW = {
  eyeX: 1.35,
  eyeZ: 1.55,
  targetX: -0.05,
  targetZ: -0.7,
  standingTargetY: 1.16,
} as const;

/** Keep the authored horizontal workspace in frame as the HUD columns draw
 * closer. Below a square viewport, further narrowing only widens the lens. */
export function interiorFraming(aspect: number) {
  const zoom = Math.min(1, aspect / (16 / 9));
  const narrow = Math.min(0.4, 1 - zoom);
  return { zoom, loadingYaw: 0.64 * narrow, repairYaw: -0.65 * narrow };
}

export type BattleView = "driver" | "gunner" | "machine-gun";
export const EXTERIOR_VERTICAL_FOV = (65 * Math.PI) / 180;
/** Same projection for actual pixels and host scouting. Aspect is CSS size,
 * never the quality-dependent drawing buffer. No default grants a view. */
export const validViewAspect = (aspect: unknown): aspect is number =>
  typeof aspect === "number" &&
  Number.isFinite(aspect) &&
  aspect > 0 &&
  aspect <= 100;

export function battleProjection(view: BattleView, aspect: number) {
  const verticalFov =
    view === "driver"
      ? Math.max(
          DRIVER_VIEW.verticalFov * 1.5,
          2 * Math.atan(Math.tan(DRIVER_VIEW.cameraHorizontalFov / 2) / aspect),
        )
      : EXTERIOR_VERTICAL_FOV;
  return {
    verticalFov,
    horizontalFov: 2 * Math.atan(Math.tan(verticalFov / 2) * aspect),
  };
}

export function battleView(tank: HullPose, aim: TurretAim, view: BattleView) {
  if (view === "driver") return driverView(tank);
  if (view === "gunner" && tank.pitch !== undefined) {
    const gun = cannonWorldPose(tank, aim);
    return {
      ...hullPoint(
        tank,
        Math.sin(aim.yaw) * 1.9,
        2.85,
        Math.cos(aim.yaw) * 1.9,
      ),
      yaw: gun.yaw,
      pitch: gun.pitch,
    };
  }
  const yaw = tank.yaw + aim.yaw;
  const offset = view === "gunner" ? 1.9 : 0;
  return {
    x: tank.x + Math.sin(yaw) * offset,
    y: (tank.y ?? 0) + (view === "gunner" ? 2.85 : 3.1),
    z: tank.z - Math.cos(yaw) * offset,
    yaw,
    pitch: aim.pitch,
  };
}
