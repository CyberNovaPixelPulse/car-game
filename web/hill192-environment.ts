import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { disposeArt } from "./tank-art-materials";
import light from "./levels/hill192-light.json" with { type: "json" };
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

export const HILL_192_LIGHT = light;
const ART = "/art/hill192";
const CELL = 56;
const STRIDE = 6;
const partsByKind = {
  oak: ["OakTrunk", "OakCrown", "OakLeafMasses"],
  bocage: ["Bocage"],
  flint: ["Flint"],
  verge: ["Verge"],
  stubble: ["Stubble"],
};

interface LandscapeLayout {
  stride: number;
  placements: Partial<Record<keyof typeof partsByKind, number[]>>;
}

interface LandscapeCell {
  x: number;
  z: number;
  meshes: {
    object: THREE.InstancedMesh;
    distance: number;
    shadow: boolean;
  }[];
}

/** Fade distant low vegetation by cell. Trees keep their crown silhouette
 * into the mist, while fine branch/leaf parts stay close to the player. */
function placeFoliage(
  group: THREE.Group,
  model: THREE.Group,
  layout: LandscapeLayout,
) {
  if (layout.stride !== STRIDE)
    throw new Error("不符的 192 高地植被資料格式。");
  model.updateMatrixWorld(true);
  const cells = new Map<string, LandscapeCell>();
  const move = new THREE.Matrix4();
  const rotate = new THREE.Matrix4();
  const scale = new THREE.Matrix4();
  const tint = new THREE.Color();
  for (const [kind, names] of Object.entries(partsByKind)) {
    const rows = layout.placements[kind as keyof typeof partsByKind];
    if (!rows || rows.length % STRIDE !== 0)
      throw new Error(`缺少 192 高地的植被分布 ${kind}。`);
    const parts: { name: string; mesh: THREE.Mesh }[] = [];
    for (const name of names) {
      const objects = model.getObjectByName(name);
      if (!objects) throw new Error(`缺少 192 高地模型 ${name}。`);
      objects.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        if (kind === "verge" || kind === "stubble" || name === "OakCrown")
          for (const material of materials) material.side = THREE.DoubleSide;
        parts.push({ name, mesh: object });
      });
    }
    const starts = new Map<string, number[]>();
    for (let i = 0; i < rows.length; i += STRIDE) {
      const column = Math.floor(rows[i] / CELL);
      const row = Math.floor(rows[i + 2] / CELL);
      const key = `${column}:${row}`;
      if (!cells.has(key)) {
        cells.set(key, {
          x: (column + 0.5) * CELL,
          z: (row + 0.5) * CELL,
          meshes: [],
        });
      }
      if (!starts.has(key)) starts.set(key, []);
      starts.get(key)!.push(i);
    }
    for (const [key, indices] of starts) {
      for (const { name, mesh } of parts) {
        const instance = new THREE.InstancedMesh(
          mesh.geometry,
          mesh.material,
          indices.length,
        );
        indices.forEach((start, number) => {
          const [x, y, z, yaw, size, variation] = rows.slice(
            start,
            start + STRIDE,
          );
          move
            .makeTranslation(x, y, z)
            .multiply(rotate.makeRotationY(yaw))
            .multiply(scale.makeScale(size, size, size))
            .multiply(mesh.matrixWorld);
          instance.setMatrixAt(number, move);
          instance.setColorAt(
            number,
            tint.setRGB(variation, variation, variation),
          );
        });
        instance.computeBoundingSphere();
        instance.receiveShadow = true;
        group.add(instance);
        cells.get(key)!.meshes.push({
          object: instance,
          distance:
            name === "OakLeafMasses"
              ? Infinity
              : kind === "oak"
                ? 196
                : kind === "bocage"
                  ? 220
                  : kind === "flint"
                    ? 95
                    : 71,
          shadow: kind === "oak" || kind === "bocage",
        });
      }
    }
  }
  return [...cells.values()];
}

/** Terrain beyond the actual play bounds is visible across the valley. The
 * inner ring uses every survey border point, so its seam cannot open. */
function terrainSkirt() {
  const grid = HILL_192_TERRAIN;
  const steps = grid.elevations.length - 1;
  const edge = (steps * grid.spacing) / 2;
  const sides = [
    (t: number) => [-edge, t],
    (t: number) => [t, edge],
    (t: number) => [edge, -t],
    (t: number) => [-t, -edge],
  ];
  const contour = sides.flatMap((side) =>
    Array.from({ length: steps }, (_, i) => side(-edge + i * grid.spacing)),
  );
  const positions: number[] = [];
  const tint: number[] = [];
  const triangles: number[] = [];
  const rings = [1, 1.05, 1.14, 1.3, 1.52, 1.78];
  rings.forEach((radius, ring) => {
    contour.forEach(([x, z], i) => {
      const progress = radius - 1;
      const ground = terrainHeightAt(grid, x, z);
      const hills =
        Math.sin(x * 0.022 + z * 0.013) * 7 +
        Math.cos(x * 0.015 - z * 0.023) * 4 -
        2.4;
      positions.push(x * radius, ground + hills * progress, z * radius);
      const { r, g, b } = colours.meadow;
      tint.push(r, g, b);
      if (!ring) return;
      const n = contour.length;
      const current = ring * n + i;
      const next = ring * n + ((i + 1) % n);
      triangles.push(current - n, current, next - n, next - n, current, next);
    });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(tint, 3));
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  return geometry;
}

function texturedGround(
  weights: THREE.Texture,
  rocks: THREE.Texture,
  grass: THREE.Texture,
  soil: THREE.Texture,
  mud: THREE.Texture,
  stone: THREE.Texture,
) {
  const material = new THREE.MeshStandardMaterial({ roughness: 0.94 });
  material.customProgramCacheKey = () => "hill192-ground-v1";
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      authoredWeights: { value: weights },
      flintWeights: { value: rocks },
      patchGrass: { value: grass },
      patchSoil: { value: soil },
      patchMud: { value: mud },
      patchRock: { value: stone },
    });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 landXZ;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nlandXZ = (modelMatrix * vec4(position, 1.0)).xz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 landXZ;
uniform sampler2D authoredWeights, flintWeights, patchGrass, patchSoil, patchMud, patchRock;`,
      )
      .replace(
        "#include <map_fragment>",
        `
vec2 land = landXZ;
vec2 mapUV = vec2(land.x, -land.y) / 600.0 + 0.5;
vec3 weights = texture2D(authoredWeights, mapUV).rgb;
vec3 grass = texture2D(patchGrass, land / 2.8).rgb;
float fieldDrift = texture2D(patchGrass, land / 95.0).r;
vec3 meadow = grass * vec3(0.75, 1.02, 0.58) + vec3(0.018, 0.030, 0.006);
meadow *= mix(0.88, 1.12, smoothstep(0.03, 0.38, fieldDrift));
vec3 cropped = meadow * vec3(0.74, 0.86, 0.71);
vec3 stubble = grass * vec3(1.38, 1.16, 0.65) + vec3(0.035, 0.023, 0.004);
stubble *= 0.91 + 0.11 * sin(land.x * 10.5 - land.y * 0.28);
vec3 bare = texture2D(patchSoil, land / 3.8).rgb * vec3(1.09, 0.984, 0.86);
float furrow = 0.5 + 0.5 * sin(land.x * 7.8 + land.y * 0.36);
bare *= mix(0.72, 1.10, smoothstep(0.10, 0.9, furrow));
vec3 field = mix(meadow, cropped, smoothstep(0.08, 0.31, weights.r));
field = mix(field, stubble, smoothstep(0.41, 0.67, weights.r));
field = mix(field, bare, smoothstep(0.76, 0.98, weights.r));
vec3 damp = texture2D(patchMud, land / 4.1).rgb;
vec3 lane = damp * vec3(1.03, 0.91, 0.77) + vec3(0.047, 0.032, 0.015);
lane = mix(lane, damp * vec3(0.67, 0.61, 0.5), weights.b * 0.94);
vec3 flint = texture2D(patchRock, land / 1.7).rgb * vec3(1.04, 1.02, 0.94);
diffuseColor.rgb *= mix(mix(field, lane, weights.g), flint, texture2D(flintWeights, mapUV).r * 0.86);
`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        "float roughnessFactor = mix(roughness, 0.38, weights.g * weights.b);",
      );
  };
  return material;
}

function masonryGeometry(width: number, height: number, depth: number) {
  const box = new THREE.BoxGeometry(width, height, depth);
  const points = box.getAttribute("position");
  const normal = box.getAttribute("normal");
  const uv = box.getAttribute("uv");
  // Tile in metres. Exact silhouette corresponds to the authority cover.
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i);
    const y = points.getY(i);
    const z = points.getZ(i);
    uv.setXY(
      i,
      (Math.abs(normal.getX(i)) > 0.5 ? z : x) / 3,
      (Math.abs(normal.getY(i)) > 0.5 ? z : y) / 3,
    );
  }
  return box;
}

export function buildHill192(
  scene: THREE.Scene,
  signal: AbortSignal,
  manager: THREE.LoadingManager,
) {
  const group = new THREE.Group();
  group.name = "Hill 192";
  const groundMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.94,
  });
  const terrain = new THREE.Mesh(terrainGeometry(), groundMaterial);
  const horizon = new THREE.Mesh(terrainSkirt(), groundMaterial);
  terrain.receiveShadow = horizon.receiveShadow = true;
  group.add(terrain, horizon);
  const masonry = new THREE.MeshStandardMaterial({
    color: 0x858075,
    roughness: 1,
  });
  for (const cover of HILL_192_LEVEL.battlefield.cover) {
    const wall = new THREE.Mesh(
      masonryGeometry(cover.width, cover.height, cover.depth),
      masonry,
    );
    wall.position.set(cover.x, (cover.y ?? 0) + cover.height / 2, cover.z);
    wall.castShadow = wall.receiveShadow = true;
    group.add(wall);
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
  group.add(
    new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(marks),
      new THREE.LineBasicMaterial({ color: 0xe7c574 }),
    ),
  );
  scene.add(group);

  let cells: LandscapeCell[] = [];
  let lastX = Infinity;
  let lastZ = Infinity;
  const update = (x: number, z: number) => {
    if (Math.hypot(lastX - x, lastZ - z) < 9) return;
    lastX = x;
    lastZ = z;
    for (const cell of cells) {
      const distance = Math.hypot(cell.x - x, cell.z - z);
      for (const { object, distance: range, shadow } of cell.meshes) {
        object.visible = distance <= range;
        object.castShadow = shadow && distance < 95;
      }
    }
  };
  const textures: THREE.Texture[] = [];
  const roots = new Set<THREE.Object3D>([group]);
  let released = false;
  signal.addEventListener(
    "abort",
    () => {
      released = true;
      group.removeFromParent();
      disposeArt([...roots], { textures });
      textures.length = 0;
      roots.clear();
      cells = [];
    },
    { once: true },
  );

  const loader = new THREE.TextureLoader();
  const texture = (url: string, colorSpace: string = THREE.SRGBColorSpace) =>
    loader.loadAsync(url).then((texture) => {
      if (released) texture.dispose();
      else textures.push(texture);
      texture.colorSpace = colorSpace;
      texture.wrapS = texture.wrapT = colorSpace
        ? THREE.RepeatWrapping
        : THREE.ClampToEdgeWrapping;
      texture.anisotropy = 4;
      return texture;
    });
  const photo = (name: string) => texture(`/art/terrain/${name}_diff_1k.jpg`);
  const key = `${ART}/vegetation.glb`;
  manager.itemStart(key);
  void Promise.all([
    texture(`${ART}/ground-weights.png`, THREE.NoColorSpace),
    texture(`${ART}/flint-weights.png`, THREE.NoColorSpace),
    photo("leafy_grass"),
    photo("farm_soil"),
    photo("muddy_tracks"),
    photo("old_stone_wall_02"),
    new GLTFLoader().loadAsync(key).then(({ scene: model }) => {
      if (released) disposeArt(model);
      else roots.add(model);
      return model;
    }),
    fetch(`${ART}/layout.json`, { signal }).then(async (response) => {
      if (!response.ok)
        throw new Error(`無法下載 192 高地植被分布（${response.status}）。`);
      return (await response.json()) as LandscapeLayout;
    }),
  ])
    .then(([weights, rocks, grass, soil, mud, stone, model, layout]) => {
      if (released) return;
      cells = placeFoliage(group, model, layout);
      terrain.material = horizon.material = texturedGround(
        weights,
        rocks,
        grass,
        soil,
        mud,
        stone,
      );
      groundMaterial.dispose();
      masonry.map = stone;
      masonry.color.setHex(0xd3c7af);
      masonry.needsUpdate = true;
      lastX = Infinity;
    })
    .catch((error: unknown) => {
      if (!signal.aborted)
        console.warn("192 高地素材無法載入，使用簡易地景。", error);
    })
    .finally(() => manager.itemEnd(key));
  return { update };
}
