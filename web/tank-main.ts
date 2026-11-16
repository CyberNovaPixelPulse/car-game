import { TANK_RULES, RECONNECT_GRACE_MS, REPAIR_RULES } from "./tank-settings";
import { smokeSight } from "./tank-smoke";
import { ENEMY_LABELS } from "./tank-enemies";
import { MG_FIRE } from "./tank-machine-gun";
import { Session, type Room } from "./network";
import { CREW_ROLES, ROLE_LABELS, ROLE_TASKS, type CrewRole } from "./crew";
import { GameRuntime } from "./game-runtime";
import { TankCore, DRIVE, AIM } from "./tank-core";
import { TankRoleViews } from "./tank-role-views";
import type { SceneQuality } from "./tank-scene-quality";
import { TankMechanicalAudio } from "./tank-mechanical-audio";
import {
  mountBattleNavigation,
  presentBattleNavigation,
} from "./tank-navigation";
import {
  LOAD,
  MODE,
  FIRE,
  SELECT_HE,
  SELECT_AP,
  SELECT_SMOKE,
  SHELL_LABELS,
  CROUCH,
  STOP_JAM,
  JAM_RULES,
} from "./tank-weapons";
import { stationMarkup } from "./tank-station";
import {
  practiceControlsMarkup,
  practiceHint,
  fitPracticePanel,
} from "./tank-practice-ui";
import { PracticeCrew } from "./tank-practice-crew";
import { presentSpeedometer } from "./tank-speedometer";
import { attachFullscreenControl } from "./tank-fullscreen";
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
let practiceCrew: PracticeCrew | undefined;
let practiceHints = true;
const core = new TankCore((slot) =>
  practiceCrew
    ? practiceCrew.roleOf(slot)
    : (session.room?.members.find((m) => m.slot === slot)?.role ?? undefined),
);
const runtime = new GameRuntime(core, session);
const views = new TankRoleViews();
let stationRole: CrewRole | undefined;
let sceneQuality: SceneQuality = "medium";
let disposeFullscreen: (() => void) | undefined;
let practiceMatch: symbol | undefined;
let choosingRole: CrewRole | undefined;
let roomMatch: {
  code: string;
  id: symbol;
  role: CrewRole | null | undefined;
} | undefined;
function roomViewContext(room: Room) {
  const role = room.members.find((member) => member.slot === session.slot)?.role;
  if (roomMatch?.code !== room.code || roomMatch.role !== role) {
    views.clear();
    stationRole = undefined;
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
        current.members.find((member) => member.slot === session.slot)?.role === role &&
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
  disposeFullscreen?.();
  disposeFullscreen = undefined;
  content.after(recovery);
  document.documentElement.dataset.surface = "manual";
  retryButton.hidden = true;
  runtime.clearInput();
  runtime.mode = "idle";
  practiceRole = undefined;
  practiceCrew = undefined;
  practiceMatch = undefined;
  roomMatch = undefined;
  choosingRole = undefined;
  held = 0;
  views.clear();
  stationRole = undefined;
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
  disposeFullscreen?.();
  disposeFullscreen = undefined;
  content.after(recovery);
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
  disposeFullscreen?.();
  disposeFullscreen = undefined;
  content.after(recovery);
  stationRole = undefined;
  if (!preserve) {
    practiceMatch = Symbol();
    practiceRole = role;
    practiceCrew = new PracticeCrew(core, role);
    runtime.startPractice(crypto.getRandomValues(new Uint32Array(1))[0], (dt) =>
      practiceCrew?.step(dt),
    );
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
      if (preserve) practiceCrew!.switchRole(role);
      practiceRole = role;
      stationRole = role;
      message.textContent = "";
      mountPracticeControls();
      if (preserve)
        content
          .querySelector<HTMLDialogElement>("#practice-pause-menu")!
          .showModal();
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

function mountPracticeControls() {
  const surface = content.querySelector<HTMLElement>(".battle-station")!;
  surface.dataset.practice = "true";
  surface.querySelector<HTMLButtonElement>("#station-leave")!.textContent =
    "離開練習";
  surface
    .querySelector(".battle-utility")!
    .insertAdjacentHTML("beforeend", practiceControlsMarkup(practiceRole!));
  surface
    .querySelector(".battle-alerts")!
    .insertAdjacentHTML(
      "beforeend",
      '<p class="hud-panel ai-fire-warning" data-testid="ai-fire-warning" role="status" hidden></p>',
    );
  const hints = content.querySelector<HTMLInputElement>("#practice-hints")!;
  hints.checked = practiceHints;
  hints.onchange = () => {
    practiceHints = hints.checked;
  };
  content.querySelector<HTMLButtonElement>("#practice-exit")!.onclick = menu;
  content
    .querySelectorAll<HTMLButtonElement>("[data-switch-role]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          enterPractice(button.dataset.switchRole as CrewRole, true)),
    );
  const driveButton =
    content.querySelector<HTMLButtonElement>("#practice-drive");
  if (driveButton)
    driveButton.onclick = (event) => {
      if (!practiceCrew) return;
      runtime.setInput(held);
      practiceCrew.driverStopped = !practiceCrew.driverStopped;
      driveButton.textContent = practiceCrew.driverStopped
        ? "恢復 AI 駕駛"
        : "AI 停車";
      if (event.detail > 0) driveButton.blur();
    };
  const fireButton = content.querySelector<HTMLButtonElement>("#practice-fire");
  if (fireButton)
    fireButton.onclick = (event) => {
      if (!practiceCrew) return;
      runtime.setInput(held);
      practiceCrew.firing = !practiceCrew.firing;
      fireButton.textContent = practiceCrew.firing
        ? "暫停 AI 開火"
        : "恢復 AI 開火";
      if (event.detail > 0) fireButton.blur();
    };
  const shellSelect =
    content.querySelector<HTMLSelectElement>("#practice-shell");
  if (shellSelect && practiceCrew) shellSelect.value = practiceCrew.shell;
  if (driveButton && practiceCrew)
    driveButton.textContent = practiceCrew.driverStopped
      ? "恢復 AI 駕駛"
      : "AI 停車";
  if (fireButton && practiceCrew)
    fireButton.textContent = practiceCrew.firing
      ? "暫停 AI 開火"
      : "恢復 AI 開火";
  if (shellSelect)
    shellSelect.onchange = () => {
      runtime.setInput(held);
      const shell = shellSelect.value;
      if (
        practiceCrew &&
        (shell === "he" || shell === "ap" || shell === "smoke")
      )
        practiceCrew.shell = shell;
    };
  content.querySelector<HTMLButtonElement>("#practice-round")!.onclick = (
    event,
  ) => {
    runtime.setInput(held);
    core.startPracticeRound();
    if (event.detail > 0) (document.activeElement as HTMLElement)?.blur();
  };
  content.querySelector<HTMLButtonElement>("#practice-restart")!.onclick = () =>
    enterPractice(practiceRole!);
  const returnButton =
    content.querySelector<HTMLButtonElement>("#battle-return")!;
  returnButton.textContent = "重新開始練習";
  returnButton.onclick = () => enterPractice(practiceRole!);
  content.querySelector<HTMLButtonElement>("#practice-pause")!.onclick = () => {
    releaseControlsForPause();
    content
      .querySelector<HTMLDialogElement>("#practice-pause-menu")!
      .showModal();
  };
  const pauseMenu = content.querySelector<HTMLDialogElement>(
    "#practice-pause-menu",
  )!;
  pauseMenu.oncancel = (event) => {
    event.preventDefault();
    content.querySelector<HTMLButtonElement>("#practice-resume")!.click();
  };
  content.querySelector<HTMLButtonElement>("#practice-resume")!.onclick =
    () => {
      held = 0;
      runtime.pausePractice(false);
      content.querySelector<HTMLDialogElement>("#practice-pause-menu")!.close();
      (document.activeElement as HTMLElement)?.blur();
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
  mechanicalAudio.reset();
  soundedShot = 0;
  soundedStun = 0;
  soundedDamage = -100;
  content.innerHTML = stationMarkup(role, soundEnabled);
  const stationElement = content.querySelector<HTMLElement>(".battle-station")!;
  // Keep the live status and retry handler inside the browser's fullscreen
  // surface; menu/lobby move the same nodes out before replacing this station.
  stationElement.append(recovery);
  disposeFullscreen?.();
  disposeFullscreen = attachFullscreenControl(stationElement);
  mountBattleNavigation(content.querySelector(".battle-station")!);
  if (role === "loader") {
    const interiorViewport =
      content.querySelector<HTMLElement>(".interior-viewport")!;
    interiorViewport.insertAdjacentHTML(
      "beforeend",
      `<section class="repair-workspace" aria-label="車內維修" hidden>
        <h3>車體維修</h3>
        <p class="repair-readout" data-testid="repair-status" role="status"></p>
        <p class="repair-requirements">停車並停止轉向，按住 <kbd>R</kbd> 維修</p>
        <p class="repair-requirements">每秒回復 2 HP · 不需耗材 · 上限 100 HP</p>
        <div class="repair-calibration" data-testid="repair-calibration" role="group" aria-label="維修時機校準" hidden>
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <circle class="calibration-track" cx="100" cy="100" r="76"/>
            <circle class="calibration-zone" cx="100" cy="100" r="76" pathLength="1"/>
            <circle class="calibration-perfect" cx="100" cy="100" r="76" pathLength="1"/>
            <line class="calibration-needle" x1="100" y1="110" x2="100" y2="16"/>
            <circle class="calibration-hub" cx="100" cy="100" r="5"/>
          </svg>
          <p>按住 <kbd>R</kbd> 維修 · <kbd>空白鍵</kbd> 校準</p>
          <p class="calibration-position" data-testid="repair-calibration-position"></p>
        </div>
        <p class="repair-controls">按住 <kbd>C</kbd> 蹲下避殼 · <kbd>Tab</kbd> 返回裝填</p>
      </section>`,
    );
  }
  const qualitySelect =
    content.querySelector<HTMLSelectElement>("#station-quality")!;
  qualitySelect.value = sceneQuality;
  qualitySelect.onchange = () => {
    const quality = qualitySelect.value;
    if (quality !== "low" && quality !== "medium" && quality !== "high") return;
    sceneQuality = quality;
    views.setQuality(quality);
  };
  const soundButton =
    content.querySelector<HTMLButtonElement>("#station-sound");
  if (soundButton)
    soundButton.onclick = (event) => {
      soundEnabled = !soundEnabled;
      soundButton.textContent = `音效：${soundEnabled ? "開" : "關"}`;
      soundButton.setAttribute("aria-pressed", String(soundEnabled));
      if (event.detail > 0) soundButton.blur();
    };
  content.querySelector<HTMLButtonElement>("#battle-return")!.onclick = () =>
    session.returnToLobby();
  document.querySelector<HTMLButtonElement>("#station-leave")!.onclick = () => {
    session.leave();
    menu();
  };
  // A lobby button may have scrolled a short viewport. Enter the station at its HUD.
  window.scrollTo(0, 0);
  return stationElement;
}

function onlineStation(room: Room) {
  const context = roomViewContext(room);
  if (!context || stationRole === context.role) return;
  const surface = station(context.role);
  stationRole = context.role;
  if (!views.mount(context, surface))
    views.restore(context, surface, core.view(), error);
}

core.present = (state) => {
  if (!stationRole) return;
  presentBattleNavigation(content, state);
  if (practiceRole) {
    const hint = content.querySelector<HTMLElement>(
      "[data-testid=practice-hint]",
    );
    if (hint) {
      hint.hidden = !practiceHints;
      hint.textContent = practiceHint(state, practiceRole);
    }
    const warning = content.querySelector<HTMLElement>(
      "[data-testid=ai-fire-warning]",
    );
    if (warning && practiceCrew) {
      warning.textContent = practiceCrew.gunnerStatus.startsWith("即將開火")
        ? practiceCrew.gunnerStatus
        : "";
      warning.hidden = !warning.textContent;
    }
    const status = content.querySelector("[data-testid=practice-status]");
    const driver = content.querySelector("[data-testid=ai-driver-status]");
    if (driver && practiceCrew) driver.textContent = practiceCrew.driverStatus;
    const gunner = content.querySelector("[data-testid=ai-gunner-status]");
    if (gunner && practiceCrew) gunner.textContent = practiceCrew.gunnerStatus;
    const loader = content.querySelector("[data-testid=ai-loader-status]");
    if (loader && practiceCrew) loader.textContent = practiceCrew.loaderStatus;
    const active = state.weapon.targets.some((target) => target.hp > 0);
    if (status)
      status.textContent = state.battle.failed
        ? "練習失敗・可重新開始"
        : core.practiceRound === 0
          ? "等待交戰・自由練習"
          : `第 ${core.practiceRound} 輪・${active ? "交戰中" : "目標已擊毀・等待下一輪"}`;
    const round = content.querySelector<HTMLButtonElement>("#practice-round");
    if (round) {
      round.disabled = active || runtime.paused || state.battle.failed;
      round.textContent = active
        ? "交戰中"
        : core.practiceRound
          ? "下一輪"
          : "開始交戰";
    }
  }
  const wave = content.querySelector('[data-testid="wave-status"]');
  if (wave)
    wave.textContent = `第 ${state.battle.wave} / ${TANK_RULES.waves} 波 · 目前觀測敵車 ${state.intel.contacts.filter((e) => e.hp > 0 && e.visible).length}${state.intel.contacts.some((e) => e.hp > 0 && !e.visible) ? ` · 舊情報 ${state.intel.contacts.filter((e) => e.hp > 0 && !e.visible).length}` : ""}`;
  if (wave && practiceRole) wave.textContent = "單人練習・一位真人與兩位 AI";
  const speed = content.querySelector('[data-testid="tank-speed"]');
  if (speed) speed.textContent = Math.abs(state.tank.speed).toFixed(1);
  presentSpeedometer(content, state.tank.speed);
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
  const damageWarning = content.querySelector<HTMLElement>(
    '[data-testid="damage-warning"]',
  );
  if (damageWarning)
    damageWarning.textContent = state.battle.lastDamage
      ? `敵彈命中！車體受損 ${state.battle.lastDamage}`
      : "";
  const result = content.querySelector<HTMLElement>(
    '[data-testid="battle-result"]',
  );
  if (result) {
    const enteringResult =
      result.hidden && (state.battle.failed || state.battle.won);
    result.hidden = !state.battle.failed && !state.battle.won;
    result.textContent = state.battle.failed ? "戰鬥失敗" : "戰鬥勝利";
    result.dataset.outcome = state.battle.failed ? "failed" : "won";
    content.querySelector<HTMLElement>(".battle-outcome")!.hidden =
      result.hidden;
    if (enteringResult) window.scrollTo(0, 0);
  }
  const returnButton =
    content.querySelector<HTMLButtonElement>("#battle-return");
  if (returnButton)
    returnButton.hidden = !state.battle.failed && !state.battle.won;
  if (
    (state.battle.failed || state.battle.won) &&
    session.isHost &&
    session.room?.phase === "battle"
  )
    runtime.finish();
  content
    .querySelector<HTMLElement>(".battle-station")
    ?.classList.toggle("under-fire", state.time - state.battle.lastHitAt < 1);
  if (state.battle.lastHitAt !== soundedDamage && state.battle.lastDamage) {
    warningTone(true);
    soundedDamage = state.battle.lastHitAt;
  }
  const sight = smokeSight(
    state.weapon.smoke,
    state.tank,
    stationRole === "loader" ? state.weapon.mg : state.turret,
    stationRole === "loader",
    state.time,
  );
  const smokeStatus = content.querySelector('[data-testid="smoke-status"]');
  if (smokeStatus)
    smokeStatus.textContent = sight.obscured ? "煙幕遮蔽視線" : "視線清晰";
  const enemyWarning = content.querySelector('[data-testid="enemy-warning"]');
  if (enemyWarning)
    enemyWarning.textContent = state.intel.contacts
      .filter((e) => e.visible && e.hp > 0 && e.phase === "warning")
      .map((e) => `${ENEMY_LABELS[e.kind]} 正在瞄準，即將開火！移動或尋找掩護`)
      .join("；");
  const calibration = state.repair.calibration;
  const calibrationMessages = {
    idle: "",
    active: `維修校準中${calibration.suspended ? "・重新按住 R 續接" : ""}`,
    success: "校準成功・額外 +1 HP",
    perfect: "完美校準・額外 +3 HP",
    failed:
      state.time < state.repair.failureUntil
        ? "校準失敗・停修兩秒"
        : "上次校準失敗・停修已結束",
  };
  const calibrationResult = content.querySelector<HTMLElement>(
    '[data-testid="repair-calibration-result"]',
  )!;
  calibrationResult.hidden = calibration.result === "idle";
  calibrationResult.querySelector(".calibration-result-message")!.textContent =
    calibrationMessages[calibration.result];
  // The visible shared needle is useful crew information. Keep rapid degree
  // updates outside the live status so assistive tech announces each result once.
  calibrationResult.querySelector(".calibration-shared-needle")!.textContent =
    calibration.result === "active"
      ? `・指針 ${((calibration.elapsed / REPAIR_RULES.calibrationDuration) * 360).toFixed(0)}°`
      : "";
  const weapon = state.weapon;
  const stunned = state.time < weapon.stunnedUntil;
  if (stationRole === "loader") {
    mechanicalAudio.present(state, warningAudio, soundEnabled);
    if (weapon.chamber === "ejecting" && weapon.shotsFired !== soundedShot) {
      warningTone(false);
      soundedShot = weapon.shotsFired;
    }
    if (stunned && weapon.stunnedUntil !== soundedStun) {
      warningTone(true);
      soundedStun = weapon.stunnedUntil;
    }
    content.querySelector('[data-testid="loader-mode"]')!.textContent =
      weapon.mode === "loading"
        ? "裝填模式"
        : weapon.mode === "machine-gun"
          ? "機槍模式"
          : "維修模式";
    content.querySelector<HTMLElement>(".repair-workspace")!.hidden =
      weapon.mode !== "repair";
    const calibrationPanel = content.querySelector<HTMLElement>(
      '[data-testid="repair-calibration"]',
    )!;
    calibrationPanel.hidden = calibration.result !== "active";
    const target = calibration.target * 360;
    const width = REPAIR_RULES.calibrationWidth * 360;
    const perfectWidth = REPAIR_RULES.perfectWidth * 360;
    const perfectStart = target + (width - perfectWidth) / 2;
    const needle =
      (calibration.elapsed / REPAIR_RULES.calibrationDuration) * 360;
    calibrationPanel.querySelector<SVGElement>(
      ".calibration-zone",
    )!.style.strokeDasharray = `${REPAIR_RULES.calibrationWidth} 1`;
    calibrationPanel.querySelector<SVGElement>(
      ".calibration-zone",
    )!.style.transform = `rotate(${target - 90}deg)`;
    calibrationPanel.querySelector<SVGElement>(
      ".calibration-perfect",
    )!.style.strokeDasharray = `${REPAIR_RULES.perfectWidth} 1`;
    calibrationPanel.querySelector<SVGElement>(
      ".calibration-perfect",
    )!.style.transform = `rotate(${perfectStart - 90}deg)`;
    calibrationPanel.querySelector<SVGElement>(
      ".calibration-needle",
    )!.style.transform = `rotate(${needle}deg)`;
    calibrationPanel.querySelector(
      '[data-testid="repair-calibration-position"]',
    )!.textContent =
      `指針 ${needle.toFixed(0)}° · 目標 ${target.toFixed(0)}°–${(target + width).toFixed(0)}° · 完美 ${perfectStart.toFixed(0)}°–${(perfectStart + perfectWidth).toFixed(0)}°`;
    const repairMessages = {
      inactive: "切換維修模式開始工作",
      destroyed: "坦克已毀・無法維修復活",
      stunned: "彈殼命中・暈眩中無法維修",
      crouching: "蹲下避險・暫停維修",
      moving: "停車並停止轉向後才能維修",
      waiting: `${state.repair.failureUntil > state.battle.lastHitAt + REPAIR_RULES.damageWait ? "校準失敗等待" : "受擊等待"}・${Math.max(0, state.repair.blockedUntil - state.time).toFixed(1)} 秒後可維修`,
      full: "車體完好・100 / 100 HP",
      ready: "已停穩・按住 R 維修",
      repairing: "維修中・每秒回復 2 HP",
    };
    content.querySelector('[data-testid="repair-status"]')!.textContent =
      repairMessages[state.repair.status];
    content.querySelector<HTMLElement>(".battle-intel")!.hidden =
      weapon.mode !== "machine-gun";
    content.querySelector<HTMLElement>(".loading-workspace")!.hidden =
      weapon.mode === "machine-gun";
    content.querySelector<HTMLElement>(".battle-work")!.hidden =
      weapon.mode === "machine-gun";
    content.querySelector<HTMLElement>(".loading-help")!.hidden =
      weapon.mode !== "loading";
    content.querySelector('[data-testid="mg-heading"]')!.textContent =
      `${degrees((state.tank.yaw + weapon.mg.yaw) % (Math.PI * 2))}°`;
    content.querySelector('[data-testid="mg-pitch"]')!.textContent =
      `${degrees(weapon.mg.pitch)}°`;
    const overheated = state.time < weapon.mg.coolUntil;
    content
      .querySelector<HTMLElement>(".mg-hud")!
      .toggleAttribute("data-overheated", overheated);
    content.querySelector('[data-testid="mg-heat"]')!.textContent = String(
      Math.round(weapon.mg.heat * 100),
    );
    content.querySelector<HTMLProgressElement>(
      'progress[aria-label="機槍熱度"]',
    )!.value = weapon.mg.heat * 100;
    content.querySelector('[data-testid="mg-status"]')!.textContent = stunned
      ? "暈眩・無法射擊"
      : weapon.crouching
        ? "蹲下・無法射擊"
        : overheated
          ? "過熱・強制冷卻"
          : "可以射擊";
    content.querySelector('[data-testid="mg-cooldown"]')!.textContent =
      overheated ? `${(weapon.mg.coolUntil - state.time).toFixed(1)} 秒` : "";
    content.querySelector('[data-testid="mg-shot-count"]')!.textContent =
      String(weapon.mg.shots);
    content.querySelector('[data-testid="mg-target-status"]')!.textContent =
      state.intel.contacts
        .map(
          (t) =>
            `${ENEMY_LABELS[t.kind]} ${t.hp}/${t.maxHp}${t.visible ? " · 目前觀測" : ` · 最後已知 · ${(state.time - t.observedAt).toFixed(1)} 秒前`}`,
        )
        .join("；") || "目前沒有觀測到敵車";
    const workspace = content.querySelector<HTMLElement>(".loader-workspace");
    if (workspace)
      workspace.dataset.posture = stunned
        ? "stunned"
        : weapon.crouching
          ? "crouching"
          : "standing";
  }
  const weaponText = {
    empty: "空膛",
    loading: "裝填中",
    loaded: "主炮就緒",
    ejecting: "正在退殼",
  };
  const updates: Record<string, string> = {
    "tank-health": `${Math.round(state.tank.hp * 10) / 10}/${TANK_RULES.maxHp}`,
    "selected-shell": SHELL_LABELS[weapon.selectedShell],
    "chamber-shell": weapon.chamberShell
      ? `${SHELL_LABELS[weapon.chamberShell]}（已鎖定）`
      : "無",
    "loader-status": stunned
      ? "彈殼命中・暈眩，全部操作暫停"
      : weapon.crouching
        ? "蹲下避險・無法工作"
        : weapon.stunnedUntil > 0 && state.time < weapon.stunnedUntil + 2
          ? "已恢復・可以工作"
          : "站立・可以工作",
    "stun-remaining": stunned
      ? `${(Math.ceil((weapon.stunnedUntil - state.time) * 10) / 10).toFixed(1)} 秒`
      : "",
    "ejection-warning":
      weapon.chamber === "ejecting" ? "彈殼即將退出！按住 C 蹲下避開" : "",
    "chamber-state": weapon.jam.active ? "卡彈" : weaponText[weapon.chamber],
    "load-progress": String(Math.round(weapon.loadProgress * 100)),
    "shot-count": String(weapon.shotsFired),
    "enemy-activity": [
      ...new Set(
        state.intel.contacts
          .filter((t) => t.visible && t.hp > 0)
          .map((t) =>
            t.phase === "searching"
              ? "觀測敵車搜尋中"
              : t.phase === "blind-fire"
                ? "敵車失去視線，短暫瞄準最後已見位置"
                : "",
          )
          .filter(Boolean),
      ),
    ].join("；"),
    "target-status":
      state.intel.contacts
        .map((t) =>
          t.visible
            ? `${ENEMY_LABELS[t.kind]} ${t.hp}/${t.maxHp} · ${t.hp <= 0 ? "已擊毀" : t.hp === t.maxHp ? "完好" : "受損"} · ${t.hp <= 0 ? "殘骸" : { approaching: "接近中", aiming: "轉砲瞄準", warning: "瞄準預告", reloading: "重新裝填", "blind-fire": "最後位置射擊", searching: "搜尋中" }[t.phase]}`
            : `${ENEMY_LABELS[t.kind]} ${t.hp}/${t.maxHp} · 最後已知 · ${(state.time - t.observedAt).toFixed(1)} 秒前`,
        )
        .join("；") || "目前沒有觀測到敵車",
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
  const jam = content.querySelector<HTMLElement>(".jam-game");
  if (jam) {
    jam.querySelector("h3")!.textContent =
      weapon.jam.result === "cleared" ? "故障已排除" : "卡彈：停在目標區";
    jam.hidden =
      weapon.mode !== "loading" ||
      (!weapon.jam.active && weapon.jam.result !== "cleared");
    const zone = jam.querySelector<HTMLElement>(".jam-zone")!;
    zone.style.left = `${weapon.jam.zone * 100}%`;
    zone.style.width = `${JAM_RULES.width * 100}%`;
    jam.querySelector<HTMLElement>(".jam-needle")!.style.left =
      `${weapon.jam.needle * 100}%`;
    jam.querySelector<HTMLElement>('[data-testid="jam-result"]')!.textContent =
      weapon.jam.result === "cleared"
        ? "解除成功，繼續裝填"
        : weapon.jam.result === "failed"
          ? `未命中，重試倒數 ${Math.max(0, weapon.jam.retryAt - state.time).toFixed(1)} 秒`
          : "按空白鍵停針";
  }
  views.render(state);
  if (practiceRole) fitPracticePanel(content, practiceRole);
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
  if (stationRole === "loader" && event.code === "Tab") {
    event.preventDefault();
    if (!event.repeat) runtime.action(MODE);
    return;
  }
  if (stationRole === "loader" && ["1", "2", "3"].includes(event.key)) {
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
  if (stationRole === "loader" && event.code === "Space") {
    event.preventDefault();
    // Send the physical held key even before a mode snapshot arrives. The host
    // decides whether it means MG fire or a jam stop in the ordered action path.
    if (event.repeat) return;
    held |= MG_FIRE;
    runtime.setInput(held);
    if (!event.repeat) runtime.action(STOP_JAM);
    return;
  }
  if (stationRole === "gunner") {
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
  if (stationRole !== "driver" && stationRole !== "loader") return;
  const key =
    stationRole === "loader"
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
    stationRole === "gunner"
      ? aimKeys[event.code]
      : event.code === "Space"
        ? MG_FIRE
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
  const panel = content.querySelector<HTMLElement>(
    '[data-testid="battle-pause"]',
  );
  if (!panel) return;
  const enteringPause = panel.hidden && runtime.paused;
  panel.hidden = !runtime.paused;
  if (enteringPause) window.scrollTo(0, 0);
  if (runtime.paused) {
    const missing = session.room!.members.filter((member) => !member.connected);
    const remaining = Math.max(
      0,
      Math.ceil(
        ((session.room!.reconnectDeadline ?? Date.now() + RECONNECT_GRACE_MS) -
          Date.now()) /
          1000,
      ),
    );
    const text = `戰鬥暫停・等待${missing.map((member) => `${member.role ? ROLE_LABELS[member.role] : "乘員"} ${member.name}`).join("、")}重新連線，剩餘 ${remaining} 秒。所有操作與戰況已凍結。`;
    if (panel.textContent !== text) panel.textContent = text;
  }
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
    if (stationRole) roomMatch = undefined;
    roomViewContext(room);
    mechanicalAudio.reset();
    stationRole = undefined;
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
  disposeFullscreen?.();
  views.clear();
  session.leave(false);
});
menu();

void session.resumeSaved();
