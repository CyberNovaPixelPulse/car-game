export const LOAD = 16;
export const FIRE = 4;
export const STOP_JAM = 9;
export const JAM_RULES = {
  chance: 0.25,
  progress: 0.4,
  width: 0.24,
  speed: 0.65,
  retry: 1,
} as const;
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
  loadProgress: number;
  ejectAt: number;
  shotsFired: number;
  randomState: number;
  jamChecked: boolean;
  jamPending: boolean;
  jam: {
    active: boolean;
    needle: number;
    direction: number;
    zone: number;
    retryAt: number;
    result: "trying" | "failed" | "cleared";
  };
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
export function createWeaponState(seed = 1): WeaponState {
  return {
    chamber: "empty",
    loadProgress: 0,
    ejectAt: 0,
    shotsFired: 0,
    randomState: seed >>> 0,
    jamChecked: false,
    jamPending: false,
    jam: {
      active: false,
      needle: 0,
      direction: 1,
      zone: 0,
      retryAt: 0,
      result: "trying",
    },
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
  w.jamChecked = false;
  w.jamPending = false;
  w.chamber = "ejecting";
  w.ejectAt = now + WEAPON_TIMING.eject;
  w.loadProgress = 0;
}
function random(w: WeaponState) {
  w.randomState = (Math.imul(w.randomState, 1664525) + 1013904223) >>> 0;
  return w.randomState / 4294967296;
}
export function stopJam(w: WeaponState, now: number) {
  const j = w.jam;
  if (!j.active || j.result !== "trying") return;
  if (j.needle >= j.zone && j.needle <= j.zone + JAM_RULES.width) {
    j.active = false;
    j.result = "cleared";
  } else {
    j.result = "failed";
    j.retryAt = now + JAM_RULES.retry;
  }
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
  if (w.chamber === "ejecting" && now >= w.ejectAt) w.chamber = "empty";
  const j = w.jam;
  if (j.active) {
    if (j.result === "failed" && now >= j.retryAt) j.result = "trying";
    if (j.result === "trying") {
      j.needle += j.direction * dt * JAM_RULES.speed;
      if (j.needle > 1) {
        j.needle = 2 - j.needle;
        j.direction = -1;
      }
      if (j.needle < 0) {
        j.needle = -j.needle;
        j.direction = 1;
      }
    }
  }
  if (
    loading &&
    !j.active &&
    (w.chamber === "empty" || w.chamber === "loading")
  ) {
    if (!w.jamChecked) {
      w.jamChecked = true;
      w.jamPending = random(w) < JAM_RULES.chance;
      j.result = "trying";
    }
    w.chamber = "loading";
    w.loadProgress = Math.min(1, w.loadProgress + dt / WEAPON_TIMING.load);
    if (w.jamPending && w.loadProgress >= JAM_RULES.progress) {
      w.loadProgress = JAM_RULES.progress;
      w.jamPending = false;
      j.active = true;
      j.needle = 0;
      j.direction = 1;
      j.zone = 0.12 + random(w) * 0.52;
      j.result = "trying";
    }
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
    ["empty", "loading", "loaded", "ejecting"].includes(w.chamber) &&
    [w.loadProgress, w.ejectAt, w.shotsFired].every(Number.isFinite) &&
    Number.isInteger(w.randomState) &&
    w.randomState >= 0 &&
    w.randomState <= 0xffffffff &&
    typeof w.jamChecked === "boolean" &&
    typeof w.jamPending === "boolean" &&
    !!w.jam &&
    typeof w.jam.active === "boolean" &&
    [w.jam.needle, w.jam.direction, w.jam.zone, w.jam.retryAt].every(
      Number.isFinite,
    ) &&
    ["trying", "failed", "cleared"].includes(w.jam.result) &&
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
