import { BATTLEFIELD, type TankState } from "./tank-core";
import { TEAM_INTEL_SECONDS } from "./tank-settings";

/** A north-up schematic of the playable square, independent of station/mode.
 * Terrain follows tools/blender/build_map.py; only BATTLEFIELD cover is solid.
 */
export function mountBattleNavigation(station: Element) {
  const navigation =
    station.querySelector(".battle-navigation") ||
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
      <g class="navigation-cover" aria-label="固定掩體">${BATTLEFIELD.cover
        .map(
          (cover) =>
            `<rect x="${cover.x - cover.width / 2}" y="${cover.z - cover.depth / 2}" width="${cover.width}" height="${cover.depth}"/>`,
        )
        .join("")}</g>
      <g class="navigation-player" aria-label="己方位置" transform="translate(0 0)">
        <path class="navigation-hull" aria-label="己方車頭" d="M0 -3.8L2.7 3L0 1.7L-2.7 3Z" transform="rotate(0)"/>
        <path class="navigation-gun" aria-label="主炮方向" d="M0 0V-9" transform="rotate(0)"/>
      </g>
      <g class="navigation-contacts" aria-label="隊伍觀測敵車"></g>
    </svg><p class="navigation-legend" aria-label="箭頭代表車頭，細線代表主炮；實心點為目前觀測，空心點為最後已知，舊情報約五秒淡出"><span><svg aria-hidden="true" viewBox="-4 -4 8 8"><path class="navigation-hull" d="M0 -3L2.4 3L0 1.5L-2.4 3Z"/></svg>車頭</span><span><svg aria-hidden="true" viewBox="-4 -4 8 8"><path class="navigation-gun" d="M0 3V-3"/></svg>主炮</span><span><svg aria-hidden="true" viewBox="-4 -4 8 8"><rect class="navigation-enemy-key" x="-3.5" y="-1.5" width="3" height="3"/><rect class="navigation-stale-key" x="0.5" y="-1.5" width="3" height="3"/></svg>現／舊</span></p><p class="navigation-scale">地形示意 · 84 × 84 m</p>`;
}

/** SVG's positive rotation is clockwise; world -z is north (SVG's top). */
export function presentBattleNavigation(
  root: ParentNode,
  state: Pick<TankState, "tank" | "turret" | "intel" | "time">,
) {
  const player = root.querySelector(".navigation-player");
  if (!player) return;
  const degrees = (yaw: number) => (((yaw * 180) / Math.PI) % 360).toFixed(1);
  player.setAttribute(
    "transform",
    `translate(${state.tank.x.toFixed(2)} ${state.tank.z.toFixed(2)})`,
  );
  player
    .querySelector(".navigation-hull")!
    .setAttribute("transform", `rotate(${degrees(state.tank.yaw)})`);
  player
    .querySelector(".navigation-gun")!
    .setAttribute(
      "transform",
      `rotate(${degrees(state.tank.yaw + state.turret.yaw)})`,
    );
  const contacts = root.querySelector(".navigation-contacts");
  if (contacts) {
    const living = state.intel.contacts.filter((c) => c.hp > 0);
    const ids = new Set(living.map((c) => String(c.id)));
    for (const marker of contacts.querySelectorAll(".navigation-enemy"))
      if (!ids.has(marker.getAttribute("data-contact")!)) marker.remove();
    for (const contact of living) {
      let marker = contacts.querySelector(`[data-contact="${contact.id}"]`);
      if (!marker) {
        marker = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        marker.classList.add("navigation-enemy");
        marker.setAttribute("data-contact", String(contact.id));
        marker.setAttribute("width", "2.8");
        marker.setAttribute("height", "2.8");
        contacts.appendChild(marker);
      }
      marker.setAttribute("x", (contact.x - 1.4).toFixed(2));
      marker.setAttribute("y", (contact.z - 1.4).toFixed(2));
      marker.setAttribute(
        "data-observation",
        contact.visible ? "current" : "stale",
      );
      marker.setAttribute(
        "opacity",
        contact.visible
          ? "1"
          : (
              1 -
              (state.time - contact.observedAt) / TEAM_INTEL_SECONDS
            ).toFixed(3),
      );
      marker.setAttribute(
        "aria-label",
        `${contact.visible ? "觀測敵車" : "最後已知敵車"} ${contact.kind === "panzer" ? "四號 H 型" : "虎式 I 型"}`,
      );
    }
  }
}
