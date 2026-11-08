# #45 儀表與單人練習驗證紀錄

日期：2026-11-09（Asia/Taipei）。規格 [#45](https://github.com/CyberNovaPixelPulse/car-game/issues/45) 與功能票 #46–#55 已發布；實作提交至本機 `main`，本輪沒有推送或部署，也沒有修改另行進行的 retro 工作。

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

## 保留的既有失敗

`tests/tank-repair-calibration.spec.ts:343`「實際敵彈中斷校準，三秒受擊與兩秒失敗取較晚且兩種等待一起凍結」在第 353 行等待 `repair-calibration` 可見時逾時 12 秒。

以本次改動前的 `ea60b85496d1ab3454e43a595998b9a421a50947` 在隔離目錄執行同一項正常瀏覽器操作，於 **同一行、同樣等待**失敗（43.6 秒，1 失敗）。該測試及 `web/tank-repair.ts` 與改動前檔案完全相同。這證明此失敗可在改動前重現；尚未查明其完整時序原因，不宣稱原有測試全綠或問題已修復。

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
