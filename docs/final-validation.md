# #27 最終驗證

根目錄為唯一坦克入口；舊賽車入口、C／Wasm adapter、必要 C 建置及無呼叫者的本機 API 已移除。三席房間保留真實 PeerJS／WebRTC、隨機代碼／憑證／epoch、房主權威及角色唯一性，開始訊息改為明確三席清單。可調起始規則集中在 `web/tank-settings.ts`，包括初始／後續敵車 HP 與不同開火寬限、卡彈目標起點範圍；沒有改弱傷害、縮短等待或放寬測試門檻。固定五秒暈眩留在不可調規則。

已合併來源中的單一權威 receipt cursor／完整 elapsed／記住暫停狀態修正保留。實際720高視窗測試重現大廳捲動位置被帶入戰鬥，已在正常 UI 轉場修正；只在進入選單、工作站、新大廳、暫停或結果時回到頂端，不在每次快照強制捲動。駕駛暫停退出曾確實落在視窗外，緊湊駕駛排版已修正且仍完全沒有外景或敵座標。

## 驗證

- 完整回歸批次：17個檔案、67項，66通過／1失敗（28.6分鐘），單一 worker、真實 relay／WebRTC／鍵盤／公開 HUD 與結果，明確使用 `TANK_NATIVE_BROWSER=1`。唯一失敗經原始trace證實為測試在三次串行按鍵RPC之後才觀察0.8秒退殼，當時已正常空膛；公開snapshot曾真實顯示退殼。僅修正 `tank-weapons.spec.ts` 該案例的輸入／公開HUD觀察後，連續重複5/5通過（1.0分鐘），完整武器與退殼兩檔6/6通過（1.2分鐘）。其餘66項的產品程式完全未動，因此67項功能以完整批次及精準補驗共同覆蓋；不宣稱單次67項全綠。
- 三個獨立玩家 Browser 程序：PASS3/3，4.0分鐘。完整三波勝利包含實際高爆同時損傷多敵；三方勝利時共同 HP14/100。另一場真實 HP0 失敗後同碼回房、角色／準備清空、換職／重新準備及新局裝填射擊成功。這是同一 Mac 上三個獨立玩家 Browser，不是三台實體電腦；一般功能回歸則使用一個 Browser 的三隔離 context。
- 新增在途砲彈暫停、機槍對虎式實傷、卡彈／熱度／煙幕與暈眩／飛行物於結算仍存在再回房重設，曾作為7項整合批次全數通過；上述完整67項批次再次涵蓋並通過它們。這些檢查不注入私有遊戲狀態。
- 原範圍五秒暈眩精準案例：最終完整批次原生 Space 到可見恢復5869.6001ms，補驗再量到5853.6001ms；原驗收5600..6300ms未放寬。真實60秒斷線期限及18秒連線重試沒有加速。
- 受影響入口／720直接開戰／完整視覺矩陣：PASS3/3。全新整體 finish review：SHIP；23張必要實際畫面已由實作者與獨立 reviewer 開啟確認，包含1280×720三職與機槍戰鬥、三職暫停／結果／返回、1440×1050以及390×844入口。不可用長圖取代初始視窗證據。
- 一次機械 detector 的6項字級 advisory 已按實際 selector 範圍在 DESIGN／sidecar 說明；沒有宣稱重新掃描為零，也沒有重跑第二次 detector。
- 型別檢查與新的純 TypeScript 正式建置通過；交付前在本票分支合併最新 integration 後再核對。建置保留 Vite 大於500kB bundle 警告，不放寬警告門檻；無 Wasm、game.js 或賽車 HTML。正式部署未執行。

## 證據與限制

完整證據位於 `/tmp/car-game-to-spec/visual27-final/`，不依賴待清理工作樹。`finish-review-captures/` 是已審查的固定23張原始 viewport 副本；`finish-review.md` 是新五段審查。`three-browser-final-report.md` 區分程序／context與實際驗證範圍。`three-browser-final-media/win-{driver,gunner,loader}.webm` 為真正三獨立瀏覽器成功勝利錄影，並保留原始錄影。

真正 WebAudio 輸出已在實際操作中擷取，沒有呼叫遊戲 cue、合成替代示範或自動 resume。最終 loader 原始 WebM365243 bytes，43個真實鍵盤／公開狀態時間點、44100Hz running context、collector無錯誤；`actual-final-win-loader.wav` 僅依原始 packet 時戳補靜音作96.78秒播放副本。這是瀏覽器／OS靜音之前的訊號，不證明喇叭可聽或人耳辨識。精確保留限制：本 agent 未聽辨裝填、就緒、卡彈、退殼／暈眩、機槍及過熱／冷卻聲音；仍需人工聆聽，不能宣稱全部手動音效驗收通過。所有關鍵危險仍有可見對應。詳見 `audio-observation-limit.md`。

此美術完成標準是使用者於2026-11-07接受的簡化外觀，保留機械附著、二戰辨識及資訊分工；不是原寫實材質標準已通過。沒有 FPS／跨瀏覽器／三台實體電腦／正式網路部署保證。安全 native full Chromium 選項保留 sandbox、移除 unsafeSwiftShader 預設參數，不授權裝置權限或關閉 web security。

歷史入口 red、測試期間 HMR 造成觀察器消失、故意中斷的第一次完整批次7pass/1interrupted/58notrun、720轉場 red、誤讓房主離頁的測試安排失敗、真正駕駛暫停出口 red，以及後續 green 都保存於 logs／結果目錄。歷史捲動無效 capture 留在 `historical-first-three-browser-captures/`，不作最終視覺證據。沒有把未跑、失敗或中斷檢查改稱全綠。
