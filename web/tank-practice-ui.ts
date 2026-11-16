import { CREW_ROLES, ROLE_LABELS, type CrewRole } from "./crew";
import { battleProjection } from "./tank-battle-view";
import { DRIVER_VIEW } from "./tank-driver-view";
import type { TankState } from "./tank-core";
import type { ShellType } from "./tank-weapons";

export interface PracticeControls {
  hints: boolean;
  driverStopped: boolean;
  firing: boolean;
  shell: ShellType;
  onHints: (enabled: boolean) => void;
  onToggleDrive: () => boolean;
  onToggleFire: () => boolean;
  onShell: (shell: ShellType) => void;
  onRound: () => void;
  onPause: () => void;
  onResume: () => void;
  onSwitchRole: (role: CrewRole) => void;
}

export interface PracticeFrame {
  round: number;
  paused: boolean;
  driverStatus: string;
  gunnerStatus: string;
  loaderStatus: string;
}

function practiceControlsMarkup(role: CrewRole) {
  return `<div class="practice-session-actions"><button id="practice-round" type="button">開始交戰</button><button id="practice-pause" type="button">暫停練習</button></div>
    <details class="practice-controls hud-panel" open><summary><span>練習控制</span><small class="practice-scroll-note">捲動查看 AI 與教學</small></summary>
      <p data-testid="practice-status" role="status"></p>
      ${role !== "driver" ? '<div class="practice-member"><p>AI 駕駛：<span data-testid="ai-driver-status"></span></p><button id="practice-drive" type="button">AI 停車</button></div>' : ""}
      ${role !== "gunner" ? '<div class="practice-member"><p>AI 砲手：<span data-testid="ai-gunner-status"></span></p><button id="practice-fire" type="button">暫停 AI 開火</button></div>' : ""}
      ${role !== "loader" ? '<p>AI 裝填手：<span data-testid="ai-loader-status"></span></p><label>AI 下一發彈種 <select id="practice-shell"><option value="ap">穿甲彈</option><option value="he">高爆彈</option><option value="smoke">煙霧彈</option></select></label>' : ""}
      <label class="practice-teaching"><input id="practice-hints" type="checkbox" checked> 顯示情境教學</label>
      <p class="practice-hint" data-testid="practice-hint" role="status"></p>
    </details>
    <dialog id="practice-pause-menu" class="practice-pause-dialog" aria-labelledby="practice-pause-title">
      <h2 id="practice-pause-title">練習暫停</h2><p>目前職位：${ROLE_LABELS[role]}・戰況已凍結</p>
      <fieldset><legend>切換職位・保留目前戰況</legend>${CREW_ROLES.filter(
        (next) => next !== role,
      )
        .map(
          (next) =>
            `<button type="button" data-switch-role="${next}">切換為${ROLE_LABELS[next]}</button>`,
        )
        .join("")}</fieldset>
      <button id="practice-resume" type="button" autofocus>繼續練習</button>
      <button id="practice-restart" type="button">重新開始練習</button>
      <button id="practice-exit" type="button">離開練習</button>
    </dialog>`;
}

function practiceHint(state: TankState, role: CrewRole) {
  const w = state.weapon;
  if (state.battle.failed)
    return "坦克已被擊毀。重新開始練習即可回到完整初始狀態。";
  if (role === "driver")
    return "按住 W／S 前進與倒車，A／D 轉向。停穩可讓 AI 裝填手維修；準備好再開始交戰。";
  if (role === "gunner")
    return w.chamber === "loaded"
      ? "按住方向鍵瞄準，放開約半秒停下；空白鍵射擊。AI 裝填手會處理下一發。"
      : "按住方向鍵熟悉轉砲與俯仰；等待 AI 裝填手供彈。可指定下一發彈種。";
  if (state.time < w.stunnedUntil)
    return "剛才站立時被退殼擊中，暈眩五秒。下次聽到開火提醒，按住 C 蹲下避殼。";
  if (w.chamber === "ejecting")
    return "彈殼即將退出！按住 C 蹲下；退殼結束後放開起身再工作。";
  if (w.mode === "machine-gun")
    return state.time < w.mg.coolUntil
      ? "機槍過熱，等待三秒冷卻。切換工作不能跳過冷卻。"
      : "按住 WASD 瞄準，空白鍵連射；持續射擊會過熱。Tab 切換維修。";
  if (w.mode === "repair")
    return state.repair.calibration.result === "active"
      ? "持續按住 R，指針到目標區時按空白鍵校準；放開、移動或受擊會中斷。"
      : "停穩後按住 R 維修。受擊後等三秒；Tab 返回裝填。";
  if (w.jam.active)
    return "卡彈！指針到目標區時按空白鍵；失敗等待一秒再試，裝填進度保留。";
  return w.chamber === "loaded"
    ? "主炮已就緒。可恢復 AI 開火；留意開火提醒並按住 C 避殼。"
    : "1 高爆、2 穿甲、3 煙霧；按住 R 裝填，放開保留進度。同發開始後鎖定彈種。";
}

/** Reserve the actual visible work HUD, and keep the driver's optical opening clear. */
function fitPracticePanel(
  panel: HTMLElement,
  surface: HTMLElement,
  role: CrewRole,
  workPanels: HTMLElement[],
) {
  const work = workPanels.find(
    (element) => element.getClientRects().length > 0,
  );
  const box = surface.getBoundingClientRect();
  const bottom = Math.min(
    box.bottom - 16,
    work?.getBoundingClientRect().top ?? box.bottom,
  );
  if (role === "driver") {
    const projection = battleProjection("driver", box.width / box.height);
    const openingBottom =
      box.top +
      (box.height / 2) *
        (1 +
          Math.tan(DRIVER_VIEW.verticalFov / 2) /
            Math.tan(projection.verticalFov / 2));
    const top = `${Math.ceil(openingBottom + 12)}px`;
    if (panel.style.top !== top) panel.style.top = top;
  }
  const height = Math.max(
    60,
    Math.floor(bottom - panel.getBoundingClientRect().top - 12),
  );
  const value = `${height}px`;
  if (panel.style.maxHeight !== value) panel.style.maxHeight = value;
  panel.dataset.scrollable = String(
    panel.scrollHeight > panel.clientHeight + 1,
  );
}

export function mountPracticeControls(
  surface: HTMLElement,
  role: CrewRole,
  controls: PracticeControls,
  onLeave: () => void,
  onRestart: () => void,
) {
  surface.dataset.practice = "true";
  surface
    .querySelector(".battle-utility")!
    .insertAdjacentHTML("beforeend", practiceControlsMarkup(role));
  surface
    .querySelector(".battle-alerts")!
    .insertAdjacentHTML(
      "beforeend",
      '<p class="hud-panel ai-fire-warning" data-testid="ai-fire-warning" role="status" hidden></p>',
    );

  const hints = surface.querySelector<HTMLInputElement>("#practice-hints")!;
  const drive = surface.querySelector<HTMLButtonElement>("#practice-drive");
  const fire = surface.querySelector<HTMLButtonElement>("#practice-fire");
  const shell = surface.querySelector<HTMLSelectElement>("#practice-shell");
  const round = surface.querySelector<HTMLButtonElement>("#practice-round")!;
  const pause = surface.querySelector<HTMLButtonElement>("#practice-pause")!;
  const dialog = surface.querySelector<HTMLDialogElement>(
    "#practice-pause-menu",
  )!;
  const resume = surface.querySelector<HTMLButtonElement>("#practice-resume")!;
  const panel = surface.querySelector<HTMLElement>(".practice-controls")!;
  const workPanels = [
    ...surface.querySelectorAll<HTMLElement>(".battle-work, .battle-mg-work"),
  ];
  const status = surface.querySelector('[data-testid="practice-status"]')!;
  const hint = surface.querySelector<HTMLElement>(
    '[data-testid="practice-hint"]',
  )!;
  const warning = surface.querySelector<HTMLElement>(
    '[data-testid="ai-fire-warning"]',
  )!;
  const driverStatus = surface.querySelector(
    '[data-testid="ai-driver-status"]',
  );
  const gunnerStatus = surface.querySelector(
    '[data-testid="ai-gunner-status"]',
  );
  const loaderStatus = surface.querySelector(
    '[data-testid="ai-loader-status"]',
  );

  const driveLabel = (stopped: boolean) =>
    stopped ? "恢復 AI 駕駛" : "AI 停車";
  const fireLabel = (firing: boolean) =>
    firing ? "暫停 AI 開火" : "恢復 AI 開火";
  hints.checked = controls.hints;
  hints.onchange = () => controls.onHints(hints.checked);
  if (drive) {
    drive.textContent = driveLabel(controls.driverStopped);
    drive.onclick = (event) => {
      drive.textContent = driveLabel(controls.onToggleDrive());
      if (event.detail > 0) drive.blur();
    };
  }
  if (fire) {
    fire.textContent = fireLabel(controls.firing);
    fire.onclick = (event) => {
      fire.textContent = fireLabel(controls.onToggleFire());
      if (event.detail > 0) fire.blur();
    };
  }
  if (shell) {
    shell.value = controls.shell;
    shell.onchange = () => {
      const value = shell.value;
      if (value === "he" || value === "ap" || value === "smoke")
        controls.onShell(value);
    };
  }
  round.onclick = (event) => {
    controls.onRound();
    if (event.detail > 0) (document.activeElement as HTMLElement)?.blur();
  };
  const showPause = () => dialog.showModal();
  pause.onclick = () => {
    controls.onPause();
    showPause();
  };
  dialog.oncancel = (event) => {
    event.preventDefault();
    resume.click();
  };
  resume.onclick = () => {
    controls.onResume();
    dialog.close();
    (document.activeElement as HTMLElement)?.blur();
  };
  for (const button of dialog.querySelectorAll<HTMLButtonElement>(
    "[data-switch-role]",
  )) {
    button.onclick = () =>
      controls.onSwitchRole(button.dataset.switchRole as CrewRole);
  }

  dialog.querySelector<HTMLButtonElement>("#practice-exit")!.onclick = onLeave;
  dialog.querySelector<HTMLButtonElement>("#practice-restart")!.onclick =
    onRestart;

  return {
    showPause,
    present(state: TankState, frame: PracticeFrame) {
      hint.hidden = !hints.checked;
      hint.textContent = practiceHint(state, role);
      warning.textContent = frame.gunnerStatus.startsWith("即將開火")
        ? frame.gunnerStatus
        : "";
      warning.hidden = !warning.textContent;
      if (driverStatus) driverStatus.textContent = frame.driverStatus;
      if (gunnerStatus) gunnerStatus.textContent = frame.gunnerStatus;
      if (loaderStatus) loaderStatus.textContent = frame.loaderStatus;
      const active = state.weapon.targets.some((target) => target.hp > 0);
      status.textContent = state.battle.failed
        ? "練習失敗・可重新開始"
        : frame.round === 0
          ? "等待交戰・自由練習"
          : `第 ${frame.round} 輪・${active ? "交戰中" : "目標已擊毀・等待下一輪"}`;
      round.disabled = active || frame.paused || state.battle.failed;
      round.textContent = active
        ? "交戰中"
        : frame.round
          ? "下一輪"
          : "開始交戰";
      fitPracticePanel(panel, surface, role, workPanels);
    },
  };
}
