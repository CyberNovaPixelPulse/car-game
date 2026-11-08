# 坦克驗證

執行入口與停止條件以 [執行草案v2](agents/execution-plan.md) 為準。`npm test` 現在只做規則自檢、型別檢查及案例收集，不開瀏覽器。macOS的自動多場景E2E已停用；以下E2E指令只適用於資源已確認的其他驗證主機。

#30 的完整整合以固定來源執行全部案例，明確設定 `TANK_BROWSER_ESCAPE=1`，再用 `TANK_THREE_BROWSERS=1` 對重要三波／新增狀態暫停／同房換職流程補驗。`tank-driver-view` 等直接呼叫 `browser.newContext` 的案例不受獨立程序旗標影響，須按實際程序數描述。完整與補驗不可加總成一次全套通過。

`tank-integration` 透過機槍唯一觀測者切維修，使活躍校準與舊情報同時凍結；`tank-waves` 在實際增援寬限停穩維修／校準，保留 HE 多敵傷害、退休 ID 與跨波工作狀態。`tank-repair-lifecycle` 先刻意產生校準失敗／舊情報，再由 HP0、回同房、房主換駕駛與新局驗證清空。真60秒期限與房主離開沿用正常生命週期案例，帶入上述新增狀態。

設定 `TANK_EVIDENCE_DIR` 後，歷史固定截圖一律寫入本次目錄，以保留舊來源 captures。`tank-hud` 的兩尺寸五視野矩陣包含頁面／瀏覽器全螢幕，並輸出實際 viewport、screen、buffer、quality及WebGL renderer manifest；選定首屏仍須逐一開啟。共用三人 helper另留經去識別的 console、pageerror、failed request、HTTP錯誤、renderer crash及WebGL contextlost觀察，故意的故障案例須逐項標示，不能全部過濾。

已確認的接點是真實 PeerServer／WebRTC、瀏覽器原生鍵盤、可見 HUD／畫面／結算。不可注入世界狀態、呼叫內部瞄準／擊殺函式、縮短生產時間或把隱藏 DOM 當視覺證據。固定種子僅替換單一 Uint32 戰鬥熵來源；房間代碼、token 與 epoch 繼續使用真隨機。

先 `npm ci`；首次執行瀏覽器測試前用 `npx playwright install chromium` 安裝 Playwright Chromium。再 `npm test`、應用程式變更時執行 `npm run build`。E2E入口改為 `npm run test:e2e -- ...`；目標案例啟動前端與relay，仍須符合資源、範圍與時間門檻。資源主機針對性範例：

```sh
TANK_E2E_RESOURCE_READY=1 WEB_PORT=5054 PEER_PORT=5055 TANK_NATIVE_BROWSER=1 npm run test:e2e -- tests/tank-entry.spec.ts -g 入口 --global-timeout=300000
```

`TANK_NATIVE_BROWSER=1` 是明確選用完整 Chromium 的相容性選項：`channel: chromium`、`chromiumSandbox: true`、移除 `--enable-unsafe-swiftshader` 預設參數，保留背景分頁計時設定。沒有授予裝置權限、關閉網路安全或關閉 sandbox。在此 Mac 的真實遊戲 canvas 已觀察 Apple M5 Metal；這不構成 FPS 或其他機器效能保證。

一般功能測試以同一 Browser 的三個隔離 context 扮演玩家；不可描述為三台電腦或三個程序。最終波次驗證可明確使用三次獨立 `Browser.launch()`，每個瀏覽器各自 context、真正 WebRTC 及鍵盤：

```sh
TANK_E2E_RESOURCE_READY=1 WEB_PORT=5054 PEER_PORT=5055 TANK_NATIVE_BROWSER=1 TANK_THREE_BROWSERS=1 TANK_RECORD_CREW_VIDEO=1 TANK_EVIDENCE_DIR=/fresh/run-directory npm run test:e2e -- tests/tank-waves.spec.ts -g 乘員以正常 --global-timeout=600000
```

`TANK_EVIDENCE_DIR` 指定本次證據目錄；可選的三路全程乘員錄影預設關閉，需另設 `TANK_RECORD_CREW_VIDEO=1` 才開啟實際勝利錄影。火光、機槍及車內三個真正使用影片的案例以 `recordVideoRequired` 保留必要錄影與影片檢查，不受此旗標關閉影響。外部音訊輸出觀察器僅在明確設定 `TANK_AUDIO_COLLECTOR` 時於新頁載入，記錄真實 WebAudio 輸出與時間，不呼叫遊戲音效、不自動 resume；原始音訊留在工作樹外。捕獲訊號不證明實際喇叭播放或人耳辨識；最終報告須分開記錄人工聆聽限制。

## 覆蓋與移除對照

所有 `tank-*.spec.ts` 保留：入口、房間、駕駛碰撞、慣性瞄準、裝填／射擊／退殼、三彈種、卡彈、蹲下／五秒暈眩、機槍／過熱、敵車、煙幕、三模式停車維修／2 HP 每秒／受擊禁修／原位重連凍結、三波勝負／回房換職重玩、斷線暫停／原位重連／現實 60 秒期限及 relay 18 秒重試、外景與車內。

`tank-intel-memory.spec.ts` 以實際轉向與煙霧彈產生失去觀測，驗證固定舊位置、三方共用文字與淡出，以及超過五秒的真實缺員暫停後原職位重連續接。`tank-scouting` 與 `tank-smoke` 分開斷言當前／舊情報，不把保留的舊標記誤當成持續追蹤；真實煙後 AP 命中不刷新已知 HP，重新觀測才更新。波次及同房換職新局沿用正常裝填、射擊與結果流程驗證清理。

舊賽車測試移除映射如下：rooms/five-racers → tank-rooms；driving/braking/obstacle → tank-driving；projectile → tank-weapons/ammunition/smoke；finish/retry → tank-waves；reconnect → tank-reconnect；racing → tank-entry/rooms/waves。drift/items/lap-guard 的甩尾、道具、圈數已被 #11 取消，沒有虛構坦克替代玩法。舊 helpers 與 C/Wasm adapter 同步移除。

完整回歸須先獨立安排，並設 `TANK_E2E_RESOURCE_READY=1 TANK_FULL_REGRESSION=1` 及 `--global-timeout=4200000`；它不阻擋試玩／審查檢查點。最終完整批次須全數執行，不以舊票各批通過相加代替新來源整合通過。保留原始失敗與重試紀錄，不能放寬產品限值製造綠燈。視覺驗收包含 1280×720 各職位戰鬥／結算／返回、1440×1050、390 入口；駕駛依 #30／#31 使用固定車頭、水平約 60°且垂直狹窄的裝甲觀察窗，須檢查實際開口、厚度與場景移動，不只檢查 canvas；不使用隱藏敵座標。裝填模式只顯示車內。截圖須開啟確認；音訊、FPS 與部署狀態各按實際證據描述。

#39 新增 `tank-repair` 與 `tank-repair-lifecycle`：以普通敵彈先造成損傷，再用 R、Tab、C 與駕駛鍵驗證維修、限制、三方一致、HP0 不復活及同房換職。修理狀態與工作介面見 `docs/tank-repair.md`；`tank-repair-calibration` 由真實敵彈、可見圓形／角度與 HP 驗證一般／完美獎勵、完整兩秒漏按、各類工作中斷、等待重疊及原位重連，與武器卡彈使用分開狀態。原機槍、車內與煙幕案例已更新為三模式的 Tab 次序，不再假設機槍後直接返回裝填。

#36 的 `tank-navigation` 使用真正三人連線、W 行駛至固定石牆、D 原地轉向及方向鍵長按轉砲，直接觀察可見 SVG 的位置／方向與原有 HUD。SVG 的變換就是實際繪圖，不是隱藏座標鏡像；純垂直的主炮線幾何寬度為零，須檢查實際描邊及截圖，不能只靠框尺寸判斷可見。全角色、裝填手三種工作及兩種桌機尺寸另留首屏截圖；地圖行為見 `docs/tank-navigation.md`。本票局部結果不能代替整合後完整批次。

#33 的 `tests/tank-hud.spec.ts` 從正常三人房間驗證各視野填滿 1280×720、1440×1050 的實際頁面邊界，共用方向／速度／HP 與退出控制完整同屏；涵蓋裝填、機槍、維修及缺員返回。使用 `TANK_EVIDENCE_DIR` 將新截圖留在指定證據目錄，不覆寫歷史 captures。

#34 的 `tests/tank-fullscreen.spec.ts` 使用各自可信點擊及鍵盤 Esc／Space，觀察公開 `document.fullscreenElement`、完整場景／HUD／小地圖、切換後實際轉砲／裝填、三種工作與暫停／結算／回房重玩／離房。瀏覽器不可用路徑由真實 `Permissions-Policy: fullscreen=()` 回應驗證；被攔截的本機測試文件另外授予該暫時 context 的 `local-network-access`，讓 Chromium 能使用本機 PeerServer，沒有修改正式產品的網路設定。

`tests/tank-fullscreen-native.spec.ts` 是明確啟動的補驗，預設略過。`TANK_BROWSER_ESCAPE=1` 以 headed 瀏覽器可信鍵盤事件驗證 Esc 與立即操作；`TANK_NATIVE_ESCAPE=1` 使用 macOS System Events，只向本次測試瀏覽器的公開 CDP 程序 ID 發送原生 Esc；`TANK_CUA_ESCAPE=1` 留下 `native-ready.json`，供電腦控制工具對該測試視窗正常按 Esc。原生 OS／CUA 需要已解鎖的 Mac；邏輯 `document.hasFocus()` 不證明鎖定桌面上的實體按鍵已送達。補驗保留事件可信度觀察，從不替換全螢幕 API。三個 context 與三台電腦、瀏覽器可信事件與 OS 原生輸入須按實際證據分別描述。

校準的瀏覽器崩潰案例是外部 renderer 故障補驗：不呼叫遊戲規則，只確認失聯被權威偵測前繼續正常結算、缺員暫停後凍結。它不代表一般鍵盤操作，也不宣稱 Playwright 能對已崩潰 Page 自動重載；正常離頁／回同一分頁另行驗證原職位重連。

#35 的 `tank-quality` 從正常三人房間觀察可見畫質選單、實際 canvas width／height 與 CSS 尺寸，確認不改視窗大小也能切換低／中／高、HUD 獨立、其他乘員設定不變。像素預算、保留畫布與資產層級的界線見 [本機場景畫質](tank-quality.md)；實測版本、資產回應及畫面證據留在各票報告，不能推論未量測 FPS。
