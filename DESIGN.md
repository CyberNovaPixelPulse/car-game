---
name: "三人坦克合作戰鬥"
description: "1944 年諾曼第背景下，三名乘員以受限視野協作的坦克工作站。"
colors:
  action-olive: "#58624b"
  action-hover: "#697557"
  selected-green: "#91ae8a"
  selected-ink: "#18231b"
  selected-border: "#b7d1ae"
  focus-amber: "#d6ac64"
  charcoal: "#252c2d"
  work-surface: "#303936"
  text: "#e8e6dc"
  muted-text: "#c1c4b6"
  input-text: "#f0eee5"
  button-text: "#fffef3"
  input-border: "#88927f"
  button-border: "#a8b19a"
  divider: "#566154"
  header-divider: "#697366"
  room-message: "#e8c587"
  ejection-warning: "#ffdf91"
  stun-text: "#ffcfb4"
  stun-border: "#c16d5c"
  damage-text: "#ffbc94"
  enemy-warning: "#ffe3a3"
  pause-surface: "#3d341c"
  pause-border: "#c8a65d"
  pause-text: "#fff0c5"
  hit-outline: "#c86b48"
  gunner-reticle: "#fff8db"
  mg-reticle: "#ede8c5"
  jam-border: "#b7b2a2"
  jam-ink: "#19221c"
  jam-needle: "#fff8dc"
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
  display:
    fontFamily: '"PingFang TC", "Noto Sans TC", sans-serif'
    fontSize: "clamp(26px, 4vw, 38px)"
    fontWeight: 600
    lineHeight: 1.3
  headline:
    fontSize: "23px"
    fontWeight: 600
  title:
    fontSize: "18px"
    fontWeight: 600
  body:
    fontFamily: '"PingFang TC", "Noto Sans TC", sans-serif'
    lineHeight: 1.7
  label:
    fontSize: "14px"
  compact-control:
    fontSize: "13px"
  work-readout:
    fontSize: "16px"
  viewport-warning:
    fontSize: "1rem"
  ejection-baseline:
    fontSize: "1.25rem"
  speed:
    fontSize: "64px"
    fontWeight: 500
rounded:
  control: "5px"
  workstation: "8px"
  combat: "0"
spacing:
  compact: "2px"
  work-gap: "6px"
  small: "8px"
  control-gap: "12px"
  medium: "16px"
  narrow-edge: "18px"
  group-gap: "20px"
  section: "24px"
  workstation: "28px"
  wide: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action-olive}"
    textColor: "{colors.button-text}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.button-text}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
  button-selected:
    backgroundColor: "{colors.selected-green}"
    textColor: "{colors.selected-ink}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
  input:
    backgroundColor: "{colors.work-surface}"
    textColor: "{colors.input-text}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
    width: "100%"
  workstation:
    backgroundColor: "{colors.work-surface}"
    rounded: "{rounded.workstation}"
    padding: "28px"
  battle-pause:
    backgroundColor: "{colors.pause-surface}"
    textColor: "{colors.pause-text}"
    padding: "1rem"
  mg-hud:
    backgroundColor: "{colors.charcoal}"
    textColor: "{colors.text}"
    padding: "8px 12px"
  gunner-reticle:
    width: "28px"
    height: "28px"
  jam-track:
    backgroundColor: "{colors.charcoal}"
    height: "38px"
---

# Design System: 三人坦克合作戰鬥

## Overview

**Creative North Star: "三人共乘一台重型戰車"**

三位乘員共用一台重型戰車，以各自受限的視野與清楚的工作狀態協作。世界採 1944 年卡昂周邊的石造農村、土路及自然日光；車輛、田行與葉叢保留使用者明確接受的簡化程序外觀。機械零件仍須實際附著支撐表面，車型輪廓與比例關係仍是辨識依據。

根路徑由 index.html 載入 tank-main.ts，直接呈現坦克房間。房間介面延續炭灰、灰綠與繁體中文無襯線字體。戰鬥時場景取得主要空間，緊湊文字、數字與進度條支援操作；不把戰場規則包裝成虛構的古董儀表皮膚。Experience 世界與 Operate 邊緣 HUD 是外景 brief 的表達方式，不是所有未來畫面的固定模式。

**Key Characteristics:**

- 接受的簡化程序外觀，保留 Sherman／四號 H／虎式 I 辨識。
- 自然日光外景與封閉工作燈車內，分開處理照明。
- 場景優先、工作資訊緊湊，駕駛維持沒有外景的資訊限制。
- 明確中文、數字、焦點與可見危險提示，支援桌機實體鍵盤。
- 駕駛戰鬥收起入房介紹，盲開儀表以緊湊留白保留警示與離開動作。

此為 #27 根入口整合後的原始碼設計擷取，前置 token 以現行 [tank.css](web/tank.css)、[外景](web/tank-scene.ts)、[車模](web/tank-vehicle-model.ts)、[地景](web/tank-environment.ts) 與 [車內](web/tank-interior-scene.ts) 為準。方向依 [PRODUCT.md](PRODUCT.md) 與 [外景 brief](.impeccable/briefs/tank-exterior.md)。使用者於 2026-11-07 接受「接受目前簡化外觀，修正浮空零件後完成整合」；此文件記錄已修正附著的當前實作，沒有宣稱先前寫實標準通過。

## Colors

灰綠操作色、炭灰介面與暖色警示，連接明亮農村外景及深色裝填工作區；3D 基色是材質輸入，不是最後畫面像素或歷史軍漆規格。

### Primary

- **操作橄欖綠**：主要按鈕及 hover 使用 action-olive／action-hover；selected-green 與深色文字共同表示已選職位，並有 pressed 語意。
- **焦點琥珀**：focus-amber 用於鍵盤焦點、房間代碼、文字選取及機槍熱量條；一般裝填進度條採 selected-green。

### Secondary

- **暖色工作警示**：ejection-warning、stun-text／stun-border、damage-text 與 enemy-warning 區分危險語境；明確中文和數字同時交代狀態。
- **暫停土黃**：pause-surface、pause-border、pause-text 專供等待重連的完整凍結訊息。

### Neutral

- **炭灰與灰綠表面**：charcoal 是頁面及警示底；work-surface 是輸入及工作站底。text／muted-text 支援主要與輔助文字；邊界保留既有低彩度細線。
- **車內機械色**：interior-background 襯托 paint／dark-paint、裸鋼、深色機械、黃銅與橡膠；不把暗部照成第二個室外場景。
- **外景材質基色**：Sherman 灰綠、Panzer／Tiger 沙土色，以及 earth／grass／field-soil／masonry 共同建立可辨識的簡化農村場景。

**The Role Truth Rule.** 視覺只呈現職位獲准知道的資訊；駕駛不建立外部 renderer。

## Typography

**Display / Body Font:** PingFang TC、Noto Sans TC、sans-serif。沒有獨立裝飾展示字或等寬字體；數值採 tabular-nums。前置 token 只記錄 source 明定屬性，其餘沿用瀏覽器與繼承，不補造字級或比例。

- **Display**：首頁 h1 的流動字級、600 字重與緊湊行高。
- **Headline**：房間 h2；戰鬥時讓位給較小工作站標題。
- **Title**：工作站標題沿用 h2 的 600 字重；legend 及部分卡彈標題也用相同字級，但不新增共用字重規則。
- **Body**：一般說明行高 1.7、最大 70ch；工作條縮為 1.5，機槍操作文字為 1.45。
- **Label**：輔助說明、狀態與工作條的緊湊字級。退殼警示在裝填工作區使用 18px／700；暈眩倒數保留表格數字。
- **Compact control**：13px，只用於裝填工作站的音效及離開按鈕。
- **Work readout**：16px，用於砲手朝向讀數與裝填工作站的卡彈 h3；兩者字重由各自來源／繼承決定，不建立共用字重。
- **Viewport warning**：1rem，是 `.battle-viewport [data-testid="enemy-warning"]` 的既有文字規則；目前砲手將此提示移至場景前方，實際採工作站直屬 p 的 14px，因此保留此尺寸作限定 selector 的來源紀錄，不推廣為通用正文。
- **Ejection baseline**：1.25rem，是 `.ejection-warning` 的既有基礎尺寸；目前裝填工作區由更明確 selector 覆寫為 18px／700，勿將基礎尺寸誤述為當前可見退殼警示尺寸。
- **Speed**：盲開駕駛的主要速度讀數；房間代碼另有 0.1em 字距。

## Layout

房間主容器最大 920px，置中，內距 44px 32px 56px；表單建立區是 1fr／auto，加入區是 flex，兩者間距 12px。600px 以下主容器改為 24px 18px，職位與乘員改為直列，加入列允許換行。390px 大廳仍明示需要三位玩家、三台電腦與實體鍵盤。

砲手工作容器最大 1600px、外距內縮 12px 18px 24px，工作站雙欄 minmax(0, 1fr)／auto、間距 8px 20px、內距 14px 16px。戰鬥收起大標與入房介紹。場景跨欄，高度 clamp(300px, calc(100dvh - 300px), 720px)；方向、HP、砲膛／彈藥與裝填資訊緊鄰場景。700px 以下改單欄與 320px 場景。1280×720 的主要工作資訊以同屏為目標；實際可見範圍仍隨敵情、暫停與結算文字改變，一般離開控制可能在初始畫面下方，勿把它記錄成所有控制都在首屏。

裝填工作區採全寬主容器，外內距 12px 18px／12px，方角工作站。主畫面是封閉炮尾、滑塊、後座導桿、手輪、砲彈架及曲面內壁；下緣工作條顯示所選／膛內彈、階段、進度與發射數。場景高度 max(300px, calc(100dvh - 310px))；卡彈軌出現時為上方工作區騰出高度。600px 以下改為 340px 場景及流動狀態列。機槍獨立外景高 max(300px, calc(100dvh - 340px))，熱量與鎖定提示留在視野內。600px 以下裝填主容器內距為 8px。駕駛戰鬥同樣收起入房介紹，主容器內距為 12px 18px 24px，保留最大 420px 的盲開儀表區，沒有外景。駕駛工作站 h2 下距 12px，直屬 p 與儀表內 p 外距為 8px 0，儀表內距為 12px 0 20px；空白受傷提示不佔位。

暫停不遮掉凍結語意；各工作站為完整等待文字騰出空間。結算保留明確結果與 HP，返回控制固定右下 24px，裝填工作區另有場景中結果層。進入主選單、工作站、新的大廳、結算或暫停狀態時，各在轉換當下將頁面捲至頂端，避免沿用先前按鈕所在的捲動位置；一般狀態更新不重複拉回頂端。這是現有響應行為，不是手機觸控設計。

## Elevation & Depth

HTML 介面主要用實色層、細邊線和警示輪廓區分深度，不引入卡片浮起或玻璃效果。既有唯一可重用的微陰影是砲手十字準星的 0 1px 2px #252c2d，作用是壓住明亮場景。3D 深度由程序幾何、材質與光照形成；保留簡化表面，不把所有漆面改成鏡面金屬。

外景實際 render budget 是內部繪圖最多 1024×576、DPR 最多 1.5，日光陰影 512×512；ACES 曝光 0.98、半球光強度 1.25、日光 2.3。本機 1K Pure Sky 僅作光照／背景，環境強度 0.35、背景強度 0.8，不宣稱是諾曼第照片。陰影只隨車體／炮塔姿態及敵車集合變更刷新，靜止場景有 250ms 低頻補畫；煙雲、彈道與命中特效仍更新。這些是程式中的資源安排，不是 FPS 保證。

車內保留一盞投影工作聚光燈（柔邊、1024×1024 shadow）、半球光與補光；曝光 1.15，不替每個零件增加光源。paint normal scale 0.22、steel 0.07，貼圖 repeat 2×2。車內初始化 buffer 為 1024×576，實際 resize 跟隨可見 canvas、DPR 最多 1.5；不要把外景的最大內部尺寸誤套為車內上限。

**The Supported Parts Rule.** 扣件、燈具及其他機械附屬件必須坐在其實際支撐表面；簡化外觀不取消物理附著。

## Shapes

一般按鈕與輸入為輕圓角，房間工作站較柔；砲手與裝填戰鬥工作站為方角。細實線、矩形進度條與數字優先。砲手準星由兩條 28px 細線交叉；機槍保留 18px 圓形準星。卡彈軌高 38px，成功區有文字及 2px 邊框，指針寬 4px。受到攻擊時工作站外框使用 3px hit-outline、offset 4px，並有明確受傷文字。

車體用原創斜面、圓鑄炮塔、分離輪組與履帶辨識。Sherman 保留六路輪／三組 VVSS、短 75mm 炮；四號 H 用八路輪、分段側裙及 L/48 長炮；虎式 I 用寬車身、交錯大輪與不同炮塔／88mm 炮。扣件以各車實際偏移的 cupola cap 為中心，Sherman 燈具坐在斜裝甲與短支架上。這些辨識與支撐關係比額外表面裝飾優先。

## Components

### Buttons and inputs

按鈕為直接的實體鍵盤操作入口：主要橄欖綠、透明 secondary、淺綠 pressed 職位；共用 1px 邊界，hover 使用既有較亮綠，disabled opacity 0.48。焦點是 3px 琥珀 outline、offset 4px，不依陰影表示。輸入沿用工作站深底與灰綠邊界，房間代碼大寫，caret 使用焦點琥珀。loader 的音效／離開按鈕為 13px、5px 12px 內距；不另創按鈕家族。

### Room and preparation

建立／加入、乘員列、職位、準備與房主開始仍採清楚表單。準備先顯示「正在準備工作畫面，完成後才會標示已準備；可取消或改選職位。」等待真實貼圖、shader compile 與首個 GPU draw；裝填手同時準備車內與機槍並重用準備好的 renderer。取消、改職、離房、返回大廳使過期準備失效並釋放所屬資源。一般隊友 ready 更新保留暖機資源；駕駛不準備外景。依據 [tank-main.ts](web/tank-main.ts) 與 [tank-art-preparation.ts](web/tank-art-preparation.ts)。

### Workstations and warnings

恢復舊戰鬥遭拒時，若畫面已是入房表單，保留使用者正在輸入的名稱／代碼與既有表單節點，只更新真實拒絕訊息並隱藏失效重試；從大廳或戰鬥終房仍完整回主選單。較新的加入／恢復擁有自己的連線，舊恢復失敗不能清理它。

砲手使用場景、獨立十字準星、方向與武器工作條。敵方瞄準預告與行動文字放在場景前的工作站列，不用不透明整片面板遮住場景；煙幕狀態留在場景右下。共用波次列提供目前波數及存活敵車數。機槍用自己的 yaw／pitch 視角、熱量條與鎖定提示；不跟主炮轉。裝填手保留場景、工作條、卡彈軌、退殼警示與暈眩倒數，暈眩時場景內框 2px；警示以文字／數字補足顏色。pause 面板明示等誰重連、剩餘秒數及所有操作與戰況已凍結，保留離開／結算返回動作。

### Motion, visibility and ownership

履帶讀實際位移與轉向，停止時停止。裝填進度控制砲彈軸向位置；退殼、後座與倒數讀共同權威遊戲時鐘，蹲下降低相機。prefers-reduced-motion 取消暈眩相機的 0.025 傾斜；沒有新增 CSS 動畫或 transition token。車內／機槍切換保留 canvas buffer，只繪可見工作模式；renderer 不回寫武器規則。每個 VehicleModel 獨占並釋放自身資源；權威敵車 ID 消失才移除對應模型，已擊毀但尚存在的敵車保留殘骸辨識。

主炮與敵炮每次真正開火，由權威快照給出 0.18 秒遊戲時間的火光期限；機槍每發為 0.07 秒。外景使用暖橙邊緣、亮黃白中心的短促加色星芒，位置取車模實際炮管末端及第一人稱 Browning 末端，與飛行彈、曳光線、命中球及開火預告分開。主炮／機槍火光尺寸分別為 0.6／0.22 世界單位，敵炮為 0.85；保留深度遮擋，不新增照明或遮蓋 HUD 的面板。共同遊戲時鐘暫停時火光也停住，期限過後隱藏；換局、敵車退場及場景釋放清除對應資源，不以本機牆鐘延長或重播。

車內原創 WebAudio 機械短音提供音效開關，警示仍可見。此處只記錄實作的靜音與視覺語意，沒有音效聆聽品質驗證。

### Art provenance

本機 Poly Haven CC0-1.0 表面圖含 diffuse／OpenGL normal／roughness，只有 diffuse 使用 sRGB。來源與包裝雜湊見 [外景 README](public/art/README.md)、[表面 manifest](public/art/asset-manifest.json)、[天空 manifest](public/art/sky/asset-manifest.json) 與 [車內來源](public/assets/interior/sources.json)。車內 Green Metal Rust 作者為 Rob Tuytel，保留原像素及嵌入來源 metadata。歷史典藏只作研究；不輸入博物館圖片作遊戲表面，不聲稱掃描精度。

## Do's and Don'ts

### Do:

- Do 保留六個 Sherman 路輪、三組 VVSS 及三種車型的不同輪組、炮塔與炮長。
- Do 讓實際貼圖、shader 編譯與首個 GPU draw 完成後才送出準備票，保留可見準備中與取消狀態。
- Do 讓警示、暫停與結算文字和退出／返回操作保持可讀，並在靜音時保留可見危險提示。
- Do 延續本機素材出處、授權及雜湊紀錄，模型與地景維持原創程序幾何。
- Do 讓低草保持裝飾，石造掩體對齊權威碰撞盒，動畫只讀權威快照。

### Don't:

- Don't 把接受的簡化外觀改述為原先偏寫實標準已通過，或新增未經要求的寫實重建義務。
- Don't 給駕駛外景、把機槍視角綁到主炮，或用美術改變碰撞、傷害與權威時鐘。
- Don't 把博物館研究影像、材質色或光照資產說成掃描模型、歷史軍漆色號或諾曼第實景照片。
- Don't 宣稱窄螢幕已有觸控玩法，或把此設計紀錄當作 FPS、音效聆聽或完整 #27 驗證證書。
