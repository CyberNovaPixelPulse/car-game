import { smokeBlocks, type SmokeCloud } from "./tank-smoke";
import { boxHit, type PracticeTarget } from "./tank-weapons";

export const LAST_SEEN_SECONDS = 2.5;
export const ENEMY_LABELS = {
  panzer: "四號 H 型",
  tiger: "虎式 I 型",
} as const;
interface Box {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
}
interface Vehicle {
  x: number;
  z: number;
  hp: number;
}
export interface EnemyBattle {
  wave: number;
  won: boolean;
  projectiles: {
    id: number;
    x: number;
    y: number;
    z: number;
    vx: number;
    vz: number;
    damage: number;
    age: number;
  }[];
  shots: number;
  lastHitAt: number;
  lastDamage: number;
  failed: boolean;
}
export const createEnemyBattle = (): EnemyBattle => ({
  wave: 1,
  won: false,
  projectiles: [],
  shots: 0,
  lastHitAt: -100,
  lastDamage: 0,
  failed: false,
});
const angle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
function intersection(a: number[], b: number[], c: Box, margin = 0) {
  return boxHit(
    a,
    b,
    [c.x - c.width / 2 - margin, 0, c.z - c.depth / 2 - margin],
    [c.x + c.width / 2 + margin, c.height, c.z + c.depth / 2 + margin],
  );
}
/** Visibility graph around expanded cover corners: both crews can drive around solid cover. */
function nextPoint(
  enemy: PracticeTarget,
  tank: Pick<Vehicle, "x" | "z">,
  cover: readonly Box[],
) {
  const start = [enemy.x, enemy.z],
    goal = [tank.x, tank.z];
  const radius = Math.hypot(enemy.width, enemy.depth) / 2 + 0.2;
  const clear = (a: number[], b: number[]) =>
    !cover.some(
      (c) =>
        intersection([a[0], 1, a[1]], [b[0], 1, b[1]], c, radius) !== undefined,
    );
  if (clear(start, goal)) return goal;
  const nodes = [
    start,
    goal,
    ...cover.flatMap((c) =>
      [-1, 1].flatMap((x) =>
        [-1, 1].map((z) => [
          c.x + x * (c.width / 2 + radius + 0.15),
          c.z + z * (c.depth / 2 + radius + 0.15),
        ]),
      ),
    ),
  ];
  const distances = nodes.map(() => Infinity),
    previous = nodes.map(() => -1),
    visited = new Set<number>();
  distances[0] = 0;
  while (visited.size < nodes.length) {
    let i = -1;
    for (let n = 0; n < nodes.length; n++)
      if (!visited.has(n) && (i < 0 || distances[n] < distances[i])) i = n;
    if (i < 0 || !Number.isFinite(distances[i]) || i === 1) break;
    visited.add(i);
    for (let n = 1; n < nodes.length; n++)
      if (!visited.has(n) && clear(nodes[i], nodes[n])) {
        const d =
          distances[i] +
          Math.hypot(nodes[n][0] - nodes[i][0], nodes[n][1] - nodes[i][1]);
        if (d < distances[n]) {
          distances[n] = d;
          previous[n] = i;
        }
      }
  }
  if (previous[1] < 0) return start;
  let next = 1;
  while (previous[next] > 0) next = previous[next];
  return nodes[next];
}
export function stepEnemies(
  b: EnemyBattle,
  enemies: PracticeTarget[],
  tank: Vehicle,
  cover: readonly Box[],
  dt: number,
  now: number,
  smoke: readonly SmokeCloud[],
) {
  if (b.failed || b.won) return;
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    const hiddenBySmoke = smokeBlocks(
      smoke,
      [e.x, 2.4, e.z],
      [tank.x, 2.4, tank.z],
      now,
    );
    const coverBlocked = (goal: Pick<Vehicle, "x" | "z">) =>
      cover.some(
        (c) =>
          intersection([e.x, 2.4, e.z], [goal.x, 2.4, goal.z], c) !== undefined,
      );
    if (!hiddenBySmoke && !coverBlocked(tank)) {
      e.lastSeenX = tank.x;
      e.lastSeenZ = tank.z;
      e.lastSeenAt = now;
    }
    const remembered = now - e.lastSeenAt <= LAST_SEEN_SECONDS;
    // Solid-cover flanking retains the encounter's original navigation contract.
    // Smoke instead removes the live player position from ALL aim/path decisions.
    const goal = hiddenBySmoke ? { x: e.lastSeenX, z: e.lastSeenZ } : tank;
    const distance = Math.hypot(goal.x - e.x, goal.z - e.z);
    const desired = Math.atan2(goal.x - e.x, -(goal.z - e.z));
    const searching = hiddenBySmoke && !remembered;
    const scan = searching
      ? Math.sin((now - e.lastSeenAt - LAST_SEEN_SECONDS) * 0.8) * 0.6
      : 0;
    const delta = angle(desired + scan - e.turretYaw);
    if (e.phase !== "warning")
      e.turretYaw +=
        Math.sign(delta) *
        Math.min(Math.abs(delta), dt * (e.kind === "tiger" ? 0.45 : 0.7));
    const blocked = coverBlocked(goal);
    if (e.phase !== "warning") {
      if (distance > (searching ? 6 : 11) || blocked) {
        const point = nextPoint(e, goal, cover);
        const dx = point[0] - e.x,
          dz = point[1] - e.z,
          length = Math.hypot(dx, dz);
        if (length > 0.05) {
          const speed = e.kind === "tiger" ? 0.9 : 1.25;
          const step = Math.min(length, speed * dt);
          e.x += (dx / length) * step;
          e.z += (dz / length) * step;
          e.yaw = Math.atan2(dx, -dz);
        }
        e.phase = "approaching";
      } else e.phase = now < e.readyAt ? "reloading" : "aiming";
      if (hiddenBySmoke) e.phase = searching ? "searching" : "blind-fire";
    }
    if (
      !blocked &&
      (!hiddenBySmoke || remembered) &&
      distance < 34 &&
      Math.abs(delta) < 0.06 &&
      now >= e.readyAt &&
      e.phase !== "warning"
    ) {
      e.phase = "warning";
      e.fireAt = now + 1.6;
    }
    if (e.phase === "warning" && now >= e.fireAt) {
      // Commit to the announced heading. A moving crew can leave the shot line.
      const dx = Math.sin(e.turretYaw),
        dz = -Math.cos(e.turretYaw);
      b.projectiles.push({
        id: ++b.shots,
        // Sweep from the firing hull: a muzzle projecting past a nearby wall must not skip it.
        x: e.x,
        y: 2.4,
        z: e.z,
        vx: dx * 23,
        vz: dz * 23,
        // The three-wave operation gives a coordinated crew time to load, clear
        // jams and traverse the turret, while ignoring incoming fire still loses.
        damage: e.kind === "tiger" ? 10 : 6,
        age: 0,
      });
      e.readyAt = now + (e.kind === "tiger" ? 9 : 7) * (1 - (b.wave - 1) * 0.15);
      e.phase = "reloading";
    }
  }
  b.projectiles = b.projectiles.filter((p) => {
    const from = [p.x, p.y, p.z];
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.age += dt;
    const to = [p.x, p.y, p.z];
    let nearest = Infinity,
      hitTank = false;
    for (const c of cover) {
      const hit = intersection(from, to, c);
      if (hit !== undefined && hit < nearest) nearest = hit;
    }
    const hit = intersection(from, to, {
      ...tank,
      width: 3.8,
      depth: 6.1,
      height: 3,
    });
    if (hit !== undefined && hit < nearest) {
      nearest = hit;
      hitTank = true;
    }
    if (nearest <= 1) {
      if (hitTank) {
        tank.hp = Math.max(0, tank.hp - p.damage);
        b.lastHitAt = now;
        b.lastDamage = p.damage;
      }
      return false;
    }
    return p.age < 5;
  });
  b.failed = tank.hp <= 0;
}

/** Reinforcements enter as actual combatants. Deadlines use the current battle clock. */
export function createWaveTargets(wave: number, now: number): PracticeTarget[] {
  const positions = wave === 2
    ? [[0, -13], [-3.8, -13], [3.8, -13]]
    : [[0, -13], [-3.8, -13], [3.8, -13], [4, -29]];
  return positions.map(([x, z], index) => {
    const kind = wave === 3 && index === 3 ? "tiger" : "panzer";
    return {
      id: wave * 100 + index, x, z,
      width: kind === "tiger" ? 3.7 : 3.2,
      height: kind === "tiger" ? 3.2 : 3,
      depth: kind === "tiger" ? 6 : 5.5,
      hp: kind === "tiger" ? 360 : 200,
      maxHp: kind === "tiger" ? 360 : 200,
      kind, yaw: Math.PI, turretYaw: Math.PI,
      phase: "approaching", lastSeenX: 0, lastSeenZ: 0, lastSeenAt: -100, readyAt: now + 12, fireAt: 0,
    };
  });
}
