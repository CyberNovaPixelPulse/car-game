## 瀏覽器驗證（僅 Codex）

本專案的瀏覽器操作、畫面檢查與遊戲回歸驗證一律使用 Codex 內建瀏覽器（`iab`），包括自動化操作。既有 Playwright 套件可作驗證項目參考，不自行另開外部 Chromium 執行。型別、建置及不啟動瀏覽器的測試可照常執行。無法透過內建瀏覽器完成的項目，明確記錄未驗證範圍。

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `CyberNovaPixelPulse/car-game`; use `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five canonical labels `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Use the single-context layout with root `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.

### Execution and validation

Before implementation, browser testing, or retrying failures, read `docs/agents/execution-plan.md`; current handoff is `docs/agents/current-task.md`.
