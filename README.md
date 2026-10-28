# Pocket Circuit｜口袋賽車場

用 C、SDL2 與 WebAssembly 製作的原創俯視派對賽車，桌面瀏覽器可玩。Vercel 提供靜態網站，房主瀏覽器執行 C 權威模擬，一般玩家透過 WebRTC 傳送操作。最多五人、三圈賽制，支援私人房間、甩尾、道具及同房再賽。

[線上遊玩](https://car-game-necterelux.vercel.app)

## 本機啟動

需要 Node.js 22 以上、Python 3.9 以上、Git，以及 Emscripten **4.0.15**。

```sh
npm ci
bash scripts/setup-emsdk.sh
export EMCC="${TMPDIR:-/tmp}/pocket-circuit-emsdk/upstream/emscripten/emcc"
npm run build:wasm
```

在一個終端啟動連線服務，另一個啟動網頁：

```sh
npm run relay
npm run dev
```

開啟 <http://localhost:4273>。本機使用獨立的 PeerServer（4274），不需要帳號或雲端密鑰。多台電腦測試時，使用房主電腦的區網網址；WebRTC 需要安全來源，跨電腦請部署 HTTPS 或設定本機 HTTPS。

## 操作

- W／↑ 加速，S／↓ 煞車及倒車，A、D／←、→ 轉向。
- Shift 按住並轉向甩尾，放開有效甩尾獲得短暫加速。
- Space 使用持有道具；每人只能持有一個。
- 自由練習可先熟悉手感。多人模式輸入車手名，建立房間後分享六位代碼，至少兩人即可開始。

## 驗證

```sh
npm run check
npx playwright install chromium
npm test
npm run build
```

測試從真實瀏覽器操作網頁與鍵盤，連到本機 PeerServer，觀察公開的畫面、HUD 和小地圖；不注入模擬狀態、不修改圈數或直接呼叫 C 核心來完成比賽。Playwright 自動啟動網頁與連線服務。

## 部署到 Vercel

部署設定已記錄於 `vercel.json`。建置會安裝鎖定的 Emscripten、編譯 C、檢查 TypeScript，再產生靜態網站。正式環境預設連到 [PeerJS Cloud](https://peerjs.com/server/cloud)，不需要另部署遊戲伺服器。

本專案使用 Vercel CLI 部署，依帳號權限也可使用 Git 整合。先登入並連結自己的團隊與專案，核對目標後採封裝上傳，避免大量逐檔請求；`.vercelignore` 已排除依賴、測試產物與本機環境變數。

```sh
npx vercel@65.5.0 link
npx vercel@65.5.0 project inspect
npx vercel@65.5.0 deploy --archive=tgz --prod
```

若要自架信令服務，先複製 `.env.example` 並設定公開的 PeerServer 主機、埠、路徑與 TLS。TURN／STUN 可透過部署環境擴充；公共服務及網路 NAT 可能影響連線可用性。不要在前端環境變數放私人憑證。

## 架構與限制

- `game/`：C 賽況、駕駛、計圈、道具與 SDL2 畫面。
- `web/`：WebAssembly 載入、鍵盤、房間、WebRTC 與網頁介面。
- `server/`：供開發與自架使用的 PeerServer 信令服務。
- `tests/`：同一個瀏覽器端到端接點上的功能驗證。

房主需要保持在線並讓遊戲分頁持續運作。房主關閉分頁即結束本場，不做房主移轉。本作業不提供競技防作弊、帳號、排行榜、公開配對或手機觸控。所有視覺圖形均為程式繪製的原創內容。
