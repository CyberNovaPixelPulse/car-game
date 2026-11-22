# 未合併工作整合

- 範圍為將乘員鏡頭、裝填與維修、192 高地及 PR 試玩範本集中至一張以 `main` 為目標的 PR。
- 2026-11-22 23:58 開始，2026-11-23 00:28 為第一輪檢查點（台北時間）。
- 工作分支為 `codex/consolidate-current-work`，從已接入 Unreal PastureBlend 的 `b7957e4` 整合。
- 交付為整合草稿 PR、快速檢查、正式建置及內建瀏覽器的正常單人流程。三人實機仍待安排。

## 交付與驗證

- [整合草稿 PR #90](https://github.com/CyberNovaPixelPulse/car-game/pull/90) 以 `main` 為目標，接替 #65、#76 與 #68。
- 以 `12f6cbf` 執行 `npm test` 和 `npm run build`。62 項測試與型別檢查通過，收集 153 項瀏覽器案例。正式建置有套件體積提示。[GitHub verify](https://github.com/CyberNovaPixelPulse/car-game/actions/runs/45041690763)
- 同一建置用內建瀏覽器驗證 192 高地沿主農路達到 100% 占領與勝利，重開回到 `(-110, -75)` 及 0%。駕駛的震動開關可關閉和恢復。暫停切成裝填手後，R 鬆開時保留 47.4%，再按可續裝至主炮就緒。
- 三人三裝置、完整瀏覽器回歸、窄窗校準重疊與受擊混音峰值待驗。歷史證據見[乘員鏡頭](../tank-camera-validation.md)、[裝填手工作站](../tank-loader-validation.md)與 [Unreal 192 高地](../hill192-unreal.md)。
