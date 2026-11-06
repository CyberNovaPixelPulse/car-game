import { Session, type Room } from "./network";
import { CREW_ROLES, ROLE_LABELS, ROLE_TASKS } from "./crew";
import { GameRuntime } from "./game-runtime";
import { TankCore, DRIVE, AIM } from "./tank-core";
import { TankScene } from "./tank-scene";
import { LOAD, FIRE, SELECT_HE, SELECT_AP, SHELL_LABELS } from "./tank-weapons";
import "./tank.css";

const app = document.querySelector<HTMLDivElement>("#tank-app")!;
app.innerHTML = `<main class="crew-shell"><header><h1>三人坦克合作戰鬥</h1><p class="setting">1944 年・諾曼第</p><p>一台坦克，三個職位。請先和隊友開啟語音通話。</p></header><section id="crew-content" aria-label="房間與職位"></section><p id="crew-message" role="status" aria-live="polite"></p></main>`;
const content = document.querySelector<HTMLElement>("#crew-content")!;
const message = document.querySelector<HTMLElement>("#crew-message")!;
export const session = new Session("tank");
const core = new TankCore(
  (slot) =>
    session.room?.members.find((m) => m.slot === slot)?.role ?? undefined,
);
const runtime = new GameRuntime(core, session);
let scene: TankScene | undefined;
let stationRole: string | undefined;
let held = 0;
const escape = (text: string) => {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
};
const error = (e: unknown) => {
  message.textContent = e instanceof Error ? e.message : String(e);
};
function menu() {
  runtime.mode = "idle";
  runtime.clearInput();
  held = 0;
  scene?.dispose();
  scene = undefined;
  stationRole = undefined;
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
  if (!role || stationRole === role) return;
  scene?.dispose();
  scene = undefined;
  stationRole = role;
  content.innerHTML = `<section class="workstation battle-station" data-role="${role}"><h2>${ROLE_LABELS[role]}工作站</h2><p>${ROLE_TASKS[role]}</p><p>共用坦克血量 <strong data-testid="tank-health">100/100</strong></p>${role === "gunner" ? '<div class="battle-viewport"><canvas aria-label="主炮戰場視野" role="img"></canvas><span class="sight" aria-hidden="true"></span></div><p class="heading-readout">車身朝向 <strong data-testid="hull-heading">0°</strong> · 砲管朝向 <strong data-testid="turret-heading">0.0°</strong> · 仰角 <strong data-testid="turret-pitch">0.0°</strong></p><p>水平轉速 <strong data-testid="turret-yaw-rate">0.0°/s</strong> · 俯仰轉速 <strong data-testid="turret-pitch-rate">0.0°/s</strong></p><p class="note">連點 A／D 左右、W／S 上下；反方向連點可煞停。按住只推動一次。</p>' : role === "driver" ? '<div class="driver-instruments"><p class="instrument-label">速度</p><p class="speed-readout"><strong data-testid="tank-speed">0.0</strong> m/s</p><p data-testid="tank-motion">靜止</p><p data-testid="tank-contact">車體正常</p></div><p class="note">按住 W／S 前進與倒車，A／D 左右轉向。請聽從隊友指揮。</p>' : '<div class="loader-workspace"><p>車內裝填工作區</p><div class="breech-assembly" aria-label="主炮砲膛與退殼工作區"><div class="breech-tube"></div><div class="breech-block"></div><div class="loading-round"></div></div><p class="note">按 1 選高爆彈、2 選穿甲彈。按住 R 裝填，放開可暫停；開始裝填後鎖定該發彈種。等待砲手開火、退殼後再裝下一發。</p></div>'}${role !== "driver" ? '<div class="weapon-status"><p>選擇：<strong data-testid="selected-shell">高爆彈</strong> · 高爆／穿甲／煙霧備彈無限（煙霧功能待加入）</p><p>膛內：<strong data-testid="chamber-shell">無</strong></p><p data-testid="chamber-state">空膛</p><p>裝填進度 <strong data-testid="load-progress">0</strong>%</p><progress aria-label="裝填進度" max="100" value="0"></progress><p>已發射 <strong data-testid="shot-count">0</strong> 發</p></div>' : ""}${role === "gunner" ? '<p data-testid="target-status">前方練習靶：完好</p><p data-testid="flight-status"></p><p class="note">主炮就緒後，按空白鍵開火。</p>' : ""}${role === "gunner" ? '<p class="vehicle-status">車體速度 <strong data-testid="tank-speed">0.0</strong> m/s · <span data-testid="tank-motion">靜止</span></p><p data-testid="tank-contact">車體正常</p>' : ""}<button class="secondary" id="station-leave">離開房間</button></section>`;
  if (role === "gunner") {
    try {
      scene = new TankScene(content.querySelector("canvas")!);
    } catch {
      message.textContent =
        "無法啟動 3D 戰場，請使用支援 WebGL2 的瀏覽器重新加入。";
    }
  }
  document.querySelector<HTMLButtonElement>("#station-leave")!.onclick = () => {
    session.leave();
    menu();
  };
}
core.present = (state) => {
  if (!stationRole) return;
  const speed = content.querySelector('[data-testid="tank-speed"]');
  if (speed) speed.textContent = Math.abs(state.tank.speed).toFixed(1);
  const motion = content.querySelector('[data-testid="tank-motion"]');
  if (motion)
    motion.textContent = state.tank.blocked
      ? "受阻"
      : Math.abs(state.tank.speed) < 0.05
        ? "靜止"
        : state.tank.speed > 0
          ? "前進"
          : "倒車";
  const contact = content.querySelector('[data-testid="tank-contact"]');
  if (contact)
    contact.textContent = state.tank.blocked ? "車體受阻" : "車體正常";
  const heading = content.querySelector('[data-testid="hull-heading"]');
  if (heading)
    heading.textContent = `${Math.round((state.tank.yaw * 180) / Math.PI) % 360}°`;
  const degrees = (angle: number) => ((angle * 180) / Math.PI).toFixed(1);
  const readouts: Record<string, string> = {
    "turret-heading": `${degrees((state.tank.yaw + state.turret.yaw) % (Math.PI * 2))}°`,
    "turret-pitch": `${degrees(state.turret.pitch)}°`,
    "turret-yaw-rate": `${degrees(state.turret.yawRate)}°/s`,
    "turret-pitch-rate": `${degrees(state.turret.pitchRate)}°/s`,
  };
  for (const [name, text] of Object.entries(readouts)) {
    const el = content.querySelector(`[data-testid="${name}"]`);
    if (el) el.textContent = text;
  }
  const weapon = state.weapon;
  const weaponText = {
    empty: "空膛",
    loading: "裝填中",
    loaded: "主炮就緒",
    ejecting: "正在退殼",
  };
  const updates: Record<string, string> = {
    "tank-health": `${state.tank.hp}/100`,
    "selected-shell": SHELL_LABELS[weapon.selectedShell],
    "chamber-shell": weapon.chamberShell
      ? `${SHELL_LABELS[weapon.chamberShell]}（已鎖定）`
      : "無",
    "chamber-state": weaponText[weapon.chamber],
    "load-progress": String(Math.round(weapon.loadProgress * 100)),
    "shot-count": String(weapon.shotsFired),
    "target-status": weapon.targets
      .map(
        (t, i) =>
          `${i === 0 ? "正前靶" : "鄰近靶"} ${t.hp}/200 · ${t.hp <= 0 ? "已擊毀" : t.hp === 200 ? "完好" : "受損"}`,
      )
      .join("；"),
    "flight-status": weapon.projectiles.length
      ? "砲彈飛行中"
      : weapon.impacts.length
        ? "砲彈命中"
        : "",
  };
  for (const [name, text] of Object.entries(updates)) {
    const el = content.querySelector(`[data-testid="${name}"]`);
    if (el) el.textContent = text;
  }
  const progress = content.querySelector<HTMLProgressElement>(
    'progress[aria-label="裝填進度"]',
  );
  if (progress) progress.value = weapon.loadProgress * 100;
  const breech = content.querySelector<HTMLElement>(".breech-assembly");
  if (breech) {
    breech.dataset.chamber = weapon.chamber;
    breech.style.setProperty("--load", String(weapon.loadProgress));
    breech.style.setProperty(
      "--eject",
      String(Math.max(0, 1 - (weapon.ejectAt - state.time) / 0.8)),
    );
  }
  scene?.render(state);
};
const driveKeys: Record<string, number> = {
  w: DRIVE.forward,
  s: DRIVE.reverse,
  a: DRIVE.left,
  d: DRIVE.right,
};
window.addEventListener("keydown", (event) => {
  if (runtime.mode !== "online") return;
  if (stationRole === "loader" && ["1", "2"].includes(event.key)) {
    event.preventDefault();
    if (!event.repeat)
      runtime.action(event.key === "1" ? SELECT_HE : SELECT_AP);
    return;
  }
  if (stationRole === "gunner") {
    const aimKeys: Record<string, number> = {
      a: AIM.left,
      d: AIM.right,
      w: AIM.up,
      s: AIM.down,
      " ": FIRE,
    };
    const action = aimKeys[event.key.toLowerCase()];
    if (action === undefined) return;
    event.preventDefault();
    if (!event.repeat) runtime.action(action);
    return;
  }
  if (stationRole !== "driver" && stationRole !== "loader") return;
  const key =
    stationRole === "loader"
      ? event.key.toLowerCase() === "r"
        ? LOAD
        : 0
      : driveKeys[event.key.toLowerCase()];
  if (!key) return;
  event.preventDefault();
  held |= key;
  runtime.setInput(held);
});
window.addEventListener("keyup", (event) => {
  const key =
    event.key.toLowerCase() === "r" ? LOAD : driveKeys[event.key.toLowerCase()];
  if (!key) return;
  held &= ~key;
  runtime.setInput(held);
});
window.addEventListener("blur", () => {
  held = 0;
  runtime.clearInput();
});
function frame(now: number) {
  if (runtime.mode === "online") runtime.frame(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
session.onError = (text) => {
  message.textContent = text;
};
session.onEnded = (text) => {
  menu();
  message.textContent = text;
};
runtime.onRoom = (room) => {
  message.textContent = "";
  if (room.phase === "lobby") lobby(room);
  else station(room);
};
runtime.onStart = () => {
  if (session.room) station(session.room);
};
runtime.onRestoreError = error;
window.addEventListener("pagehide", () => session.leave(false));
menu();
