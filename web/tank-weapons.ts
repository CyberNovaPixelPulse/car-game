export const LOAD = 16;
export const FIRE = 4;
export const CROUCH = 32;
/** Fixed gameplay rule: ejected cases disable only the loader for five seconds. */
export const LOADER_STUN_SECONDS = 5;
export const WEAPON_TIMING = { load: 3, eject: 0.8 } as const;
export interface ShellFlight {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
}
export interface PracticeTarget {
  id: number;
  x: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  hp: number;
}
export interface WeaponState {
  chamber: "empty" | "loading" | "loaded" | "ejecting";
  crouching: boolean;
  stunnedUntil: number;
  loadProgress: number;
  ejectAt: number;
  shotsFired: number;
  projectiles: ShellFlight[];
  targets: PracticeTarget[];
  impacts: { id: number; x: number; y: number; z: number; until: number }[];
}
interface GunPose {
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
export function createWeaponState(): WeaponState {
  return {
    chamber: "empty",
    crouching: false,
    stunnedUntil: 0,
    loadProgress: 0,
    ejectAt: 0,
    shotsFired: 0,
    projectiles: [],
    impacts: [],
    targets: [
      { id: 1, x: 0, z: -11, width: 2.6, height: 3, depth: 1.2, hp: 100 },
    ],
  };
}
export function fireWeapon(w: WeaponState, pose: GunPose, now: number) {
  if (w.chamber !== "loaded") return;
  const dx = Math.sin(pose.yaw) * Math.cos(pose.pitch);
  const dy = Math.sin(pose.pitch);
  const dz = -Math.cos(pose.yaw) * Math.cos(pose.pitch);
  w.shotsFired++;
  w.projectiles.push({
    id: w.shotsFired,
    x: pose.x + dx * 4.8,
    y: 2.48 + dy * 4.8,
    z: pose.z + dz * 4.8,
    vx: dx * 32,
    vy: dy * 32,
    vz: dz * 32,
    age: 0,
  });
  w.chamber = "ejecting";
  w.ejectAt = now + WEAPON_TIMING.eject;
  w.loadProgress = 0;
}
export function loaderCanWork(w: WeaponState, now: number) {
  return !w.crouching && now >= w.stunnedUntil;
}

/** Segment versus a box: catches a fast shell between two simulation frames. */
function boxHit(from: number[], to: number[], low: number[], high: number[]) {
  let enter = 0,
    leave = 1;
  for (let axis = 0; axis < 3; axis++) {
    const d = to[axis] - from[axis];
    if (Math.abs(d) < 1e-8) {
      if (from[axis] < low[axis] || from[axis] > high[axis]) return undefined;
    } else {
      const a = (low[axis] - from[axis]) / d;
      const b = (high[axis] - from[axis]) / d;
      enter = Math.max(enter, Math.min(a, b));
      leave = Math.min(leave, Math.max(a, b));
      if (enter > leave) return undefined;
    }
  }
  return enter;
}
export function stepWeapon(
  w: WeaponState,
  loading: boolean,
  dt: number,
  now: number,
  cover: readonly Cover[],
) {
  if (w.chamber === "ejecting" && now >= w.ejectAt) {
    w.chamber = "empty";
    // Anchor to the ejection deadline, not a presentation frame or network receipt.
    if (!w.crouching) w.stunnedUntil = w.ejectAt + LOADER_STUN_SECONDS;
  }
  if (
    loading &&
    loaderCanWork(w, now) &&
    (w.chamber === "empty" || w.chamber === "loading")
  ) {
    w.chamber = "loading";
    w.loadProgress = Math.min(1, w.loadProgress + dt / WEAPON_TIMING.load);
    if (w.loadProgress >= 1) w.chamber = "loaded";
  }
  w.impacts = w.impacts.filter((impact) => now < impact.until);
  w.projectiles = w.projectiles.filter((p) => {
    const from = [p.x, p.y, p.z];
    p.x += p.vx * dt;
    p.y += p.vy * dt - 0.5 * 9.81 * dt * dt;
    p.z += p.vz * dt;
    p.vy -= 9.81 * dt;
    p.age += dt;
    const to = [p.x, p.y, p.z];
    let nearest = p.y <= 0 ? from[1] / (from[1] - p.y) : Infinity;
    let target: PracticeTarget | undefined;
    for (const c of [...cover, ...w.targets.filter((t) => t.hp > 0)]) {
      const hit = boxHit(
        from,
        to,
        [c.x - c.width / 2, 0, c.z - c.depth / 2],
        [c.x + c.width / 2, c.height, c.z + c.depth / 2],
      );
      if (hit !== undefined && hit < nearest) {
        nearest = hit;
        target = "hp" in c ? (c as PracticeTarget) : undefined;
      }
    }
    if (nearest <= 1) {
      const point = from.map((v, axis) => v + (to[axis] - v) * nearest);
      if (target) target.hp = Math.max(0, target.hp - 100);
      w.impacts.push({
        id: p.id,
        x: point[0],
        y: point[1],
        z: point[2],
        until: now + 0.6,
      });
      return false;
    }
    return p.age < 5;
  });
}
export function validWeapon(w: WeaponState | undefined): w is WeaponState {
  return (
    !!w &&
    typeof w.crouching === "boolean" &&
    ["empty", "loading", "loaded", "ejecting"].includes(w.chamber) &&
    [w.loadProgress, w.ejectAt, w.shotsFired, w.stunnedUntil].every(
      Number.isFinite,
    ) &&
    Array.isArray(w.projectiles) &&
    w.projectiles.every((p) =>
      [p.id, p.x, p.y, p.z, p.vx, p.vy, p.vz, p.age].every(Number.isFinite),
    ) &&
    Array.isArray(w.targets) &&
    w.targets.every((t) =>
      [t.id, t.x, t.z, t.width, t.height, t.depth, t.hp].every(Number.isFinite),
    ) &&
    Array.isArray(w.impacts) &&
    w.impacts.every((i) =>
      [i.id, i.x, i.y, i.z, i.until].every(Number.isFinite),
    )
  );
}
