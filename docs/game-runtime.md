# 權威執行時

Session 傳輸三席房間、唯一職位與準備票，GameRuntime 結合 TankCore 的開始、held input、離散 action、完整 elapsed、快照及呈現。房主身分與職位獨立，非房主不推進權威規則。

接收操作前先以 monotonic performance.now 推進舊控制到實際接收時刻，之後才套用新控制；rAF 不得把游標回退。斷線回呼前記住舊暫停狀態，先消耗斷線前 elapsed，再清除控制與凍結。恢復只從新接收時刻開始，新局重設時間基準，不補算大廳或暫停時間。核心以最多 0.05 秒子步完整處理 elapsed，不丟掉慢幀。重連期限獨立使用現實時間。

離散 action 和 held 共用可靠有序通道、epoch 與遞增序號；房主根據已驗證連線的席位決定操作者，不相信客端自稱席位。房間 generation 防止舊連線回呼改寫新房間。沒有 practice/idle 本機遊戲、OR 動作佇列、五席 mask 或 C adapter。

呈現讀快照；準備完成前先載入資產、shader 編譯及首畫，重用準備好的 renderer。取消準備、換職、離開、返回皆依資源所有權失效與釋放。
