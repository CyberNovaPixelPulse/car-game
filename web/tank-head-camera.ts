import type { PerspectiveCamera } from "three";
import { DRIVER_VIEW } from "./tank-driver-view";
import type { HeadOffset } from "./tank-camera-motion";

/** Applied after rebuilding the base eye on every draw, never integrated frame to frame. */
export function applyHeadOffset(
  camera: PerspectiveCamera,
  offset: Readonly<HeadOffset>,
  driver = false,
) {
  if (driver) {
    // Stay inside the backward cone from the nominal eye. Through every edge
    // of the fixed opening the new ray then lies within the original aperture.
    const retreat = Math.min(
      0.065,
      Math.max(
        0,
        offset.z,
        Math.abs(offset.x) / Math.tan(DRIVER_VIEW.horizontalFov / 2),
        Math.abs(offset.y) / Math.tan(DRIVER_VIEW.verticalFov / 2),
      ),
    );
    const horizontal = retreat * Math.tan(DRIVER_VIEW.horizontalFov / 2);
    const vertical = retreat * Math.tan(DRIVER_VIEW.verticalFov / 2);
    camera.translateX(Math.max(-horizontal, Math.min(horizontal, offset.x)));
    camera.translateY(Math.max(-vertical, Math.min(vertical, offset.y)));
    camera.translateZ(retreat);
  } else {
    camera.translateX(offset.x);
    camera.translateY(offset.y);
    camera.translateZ(offset.z);
  }
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
