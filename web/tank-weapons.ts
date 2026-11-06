export const LOAD = 16;
export const FIRE = 4;
export const SELECT_HE = 5;
export const SELECT_AP = 6;
export type ShellType = "he" | "ap" | "smoke";
export const SHELL_LABELS = {
  he: "高爆彈",
  ap: "穿甲彈",
  smoke: "煙霧彈",
} as const;
export const WEAPON_TIMING = { load: 3, eject: 0.8 } as const;
export const SHELL_DAMAGE = {
  he: { direct: 100, radius: 5, splash: 60 },
  ap: { direct: 180, radius: 0, splash: 0 },
  smoke: { direct: 0, radius: 0, splash: 0 },
} as const;
export interface ShellFlight {
  shell: ShellType;
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
  selectedShell: ShellType;
  chamberShell: ShellType | null;
  chamber: "empty" | "loading" | "loaded" | "ejecting";
  loadProgress: number;
  ejectAt: number;
  shotsFired: number;
  projectiles: ShellFlight[];
  targets: PracticeTarget[];
  impacts: {
    id: number;
    x: number;
    y: number;
    z: number;
    shell: ShellType;
    until: number;
  }[];
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
    selectedShell: "he",
    chamberShell: null,
    chamber: "empty",
    loadProgress: 0,
    ejectAt: 0,
    shotsFired: 0,
    projectiles: [],
    impacts: [],
    targets: [
      { id: 1, x: 0, z: -11, width: 2.6, height: 3, depth: 1.2, hp: 200 },
      { id: 2, x: 3, z: -11, width: 2, height: 3, depth: 1.2, hp: 200 },
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
    shell: w.chamberShell!,
    id: w.shotsFired,
    x: pose.x + dx * 4.8,
    y: 2.48 + dy * 4.8,
    z: pose.z + dz * 4.8,
    vx: dx * 32,
    vy: dy * 32,
    vz: dz * 32,
    age: 0,
  });
  w.chamberShell = null;
  w.chamber = "ejecting";
  w.ejectAt = now + WEAPON_TIMING.eject;
  w.loadProgress = 0;
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
  if (loading && (w.chamber === "empty" || w.chamber === "loading")) {
    if (w.chamber === "empty") w.chamberShell = w.selectedShell;
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
      const damage = SHELL_DAMAGE[p.shell];
      // Only hostile targets participate: the firing tank is never a damage recipient.
      for (const t of w.targets) {
        const distance = Math.hypot(
          t.x - point[0],
          t.height / 2 - point[1],
          t.z - point[2],
        );
        const amount =
          t === target
            ? damage.direct
            : distance <= damage.radius
              ? damage.splash
              : 0;
        t.hp = Math.max(0, t.hp - amount);
      }
      w.impacts.push({
        shell: p.shell,
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
    ["he", "ap", "smoke"].includes(w.selectedShell) &&
    (w.chamberShell === null ||
      ["he", "ap", "smoke"].includes(w.chamberShell)) &&
    ["empty", "loading", "loaded", "ejecting"].includes(w.chamber) &&
    [w.loadProgress, w.ejectAt, w.shotsFired].every(Number.isFinite) &&
    Array.isArray(w.projectiles) &&
    w.projectiles.every(
      (p) =>
        ["he", "ap", "smoke"].includes(p.shell) &&
        [p.id, p.x, p.y, p.z, p.vx, p.vy, p.vz, p.age].every(Number.isFinite),
    ) &&
    Array.isArray(w.targets) &&
    w.targets.every((t) =>
      [t.id, t.x, t.z, t.width, t.height, t.depth, t.hp].every(Number.isFinite),
    ) &&
    Array.isArray(w.impacts) &&
    w.impacts.every(
      (i) =>
        ["he", "ap", "smoke"].includes(i.shell) &&
        [i.id, i.x, i.y, i.z, i.until].every(Number.isFinite),
    )
  );
}
