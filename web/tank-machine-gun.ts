import { MG_RULES, FIRING_FEEDBACK } from "./tank-settings";
import {
  nearestHostileHit,
  loaderCanWork,
  type WeaponState,
} from "./tank-weapons";

export const MG_FIRE = 64;
export { MG_RULES } from "./tank-settings";
interface Pose {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
}
interface Cover {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
}

/** Host-owned held fire. The only damage recipients are hostile targets. */
export function stepMachineGun(
  w: WeaponState,
  pose: Pose,
  held: boolean,
  dt: number,
  now: number,
  cover: readonly Cover[],
) {
  const mg = w.mg;
  mg.tracers = mg.tracers.filter((t) => t.until > now);
  if (now < mg.coolUntil) {
    mg.heat = Math.min(1, (mg.coolUntil - now) / MG_RULES.cooldown);
    return;
  }
  if (!held || w.mode !== "machine-gun" || !loaderCanWork(w, now)) {
    mg.heat = Math.max(0, mg.heat - dt * MG_RULES.cooling);
    return;
  }
  mg.heat = Math.min(1, mg.heat + dt / MG_RULES.burst);
  if (now >= mg.nextShot) {
    mg.nextShot = now + MG_RULES.interval;
    mg.shots++;
    mg.flashUntil = now + FIRING_FEEDBACK.machineGun;
    const from = [pose.x, 3.1, pose.z];
    const to = [
      pose.x + Math.sin(pose.yaw) * Math.cos(pose.pitch) * MG_RULES.range,
      3.1 + Math.sin(pose.pitch) * MG_RULES.range,
      pose.z - Math.cos(pose.yaw) * Math.cos(pose.pitch) * MG_RULES.range,
    ];
    const { fraction: nearest, target } = nearestHostileHit(
      from,
      to,
      cover,
      w.targets,
      to[1] <= 0 ? from[1] / (from[1] - to[1]) : 1,
    );
    if (target) target.hp = Math.max(0, target.hp - MG_RULES.damage);
    mg.tracers.push({
      id: mg.shots,
      x: from[0],
      y: from[1],
      z: from[2],
      endX: from[0] + (to[0] - from[0]) * nearest,
      endY: from[1] + (to[1] - from[1]) * nearest,
      endZ: from[2] + (to[2] - from[2]) * nearest,
      until: now + 0.08,
    });
  }
  if (mg.heat >= 1 - 1e-8) {
    mg.heat = 1;
    mg.coolUntil = now + MG_RULES.cooldown;
  }
}
