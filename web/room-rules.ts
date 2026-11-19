import { isCrewRole } from "./crew";
import type { Member, Room } from "./network";

export function updateLobbyCrew(
  member: Member,
  members: Iterable<Member>,
  role: unknown,
  ready: unknown,
): string | undefined {
  if (isCrewRole(role)) {
    for (const other of members) {
      if (other.slot !== member.slot && other.role === role)
        return "這個職位已有人擔任，請選擇其他職位。";
    }
    if (member.role !== role) {
      member.role = role;
      member.ready = false;
    }
  }
  if (typeof ready === "boolean") {
    if (!member.role) return "請先選擇職位再準備。";
    member.ready = ready;
  }
  return undefined;
}

export function canStartBattle(
  isHost: boolean,
  phase: Room["phase"],
  members: readonly Member[],
) {
  return (
    phase === "lobby" &&
    members.length === 3 &&
    members.every((member) => member.connected && member.role && member.ready)
  );
}
