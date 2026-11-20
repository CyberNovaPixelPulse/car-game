/** A north-up height field, in game metres, with the same two triangles per
 * cell as the visible terrain. Rows increase southwards and columns eastwards. */
export interface TerrainHeightGrid {
  readonly minX: number;
  readonly minZ: number;
  readonly spacing: number;
  readonly elevations: readonly (readonly number[])[];
}

export function terrainHeightAt(
  terrain: TerrainHeightGrid | undefined,
  x: number,
  z: number,
) {
  if (!terrain) return 0;
  const { minX, minZ, spacing, elevations } = terrain;
  const columns = elevations[0].length;
  const rows = elevations.length;
  const u = Math.max(0, Math.min(columns - 1, (x - minX) / spacing));
  const v = Math.max(0, Math.min(rows - 1, (z - minZ) / spacing));
  const column = Math.min(columns - 2, Math.floor(u));
  const row = Math.min(rows - 2, Math.floor(v));
  const east = u - column;
  const south = v - row;
  const nw = elevations[row][column];
  const ne = elevations[row][column + 1];
  const sw = elevations[row + 1][column];
  const se = elevations[row + 1][column + 1];
  // The NE–SW diagonal is shared by both faces, including at outer edges.
  return east + south <= 1
    ? nw + (ne - nw) * east + (sw - nw) * south
    : se + (sw - se) * (1 - east) + (ne - se) * (1 - south);
}
