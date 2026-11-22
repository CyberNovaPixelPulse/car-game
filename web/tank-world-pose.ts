export interface HullPose {
  x: number;
  y?: number;
  z: number;
  yaw: number;
  /** Forward track climbs when pitch is positive. Absent on the flat field. */
  pitch?: number;
}

export interface TurretAim {
  yaw: number;
  pitch: number;
}

export interface CannonPose extends TurretAim {
  x: number;
  y?: number;
  z: number;
  hullYaw: number;
  hullPitch?: number;
  turretYaw?: number;
  turretPitch?: number;
}

/** Transform a fixture from hull-local right/up/forward to the battlefield. */
export function hullPoint(
  hull: HullPose,
  right: number,
  up: number,
  forward: number,
) {
  const pitch = hull.pitch ?? 0;
  const hullForward = Math.cos(pitch) * forward - Math.sin(pitch) * up;
  return {
    x: hull.x + Math.cos(hull.yaw) * right + Math.sin(hull.yaw) * hullForward,
    y: (hull.y ?? 0) + Math.cos(pitch) * up + Math.sin(pitch) * forward,
    z: hull.z + Math.sin(hull.yaw) * right - Math.cos(hull.yaw) * hullForward,
  };
}

export const CANNON_PIVOT_HEIGHT = 2.48;

export function cannonPivot(hull: HullPose) {
  return hullPoint(hull, 0, CANNON_PIVOT_HEIGHT, 0);
}

/** Compose the actual hull and turret axes. A traversed gun follows the same
 * tilted turret ring, so a sideways gun does not inherit the whole hull pitch. */
export function cannonWorldPose(hull: HullPose, aim: TurretAim): CannonPose {
  const pose: CannonPose = {
    x: hull.x,
    y: hull.y,
    z: hull.z,
    hullYaw: hull.yaw,
    yaw: hull.yaw + aim.yaw,
    pitch: aim.pitch,
  };
  if (hull.pitch === undefined) return pose;
  pose.hullPitch = hull.pitch;
  pose.turretYaw = aim.yaw;
  pose.turretPitch = aim.pitch;
  if (hull.pitch === 0) return pose;

  const right = Math.sin(aim.yaw) * Math.cos(aim.pitch);
  const forward = Math.cos(aim.yaw) * Math.cos(aim.pitch);
  const up = Math.sin(aim.pitch);
  const tiltedForward =
    Math.cos(hull.pitch) * forward - Math.sin(hull.pitch) * up;
  const tiltedUp = Math.cos(hull.pitch) * up + Math.sin(hull.pitch) * forward;
  pose.yaw = hull.yaw + Math.atan2(right, tiltedForward);
  pose.pitch = Math.atan2(tiltedUp, Math.hypot(right, tiltedForward));
  return pose;
}
