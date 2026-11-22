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

/** First contact along a world-space segment. A line is split at grid edges
 * and the shared cell diagonal, so a crest cannot be skipped between samples. */
export function terrainSegmentHit(
  terrain: TerrainHeightGrid | undefined,
  from: readonly number[],
  to: readonly number[],
): number | undefined {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const heightGap = (t: number) =>
    from[1] +
    dy * t -
    terrainHeightAt(terrain, from[0] + dx * t, from[2] + dz * t);
  let previous = 0;
  let gap = heightGap(0);
  if (gap <= 0) return 0;
  const reach = (at: number) => {
    const nextGap = heightGap(at);
    if (nextGap <= 0)
      return previous + ((at - previous) * gap) / (gap - nextGap);
    previous = at;
    gap = nextGap;
  };
  if (!terrain) return reach(1);

  const { minX, minZ, spacing, elevations } = terrain;
  const maxU = elevations[0].length - 1;
  const maxV = elevations.length - 1;
  const u = (from[0] - minX) / spacing;
  const v = (from[2] - minZ) / spacing;
  const du = dx / spacing;
  const dv = dz / spacing;
  const cuts = [0, 1];
  const addGridEdges = (start: number, delta: number, maximum: number) => {
    if (delta === 0) return;
    const end = start + delta;
    const lower = Math.max(0, Math.ceil(Math.min(start, end)));
    const upper = Math.min(maximum, Math.floor(Math.max(start, end)));
    for (let edge = lower; edge <= upper; edge++) {
      const t = (edge - start) / delta;
      if (t > 0 && t < 1) cuts.push(t);
    }
  };
  addGridEdges(u, du, maxU);
  addGridEdges(v, dv, maxV);
  cuts.sort((a, b) => a - b);

  const clampedU = (t: number) => Math.min(maxU, Math.max(0, u + t * du));
  const clampedV = (t: number) => Math.min(maxV, Math.max(0, v + t * dv));
  for (let i = 1; i < cuts.length; i++) {
    const start = cuts[i - 1];
    const end = cuts[i];
    if (end - start < 1e-10) continue;
    const middle = (start + end) / 2;
    const column = Math.min(maxU - 1, Math.floor(clampedU(middle)));
    const row = Math.min(maxV - 1, Math.floor(clampedV(middle)));
    const diagonal = 1 + column + row;
    const a = clampedU(start) + clampedV(start) - diagonal;
    const b = clampedU(end) + clampedV(end) - diagonal;
    if (a * b < 0) {
      const middleHit = reach(start + ((end - start) * a) / (a - b));
      if (middleHit !== undefined) return middleHit;
    }
    const hit = reach(end);
    if (hit !== undefined) return hit;
  }
}
