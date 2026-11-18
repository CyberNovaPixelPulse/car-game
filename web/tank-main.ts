import { RECONNECT_GRACE_MS } from "./tank-settings";
import { MG_FIRE, BOW_FIRE } from "./tank-machine-gun";
import { Session, type Room } from "./network";
import { CREW_ROLES, ROLE_LABELS, ROLE_TASKS, type CrewRole } from "./crew";
import { GameRuntime } from "./game-runtime";
import { DRIVE, AIM, type TankState } from "./tank-core";
import { TankRoleViews } from "./tank-role-views";
import type { SceneQuality } from "./tank-scene-quality";
import { TankMechanicalAudio } from "./tank-mechanical-audio";
import { TankVehicleAudio } from "./tank-vehicle-audio";
import {
  LOAD,
  MODE,
  FIRE,
  SELECT_HE,
  SELECT_AP,
  SELECT_SMOKE,
  CROUCH,
  STOP_JAM,
} from "./tank-weapons";
import { mountStation } from "./tank-station";
import type { PracticeControls } from "./tank-practice-ui";
import "./tank.css";

const app = document.querySelector<HTMLDivElement>("#tank-app")!;
app.innerHTML = `<main class="crew-shell"><header><h1>三人坦克合作戰鬥</h1><p class="setting">1944 年・諾曼第</p><p>一台坦克，三個職位。請先和隊友開啟語音通話。</p></header><section id="crew-content" aria-label="房間與職位"></section><div id="crew-recovery"><p id="crew-message" role="status" aria-live="polite"></p><button id="crew-retry" class="secondary" hidden>重新連線</button></div></main>`;
const content = document.querySelector<HTMLElement>("#crew-content")!;
const recovery = document.querySelector<HTMLElement>("#crew-recovery")!;
const message = document.querySelector<HTMLElement>("#crew-message")!;
const retryButton = document.querySelector<HTMLButtonElement>("#crew-retry")!;
const session = new Session();
retryButton.onclick = async () => {
  retryButton.hidden = true;
  await session.resumeSaved();
};
session.onRetryAvailable = () => {
  retryButton.hidden = false;
};
let practiceRole: CrewRole | undefined;
let practiceHints = true;
const runtime = new GameRuntime(session);
const core = runtime.presentation;
const views = new TankRoleViews();
let activeStation: ReturnType<typeof mountStation> | undefined;
function clearStation() {
  vehicleAudio.reset();
  activeStation?.dispose();
  activeStation = undefined;
}
let sceneQuality: SceneQuality = "medium";
let practiceMatch: symbol | undefined;
let choosingRole: CrewRole | undefined;
let roomMatch:
  | {
      code: string;
      id: symbol;
      role: CrewRole | null | undefined;
    }
  | undefined;
function roomViewContext(room: Room) {
  const role = room.members.find(
    (member) => member.slot === session.slot,
  )?.role;
  if (roomMatch?.code !== room.code || roomMatch.role !== role) {
    views.clear();
    clearStation();
    const id = roomMatch?.code === room.code ? roomMatch.id : Symbol();
    roomMatch = { code: room.code, id, role };
  }
  return role ? { match: roomMatch.id, role } : undefined;
}

function prepareVote(room: Room, role: CrewRole) {
  const context = roomViewContext(room);
  if (context?.role !== role) return;
  void views.prepare(context, core.view(), {
    onReady: () => {
      const current = session.room;
      if (
        !choosingRole &&
        current?.code === room.code &&
        current.phase === "lobby" &&
        current.members.find((member) => member.slot === session.slot)?.role ===
          role &&
        roomMatch?.id === context.match
      )
        session.setReady(true);
    },
    onError: (cause) => {
      if (session.room?.phase === "lobby") lobby(session.room);
      error(cause);
    },
  });
  lobby(room);
}
let held = 0;
let warningAudio: AudioContext | undefined;
let soundEnabled = true;
const mechanicalAudio = new TankMechanicalAudio();
const vehicleAudio = new TankVehicleAudio();
let soundedShot = 0;
let soundedStun = 0;
let soundedDamage = -100;
function unlockWarningAudio() {
  warningAudio ??= new AudioContext();
  void warningAudio.resume().catch(() => {});
}
window.addEventListener("pointerdown", unlockWarningAudio);
window.addEventListener("keydown", unlockWarningAudio);
function warningTone(hit: boolean) {
  const audio = warningAudio;
  if (!soundEnabled || !audio || audio.state !== "running") return;
  // The armour-hit sound itself must stay loud; only plain beeps duck the tank.
  if (!hit) vehicleAudio.duck(0.5);
  for (const offset of hit ? [0] : [0, 0.18]) {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const start = audio.currentTime + offset;
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(hit ? 170 : 740, start);
    oscillator.frequency.exponentialRampToValueAtTime(
      hit ? 70 : 490,
      start + 0.13,
    );
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.16, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.18);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
}
const escape = (text: string) => {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
};
const error = (e: unknown) => {
  message.textContent = e instanceof Error ? e.message : String(e);
};
type SeatState = "free" | "taken" | "mine";
// Seat markers sit where each crew member works in an M4 seen from above, front up.
const SEAT_POINTS: Record<CrewRole, [number, number]> = {
  driver: [92, 74],
  gunner: [150, 176],
  loader: [90, 176],
};
const LEADER_ENDS = [17, 147, 277];
function hullPlate(states: Record<CrewRole, SeatState>) {
  const seats = CREW_ROLES.map((role, i) => {
    const [x, y] = SEAT_POINTS[role];
    return `<g class="seat seat-${states[role]}"><circle cx="${x}" cy="${y}" r="15"/><text x="${x}" y="${y + 6}">${i + 1}</text></g>`;
  }).join("");
  // Leader lines run from each seat to its numbered entry in the key beside the figure.
  const leaders = CREW_ROLES.map((role, i) => {
    const [x, y] = SEAT_POINTS[role];
    const end = LEADER_ENDS[i];
    return `<path d="M${x + 15} ${y} L232 ${end} H300"/>`;
  }).join("");
  return `<figure class="hull-plate"><svg viewBox="0 0 300 340" role="img" aria-label="乘員位置示意：1 駕駛在車體左前，2 砲手在砲塔右側，3 裝填手在砲塔左側"><g class="hull-lines"><rect x="34" y="20" width="16" height="290"/><rect x="190" y="20" width="16" height="290"/><path d="M50 40 Q50 22 70 22 H170 Q190 22 190 40 V300 H50Z"/><circle cx="120" cy="176" r="62"/><rect x="113" y="0" width="14" height="116"/><path d="M60 110 H180" class="dash"/><rect x="70" y="56" width="44" height="36"/><rect x="126" y="56" width="44" height="36" class="dash"/></g><g class="leaders">${leaders}</g><g class="track-links">${Array.from({ length: 14 }, (_, i) => `<path d="M34 ${36 + i * 20}h16M190 ${36 + i * 20}h16"/>`).join("")}</g>${seats}</svg><figcaption>圖 1　M4 中型戰車乘員位置，前方朝上（示意，未依比例）</figcaption></figure>`;
}
function menu() {
  clearStation();
  document.documentElement.dataset.surface = "manual";
  retryButton.hidden = true;
  runtime.clearInput();
  runtime.mode = "idle";
  practiceRole = undefined;
  practiceMatch = undefined;
  roomMatch = undefined;
  choosingRole = undefined;
  held = 0;
  views.clear();
  content.innerHTML = `<div class="plate-layout"><div class="plate-figure">${hullPlate({ driver: "free", gunner: "free", loader: "free" })}<ol class="plate-legend">${CREW_ROLES.map((role) => `<li><strong>${ROLE_LABELS[role]}</strong>${ROLE_TASKS[role]}</li>`).join("")}</ol></div><div class="plate-panel"><h2>與隊友集合</h2><form id="crew-create"><label for="crew-name">乘員名稱</label><input id="crew-name" maxlength="16" autocomplete="nickname" required><button type="submit">建立房間</button></form><p class="plate-or">或加入隊友的房間</p><form id="crew-join"><label for="crew-code">房間代碼</label><div class="join-line"><input id="crew-code" maxlength="6" autocomplete="off" autocapitalize="characters" required><button type="submit" class="secondary">加入房間</button></div></form><p class="note">多人需要三位玩家、三台電腦與實體鍵盤。</p><hr><h2>自己熟悉操作</h2><p>一人上車，練習三個職位。</p><button id="practice-entry" type="button">單人練習</button></div></div>`;
  window.scrollTo(0, 0);
  content.querySelector<HTMLButtonElement>("#practice-entry")!.onclick = () =>
    practiceMenu();
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
  clearStation();
  document.documentElement.dataset.surface = "manual";
  const me = room.members.find((m) => m.slot === session.slot);
  if (choosingRole === me?.role) choosingRole = undefined;
  const complete =
    room.members.length === 3 &&
    room.members.every((m) => m.connected && m.role && m.ready);
  const seatStates = Object.fromEntries(
    CREW_ROLES.map((role) => {
      const owner = room.members.find((m) => m.role === role);
      return [
        role,
        !owner ? "free" : owner.slot === session.slot ? "mine" : "taken",
      ];
    }),
  ) as Record<CrewRole, SeatState>;
  content.innerHTML = `<div class="plate-layout"><fieldset class="plate-figure"><legend>選擇你的職位</legend>${hullPlate(seatStates)}<ol class="plate-legend">${CREW_ROLES.map(
    (role) => {
      const owner = room.members.find((m) => m.role === role);
      const state = seatStates[role];
      return `<li class="role-option" data-state="${state}"><button type="button" data-role="${role}" aria-pressed="${me?.role === role}" ${state === "taken" || choosingRole ? "disabled" : ""}>擔任${ROLE_LABELS[role]}</button><p>${ROLE_TASKS[role]}</p><p class="seat-owner">${state === "mine" ? "你已擔任" : owner ? `目前由 ${escape(owner.name)} 擔任。` : "空位"}</p></li>`;
    },
  ).join(
    "",
  )}</ol></fieldset><div class="plate-panel"><div class="room-heading"><h2>乘員集合</h2><p>房間代碼・念給隊友 <strong data-testid="room-code">${room.code}</strong></p></div><p class="crew-count">${room.members.length}／3 就位・${room.members.filter((m) => m.ready).length} 人已準備</p><div class="crew-head" aria-hidden="true"><span>位置</span><span>乘員</span><span>職位</span><span>狀態</span></div><ul class="crew-list" data-testid="crew-list">${room.members.map((m) => `<li${m.slot === session.slot ? ' class="is-me"' : ""}><span class="crew-seat">${m.role ? CREW_ROLES.indexOf(m.role) + 1 : "—"}</span><strong>${escape(m.name)}${m.slot === 0 ? "（房主）" : ""}${m.slot === session.slot ? "（你）" : ""}</strong><span>${m.role ? ROLE_LABELS[m.role] : "尚未選擇職位"}<span class="visually-hidden"> · </span></span><b class="${m.ready ? "is-ready" : "not-ready"}">${m.ready ? "已準備" : "未準備"}</b></li>`).join("")}</ul>${Array.from({ length: Math.max(0, 3 - room.members.length) }, () => '<p class="crew-open">空位・等待隊友加入</p>').join("")}<div class="room-actions"><button id="crew-ready" ${!me?.role || choosingRole ? "disabled" : ""}>${me?.ready || views.preparing ? "取消準備" : "準備"}</button>${session.isHost ? `<button id="crew-start" ${complete ? "" : "disabled"}>開始戰鬥</button>` : "<p>全員準備後，由房主開始戰鬥。</p>"}<button class="secondary" id="crew-leave">離開房間</button></div>${views.preparing ? '<p role="status">正在準備工作畫面，完成後才會標示已準備；可取消或改選職位。</p>' : ""}<p class="note">${
    complete
      ? "三個職位已就緒。"
      : `等待 ${
          CREW_ROLES.filter((r) => !room.members.some((m) => m.role === r))
            .map((r) => ROLE_LABELS[r])
            .join("、") || "所有乘員準備"
        }。`
  }</p></div></div>`;
  content
    .querySelectorAll<HTMLButtonElement>("[data-role]")
    .forEach((button) => {
      button.onclick = () => {
        const role = button.dataset.role as CrewRole;
        if (role === me?.role) return;
        message.textContent = "";
        choosingRole = role;
        // A guest's role change reaches the host before any later ready vote.
        // Retire the unfinished view before waiting for the room update.
        if (views.preparing) views.clear();
        if (!session.isHost) lobby(room);
        session.chooseRole(role);
      };
    });
  document.querySelector<HTMLButtonElement>("#crew-ready")!.onclick = () => {
    if (views.preparing || me?.ready) {
      views.clear();
      if (me?.ready) session.setReady(false);
      else if (session.room) lobby(session.room);
    } else if (me?.role) prepareVote(room, me.role);
  };
  const start = document.querySelector<HTMLButtonElement>("#crew-start");
  if (start) start.onclick = () => session.start();
  document.querySelector<HTMLButtonElement>("#crew-leave")!.onclick = () => {
    session.leave();
    menu();
    message.textContent = "";
  };
}
function practiceMenu(selected: CrewRole = "driver") {
  session.leave();
  menu();
  content.innerHTML = `<div class="plate-panel practice-select"><h2>單人練習</h2><p>選擇你的職位，其餘兩席由 AI 配合。使用實體鍵盤。</p><fieldset><legend>選擇你的職位</legend>${CREW_ROLES.map((role) => `<button type="button" data-practice-role="${role}" aria-pressed="${role === selected}">擔任${ROLE_LABELS[role]}</button>`).join("")}</fieldset><p>先自由熟悉操作，準備好再開始交戰。</p><button id="practice-begin" type="button">開始練習</button><button id="practice-back" class="secondary" type="button">返回首頁</button></div>`;
  content
    .querySelectorAll<HTMLButtonElement>("[data-practice-role]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          practiceMenu(button.dataset.practiceRole as CrewRole)),
    );
  content.querySelector<HTMLButtonElement>("#practice-begin")!.onclick = () =>
    enterPractice(selected);
  content.querySelector<HTMLButtonElement>("#practice-back")!.onclick = menu;
}

function enterPractice(role: CrewRole, preserve = false) {
  const previousRole = practiceRole;
  if (preserve) runtime.pausePractice(true);
  held = 0;
  clearStation();
  if (!preserve) {
    practiceMatch = Symbol();
    practiceRole = role;
    runtime.startPractice(crypto.getRandomValues(new Uint32Array(1))[0], role);
    runtime.pausePractice(true);
  }
  const context = { match: practiceMatch!, role };
  document.documentElement.dataset.surface = "manual";
  content.innerHTML = `<div class="plate-panel"><h2>單人練習</h2><p role="status">正在準備${ROLE_LABELS[role]}工作畫面…</p><button id="practice-cancel">取消準備</button></div>`;
  content.querySelector<HTMLButtonElement>("#practice-cancel")!.onclick = () =>
    preserve && previousRole
      ? enterPractice(previousRole, true)
      : practiceMenu(role);
  void views.prepare(context, core.view(), {
    onReady: () => {
      const surface = station(role);
      if (!views.mount(context, surface)) return;
      if (preserve) runtime.switchPracticeRole(role);
      practiceRole = role;
      message.textContent = "";
      if (preserve) activeStation?.showPracticePause();
      else runtime.pausePractice(false);
    },
    onError: (e) => {
      if (preserve && previousRole) {
        content.innerHTML = `<div class="plate-panel"><h2>工作畫面準備失敗</h2><p role="status"></p><button id="practice-retry-role">返回原職位並重試準備</button><button id="practice-exit-error">離開練習</button></div>`;
        content.querySelector('[role="status"]')!.textContent =
          e instanceof Error ? e.message : String(e);
        content.querySelector<HTMLButtonElement>(
          "#practice-retry-role",
        )!.onclick = () => enterPractice(previousRole, true);
        content.querySelector<HTMLButtonElement>(
          "#practice-exit-error",
        )!.onclick = menu;
      } else {
        practiceMenu(role);
        message.textContent = `${e instanceof Error ? e.message : e} 請重新開始練習以重試。`;
      }
    },
  });
}

function practiceControls(
  crew: NonNullable<GameRuntime["practice"]>,
): PracticeControls {
  return {
    hints: practiceHints,
    driverStopped: crew.driverStopped,
    firing: crew.firing,
    shell: crew.shell,
    onHints: (enabled) => {
      practiceHints = enabled;
    },
    onToggleDrive: () => {
      runtime.commandPractice({ type: "toggle-driver" });
      return runtime.practice!.driverStopped;
    },
    onToggleFire: () => {
      runtime.commandPractice({ type: "toggle-fire" });
      return runtime.practice!.firing;
    },
    onShell: (shell) => {
      runtime.commandPractice({ type: "select-shell", shell });
    },
    onRound: () => {
      runtime.commandPractice({ type: "start-round" });
    },
    onPause: releaseControlsForPause,
    onResume: () => {
      held = 0;
      runtime.pausePractice(false);
    },
    onSwitchRole: (role) => void enterPractice(role, true),
  };
}
function releaseControlsForPause() {
  runtime.pausePractice(true);
  held = 0;
  // The receipt advances to the click before freezing. Paint that final state
  // now, so the paused HUD cannot retain a pre-click needle until the next rAF.
  core.draw(0);
}

function station(role: CrewRole) {
  document.documentElement.dataset.surface = "battle";
  clearStation();
  mechanicalAudio.reset();
  soundedShot = 0;
  soundedStun = 0;
  soundedDamage = -100;
  const practice = runtime.practice && practiceControls(runtime.practice);
  activeStation = mountStation(content, role, recovery, {
    quality: sceneQuality,
    soundEnabled,
    onQuality: setSceneQuality,
    onSound: (enabled) => {
      soundEnabled = enabled;
    },
    onLeave: practice
      ? menu
      : () => {
          session.leave();
          menu();
        },
    onReturn: practice
      ? () => void enterPractice(role)
      : () => session.returnToLobby(),
    practice,
  });
  const surface = activeStation.element;
  // A lobby button may have scrolled a short viewport. Enter the station at its HUD.
  window.scrollTo(0, 0);
  return surface;
}

function setSceneQuality(quality: SceneQuality) {
  sceneQuality = quality;
  views.setQuality(quality);
}

function onlineStation(room: Room) {
  const context = roomViewContext(room);
  if (!context || activeStation?.role === context.role) return;
  const surface = station(context.role);
  if (!views.mount(context, surface))
    views.restore(context, surface, core.view(), error);
}

function presentBattleAudio(state: TankState, role: CrewRole) {
  if (state.battle.lastHitAt !== soundedDamage && state.battle.lastDamage) {
    warningTone(true);
    soundedDamage = state.battle.lastHitAt;
  }
  vehicleAudio.present(state, warningAudio, {
    role,
    enabled: soundEnabled,
    active: !runtime.paused,
  });
  if (role !== "loader") return;
  mechanicalAudio.present(state, warningAudio, soundEnabled);
  const { weapon, time } = state;
  if (weapon.chamber === "ejecting" && weapon.shotsFired !== soundedShot) {
    warningTone(false);
    soundedShot = weapon.shotsFired;
  }
  if (time < weapon.stunnedUntil && weapon.stunnedUntil !== soundedStun) {
    warningTone(true);
    soundedStun = weapon.stunnedUntil;
  }
}

core.present = (state) => {
  const station = activeStation;
  if (!station) return;
  station.present(
    state,
    runtime.practice && {
      round: runtime.practice.round,
      paused: runtime.paused,
      driverStatus: runtime.practice.driverStatus,
      gunnerStatus: runtime.practice.gunnerStatus,
      loaderStatus: runtime.practice.loaderStatus,
    },
  );
  if (
    (state.battle.failed || state.battle.won) &&
    session.isHost &&
    session.room?.phase === "battle"
  )
    runtime.finish();
  presentBattleAudio(state, station.role);
  views.render(state);
};
const driveKeys: Record<string, number> = {
  w: DRIVE.forward,
  s: DRIVE.reverse,
  a: DRIVE.left,
  d: DRIVE.right,
};
const aimKeys: Record<string, number> = {
  ArrowLeft: AIM.left,
  ArrowRight: AIM.right,
  ArrowUp: AIM.up,
  ArrowDown: AIM.down,
};
window.addEventListener("keydown", (event) => {
  if (
    (runtime.mode !== "online" && runtime.mode !== "practice") ||
    runtime.paused
  )
    return;
  // Let native controls own their keys. Space/Enter activate a display button;
  // Tab navigates it and arrows change a select, without firing or doing work.
  if (
    event.target instanceof Element &&
    event.target.closest(
      "button, summary, input, select, textarea, a[href], [contenteditable]",
    )
  )
    return;
  if (activeStation?.role === "loader" && event.code === "Tab") {
    event.preventDefault();
    if (!event.repeat) runtime.action(MODE);
    return;
  }
  if (activeStation?.role === "loader" && ["1", "2", "3"].includes(event.key)) {
    event.preventDefault();
    if (!event.repeat)
      runtime.action(
        event.key === "1"
          ? SELECT_HE
          : event.key === "2"
            ? SELECT_AP
            : SELECT_SMOKE,
      );
    return;
  }
  if (activeStation?.role === "loader" && event.code === "Space") {
    event.preventDefault();
    // Send the physical held key even before a mode snapshot arrives. The host
    // decides whether it means MG fire or a jam stop in the ordered action path.
    if (event.repeat) return;
    held |= MG_FIRE;
    runtime.setInput(held);
    if (!event.repeat) runtime.action(STOP_JAM);
    return;
  }
  if (activeStation?.role === "gunner") {
    if (event.code === "Space") {
      event.preventDefault();
      if (!event.repeat) runtime.action(FIRE);
      return;
    }
    const key = aimKeys[event.code];
    if (!key) return;
    event.preventDefault();
    if (event.repeat) return;
    held |= key;
    runtime.setInput(held);
    return;
  }
  if (activeStation?.role === "driver" && event.code === "Space") {
    event.preventDefault();
    if (event.repeat) return;
    held |= BOW_FIRE;
    runtime.setInput(held);
    return;
  }
  if (activeStation?.role !== "driver" && activeStation?.role !== "loader")
    return;
  const key =
    activeStation?.role === "loader"
      ? event.key.toLowerCase() === "r"
        ? LOAD
        : event.key.toLowerCase() === "c"
          ? CROUCH
          : driveKeys[event.key.toLowerCase()] || 0
      : driveKeys[event.key.toLowerCase()];
  if (!key) return;
  event.preventDefault();
  if (event.repeat) return;
  held |= key;
  runtime.setInput(held);
});
window.addEventListener("keyup", (event) => {
  const key =
    activeStation?.role === "gunner"
      ? aimKeys[event.code]
      : event.code === "Space"
        ? activeStation?.role === "driver"
          ? BOW_FIRE
          : MG_FIRE
        : event.key.toLowerCase() === "r"
          ? LOAD
          : event.key.toLowerCase() === "c"
            ? CROUCH
            : driveKeys[event.key.toLowerCase()];
  if (!key) return;
  held &= ~key;
  runtime.setInput(held);
});
function releaseControls() {
  held = 0;
  runtime.clearInput();
}
window.addEventListener("blur", releaseControls);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) releaseControls();
});
function frame(now: number) {
  if (runtime.mode === "online" || runtime.mode === "practice") {
    runtime.setViewAspect(views.exteriorAspect);
    runtime.frame(now);
    if (runtime.mode === "online") updatePause();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
session.onError = (text) => {
  if (choosingRole) {
    choosingRole = undefined;
    if (session.room?.phase === "lobby") lobby(session.room);
  }
  message.textContent = text;
};
session.onEnded = (text) => {
  retryButton.hidden = true;
  // A rejected automatic resume must not erase an already usable join form.
  if (!content.querySelector("#crew-join")) menu();
  message.textContent = text;
};
function updatePause() {
  if (!activeStation) return;
  if (!runtime.paused) {
    activeStation.presentPause();
    return;
  }
  const room = session.room!;
  const now = Date.now();
  const remaining = Math.max(
    0,
    Math.ceil(
      ((room.reconnectDeadline ?? now + RECONNECT_GRACE_MS) - now) / 1000,
    ),
  );
  const waitingFor = room.members
    .filter((member) => !member.connected)
    .map(
      (member) =>
        `${member.role ? ROLE_LABELS[member.role] : "乘員"} ${member.name}`,
    );
  activeStation.presentPause({ waitingFor, remaining });
}
runtime.onRoom = (room) => {
  retryButton.hidden = true;
  message.textContent = room.notice ?? "";
  if (room.phase === "lobby") {
    const enteringLobby = !content.querySelector(".room-heading");
    runtime.mode = "idle";
    runtime.clearInput();
    held = 0;
    // Ordinary teammates' ready updates keep the local preparation alive.
    if (activeStation?.role) roomMatch = undefined;
    roomViewContext(room);
    mechanicalAudio.reset();
    clearStation();
    lobby(room);
    if (enteringLobby) window.scrollTo(0, 0);
  } else {
    choosingRole = undefined;
    onlineStation(room);
    if (runtime.paused) {
      held = 0;
      runtime.clearInput();
    }
    updatePause();
  }
};
runtime.onStart = () => {
  if (session.room) onlineStation(session.room);
};
runtime.onRestoreError = error;
window.addEventListener("pagehide", () => {
  clearStation();
  views.clear();
  session.leave(false);
});
menu();

void session.resumeSaved();
