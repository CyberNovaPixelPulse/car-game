# #45 儀表與單人練習驗證紀錄

日期：2026-11-09（Asia/Taipei）。規格 [#45](https://github.com/CyberNovaPixelPulse/car-game/issues/45) 與功能票 #46–#55 已發布。以下先保留初次功能交付的固定來源回歸；當時實作只提交至本機 `main`，沒有推送或部署，也沒有修改另行進行的 retro 工作。校準觀察問題的後續修正與驗證另記於文末。

## 固定來源完整回歸

受測程式版本為 `f251bb2cc9b0f5f34db4d5dc140b3ded8acaa5a3`。開始前保存全部 160 個受版本控制檔案的 SHA-256；結束後、補寫本文件前，核對 HEAD 與全部指紋一致。

- Playwright Chromium：**129 通過、1 失敗、0 跳過、0 flaky**，共 130 項，耗時 54.5 分鐘。
- 本次新增 21 項（儀表 1、練習操作 9、練習整合 11）全部在這一次完整回歸中通過。
- `npm run build` 通過，包含 TypeScript 檢查及正式建置；保留既有的 Vite 大於 500 kB bundle 提醒。
- 多人使用真實本機 Peer 信令／WebRTC 與不同 browser context；本輪沒有啟用三個獨立 Browser 程序補驗，不能視為三台實體電腦的驗證。

執行命令（從專案根目錄）：

```sh
WEB_PORT=4590 PEER_PORT=4591 TANK_NATIVE_BROWSER=1 TANK_BROWSER_ESCAPE=1 \
TANK_EVIDENCE_DIR=/tmp/car-game-practice-final-2026-11-09-r2/evidence \
PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/car-game-practice-final-2026-11-09-r2/results.json \
npx playwright test --reporter=line,json \
  --output=/tmp/car-game-practice-final-2026-11-09-r2/test-results
```

原始完整輸出、JSON、160 檔指紋、結束核對與畫面證據保存在本機 `/tmp/car-game-practice-final-2026-11-09-r2/`。這些本機暫存證據未加入 Git；可依上列命令重新產生。

## 初次回歸保留的既有失敗

`tests/tank-repair-calibration.spec.ts:343`「實際敵彈中斷校準，三秒受擊與兩秒失敗取較晚且兩種等待一起凍結」在第 353 行等待 `repair-calibration` 可見時逾時 12 秒。

以本次改動前的 `ea60b85496d1ab3454e43a595998b9a421a50947` 在隔離目錄執行同一項正常瀏覽器操作，於 **同一行、同樣等待**失敗（43.6 秒，1 失敗）。該測試及 `web/tank-repair.ts` 與改動前檔案完全相同。這證明此失敗可在改動前重現；初次交付時尚未查明時序原因，因此該批次不宣稱全綠或問題已修復。

對照證據保存在 `/tmp/car-game-practice-baseline-calibration/`。原有整合事項 [#41](https://github.com/CyberNovaPixelPulse/car-game/issues/41) 保持開啟。本輪未修改原有維修規則或放寬測試條件，也未將另行進行的 retro 工作納入。

較早在 `d39dabc` 上啟動的全套批次，為完成素材失敗後的資源清理而主動中斷；終端結果為 11 通過、1 中斷、117 未執行，證據在 `/tmp/car-game-practice-final-2026-11-09/`。它不是完整回歸，未與本輪或局部重跑加總。

## 功能與畫面證據

正常首頁、按鈕與鍵盤操作到達情境，經真實本機核心／AI，觀察 HUD、畫面及結果；不注入 HP、位置或工作進度，不縮短正式戰鬥計時。本輪已驗證：

- 三種真人職位與兩位 AI 配合擊毀單敵；手動下一輪延續戰況，真實 HP0 敗北後完整重來。
- AI 裝填、避殼、下一發彈種、維修／校準；砲手受煙幕遮蔽、射前提醒及停火；駕駛接近、停車、恢復與靠牆接手。
- 暫停及換職保留部分裝填、機槍工作／熱度、校準原位；需要新的真人按鍵接續。
- 換職時真實素材 HTTP 503 的失敗畫面、回原職位重試及戰況保留。
- 原生控制的鍵盤焦點、面板收合、關閉教學後保留必要提醒，以及兩種桌機尺寸／全螢幕的三職與裝填三模式。
- 多人正常三波勝利、HP0 敗北、同房換職重玩、缺員凍結／重連、真實 60 秒逾時與房主離開；另保留上述一項校準失敗。

Standards 與 Spec 獨立審查在修正鍵盤焦點、調參集中、換職失敗資源清理等發現後，均回報無剩餘發現。最終畫面審查涵蓋 29 態及固定來源的敗北／重來兩張補圖，共 31 態，判定 SHIP，沒有剩餘 material finding；這是靜態畫面結論。

本輪機械掃描為 32 個 advisory、0 非 advisory：31 個屬既有 CSS，1 個為實際渲染成 12px 的 SVG 刻度字級；沒有為清除既有提示擴大改版。先前固定名稱的儀表截圖曾被後續綠燈覆寫，不能作不可變的改動前證據；原始 red trace 保留，新測試改用每次執行獨立路徑。

內建瀏覽器連線逾時後，依瀏覽器偏好改用真實 Playwright 原生 Chromium 截圖完成畫面審查。沒有認證內建瀏覽器操作成功、FPS、人工音效聆聽、所有瀏覽器或三台實體電腦。

## 後續：校準觀察修正

使用者授權先修好校準問題，再推送及部署正式站。診斷找到兩個測試觀察問題，遊戲規則不需修改：

- 敵彈中斷案例的原始 trace 顯示校準已出現、指針到 25°，下一張畫面即受擊中斷；原本較慢的可見性輪詢漏看短暫狀態。`0310c36` 改為每 20ms 觀察相同公開 HUD，保留原 12 秒期限與傷害、失敗、受擊等待及重連斷言。
- 完美校準案例把輸入窗口自行縮為 8°；實際多人讀數從 75° 更新至 87°，跳過了人工設定的 76.5°–84.5°，但畫面完美區是 74°–95°。`8f74654` 讓兩個完美案例使用畫面實際完美區，於同一次只讀 DOM 觀察取得角度及 HP，隨即送出正常 Space。完美結果、額外 +3 HP、上限 100 HP、三方共享及原等待期限全部保留。

原案例三次重現為 2 通過、1 失敗；20ms 修正後同案例連續 3 次通過。第一批完整校準檢查為 9 通過、1 項完美窗口觀察失敗；補修後在固定來源 `8f746547fca5eb93078eb847831d61c58396ffaf`，**完整 10 項校準檢查全部通過，0 跳過、0 flaky，耗時 7.9 分鐘**。結束後核對 HEAD 及 161 個受版本控制檔案指紋一致。Standards 與 Spec 獨立補審均為 0 項剩餘發現，型別檢查與正式建置通過。

此回合僅修改校準測試及驗證文件；遊戲程式與資產和初次固定來源回歸相同，因此未重跑整套 130 項。上面的 129／130 原始結果與本回合 10／10 分開保留，不相加宣稱新的單次完整 130 項全綠。

本機證據在 `/tmp/car-game-calibration-fix-20261109/`：`reproduce/`、`green/`、`calibration-suite/`、`final-calibration-suite/` 分別保留重現、單項確認、第一批校準回歸及最後全綠批次；`review.md` 保留兩軸審查。正式發布使用已提交版本的乾淨來源副本，另核對部署版本與公開網站短流程。


## 四項架構整合驗證（2026-11-17）

整合工作樹為 `/Users/guanyuchen/side-project/car-game-worktrees/architecture-integration`，分支 `codex/architecture-integration`，共同基準 `a34be9d`。依序整合職位畫面生命週期、工作站呈現、單人練習命令、校準測試操作。產品與測試來源固定於 `eed4f3f`；`0a64913` 只新增使用者要求的內建瀏覽器規則。原 checkout 的其他既有工作保留，未推送或部署。

整合將 HUD 工作區顯隱交給工作站，canvas 建立、掛載與渲染交給 TankRoleViews。換職保留「暫停 → 準備 → 掛載成功 → 同步交換職位」；四種練習意圖經過 GameRuntime.commandPractice 結算舊控制時間。另把第一項交付的延遲換職回覆及機槍重連驗證保留為 tank-role-view-integration.spec.ts。

### 固定來源檢查

`npm run check`、`npm run build` 及 `git diff --check a34be9d HEAD` 通過。Vite 保留既有的大型 bundle 提醒。整合冒煙 14/14 通過，包含權威時序四例、校準清理四例、地景取消／部分失敗兩例、延遲換職回覆／機槍重連兩例、駕駛資產準備及三職速度讀數。來源為 `439fde9` 加交付的兩項整合測試；後續 `eed4f3f` 僅將這兩項測試改為中文名稱、提交並更新 runtime 文件，產品碼相同。原始結果：`/tmp/car-game-architecture-integration/smoke/results.json`。

使用者指定內建瀏覽器後，兩輪外部 Chromium 完整批次均停止，不能宣稱全套 142 例通過，也不把不同批次相加。第一輪為 3 通過、2 失敗、1 中斷、136 未執行；失敗是反向瞄準讀數 46.4 未小於 45，以及可信 Esc 全螢幕案例的 focus 斷言，原因未完成基準對照。第二輪中止前 4 通過，剩餘未完成。原始紀錄保留在 `/tmp/car-game-architecture-integration/full/` 與 `full-final/`。後續瀏覽器驗證依 AGENTS.md 使用內建瀏覽器。

### 內建瀏覽器實際操作

透過 Codex 內建瀏覽器及普通 UI／鍵盤操作本機整合版，未注入遊戲狀態或改動遊戲時鐘。

- 單人：駕駛前進／倒車、km/h 與方向文字；暫停換至砲手，準備後保持暫停；砲手正常瞄準與開火一發；換至裝填手後發射數與膛內狀態保留；裝填→機槍→維修→裝填→機槍，機槍七發計數保留；高畫質切換及車內只保留內景呈現。實測 DOM 尺寸包括 1280×720、1440×1050。部分早期截圖被內建瀏覽器縮放，檔名的預期尺寸不能替代實際像素尺寸。
- 入口：390×844 的 DOM 寬度與 scrollWidth 均為390，完整首頁無水平溢出。
- 多人：同一內建瀏覽器三個分頁，透過真正本機 PeerServer／WebRTC 連線，不是三台電腦；三職選擇、取消準備、重新準備、開始戰鬥；裝填手機槍射擊六發後離頁，全隊顯示缺員暫停；返回同一分頁直接恢復機槍、保留六發計數，無須重新投準備票；自然受擊至 HP0，按 R 不復活；回到原房間後三人職位與準備狀態清空。
- 全螢幕：內建瀏覽器拒絕 requestFullscreen，遊戲顯示錯誤提示並可繼續操作。僅驗證失敗回復，未認證成功全螢幕／可信 Esc。
- 未完成：整合版全部142例、三波勝利、完美校準時序與完整HP獎勵矩陣、原始兩項失敗的基準對照。內建瀏覽器 raw CDP 不支援本次嘗試的 Input.dispatchKeyEvent，因此未藉此重跑時間敏感 helper。未測效能、人工音效聆聽、實體多機或部署。

內建瀏覽器截圖及公開DOM紀錄保存在 `/tmp/car-game-architecture-integration/iab/`，包括 `machine-gun-1440x1050.jpg`、`menu-mobile.jpg`、`multiplayer-paused.jpg`、`multiplayer-loader-reconnected.jpg`、`multiplayer-failure-fullscreen-fallback.jpg` 及 `multiplayer-returned-lobby.jpg`。預覽為 `http://127.0.0.1:5375/`。

### Standards

唯讀規範審查 `a34be9d...439fde9`：0 項新增硬性違規、0 項具體可行的 smell 發現。核對資源所有權、舊控制結算、呈現與權威界線、真實輸入及清理。指出 docs/game-runtime.md 舊句「沒有 practice/idle 本機遊戲」與 ADR0003 衝突，已在 `eed4f3f` 修正。

### Spec

唯讀規格審查四份核可交接：0 項確定的缺漏、越界或錯誤實作。掛載後換職、HUD後渲染、可見外景比例、晚到資源回收、命令順序及校準操作契約均符合。此為靜態審查，不能代替未完成的瀏覽器案例。

兩軸各0項新增問題；均無可指出的最高嚴重度問題，驗證限制如上。
