import { BATTLEFIELD, type TankState } from "./tank-core";
import type { OccupationLevel } from "./tank-occupation";
import { cannonWorldPose } from "./tank-world-pose";
import { HILL_192_FIELDS, HILL_192_ROADS } from "./hill192-level";
import { terrainHeightAt, type TerrainHeightGrid } from "./tank-terrain";
import { TEAM_INTEL_SECONDS } from "./tank-settings";

/** North-up schematic of the selected battlefield across all three stations. */
export function mountBattleNavigation(
  navigation: HTMLElement,
  occupation?: OccupationLevel,
) {
  navigation.setAttribute("aria-label", "共用戰場導航");
  const battlefield = occupation?.battlefield;
  const { limit, cover } = battlefield ?? BATTLEFIELD;
  const terrain = battlefield?.terrain;
  const symbolScale = limit / BATTLEFIELD.limit;
  const scale = symbolScale === 1 ? "" : ` scale(${symbolScale})`;
  const zone = occupation?.zone;
  navigation.innerHTML = `<div class="navigation-heading"><strong>戰場導航</strong><span><svg aria-hidden="true" viewBox="0 0 10 14"><path d="M5 13V2M1 6l4-4 4 4"/></svg>北</span></div>
    <svg class="navigation-map" role="img" aria-label="北方固定朝上的戰場導航" viewBox="${-limit} ${-limit} ${limit * 2} ${limit * 2}">
      <g aria-label="地形示意">
        <rect class="navigation-ground" x="${-limit}" y="${-limit}" width="${limit * 2}" height="${limit * 2}"/>
        ${terrain
          ? hill192NavigationTerrain(terrain, limit)
          : `<rect class="navigation-plough" x="-39.5" y="-42" width="25" height="36"/>
            <rect class="navigation-stubble" x="16" y="-13" width="24" height="42"/>
            <rect class="navigation-pasture" x="-39" y="14" width="26" height="20"/>
            <path class="navigation-lane" d="M0 46V2L5 -7L10 -15L10.5 -34L8 -46"/>`}
      </g>
      <g class="navigation-cover" aria-label="固定掩體">${cover
        .map(
          (cover) =>
            `<rect x="${cover.x - cover.width / 2}" y="${cover.z - cover.depth / 2}" width="${cover.width}" height="${cover.depth}"/>`,
        )
        .join("")}</g>
      ${zone ? `<circle class="navigation-occupation" cx="${zone.x}" cy="${zone.z}" r="${zone.radius}"><title>192 高地占領區</title></circle>` : ""}
      <g class="navigation-player" aria-label="己方位置" transform="translate(0 0)">
        <path class="navigation-hull" aria-label="己方車頭" d="M0 -3.8L2.7 3L0 1.7L-2.7 3Z" transform="rotate(0)${scale}"/>
        <path class="navigation-gun" aria-label="主炮方向" d="M0 0V-9" transform="rotate(0)${scale}"/>
      </g>
      <g class="navigation-contacts" aria-label="隊伍觀測敵車"></g>
    </svg><p class="navigation-legend" aria-label="箭頭代表車頭，細線代表主炮；實心點為目前觀測，空心點為最後已知，舊情報約五秒淡出"><span><svg aria-hidden="true" viewBox="-4 -4 8 8"><path class="navigation-hull" d="M0 -3L2.4 3L0 1.5L-2.4 3Z"/></svg>車頭</span><span><svg aria-hidden="true" viewBox="-4 -4 8 8"><path class="navigation-gun" d="M0 3V-3"/></svg>主炮</span><span><svg aria-hidden="true" viewBox="-4 -4 8 8"><rect class="navigation-enemy-key" x="-3.5" y="-1.5" width="3" height="3"/><rect class="navigation-stale-key" x="0.5" y="-1.5" width="3" height="3"/></svg>現／舊</span></p><p class="navigation-scale">地形示意 · ${limit * 2} × ${limit * 2} m</p>`;
  const player = navigation.querySelector(".navigation-player")!;
  const hull = player.querySelector(".navigation-hull")!;
  const gun = player.querySelector(".navigation-gun")!;
  const contacts = navigation.querySelector(".navigation-contacts")!;

  /** SVG's positive rotation is clockwise; world -z is north (SVG's top). */
  return (state: Pick<TankState, "tank" | "turret" | "intel" | "time">) => {
    const degrees = (yaw: number) => (((yaw * 180) / Math.PI) % 360).toFixed(1);
    player.setAttribute(
      "transform",
      `translate(${state.tank.x.toFixed(2)} ${state.tank.z.toFixed(2)})`,
    );
    hull.setAttribute("transform", `rotate(${degrees(state.tank.yaw)})${scale}`);
    gun.setAttribute(
      "transform",
      `rotate(${degrees(cannonWorldPose(state.tank, state.turret).yaw)})${scale}`,
    );
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
        marker.setAttribute("width", String(2.8 * symbolScale));
        marker.setAttribute("height", String(2.8 * symbolScale));
        contacts.appendChild(marker);
      }
      marker.setAttribute("x", (contact.x - 1.4 * symbolScale).toFixed(2));
      marker.setAttribute("y", (contact.z - 1.4 * symbolScale).toFixed(2));
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
  };
}

function hill192NavigationTerrain(terrain: TerrainHeightGrid, limit: number) {
  const step = terrain.spacing * 4;
  const tintBands = Array.from({ length: 5 }, () => "");
  for (let z = -limit; z < limit; z += step)
    for (let x = -limit; x < limit; x += step) {
      const height = terrainHeightAt(terrain, x + step / 2, z + step / 2);
      const band = Math.max(0, Math.min(4, Math.floor(height / 5)));
      tintBands[band] += `M${x} ${z}h${step}v${step}h-${step}z`;
    }
  const fields = HILL_192_FIELDS.map(
    (field) =>
      `<rect class="navigation-${field.kind}" x="${field.x - field.width / 2}" y="${field.z - field.depth / 2}" width="${field.width}" height="${field.depth}"/>`,
  ).join("");
  const relief = tintBands.map(
    (d, index) => `<path d="${d}" fill="#e8ddb1" opacity="${index * 0.075}"/>`,
  ).join("");
  const roads = HILL_192_ROADS.map(
    ({ points, width }) =>
      `<polyline class="navigation-hill-road" stroke-width="${width}" points="${points.map((point) => point.join(",")).join(" ")}"/>`,
  ).join("");
  return fields + relief + roads;
}
