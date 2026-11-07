---
name: "三人坦克合作戰鬥"
description: "1944 年諾曼第背景下，三名乘員在雙色手冊圖版上認領座位，再於同一套圖版語言的受限視野工作站協作。"
colors:
  paper: "#ebe5d2"
  paper-deep: "#e2dbc4"
  paper-field: "#f5f1e4"
  ink: "#1c1c18"
  ink-soft: "#4d4a3c"
  ink-red: "#a3352b"
  rule: "#b3aa8f"
  ink-hover: "#36352d"
  ink-disabled: "#857f69"
  mg-reticle: "#ede8c5"
  interior-background: "#171e1c"
  interior-paint: "#697367"
  interior-dark-paint: "#39473c"
  interior-steel: "#81877f"
  interior-mechanism: "#151b19"
  interior-brass: "#b8a06a"
  interior-rubber: "#242925"
  sherman-paint: "#788467"
  panzer-paint: "#ad9e78"
  tiger-paint: "#a79a75"
  ground-earth: "#9b947b"
  ground-grass: "#7d8259"
  field-soil: "#8d805c"
  masonry: "#d2cbb4"
typography:
  plate-display:
    fontFamily: '"Noto Serif TC", "Songti TC", serif'
    fontSize: "clamp(28px, 3.4vw, 40px)"
    fontWeight: 900
    letterSpacing: "0.06em"
  plate-headline:
    fontFamily: '"Noto Serif TC", "Songti TC", serif'
    fontSize: "22px"
    fontWeight: 700
    letterSpacing: "0.04em"
  plate-role:
    fontFamily: '"Noto Serif TC", "Songti TC", serif'
    fontSize: "23px"
    fontWeight: 700
    lineHeight: 1.3
  plate-room-code:
    fontFamily: '"Noto Serif TC", "Songti TC", serif'
    fontSize: "44px"
    fontWeight: 900
    lineHeight: 1.2
    letterSpacing: "0.16em"
  plate-numeral:
    fontFamily: '"Noto Serif TC", "Songti TC", serif'
    fontSize: "17px"
    fontWeight: 900
  station-title:
    fontFamily: '"Noto Serif TC", "Songti TC", serif'
    fontSize: "22px"
    fontWeight: 900
    letterSpacing: "0.06em"
  station-title-driver:
    fontFamily: '"Noto Serif TC", "Songti TC", serif'
    fontSize: "28px"
    fontWeight: 900
    letterSpacing: "0.06em"
  station-readout:
    fontFamily: '"Noto Serif TC", "Songti TC", serif'
    fontWeight: 700
    fontFeature: "tnum"
  driver-speed:
    fontFamily: '"Noto Serif TC", "Songti TC", serif'
    fontSize: "96px"
    fontWeight: 900
    lineHeight: 1.1
    fontFeature: "tnum"
  driver-status:
    fontFamily: '"Noto Serif TC", "Songti TC", serif'
    fontSize: "22px"
    fontWeight: 700
  plate-body:
    fontFamily: '"PingFang TC", "Noto Sans TC", sans-serif'
    fontSize: "15px"
    lineHeight: 1.7
  plate-label:
    fontFamily: '"PingFang TC", "Noto Sans TC", sans-serif'
    fontSize: "14px"
    lineHeight: 1.6
  plate-caption:
    fontFamily: '"PingFang TC", "Noto Sans TC", sans-serif'
    fontSize: "13px"
    lineHeight: 1.6
  work-line:
    fontFamily: '"PingFang TC", "Noto Sans TC", sans-serif'
    fontSize: "14px"
    lineHeight: 1.5
  work-readout:
    fontFamily: '"PingFang TC", "Noto Sans TC", sans-serif'
    fontSize: "16px"
  compact-control:
    fontFamily: '"PingFang TC", "Noto Sans TC", sans-serif'
    fontSize: "13px"
rounded:
  plate: "0"
  seat-marker: "50%"
spacing:
  plate-tight: "10px"
  plate-row: "12px"
  plate-section: "28px"
  plate-edge: "32px"
  plate-shell: "48px"
  work-gap: "8px"
  station-edge: "12px"
  station-column: "20px"
  driver-column: "32px"
components:
  plate-button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.plate}"
    padding: "12px 22px"
  plate-button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
  plate-button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "12px 22px"
  plate-button-secondary-hover:
    backgroundColor: "{colors.paper-field}"
  plate-button-disabled:
    backgroundColor: "transparent"
    textColor: "{colors.ink-disabled}"
    rounded: "{rounded.plate}"
  plate-input:
    backgroundColor: "{colors.paper-field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "12px 14px"
    width: "100%"
  plate-role-claim:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.plate-role}"
    rounded: "{rounded.plate}"
    padding: "2px 0 3px"
  plate-role-claim-mine:
    textColor: "{colors.ink-red}"
  plate-seat-free:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.seat-marker}"
    size: "30px"
  plate-seat-taken:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.seat-marker}"
    size: "30px"
  plate-seat-mine:
    backgroundColor: "{colors.ink-red}"
    textColor: "{colors.paper}"
    rounded: "{rounded.seat-marker}"
    size: "30px"
  plate-panel:
    backgroundColor: "{colors.paper-deep}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "28px 32px 32px"
  plate-room-code:
    textColor: "{colors.ink-red}"
    typography: "{typography.plate-room-code}"
  station-plate:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "14px 16px"
  station-plate-driver:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "28px 32px 32px"
  scene-figure:
    backgroundColor: "{colors.paper-deep}"
    rounded: "{rounded.plate}"
  scene-label:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "0.3rem 0.6rem"
  mg-hud:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "8px 12px"
  mg-hud-overheated:
    textColor: "{colors.ink-red}"
  enemy-warning:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-red}"
    rounded: "{rounded.plate}"
  work-progress:
    backgroundColor: "{colors.paper-field}"
    rounded: "{rounded.plate}"
    height: "10px"
  jam-track:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.plate}"
    height: "38px"
  jam-needle:
    backgroundColor: "{colors.ink-red}"
    width: "4px"
  battle-pause:
    backgroundColor: "{colors.paper-field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
    padding: "1rem"
  battle-result-failed:
    textColor: "{colors.ink-red}"
  battle-result-won:
    textColor: "{colors.ink}"
  station-sound-on:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.plate}"
  driver-speed:
    textColor: "{colors.ink}"
    typography: "{typography.driver-speed}"
---

# Design System: 三人坦克合作戰鬥

## Overview

**Creative North Star: "三人共乘一台重型戰車"**

三位乘員共用一台重型戰車，以各自受限的視野與清楚的工作狀態協作。整個 HTML 介面是同一張戰時技術手冊的雙色凸版圖版：手冊紙為底、單一墨色負責線圖、規線、文字與實心主按鈕，第二色朱紅保留給極少數必須立刻注意的東西。`html[data-surface]` 仍分 manual（主選單與大廳）與 battle（三個戰鬥工作站），但兩者共用 `:root[data-surface]` 上的同一組紙／墨 token；切換只改版面與朱紅的語意，不換世界。

**入口與大廳。** 認領職位就是在 Sherman 俯視圖版上認領一個有編號的乘員座位。車體線圖上的三個座位記號即時反映權威房間狀態（空位留白、他人墨色、自己朱紅），以 1px 引線連到編號圖例；右側面板有朱紅大字房間代碼、編號乘員表與準備／開始／離開。

**戰鬥工作站。** 每個工作站是一張圖版：2px 墨框、透明紙底、明體 900 標題。即時 3D 外景或車內是這張圖版的「圖」，以 2px 墨線框起；場景上的覆蓋層是紙底墨線的標籤。朱紅只標示現在需要行動的危險。駕駛沒有外景，他的圖版就是巨大的明體速度讀數、規線狀態列與車體座位圖例（座位 1 朱紅）。3D 世界本身仍是 1944 年卡昂周邊的石造農村、土路及自然日光，車輛、田行與葉叢保留使用者接受的簡化程序外觀；圖版語言只屬於 HTML 介面，不把 3D 場景畫成紙。

**Key Characteristics:**

- 兩個表面共用紙／墨／朱紅三種墨水角色、方角與 1–2px 墨線；沒有陰影、沒有圓角卡片。
- 大廳：車體俯視圖的座位記號、圖例與乘員表永遠是三個座位，鏡射權威房間狀態。
- 戰鬥：工作站是圖版、3D 場景是圖、覆蓋層是紙標籤；朱紅只在危險當下出現。
- 接受的簡化程序外觀，保留 Sherman／四號 H／虎式 I 辨識。
- 自然日光外景與封閉工作燈車內，分開處理照明。
- 場景優先、工作資訊緊湊，駕駛維持沒有外景的資訊限制。
- 明確中文、數字、焦點與可見危險提示，支援桌機實體鍵盤。

紙／墨 token 以 [tank.css](web/tank.css) 的 `:root[data-surface]` 區塊為準；大廳規則在 `[data-surface="manual"]`，戰鬥規則從「Battle surface: each workstation is a plate」註解開始，後接「Red ink is for danger now」與「Driver: no scene」兩段。戰鬥的格線、場景高度與覆蓋層位置仍由同檔較前段的工作站版面規則決定。方向依 [surface brief](.impeccable/surfaces/web-tank-main-ts.md)；3D 世界依 [PRODUCT.md](PRODUCT.md)、[外景 brief](.impeccable/briefs/tank-exterior.md)、[外景](web/tank-scene.ts)、[車模](web/tank-vehicle-model.ts)、[地景](web/tank-environment.ts) 與 [車內](web/tank-interior-scene.ts)。使用者於 2026-11-07 接受「接受目前簡化外觀，修正浮空零件後完成整合」；此文件記錄已修正附著的當前實作，沒有宣稱先前寫實標準通過。

## Colors

紙上雙色印刷：一種墨、一種朱紅、三層紙；兩個表面相同。3D 材質基色另成一組，只作 renderer 輸入。

### Primary

- **手冊墨**（ink）：線圖、2px 結構框與規線、正文、實心主按鈕、「他人已佔」座位記號；戰鬥中也是工作站框、場景外框、覆蓋層框線、進度條填色、卡彈目標區斜線與音效開關 pressed 底。主按鈕 hover 使用略淺的 ink-hover。

### Secondary

- **第二墨朱紅**（ink-red）：兩個表面共用的鍵盤焦點框、文字選取底色與輸入游標。大廳：只屬於「你」：你的座位記號、你已按下的職位、乘員表中你的名字與座位數字、「你已擔任」，以及房間代碼。戰鬥：只屬於現在的危險：敵方瞄準預告（紅字紅框）、受擊一秒內的受傷文字與 3px 外框、退殼警示、暈眩倒數與 4px 車內框、卡彈標題與指針、機槍過熱（框、字與熱量條），以及戰鬥失敗結果；駕駛座位圖例上的座位 1 沿用大廳「你」的語意。

### Neutral

- **三層手冊紙**：paper 是頁面底、空位記號、場景覆蓋標籤、卡彈軌與裝填手場景內結果層；paper-deep 是大廳右側面板，也是 3D canvas 繪出前看得到的場景底；paper-field 是輸入、hover、進度條槽、卡彈目標區斜線間隙、暫停底與砲手十字準星線色。
- **淡墨與規線**：ink-soft 用於說明、圖說、欄位標頭、未準備狀態、駕駛「速度」標籤，以及已過一秒受擊窗口的受傷文字；rule 是 1px 列分隔線與裝填手武器狀態列上下線。ink-disabled 只用於停用按鈕文字，停用框線取 rule；停用按鈕不降透明度。
- **機槍準星**（mg-reticle）：機槍外景中央 18px 圓形準星的 1px 線色；仍是戰鬥中唯一沿用舊淺色的介面元素，直接疊在明亮 3D 場景上。
- **車內機械色**：interior-background 襯托 paint／dark-paint、裸鋼、深色機械、黃銅與橡膠；不把暗部照成第二個室外場景。
- **外景材質基色**：Sherman 灰綠、Panzer／Tiger 沙土色，以及 earth／grass／field-soil／masonry 共同建立可辨識的簡化農村場景。3D 基色是材質輸入，不是最後畫面像素或歷史軍漆規格。

**The Second Ink Rule.** 朱紅在大廳只標示屬於你的東西與要念給隊友的房間代碼，在戰鬥只標示現在需要行動的危險；兩處共用朱紅焦點框。其他狀態一律用墨、淡墨與留白。

**The Danger Is Now Rule.** 戰鬥朱紅跟著狀態亮起、跟著狀態熄滅：受傷文字只在 `.under-fire`（受擊一秒內）為朱紅，之後回淡墨；機槍熱量平常是墨色，只有 `data-overheated` 轉朱紅；結算只有 `data-outcome="failed"` 為朱紅，勝利用墨。

**The Role Truth Rule.** 視覺只呈現職位獲准知道的資訊；駕駛不建立外部 renderer。

## Typography

**Display Font:** Noto Serif TC 700／900（後備 Songti TC、serif），自行託管於 `public/fonts/` 的字元子集 woff2，由 tank.css 開頭 `@font-face`（`font-display: swap`）載入，index.html 預載 900。授權（SIL OFL 1.1）、來源與 SHA-256 見 [字型 README](public/fonts/README.md)；沒有 Google Fonts 執行期依賴。子集只含目前介面字串的字元：新字串若落在明體位置（標題、職位名、讀數、房間代碼），必須依 README 重新產生子集，否則缺字會落到 Songti TC。
**Body Font:** PingFang TC、Noto Sans TC、sans-serif（系統無襯線）。沒有等寬字體；數值採 tabular-nums。

**Character:** 粗重明體負責名稱、標題與數字，像手冊圖版的標號與讀數；說明、狀態句與按鍵提示留給系統黑體。

### Hierarchy

- **Plate display**：大廳頁首 h1，900、流動字級、寬字距。
- **Plate headline**：兩個表面的 h2 基礎與大廳 legend（與隊友集合、乘員集合、選擇你的職位）。
- **Plate role**：大廳可認領職位按鈕，下方 2px 墨線；主選單圖例職位名稱同明體 22px。
- **Plate room code**：朱紅大字房間代碼；600px 以下 36px。
- **Plate numeral**：座位記號與圖例圓圈內的 1／2／3；乘員表座位欄 18px。
- **Station title**：砲手與裝填手工作站標題，明體 900、0.06em；駕駛為 28px 並帶 2px 墨線底線（station-title-driver）。戰鬥結算 h2 同為明體 900、0.06em。
- **Station readout**：工作站內所有 strong 讀數（朝向、轉速、彈種、裝填進度、發射數、機槍熱度、暈眩倒數等）為明體 700、表格數字，字級沿用所在行；共用血量為 900、1.15em。
- **Driver speed**：駕駛速度數字 96px／900、行高 1.1，600px 以下 72px；其下動態與車體狀態行為明體 700 22px（driver-status）。
- **Plate body／label／caption**：大廳說明 15px、標籤與狀態 14px、圖說與欄位標頭 13px，皆系統黑體；表單 label 600。
- **Work line**：砲手工作站直屬行與武器狀態列 14px、行高 1.5；機槍 HUD 14px、行高 1.45。退殼警示在裝填工作區為 18px／700 黑體。
- **Work readout**：砲手朝向讀數行 16px。
- **Compact control**：13px，只用於裝填工作站的音效及離開按鈕。

**The Serif Is For Names And Numbers Rule.** 明體只用在標題、職位名稱、座位與讀數數字、房間代碼、駕駛狀態行與結算；說明、警示句與按鍵提示一律系統黑體。

## Layout

**大廳圖版。** 主容器最大 1200px、內距 36px 48px 48px。頁首為兩欄 grid（標題／設定行並排，語音通話句跨欄），下接 2px 墨線。圖版本體以 2px 墨框包住兩欄：左為圖區（minmax(0, 1fr)）、右為 420px 面板，面板左緣 2px 墨線。圖區內分 340px 車體圖與編號圖例；圖例固定高 442px、等分三列，列間 1px 規線。車體圖 viewBox 300×340、引線終點 y＝17／147／277，與 340px 圖欄及 442px 圖例共同決定引線對齊各列圓圈；改其一必須同時改另外兩個。面板內表單單欄、間距 10px，行動區兩欄、準備鈕跨兩欄，上距 28px。乘員表欄位為 36px 座位／姓名／職位／56px 狀態，列內距 12px。

**The Always Three Seats Rule.** 圖版、圖例與乘員表永遠呈現三個座位；人數不足時以「空位・等待隊友加入」列補齊，座位數字取自職位順序（1 駕駛、2 砲手、3 裝填手）。

1000px 以下圖版改單欄，面板改上緣 2px 墨線。600px 以下主容器 20px 16px 32px、頁首單欄、圖區單欄、車體圖縮為 220px 置中並隱藏引線，圖例取消固定高度，乘員表欄寬縮為 32px 與 8px 欄距。390px 寬度仍明示需要三位玩家、三台電腦與實體鍵盤；這是窄桌機視窗，不是觸控設計。

**砲手工作站。** 容器最大 1600px、內距 12px 18px 24px；工作站雙欄 minmax(0, 1fr)／auto、間距 8px 20px、內距 14px 16px。戰鬥收起頁首與入房介紹。場景跨欄，高度 clamp(300px, calc(100dvh - 300px), 720px)；方向、HP、武器狀態列（上下 1px 墨線）與敵情行緊鄰場景。敵方瞄準預告與敵情行由 tank-main.ts 移到場景之前的工作站列，不蓋在場景上；煙幕狀態留在場景右下。700px 以下改單欄與 320px 場景。1280×720 的主要工作資訊以同屏為目標；實際可見範圍仍隨敵情、暫停與結算文字改變，一般離開控制可能在初始畫面下方，勿記錄成所有控制都在首屏。

**裝填工作區。** 全寬主容器，內距 12px 18px，工作站內距 12px。主畫面是封閉炮尾、滑塊、後座導桿、手輪、砲彈架及曲面內壁；下緣工作條顯示所選／膛內彈、階段、進度與發射數。場景高度 max(300px, calc(100dvh - 310px))；卡彈軌出現時為上方工作區騰出高度。受傷文字固定在工作站右上。600px 以下改為 340px 場景、流動狀態列與 8px 主容器內距。機槍獨立外景高 max(300px, calc(100dvh - 340px))，熱量 HUD 放進場景左下。

**駕駛工作站。** #30／#31 取代盲開圖版：主容器最大 1600px，內距 12px 18px 24px；工作站內距 14px 16px，標題與共用 HP 並列，實際裝甲觀察窗跨欄。場景高 clamp(300px, calc(100dvh - 280px), 720px)，下方保留緊湊速度／動態／受阻儀表與按鍵說明。駕駛不再重複座位圖，側後方仍依賴隊友觀察。600px 以下單欄。全螢幕 HUD 整合由 #30 的後續切片接續。

暫停不遮掉凍結語意；各工作站為完整等待文字騰出場景高度。結算保留明確結果與 HP，返回控制固定右下 24px，裝填工作區另有場景中結果層。進入主選單、工作站、新的大廳、結算或暫停狀態時，各在轉換當下將頁面捲至頂端；一般狀態更新不重複拉回頂端。這是現有響應行為，不是手機觸控設計。

## Elevation & Depth

整個 HTML 介面平面：沒有陰影、沒有浮起卡片、沒有模糊或玻璃。層次只靠三層紙色與墨線粗細：2px 結構框（大廳圖版、工作站、場景外框、卡彈區）、1.5px 輸入框、覆蓋標籤、進度條與卡彈軌、1px 列規線與引線、1.2px 虛線（艙間分隔與副駕艙口）。強調靠更粗或雙線：受擊 3px 朱紅外框（offset 4px）、暈眩 4px 朱紅車內框、暫停 4px 雙墨線。

### Shadow Vocabulary

- **準星墨環**（`box-shadow: 0 0 0 1px #1c1c18`）：零位移、零模糊的 1px 墨色外環，只用在砲手十字準星的兩條 paper-field 細線，讓它在明亮與陰暗場景上都可讀。這是描邊，不是投影。

**The Ruled, Not Raised Rule.** 以規線和紙色分層，不用陰影、模糊或浮起；需要更強調時加粗墨線或改雙線。

3D 深度由程序幾何、材質與光照形成；保留簡化表面，不把所有漆面改成鏡面金屬。外景實際 render budget 是內部繪圖最多 1024×576、DPR 最多 1.5，日光陰影 512×512；ACES 曝光 0.98、半球光強度 1.25、日光 2.3。本機 1K Pure Sky 僅作光照／背景，環境強度 0.35、背景強度 0.8，不宣稱是諾曼第照片。陰影只隨車體／炮塔姿態及敵車集合變更刷新，靜止場景有 250ms 低頻補畫；煙雲、彈道與命中特效仍更新。這些是程式中的資源安排，不是 FPS 保證。

車內保留一盞投影工作聚光燈（柔邊、1024×1024 shadow）、半球光與補光；曝光 1.15，不替每個零件增加光源。paint normal scale 0.22、steel 0.07，貼圖 repeat 2×2。車內初始化 buffer 為 1024×576，實際 resize 跟隨可見 canvas、DPR 最多 1.5；不要把外景的最大內部尺寸誤套為車內上限。

**The Supported Parts Rule.** 扣件、燈具及其他機械附屬件必須坐在其實際支撐表面；簡化外觀不取消物理附著。

## Shapes

所有按鈕、輸入、面板、工作站、場景框、覆蓋標籤、進度條與卡彈軌都是方角。圓形只出現在手冊圖版的編號記號（車體圖座位圓半徑 15、圖例 34px 編號圓圈）與機槍 18px 圓形準星。車體圖為線稿：左右履帶帶 14 組履帶節線、圓角車首、砲塔圓、主炮管、兩個前艙口（駕駛實線、副駕虛線）及艙間分隔虛線；圖說明示「示意，未依比例」。可認領職位以 2px 底線表示可按，已被他人擔任時底線消失。

砲手準星由兩條 28px paper-field 細線交叉、外加 1px 墨環。卡彈軌高 38px；目標區以 -45° 墨色斜線（1.5px 墨／5.5px 紙間隙的 repeating-linear-gradient）與 2px 墨框表示，「目標」字樣的第一行襯 paper-field 保持可讀；指針寬 4px、朱紅、1px 紙色邊。斜線填色是手冊圖的剖面線，不是裝飾紋理。

車體用原創斜面、圓鑄炮塔、分離輪組與履帶辨識。Sherman 保留六路輪／三組 VVSS、短 75mm 炮；四號 H 用八路輪、分段側裙及 L/48 長炮；虎式 I 用寬車身、交錯大輪與不同炮塔／88mm 炮。扣件以各車實際偏移的 cupola cap 為中心，Sherman 燈具坐在斜裝甲與短支架上。這些辨識與支撐關係比額外表面裝飾優先。

## Components

### 按鈕與輸入（兩個表面）

印刷按鈕：主要為實心墨底紙色字、2px 墨框、700 字重；次要（加入房間、離開房間、音效開關）透明底墨字，hover 換成 paper-field。停用時改為透明底、ink-disabled 字與 rule 框，不降透明度，讓「開始戰鬥」在等待時仍可讀。焦點是 3px 朱紅 outline、offset 3px。音效開關開啟時為墨底紙字。裝填工作站的音效與離開鈕為 13px 緊湊尺寸；不另創按鈕家族。輸入為 paper-field 底、1.5px 墨框、方角、朱紅游標；房間代碼輸入大寫並用明體 700、0.16em 字距。

### 車體座位圖與圖例

Sherman 俯視線圖上的三個座位記號：空位為紙色填、墨框墨字；他人已佔為墨填紙字；你的座位為朱紅填紙字。每個記號以 1px 引線轉折連到右側同號圖例列。主選單顯示同一張圖但三席皆空；大廳圖例每列是真實的職位按鈕、任務說明與擔任者（空位／目前由某人擔任／你已擔任），列的編號圓圈依 data-state 同步填色。可按的職位列 hover 時整列換為 paper-field（160ms ease-out，是唯一的 CSS transition）。座位記號鏡射權威房間狀態，三台瀏覽器同步。駕駛在戰鬥以裝甲觀察窗取代重複座位圖。

### 房間面板與乘員表

面板以 paper-deep 為底。房間標頭為淡墨標籤「房間代碼・念給隊友」加朱紅大字代碼，其下人數列（就位數／已準備數）。乘員表有 2px 墨線欄位標頭（對輔助技術隱藏），每位真實成員一列：座位數字（未選為「—」）、名字（房主／你）、職位與準備狀態；已準備為墨色 700，未準備為淡墨 400；你的那一列名字與座位數字為朱紅。準備中狀態訊息以 1.5px 墨框包住。

### Room and preparation

建立／加入、乘員列、職位、準備與房主開始仍採清楚表單。準備先顯示「正在準備工作畫面，完成後才會標示已準備；可取消或改選職位。」等待真實貼圖、shader compile 與首個 GPU draw；裝填手同時準備車內與機槍並重用準備好的 renderer。取消、改職、離房、返回大廳使過期準備失效並釋放所屬資源。一般隊友 ready 更新保留暖機資源；駕駛同樣準備裝甲前窗的實際外景並在開戰重用。恢復舊戰鬥遭拒時，若畫面已是入房表單，保留使用者正在輸入的名稱／代碼與既有表單節點，只更新真實拒絕訊息並隱藏失效重試；從大廳或戰鬥終房仍完整回主選單。較新的加入／恢復擁有自己的連線，舊恢復失敗不能清理它。依據 [tank-main.ts](web/tank-main.ts) 與 [tank-art-preparation.ts](web/tank-art-preparation.ts)。

### 工作站圖版

透明紙底、2px 墨框、方角；標題為 station title。場景（砲手外景、裝填車內、機槍外景）以 2px 墨色 outline 框成圖版的「圖」，canvas 繪出前露出 paper-deep。砲手武器狀態列上下 1px 墨線，裝填手為 1px rule。進度條（裝填進度、機槍熱度）是 1.5px 墨框、paper-field 槽、墨色填充的方角條。共用波次列提供目前波數及存活敵車數。

### 場景覆蓋層與警示

煙幕狀態與機槍 HUD 是紙底墨字、1.5px 墨框的方角標籤，不用不透明整片面板遮住場景。機槍 HUD 平常墨色，`data-overheated` 時框、字與熱量條改朱紅；機槍用自己的 yaw／pitch 視角，不跟主炮轉。敵方瞄準預告為紙底、朱紅 700 字、2px 朱紅框，放在場景前的工作站列。受擊一秒內工作站加 3px 朱紅外框（offset 4px），受傷文字朱紅；窗口過後文字回淡墨、外框消失。裝填手暈眩時車內框加粗為 4px 朱紅，倒數為朱紅表格數字；退殼警示朱紅。所有警示同時用中文與數字交代狀態。

### 卡彈、暫停與結算

卡彈區為 paper-field 底、2px 墨框，明體 700 朱紅標題「卡彈：停在目標區」，軌道見 Shapes。暫停為 paper-field 底、墨字、4px 雙墨線框，明示等誰重連、剩餘秒數及所有操作與戰況已凍結，保留離開／結算返回動作。結算為明體 900 標題，失敗朱紅、勝利墨色；裝填工作區的場景內結果層加紙底與 2px 墨框。

### 駕駛圖版

固定車內左前眼位，透過水平 60°、垂直 16°的狹長開口看前方。裝甲是相機前的實體不透明 3D 板，內壁向外收窄並有 0.28m 的遊戲化厚度；較寬的呈現相機只用來同時看見裝甲周邊。隨車身移動與轉向，不隨主炮或滑鼠轉頭。速度保留 32px 明體數字，動態／受阻文字與共用血量清楚可讀。

### Motion, visibility and ownership

履帶讀實際位移與轉向，停止時停止。裝填進度控制砲彈軸向位置；退殼、後座與倒數讀共同權威遊戲時鐘，蹲下降低相機。prefers-reduced-motion 取消暈眩相機的 0.025 傾斜；戰鬥工作站沒有 CSS 動畫或 transition。車內／機槍切換保留 canvas buffer，只繪可見工作模式；renderer 不回寫武器規則。每個 VehicleModel 獨占並釋放自身資源；權威敵車 ID 消失才移除對應模型，已擊毀但尚存在的敵車保留殘骸辨識。

主炮與敵炮每次真正開火，由權威快照給出 0.18 秒遊戲時間的火光期限；機槍每發為 0.07 秒。外景使用暖橙邊緣、亮黃白中心的短促加色星芒，位置取車模實際炮管末端及第一人稱 Browning 末端，與飛行彈、曳光線、命中球及開火預告分開。主炮／機槍火光尺寸分別為 0.6／0.22 世界單位，敵炮為 0.85；保留深度遮擋，不新增照明或遮蓋 HUD 的面板。共同遊戲時鐘暫停時火光也停住，期限過後隱藏；換局、敵車退場及場景釋放清除對應資源，不以本機牆鐘延長或重播。

車內原創 WebAudio 機械短音提供音效開關，警示仍可見。此處只記錄實作的靜音與視覺語意，沒有音效聆聽品質驗證。

### 驗證狀態

卡彈、暫停、結算、暈眩、退殼與機槍過熱在新樣式下只從 CSS 確認，尚未有截圖；不得把這些狀態記為已通過視覺檢查。已知未解：敵方瞄準預告出現時，因為它被移到場景之前，砲手場景會整體下移（既有行為，未修）。

### Art provenance

大廳的車體圖是 tank-main.ts 內聯的原創 SVG 線稿，沒有外部來源。Noto Serif TC 子集的授權、來源與雜湊見 [字型 README](public/fonts/README.md)。本機 Poly Haven CC0-1.0 表面圖含 diffuse／OpenGL normal／roughness，只有 diffuse 使用 sRGB。來源與包裝雜湊見 [外景 README](public/art/README.md)、[表面 manifest](public/art/asset-manifest.json)、[天空 manifest](public/art/sky/asset-manifest.json) 與 [車內來源](public/assets/interior/sources.json)。車內 Green Metal Rust 作者為 Rob Tuytel，保留原像素及嵌入來源 metadata。歷史典藏只作研究；不輸入博物館圖片作遊戲表面，不聲稱掃描精度。

## Do's and Don'ts

### Do:

- Do 讓新介面元素待在 `data-surface` 範圍內，只用 paper／paper-deep／paper-field、ink／ink-soft／rule 與 ink-red 這些墨水角色。
- Do 讓座位記號、圖例與乘員表從同一份權威房間狀態產生，並永遠呈現三個座位。
- Do 以 2px 墨線框結構、1.5px 墨線框標籤與欄位、1px 規線分隔列；名稱、標題與讀數數字用 Noto Serif TC，說明用系統黑體。
- Do 讓戰鬥朱紅跟著危險狀態出現與消失（受擊窗口、過熱、失敗），過去的狀態回到墨或淡墨。
- Do 把 3D 場景框成圖版的圖，覆蓋資訊做成紙底墨線標籤，不用整片面板蓋住場景。
- Do 在明體位置新增中文字串時，依字型 README 重新產生 Noto Serif TC 子集並更新雜湊。
- Do 保留六個 Sherman 路輪、三組 VVSS 及三種車型的不同輪組、炮塔與炮長。
- Do 讓實際貼圖、shader 編譯與首個 GPU draw 完成後才送出準備票，保留可見準備中與取消狀態。
- Do 讓警示、暫停與結算文字和退出／返回操作保持可讀，並在靜音時保留可見危險提示。
- Do 延續本機素材出處、授權及雜湊紀錄，模型與地景維持原創程序幾何。
- Do 讓低草保持裝飾，石造掩體對齊權威碰撞盒，動畫只讀權威快照。

### Don't:

- Don't 在大廳用朱紅表示「你」以外的一般狀態，或在戰鬥用朱紅表示一般狀態、已過去的傷害或勝利。
- Don't 加入陰影、模糊、玻璃、圓角卡片、英雄插圖或角色卡；強調用更粗或雙墨線。
- Don't 加入軍徽、部隊標誌或旗幟。
- Don't 重新引入外部字型服務或系統內建的替代展示字體來取代自託管明體。
- Don't 把接受的簡化外觀改述為原先偏寫實標準已通過，或新增未經要求的寫實重建義務。
- Don't 讓駕駛裝甲窗口外洩漏視野、把機槍視角綁到主炮，或用美術改變碰撞、傷害與權威時鐘。
- Don't 把博物館研究影像、材質色或光照資產說成掃描模型、歷史軍漆色號或諾曼第實景照片。
- Don't 宣稱窄螢幕已有觸控玩法，或把此設計紀錄當作 FPS、音效聆聽、未截圖戰鬥狀態或完整 #27 驗證證書。
