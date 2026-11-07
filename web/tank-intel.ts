import { battleProjection, battleView } from "./tank-battle-view";
import { DRIVER_VIEW } from "./tank-driver-view";
import { boxHit, type EnemyTarget } from "./tank-weapons";
import { smokeBlocks } from "./tank-smoke";
import type { TankState } from "./tank-core";
import type { CrewRole } from "./crew";

/** A copied observation, never a reference to hidden world/AI state.
 * #38 can retain this exact record without refreshing any unobserved field. */
export interface EnemyContact {
  id: number;
  x: number;
  z: number;
  kind: EnemyTarget["kind"];
  hp: number;
  maxHp: number;
  phase: EnemyTarget["phase"];
  observedAt: number;
}
export interface TeamIntel {
  contacts: EnemyContact[];
}
export const createTeamIntel = (): TeamIntel => ({ contacts: [] });
const phases = [
  "approaching",
  "aiming",
  "warning",
  "reloading",
  "blind-fire",
  "searching",
];
export function validTeamIntel(intel: TeamIntel) {
  return Boolean(
    intel &&
    Array.isArray(intel.contacts) &&
    intel.contacts.length <= 16 &&
    new Set(intel.contacts.map((c) => c.id)).size === intel.contacts.length &&
    intel.contacts.every(
      (c) =>
        c &&
        Number.isSafeInteger(c.id) &&
        [c.x, c.z, c.hp, c.maxHp, c.observedAt].every(Number.isFinite) &&
        (c.kind === "panzer" || c.kind === "tiger") &&
        phases.includes(c.phase) &&
        c.hp >= 0 &&
        c.hp <= c.maxHp &&
        c.maxHp > 0 &&
        c.observedAt >= 0,
    ),
  );
}

/** Host samples a compact tank silhouette against the actual optical frusta,
 * authoritative cover boxes and shared 3D smoke volumes. AI memory is unrelated. */
export function stepTeamIntel(
  state: TankState,
  observers: readonly { role: CrewRole; aspect?: number }[],
  cover: readonly {
    x: number;
    z: number;
    width: number;
    height: number;
    depth: number;
  }[],
) {
  const views = observers.flatMap(({ role, aspect }) => {
    if (role === "loader" && state.weapon.mode !== "machine-gun") return [];
    const view = role === "loader" ? "machine-gun" : role;
    if (view !== "driver" && aspect === undefined) return [];
    const pose = battleView(
      state.tank,
      role === "loader" ? state.weapon.mg : state.turret,
      view,
    );
    return [
      {
        ...pose,
        ...(view === "driver"
          ? {
              horizontalFov: DRIVER_VIEW.horizontalFov,
              verticalFov: DRIVER_VIEW.verticalFov,
            }
          : battleProjection(view, aspect!)),
      },
    ];
  });
  state.intel.contacts = state.weapon.targets
    .filter((target) =>
      views.some((view) => {
        const eye = [view.x, view.y, view.z];
        // Oriented inset hull/turret samples avoid spotting empty bounding-box air.
        return [0.45, 0.72, 0.9].some((height) =>
          [0, -0.4, 0.4].some((right) =>
            [0, -0.4, 0.4].some((forward) => {
              const x =
                target.x +
                Math.cos(target.yaw) * right * target.width +
                Math.sin(target.yaw) * forward * target.depth;
              const z =
                target.z +
                Math.sin(target.yaw) * right * target.width -
                Math.cos(target.yaw) * forward * target.depth;
              const point = [x, target.height * height, z];
              const dx = x - view.x,
                dy = point[1] - view.y,
                dz = z - view.z;
              const rightward =
                dx * Math.cos(view.yaw) + dz * Math.sin(view.yaw);
              const forwardward =
                dx * Math.sin(view.yaw) - dz * Math.cos(view.yaw);
              const depth =
                forwardward * Math.cos(view.pitch) + dy * Math.sin(view.pitch);
              const upward =
                dy * Math.cos(view.pitch) - forwardward * Math.sin(view.pitch);
              if (
                depth <= 0.1 ||
                depth >= 180 ||
                Math.abs(rightward) >
                  depth * Math.tan(view.horizontalFov / 2) ||
                Math.abs(upward) > depth * Math.tan(view.verticalFov / 2)
              )
                return false;
              return (
                !smokeBlocks(state.weapon.smoke, eye, point, state.time) &&
                !cover.some(
                  (c) =>
                    boxHit(
                      eye,
                      point,
                      [c.x - c.width / 2, 0, c.z - c.depth / 2],
                      [c.x + c.width / 2, c.height, c.z + c.depth / 2],
                    ) !== undefined,
                )
              );
            }),
          ),
        );
      }),
    )
    .map(({ id, x, z, kind, hp, maxHp, phase }) => ({
      id,
      x,
      z,
      kind,
      hp,
      maxHp,
      phase,
      observedAt: state.time,
    }));
}
