# 讓房主瀏覽器中的 C 核心掌管賽況

本作業要求 C 語言遊戲與 Vercel 網頁部署，並已選定房主權威模擬。使用 SDL2／Emscripten 執行 C 模擬與繪圖，透過 PeerJS 建立 WebRTC 星狀連線，由一般車手傳操作、房主傳完整狀態；PeerJS Cloud 負責正式環境的連線會合，本機可自架 PeerServer。相較於另部署持續運作的遊戲伺服器，此方式能保留 C 核心並直接部署靜態網站；代價是房主必須維持在線、網路受 NAT／TURN 服務可用性影響，而且不提供競技等級防作弊。房主不移轉，離線即結束本場。

參考：[PeerJS FAQ](https://peerjs.com/client/faq)、[PeerServer Cloud](https://peerjs.com/server/cloud)、[SDL2 Emscripten](https://wiki.libsdl.org/SDL2/README-emscripten)。
