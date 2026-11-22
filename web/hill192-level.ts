import pasture from "./levels/hill192-pasture-height.json" with { type: "json" };
import dem from "./levels/hill192-dem.json" with { type: "json" };
import type { OccupationLevel } from "./tank-occupation";
import { terrainHeightAt, type TerrainHeightGrid } from "./tank-terrain";

type MapPoint = readonly [x: number, z: number];

interface Road {
  readonly width: number;
  readonly cut: number;
  readonly points: readonly MapPoint[];
}

export const HILL_192_LIMIT = (dem.spacing * (dem.size - 1)) / 2;
export const HILL_192_DATUM = 167;

export const HILL_192_ROADS: readonly Road[] = [
  {
    width: 8,
    cut: 0.55,
    points: [
      [-117, -300],
      [-112, -180],
      [-110, -75],
      [-110, 95],
      [-106, 180],
      [-96, 300],
    ],
  },
  {
    width: 7.5,
    cut: 0.72,
    points: [
      [-110, -75],
      [-176, -107],
      [-228, -69],
      [-239, -18],
      [-229, 37],
      [-190, 92],
      [-110, 95],
    ],
  },
  {
    width: 7,
    cut: 0.4,
    points: [
      [-229, 37],
      [-262, 55],
      [-300, 71],
    ],
  },
  {
    width: 8,
    cut: 0.42,
    points: [
      [-110, 95],
      [-53, 108],
      [50, 90],
      [153, 114],
      [234, 153],
      [300, 172],
    ],
  },
  {
    width: 7,
    cut: 0.45,
    points: [
      [-110, -75],
      [-58, -112],
      [22, -130],
      [109, -129],
      [151, -87],
      [159, 29],
      [153, 114],
    ],
  },
];

export const HILL_192_FIELDS = [
  { x: -218, z: -187, width: 102, depth: 130, kind: "plough" },
  { x: -294, z: -60, width: 65, depth: 80, kind: "pasture" },
  { x: -207, z: -58, width: 88, depth: 89, kind: "stubble" },
  { x: -206, z: 40, width: 88, depth: 45, kind: "pasture" },
  { x: -211, z: 119, width: 95, depth: 142, kind: "plough" },
  { x: -92, z: -50, width: 113, depth: 128, kind: "stubble" },
  { x: -77, z: 128, width: 119, depth: 100, kind: "pasture" },
  { x: 35, z: -102, width: 111, depth: 121, kind: "plough" },
  { x: 70, z: 130, width: 100, depth: 90, kind: "stubble" },
  { x: 180, z: 45, width: 98, depth: 94, kind: "pasture" },
] as const;

export function roadDistance(x: number, z: number, road: Road) {
  let nearest = Infinity;
  for (let i = 1; i < road.points.length; i++) {
    const [ax, az] = road.points[i - 1];
    const [bx, bz] = road.points[i];
    const dx = bx - ax;
    const dz = bz - az;
    const fraction = Math.max(
      0,
      Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)),
    );
    const offX = x - ax - fraction * dx;
    const offZ = z - az - fraction * dz;
    nearest = Math.min(nearest, offX * offX + offZ * offZ);
  }
  return Math.sqrt(nearest);
}

const survey: TerrainHeightGrid = {
  minX: -HILL_192_LIMIT,
  minZ: -HILL_192_LIMIT,
  spacing: dem.spacing,
  elevations: dem.elevations,
};

// Keep the measured slopes and form shallow farm-road cuts down to the same
// triangles used by simulation. The editable survey remains in metres ASL.
const spacing = dem.spacing / 2;
const size = 2 * (dem.size - 1) + 1;
export const HILL_192_SURVEY_TERRAIN: TerrainHeightGrid = {
  minX: survey.minX,
  minZ: survey.minZ,
  spacing,
  elevations: Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => {
      const x = survey.minX + column * spacing;
      const z = survey.minZ + row * spacing;
      let cut = 0;
      for (const road of HILL_192_ROADS) {
        const shoulder = Math.min(1, roadDistance(x, z, road) / road.width);
        cut = Math.max(cut, road.cut * (1 - shoulder * shoulder));
      }
      return terrainHeightAt(survey, x, z) - HILL_192_DATUM - cut;
    }),
  ),
};

// Unreal Landscape vertices are exported as north-up little-endian G16.
// UE uses (sample - 32768) * 16 / 128 centimetres for this Landscape.
const nativeHeights = Uint8Array.from(atob(pasture.data), (value) =>
  value.charCodeAt(0),
);
const nativeSamples = new DataView(nativeHeights.buffer);
export const HILL_192_TERRAIN: TerrainHeightGrid = {
  minX: -HILL_192_LIMIT,
  minZ: -HILL_192_LIMIT,
  spacing: (2 * HILL_192_LIMIT) / (pasture.side - 1),
  elevations: Array.from({ length: pasture.side }, (_, row) =>
    Array.from(
      { length: pasture.side },
      (_, column) =>
        (nativeSamples.getUint16(2 * (row * pasture.side + column), true) -
          32768) /
        800,
    ),
  ),
};

const roughCover = [
  { x: -85, z: 68, width: 18, depth: 3.5, height: 2 },
  { x: -208, z: 10, width: 4, depth: 24, height: 2.5 },
  { x: -160, z: 126, width: 7, depth: 5, height: 3.1 },
  { x: -71, z: 155, width: 16, depth: 3.5, height: 2 },
  { x: 22, z: -105, width: 7, depth: 6, height: 3.8 },
  { x: 98, z: 163, width: 22, depth: 3, height: 2 },
];

function coverBase(
  terrain: TerrainHeightGrid,
  box: (typeof roughCover)[number],
) {
  const heights: number[] = [];
  for (const u of [-0.5, -0.25, 0, 0.25, 0.5])
    for (const v of [-0.5, -0.25, 0, 0.25, 0.5])
      heights.push(
        terrainHeightAt(terrain, box.x + box.width * u, box.z + box.depth * v),
      );
  return Math.min(...heights);
}

export function hill192Cover(terrain: TerrainHeightGrid) {
  return roughCover.map((box) => ({ ...box, y: coverBase(terrain, box) }));
}

export const HILL_192_LEVEL: OccupationLevel = {
  id: "hill-192",
  battlefield: {
    limit: HILL_192_LIMIT,
    tankRadius: 3.4,
    terrain: HILL_192_TERRAIN,
    cover: hill192Cover(HILL_192_TERRAIN),
  },
  spawn: { x: -110, z: -75, yaw: Math.PI },
  zone: { x: -110, z: 95, radius: 18 },
  captureSeconds: 12,
  decayPerSecond: 0.12,
  enemies: [
    { kind: "panzer", x: -110, z: 125, yaw: 0, deployment: { mode: "guard" } },
    { kind: "tiger", x: -137, z: 149, yaw: 0, deployment: { mode: "guard" } },
    { kind: "panzer", x: -83, z: 144, yaw: 0, deployment: { mode: "guard" } },
    {
      kind: "panzer",
      x: 70,
      z: 105,
      yaw: Math.PI / 2,
      deployment: {
        mode: "patrol",
        points: [
          { x: 148, z: 118 },
          { x: 120, z: 151 },
          { x: 52, z: 145 },
          { x: 70, z: 105 },
        ],
      },
    },
  ],
};
