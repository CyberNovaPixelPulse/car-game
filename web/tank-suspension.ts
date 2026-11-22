import { DRIVING } from "./tank-settings";
import { terrainHeightAt, type TerrainHeightGrid } from "./tank-terrain";
import type { HullPose } from "./tank-world-pose";

const halfContactLength = 2.2;
const halfTrackGauge = 1.05;
const divePerAcceleration = 0.007;
const settleSeconds = 0.24;

export function restingHullPitch(terrain: TerrainHeightGrid, hull: HullPose) {
  const forwardX = Math.sin(hull.yaw);
  const forwardZ = -Math.cos(hull.yaw);
  const rightX = -forwardZ * halfTrackGauge;
  const rightZ = forwardX * halfTrackGauge;
  const axleHeight = (distance: number) => {
    const x = hull.x + forwardX * distance;
    const z = hull.z + forwardZ * distance;
    return (
      (terrainHeightAt(terrain, x + rightX, z + rightZ) +
        terrainHeightAt(terrain, x - rightX, z - rightZ)) /
      2
    );
  };
  const rise = axleHeight(halfContactLength) - axleHeight(-halfContactLength);
  return Math.atan2(rise, 2 * halfContactLength);
}

export function stepHullPitch(
  terrain: TerrainHeightGrid,
  hull: HullPose & { speed: number },
  previousSpeed: number,
  dt: number,
) {
  const resting = restingHullPitch(terrain, hull);
  const acceleration = Math.max(
    -DRIVING.coast,
    Math.min(DRIVING.coast, (hull.speed - previousSpeed) / dt),
  );
  const target = resting + acceleration * divePerAcceleration;
  const pitch = hull.pitch ?? resting;
  const next = target + (pitch - target) * Math.exp(-dt / settleSeconds);
  return Math.abs(next - target) < 0.0001 ? target : next;
}
