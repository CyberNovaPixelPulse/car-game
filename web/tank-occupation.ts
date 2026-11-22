import type { TerrainHeightGrid } from "./tank-terrain";
import type { EnemyTarget } from "./tank-weapons";

export interface TankBattlefield {
  readonly limit: number;
  readonly tankRadius: number;
  readonly terrain?: TerrainHeightGrid;
  readonly cover: readonly (Position & {
    readonly y?: number;
    readonly width: number;
    readonly depth: number;
    readonly height: number;
  })[];
}

interface Position {
  readonly x: number;
  readonly z: number;
}

export const FIRST_OCCUPATION_ENEMY_ID = 1000;
export interface OccupationEnemy extends Position {
  readonly kind: EnemyTarget["kind"];
  readonly readyAfter?: number;
  readonly yaw?: number;
  readonly deployment?:
    | { readonly mode: "guard" }
    | {
        readonly mode: "patrol";
        readonly points: readonly [Position, ...Position[]];
      };
}

export interface OccupationLevel {
  readonly id: "hill-192";
  readonly battlefield: TankBattlefield;
  readonly spawn: Position & { readonly yaw: number };
  readonly zone: Position & { readonly radius: number };
  readonly captureSeconds: number;
  /** Fraction of a full capture lost per second outside the zone. */
  readonly decayPerSecond: number;
  readonly enemies: readonly OccupationEnemy[];
}

export interface OccupationState {
  levelId: OccupationLevel["id"];
  progress: number;
  phase: "approach" | "capturing" | "contested" | "retreating" | "secured";
}

export function stepOccupation(
  occupation: OccupationState,
  level: OccupationLevel,
  tank: Position,
  enemies: readonly EnemyTarget[],
  dt: number,
) {
  const { zone } = level;
  const inZone = ({ x, z }: Position) =>
    Math.hypot(x - zone.x, z - zone.z) <= zone.radius;
  if (!inZone(tank)) {
    occupation.progress = Math.max(
      0,
      occupation.progress - level.decayPerSecond * dt,
    );
    occupation.phase = occupation.progress > 0 ? "retreating" : "approach";
  } else if (enemies.some((enemy) => enemy.hp > 0 && inZone(enemy))) {
    occupation.phase = "contested";
  } else {
    occupation.progress = Math.min(
      1,
      occupation.progress + dt / level.captureSeconds,
    );
    occupation.phase = occupation.progress === 1 ? "secured" : "capturing";
  }
}
