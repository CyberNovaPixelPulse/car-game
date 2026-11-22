import assert from "node:assert/strict";
import { test } from "node:test";
import type { CrewRole } from "../web/crew";
import { HILL_192_ROADS } from "../web/hill192-level";
import { DRIVE, HILL_192_LEVEL, TankCore } from "../web/tank-core";
import { terrainHeightAt, type TerrainHeightGrid } from "../web/tank-terrain";
import { FIRE, LOAD, WEAPON_TIMING } from "../web/tank-weapons";

const roles: CrewRole[] = ["driver", "gunner", "loader"];
const startOptions = { participants: [0, 1, 2], seed: 1000, practice: true };
const level = HILL_192_LEVEL;
const terrain = level.battlefield.terrain;

function startHill() {
  const core = new TankCore((slot) => roles[slot]);
  core.start({ ...startOptions, occupation: level });
  return core;
}

function driveTo(
  core: TankCore,
  points: readonly (readonly [number, number])[],
  stopAtImpact = false,
) {
  let descent = 0;
  let ascent = 0;
  for (const [x, z] of points) {
    for (let i = 0; ; i++) {
      const { tank } = core.view();
      if (
        Math.hypot(x - tank.x, z - tank.z) <= 3 ||
        (stopAtImpact && tank.blocked)
      )
        break;
      assert.ok(i < 3000, `normal route stalled towards ${x}, ${z}`);
      const desired = Math.atan2(x - tank.x, tank.z - z);
      const turn = Math.atan2(
        Math.sin(desired - tank.yaw),
        Math.cos(desired - tank.yaw),
      );
      const correction = turn - tank.turnRate * 0.22;
      const steer =
        Math.abs(correction) < 0.045
          ? 0
          : correction > 0
            ? DRIVE.right
            : DRIVE.left;
      core.input(0, steer | (Math.abs(turn) < 0.32 ? DRIVE.forward : 0));
      const previous = tank.y ?? 0;
      core.step(0.07);
      const height = tank.y ?? 0;
      assert.equal(height, terrainHeightAt(terrain, tank.x, tank.z));
      ascent += Math.max(0, height - previous);
      descent += Math.max(0, previous - height);
    }
  }
  core.input(0, 0);
  return { ascent, descent };
}

test("ground sampling matches both terrain triangles and outer vertices", () => {
  const grid: TerrainHeightGrid = {
    minX: 0,
    minZ: 0,
    spacing: 10,
    elevations: [
      [0, 0],
      [0, 10],
    ],
  };
  assert.equal(terrainHeightAt(grid, 2.5, 2.5), 0);
  assert.equal(terrainHeightAt(grid, 7.5, 7.5), 5);
  assert.equal(terrainHeightAt(grid, 10, 10), 10);
  assert.equal(terrainHeightAt(grid, 0, 10), 0);
  assert.equal(terrainHeightAt(undefined, 0, 0), 0);
});

test("normal Hill 192 reaches the same objective via two drivable relief routes", () => {
  assert.equal(level.battlefield.limit * 2, 600);
  const direct = startHill();
  const { x, z, radius } = level.zone;
  const goal = [x, z] as const;
  const directRelief = driveTo(direct, [goal]);
  assert.ok(directRelief.ascent > 3);
  assert.equal(direct.view().tank.blocked, false);
  assert.ok(
    Math.hypot(direct.view().tank.x - x, direct.view().tank.z - z) <= radius,
  );

  const reroute = startHill();
  const ridgeRelief = driveTo(reroute, HILL_192_ROADS[1].points.slice(1));
  assert.ok(ridgeRelief.descent > 2);
  assert.ok(ridgeRelief.ascent > 5);
  assert.equal(reroute.view().tank.blocked, false);
  assert.ok(
    Math.hypot(reroute.view().tank.x - x, reroute.view().tank.z - z) <= radius,
  );
});

test("normal Hill 192 keeps the hull inside the edge and outside raised cover", () => {
  const edge = startHill();
  driveTo(edge, [[level.spawn.x, -level.battlefield.limit - 12]], true);
  assert.equal(edge.view().tank.blocked, true);
  const centerLimit = level.battlefield.limit - level.battlefield.tankRadius;
  assert.ok(Math.abs(edge.view().tank.z + centerLimit) < 0.35);

  const coverRun = startHill();
  const box = level.battlefield.cover[0];
  driveTo(coverRun, [[box.x, box.z]], true);
  assert.equal(coverRun.view().tank.blocked, true);
  const front = box.z - box.depth / 2 - level.battlefield.tankRadius;
  assert.ok(Math.abs(coverRun.view().tank.z - front) < 0.35);
});

test("a normal main-gun launch uses the terrain height and legacy practice stays flat", () => {
  const core = startHill();
  const { tank } = core.view();
  assert.ok((tank.y ?? 0) > 10);
  core.input(2, LOAD);
  core.step(WEAPON_TIMING.load + 0.1);
  core.action(1, FIRE);
  const worldPivotHeight = (tank.y ?? 0) + 2.48 * Math.cos(tank.pitch ?? 0);
  assert.ok(
    Math.abs(core.view().weapon.projectiles[0].y - worldPivotHeight) < 1e-6,
  );

  core.start(startOptions);
  assert.equal(core.view().tank.y, undefined);
  core.input(2, LOAD);
  core.step(WEAPON_TIMING.load + 0.1);
  core.action(1, FIRE);
  assert.equal(core.view().weapon.projectiles[0].y, 2.48);
});
