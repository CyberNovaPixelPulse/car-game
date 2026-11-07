import { ROLE_LABELS, type CrewRole } from "./crew";
import { TANK_RULES } from "./tank-settings";

const weaponStatus = `<div class="weapon-status">
  <p>選擇 <strong data-testid="selected-shell">高爆彈</strong></p>
  <p>膛內 <strong data-testid="chamber-shell">無</strong></p>
  <p data-testid="chamber-state">空膛</p>
  <p>裝填進度 <strong data-testid="load-progress">0</strong>%</p>
  <progress aria-label="裝填進度" max="100" value="0"></progress>
  <p>已發射 <strong data-testid="shot-count">0</strong> 發 · 備彈無限</p>
</div>`;

/** One viewport contains the actual view, crew HUD and room controls. */
export function stationMarkup(role: CrewRole, soundEnabled: boolean) {
  return `<section class="workstation battle-station" data-role="${role}" aria-label="${ROLE_LABELS[role]}戰鬥">
    <div class="battle-overview hud-panel">
      <h2>${ROLE_LABELS[role]}工作站</h2>
      <p class="crew-health">共用坦克血量 <strong data-testid="tank-health">${TANK_RULES.maxHp}/${TANK_RULES.maxHp}</strong></p>
      <p data-testid="wave-status"></p>
      <div class="driver-instruments">
        <p class="speed-readout">速度 <strong data-testid="tank-speed">0.0</strong> m/s</p>
        <p><span data-testid="tank-motion">靜止</span> · <span data-testid="tank-contact">車體正常</span></p>
      </div>
      <p class="heading-readout">車身朝向 <strong data-testid="hull-heading">0°</strong><br>砲管朝向 <strong data-testid="turret-heading">0.0°</strong> · 仰角 <strong data-testid="turret-pitch">0.0°</strong></p>
      ${role === "loader" ? '<p class="loader-mode-line"><strong data-testid="loader-mode">裝填模式</strong> · Tab 切換工作</p>' : ""}
    </div>
    <div class="battle-utility"><div class="battle-actions">
      ${role === "loader" ? `<button type="button" class="secondary" id="station-sound" aria-pressed="${soundEnabled}">音效：${soundEnabled ? "開" : "關"}</button>` : ""}
      <button class="secondary" id="station-leave">離開房間</button>
    </div>
      ${role === "gunner" ? '<div class="battle-intel hud-panel"><p class="smoke-status" data-testid="smoke-status" role="status">視線清晰</p><p data-testid="target-status">目前沒有觀測到敵車</p><p data-testid="flight-status"></p></div>' : role === "loader" ? '<div class="battle-intel hud-panel" hidden><p class="smoke-status" data-testid="smoke-status" role="status">視線清晰</p><p data-testid="mg-target-status"></p></div>' : ""}
    </div>
    <div class="battle-alerts">
      <div class="battle-pause hud-panel" data-testid="battle-pause" role="status" hidden></div>
      <p class="hud-panel" data-testid="damage-warning" role="status"></p>
      ${role === "gunner" ? '<p class="hud-panel" data-testid="enemy-warning" role="status"></p><p class="hud-panel" data-testid="enemy-activity" role="status"></p>' : ""}
      ${role === "loader" ? '<p class="ejection-warning hud-panel" data-testid="ejection-warning" role="status"></p><p class="loader-posture hud-panel"><span data-testid="loader-status">站立・可以工作</span> <strong class="stun-timer" data-testid="stun-remaining"></strong></p>' : ""}
    </div>
    <div class="battle-outcome hud-panel" hidden>
      <h2 data-testid="battle-result" hidden>戰鬥失敗</h2>
      <button id="battle-return" hidden>回到房間</button>
    </div>
    <div class="battle-navigation"></div>
    ${
      role === "gunner"
        ? `
      <div class="battle-viewport"><canvas aria-label="主炮戰場視野" role="img"></canvas><span class="sight" aria-hidden="true"></span></div>
      <div class="battle-work hud-panel">${weaponStatus}<p>水平轉速 <strong data-testid="turret-yaw-rate">0.0°/s</strong> · 俯仰轉速 <strong data-testid="turret-pitch-rate">0.0°/s</strong></p><p class="note gunner-controls">按住方向鍵左右轉砲、上下俯仰；約半秒加速與停止，反向先煞停再反轉。</p><p class="note">主炮就緒後，按空白鍵開火。</p></div>
    `
        : role === "driver"
          ? `
      <div class="battle-viewport driver-viewport"><canvas aria-label="駕駛裝甲觀察窗" role="img"></canvas></div>
      <div class="battle-work hud-panel"><p class="note">觀察窗固定朝車頭，側後方請隊友協助觀察。</p><p class="note">按住 W／S 前進與倒車，A／D 左右轉向。</p></div>
    `
          : `
      <div class="loader-workspace">
        <div class="mg-workspace" hidden>
          <div class="battle-viewport"><span class="sight" aria-hidden="true"></span></div>
              <div class="mg-hud battle-mg-work hud-panel">
            <p>機槍朝向 <strong data-testid="mg-heading">0.0°</strong> · 仰角 <strong data-testid="mg-pitch">0.0°</strong></p>
            <p>機槍熱度 <strong data-testid="mg-heat">0</strong>% · <span data-testid="mg-status">可以射擊</span> <strong data-testid="mg-cooldown"></strong></p>
            <progress aria-label="機槍熱度" max="100" value="0"></progress>
            <p>機槍已射擊 <strong data-testid="mg-shot-count">0</strong> 發</p>
            <p class="note">按住 WASD 瞄準，放開即停止。空白鍵按住連射，備彈無限。Tab 切換維修。</p>
          </div>
        </div>
        <div class="loading-workspace">
          <div class="interior-viewport"><canvas role="img" aria-label="車內炮膛與彈藥架"></canvas></div>
          <section class="jam-game hud-panel" aria-label="卡彈排除" hidden><h3>卡彈：停在目標區</h3><div class="jam-track"><span class="jam-zone" data-testid="jam-zone">目標</span><span class="jam-needle" data-testid="jam-needle"></span></div><p data-testid="jam-result">按空白鍵停針</p></section>
        </div>
      </div>
      <div class="battle-work hud-panel">${weaponStatus}<p class="note loading-help">按 1 高爆彈、2 穿甲彈、3 煙霧彈。按住 R 裝填，放開保留進度；同發彈種鎖定。等待開火、退殼後再裝下一發。</p><p class="note">按住 C 蹲下避殼，放開起身；蹲下時無法工作。</p></div>
    `
    }
  </section>`;
}
