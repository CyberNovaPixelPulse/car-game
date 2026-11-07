export const CREW_ROLES = ["driver", "gunner", "loader"] as const;
export type CrewRole = (typeof CREW_ROLES)[number];
export const ROLE_LABELS: Record<CrewRole, string> = {
  driver: "駕駛",
  gunner: "砲手",
  loader: "裝填手",
};
export const ROLE_TASKS: Record<CrewRole, string> = {
  driver: "透過受限前窗觀察道路，與隊友協調移動與方向。",
  gunner: "觀察戰場、指引方向，控制主炮瞄準與開火。",
  loader: "切換裝填、車頂機槍與車內維修，支援全隊。",
};
export function isCrewRole(value: unknown): value is CrewRole {
  return CREW_ROLES.some((role) => role === value);
}
