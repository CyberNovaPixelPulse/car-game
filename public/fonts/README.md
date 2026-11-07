# 字型來源

| 檔案 | 字族／字重 | 授權 | SHA-256 |
|---|---|---|---|
| noto-serif-tc-700.woff2 | Noto Serif TC 700 | SIL Open Font License 1.1 | `5d8ce425cbe9cc96ab8f60b95ad578647ce58093a6c8d62775143739654a608e` |
| noto-serif-tc-900.woff2 | Noto Serif TC 900 | SIL Open Font License 1.1 | `1d0c83e2c2fb6f292a96f3e54f901bb8e47b64716fc6c326b0da0a7eabc61302` |

2026-11-07 由 Google Fonts CSS2 API 以 `text=` 參數取得的字元子集，只含介面字串用到的字（`web/tank-main.ts`、`web/crew.ts`、`web/tank-weapons.ts`、`web/tank-enemies.ts` 中的 CJK 與標點，加上英數字）。Noto Serif TC 版權屬 Google LLC，授權全文見 https://openfontlicense.org 。

介面新增中文字串後，若新字落在襯線位置（標題、職位名、數字、房間代碼），需重新產生子集：收集上述檔案中的字元，對 `https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@700&text=<URL 編碼字元>`（900 同理）發出帶有現代瀏覽器 User-Agent 的請求，下載回應中的 woff2 並更新本表雜湊。缺字會退回 Songti TC。
