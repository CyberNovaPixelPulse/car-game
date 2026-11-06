import { Session, type Room } from "./network";
import { CREW_ROLES, ROLE_LABELS, ROLE_TASKS } from "./crew";
import "./tank.css";

const app = document.querySelector<HTMLDivElement>("#tank-app")!;
app.innerHTML = `<main class="crew-shell"><header><h1>三人坦克合作戰鬥</h1><p class="setting">1944 年・諾曼第</p><p>一台坦克，三個職位。請先和隊友開啟語音通話。</p></header><section id="crew-content" aria-label="房間與職位"></section><p id="crew-message" role="status" aria-live="polite"></p></main>`;
const content = document.querySelector<HTMLElement>("#crew-content")!;
const message = document.querySelector<HTMLElement>("#crew-message")!;
export const session = new Session("tank");
const escape = (text: string) => {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
};
const error = (e: unknown) => {
  message.textContent = e instanceof Error ? e.message : String(e);
};
function menu() {
  content.innerHTML = `<h2>與隊友集合</h2><form id="crew-create"><label for="crew-name">乘員名稱</label><input id="crew-name" maxlength="16" autocomplete="nickname" required><button type="submit">建立房間</button></form><form id="crew-join"><label for="crew-code">房間代碼</label><div class="join-line"><input id="crew-code" maxlength="6" autocomplete="off" autocapitalize="characters" required><button type="submit">加入房間</button></div></form><p class="note">需要三位玩家、三台電腦與實體鍵盤。</p>`;
  const name = () => {
    const value = document
      .querySelector<HTMLInputElement>("#crew-name")!
      .value.trim();
    if (!value) throw new Error("請先輸入乘員名稱。");
    return value;
  };
  document.querySelector<HTMLFormElement>("#crew-create")!.onsubmit = async (
    e,
  ) => {
    e.preventDefault();
    message.textContent = "正在建立房間…";
    try {
      await session.create(name());
    } catch (e) {
      error(e);
    }
  };
  document.querySelector<HTMLFormElement>("#crew-join")!.onsubmit = async (
    e,
  ) => {
    e.preventDefault();
    message.textContent = "正在加入房間…";
    try {
      const code = document
        .querySelector<HTMLInputElement>("#crew-code")!
        .value.trim()
        .toUpperCase();
      if (!/^[A-Z2-9]{6}$/.test(code)) throw new Error("請輸入六位房間代碼。");
      await session.join(code, name());
    } catch (e) {
      error(e);
    }
  };
}
function lobby(room: Room) {
  const me = room.members.find((m) => m.slot === session.slot);
  const complete =
    room.members.length === 3 &&
    room.members.every((m) => m.connected && m.role && m.ready);
  content.innerHTML = `<div class="room-heading"><h2>乘員集合</h2><p>房間代碼 <strong data-testid="room-code">${room.code}</strong></p></div><ul class="crew-list" data-testid="crew-list">${room.members.map((m) => `<li><strong>${escape(m.name)}${m.slot === 0 ? "（房主）" : ""}${m.slot === session.slot ? "（你）" : ""}</strong><span>${m.role ? ROLE_LABELS[m.role] : "尚未選擇職位"} · ${m.ready ? "已準備" : "未準備"}</span></li>`).join("")}</ul><fieldset><legend>選擇你的職位</legend>${CREW_ROLES.map(
    (role) => {
      const owner = room.members.find((m) => m.role === role);
      return `<div class="role-option"><button type="button" data-role="${role}" aria-pressed="${me?.role === role}" ${owner && owner.slot !== session.slot ? "disabled" : ""}>擔任${ROLE_LABELS[role]}</button><p>${ROLE_TASKS[role]}${owner && owner.slot !== session.slot ? ` 目前由 ${escape(owner.name)} 擔任。` : ""}</p></div>`;
    },
  ).join(
    "",
  )}</fieldset><div class="room-actions"><button id="crew-ready" ${!me?.role ? "disabled" : ""}>${me?.ready ? "取消準備" : "準備"}</button>${session.isHost ? `<button id="crew-start" ${complete ? "" : "disabled"}>開始戰鬥</button>` : "<p>全員準備後，由房主開始戰鬥。</p>"}<button class="secondary" id="crew-leave">離開房間</button></div><p class="note">${
    complete
      ? "三個職位已就緒。"
      : `等待 ${
          CREW_ROLES.filter((r) => !room.members.some((m) => m.role === r))
            .map((r) => ROLE_LABELS[r])
            .join("、") || "所有乘員準備"
        }。`
  }</p>`;
  content
    .querySelectorAll<HTMLButtonElement>("[data-role]")
    .forEach((button) => {
      button.onclick = () => {
        message.textContent = "";
        session.chooseRole(button.dataset.role as (typeof CREW_ROLES)[number]);
      };
    });
  document.querySelector<HTMLButtonElement>("#crew-ready")!.onclick = () =>
    session.setReady(!me?.ready);
  const start = document.querySelector<HTMLButtonElement>("#crew-start");
  if (start) start.onclick = () => session.start();
  document.querySelector<HTMLButtonElement>("#crew-leave")!.onclick = () => {
    session.leave();
    menu();
    message.textContent = "";
  };
}
function station(room: Room) {
  const role = room.members.find((m) => m.slot === session.slot)?.role;
  if (!role) return;
  content.innerHTML = `<section class="workstation" data-role="${role}"><h2>${ROLE_LABELS[role]}工作站</h2><p>${ROLE_TASKS[role]}</p><p class="station-state">三名乘員已進入工作站，職位已固定。</p><p class="note">目前版本已提供房間與分工；3D 駕駛及武器操作將在後續工作加入。</p><button class="secondary" id="station-leave">離開房間</button></section>`;
  document.querySelector<HTMLButtonElement>("#station-leave")!.onclick = () => {
    session.leave();
    menu();
  };
}
session.onError = (text) => {
  message.textContent = text;
};
session.onEnded = (text) => {
  menu();
  message.textContent = text;
};
session.onRoom = (room) => {
  message.textContent = "";
  if (room.phase === "lobby") lobby(room);
  else station(room);
};
session.onStart = () => {
  if (session.room) station(session.room);
  if (session.isHost) session.state(JSON.stringify({ stage: "stations" }));
};
window.addEventListener("pagehide", () => session.leave(false));
menu();
