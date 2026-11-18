# 目前任務

[Spec #56](https://github.com/CyberNovaPixelPulse/car-game/issues/56) 與 #57–#64 已整合至 `codex/crew-camera-motion`。[PR #65](https://github.com/CyberNovaPixelPulse/car-game/pull/65) 保持草稿，等待三裝置與剩餘情境驗收。

- 本輪於台北時間 2026-11-18 21:54 開始。首個 30 分鐘里程碑交付主炮試玩入口、七個功能票的整合及單人戰鬥樣本。第二個里程碑至 22:54，交付雙軸審查修正、終局錄影與驗證報告。
- 本機試玩入口為 http://127.0.0.1:4286/ 。選「單人練習」→「砲手」→「開始練習」，等主炮就緒，點戰場後按空白鍵。其餘機器可依 README 啟動同一分支。
- 最終應用程式來源 `2010f9c`。本機 `npm test` 通過規則自檢、型別檢查與 45 個檔案的 151 個瀏覽器案例收集，`npm run build` 通過。快速檢查見 `output/qa/1795012320637-3cfe1c43/report.json`。PR 的遠端輕量檢查見 [GitHub Checks](https://github.com/CyberNovaPixelPulse/car-game/pull/65/checks)。
- 規範與規格審查發現三人案例用帶正負號的數字判斷倒車，並在機槍模式讀了隱藏的主炮計數。改為使用可見的方向、速度及砲手發數。規格複核另發現戰局結束時權威時鐘凍結會妨礙最後一擊回穩，已改為限時的本機呈現。兩軸均已複核修正。
- 使用者確認本輪沒有另外兩台裝置與操作人員。三人實機及其他尚無證據的項目，詳見[逐批試玩紀錄](../tank-camera-validation.md)。GitHub Issues 由 PR 合併時關閉。
