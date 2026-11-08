# 字型來源

| 檔案 | 字族／字重 | 授權 | SHA-256 |
|---|---|---|---|
| noto-serif-tc-700.woff2 | Noto Serif TC 700 | SIL Open Font License 1.1 | `2d0c104b66a0954187f8a13aed9d6d4d390f01db31976c526e1a7f4cdedf0d19` |
| noto-serif-tc-900.woff2 | Noto Serif TC 900 | SIL Open Font License 1.1 | `7cfefc8f94a939cd12c2cc3d548a0523f1e91b62fdeca1f9bfa7c03b78d3f7aa` |

2026-11-08 由 Google Fonts CSS2 API 以 `text=` 參數取得的字元子集，只含介面字串用到的字（`web/tank-main.ts`、`web/crew.ts`、`web/tank-weapons.ts`、`web/tank-enemies.ts`、`web/tank-station.ts` 中的 CJK 與標點，加上 ASCII 字元，並保留上一版子集的既有碼位）。Noto Serif TC 版權屬 Google LLC，授權全文見 https://openfontlicense.org 。

介面新增中文字串後，若新字落在襯線位置（標題、職位名、數字、房間代碼），需重新產生子集：收集上述檔案中的字元，對 `https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@700&text=<URL 編碼字元>`（900 同理）發出帶有現代瀏覽器 User-Agent 的請求，下載回應中的 woff2 並更新本表雜湊。缺字會退回 Songti TC。

本次子集各含 452 個 Unicode 碼位，補齊新維修模式使用的「維、修」；全部 395 個既有碼位的字形輪廓、水平／垂直進位與行高資料均保持相同。字型家族與字重不變，兩檔版本均為 Noto Serif TC `2.003-H1`。未來重建時也需保留既有碼位，避免刪去不在當前字串清單中的原有字元。

2026-11-09：#45 新增單人練習介面字元，兩字重各含 534 個碼位；保留每檔原有 452 個碼位，逐字核對輪廓、水平進位與行高未改變。來源仍為 Google Fonts 的 Noto Serif TC；新介面字元收集包含練習面板與時速表。
