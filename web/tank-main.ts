import { smokeBlocks, smokeSight } from "./tank-smoke";
import { ENEMY_LABELS } from "./tank-enemies";
import { MG_FIRE } from "./tank-machine-gun";
import { Session, type Room } from "./network";
import { CREW_ROLES, ROLE_LABELS, ROLE_TASKS, type CrewRole } from "./crew";
import { GameRuntime } from "./game-runtime";
import { TankCore, DRIVE, AIM } from "./tank-core";
import { TankScene } from "./tank-scene";
import { TankInteriorScene } from "./tank-interior-scene";
import { TankMechanicalAudio } from "./tank-mechanical-audio";
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
let interiorScene: TankInteriorScene | undefined;
let mgCanvas: HTMLCanvasElement | undefined;
let stationRole: string | undefined;
interface PreparedViews {
  role: CrewRole;
  code: string;
  exterior?: TankScene;
  exteriorCanvas?: HTMLCanvasElement;
  interior?: TankInteriorScene;
  interiorCanvas?: HTMLCanvasElement;
}
let prepared: PreparedViews | undefined;
let preparing = false;
let preparationVersion = 0;
function clearViews() {
  preparationVersion++;
  preparing = false;
  for (const view of new Set([scene, prepared?.exterior])) view?.dispose();
  for (const view of new Set([interiorScene, prepared?.interior]))
    view?.dispose();
  for (const canvas of [
    mgCanvas,
    prepared?.exteriorCanvas,
    prepared?.interiorCanvas,
  ])
    canvas?.remove();
  scene = undefined;
  interiorScene = undefined;
  mgCanvas = undefined;
  prepared = undefined;
}
function artCanvas(label: string) {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-label", label);
  canvas.setAttribute("role", "img");
  return canvas;
}
async function prepareVote(room: Room, role: CrewRole) {
  clearViews();
  const version = ++preparationVersion;
  preparing = true;
  const views: PreparedViews = { role, code: room.code };
  prepared = views;
  lobby(room);
  try {
    // Let the real pending status paint before doing expensive graphics work.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    if (version !== preparationVersion) return;
    if (role === "gunner") {
      views.exteriorCanvas = artCanvas("主炮戰場視野");
      views.exterior = new TankScene(views.exteriorCanvas);
      await views.exterior.prepare(core.view());
    } else if (role === "loader") {
      views.interiorCanvas = artCanvas("車內炮膛與彈藥架");
      views.interior = new TankInteriorScene(views.interiorCanvas);
      views.exteriorCanvas = artCanvas("機槍戰場視野");
      views.exterior = new TankScene(views.exteriorCanvas, "machine-gun");
      // Both actual views are prepared before the loader's existing ready vote.
      await views.interior.prepare(core.view());
      await views.exterior.prepare(core.view());
    }
    const current = session.room;
    const currentRole = current?.members.find(
      (member) => member.slot === session.slot,
    )?.role;
    if (
      version !== preparationVersion ||
      current?.code !== room.code ||
      currentRole !== role ||
      current.phase !== "lobby"
    )
      return;
    preparing = false;
    session.setReady(true);
  } catch (e) {
    if (version !== preparationVersion) return;
    clearViews();
    if (session.room?.phase === "lobby") lobby(session.room);
    error(e);
  }
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
function menu() {
  runtime.mode = "idle";
  runtime.clearInput();
  held = 0;
  clearViews();
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
  )}</fieldset><div class="room-actions"><button id="crew-ready" ${!me?.role ? "disabled" : ""}>${me?.ready || preparing ? "取消準備" : "準備"}</button>${session.isHost ? `<button id="crew-start" ${complete ? "" : "disabled"}>開始戰鬥</button>` : "<p>全員準備後，由房主開始戰鬥。</p>"}<button class="secondary" id="crew-leave">離開房間</button></div>${preparing ? '<p role="status">正在準備工作畫面，完成後才會標示已準備；可取消或改選職位。</p>' : ""}<p class="note">${
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
  document.querySelector<HTMLButtonElement>("#crew-ready")!.onclick = () => {
    if (preparing || me?.ready) {
      clearViews();
      if (me?.ready) session.setReady(false);
      else if (session.room) lobby(session.room);
    } else if (me?.role) void prepareVote(room, me.role);
  };
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
  const ready = prepared?.role === role && prepared.code === room.code;
  if (!ready) clearViews();
  stationRole = role;
  mechanicalAudio.reset();
  soundedShot = 0;
  soundedStun = 0;
  soundedDamage = -100;
  content.innerHTML = `<section class="workstation battle-station" data-role="${role}"><h2>${ROLE_LABELS[role]}工作站</h2><p>${ROLE_TASKS[role]}</p><p>共用坦克血量 <strong data-testid="tank-health">100/100</strong></p><p data-testid="wave-status"></p><p data-testid="damage-warning" role="status"></p><h2 data-testid="battle-result" hidden>戰鬥失敗</h2><button id="battle-return" hidden>回到房間</button>${role === "gunner" ? '<div class="battle-viewport"><canvas aria-label="主炮戰場視野" role="img"></canvas><span class="sight" aria-hidden="true"></span><p class="smoke-status" data-testid="smoke-status" role="status">視線清晰</p></div><p class="heading-readout">車身朝向 <strong data-testid="hull-heading">0°</strong> · 砲管朝向 <strong data-testid="turret-heading">0.0°</strong> · 仰角 <strong data-testid="turret-pitch">0.0°</strong></p><p>水平轉速 <strong data-testid="turret-yaw-rate">0.0°/s</strong> · 俯仰轉速 <strong data-testid="turret-pitch-rate">0.0°/s</strong></p><p class="note">連點 A／D 左右、W／S 上下；反方向連點可煞停。按住只推動一次。</p>' : role === "driver" ? '<div class="driver-instruments"><p class="instrument-label">速度</p><p class="speed-readout"><strong data-testid="tank-speed">0.0</strong> m/s</p><p data-testid="tank-motion">靜止</p><p data-testid="tank-contact">車體正常</p></div><p class="note">按住 W／S 前進與倒車，A／D 左右轉向。請聽從隊友指揮。</p>' : '<div class="loader-workspace"><p><strong data-testid="loader-mode">裝填模式</strong> · Tab 切換工作</p><p class="ejection-warning" data-testid="ejection-warning" role="status"></p><p><span data-testid="loader-status">站立・可以工作</span> <strong class="stun-timer" data-testid="stun-remaining"></strong></p><div class="mg-workspace" hidden><div class="battle-viewport"><span class="sight" aria-hidden="true"></span><p class="smoke-status" data-testid="smoke-status" role="status">視線清晰</p></div><p>機槍朝向 <strong data-testid="mg-heading">0.0°</strong> · 仰角 <strong data-testid="mg-pitch">0.0°</strong></p><p class="note">按住 WASD 瞄準，放開即停止。空白鍵按住連射，備彈無限。Tab 返回裝填。</p><div class="mg-hud"><p>機槍熱度 <strong data-testid="mg-heat">0</strong>% · <span data-testid="mg-status">可以射擊</span> <strong data-testid="mg-cooldown"></strong></p><progress aria-label="機槍熱度" max="100" value="0"></progress></div><p>機槍已射擊 <strong data-testid="mg-shot-count">0</strong> 發</p><p data-testid="mg-target-status"></p></div><div class="loading-workspace"><div class="interior-viewport"><canvas role="img" aria-label="車內炮膛與彈藥架"></canvas></div><section class="jam-game" aria-label="卡彈排除" hidden><h3>卡彈：停在目標區</h3><div class="jam-track"><span class="jam-zone" data-testid="jam-zone">目標</span><span class="jam-needle" data-testid="jam-needle"></span></div><p data-testid="jam-result">按空白鍵停針</p></section><p class="note">按 1 選高爆彈、2 選穿甲彈、3 選煙霧彈。按住 R 裝填，放開可暫停；開始裝填後鎖定該發彈種。等待砲手開火、退殼後再裝下一發。按住 C 蹲下避開彈殼，放開起身；蹲下時無法工作。</p></div></div>'}${role !== "driver" ? '<div class="weapon-status"><p>選擇：<strong data-testid="selected-shell">高爆彈</strong> · 高爆／穿甲／煙霧備彈無限</p><p>膛內：<strong data-testid="chamber-shell">無</strong></p><p data-testid="chamber-state">空膛</p><p>裝填進度 <strong data-testid="load-progress">0</strong>%</p><progress aria-label="裝填進度" max="100" value="0"></progress><p>已發射 <strong data-testid="shot-count">0</strong> 發</p></div>' : ""}${role === "gunner" ? '<p data-testid="enemy-warning" role="status"></p><p data-testid="enemy-activity" role="status"></p><p data-testid="target-status">敵車接近中</p><p data-testid="flight-status"></p><p class="note">主炮就緒後，按空白鍵開火。</p>' : ""}${role === "gunner" ? '<p class="vehicle-status">車體速度 <strong data-testid="tank-speed">0.0</strong> m/s · <span data-testid="tank-motion">靜止</span></p><p data-testid="tank-contact">車體正常</p>' : ""}${role === "loader" ? `<button type="button" class="secondary" id="station-sound" aria-pressed="${soundEnabled}">音效：${soundEnabled ? "開" : "關"}</button>` : ""}<button class="secondary" id="station-leave">離開房間</button></section>`;
  if (role === "loader") {
    const jamPanel = content.querySelector(".jam-game");
    if (jamPanel)
      content.querySelector(".loading-workspace")!.prepend(jamPanel);
    try {
      if (ready && prepared?.interior && prepared.interiorCanvas) {
        content
          .querySelector(".interior-viewport canvas")!
          .replaceWith(prepared.interiorCanvas);
        interiorScene = prepared.interior;
        scene = prepared.exterior;
        mgCanvas = prepared.exteriorCanvas;
      } else
        interiorScene = new TankInteriorScene(
          content.querySelector(".interior-viewport canvas")!,
        );
    } catch {
      message.textContent =
        "無法啟動 3D 車內工作區，請使用支援 WebGL2 的瀏覽器重新加入。";
    }
  }
  const soundButton =
    content.querySelector<HTMLButtonElement>("#station-sound");
  if (soundButton)
    soundButton.onclick = () => {
      soundEnabled = !soundEnabled;
      soundButton.textContent = `音效：${soundEnabled ? "開" : "關"}`;
      soundButton.setAttribute("aria-pressed", String(soundEnabled));
    };
  content.querySelector<HTMLButtonElement>("#battle-return")!.onclick = () =>
    session.returnToLobby();
  const enemyWarning = content.querySelector('[data-testid="enemy-warning"]');
  if (enemyWarning)
    content.querySelector(".battle-viewport")!.before(enemyWarning);
  const enemyActivity = content.querySelector('[data-testid="enemy-activity"]');
  if (enemyActivity)
    content.querySelector(".battle-viewport")!.before(enemyActivity);
  const mgHud = content.querySelector(".mg-hud");
  if (mgHud)
    content.querySelector(".mg-workspace .battle-viewport")!.append(mgHud);
  if (role === "gunner") {
    try {
      if (ready && prepared?.exterior && prepared.exteriorCanvas) {
        content.querySelector("canvas")!.replaceWith(prepared.exteriorCanvas);
        scene = prepared.exterior;
      } else scene = new TankScene(content.querySelector("canvas")!);
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
  const wave = content.querySelector('[data-testid="wave-status"]');
  if (wave)
    wave.textContent = `第 ${state.battle.wave} / 3 波 · 存活敵車 ${state.weapon.targets.filter((e) => e.hp > 0).length}`;
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
    result.hidden = !state.battle.failed && !state.battle.won;
    result.textContent = state.battle.failed ? "戰鬥失敗" : "戰鬥勝利";
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
  const obscured = (target: { x: number; z: number; height: number }) =>
    smokeBlocks(
      state.weapon.smoke,
      sight.eye,
      [target.x, target.height / 2, target.z],
      state.time,
    );
  const smokeStatus = content.querySelector('[data-testid="smoke-status"]');
  if (smokeStatus)
    smokeStatus.textContent = sight.obscured ? "煙幕遮蔽視線" : "視線清晰";
  const enemyWarning = content.querySelector('[data-testid="enemy-warning"]');
  if (enemyWarning)
    enemyWarning.textContent = state.weapon.targets
      .filter((e) => e.hp > 0 && e.phase === "warning" && !obscured(e))
      .map((e) => `${ENEMY_LABELS[e.kind]} 正在瞄準，即將開火！移動或尋找掩護`)
      .join("；");
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
      weapon.mode === "loading" ? "裝填模式" : "機槍模式";
    const mgWorkspace = content.querySelector<HTMLElement>(".mg-workspace")!;
    mgWorkspace.hidden = weapon.mode !== "machine-gun";
    content.querySelector<HTMLElement>(".loading-workspace")!.hidden =
      weapon.mode !== "loading";
    content.querySelector('[data-testid="mg-heading"]')!.textContent =
      `${degrees((state.tank.yaw + weapon.mg.yaw) % (Math.PI * 2))}°`;
    content.querySelector('[data-testid="mg-pitch"]')!.textContent =
      `${degrees(weapon.mg.pitch)}°`;
    if (weapon.mode === "machine-gun") {
      interiorScene?.invalidate();
      if (!mgCanvas) {
        mgCanvas = document.createElement("canvas");
        mgCanvas.setAttribute("aria-label", "機槍戰場視野");
        mgCanvas.setAttribute("role", "img");
      }
      if (!mgCanvas.isConnected)
        mgWorkspace.querySelector(".battle-viewport")!.prepend(mgCanvas);
      if (!scene) {
        try {
          scene = new TankScene(mgCanvas, "machine-gun");
        } catch {
          message.textContent =
            "無法啟動 3D 機槍視野，請使用支援 WebGL2 的瀏覽器重新加入。";
        }
      }
    } else {
      // Keep its renderer for the next Tab without exposing an exterior canvas
      // in the interior station or spending GPU time drawing the hidden world.
      mgCanvas?.remove();
    }
    const overheated = state.time < weapon.mg.coolUntil;
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
      weapon.targets
        .map((t) =>
          obscured(t)
            ? "煙幕遮蔽，無法辨認敵車"
            : `${ENEMY_LABELS[t.kind]} ${t.hp}/${t.maxHp}`,
        )
        .join("；");
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
    "tank-health": `${state.tank.hp}/100`,
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
        weapon.targets
          .filter((t) => t.hp > 0)
          .map((t) =>
            t.phase === "searching"
              ? "煙幕中的敵車停止追蹤，搜尋中"
              : t.phase === "blind-fire" ||
                  (t.phase === "warning" && obscured(t))
                ? "敵車失去視線，短暫瞄準最後已見位置"
                : "",
          )
          .filter(Boolean),
      ),
    ].join("；"),
    "target-status": weapon.targets
      .map((t) =>
        obscured(t)
          ? "煙幕遮蔽，無法辨認敵車"
          : `${ENEMY_LABELS[t.kind]} ${t.hp}/${t.maxHp} · ${t.hp <= 0 ? "已擊毀" : t.hp === t.maxHp ? "完好" : "受損"} · ${t.hp <= 0 ? "殘骸" : { approaching: "接近中", aiming: "轉砲瞄準", warning: "瞄準預告", reloading: "重新裝填", "blind-fire": "最後位置射擊", searching: "搜尋中" }[t.phase]}`,
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
  const jam = content.querySelector<HTMLElement>(".jam-game");
  if (jam) {
    jam.querySelector("h3")!.textContent =
      weapon.jam.result === "cleared" ? "故障已排除" : "卡彈：停在目標區";
    jam.hidden = !weapon.jam.active && weapon.jam.result !== "cleared";
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
  if (stationRole === "loader" && weapon.mode === "loading")
    interiorScene?.render(state);
  if (stationRole !== "loader" || weapon.mode === "machine-gun")
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
    held |= MG_FIRE;
    runtime.setInput(held);
    if (!event.repeat) runtime.action(STOP_JAM);
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
        : event.key.toLowerCase() === "c"
          ? CROUCH
          : driveKeys[event.key.toLowerCase()] || 0
      : driveKeys[event.key.toLowerCase()];
  if (!key) return;
  event.preventDefault();
  held |= key;
  runtime.setInput(held);
});
window.addEventListener("keyup", (event) => {
  const key =
    event.code === "Space"
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
  if (room.phase === "lobby") {
    runtime.mode = "idle";
    runtime.clearInput();
    held = 0;
    const role = room.members.find(
      (member) => member.slot === session.slot,
    )?.role;
    // Ordinary neighbours' ready updates must keep this renderer warm.
    if (
      stationRole ||
      (prepared && (prepared.role !== role || prepared.code !== room.code))
    )
      clearViews();
    mechanicalAudio.reset();
    stationRole = undefined;
    lobby(room);
  } else station(room);
};
runtime.onStart = () => {
  if (session.room) station(session.room);
};
runtime.onRestoreError = error;
window.addEventListener("pagehide", () => {
  clearViews();
  session.leave(false);
});
menu();
