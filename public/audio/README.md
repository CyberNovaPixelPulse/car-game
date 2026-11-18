# 裝填手語音（選用錄音）

遊戲預設用瀏覽器語音合成念出「高爆彈，裝填完畢！」等通知。想換成真人錄音：

1. 把錄音放進這個資料夾（mp3／ogg／wav，建議 1 秒左右、開頭不留空白）。
2. 在 `manifest.json` 的 `callouts` 填入檔名，例如 `"loader-ready-he": "ready-he.mp3"`。
   - `loader-ready-he`、`loader-ready-ap`、`loader-ready-smoke`：依彈種播放（建議錄美式英語，例如喊「H E, UP!」）。
   - `loader-ready`：沒有對應彈種錄音時使用的通用版本。
3. 留空字串就維持語音合成。

錄音會自動經過車內通話器濾波（窄頻、輕微破音）並在前面加上按鍵聲，錄的時候用一般喊話音量即可。請只放自己錄製或授權允許的音檔。
