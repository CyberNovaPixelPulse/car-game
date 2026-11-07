import { BATTLEFIELD } from "./tank-core";

/** A north-up schematic of the playable square, independent of station/mode.
 * Terrain follows tools/blender/build_map.py; only BATTLEFIELD cover is solid.
 */
export function mountBattleNavigation(station: Element) {
  const navigation = station.querySelector(".battle-navigation") ||
    station.appendChild(document.createElement("aside"));
  navigation.classList.add("battle-navigation");
  navigation.setAttribute("aria-label", "共用戰場導航");
  const limit = BATTLEFIELD.limit;
  navigation.innerHTML = `<div class="navigation-heading"><strong>戰場導航</strong><span><svg aria-hidden="true" viewBox="0 0 10 14"><path d="M5 13V2M1 6l4-4 4 4"/></svg>北</span></div>
    <svg class="navigation-map" role="img" aria-label="北方固定朝上的戰場導航" viewBox="${-limit} ${-limit} ${limit * 2} ${limit * 2}">
      <g aria-label="地形示意">
        <rect class="navigation-ground" x="${-limit}" y="${-limit}" width="${limit * 2}" height="${limit * 2}"/>
        <rect class="navigation-plough" x="-39.5" y="-42" width="25" height="36"/>
        <rect class="navigation-stubble" x="16" y="-13" width="24" height="42"/>
        <rect class="navigation-pasture" x="-39" y="14" width="26" height="20"/>
        <path class="navigation-lane" d="M0 46V2L5 -7L10 -15L10.5 -34L8 -46"/>
      </g>
      <g class="navigation-cover" aria-label="固定掩體">${BATTLEFIELD.cover.map(
        (cover) => `<rect x="${cover.x - cover.width / 2}" y="${cover.z - cover.depth / 2}" width="${cover.width}" height="${cover.depth}"/>`,
      ).join("")}</g>
      <g class="navigation-player" aria-label="己方位置" transform="translate(0 0)">
        <path class="navigation-hull" aria-label="己方車頭" d="M0 -3.8L2.7 3L0 1.7L-2.7 3Z" transform="rotate(0)"/>
        <path class="navigation-gun" aria-label="主炮方向" d="M0 0V-9" transform="rotate(0)"/>
      </g>
    </svg><p class="navigation-legend">箭頭 車頭 · 細線 主炮</p><p class="navigation-scale">地形示意 · 84 × 84 m</p>`;
}
