import { MG_RULES, BOW_MG, FIRING_FEEDBACK } from "./tank-settings";
import {
  nearestHostileHit,
  loaderCanWork,
  createBowGun,
  type WeaponState,
} from "./tank-weapons";

export const MG_FIRE = 64;
/** Driver's held bow-gun trigger. */
export const BOW_FIRE = 128;
export { MG_RULES } from "./tank-settings";
interface Pose {
  x: number;
  y?: number;
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
  const belt = (mg.belt ??= { rounds: MG_RULES.beltCapacity, reloadUntil: 0 });
  const wantsFire = held && w.mode === "machine-gun" && loaderCanWork(w, now);
  mg.tracers = mg.tracers.filter((t) => t.until > now);

  // A committed reload and thermal cooldown both use the shared game clock.
  if (belt.reloadUntil > 0 && now >= belt.reloadUntil) {
    belt.rounds = MG_RULES.beltCapacity;
    belt.reloadUntil = 0;
  } else if (belt.rounds === 0 && belt.reloadUntil === 0 && wantsFire) {
    belt.reloadUntil = now + MG_RULES.reload;
  }
  if (now < mg.coolUntil) {
    mg.heat = Math.min(1, (mg.coolUntil - now) / MG_RULES.cooldown);
    return;
  }
  if (!wantsFire || belt.reloadUntil > 0) {
    mg.heat = Math.max(0, mg.heat - dt * MG_RULES.cooling);
    return;
  }
  mg.heat = Math.min(1, mg.heat + dt / MG_RULES.burst);
  if (now >= mg.nextShot) {
    mg.nextShot = now + MG_RULES.interval;
    mg.shots++;
    belt.rounds--;
    if (belt.rounds === 0) belt.reloadUntil = now + MG_RULES.reload;
    mg.flashUntil = now + FIRING_FEEDBACK.machineGun;
    const y = (pose.y ?? 0) + 3.1;
    const from = [pose.x, y, pose.z];
    const to = [
      pose.x + Math.sin(pose.yaw) * Math.cos(pose.pitch) * MG_RULES.range,
      y + Math.sin(pose.pitch) * MG_RULES.range,
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

/** Host-owned bow gun: fixed along the hull, nearly harmless to armour. */
export function stepBowGun(
  w: WeaponState,
  tank: { x: number; y?: number; z: number; yaw: number },
  held: boolean,
  dt: number,
  now: number,
  cover: readonly Cover[],
) {
  const bow = (w.bow ??= createBowGun());
  bow.tracers = bow.tracers.filter((t) => t.until > now);
  if (now < bow.coolUntil) {
    bow.heat = Math.min(1, (bow.coolUntil - now) / BOW_MG.cooldown);
    return;
  }
  if (!held) {
    bow.heat = Math.max(0, bow.heat - dt * BOW_MG.cooling);
    return;
  }
  bow.heat = Math.min(1, bow.heat + dt / BOW_MG.burst);
  if (now >= bow.nextShot) {
    bow.nextShot = now + BOW_MG.interval;
    bow.shots++;
    bow.flashUntil = now + FIRING_FEEDBACK.machineGun;
    const { right, forward, height } = BOW_MG.mount;
    const sin = Math.sin(tank.yaw),
      cos = Math.cos(tank.yaw);
    const from = [
      tank.x + cos * right + sin * forward,
      (tank.y ?? 0) + height,
      tank.z + sin * right - cos * forward,
    ];
    // A little ball-mount wander so a burst walks rather than threads a needle.
    const yaw = tank.yaw + Math.sin(bow.shots * 2.39) * 0.012;
    const pitch = Math.cos(bow.shots * 1.73) * 0.008;
    const to = [
      from[0] + Math.sin(yaw) * Math.cos(pitch) * BOW_MG.range,
      from[1] + Math.sin(pitch) * BOW_MG.range,
      from[2] - Math.cos(yaw) * Math.cos(pitch) * BOW_MG.range,
    ];
    const { fraction, target } = nearestHostileHit(
      from,
      to,
      cover,
      w.targets,
      to[1] <= 0 ? from[1] / (from[1] - to[1]) : 1,
    );
    if (target) target.hp = Math.max(0, target.hp - BOW_MG.damage);
    bow.tracers.push({
      id: bow.shots,
      x: from[0],
      y: from[1],
      z: from[2],
      endX: from[0] + (to[0] - from[0]) * fraction,
      endY: from[1] + (to[1] - from[1]) * fraction,
      endZ: from[2] + (to[2] - from[2]) * fraction,
      until: now + 0.09,
      hit: !!target,
    });
  }
  if (bow.heat >= 1 - 1e-8) {
    bow.heat = 1;
    bow.coolUntil = now + BOW_MG.cooldown;
  }
}
