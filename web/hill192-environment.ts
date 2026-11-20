import * as THREE from "three";
import {
  HILL_192_FIELDS,
  HILL_192_LEVEL,
  HILL_192_ROADS,
  HILL_192_TERRAIN,
  roadDistance,
} from "./hill192-level";
import { terrainHeightAt } from "./tank-terrain";

const colours = {
  meadow: new THREE.Color(0x66764d),
  plough: new THREE.Color(0x665640),
  pasture: new THREE.Color(0x526849),
  stubble: new THREE.Color(0x8b8155),
  lane: new THREE.Color(0x77674e),
  verge: new THREE.Color(0x878265),
};

function terrainGeometry() {
  const grid = HILL_192_TERRAIN;
  const rows = grid.elevations.length;
  const columns = grid.elevations[0].length;
  const positions = new Float32Array(rows * columns * 3);
  const colourData = new Float32Array(positions.length);
  const triangles: number[] = [];
  const colour = new THREE.Color();
  for (let row = 0; row < rows; row++) {
    const z = grid.minZ + row * grid.spacing;
    for (let column = 0; column < columns; column++) {
      const x = grid.minX + column * grid.spacing;
      const index = row * columns + column;
      positions.set([x, grid.elevations[row][column], z], index * 3);
      const field = HILL_192_FIELDS.find(
        (f) =>
          Math.abs(x - f.x) <= f.width / 2 && Math.abs(z - f.z) <= f.depth / 2,
      );
      colour.copy(field ? colours[field.kind] : colours.meadow);
      const pattern = Math.sin(x * 0.051 + z * 0.07) * 0.025;
      const furrow = field?.kind === "plough" ? 0.05 * Math.sin(x * 0.38) : 0;
      colour.multiplyScalar(0.94 + pattern + furrow);
      for (const road of HILL_192_ROADS) {
        const width = roadDistance(x, z, road);
        const shoulder =
          1 - THREE.MathUtils.smoothstep(width, road.width / 2, road.width);
        colour.lerp(colours.verge, shoulder * 0.75);
      }
      colourData.set([colour.r, colour.g, colour.b], index * 3);
      if (row + 1 < rows && column + 1 < columns)
        triangles.push(
          index,
          index + columns,
          index + 1,
          index + 1,
          index + columns,
          index + columns + 1,
        );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colourData, 3));
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  return geometry;
}

function roadGeometry() {
  const positions: number[] = [];
  const triangles: number[] = [];
  const point = (x: number, z: number) =>
    positions.push(x, terrainHeightAt(HILL_192_TERRAIN, x, z) + 0.1, z);
  const columns = 5;
  for (const road of HILL_192_ROADS) {
    for (let index = 1; index < road.points.length; index++) {
      const [ax, az] = road.points[index - 1];
      const [bx, bz] = road.points[index];
      const length = Math.hypot(bx - ax, bz - az);
      const offsetX = ((bz - az) * road.width) / 2 / length;
      const offsetZ = ((ax - bx) * road.width) / 2 / length;
      const steps = Math.ceil(length / 1.5);
      for (let step = 0; step <= steps; step++) {
        const x = THREE.MathUtils.lerp(ax, bx, step / steps);
        const z = THREE.MathUtils.lerp(az, bz, step / steps);
        const next = positions.length / 3;
        for (let column = 0; column < columns; column++) {
          const across = 1 - (column * 2) / (columns - 1);
          point(x + offsetX * across, z + offsetZ * across);
          if (step === 0 || column === 0) continue;
          const here = next + column;
          triangles.push(
            here - columns - 1,
            here - columns,
            here - 1,
            here - columns,
            here,
            here - 1,
          );
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildHill192(scene: THREE.Scene) {
  const terrain = new THREE.Mesh(
    terrainGeometry(),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
  );
  terrain.receiveShadow = true;
  scene.add(terrain);

  const lanes = new THREE.Mesh(
    roadGeometry(),
    new THREE.MeshStandardMaterial({
      color: colours.lane,
      roughness: 1,
    }),
  );
  lanes.receiveShadow = true;
  scene.add(lanes);

  const coverMaterial = new THREE.MeshStandardMaterial({
    color: 0x858075,
    roughness: 1,
  });
  for (const box of HILL_192_LEVEL.battlefield.cover) {
    const cover = new THREE.Mesh(
      new THREE.BoxGeometry(box.width, box.height, box.depth),
      coverMaterial,
    );
    cover.position.set(box.x, (box.y ?? 0) + box.height / 2, box.z);
    cover.castShadow = cover.receiveShadow = true;
    scene.add(cover);
  }

  const { x, z, radius } = HILL_192_LEVEL.zone;
  const marks = [];
  for (let i = 0; i < 96; i++) {
    const angle = (i * Math.PI) / 48;
    const mx = x + Math.cos(angle) * radius;
    const mz = z + Math.sin(angle) * radius;
    marks.push(
      new THREE.Vector3(
        mx,
        terrainHeightAt(HILL_192_TERRAIN, mx, mz) + 0.15,
        mz,
      ),
    );
  }
  scene.add(
    new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(marks),
      new THREE.LineBasicMaterial({ color: 0xe7c574 }),
    ),
  );
}
