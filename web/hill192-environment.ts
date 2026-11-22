import * as THREE from "three";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import light from "./levels/hill192-light.json" with { type: "json" };
import { HILL_192_LEVEL, HILL_192_TERRAIN } from "./hill192-level";
import { disposeArt } from "./tank-art-materials";
import { terrainHeightAt } from "./tank-terrain";

export const HILL_192_LIGHT = light;
const ART = "/art/hill192/pasture-blend";
const CELL = 48;
const TERRAIN_TILE = 63;

interface WorldPart {
  ground: boolean;
  far?: boolean;
  instances: number[][];
}

interface WorldLayout {
  sourceMap: string;
  sun: [number, number, number];
  meshes: Record<string, WorldPart>;
}

interface VisibleBatch {
  object: THREE.InstancedMesh;
  near: number;
  far: number;
  shadow: boolean;
}

interface Cell {
  x: number;
  z: number;
  batches: VisibleBatch[];
}

function terrainTile(west: number, north: number) {
  const grid = HILL_192_TERRAIN;
  const width = grid.elevations[0].length;
  const height = grid.elevations.length;
  const east = Math.min(width - 1, west + TERRAIN_TILE);
  const south = Math.min(height - 1, north + TERRAIN_TILE);
  const stride = east - west + 1;
  const positions = [];
  const normals = [];
  const indices = [];
  for (let row = north; row <= south; row++) {
    for (let column = west; column <= east; column++) {
      const elevation = grid.elevations[row][column];
      positions.push(
        grid.minX + column * grid.spacing,
        elevation,
        grid.minZ + row * grid.spacing,
      );
      const left = Math.max(column - 1, 0);
      const right = Math.min(column + 1, width - 1);
      const above = Math.max(row - 1, 0);
      const below = Math.min(row + 1, height - 1);
      const nx =
        (grid.elevations[row][left] - grid.elevations[row][right]) /
        ((right - left) * grid.spacing);
      const nz =
        (grid.elevations[above][column] - grid.elevations[below][column]) /
        ((below - above) * grid.spacing);
      const length = Math.hypot(nx, 1, nz);
      normals.push(nx / length, 1 / length, nz / length);
      if (column === east || row === south) continue;
      const corner = (row - north) * stride + column - west;
      indices.push(
        corner,
        corner + stride,
        corner + 1,
        corner + 1,
        corner + stride,
        corner + stride + 1,
      );
    }
  }
  return new THREE.BufferGeometry()
    .setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    .setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3))
    .setIndex(indices);
}

const WORLD_POSITION = "varying vec2 landXZ;";

function projectedMaterial(
  key: string,
  uniforms: Record<string, THREE.Texture>,
  map: string,
  roughness: string,
) {
  const material = new THREE.MeshStandardMaterial({
    roughness: 0.91,
    vertexColors: key === "distant",
  });
  material.customProgramCacheKey = () => `hill192-pasture-${key}`;
  material.onBeforeCompile = (shader) => {
    const samplers = Object.keys(uniforms)
      .map((name) => `uniform sampler2D ${name};`)
      .join("\n");
    for (const [name, texture] of Object.entries(uniforms))
      shader.uniforms[name] = { value: texture };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${WORLD_POSITION}`)
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vec4 groundPosition = vec4(position, 1.0);
#ifdef USE_INSTANCING
  groundPosition = instanceMatrix * groundPosition;
#endif
landXZ = (modelMatrix * groundPosition).xz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\n${WORLD_POSITION}\n${samplers}`,
      )
      .replace("#include <color_fragment>", `#include <color_fragment>\n${map}`)
      .replace("#include <roughnessmap_fragment>", roughness);
  };
  return material;
}

function pastureMaterial(textures: Record<string, THREE.Texture>) {
  return projectedMaterial(
    "ground",
    textures,
    `
vec2 maskUV = vec2(landXZ.x, -landXZ.y) / 600.0 + 0.5;
vec3 weights = texture2D(groundMask, maskUV).rgb;
vec3 conditions = texture2D(conditionMask, maskUV).rgb;
vec3 parcels = texture2D(parcelMask, maskUV).rgb;
vec2 metres = vec2(landXZ.y, -landXZ.x);
vec2 drift = vec2(
  .75*sin(dot(metres, vec2(.43,.19))) + .39*cos(dot(metres, vec2(-.24,.71))),
  .69*sin(dot(metres, vec2(.31,-.47))) + .44*cos(dot(metres, vec2(.62,.32)))
);
vec2 phase = metres + drift;
vec2 grassUV = vec2(dot(phase, vec2(.848,.530)), dot(phase, vec2(-.530,.848))) / 2.85;
vec3 grass = texture2D(meadowPhoto, grassUV).rgb * vec3(.74,.99,.65);
float meadow = parcels.b * 2.0 - 1.0;
grass *= 1.0 + meadow * (1.0 - max(conditions.r,conditions.g)) * vec3(.15,.275,.225);
vec3 dryGrass = grass * vec3(1.30,1.18,.81) + vec3(.012,.005,.001);
grass = mix(grass, dryGrass, conditions.b * (.8 - .1*meadow));
vec3 soil = texture2D(soilPhoto, (metres + drift * (1.0 - weights.g)) / 4.05).rgb * vec3(1.03,.95,.82);
vec3 field = mix(grass, soil, weights.r);
field = mix(field, dryGrass * vec3(1.25,1.06,.76), parcels.r * .66);
field *= mix(vec3(1.0), vec3(.55,.68,.55), parcels.g * .58);
vec3 lane = texture2D(mudPhoto, metres / 4.05).rgb * vec3(1.23,1.12,.97) + vec3(.032,.025,.017);
vec3 flint = texture2D(stonePhoto, metres / 1.9).rgb * vec3(.91,.96,.88);
vec3 surface = mix(mix(field,lane,weights.g),flint,weights.b*.78);
surface *= mix(vec3(1.0),vec3(.52,.57,.56),conditions.g * .84);
surface *= mix(vec3(1.0),vec3(.60,.61,.59),conditions.r * .69);
diffuseColor.rgb *= surface;`,
    `
float roughnessFactor = mix(roughness, .37, max(conditions.g, conditions.r * .45));`,
  );
}

function distantMaterial(texture: THREE.Texture) {
  return projectedMaterial(
    "distant",
    { distantMask: texture },
    `
vec2 atlasUV = (landXZ - vec2(-1550.,-975.)) / vec2(2950.,1975.);
atlasUV.y = 1.0 - atlasUV.y;
vec3 fields = texture2D(distantMask,atlasUV).rgb;
float outer = max(abs(landXZ.x),abs(landXZ.y)) - 300.;
diffuseColor.rgb = mix(diffuseColor.rgb,fields,.89*smoothstep(17.,86.,outer));`,
    "#include <roughnessmap_fragment>",
  );
}

function matrixFromUnreal(values: number[], matrix: THREE.Matrix4) {
  if (values.length !== 12) throw new Error("192 高地的物件座標格式不符。");
  return matrix.set(
    values[0],
    values[3],
    values[6],
    values[9],
    values[1],
    values[4],
    values[7],
    values[10],
    values[2],
    values[5],
    values[8],
    values[11],
    0,
    0,
    0,
    1,
  );
}

function rangeFor(name: string) {
  if (/RoadGrass|Stubble|Flint|Sedge|GrassShoulder|IvyToe|Verge/.test(name))
    return 78;
  if (name === "SM_OakLeaves") return 76;
  return 260;
}

function putWorldObjects(
  group: THREE.Group,
  library: THREE.Group,
  layout: WorldLayout,
  ground: THREE.Material,
  horizon: THREE.Material,
  stone: THREE.Texture,
) {
  if (layout.sourceMap !== "/Game/Hill192PastureBlend/Hill192PastureBlend")
    throw new Error("192 高地的場景來源不符。");
  const cells = new Map<string, Cell>();
  const transform = new THREE.Matrix4();
  const lowGround = new THREE.MeshStandardMaterial({
    color: 0x7e8355,
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 1,
  });
  const oldCanopy = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.94,
  });
  const stoneMaterial = new THREE.MeshStandardMaterial({
    color: 0xb2a78e,
    map: stone,
    roughness: 0.89,
  });
  const water = new THREE.MeshStandardMaterial({
    color: 0x615a40,
    metalness: 0.34,
    roughness: 0.18,
    transparent: true,
    opacity: 0.87,
    depthWrite: false,
  });
  library.updateMatrixWorld(true);
  for (const [name, part] of Object.entries(layout.meshes)) {
    const prototype = library.getObjectByName(name);
    if (!prototype) throw new Error(`缺少 192 高地物件 ${name}。`);
    const isTerrain = part.ground;
    const waterSurface = name === "SM_WaterSurface";
    const cellPlacements = new Map<string, number[][]>();
    for (const pose of part.instances) {
      const x = Math.floor(pose[9] / CELL);
      const z = Math.floor(pose[11] / CELL);
      const key = `${x}:${z}`;
      if (!cells.has(key))
        cells.set(key, {
          x: (x + 0.5) * CELL,
          z: (z + 0.5) * CELL,
          batches: [],
        });
      let poses = cellPlacements.get(key);
      if (!poses) cellPlacements.set(key, (poses = []));
      poses.push(pose);
    }

    const levels = part.far
      ? [
          { node: prototype, near: 0, far: 96 },
          {
            node: library.getObjectByName(name + "_far"),
            near: 96,
            far: rangeFor(name),
          },
        ]
      : [{ node: prototype, near: 0, far: rangeFor(name) }];
    for (const { node, near, far } of levels) {
      if (!node) throw new Error(`缺少 192 高地遠景物件 ${name}。`);
      // Fine ground cover has a single useful visibility band.
      if (near >= far) continue;
      node.traverse((mesh) => {
        if (!(mesh instanceof THREE.Mesh)) return;
        let material = mesh.material;
        if (isTerrain) material = name.includes("Relief") ? horizon : ground;
        else if (waterSurface) material = water;
        else if (name.includes("Flint") || name === "SM_FieldEdgeStone")
          material = stoneMaterial;
        else if (name.startsWith("SM_Oak")) material = oldCanopy;
        else if (/^SM_(RoadGrass|Stubble|Verge)$/.test(name))
          material = lowGround;
        for (const [key, poses] of cellPlacements) {
          const object = new THREE.InstancedMesh(
            mesh.geometry,
            material,
            poses.length,
          );
          object.name = name;
          poses.forEach((pose, index) =>
            object.setMatrixAt(
              index,
              matrixFromUnreal(pose, transform).multiply(mesh.matrixWorld),
            ),
          );
          object.computeBoundingSphere();
          object.receiveShadow = !waterSurface;
          group.add(object);
          if (isTerrain || waterSurface) continue;
          cells.get(key)!.batches.push({
            object,
            near,
            far,
            shadow:
              far > 96 && !name.includes("Leaves") && !name.includes("Masses"),
          });
        }
      });
    }
  }
  return [...cells.values()];
}

function addCoverAndGoal(group: THREE.Group, stone: THREE.Texture) {
  const masonry = new THREE.MeshStandardMaterial({
    map: stone,
    color: 0xc7bdab,
    roughness: 1,
  });
  for (const cover of HILL_192_LEVEL.battlefield.cover) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(cover.width, cover.height, cover.depth),
      masonry,
    );
    const positions = wall.geometry.getAttribute("position");
    const normals = wall.geometry.getAttribute("normal");
    const uv = wall.geometry.getAttribute("uv");
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        y = positions.getY(i),
        z = positions.getZ(i);
      uv.setXY(
        i,
        (Math.abs(normals.getX(i)) > 0.5 ? z : x) / 3,
        (Math.abs(normals.getY(i)) > 0.5 ? z : y) / 3,
      );
    }
    wall.position.set(cover.x, (cover.y ?? 0) + cover.height / 2, cover.z);
    wall.castShadow = wall.receiveShadow = true;
    group.add(wall);
  }
  const { x, z, radius } = HILL_192_LEVEL.zone;
  const marks = Array.from({ length: 96 }, (_, i) => {
    const angle = (i * Math.PI) / 48;
    const east = x + Math.cos(angle) * radius;
    const south = z + Math.sin(angle) * radius;
    return new THREE.Vector3(
      east,
      terrainHeightAt(HILL_192_TERRAIN, east, south) + 0.15,
      south,
    );
  });
  group.add(
    new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(marks),
      new THREE.LineBasicMaterial({ color: 0xe7c574 }),
    ),
  );
}

export function buildHill192(
  scene: THREE.Scene,
  signal: AbortSignal,
  manager: THREE.LoadingManager,
) {
  const group = new THREE.Group();
  group.name = "Hill192PastureBlend";
  const textures: THREE.Texture[] = [];
  const roots = new Set<THREE.Object3D>([group]);
  const materials: THREE.Material[] = [];
  let cells: Cell[] = [];
  let sun = HILL_192_LIGHT.sun;
  let lastX = Infinity;
  let lastZ = Infinity;
  const release = () => {
    group.removeFromParent();
    disposeArt([...roots], { materials, textures });
    roots.clear();
    textures.length = materials.length = cells.length = 0;
  };
  signal.addEventListener("abort", release, { once: true });

  const loader = new THREE.TextureLoader();
  const texture = async (path: string, repeat = false) => {
    const image = await loader.loadAsync(path);
    if (signal.aborted) image.dispose();
    else textures.push(image);
    image.colorSpace = repeat ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    image.wrapS = image.wrapT = repeat
      ? THREE.RepeatWrapping
      : THREE.ClampToEdgeWrapping;
    image.anisotropy = 4;
    return image;
  };
  const key = `${ART}/world.glb`;
  manager.itemStart(key);
  const ready = Promise.all([
    texture(`${ART}/ground.png`),
    texture(`${ART}/conditions.png`),
    texture(`${ART}/parcels.png`),
    texture(`${ART}/distant.jpg`),
    texture(`${ART}/meadow.jpg`, true),
    texture("/art/terrain/farm_soil_diff_1k.jpg", true),
    texture("/art/terrain/muddy_tracks_diff_1k.jpg", true),
    texture("/art/terrain/old_stone_wall_02_diff_1k.jpg", true),
    new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .loadAsync(key)
      .then(({ scene: library }) => {
        if (signal.aborted) disposeArt(library);
        else roots.add(library);
        return library;
      }),
    fetch(`${ART}/world.json`, { signal }).then((response) => {
      if (!response.ok)
        throw new Error(`192 高地的場景資料無法下載（${response.status}）。`);
      return response.json() as Promise<WorldLayout>;
    }),
  ])
    .then(
      ([
        groundMask,
        conditionMask,
        parcelMask,
        distant,
        meadowPhoto,
        soilPhoto,
        mudPhoto,
        stonePhoto,
        library,
        layout,
      ]) => {
        if (signal.aborted) return false;
        const ground = pastureMaterial({
          groundMask,
          conditionMask,
          parcelMask,
          meadowPhoto,
          soilPhoto,
          mudPhoto,
          stonePhoto,
        });
        const horizon = distantMaterial(distant);
        materials.push(ground, horizon);
        const { elevations } = HILL_192_TERRAIN;
        for (
          let north = 0;
          north < elevations.length - 1;
          north += TERRAIN_TILE
        ) {
          for (
            let west = 0;
            west < elevations[0].length - 1;
            west += TERRAIN_TILE
          ) {
            const tile = new THREE.Mesh(terrainTile(west, north), ground);
            tile.receiveShadow = true;
            group.add(tile);
          }
        }
        cells = putWorldObjects(
          group,
          library,
          layout,
          ground,
          horizon,
          stonePhoto,
        );
        addCoverAndGoal(group, stonePhoto);
        sun = layout.sun;
        lastX = Infinity;
        scene.add(group);
        return true;
      },
    )
    .catch((error: unknown) => {
      if (!signal.aborted) console.warn("192 高地場景載入失敗。", error);
      return false;
    })
    .finally(() => manager.itemEnd(key));

  return {
    ready,
    get sun() {
      return sun;
    },
    update(x: number, z: number) {
      if (Math.hypot(lastX - x, lastZ - z) < 5) return;
      lastX = x;
      lastZ = z;
      for (const cell of cells) {
        const distance = Math.hypot(cell.x - x, cell.z - z);
        for (const { object, near, far, shadow } of cell.batches) {
          object.visible = distance >= near && distance < far;
          object.castShadow = shadow && distance < 68;
        }
      }
    },
  };
}
