# 裝填手語音（選用錄音）

遊戲預設用瀏覽器語音合成念出「高爆彈，裝填完畢！」等通知。想換成真人錄音：

1. 把錄音放進這個資料夾（mp3／ogg／wav，建議 1 秒左右、開頭不留空白）。
2. 在 `manifest.json` 的 `callouts` 填入檔名，例如 `"loader-ready-he": "ready-he.mp3"`。
   - `loader-ready-he`、`loader-ready-ap`、`loader-ready-smoke`：依彈種播放（建議錄美式英語，例如喊「H E, UP!」）。
   - `loader-ready`：沒有對應彈種錄音時使用的通用版本。
3. 留空字串就維持語音合成。

錄音會自動經過車內通話器濾波（窄頻、輕微破音）並在前面加上按鍵聲，錄的時候用一般喊話音量即可。請只放自己錄製或授權允許的音檔。

## 主炮錄音

`cannon-sfxengine.mp3` 是在 SFX Engine 生成的坦克開砲聲（使用者帳號的第三個生成項目，提示詞：「Create a highly impactful sound effect of a tank firing its main gun, from the perspective of someone sitting on the tank itself.」）。依 SFX Engine 的說明，生成的音效附帶商用授權。

處理：取前 1.94 秒、最後 0.28 秒淡出、降低 1 dB 留峰值空間，轉成 192 kbps MP3。遊戲中以它為主，下面疊一層低通 240 Hz 的合成砲口壓力波補低頻衝擊，再加上原本的閂體後座、復進和車內零件震動聲。敵方開砲也會用同一段錄音，依距離延遲、變悶並把音高壓低。

想換回純合成砲聲：把 `manifest.json` 的 `samples.cannon` 改成空字串。
