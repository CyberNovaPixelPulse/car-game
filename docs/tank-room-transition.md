> 歷史分階段接入紀錄；最終單一坦克入口與三席契約以 README、docs/game-runtime.md 及 ADR 0002 為準。舊 C／賽車與過渡 API 已在 #27 移除。

# 坦克房間移轉

#13 新增暫時的 `tank.html` 開發入口；主入口仍保留既有賽車，直到 #27 完成整合與移除。兩個入口都納入正式 Vite 建置。

坦克沿用 Session 的真實 PeerJS 傳輸、序號、憑證、心跳與房主權威，透過 `new Session("tank")` 選用三人職位規則。預設 `new Session()` 仍為五人賽車。兩者使用不同 peer namespace 與 sessionStorage key，不會誤連不同遊戲。

新增房間 game 欄位與 battle 階段。房主仍是傳輸席位 0，但席位與職位無關；每名成員可選 driver／gunner／loader 並準備，主機依連線身分接受請求、強制職位唯一與全員準備。工作站使用 onRoom／onStart 接續，後續核心可以使用原有狀態、輸入與房主權威介面。

工作站目前只有已完成的分工與連線，不提供未實作的移動／射擊按鈕。後續 #14 接入 3D 同車，#27 移除過渡入口及舊核心。

前端埠可用 WEB_PORT 改變（預設 4273），Playwright 可用 PEER_PORT 指定信令埠（預設 4274），會同步配置前端 VITE_PEER_PORT 與 PeerServer PORT。直接啟動 PeerServer 時仍支援 PORT。平行工作樹必須指定不同埠，且 Playwright 不得誤用另一個工作樹的服務。

實測方式：npm run check；EMCC=/tmp/car-game-emsdk/upstream/emscripten/emcc npm run build；npx playwright test tests/tank-rooms.spec.ts tests/rooms.spec.ts tests/racing.spec.ts。工作單測試只觀察畫面、職位名單與實際按鍵，不注入房間或遊戲狀態。
