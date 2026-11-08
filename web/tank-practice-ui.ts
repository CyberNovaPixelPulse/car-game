import { CREW_ROLES, ROLE_LABELS, type CrewRole } from "./crew";
import { battleProjection } from "./tank-battle-view";
import { DRIVER_VIEW } from "./tank-driver-view";
import type { TankState } from "./tank-core";

export function practiceControlsMarkup(role: CrewRole) {
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

export function practiceHint(state: TankState, role: CrewRole) {
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
export function fitPracticePanel(root: HTMLElement, role: CrewRole) {
  const panel = root.querySelector<HTMLElement>(".practice-controls");
  const surface = root.querySelector<HTMLElement>(".battle-station");
  if (!panel || !surface) return;
  const work = [
    ...root.querySelectorAll<HTMLElement>(".battle-work, .battle-mg-work"),
  ].find((element) => element.getClientRects().length > 0);
  const box = surface.getBoundingClientRect();
  let bottom = Math.min(
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
