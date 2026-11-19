import { ROLE_LABELS, type CrewRole } from "./crew";
import type { TankState } from "./tank-core";
import { ENEMY_LABELS } from "./tank-enemies";
import { attachFullscreenControl } from "./tank-fullscreen";
import type { EnemyContact } from "./tank-intel";
import { mountBattleNavigation } from "./tank-navigation";
import {
  mountPracticeControls,
  type PracticeControls,
  type PracticeFrame,
} from "./tank-practice-ui";
import {
  motionControlsMarkup,
  mountMotionControls,
} from "./tank-motion-controls";
import type { CameraPreferences } from "./tank-motion-preferences";
import type { SceneQuality } from "./tank-scene-quality";
import { REPAIR_RULES, TANK_RULES } from "./tank-settings";
import { smokeSight } from "./tank-smoke";
import {
  presentSpeedometerNeedle,
  speedometerMarkup,
} from "./tank-speedometer";
import { JAM_RULES, SHELL_LABELS } from "./tank-weapons";

const calibrationResult = `<p class="repair-calibration-result hud-panel" data-testid="repair-calibration-result" hidden><span class="calibration-result-message" role="status"></span><span class="calibration-shared-needle" aria-hidden="true"></span></p>`;

const repairWorkspace = `<section class="repair-workspace" aria-label="車內維修" hidden>
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
        <p class="repair-controls"><kbd>←</kbd>／<kbd>→</kbd> 轉頭 · <kbd>Tab</kbd> 返回裝填</p>
      </section>`;

const weaponStatus = `<div class="weapon-status">
  <p>選擇 <strong data-testid="selected-shell">高爆彈</strong></p>
  <p>膛內 <strong data-testid="chamber-shell">無</strong></p>
  <p data-testid="chamber-state">空膛</p>
  <p>裝填進度 <strong data-testid="load-progress">0</strong>%</p>
  <progress aria-label="裝填進度" max="100" value="0"></progress>
  <p>已發射 <strong data-testid="shot-count">0</strong> 發 · 備彈無限</p>
</div>`;

/** One viewport contains the actual view, crew HUD and room controls. */
function stationMarkup(
  role: CrewRole,
  soundEnabled: boolean,
  practice: boolean,
) {
  return `<section class="workstation battle-station" data-role="${role}" aria-label="${ROLE_LABELS[role]}戰鬥">
    <div class="battle-overview hud-panel">
      <h2>${ROLE_LABELS[role]}工作站</h2>
      <p class="crew-health">共用坦克血量 <strong data-testid="tank-health">${TANK_RULES.maxHp}/${TANK_RULES.maxHp}</strong></p>
      <p data-testid="wave-status"></p>
      <div class="driver-instruments">
        ${role === "driver" ? speedometerMarkup() : '<p class="speed-readout">速度 <strong data-testid="tank-speed">0.0</strong> m/s</p>'}
        ${role === "driver" ? "" : '<p><span data-testid="tank-motion">靜止</span> · <span data-testid="tank-contact">車體正常</span></p>'}
      </div>
      <p class="heading-readout">車身朝向 <strong data-testid="hull-heading">0°</strong>${role === "driver" ? " · " : "<br>"}砲管朝向 <strong data-testid="turret-heading">0.0°</strong> · 仰角 <strong data-testid="turret-pitch">0.0°</strong></p>
      ${role === "loader" ? '<p class="loader-mode-line"><strong data-testid="loader-mode">裝填模式</strong> · Tab 切換工作</p>' : ""}
    </div>
    <div class="battle-utility"><div class="battle-actions">
      <label class="scene-quality">畫質 <select id="station-quality"><option value="low">低</option><option value="medium" selected>中</option><option value="high">高</option></select></label>
      ${motionControlsMarkup()}
      <button type="button" class="secondary" id="station-fullscreen" aria-pressed="false" aria-describedby="station-display-status">進入全螢幕</button>
      ${role !== "driver" ? `<button type="button" class="secondary" id="station-sound" aria-pressed="${soundEnabled}">音效：${soundEnabled ? "開" : "關"}</button>` : ""}
      <button class="secondary" id="station-leave">${practice ? "離開練習" : "離開房間"}</button>
    </div>
      ${role === "loader" ? calibrationResult : ""}
      <p class="display-status hud-panel" id="station-display-status" role="status" hidden></p>
      ${role === "gunner" ? '<div class="battle-intel hud-panel"><p class="smoke-status" data-testid="smoke-status" role="status">視線清晰</p><p data-testid="target-status">目前沒有觀測到敵車</p><p data-testid="flight-status"></p></div>' : role === "loader" ? '<div class="battle-intel hud-panel" hidden><p class="smoke-status" data-testid="smoke-status" role="status">視線清晰</p><p data-testid="mg-target-status"></p></div>' : ""}
    </div>
    <div class="battle-alerts">
      <div class="battle-pause hud-panel" data-testid="battle-pause" role="status" hidden></div>
      <p class="hud-panel" data-testid="damage-warning" role="status"></p>
      ${role === "loader" ? "" : calibrationResult}
      ${role === "gunner" ? '<p class="hud-panel" data-testid="enemy-warning" role="status"></p><p class="hud-panel" data-testid="enemy-activity" role="status"></p>' : ""}
      ${role === "loader" ? '<p class="ejection-warning hud-panel" data-testid="ejection-warning" role="status"></p><p class="loader-posture hud-panel"><span data-testid="loader-status">站立・可以工作</span> <strong class="stun-timer" data-testid="stun-remaining"></strong></p>' : ""}
    </div>
    <div class="battle-outcome hud-panel" hidden>
      <h2 data-testid="battle-result" hidden>戰鬥失敗</h2>
      <button id="battle-return" hidden>${practice ? "重新開始練習" : "回到房間"}</button>
    </div>
    <div class="battle-navigation"></div>
    ${
      role === "gunner"
        ? `
      <div class="battle-viewport"><span class="sight" aria-hidden="true"></span></div>
      <div class="battle-work hud-panel">${weaponStatus}<p>水平轉速 <strong data-testid="turret-yaw-rate">0.0°/s</strong> · 俯仰轉速 <strong data-testid="turret-pitch-rate">0.0°/s</strong></p><p class="note gunner-controls">按住方向鍵左右轉砲、上下俯仰；約半秒加速與停止，反向先煞停再反轉。</p><p class="note">主炮就緒後，按空白鍵開火。</p></div>
    `
        : role === "driver"
          ? `
      <div class="battle-viewport driver-viewport"></div>
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
          <div class="interior-viewport"></div>
        </div>
      </div>
      <div class="battle-work hud-panel">
        <section class="jam-game" aria-label="卡彈排除" hidden><h3>卡彈：停在目標區</h3><div class="jam-track"><span class="jam-zone" data-testid="jam-zone">目標</span><span class="jam-needle" data-testid="jam-needle"></span></div><p data-testid="jam-result">按空白鍵停針</p></section>
        ${repairWorkspace}
        ${weaponStatus}<p class="note loading-help">按 1 高爆彈、2 穿甲彈、3 煙霧彈。按住 R 裝填，放開保留進度；同發彈種鎖定。等待開火、退殼後再裝下一發。←／→ 轉頭。</p><p class="note">按住 C 蹲下避殼，放開起身；蹲下時無法工作。</p></div>
    `
    }
  </section>`;
}

interface StationControls {
  quality: SceneQuality;
  motion: CameraPreferences;
  onMotion: (value: CameraPreferences) => void;
  soundEnabled: boolean;
  onQuality: (quality: SceneQuality) => void;
  onSound: (enabled: boolean) => void;
  onLeave: () => void;
  onReturn: () => void;
  practice?: PracticeControls;
}

interface BattlePause {
  waitingFor: string[];
  remaining: number;
}

export function mountStation(
  content: HTMLElement,
  role: CrewRole,
  recovery: HTMLElement,
  controls: StationControls,
) {
  content.innerHTML = stationMarkup(
    role,
    controls.soundEnabled,
    !!controls.practice,
  );
  const element = content.firstElementChild as HTMLElement;
  const quality = element.querySelector<HTMLSelectElement>("#station-quality")!;
  const sound = element.querySelector<HTMLButtonElement>("#station-sound");
  const leave = element.querySelector<HTMLButtonElement>("#station-leave")!;
  const returnButton =
    element.querySelector<HTMLButtonElement>("#battle-return")!;
  const pause = readout(element, "battle-pause");
  const presentHud = bindBattleHud(element, role, returnButton);
  const presentNavigation = mountBattleNavigation(
    element.querySelector<HTMLElement>(".battle-navigation")!,
  );
  const practice =
    controls.practice &&
    mountPracticeControls(
      element,
      role,
      controls.practice,
      controls.onLeave,
      controls.onReturn,
    );

  // Keep the same live status and retry button visible in fullscreen.
  element.append(recovery);
  const disposeFullscreen = attachFullscreenControl(element);
  mountMotionControls(element, controls.motion, controls.onMotion);
  quality.value = controls.quality;
  quality.onchange = () => {
    const value = quality.value;
    if (value === "low" || value === "medium" || value === "high")
      controls.onQuality(value);
  };
  if (sound) {
    let enabled = controls.soundEnabled;
    sound.onclick = (event) => {
      enabled = !enabled;
      sound.textContent = `音效：${enabled ? "開" : "關"}`;
      sound.setAttribute("aria-pressed", String(enabled));
      controls.onSound(enabled);
      if (event.detail > 0) sound.blur();
    };
  }
  leave.onclick = controls.onLeave;
  returnButton.onclick = controls.onReturn;

  return {
    role,
    element,
    present(state: TankState, practiceFrame?: PracticeFrame) {
      presentNavigation(state);
      presentHud(state, !!practice);
      if (practice && practiceFrame) practice.present(state, practiceFrame);
    },
    presentPause(waiting?: BattlePause) {
      const enteringPause = pause.hidden && waiting;
      pause.hidden = !waiting;
      if (enteringPause) window.scrollTo(0, 0);
      if (waiting) {
        const text = `戰鬥暫停・等待${waiting.waitingFor.join("、")}重新連線，剩餘 ${waiting.remaining} 秒。所有操作與戰況已凍結。`;
        if (pause.textContent !== text) pause.textContent = text;
      }
    },
    showPracticePause() {
      practice?.showPause();
    },
    dispose() {
      disposeFullscreen();
      // The entry/lobby still uses these nodes and their handlers after play.
      content.after(recovery);
    },
  };
}

function readout(root: ParentNode, id: string) {
  return root.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
}

const degrees = (angle: number) => ((angle * 180) / Math.PI).toFixed(1);

function bindBattleHud(
  root: HTMLElement,
  role: CrewRole,
  returnButton: HTMLButtonElement,
) {
  const wave = readout(root, "wave-status");
  const speed = readout(root, "tank-speed");
  const speedNeedle = root.querySelector(".speed-needle");
  const motion = readout(root, "tank-motion");
  const contact = readout(root, "tank-contact");
  const heading = readout(root, "hull-heading");
  const turretHeading = readout(root, "turret-heading");
  const turretPitch = readout(root, "turret-pitch");
  const health = readout(root, "tank-health");
  const damageWarning = readout(root, "damage-warning");
  const result = readout(root, "battle-result");
  const outcome = root.querySelector<HTMLElement>(".battle-outcome")!;
  const presentCalibration = bindSharedCalibration(root);
  const presentWeapon = role === "driver" ? undefined : bindWeaponStatus(root);
  const presentRole =
    role === "loader"
      ? bindLoaderHud(root)
      : role === "gunner"
        ? bindGunnerHud(root)
        : undefined;

  return (state: TankState, practice: boolean) => {
    const { tank, turret, battle } = state;
    if (practice) wave.textContent = "單人練習・一位真人與兩位 AI";
    else {
      const living = state.intel.contacts.filter((enemy) => enemy.hp > 0);
      const visible = living.filter((enemy) => enemy.visible).length;
      const stale = living.length - visible;
      wave.textContent = `第 ${battle.wave} / ${TANK_RULES.waves} 波 · 目前觀測敵車 ${visible}${stale ? ` · 舊情報 ${stale}` : ""}`;
    }
    const magnitude = Math.abs(tank.speed);
    const displaySpeed = role === "driver" ? magnitude * 3.6 : magnitude;
    speed.textContent = displaySpeed.toFixed(1);
    if (speedNeedle) presentSpeedometerNeedle(speedNeedle, displaySpeed);
    motion.textContent = tank.blocked
      ? "受阻"
      : magnitude < 0.05
        ? "靜止"
        : tank.speed > 0
          ? "前進"
          : "倒車";
    contact.textContent = tank.blocked ? "車體受阻" : "車體正常";
    heading.textContent = `${Math.round((tank.yaw * 180) / Math.PI) % 360}°`;
    turretHeading.textContent = `${degrees((tank.yaw + turret.yaw) % (Math.PI * 2))}°`;
    turretPitch.textContent = `${degrees(turret.pitch)}°`;
    health.textContent = `${Math.round(tank.hp * 10) / 10}/${TANK_RULES.maxHp}`;
    damageWarning.textContent = battle.lastDamage
      ? `敵彈命中！車體受損 ${battle.lastDamage}`
      : "";
    root.classList.toggle("under-fire", state.time - battle.lastHitAt < 1);

    const finished = battle.failed || battle.won;
    const enteringResult = result.hidden && finished;
    outcome.hidden = result.hidden = returnButton.hidden = !finished;
    result.textContent = battle.failed ? "戰鬥失敗" : "戰鬥勝利";
    result.dataset.outcome = battle.failed ? "failed" : "won";
    if (enteringResult) window.scrollTo(0, 0);

    const calibrationNeedle =
      (state.repair.calibration.elapsed / REPAIR_RULES.calibrationDuration) *
      360;
    presentCalibration(state, calibrationNeedle);
    presentWeapon?.(state.weapon);
    presentRole?.(state, calibrationNeedle);
  };
}

function bindWeaponStatus(root: HTMLElement) {
  const selectedShell = readout(root, "selected-shell");
  const chamberShell = readout(root, "chamber-shell");
  const chamber = readout(root, "chamber-state");
  const load = readout(root, "load-progress");
  const shots = readout(root, "shot-count");
  const progress = root.querySelector<HTMLProgressElement>(
    'progress[aria-label="裝填進度"]',
  )!;
  const chamberText = {
    empty: "空膛",
    loading: "裝填中",
    loaded: "主炮就緒",
    ejecting: "正在退殼",
  };
  return (weapon: TankState["weapon"]) => {
    selectedShell.textContent = SHELL_LABELS[weapon.selectedShell];
    chamberShell.textContent = weapon.chamberShell
      ? `${SHELL_LABELS[weapon.chamberShell]}（已鎖定）`
      : "無";
    chamber.textContent = weapon.jam.active
      ? "卡彈"
      : chamberText[weapon.chamber];
    load.textContent = String(Math.round(weapon.loadProgress * 100));
    progress.value = weapon.loadProgress * 100;
    shots.textContent = String(weapon.shotsFired);
  };
}

const enemyPhaseText = {
  approaching: "接近中",
  aiming: "轉砲瞄準",
  warning: "瞄準預告",
  reloading: "重新裝填",
  "blind-fire": "最後位置射擊",
  searching: "搜尋中",
};

function contactReadout(contact: EnemyContact, time: number, detail: boolean) {
  const hp = `${ENEMY_LABELS[contact.kind]} ${contact.hp}/${contact.maxHp}`;
  if (!contact.visible)
    return `${hp} · 最後已知 · ${(time - contact.observedAt).toFixed(1)} 秒前`;
  if (!detail) return `${hp} · 目前觀測`;
  if (contact.hp <= 0) return `${hp} · 已擊毀 · 殘骸`;
  return `${hp} · ${contact.hp === contact.maxHp ? "完好" : "受損"} · ${enemyPhaseText[contact.phase]}`;
}

function sightReadout(state: TankState, machineGun: boolean) {
  const aim = machineGun ? state.weapon.mg : state.turret;
  return smokeSight(state.weapon.smoke, state.tank, aim, machineGun, state.time)
    .obscured
    ? "煙幕遮蔽視線"
    : "視線清晰";
}

function bindGunnerHud(root: HTMLElement) {
  const yawRate = readout(root, "turret-yaw-rate");
  const pitchRate = readout(root, "turret-pitch-rate");
  const smoke = readout(root, "smoke-status");
  const warning = readout(root, "enemy-warning");
  const activity = readout(root, "enemy-activity");
  const targets = readout(root, "target-status");
  const flight = readout(root, "flight-status");
  return (state: TankState) => {
    yawRate.textContent = `${degrees(state.turret.yawRate)}°/s`;
    pitchRate.textContent = `${degrees(state.turret.pitchRate)}°/s`;
    smoke.textContent = sightReadout(state, false);
    const contacts = state.intel.contacts;
    const visible = contacts.filter((enemy) => enemy.visible && enemy.hp > 0);
    warning.textContent = visible
      .filter((enemy) => enemy.phase === "warning")
      .map(
        (enemy) =>
          `${ENEMY_LABELS[enemy.kind]} 正在瞄準，即將開火！移動或尋找掩護`,
      )
      .join("；");
    activity.textContent = [
      ...new Set(
        visible
          .map((enemy) =>
            enemy.phase === "searching"
              ? "觀測敵車搜尋中"
              : enemy.phase === "blind-fire"
                ? "敵車失去視線，短暫瞄準最後已見位置"
                : "",
          )
          .filter(Boolean),
      ),
    ].join("；");
    targets.textContent =
      contacts
        .map((enemy) => contactReadout(enemy, state.time, true))
        .join("；") || "目前沒有觀測到敵車";
    flight.textContent = state.weapon.projectiles.length
      ? "砲彈飛行中"
      : state.weapon.impacts.length
        ? "砲彈命中"
        : "";
  };
}

function bindLoaderHud(root: HTMLElement) {
  const mode = readout(root, "loader-mode");
  const posture = readout(root, "loader-status");
  const remaining = readout(root, "stun-remaining");
  const ejection = readout(root, "ejection-warning");
  const workspace = root.querySelector<HTMLElement>(".loader-workspace")!;
  const interior = root.querySelector<HTMLElement>(".interior-viewport")!;
  const loading = root.querySelector<HTMLElement>(".loading-workspace")!;
  const work = root.querySelector<HTMLElement>(".battle-work")!;
  const loadingHelp = root.querySelector<HTMLElement>(".loading-help")!;
  const mg = root.querySelector<HTMLElement>(".mg-workspace")!;
  const intel = root.querySelector<HTMLElement>(".battle-intel")!;
  const repair = root.querySelector<HTMLElement>(".repair-workspace")!;
  const presentRepair = bindRepairWorkspace(repair);
  const presentMachineGun = bindMachineGunHud(root);
  const presentJam = bindJamGame(root);
  const modeText = {
    loading: "裝填模式",
    "machine-gun": "機槍模式",
    repair: "維修模式",
  };

  return (state: TankState, needle: number) => {
    const { weapon, time } = state;
    const stunned = time < weapon.stunnedUntil;
    const machineGun = weapon.mode === "machine-gun";
    mode.textContent = modeText[weapon.mode];
    interior.hidden = loading.hidden = work.hidden = machineGun;
    mg.hidden = intel.hidden = !machineGun;
    repair.hidden = weapon.mode !== "repair";
    loadingHelp.hidden = weapon.mode !== "loading";
    posture.textContent = stunned
      ? "彈殼命中・暈眩，全部操作暫停"
      : weapon.crouching
        ? "蹲下避險・無法工作"
        : weapon.stunnedUntil > 0 && time < weapon.stunnedUntil + 2
          ? "已恢復・可以工作"
          : "站立・可以工作";
    workspace.dataset.posture = stunned
      ? "stunned"
      : weapon.crouching
        ? "crouching"
        : "standing";
    remaining.textContent = stunned
      ? `${(Math.ceil((weapon.stunnedUntil - time) * 10) / 10).toFixed(1)} 秒`
      : "";
    ejection.textContent =
      weapon.chamber === "ejecting" ? "彈殼即將退出！按住 C 蹲下避開" : "";
    presentRepair(state, needle);
    presentMachineGun(state, stunned);
    presentJam(state);
  };
}

function bindMachineGunHud(root: HTMLElement) {
  const hud = root.querySelector<HTMLElement>(".mg-hud")!;
  const progress = root.querySelector<HTMLProgressElement>(
    'progress[aria-label="機槍熱度"]',
  )!;
  const heading = readout(root, "mg-heading");
  const pitch = readout(root, "mg-pitch");
  const heat = readout(root, "mg-heat");
  const status = readout(root, "mg-status");
  const cooldown = readout(root, "mg-cooldown");
  const shots = readout(root, "mg-shot-count");
  const targets = readout(root, "mg-target-status");
  const smoke = readout(root, "smoke-status");

  return (state: TankState, stunned: boolean) => {
    const { mg, crouching } = state.weapon;
    const overheated = state.time < mg.coolUntil;
    hud.toggleAttribute("data-overheated", overheated);
    heading.textContent = `${degrees((state.tank.yaw + mg.yaw) % (Math.PI * 2))}°`;
    pitch.textContent = `${degrees(mg.pitch)}°`;
    heat.textContent = String(Math.round(mg.heat * 100));
    progress.value = mg.heat * 100;
    status.textContent = stunned
      ? "暈眩・無法射擊"
      : crouching
        ? "蹲下・無法射擊"
        : overheated
          ? "過熱・強制冷卻"
          : "可以射擊";
    cooldown.textContent = overheated
      ? `${(mg.coolUntil - state.time).toFixed(1)} 秒`
      : "";
    shots.textContent = String(mg.shots);
    smoke.textContent = sightReadout(state, true);
    targets.textContent =
      state.intel.contacts
        .map((enemy) => contactReadout(enemy, state.time, false))
        .join("；") || "目前沒有觀測到敵車";
  };
}

function bindJamGame(root: HTMLElement) {
  const game = root.querySelector<HTMLElement>(".jam-game")!;
  const title = game.querySelector("h3")!;
  const zone = readout(game, "jam-zone");
  const needle = readout(game, "jam-needle");
  const result = readout(game, "jam-result");
  zone.style.width = `${JAM_RULES.width * 100}%`;

  return ({ weapon, time }: TankState) => {
    const jam = weapon.jam;
    const cleared = jam.result === "cleared";
    title.textContent = cleared ? "故障已排除" : "卡彈：停在目標區";
    game.hidden = weapon.mode !== "loading" || (!jam.active && !cleared);
    zone.style.left = `${jam.zone * 100}%`;
    needle.style.left = `${jam.needle * 100}%`;
    result.textContent = cleared
      ? "解除成功，繼續裝填"
      : jam.result === "failed"
        ? `未命中，重試倒數 ${Math.max(0, jam.retryAt - time).toFixed(1)} 秒`
        : "按空白鍵停針";
  };
}

function bindSharedCalibration(root: HTMLElement) {
  const panel = readout(root, "repair-calibration-result");
  const message = panel.querySelector(".calibration-result-message")!;
  const sharedNeedle = panel.querySelector(".calibration-shared-needle")!;
  return ({ repair, time }: TankState, needle: number) => {
    const calibration = repair.calibration;
    const messages = {
      idle: "",
      active: `維修校準中${calibration.suspended ? "・重新按住 R 續接" : ""}`,
      success: "校準成功・額外 +1 HP",
      perfect: "完美校準・額外 +3 HP",
      failed:
        time < repair.failureUntil
          ? "校準失敗・停修兩秒"
          : "上次校準失敗・停修已結束",
    };
    panel.hidden = calibration.result === "idle";
    message.textContent = messages[calibration.result];
    // Keep rapid degree updates outside the live status.
    sharedNeedle.textContent =
      calibration.result === "active" ? `・指針 ${needle.toFixed(0)}°` : "";
  };
}

function bindRepairWorkspace(root: HTMLElement) {
  const status = readout(root, "repair-status");
  const panel = readout(root, "repair-calibration");
  const position = readout(panel, "repair-calibration-position");
  const zone = panel.querySelector<SVGElement>(".calibration-zone")!;
  const perfect = panel.querySelector<SVGElement>(".calibration-perfect")!;
  const pointer = panel.querySelector<SVGElement>(".calibration-needle")!;
  const width = REPAIR_RULES.calibrationWidth * 360;
  const perfectWidth = REPAIR_RULES.perfectWidth * 360;
  zone.style.strokeDasharray = `${REPAIR_RULES.calibrationWidth} 1`;
  perfect.style.strokeDasharray = `${REPAIR_RULES.perfectWidth} 1`;

  return ({ repair, battle, time }: TankState, needle: number) => {
    const calibration = repair.calibration;
    panel.hidden = calibration.result !== "active";
    const target = calibration.target * 360;
    const perfectStart = target + (width - perfectWidth) / 2;
    zone.style.transform = `rotate(${target - 90}deg)`;
    perfect.style.transform = `rotate(${perfectStart - 90}deg)`;
    pointer.style.transform = `rotate(${needle}deg)`;
    position.textContent = `指針 ${needle.toFixed(0)}° · 目標 ${target.toFixed(0)}°–${(target + width).toFixed(0)}° · 完美 ${perfectStart.toFixed(0)}°–${(perfectStart + perfectWidth).toFixed(0)}°`;
    const waitReason =
      repair.failureUntil > battle.lastHitAt + REPAIR_RULES.damageWait
        ? "校準失敗等待"
        : "受擊等待";
    const messages = {
      inactive: "切換維修模式開始工作",
      destroyed: "坦克已毀・無法維修復活",
      stunned: "彈殼命中・暈眩中無法維修",
      crouching: "蹲下避險・暫停維修",
      moving: "停車並停止轉向後才能維修",
      waiting: `${waitReason}・${Math.max(0, repair.blockedUntil - time).toFixed(1)} 秒後可維修`,
      full: "車體完好・100 / 100 HP",
      ready: "已停穩・按住 R 維修",
      repairing: "維修中・每秒回復 2 HP",
    };
    status.textContent = messages[repair.status];
  };
}
