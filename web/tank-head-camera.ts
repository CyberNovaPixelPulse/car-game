import type { PerspectiveCamera } from "three";
import type { HeadOffset } from "./tank-camera-motion";

/** Applied after rebuilding the base eye on every draw, never integrated frame to frame. */
export function applyHeadOffset(
  camera: PerspectiveCamera,
  offset: Readonly<HeadOffset>,
  driver = false,
) {
  // Only withdraw behind the driver's fixed aperture. Lateral translation or
  // leaning forward would expose rays outside the nominal scouting opening.
  camera.translateX(driver ? 0 : offset.x);
  camera.translateY(driver ? 0 : offset.y);
  camera.translateZ(driver ? Math.max(0, offset.z) : offset.z);
  camera.rotateX(offset.pitch);
  camera.rotateY(offset.yaw);
  camera.rotateZ(offset.roll);
}

export function headStamp(offset: Readonly<HeadOffset>) {
  return [
    offset.x,
    offset.y,
    offset.z,
    offset.pitch,
    offset.yaw,
    offset.roll,
  ].join(",");
}
