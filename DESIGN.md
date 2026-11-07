---
name: "三人坦克合作戰鬥"
description: "1944 年諾曼第背景下，三名乘員在手冊大廳認領座位，再於全頁受限視野與角落 HUD 協作。"
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
  hud-background: "#171e1ce8"
  hud-foreground: "#f5f1e4"
  hud-muted: "#d2cbb4"
  hud-rule: "#858b79"
  hud-danger: "#ffba9f"
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
    fontSize: "20px"
    fontWeight: 900
    letterSpacing: "0.06em"
  station-readout:
    fontFamily: '"Noto Serif TC", "Songti TC", serif'
    fontWeight: 700
    fontFeature: "tnum"
  driver-speed:
    fontFamily: '"Noto Serif TC", "Songti TC", serif'
    fontSize: "32px"
    fontWeight: 900
    lineHeight: 1
    fontFeature: "tnum"
  driver-status:
    fontFamily: '"PingFang TC", "Noto Sans TC", sans-serif'
    fontSize: "14px"
    fontWeight: 400
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
  driver-column: "20px"
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
    backgroundColor: "{colors.interior-background}"
    textColor: "{colors.hud-foreground}"
    rounded: "{rounded.plate}"
    padding: "0"
  station-plate-driver:
    backgroundColor: "{colors.interior-background}"
    textColor: "{colors.hud-foreground}"
    rounded: "{rounded.plate}"
    padding: "0"
  scene-figure:
    backgroundColor: "{colors.interior-background}"
    rounded: "{rounded.plate}"
  scene-label:
    backgroundColor: "{colors.hud-background}"
    textColor: "{colors.hud-foreground}"
    rounded: "{rounded.plate}"
    padding: "0.3rem 0.6rem"
  mg-hud:
    backgroundColor: "{colors.hud-background}"
    textColor: "{colors.hud-foreground}"
    rounded: "{rounded.plate}"
    padding: "8px 12px"
  mg-hud-overheated:
    textColor: "{colors.hud-danger}"
  enemy-warning:
    backgroundColor: "{colors.hud-background}"
    textColor: "{colors.hud-danger}"
    rounded: "{rounded.plate}"
  work-progress:
    backgroundColor: "{colors.interior-background}"
    rounded: "{rounded.plate}"
    height: "10px"
  jam-track:
    backgroundColor: "{colors.hud-background}"
    rounded: "{rounded.plate}"
    height: "38px"
  jam-needle:
    backgroundColor: "{colors.hud-danger}"
    width: "4px"
  battle-pause:
    backgroundColor: "{colors.interior-background}"
    textColor: "{colors.hud-foreground}"
    rounded: "{rounded.plate}"
    padding: "1rem"
  battle-result-failed:
    textColor: "{colors.hud-danger}"
  battle-result-won:
    textColor: "{colors.hud-foreground}"
  station-sound-on:
    backgroundColor: "{colors.hud-foreground}"
    textColor: "{colors.hud-background}"
    rounded: "{rounded.plate}"
  driver-speed:
    textColor: "{colors.hud-foreground}"
    typography: "{typography.driver-speed}"
---

# Design System: 三人坦克合作戰鬥

## Overview

**Creative North Star: "三人共乘一台重型戰車"**

三位乘員共用一台重型戰車，以受限視野與清楚的工作狀態協作。入口與大廳保留雙色戰時手冊；#30／#33 將戰鬥改為鋪滿頁面的真實 3D 場景與半透明角落 HUD。兩者保留方角、明體名稱／數字、清楚中文與危險狀態的強調色。

**入口與大廳。** 認領職位就是在 Sherman 俯視圖版上認領一個有編號的乘員座位。車體線圖上的三個座位記號即時反映權威房間狀態（空位留白、他人墨色、自己朱紅），以 1px 引線連到編號圖例；右側面板有朱紅大字房間代碼、編號乘員表與準備／開始／離開。

**戰鬥工作站。** 車外或車內視野覆蓋整個頁面，移除 HTML 紙框、場景外長條與額外留白。HUD 是清晰 DOM 文字與深色半透明底襯，不使用模糊。駕駛仍透過真正有厚度的裝甲前窗觀察，實際開口水平 60°、垂直 16°；周圍裝甲是 3D 世界的一部分。坦克與諾曼第村落保留使用者接受的簡化外觀。

**Key Characteristics:**

- 大廳使用紙／墨／朱紅，戰鬥使用深色半透明底、亮字與危險暖色；共用方角、明體與清晰規線。
- 大廳：車體俯視圖的座位記號、圖例與乘員表永遠是三個座位，鏡射權威房間狀態。
- 戰鬥：3D 場景鋪滿頁面，工作資訊及操作在角落，中央準星或車內工作面保持可見。
- 接受的簡化程序外觀，保留 Sherman／四號 H／虎式 I 辨識。
- 自然日光外景與封閉工作燈車內，分開處理照明。
- 場景優先、工作資訊緊湊；駕駛只從固定車頭的狹長前窗觀察，側後方由隊友協助。
- 明確中文、數字、焦點與可見危險提示，支援桌機實體鍵盤。

大廳 token 與版面依 tank.css 的 manual 區塊，戰鬥依同檔「The manual lobby gives way to a full viewport」區塊。方向依 surface brief；資產及接受的簡化外觀依 PRODUCT.md、既有外景及車內文件。

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

**The Second Ink Rule.** 大廳朱紅只標示你的座位、選擇及房間代碼。戰鬥危險暖色只標示現在需要行動的狀態，並配合中文與數字；一般工作保持亮字。

**The Danger Is Now Rule.** 受傷文字只在 `.under-fire` 受擊一秒內使用 hud-danger，之後回 hud-muted；機槍只有 `data-overheated` 使用危險色；失敗使用危險色，勝利用一般前景色。

**The Role Truth Rule.** 視覺只呈現職位獲准知道的資訊；駕駛實際開口限制為水平 60°、垂直 16°，不自由轉頭。

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
- **Station title**：砲手與裝填手工作站標題，明體 900、0.06em；駕駛為 20px（station-title-driver）。戰鬥結算 h2 同為明體 900、0.06em。
- **Station readout**：工作站內所有 strong 讀數（朝向、轉速、彈種、裝填進度、發射數、機槍熱度、暈眩倒數等）為明體 700、表格數字，字級沿用所在行；共用血量為 900、20px。
- **Driver speed**：駕駛速度數字 32px／900、行高 1；其旁動態與車體狀態行為 14px 系統黑體（driver-status）。
- **Plate body／label／caption**：大廳說明 15px、標籤與狀態 14px、圖說與欄位標頭 13px，皆系統黑體；表單 label 600。
- **Work line**：砲手工作站直屬行與武器狀態列 14px、行高 1.5；機槍 HUD 14px、行高 1.5。退殼警示為 14px／700 黑體。
- **Work readout**：砲手朝向讀數行 16px。
- **Compact control**：戰鬥操作列 14px，最小高度 40px。

**The Serif Is For Names And Numbers Rule.** 明體只用在標題、職位名稱、座位與讀數數字、房間代碼、駕駛狀態行與結算；說明、警示句與按鍵提示一律系統黑體。

## Layout

**大廳圖版。** 主容器最大 1200px、內距 36px 48px 48px。頁首為兩欄 grid（標題／設定行並排，語音通話句跨欄），下接 2px 墨線。圖版本體以 2px 墨框包住兩欄：左為圖區（minmax(0, 1fr)）、右為 420px 面板，面板左緣 2px 墨線。圖區內分 340px 車體圖與編號圖例；圖例固定高 442px、等分三列，列間 1px 規線。車體圖 viewBox 300×340、引線終點 y＝17／147／277，與 340px 圖欄及 442px 圖例共同決定引線對齊各列圓圈；改其一必須同時改另外兩個。面板內表單單欄、間距 10px，行動區兩欄、準備鈕跨兩欄，上距 28px。乘員表欄位為 36px 座位／姓名／職位／56px 狀態，列內距 12px。

**The Always Three Seats Rule.** 圖版、圖例與乘員表永遠呈現三個座位；人數不足時以「空位・等待隊友加入」列補齊，座位數字取自職位順序（1 駕駛、2 砲手、3 裝填手）。

1000px 以下圖版改單欄，面板改上緣 2px 墨線。600px 以下主容器 20px 16px 32px、頁首單欄、圖區單欄、車體圖縮為 220px 置中並隱藏引線，圖例取消固定高度，乘員表欄寬縮為 32px 與 8px 欄距。390px 寬度仍明示需要三位玩家、三台電腦與實體鍵盤；這是窄桌機視窗，不是觸控設計。

**共用戰鬥頁面。** `.battle-station` 高 100dvh、無外距內距或邊框，實際 canvas 從 (0,0) 延伸至頁面右下。左上 300px HUD 顯示職位、HP、波次、速度、車況、車頭及主炮方向；右上 `.battle-utility` 讓操作列換行後自然推移下方敵情，中央警示保留獨立欄位。右下 340px 工作區顯示彈藥、裝填、轉速或機槍熱度／冷卻與當前按鍵。HUD 外緣統一留 16px 安全距離，不需要頁面捲動。

**警示與工作面。** 危險和暫停放在上方中央、兩側 HUD 之間，保留正常主炮／機槍準星。車內卡彈與維修工作面置中；校準沿用維修區。所有職位與工作模式共用左下 `.battle-navigation`：192px 方形的北向固定全場地形示意，上方標北、下方說明車頭箭頭與主炮細線。田地與道路使用低彩度土色，四處權威固定掩體使用淺色實心幾何，己方箭頭與細線保持分開。駕駛在高度不超過 800px 時縮為 160px 並收緊圖例，避開觀察窗下緣；可見場地範圍不變。元件不隨裝填手工作切換或鏡頭旋轉。

**暫停、結算與返回。** 缺員提示保留等待對象、現實倒數與凍結語意，離房始終在右上。結算與回房接管中央，隱藏後方維修／卡彈工作面，HP 留在左上。回房恢復手冊版面。主選單、工作站、新大廳、結算與暫停只在轉場時回到頁首。

桌機驗收為 1280×720 與 1440×1050；1000px 以下縮小 HUD 並調整警示，600px 以下保留主要工作與離房。390px 入口仍提示三台電腦與實體鍵盤，不宣稱觸控玩法。

## Elevation & Depth

HTML 保持平面。大廳以紙色與墨線分層；戰鬥以 #171e1c／91% 底襯、#f5f1e4 主文字、#d2cbb4 次文字、#858b79 的 1px 規線及 #ffba9f 危險色分層。不加入模糊、陰影或玻璃裝飾。受擊為頁面內側 3px 框、暈眩為車內 4px 框、暫停為 4px 雙線。

### Shadow Vocabulary

- **準星墨環**（`box-shadow: 0 0 0 1px #1c1c18`）：零位移、零模糊的 1px 墨色外環，只用在砲手十字準星的兩條 paper-field 細線，讓它在明亮與陰暗場景上都可讀。這是描邊，不是投影。

**The Ruled, Not Raised Rule.** 大廳以紙色分層，戰鬥以半透明深底與亮字分層；不用陰影或模糊，強調使用規線與明確文字。

3D 深度由程序幾何、材質與光照形成；保留簡化表面，不把所有漆面改成鏡面金屬。外景實際 render budget 是內部繪圖最多 1024×576、DPR 最多 1.5，日光陰影 512×512；ACES 曝光 0.98、半球光強度 1.25、日光 2.3。本機 1K Pure Sky 僅作光照／背景，環境強度 0.35、背景強度 0.8，不宣稱是諾曼第照片。陰影只隨車體／炮塔姿態及敵車集合變更刷新，靜止場景有 250ms 低頻補畫；煙雲、彈道與命中特效仍更新。這些是程式中的資源安排，不是 FPS 保證。

車內保留一盞投影工作聚光燈（柔邊、1024×1024 shadow）、半球光與補光；曝光 1.15，不替每個零件增加光源。paint normal scale 0.22、steel 0.07，貼圖 repeat 2×2。車內初始化 buffer 為 1024×576，實際 resize 跟隨可見 canvas、DPR 最多 1.5；不要把外景的最大內部尺寸誤套為車內上限。

**The Supported Parts Rule.** 扣件、燈具及其他機械附屬件必須坐在其實際支撐表面；簡化外觀不取消物理附著。

## Shapes

所有按鈕、輸入、面板、工作站、場景框、覆蓋標籤、進度條與卡彈軌都是方角。圓形只出現在手冊圖版的編號記號（車體圖座位圓半徑 15、圖例 34px 編號圓圈）與機槍 18px 圓形準星。車體圖為線稿：左右履帶帶 14 組履帶節線、圓角車首、砲塔圓、主炮管、兩個前艙口（駕駛實線、副駕虛線）及艙間分隔虛線；圖說明示「示意，未依比例」。可認領職位以 2px 底線表示可按，已被他人擔任時底線消失。

砲手準星由兩條 28px 亮色細線交叉，外加 1px 深色墨環。機槍為 18px 圓形準星。卡彈軌高 38px，目標區亮底深字、2px 線，指針寬 4px、危險暖色、1px 深色描邊。

車體用原創斜面、圓鑄炮塔、分離輪組與履帶辨識。Sherman 保留六路輪／三組 VVSS、短 75mm 炮；四號 H 用八路輪、分段側裙及 L/48 長炮；虎式 I 用寬車身、交錯大輪與不同炮塔／88mm 炮。扣件以各車實際偏移的 cupola cap 為中心，Sherman 燈具坐在斜裝甲與短支架上。這些辨識與支撐關係比額外表面裝飾優先。

## Components

### 大廳按鈕與輸入

印刷按鈕：主要為實心墨底紙色字、2px 墨框、700 字重；次要（加入房間、離開房間、音效開關）透明底墨字，hover 換成 paper-field。停用時改為透明底、ink-disabled 字與 rule 框，不降透明度，讓「開始戰鬥」在等待時仍可讀。焦點是 3px 朱紅 outline、offset 3px。音效開關開啟時為墨底紙字。戰鬥按鈕依下方 HUD 規則。輸入為 paper-field 底、1.5px 墨框、方角、朱紅游標；房間代碼輸入大寫並用明體 700、0.16em 字距。

### 車體座位圖與圖例

Sherman 俯視線圖上的三個座位記號：空位為紙色填、墨框墨字；他人已佔為墨填紙字；你的座位為朱紅填紙字。每個記號以 1px 引線轉折連到右側同號圖例列。主選單顯示同一張圖但三席皆空；大廳圖例每列是真實的職位按鈕、任務說明與擔任者（空位／目前由某人擔任／你已擔任），列的編號圓圈依 data-state 同步填色。可按的職位列 hover 時整列換為 paper-field（160ms ease-out，是唯一的 CSS transition）。座位記號鏡射權威房間狀態，三台瀏覽器同步。駕駛在戰鬥以裝甲觀察窗取代重複座位圖。

### 房間面板與乘員表

面板以 paper-deep 為底。房間標頭為淡墨標籤「房間代碼・念給隊友」加朱紅大字代碼，其下人數列（就位數／已準備數）。乘員表有 2px 墨線欄位標頭（對輔助技術隱藏），每位真實成員一列：座位數字（未選為「—」）、名字（房主／你）、職位與準備狀態；已準備為墨色 700，未準備為淡墨 400；你的那一列名字與座位數字為朱紅。準備中狀態訊息以 1.5px 墨框包住。

### Room and preparation

建立／加入、乘員列、職位、準備與房主開始仍採清楚表單。準備先顯示「正在準備工作畫面，完成後才會標示已準備；可取消或改選職位。」等待真實貼圖、shader compile 與首個 GPU draw；裝填手同時準備車內與機槍並重用準備好的 renderer。取消、改職、離房、返回大廳使過期準備失效並釋放所屬資源。一般隊友 ready 更新保留暖機資源；駕駛同樣準備裝甲前窗的實際外景並在開戰重用。恢復舊戰鬥遭拒時，若畫面已是入房表單，保留使用者正在輸入的名稱／代碼與既有表單節點，只更新真實拒絕訊息並隱藏失效重試；從大廳或戰鬥終房仍完整回主選單。較新的加入／恢復擁有自己的連線，舊恢復失敗不能清理它。依據 [tank-main.ts](web/tank-main.ts) 與 [tank-art-preparation.ts](web/tank-art-preparation.ts)。

### 戰鬥 HUD

工作站為無框全頁場景。角落面板方角、1px hud-rule、12px 14px 內距；名稱為明體 900／20px，讀數為明體 700，內文 14px／1.5，按鍵提示 13px。HP 為明體 900／20px，駕駛速度為 32px。HUD 按鈕深底亮字、1px 線、8px 14px 內距，最小高 40px，焦點為 3px 危險暖色。

進度及熱量條高 10px、深槽亮填色；過熱同時顯示文字、倒數和危險色。卡彈軌高 38px、目標區亮底深字、指針為暖色。退殼、暈眩、受擊與暫停位於上方中央；結算有明確結果與回房按鈕。駕駛裝甲為真實相機幾何，不能當成頁面外框移除。

### Motion, visibility and ownership

履帶讀實際位移與轉向，停止時停止。裝填進度控制砲彈軸向位置；退殼、後座與倒數讀共同權威遊戲時鐘，蹲下降低相機。prefers-reduced-motion 取消暈眩相機的 0.025 傾斜；戰鬥工作站沒有 CSS 動畫或 transition。車內／機槍切換保留 canvas buffer，只繪可見工作模式；renderer 不回寫武器規則。每個 VehicleModel 獨占並釋放自身資源；權威敵車 ID 消失才移除對應模型，已擊毀但尚存在的敵車保留殘骸辨識。

主炮與敵炮每次真正開火，由權威快照給出 0.18 秒遊戲時間的火光期限；機槍每發為 0.07 秒。外景使用暖橙邊緣、亮黃白中心的短促加色星芒，位置取車模實際炮管末端及第一人稱 Browning 末端，與飛行彈、曳光線、命中球及開火預告分開。主炮／機槍火光尺寸分別為 0.6／0.22 世界單位，敵炮為 0.85；保留深度遮擋，不新增照明或遮蓋 HUD 的面板。共同遊戲時鐘暫停時火光也停住，期限過後隱藏；換局、敵車退場及場景釋放清除對應資源，不以本機牆鐘延長或重播。

車內原創 WebAudio 機械短音提供音效開關，警示仍可見。此處只記錄實作的靜音與視覺語意，沒有音效聆聽品質驗證。

### 驗證狀態

#33 桌機、模式、警示與轉場證據依 `/tmp/car-game-spec30/reports/33.md` 的實際來源。先前 #31 的 720px 標題裁切與 #39 的 HP／傷害文字重疊是被替換的舊版問題，不繼承為新版通過證據。完整回歸、全螢幕與小地圖依後續整合驗證。

### Art provenance

大廳的車體圖是 tank-main.ts 內聯的原創 SVG 線稿，沒有外部來源。Noto Serif TC 子集的授權、來源與雜湊見 [字型 README](public/fonts/README.md)。本機 Poly Haven CC0-1.0 表面圖含 diffuse／OpenGL normal／roughness，只有 diffuse 使用 sRGB。來源與包裝雜湊見 [外景 README](public/art/README.md)、[表面 manifest](public/art/asset-manifest.json)、[天空 manifest](public/art/sky/asset-manifest.json) 與 [車內來源](public/assets/interior/sources.json)。車內 Green Metal Rust 作者為 Rob Tuytel，保留原像素及嵌入來源 metadata。歷史典藏只作研究；不輸入博物館圖片作遊戲表面，不聲稱掃描精度。

## Do's and Don'ts

### Do:

- Do 讓新介面元素待在 `data-surface` 範圍內，大廳用紙／墨 token，戰鬥用 hud token。
- Do 讓座位記號、圖例與乘員表從同一份權威房間狀態產生，並永遠呈現三個座位。
- Do 在大廳以墨線框結構與欄位，在戰鬥以 1px HUD 規線分隔；名稱與數字用 Noto Serif TC，說明用系統黑體。
- Do 讓戰鬥危險色跟著即時狀態出現與消失，過去狀態回到一般或次要文字。
- Do 讓戰鬥場景鋪滿頁面，把工作資訊與控制留在角落；中央只放當前車內工作或結算。
- Do 在明體位置新增中文字串時，依字型 README 重新產生 Noto Serif TC 子集並更新雜湊。
- Do 保留六個 Sherman 路輪、三組 VVSS 及三種車型的不同輪組、炮塔與炮長。
- Do 讓實際貼圖、shader 編譯與首個 GPU draw 完成後才送出準備票，保留可見準備中與取消狀態。
- Do 讓警示、暫停與結算文字和退出／返回操作保持可讀，並在靜音時保留可見危險提示。
- Do 延續本機素材出處、授權及雜湊紀錄，模型與地景維持原創程序幾何。
- Do 讓低草保持裝飾，石造掩體對齊權威碰撞盒，動畫只讀權威快照。

### Don't:

- Don't 在大廳用朱紅表示一般狀態，或在戰鬥用危險色表示過去的傷害與勝利。
- Don't 加入陰影、模糊、玻璃、圓角卡片、英雄插圖或角色卡；強調用更粗或雙墨線。
- Don't 加入軍徽、部隊標誌或旗幟。
- Don't 重新引入外部字型服務或系統內建的替代展示字體來取代自託管明體。
- Don't 把接受的簡化外觀改述為原先偏寫實標準已通過，或新增未經要求的寫實重建義務。
- Don't 讓駕駛裝甲窗口外洩漏視野、把機槍視角綁到主炮，或用美術改變碰撞、傷害與權威時鐘。
- Don't 把博物館研究影像、材質色或光照資產說成掃描模型、歷史軍漆色號或諾曼第實景照片。
- Don't 宣稱窄螢幕已有觸控玩法，或把此設計紀錄當作 FPS、音效聆聽、未截圖戰鬥狀態或完整 #27 驗證證書。

維修校準在既有中央車內工作面板呈現精確圓形量表：一般區 90°、內含較細亮色的 21.6° 完美區，順時針指針與角度文字讀同一份權威快照。一般／完美／失敗及暫停後重新按 R 的提示放在共用警示區，避免擠壓角落狀態；結算仍優先於中央維修與卡彈介面。短音由快照邊緣觸發，靜音時保留所有可見提示。
