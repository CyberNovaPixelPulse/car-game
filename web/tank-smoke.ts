/** Shared world-space smoke volume. Only authority time expires a cloud. */
export interface SmokeCloud {
  id: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  until: number;
}
export { SMOKE_SECONDS, SMOKE_RADIUS } from "./tank-settings";
export function smokeBlocks(
  clouds: readonly SmokeCloud[],
  from: readonly number[],
  to: readonly number[],
  now: number,
) {
  return clouds.some((c) => {
    if (now >= c.until) return false;
    const d = to.map((v, i) => v - from[i]);
    const offset = [c.x - from[0], c.y - from[1], c.z - from[2]];
    const length2 = d.reduce((sum, v) => sum + v * v, 0);
    const fraction = Math.max(
      0,
      Math.min(
        1,
        length2 ? offset.reduce((sum, v, i) => sum + v * d[i], 0) / length2 : 0,
      ),
    );
    return (
      offset.reduce((sum, v, i) => sum + (v - d[i] * fraction) ** 2, 0) <
      c.radius ** 2
    );
  });
}
export function smokeSight(
  clouds: readonly SmokeCloud[],
  tank: { x: number; z: number; yaw: number },
  aim: { yaw: number; pitch: number },
  machineGun: boolean,
  now: number,
) {
  const heading = tank.yaw + aim.yaw;
  const offset = machineGun ? 0 : 1.9;
  const eye = [
    tank.x + Math.sin(heading) * offset,
    machineGun ? 3.1 : 2.85,
    tank.z - Math.cos(heading) * offset,
  ];
  const end = [
    eye[0] + Math.sin(heading) * Math.cos(aim.pitch) * 80,
    eye[1] + Math.sin(aim.pitch) * 80,
    eye[2] - Math.cos(heading) * Math.cos(aim.pitch) * 80,
  ];
  return { eye, obscured: smokeBlocks(clouds, eye, end, now) };
}
