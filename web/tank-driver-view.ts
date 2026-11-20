/** The driver's fixed eye and the actual clear opening, shared by art and scouting.
 * Angles are radians; right/forward are metres in hull-local coordinates.
 */
export const DRIVER_VIEW = {
  eye: { right: -0.6, height: 1.65, forward: 1.55 },
  horizontalFov: (84 * Math.PI) / 180,
  verticalFov: (24 * Math.PI) / 180,
  openingDistance: 0.62,
  armourDepth: 0.28,
  /** The real Sherman hull: half its width over the tracks (matches the baked
   * model's 2.65 m hull and track outer edges) and the nose ahead of the eye. */
  hull: { halfWidth: 1.34, nose: 1.45 },
  // The camera also sees the opaque surround; this is not the clear opening's FOV.
  cameraHorizontalFov: (100 * Math.PI) / 180,
} as const;

export function driverView(tank: { x: number; y?: number; z: number; yaw: number }) {
  const { right, height, forward } = DRIVER_VIEW.eye;
  return {
    x: tank.x + Math.cos(tank.yaw) * right + Math.sin(tank.yaw) * forward,
    y: (tank.y ?? 0) + height,
    z: tank.z + Math.sin(tank.yaw) * right - Math.cos(tank.yaw) * forward,
    yaw: tank.yaw,
    pitch: 0,
    horizontalFov: DRIVER_VIEW.horizontalFov,
    verticalFov: DRIVER_VIEW.verticalFov,
  };
}
