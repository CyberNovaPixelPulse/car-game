import type { EnemyTarget } from "./tank-weapons";

export interface TankBattlefield {
  readonly limit: number;
  readonly tankRadius: number;
  readonly cover: readonly (Position & {
    readonly width: number;
    readonly depth: number;
    readonly height: number;
  })[];
}

interface Position {
  readonly x: number;
  readonly z: number;
}

export interface OccupationLevel {
  readonly id: "hill-192";
  readonly battlefield: TankBattlefield;
  readonly spawn: Position & { readonly yaw: number };
  readonly zone: Position & { readonly radius: number };
  readonly captureSeconds: number;
  /** Fraction of a full capture lost per second outside the zone. */
  readonly decayPerSecond: number;
  readonly enemies: readonly (Position & {
    readonly kind: EnemyTarget["kind"];
    readonly readyAfter?: number;
  })[];
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
