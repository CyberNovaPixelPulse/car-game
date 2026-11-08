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
  navigation-ground: "#60694e"
  navigation-plough: "#55472f"
  navigation-stubble: "#817348"
  navigation-pasture: "#556342"
  navigation-lane: "#a18e6b"
  navigation-cover-outline: "#252a24"
  navigation-gun: "#ffe4a3"
  calibration-track: "#6f7970"
  calibration-zone: "#d6c984"
  calibration-perfect: "#fff8db"
typography:
  plate-display:
    fontFamily: "\"Noto Serif TC\", \"Songti TC\", serif"
    fontSize: "clamp(28px, 3.4vw, 40px)"
    fontWeight: 900
    letterSpacing: "0.06em"
  plate-headline:
    fontFamily: "\"Noto Serif TC\", \"Songti TC\", serif"
    fontSize: "22px"
    fontWeight: 700
    letterSpacing: "0.04em"
  plate-role:
    fontFamily: "\"Noto Serif TC\", \"Songti TC\", serif"
    fontSize: "23px"
    fontWeight: 700
    lineHeight: 1.3
  plate-room-code:
    fontFamily: "\"Noto Serif TC\", \"Songti TC\", serif"
    fontSize: "44px"
    fontWeight: 900
    lineHeight: 1.2
    letterSpacing: "0.16em"
  plate-numeral:
    fontFamily: "\"Noto Serif TC\", \"Songti TC\", serif"
    fontSize: "17px"
    fontWeight: 900
  station-title:
    fontFamily: "\"Noto Serif TC\", \"Songti TC\", serif"
    fontSize: "20px"
    fontWeight: 900
    letterSpacing: "0.06em"
    lineHeight: 1.3
  station-readout:
    fontFamily: "\"Noto Serif TC\", \"Songti TC\", serif"
    fontWeight: 700
    fontFeature: "tnum"
  driver-speed:
    fontFamily: "\"Noto Serif TC\", \"Songti TC\", serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.1
    fontFeature: "tnum"
  driver-status:
    fontFamily: "\"PingFang TC\", \"Noto Sans TC\", sans-serif"
    fontSize: "14px"
    fontWeight: 400
  plate-body:
    fontFamily: "\"PingFang TC\", \"Noto Sans TC\", sans-serif"
    fontSize: "15px"
    lineHeight: 1.7
  plate-label:
    fontFamily: "\"PingFang TC\", \"Noto Sans TC\", sans-serif"
    fontSize: "14px"
    lineHeight: 1.6
  plate-caption:
    fontFamily: "\"PingFang TC\", \"Noto Sans TC\", sans-serif"
    fontSize: "13px"
    lineHeight: 1.6
  work-line:
    fontFamily: "\"PingFang TC\", \"Noto Sans TC\", sans-serif"
    fontSize: "14px"
    lineHeight: 1.5
  work-readout:
    fontFamily: "\"PingFang TC\", \"Noto Sans TC\", sans-serif"
    fontSize: "14px"
  compact-control:
    fontFamily: "\"PingFang TC\", \"Noto Sans TC\", sans-serif"
    fontSize: "14px"
    fontWeight: 700
  plate-compact-code:
    fontFamily: "\"Noto Serif TC\", \"Songti TC\", serif"
    fontSize: "36px"
    fontWeight: 900
    lineHeight: 1.2
    letterSpacing: "0.16em"
  plate-action:
    fontFamily: "\"PingFang TC\", \"Noto Sans TC\", sans-serif"
    fontSize: "18px"
    fontWeight: 700
  crew-seat:
    fontFamily: "\"Noto Serif TC\", \"Songti TC\", serif"
    fontSize: "18px"
    fontWeight: 900
  station-speed:
    fontFamily: "\"Noto Serif TC\", \"Songti TC\", serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
  station-health:
    fontFamily: "\"Noto Serif TC\", \"Songti TC\", serif"
    fontSize: "20px"
    fontWeight: 900
  battle-outcome:
    fontFamily: "\"Noto Serif TC\", \"Songti TC\", serif"
    fontSize: "28px"
    fontWeight: 900
    lineHeight: 1.3
    letterSpacing: "0.06em"
  work-heading:
    fontFamily: "\"PingFang TC\", \"Noto Sans TC\", sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.3
  work-emphasis:
    fontFamily: "\"PingFang TC\", \"Noto Sans TC\", sans-serif"
    fontSize: "18px"
    fontWeight: 700
  battle-small:
    fontFamily: "\"PingFang TC\", \"Noto Sans TC\", sans-serif"
    fontSize: "12px"
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
  hud-edge: "16px"
  hud-panel-x: "14px"
  hud-panel-y: "12px"
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
  scene-figure:
    backgroundColor: "{colors.interior-background}"
    rounded: "{rounded.plate}"
  mg-hud:
    backgroundColor: "{colors.hud-background}"
    textColor: "{colors.hud-foreground}"
    rounded: "{rounded.plate}"
    padding: "12px 14px"
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
    backgroundColor: "{colors.hud-background}"
    textColor: "{colors.hud-foreground}"
    rounded: "{rounded.plate}"
    padding: "8px 12px"
  battle-result-failed:
    textColor: "{colors.hud-danger}"
  battle-result-won:
    textColor: "{colors.hud-foreground}"
  station-sound-on:
    backgroundColor: "{colors.hud-foreground}"
    textColor: "{colors.interior-background}"
    rounded: "{rounded.plate}"
  driver-speed:
    textColor: "{colors.hud-foreground}"
    typography: "{typography.driver-speed}"
  hud-panel:
    backgroundColor: "{colors.hud-background}"
    textColor: "{colors.hud-foreground}"
    rounded: "{rounded.plate}"
    padding: "12px 14px"
  battle-button:
    backgroundColor: "{colors.hud-background}"
    textColor: "{colors.hud-foreground}"
    typography: "{typography.compact-control}"
    rounded: "{rounded.plate}"
    padding: "8px 14px"
  battle-button-hover:
    backgroundColor: "{colors.interior-dark-paint}"
  battle-button-pressed:
    backgroundColor: "{colors.hud-foreground}"
    textColor: "{colors.interior-background}"
  battle-button-disabled:
    backgroundColor: "{colors.interior-background}"
    textColor: "{colors.hud-muted}"
  battle-quality-select:
    backgroundColor: "{colors.hud-background}"
    textColor: "{colors.hud-foreground}"
    rounded: "{rounded.plate}"
    padding: "8px"
  battle-navigation:
    backgroundColor: "{colors.hud-background}"
    textColor: "{colors.hud-foreground}"
    typography: "{typography.battle-small}"
    rounded: "{rounded.plate}"
    width: "192px"
  repair-workspace:
    backgroundColor: "{colors.hud-background}"
    textColor: "{colors.hud-foreground}"
    rounded: "{rounded.plate}"
    padding: "22px 24px"
    width: "min(420px, calc(100% - 32px))"
  repair-calibration:
    size: "200px"
  repair-calibration-compact:
    size: "160px"
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

大廳沿用雙色手冊印刷；戰鬥以深橄欖底、亮字、暖色敵情及低彩度地形建立獨立的操作層。上方 frontmatter 是實作值；下文名稱說明使用範圍。3D 材質基色另成一組，只作 renderer 輸入。

### Primary

- **手冊墨**（ink）：大廳線圖、結構框、正文、實心主按鈕與「他人已佔」座位記號。主按鈕 hover 使用略淺的 ink-hover；戰鬥只在砲手準星描邊保留此墨色。

### Secondary

- **第二墨朱紅**（ink-red）：大廳中你的座位、職位選擇、名字與座位數字、房間代碼，以及手冊控制的鍵盤焦點、輸入游標與文字選取。戰鬥按鈕與選單使用 hud-danger 焦點，不把大廳朱紅直接套在深底 HUD。
- **敵情與危險暖色**（hud-danger）：即時受擊、退殼、暈眩、卡彈、過熱及失敗；也是地圖敵車的識別色。目前觀測用實心方點，最後已知用空心方點並淡出，文字明示兩者狀態。
- **主炮方向暖黃**（navigation-gun）：地圖的獨立細線，與亮紙色的車頭箭頭並列；兩者的幾何及文字圖例同樣重要。
- **校準工作色**：calibration-track 是灰綠軌道；calibration-zone 是一般成功區的黃銅淺色；calibration-perfect 是其中更細、更亮的完美區。指針與中心點沿用 hud-foreground。這些色只服務車內時機判讀。

### Neutral

- **三層手冊紙**：paper 是大廳頁面底與空位記號；paper-deep 是右側面板；paper-field 是輸入與次要按鈕／職位列 hover。戰鬥不再用紙色鋪底。
- **戰鬥深底與亮字**：hud-background 是近九成不透明的深橄欖底襯，hud-foreground 是主要文字、進度填色與兩種準星，hud-muted 是說明／已過受擊窗口的文字及控制邊線，hud-rule 是面板 hairline。interior-background 同時作場景載入前底色、進度槽及停用按鈕底；hover 使用 interior-dark-paint。
- **淡墨與規線**：ink-soft 用於大廳說明、圖說、欄位標頭與未準備狀態；rule 是列分隔線與停用框。ink-disabled 只用於大廳停用按鈕文字，不降透明度。
- **導航地形**：navigation-ground／plough／stubble／pasture／lane 分別表示底地、耕地、收割田、牧地與道路，保留低彩度土綠關係。固定掩體沿用 hud-muted 填色、navigation-cover-outline 描邊；地圖是地形示意，未增加裝飾性軍事符號。
- **導航 fallback**：地圖比例文字的 CSS fallback `#d3d9c7` 只在 `--hud-muted` 缺失時生效；正常戰鬥實際使用 hud-muted。它不是新增的可見主題色，也不作新表面的預設。
- **車內機械色**：interior-background 襯托 paint／dark-paint、裸鋼、深色機械、黃銅與橡膠；不把暗部照成第二個室外場景。
- **外景材質基色**：Sherman 灰綠、Panzer／Tiger 沙土色，以及 earth／grass／field-soil／masonry 共同建立可辨識的簡化農村場景。3D 基色是材質輸入，不是最後畫面像素或歷史軍漆規格。

**The Second Ink Rule.** 大廳朱紅標示你的座位、選擇與房間代碼，並服務手冊焦點。戰鬥暖色用於危險和敵方聯絡的識別；用實心／空心、文字及數字區分即時與最後已知，不以色相單獨宣告正在受威脅。

**The Danger Is Now Rule.** 受傷文字只在 `.under-fire` 受擊一秒內使用 hud-danger，之後回 hud-muted；機槍只有 `data-overheated` 使用危險色；失敗使用危險色，勝利用一般前景色。

**The Role Truth Rule.** 視覺只呈現職位獲准知道的資訊；駕駛實際開口限制為水平 60°、垂直 16°，不自由轉頭。

隊伍偵察由實際前窗／主炮／當前機槍外景共同提供，暖色方點標示已知的存活敵車；實心為目前觀測，空心為最後已知。三方地圖、觀測數與敵情文字使用同份房主情報；車內模式只讀共享情報。未觀測敵車的血量、種類、階段及警示不顯示。方點沿用 hud-danger，己方箭頭及主炮細線保留原樣，避免只靠色彩區分。

## Typography

**Display Font:** Noto Serif TC 700／900（後備 Songti TC、serif），自行託管於 `public/fonts/` 的字元子集 woff2，由 tank.css 開頭 `@font-face`（`font-display: swap`）載入，index.html 預載 900。授權（SIL OFL 1.1）、來源與 SHA-256 見 [字型 README](public/fonts/README.md)；沒有 Google Fonts 執行期依賴。子集只含目前介面字串的字元：新字串若落在明體位置（標題、職位名、讀數、房間代碼），必須依 README 重新產生子集，否則缺字會落到 Songti TC。
**Body Font:** PingFang TC、Noto Sans TC、sans-serif（系統無襯線）。沒有等寬字體；數值採 tabular-nums。

**Character:** 粗重明體負責名稱、標題與數字，像手冊圖版的標號與讀數；說明、狀態句與按鍵提示留給系統黑體。

### Hierarchy

- **Plate display**：大廳頁首 h1，900、流動字級、寬字距。
- **Plate headline**：大廳 h2 與 legend（與隊友集合、乘員集合、選擇你的職位）。
- **Plate role**：大廳可認領職位按鈕，下方 2px 墨線；主選單圖例職位名稱同明體 22px。
- **Plate room code**：朱紅大字房間代碼；600px 以下 36px。
- **Plate numeral**：座位記號與圖例圓圈內的 1／2／3；乘員表座位欄 18px。
- **Station title**：三個職位的左上標題統一採明體 900、行高 1.3；結算沿用同字重與字距，升為 battle-outcome。
- **Station readout**：工作站內所有 strong 讀數（朝向、轉速、彈種、裝填進度、發射數、機槍熱度、暈眩倒數等）為明體 700、表格數字，字級沿用所在行；共用血量為 900、20px。
- **Driver speed**：駕駛速度數字為明體 700、行高 1.1；其餘職位速度使用 station-speed。動態與車體狀態是系統黑體（driver-status）。
- **Plate body／label／caption**：大廳說明 15px、標籤與狀態 14px、圖說與欄位標頭 13px，皆系統黑體；表單 label 600。
- **Work line**：砲手工作站直屬行與武器狀態列 14px、行高 1.5；機槍 HUD 14px、行高 1.5。退殼警示為 14px／700 黑體。
- **Work readout**：朝向行與工作內文共用緊湊字級；strong 讀數切回明體，不能沿用舊版較大的朝向字級。
- **Compact control**：全螢幕、音效、離開及畫質控制共用系統黑體字級；按鈕為 700 字重，原生 select 為一般字重；按鈕最小高度 40px，原生 select 最小高度 38px。
- **Work heading／emphasis**：維修標題用系統黑體 700；維修狀態與卡彈標題使用 work-emphasis，不把每一則工作指令改成展示明體。
- **Battle small**：導航標題、圖例、比例與精確校準角度的緊湊黑體。導航行高 1.4；校準角度沿用維修行高 1.6。高度不超過 800px 的活躍校準內文採 13px、行高 1.4，主讀數採 16px。

**The Serif Is For Names And Numbers Rule.** 明體用於手冊標題、職位名稱、座位、房間代碼與戰鬥 strong 讀數、職位標題及結算。說明、警示、維修標題／狀態與按鍵提示使用系統黑體；導航標題也保持黑體。

## Layout

**大廳圖版。** 主容器最大 1200px、內距 36px 48px 48px。頁首為兩欄 grid（標題／設定行並排，語音通話句跨欄），下接 2px 墨線。圖版本體以 2px 墨框包住兩欄：左為圖區（minmax(0, 1fr)）、右為 420px 面板，面板左緣 2px 墨線。圖區內分 340px 車體圖與編號圖例；圖例固定高 442px、等分三列，列間 1px 規線。車體圖 viewBox 300×340、引線終點 y＝17／147／277，與 340px 圖欄及 442px 圖例共同決定引線對齊各列圓圈；改其一必須同時改另外兩個。面板內表單單欄、間距 10px，行動區兩欄、準備鈕跨兩欄，上距 28px。乘員表欄位為 36px 座位／姓名／職位／56px 狀態，列內距 12px。

**The Always Three Seats Rule.** 圖版、圖例與乘員表永遠呈現三個座位；人數不足時以「空位・等待隊友加入」列補齊，座位數字取自職位順序（1 駕駛、2 砲手、3 裝填手）。

1000px 以下圖版改單欄，面板改上緣 2px 墨線；入口表單移到未認領的參考圖版之前。600px 以下主容器 20px 16px 32px、頁首單欄、圖區單欄、車體圖縮為 220px 置中並隱藏引線，圖例取消固定高度，乘員表欄寬縮為 32px 與 8px 欄距。390px 寬度仍明示需要三位玩家、三台電腦與實體鍵盤；這是窄桌機視窗，不是觸控設計。

**共用戰鬥頁面。** `.battle-station` 高 100dvh、無外距內距或邊框，實際 canvas 從 (0,0) 延伸至頁面右下。左上 300px HUD 顯示職位、HP、波次、速度、車況、車頭及主炮方向；右上 `.battle-utility` 讓操作列換行後自然推移下方敵情，中央警示保留獨立欄位。右下 340px 工作區顯示彈藥、裝填、轉速或機槍熱度／冷卻與當前按鍵。HUD 外緣統一留 16px 安全距離，不需要頁面捲動。

**警示與工作面。** 危險和暫停放在上方中央、兩側 HUD 之間，保留正常主炮／機槍準星。車內卡彈與維修工作面置中；校準沿用維修區。所有職位與工作模式共用左下 `.battle-navigation`：192px 方形的北向固定全場地形示意，上方標北、下方說明車頭箭頭與主炮細線。田地與道路使用低彩度土色，四處權威固定掩體使用淺色實心幾何，己方箭頭與細線保持分開。駕駛在高度不超過 800px 時縮為 160px 並收緊圖例，避開觀察窗下緣；可見場地範圍不變。元件不隨裝填手工作切換或鏡頭旋轉。

**暫停、結算與返回。** 缺員提示保留等待對象、現實倒數與凍結語意，離房始終在右上。結算與回房接管中央，隱藏後方維修／卡彈工作面，HP 留在左上。回房恢復手冊版面。主選單、工作站、新大廳、結算與暫停只在轉場時回到頁首。

桌機驗收為 1280×720 與 1440×1050。本次 #33 加入的 1000px／600px 寬度區段含有緊縮 HUD 變數宣告，但其 `.battle-station` 選擇器優先度低於正式 battle 範圍的預設值，不能視為有效的欄寬／inset 切換規則。600px 以下另有可生效的面板內距、字級、警示位置及隱藏文字敵情處理。這些窄版退讓不代表已支援手機戰鬥；390px 入口仍提示三台電腦與實體鍵盤。這是已審查 1280／1440 寬度之外的現存 fallback 限制，於 documenter 接手版本已存在，但不在 2e2 美術基準；本次未改 CSS，也不把未生效值加入規範 token。

**短桌機校準。** 高度不超過 800px 的活躍校準面板向下移 32px、內距收為 14px 18px，隱藏重複標題與基本維修條件段落，保留當前狀態、量表、精確角度及 R／空白鍵／C／Tab。量表收為 repair-calibration-compact，避開上方暫停及危險列；更高視窗保留完整標題與條件。

## Elevation & Depth

HTML 保持平面。大廳以紙色與墨線分層；戰鬥以 hud-background 深底、hud-foreground 主文字、hud-muted 次文字、hud-rule 的 1px 規線及 hud-danger 狀態色分層。不加入模糊、陰影或玻璃裝飾。受擊為頁面內側 3px 框、暈眩為車內 4px 框、暫停為 4px 雙線。

### Shadow Vocabulary

- **準星墨環**（`box-shadow: 0 0 0 1px #1c1c18`）：零位移、零模糊的 1px 墨色外環，只用在砲手十字準星的兩條 hud-foreground 細線，讓它在明亮與陰暗場景上都可讀。這是描邊，不是投影。

**The Ruled, Not Raised Rule.** 大廳以紙色分層，戰鬥以半透明深底與亮字分層；不用陰影或模糊，強調使用規線與明確文字。

3D 深度由程序幾何、材質與光照形成；保留簡化表面，不把所有漆面改成鏡面金屬。外景與車內共用低／中／高總像素預算 921,600／2,073,600／3,686,400，預設中，保持 canvas 實際比例且最多 2× CSS 繪圖倍率；「1080p」是 16:9 等效像素總量。HUD 仍是獨立 DOM／SVG。日光陰影依既有資產層級使用硬體 2048×2048、軟體降級 512×512；ACES 曝光 0.98、半球光強度 1.25、日光 2.3。本機 1K Pure Sky 僅作光照／背景，環境強度 0.35、背景強度 0.8，不宣稱是諾曼第照片。陰影只隨車體／炮塔姿態及敵車集合變更刷新，靜止場景有 250ms 低頻補畫；煙雲、彈道與命中特效仍更新。這些是程式中的資源安排，不是 FPS 保證。

車內保留一盞投影工作聚光燈（柔邊、1024×1024 shadow）、半球光與補光；曝光 1.15，不替每個零件增加光源。paint normal scale 0.22、steel 0.07，貼圖 repeat 2×2。車內與機槍準備、隱藏保留及重用時皆套用同一份本機畫質，維修沿用車內 renderer。右上原生畫質選單與操作列同樣使用亮字、深底及清楚焦點，必要時在自身欄位換行；不占用中央工作面。細節見 `docs/tank-quality.md`。

**The Supported Parts Rule.** 扣件、燈具及其他機械附屬件必須坐在其實際支撐表面；簡化外觀不取消物理附著。

## Shapes

所有按鈕、輸入、面板、工作站、進度條與卡彈軌都是方角。圓形用於手冊圖版的編號記號（車體圖座位圓半徑 15、圖例 34px 編號圓圈）、機槍 18px 圓形準星與維修的精確時機量表；這些是有功能的幾何，並非圓角卡片語言。車體圖為線稿：左右履帶帶 14 組履帶節線、圓角車首、砲塔圓、主炮管、兩個前艙口（駕駛實線、副駕虛線）及艙間分隔虛線；圖說明示「示意，未依比例」。可認領職位以 2px 底線表示可按，已被他人擔任時底線消失。

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

右上提供每名玩家自己的進入／退出全螢幕。啟用狀態為亮底深字，hover 保留此對比；暫時停用為深底次文字，不沿用手冊的墨色停用字。退出提示或失敗恢復提示接在操作列下方，不擠進中央警示。完整工作站為全螢幕目標，包含小地圖、工作與返回控制。滑鼠啟用顯示／音效控制後焦點交回戰場，鍵盤啟用保留原生控制焦點；Esc 保留瀏覽器控制並可退出本機工作站。

### 維修與圓形校準

中央面板保持實際車內背景可見，以明確文字說明停穩、按住 R、目前修復／受擊等待／失敗等待／暈眩／蹲下／滿血狀態。校準 SVG 使用 200×200 viewBox、中心 (100,100)、半徑 76 的軌道；灰綠軌寬 13、一般目標寬 17、完美區寬 9、亮色指針寬 3，中心點半徑 5。工作回饋以文字顯示一般 +1、完美 +3 或失敗等待，不只換色。

維修校準在既有中央車內工作面板呈現精確圓形量表：一般區 90°、內含較細亮色的 21.6° 完美區，順時針指針與角度文字讀同一份權威快照。一般／完美／失敗及暫停後重新按 R 的提示放在共用警示區，避免擠壓角落狀態；結算仍優先於中央維修與卡彈介面。短音由快照邊緣觸發，靜音時保留所有可見提示。

### 共享導航與偵察

北向固定的 SVG 地形示意在所有職位及裝填／機槍／維修模式共用同一位置。車頭是亮色箭頭、主炮是獨立暖黃細線；圖例以形狀和中文說明兩者。地形不隨鏡頭旋轉，固定掩體與權威場地一致。填實暖色方點是目前觀測，空心方點是最後已知；不能在車內憑空新增接觸。

### Motion, visibility and ownership

敵情圖例維持單行，以實心點表示目前觀測、空心點表示最後已知。舊標記停在觀察位置，透明度隨五秒共同遊戲時間下降；HUD 同時標示最後已知數量及敵情的「幾秒前」，不顯示舊階段為當前警報。缺員暫停時點位、透明度與文字年齡一起停止。駕駛 720px 視窗的 160px 地圖與緊縮圖例仍留在觀察窗下方。

履帶讀實際位移與轉向，停止時停止。裝填進度控制砲彈軸向位置；退殼、後座與倒數讀共同權威遊戲時鐘，蹲下降低相機。prefers-reduced-motion 取消暈眩相機的 0.025 傾斜；戰鬥工作站沒有 CSS 動畫或 transition。車內／機槍切換保留 canvas buffer，只繪可見工作模式；renderer 不回寫武器規則。每個 VehicleModel 獨占並釋放自身資源；權威敵車 ID 消失才移除對應模型，已擊毀但尚存在的敵車保留殘骸辨識。

主炮與敵炮每次真正開火，由權威快照給出 0.18 秒遊戲時間的火光期限；機槍每發為 0.07 秒。外景使用暖橙邊緣、亮黃白中心的短促加色星芒，位置取車模實際炮管末端及第一人稱 Browning 末端，與飛行彈、曳光線、命中球及開火預告分開。主炮／機槍火光尺寸分別為 0.6／0.22 世界單位，敵炮為 0.85；保留深度遮擋，不新增照明或遮蓋 HUD 的面板。共同遊戲時鐘暫停時火光也停住，期限過後隱藏；換局、敵車退場及場景釋放清除對應資源，不以本機牆鐘延長或重播。

車內原創 WebAudio 機械短音提供音效開關，警示仍可見。此處只記錄實作的靜音與視覺語意，沒有音效聆聽品質驗證。

### #45 儀表與練習介面延伸

此延伸保留既有手冊／HUD 世界。駕駛儀表以 160×160 SVG、中心 (80,80)、72 半徑外圈呈現 0–30 km/h；刻度每 2 km/h、數字每 10 km/h，指針由 -120° 掃至 +120°。暖色指針、亮色數字與次文字均使用現有 HUD token。駕駛儀表實際為 80px 方形，SVG 刻度字級 24 單位換算畫面為 12px，主數字 28px；行駛方向與受阻狀態合併於儀表旁，避免重複靜止文字。數字旁保留 km/h 與前進／倒車／停止文字；物理速度與時序不由 SVG 動畫決定。

單人入口在原手冊表單下方提供獨立行動，選職沿用原職位名稱與可見選中狀態。練習主要行動在右上既有 utility 區域；開始／下一輪與暫停留在收合區外。原生 details／summary 內的 AI 與教學內容依實際工作 HUD 上緣限制高度並捲動，溢出時明示「捲動查看」。駕駛的展開面板固定在真正觀察窗下方、底部工作區上方，左上儀表也縮至開口上方，避免遮擋狹長視野。情境教學採正文黑體，必要 AI 開火警示留在上方中央，不受教學開關或面板收合影響。

暫停採原生 dialog，維持 HUD 深底亮字、方角與清楚焦點，提供職位切換、繼續、重來及離開；準備新職位時返回手冊載入表面，不露出已釋放畫布。這些是操作表面延伸，不引入新的視覺世界或重建美術；本節不沿用 #30 的歷史 SHIP 作為新畫面的驗收證明。

### #30 歷史驗證狀態

這份紀錄由整合版本 `fc945735e4a072db64de39a6813932c0e0b427de` 的實作擷取，並對照獨立 finish reviewer 的 SHIP 畫面判定與 64 張必要截圖清單 `.impeccable/review/spec30/manifest.json`。畫面審查不等於執行期全套驗證；完整回歸數量與結果以 #41／PR #42 的最終證據為準，這裡不預先認證。此處也不認證實體 Esc／select 操作、人工音效聆聽、三台實體電腦、所有瀏覽器、FPS、部署或 main 合併。

既有 CSS 前段仍有被 data-surface 規則覆蓋的暗色基礎、5px／8px 圓角及舊字級；本次未改寫，也不提升為新表面應繼承的 token。表面 brief 的大廳 FORM 與 seed 文字沿用已接受的美術基準；歷史 roll 機器紀錄目前不可取得，不能把本次 #30 的既有表面延伸宣稱為重新抽選的視覺世界。

### Art provenance

大廳的車體圖是 tank-main.ts 內聯的原創 SVG 線稿，沒有外部來源。Noto Serif TC 子集的授權、來源與雜湊見 [字型 README](public/fonts/README.md)。本機 Poly Haven CC0-1.0 表面圖含 diffuse／OpenGL normal／roughness，只有 diffuse 使用 sRGB。來源與包裝雜湊見 [外景 README](public/art/README.md)、[表面 manifest](public/art/asset-manifest.json)、[天空 manifest](public/art/sky/asset-manifest.json) 與 [車內來源](public/assets/interior/sources.json)。車內 Green Metal Rust 作者為 Rob Tuytel，保留原像素及嵌入來源 metadata。歷史典藏只作研究；不輸入博物館圖片作遊戲表面，不聲稱掃描精度。

## Do's and Don'ts

### Do:

- Do 讓新介面元素待在 `data-surface` 範圍內，大廳用紙／墨 token，戰鬥用 hud token。
- Do 讓座位記號、圖例與乘員表從同一份權威房間狀態產生，並永遠呈現三個座位。
- Do 在大廳以墨線框結構與欄位，在戰鬥以 1px HUD 規線分隔；名稱與數字用 Noto Serif TC，說明用系統黑體。
- Do 讓危險警示跟著即時狀態出現與消失；最後已知敵情維持空心點、淡出與時間文字，避免看成當前威脅。
- Do 讓戰鬥場景鋪滿頁面，把工作資訊與控制留在角落；中央只放當前車內工作或結算。
- Do 在明體位置新增中文字串時，依字型 README 重新產生 Noto Serif TC 子集並更新雜湊。
- Do 保留六個 Sherman 路輪、三組 VVSS 及三種車型的不同輪組、炮塔與炮長。
- Do 讓實際貼圖、shader 編譯與首個 GPU draw 完成後才送出準備票，保留可見準備中與取消狀態。
- Do 讓警示、暫停與結算文字和退出／返回操作保持可讀，並在靜音時保留可見危險提示。
- Do 讓地圖與校準的幾何、文字和顏色共同表達狀態；暫停時讀共同遊戲時鐘，結算接管中央工作面。
- Do 延續本機素材出處、授權及雜湊紀錄，模型與地景維持原創程序幾何。
- Do 讓低草保持裝飾，石造掩體對齊權威碰撞盒，動畫只讀權威快照。

### Don't:

- Don't 在大廳用朱紅表示一般狀態，或在戰鬥用危險色表示過去的傷害與勝利。
- Don't 為 HTML 面板加入投影、模糊、玻璃、圓角卡片、英雄插圖或角色卡；強調用更粗或雙墨線。保留既有準星描邊與場景內的真實光影。
- Don't 加入軍徽、部隊標誌或旗幟。
- Don't 重新引入外部字型服務或系統內建的替代展示字體來取代自託管明體。
- Don't 把接受的簡化外觀改述為原先偏寫實標準已通過，或新增未經要求的寫實重建義務。
- Don't 讓駕駛裝甲窗口外洩漏視野、把機槍視角綁到主炮，或用美術改變碰撞、傷害與權威時鐘。
- Don't 把博物館研究影像、材質色或光照資產說成掃描模型、歷史軍漆色號或諾曼第實景照片。
- Don't 宣稱窄螢幕已有觸控玩法，或把此設計紀錄當作 FPS、音效聆聽、未截圖狀態或完整執行期回歸的驗證證書。

#45 本輪機械掃描共 32 個 advisory、無非 advisory 發現；31 個沿用既有 CSS 值，新增一個為 SVG 刻度的 24 單位（實際 12px）字級。保留原始報告，不宣稱零 advisory，也不為消除既有提示擴大改版。新畫面的實際審查與整合驗證另按當次交付紀錄描述。
