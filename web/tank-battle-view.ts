import { DRIVER_VIEW, driverView } from "./tank-driver-view";

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

export function battleView(
  tank: { x: number; z: number; yaw: number },
  aim: { yaw: number; pitch: number },
  view: BattleView,
) {
  if (view === "driver") return driverView(tank);
  const yaw = tank.yaw + aim.yaw;
  const offset = view === "gunner" ? 1.9 : 0;
  return {
    x: tank.x + Math.sin(yaw) * offset,
    y: view === "gunner" ? 2.85 : 3.1,
    z: tank.z - Math.cos(yaw) * offset,
    yaw,
    pitch: aim.pitch,
  };
}
