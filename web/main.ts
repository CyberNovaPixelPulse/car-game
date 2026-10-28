import { Engine } from "./engine";
import { Session, COLORS } from "./network";
import "./style.css";
document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<header class="topbar"><a href="/" class="brand"><span class="brand-mark">P<span>c</span></span><span>Pocket Circuit<small>口袋賽車場</small></span></a><span class="tag">好朋友，壞道具。</span><span class="edition">5 人派對競速</span></header>
<main><section class="intro"><div><span class="track-label"><i></i> 太陽島環道</span><h1>小賽道，大亂鬥。</h1><p>揪朋友進房、甩個漂亮的彎，再送對手一點小驚喜。</p></div><div class="race-stamp">3<span>圈決勝負</span><b>一起出發！</b></div></section>
<div class="play-layout"><section class="track-panel" aria-label="賽道"><div class="track-top"><span id="session-label">先來熱個身</span><span class="live-dot" id="engine-status">準備賽道中…</span></div><div class="canvas-wrap"><canvas id="game" width="1200" height="800" aria-label="太陽島賽道"></canvas><div class="island-label"><b>Sunbeam<br>Circuit</b><span>太陽島環道</span></div><div class="countdown" hidden></div></div><div class="track-bottom"><span>Sunbeam Circuit</span><span>一條賽道 · 無限次再戰</span></div></section>
<aside><section class="pit-panel"><div class="panel-heading"><span class="flag-icon">⚑</span><h2 id="panel-title">準備上場？</h2></div><div id="menu"><label for="player-name">你的車手名</label><input id="player-name" maxlength="16" placeholder="例如：過彎不煞車" autocomplete="nickname"><button id="create" class="primary" disabled>建立私人房間 <span>＋</span></button><div class="join-row"><input id="room-code" aria-label="房間代碼" maxlength="6" placeholder="6 位房間代碼" autocapitalize="characters"><button id="join" class="secondary" disabled>加入</button></div><div class="divider"><span>想先熟悉手感？</span></div><button id="practice" class="practice" disabled>自由練習 <span>↗</span></button></div><div id="lobby" hidden></div><div id="race" hidden></div><p id="message" role="status" aria-live="polite"></p></section>
<section class="controls"><h3>你的方向盤</h3><div><span><kbd>W</kbd><kbd>↑</kbd></span><span>加速</span></div><div><span><kbd>S</kbd><kbd>↓</kbd></span><span>煞車 / 倒車</span></div><div><span><kbd>A</kbd><kbd>D</kbd><kbd>←</kbd><kbd>→</kbd></span><span>轉向</span></div><div><kbd>Shift</kbd><span>按住甩尾，放開加速</span></div><div><kbd>Space</kbd><span>使用道具</span></div></section></aside></div>
<footer><span>友誼第一，終點線第二。</span><span>原創小車 · 即開即玩</span></footer></main>`;
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
let engine: Engine;
let practicing = false;
let keys = 0;
let itemQueued = false;
let busy = false;
const session = new Session();
function escape(text: string) {
  const span = document.createElement("span");
  span.textContent = text;
  return span.innerHTML;
}
session.onError = (text) => {
  $("message").textContent = text;
};
function returnToMenu(message = "") {
  racing = false;
  practicing = false;
  resultsShown = false;
  pressed.clear();
  setKeys();
  itemQueued = false;
  engine?.reset(1);
  $("lobby").hidden = true;
  $("race").hidden = true;
  $("menu").hidden = false;
  $("panel-title").textContent = "準備上場？";
  $("session-label").textContent = "先來熱個身";
  $("message").textContent = message;
}
session.onEnded = returnToMenu;
addEventListener("pagehide", () => session.leave(false));
session.onRoom = (room) => {
  $("message").textContent = "";
  for (const member of room.members)
    engine?.connected(member.slot, member.connected);
  if (room.phase === "results") {
    const rematch = $<HTMLButtonElement>("rematch");
    if (rematch)
      rematch.disabled =
        !session.isHost || room.members.filter((m) => m.connected).length < 2;
  }
  if (room.phase !== "lobby") return;
  practicing = false;
  $("menu").hidden = true;
  $("race").hidden = true;
  $("lobby").hidden = false;
  $("panel-title").textContent = "車手集合";
  $("lobby").innerHTML =
    `<p style="font-size:12px;text-align:center">分享代碼，揪朋友上場</p><div class="room-code" data-testid="room-code">${room.code}</div><ul class="member-list" data-testid="members">${room.members.map((m) => `<li><i class="car-dot" style="background:${COLORS[m.slot]}"></i>${escape(m.name)}<small>${m.slot === 0 ? "房主" : "已加入"}</small></li>`).join("")}</ul><button class="primary" id="start" ${!session.isHost || room.members.length < 2 ? "disabled" : ""}>${session.isHost ? "開始比賽" : "等待房主開始"}</button><button class="secondary wide" id="leave">離開房間</button>`;
  $("start").onclick = () => session.start();
  $("leave").onclick = () => {
    session.leave();
    returnToMenu();
  };
};
let racing = false,
  resultsShown = false;
session.onInput = (slot, input) => engine.input(slot, input);
session.onState = (data) => {
  try {
    engine.restore(data);
  } catch (error) {
    session.leave();
    returnToMenu((error as Error).message);
  }
};
function bindRaceLeave() {
  const button = $("race-leave");
  if (button)
    button.onclick = () => {
      session.leave();
      returnToMenu();
    };
}
function racePanel() {
  $("race").innerHTML =
    '<div class="race-stats"><div><strong data-testid="lap">1 / 3</strong><span>目前圈數</span></div><div><strong data-testid="rank">1</strong><span>目前名次</span></div></div><div class="race-effects" data-testid="effects"></div><div class="speed"><strong data-testid="speed">0</strong><span>速度</span></div><div class="item-slot"><small>你的道具 · Space 使用</small><strong data-testid="held-item">空道具欄</strong></div><svg class="minimap" viewBox="0 0 1200 800" aria-label="賽道小地圖"><ellipse cx="600" cy="400" rx="400" ry="225" fill="none" stroke="#ded7ce" stroke-width="110"/><g id="effect-markers"></g><g id="boxes"></g><g id="markers"></g></svg><button id="race-leave" class="secondary wide">離開比賽</button>';
  bindRaceLeave();
}
session.onStart = (mask, seed) => {
  practicing = false;
  racing = true;
  resultsShown = false;
  itemQueued = false;
  pressed.clear();
  setKeys();
  engine.reset(mask, seed, 0);
  $("menu").hidden = true;
  $("lobby").hidden = true;
  $("race").hidden = false;
  $("panel-title").textContent = "比賽進行中";
  $("session-label").textContent = `房間 ${session.room?.code}`;
  $("message").textContent = "";
  racePanel();
};
function name() {
  const value = $<HTMLInputElement>("player-name").value.trim();
  if (!value) throw new Error("先幫自己取個車手名吧。");
  return value;
}
$("create").onclick = async () => {
  if (busy) return;
  busy = true;
  $<HTMLButtonElement>("create").disabled = true;
  try {
    $("message").textContent = "建立房間中…";
    await session.create(name());
    $("message").textContent = "";
  } catch (error) {
    $("message").textContent = (error as Error).message;
  } finally {
    busy = false;
    $<HTMLButtonElement>("create").disabled = false;
  }
};
$("join").onclick = async () => {
  if (busy) return;
  busy = true;
  $<HTMLButtonElement>("join").disabled = true;
  try {
    const code = $<HTMLInputElement>("room-code").value.trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(code)) throw new Error("請輸入六位房間代碼。");
    $("message").textContent = "加入房間中…";
    await session.join(code, name());
  } catch (error) {
    $("message").textContent = (error as Error).message;
  } finally {
    busy = false;
    $<HTMLButtonElement>("join").disabled = false;
  }
};
const keyBits: Record<string, number> = {
  KeyW: 1,
  ArrowUp: 1,
  KeyS: 2,
  ArrowDown: 2,
  KeyA: 4,
  ArrowLeft: 4,
  KeyD: 8,
  ArrowRight: 8,
  ShiftLeft: 16,
  ShiftRight: 16,
  Space: 32,
};
const pressed = new Set<string>();
function setKeys() {
  keys = [...pressed].reduce((mask, code) => mask | (keyBits[code] || 0), 0);
}
addEventListener("keydown", (event) => {
  if ((!practicing && !racing) || event.target instanceof HTMLInputElement)
    return;
  if (keyBits[event.code]) {
    event.preventDefault();
    if (event.code === "Space" && !event.repeat) itemQueued = true;
    pressed.add(event.code);
    setKeys();
  }
});
addEventListener("keyup", (event) => {
  pressed.delete(event.code);
  setKeys();
});
addEventListener("blur", () => {
  pressed.clear();
  setKeys();
});
$("practice").onclick = () => {
  practicing = true;
  racing = false;
  itemQueued = false;
  pressed.clear();
  setKeys();
  engine.reset(1);
  $("menu").hidden = true;
  $("race").hidden = false;
  $("panel-title").textContent = "自由練習中";
  $("session-label").textContent = "自由練習";
  $("race").innerHTML =
    '<div class="race-effects" data-testid="effects"></div><div class="speed"><strong data-testid="speed">0</strong><span>速度</span></div><button id="back" class="secondary wide">返回大廳</button>';
  $("back").onclick = () => returnToMenu();
};
try {
  engine = await Engine.load($<HTMLCanvasElement>("game"));
  engine.reset(1);
  $("engine-status").textContent = "賽道已就緒";
  $<HTMLButtonElement>("practice").disabled = false;
  $<HTMLButtonElement>("create").disabled = false;
  $<HTMLButtonElement>("join").disabled = false;
  let previous = performance.now();
  let lastNetwork = 0;
  function frame(now: number) {
    const slot = racing ? session.slot : 0;
    if (!racing || session.isHost) {
      engine.input(
        slot,
        practicing || racing ? keys | (itemQueued ? 32 : 0) : 0,
      );
      engine.step((now - previous) / 1000);
      itemQueued = false;
    }
    if (racing && now - lastNetwork > 50) {
      lastNetwork = now;
      if (session.isHost) session.state(engine.snapshot());
      else {
        session.input(keys | (itemQueued ? 32 : 0));
        itemQueued = false;
      }
    }
    previous = now;
    engine.draw(slot);
    const view = engine.view();
    const speed = document.querySelector('[data-testid="speed"]');
    if (speed)
      speed.textContent = String(Math.round(view.cars[slot]?.speed || 0));
    const effects = document.querySelector('[data-testid="effects"]');
    if (effects)
      effects.textContent =
        view.cars[slot]?.slow > 0
          ? "受到減速…"
          : view.cars[slot]?.drifting
            ? "甩尾中…"
            : view.cars[slot]?.boost > 0
              ? view.cars[slot]?.boostKind === 2
                ? "道具加速！"
                : "甩尾加速！"
              : "";
    const held = document.querySelector('[data-testid="held-item"]');
    if (held)
      held.textContent = ["空道具欄", "渦輪糖", "彈彈球", "泡泡錐"][
        view.cars[slot]?.held || 0
      ];
    const effectMarkers = $("effect-markers");
    if (effectMarkers)
      effectMarkers.innerHTML = view.effects
        .map(
          (e) =>
            `<circle cx="${e.x}" cy="${e.y}" r="13" fill="#9a6ac7" aria-label="${e.kind === 2 ? "前方攻擊" : "後方障礙"}"/>`,
        )
        .join("");
    const boxes = $("boxes");
    if (boxes)
      boxes.innerHTML = view.boxes
        .map(
          (b, i) =>
            `<rect data-testid="box-${i}" x="${b.x - 14}" y="${b.y - 14}" width="28" height="28" fill="${b.active ? "#37aeac" : "#d7d2c6"}" aria-label="道具箱${b.active ? "可拾取" : "等待重生"}"/>`,
        )
        .join("");
    const lap = document.querySelector('[data-testid="lap"]'),
      rank = document.querySelector('[data-testid="rank"]');
    if (lap) lap.textContent = `${view.cars[slot]?.lap || 1} / 3`;
    if (rank) rank.textContent = String(view.cars[slot]?.rank || 1);
    if (racing && view.phase === 2 && !resultsShown) {
      resultsShown = true;
      pressed.clear();
      setKeys();
      if (session.isHost) session.finish(engine.snapshot());
      $("panel-title").textContent = "本場成績";
      $("race").innerHTML =
        `<ol class="results" data-testid="results">${view.cars
          .map((car, i) => ({ car, i }))
          .filter(({ car }) => car.present)
          .sort((a, b) => a.car.rank - b.car.rank)
          .map(
            ({ car, i }) =>
              `<li><b>${car.finished ? car.rank : "—"}</b><i class="car-dot" style="background:${COLORS[i]}"></i>${escape(session.room?.members.find((m) => m.slot === i)?.name || "車手")} ${car.finished ? "" : "未完賽"}</li>`,
          )
          .join(
            "",
          )}</ol><button id="rematch" class="primary" ${session.isHost && (session.room?.members.filter((m) => m.connected).length || 0) >= 2 ? "" : "disabled"}>${session.isHost ? "再賽一場" : "等待房主再賽"}</button><button id="race-leave" class="secondary wide">返回大廳</button>`;
      $("rematch").onclick = () => session.start();
      bindRaceLeave();
    }
    const countdown = document.querySelector<HTMLElement>(".countdown")!;
    countdown.dataset.testid = "countdown";
    countdown.hidden = !racing || view.phase !== 0;
    countdown.textContent = String(Math.max(1, Math.ceil(3 - view.time)));
    const markers = $("markers");
    if (markers)
      markers.innerHTML = view.cars
        .map((car, i) =>
          car.present
            ? `<g data-testid="car-${i}" transform="translate(${car.x} ${car.y}) rotate(${(car.angle * 180) / Math.PI})" aria-label="${escape(session.room?.members.find((m) => m.slot === i)?.name || "車手")}${car.boost > 0 ? " 加速中" : ""}${car.slow > 0 ? " 減速中" : ""}${car.connected ? "" : " 斷線幽靈車"}"><path d="M26 0 L-18 -16 L-10 0 L-18 16Z" fill="${COLORS[i]}"/></g>`
            : "",
        )
        .join("");
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  void session.resumeSaved();
} catch (error) {
  $("message").textContent = String(error);
  $("engine-status").textContent = "賽道載入失敗";
}
