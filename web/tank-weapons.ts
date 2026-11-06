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
export const STOP_JAM = 9;
export const MODE = 8;
export const JAM_RULES = {
  chance: 0.25,
  progress: 0.4,
  width: 0.24,
  speed: 0.65,
  retry: 1,
} as const;
export const CROUCH = 32;
/** Fixed gameplay rule: ejected cases disable only the loader for five seconds. */
export const LOADER_STUN_SECONDS = 5;
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
  maxHp: number;
  kind: "panzer" | "tiger";
  yaw: number;
  turretYaw: number;
  phase: "approaching" | "aiming" | "warning" | "reloading";
  readyAt: number;
  fireAt: number;
}
export interface WeaponState {
  mode: "loading" | "machine-gun";
  mg: {
    yaw: number;
    pitch: number;
    heat: number;
    coolUntil: number;
    nextShot: number;
    shots: number;
    tracers: {
      id: number;
      x: number;
      y: number;
      z: number;
      endX: number;
      endY: number;
      endZ: number;
      until: number;
    }[];
  };
  selectedShell: ShellType;
  chamberShell: ShellType | null;
  chamber: "empty" | "loading" | "loaded" | "ejecting";
  crouching: boolean;
  stunnedUntil: number;
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
export function createWeaponState(seed = 1): WeaponState {
  return {
    mode: "loading",
    mg: {
      yaw: 0,
      pitch: -0.04,
      heat: 0,
      coolUntil: 0,
      nextShot: 0,
      shots: 0,
      tracers: [],
    },
    selectedShell: "he",
    chamberShell: null,
    chamber: "empty",
    crouching: false,
    stunnedUntil: 0,
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
      {
        id: 1,
        x: 0,
        z: -13,
        width: 3.2,
        height: 3,
        depth: 5.5,
        hp: 200,
        maxHp: 200,
        kind: "panzer",
        yaw: Math.PI,
        turretYaw: Math.PI,
        phase: "approaching",
        readyAt: 12,
        fireAt: 0,
      },
      {
        id: 2,
        x: 4,
        z: -29,
        width: 3.7,
        height: 3.2,
        depth: 6,
        hp: 360,
        maxHp: 360,
        kind: "tiger",
        yaw: Math.PI,
        turretYaw: Math.PI,
        phase: "approaching",
        readyAt: 18,
        fireAt: 0,
      },
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
  if (
    w.mode !== "loading" ||
    !loaderCanWork(w, now) ||
    !j.active ||
    j.result !== "trying"
  )
    return;
  if (j.needle >= j.zone && j.needle <= j.zone + JAM_RULES.width) {
    j.active = false;
    j.result = "cleared";
  } else {
    j.result = "failed";
    j.retryAt = now + JAM_RULES.retry;
  }
}
export function loaderCanWork(w: WeaponState, now: number) {
  return !w.crouching && now >= w.stunnedUntil;
}

/** Segment versus a box: catches a fast shell between two simulation frames. */
export function boxHit(
  from: number[],
  to: number[],
  low: number[],
  high: number[],
) {
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
    if (!w.crouching) w.stunnedUntil = w.ejectAt + LOADER_STUN_SECONDS;
  }
  const j = w.jam;
  if (j.active && w.mode === "loading" && loaderCanWork(w, now)) {
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
    w.mode === "loading" &&
    loaderCanWork(w, now) &&
    !j.active &&
    (w.chamber === "empty" || w.chamber === "loading")
  ) {
    if (w.chamber === "empty") w.chamberShell = w.selectedShell;
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
            : distance <= damage.radius &&
                !cover.some(
                  (c) =>
                    boxHit(
                      point,
                      [t.x, t.height / 2, t.z],
                      [c.x - c.width / 2, 0, c.z - c.depth / 2],
                      [c.x + c.width / 2, c.height, c.z + c.depth / 2],
                    ) !== undefined,
                )
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
    ["loading", "machine-gun"].includes(w.mode) &&
    !!w.mg &&
    [
      w.mg.yaw,
      w.mg.pitch,
      w.mg.heat,
      w.mg.coolUntil,
      w.mg.nextShot,
      w.mg.shots,
    ].every(Number.isFinite) &&
    w.mg.heat >= 0 &&
    w.mg.heat <= 1 &&
    Array.isArray(w.mg.tracers) &&
    w.mg.tracers.every((t) =>
      [t.id, t.x, t.y, t.z, t.endX, t.endY, t.endZ, t.until].every(
        Number.isFinite,
      ),
    ) &&
    ["he", "ap", "smoke"].includes(w.selectedShell) &&
    (w.chamberShell === null ||
      ["he", "ap", "smoke"].includes(w.chamberShell)) &&
    typeof w.crouching === "boolean" &&
    ["empty", "loading", "loaded", "ejecting"].includes(w.chamber) &&
    [w.loadProgress, w.ejectAt, w.shotsFired, w.stunnedUntil].every(
      Number.isFinite,
    ) &&
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
    w.projectiles.every(
      (p) =>
        ["he", "ap", "smoke"].includes(p.shell) &&
        [p.id, p.x, p.y, p.z, p.vx, p.vy, p.vz, p.age].every(Number.isFinite),
    ) &&
    Array.isArray(w.targets) &&
    w.targets.every(
      (t) =>
        [
          t.id,
          t.x,
          t.z,
          t.width,
          t.height,
          t.depth,
          t.hp,
          t.maxHp,
          t.yaw,
          t.turretYaw,
          t.readyAt,
          t.fireAt,
        ].every(Number.isFinite) &&
        ["panzer", "tiger"].includes(t.kind) &&
        ["approaching", "aiming", "warning", "reloading"].includes(t.phase),
    ) &&
    Array.isArray(w.impacts) &&
    w.impacts.every(
      (i) =>
        ["he", "ap", "smoke"].includes(i.shell) &&
        [i.id, i.x, i.y, i.z, i.until].every(Number.isFinite),
    )
  );
}
