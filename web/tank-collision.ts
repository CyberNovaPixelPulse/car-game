export interface HullImpact {
  id: number;
  at: number;
  heading: number;
  normalSpeed: number;
}

export function validHullImpact(
  impact: HullImpact | null | undefined,
  now: number,
) {
  return (
    impact === null ||
    (!!impact &&
      Number.isSafeInteger(impact.id) &&
      impact.id > 0 &&
      Number.isFinite(impact.at) &&
      impact.at >= 0 &&
      impact.at <= now &&
      Number.isFinite(impact.heading) &&
      Number.isFinite(impact.normalSpeed) &&
      impact.normalSpeed >= 0)
  );
}

interface Point {
  x: number;
  z: number;
}
interface Obstacle extends Point {
  width: number;
  depth: number;
}

/** Normal into the blocking face. Both axes of a rejected move still stop. */
export function collisionHeading(
  from: Point,
  x: number,
  z: number,
  radius: number,
  limit: number,
  cover?: Obstacle,
) {
  const dx = x - from.x;
  const dz = z - from.z;
  // For a rectangle entry, the later slab entry is the contacted face.
  // At the edge of the map we exit an enclosing rectangle, so the first exit wins.
  const signX = Math.sign(dx);
  const signZ = Math.sign(dz);
  const faceX = cover
    ? cover.x - signX * (cover.width / 2 + radius)
    : signX * (limit - radius);
  const faceZ = cover
    ? cover.z - signZ * (cover.depth / 2 + radius)
    : signZ * (limit - radius);
  const parallel = cover ? -Infinity : Infinity;
  const tx = dx ? (faceX - from.x) / dx : parallel;
  const tz = dz ? (faceZ - from.z) / dz : parallel;
  const acrossX = cover ? tx > tz : tx < tz;
  return acrossX ? (signX * Math.PI) / 2 : signZ > 0 ? Math.PI : 0;
}
