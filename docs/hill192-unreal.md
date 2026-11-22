# Unreal 192 高地瀏覽器版

從遊戲首頁依序選「單人練習」、「192 高地占領戰」、「開始占領戰」。本機預覽以 `npm run build` 建置，再執行 `npx vite preview --host 127.0.0.1 --port 4312`。選駕駛後按住 W 沿主農路前進，小地圖標示占領區。

來源關卡為 Unreal Engine 5.8.4 的 `/Game/Hill192PastureBlend/Hill192PastureBlend`。瀏覽器版沿用 600 × 600 公尺地形及 505 × 505 頂點。繪圖、坦克貼地、坡度、視線與炮彈接觸共用同一份高度資料。路旁樹木、草叢、田埂、散石、兩處木門、水面及遠坡由場景網格或對應的原始模型與關卡座標重建。

瀏覽器使用 Three.js 重現草地、輪痕、深色濕土和遠田遮罩，並套用 Unreal 場景的太陽方向。樹木以兩段網格顯示，草叢與碎石的密度有下調。Unreal 的材質節點、植被原生風動和水面反射在轉換後會有視覺差異。單人占領戰的可行駛地面和固定掩體參與碰撞，新增的農門、植栽與田埂網格用於畫面。

2026-11-22 以 `b7957e4` 的正式建置在內建瀏覽器試玩，從首頁開局，沿主農路完成 100% 占領並勝利，重開後回到出生點。當次快速檢查及正式建置通過。原始勝利畫面在試玩工作樹的 `output/ue-world/browser-victory.jpg`。

## 重建資產

以下命令從瀏覽器專案根目錄執行。需有 Unreal 專案、該地圖使用的植栽來源及 `Saved/Verification/PastureBlend/T_*.png` 產物。匯出流程只讀取來源地圖。

```sh
unreal_project="/Users/guanyuchen/side-project/car-game-hill192-unreal"
unreal_editor="/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor-Cmd"
stage="$PWD/output/ue-world"
map="/Game/Hill192PastureBlend/Hill192PastureBlend"

mkdir -p "$stage"
HILL192_EXPORT_OUTPUT="$stage/mesh-export" "$unreal_editor" "$unreal_project/Hill192.uproject" \
  -run=pythonscript "-script=$PWD/tools/unreal/export-hill192.py" -nullRHI -unattended
"$unreal_editor" "$unreal_project/Hill192.uproject" -run=BuildHill192 -Moisture \
  "-SourceMap=$map" "-Snapshot=$stage/terrain-export" -nullRHI -unattended
npm install --prefix "$stage" --no-save @gltf-transform/core @gltf-transform/extensions \
  @gltf-transform/functions meshoptimizer sharp
node tools/unreal/pack-hill192.mjs "$stage" "$unreal_project"
npm test
npm run build
```

UV 遮罩轉為北向，網格合併成具 Meshopt 壓縮的 GLB。植栽含透明度的來源貼圖隨 GLB 提供，材質資產和遊戲本體各自打包。[Epic glTF 匯出說明](https://dev.epicgames.com/documentation/unreal-engine/how-the-gltf-exporter-handles-unreal-engine-content)
