import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { BATTLEFIELD } from "./tank-core";
import { buildProceduralNormandy } from "./tank-environment-procedural";
import { softwareRendering } from "./tank-vehicle-model";

/** Baked Normandy farm scenery from tools/blender/build_map.py. Visual only:
 * hits, sight lines and collision still read BATTLEFIELD.cover, which the
 * baked cover meshes fill exactly. A failed load, or a software rasteriser,
 * falls back to the primitive map in tank-environment-procedural.ts. */
const ART = "/art/map";
const GROUND = [
  "leafy_grass",
  "muddy_tracks",
  "farm_soil",
  "burned_ground_01",
  "brown_mud_leaves_01",
] as const;
/** Splat maps span this square of the terrain, centred on the battlefield. */
const MAP_SIZE = 420;
/** Instance rows: x, y, z, yaw, scale, tilt about x, tilt about the Blender y axis. */
const STRIDE = 7;
/** Foliage culling cell size in metres. */
const CELL = 50;
/** Cells whose centre is within this range of the battlefield cast sun shadows. */
const SHADOW_REACH = 80;
/** Lane centreline (game x, z), shared with build_map.py, kept clear of grass tufts. */
const LANE = [
  [0, 160],
  [0, 46],
  [0, 2],
  [5, -7],
  [10, -15],
  [10.5, -34],
  [8, -46],
];

interface MapArt {
  map: THREE.Group;
  foliage: THREE.Group;
  splat: THREE.Texture[];
  ground: Record<(typeof GROUND)[number], THREE.Texture>;
}

export function buildNormandy(
  scene: THREE.Scene,
  manager?: THREE.LoadingManager,
) {
  // A CPU rasteriser cannot afford the baked map's textures and foliage without
  // stalling the page past the crew's peer-link timeout: keep the primitive map.
  if (softwareRendering()) return buildProceduralNormandy(scene, manager);
  const key = `${ART}/normandy.glb`;
  // Hold the preparation barrier open until the map or its fallback is in place.
  manager?.itemStart(key);
  void loadMap()
    .then((art) => placeMap(scene, art))
    .catch((error: unknown) => {
      console.warn("地圖模型載入失敗，改用簡易場景。", error);
      buildProceduralNormandy(scene, manager);
    })
    .finally(() => manager?.itemEnd(key));
}

/** One Draco decoder (wasm in public/draco, from three.js) shared by every scene. */
const draco = new DRACOLoader().setDecoderPath("/draco/");

async function loadMap(): Promise<MapArt> {
  const gltf = new GLTFLoader().setDRACOLoader(draco);
  const textures = new THREE.TextureLoader();
  const [map, foliage, ...images] = await Promise.all([
    gltf.loadAsync(`${ART}/normandy.glb`),
    gltf.loadAsync(`${ART}/foliage.glb`),
    textures.loadAsync(`${ART}/splat_a.png`),
    textures.loadAsync(`${ART}/splat_b.png`),
    ...GROUND.map((id) => textures.loadAsync(`/art/terrain/${id}_diff_1k.jpg`)),
  ]);
  const splat = images.slice(0, 2) as THREE.Texture[];
  for (const t of splat) {
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  }
  const ground = {} as MapArt["ground"];
  GROUND.forEach((id, i) => {
    const t = images[2 + i] as THREE.Texture;
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    ground[id] = t;
  });
  return {
    map: (map as { scene: THREE.Group }).scene,
    foliage: (foliage as { scene: THREE.Group }).scene,
    splat,
    ground,
  };
}

function placeMap(scene: THREE.Scene, art: MapArt) {
  art.map.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object.name === "terrain") {
      (object.material as THREE.Material).dispose();
      object.material = terrainMaterial(art);
      object.castShadow = false;
      object.receiveShadow = true;
    } else {
      object.castShadow = object.receiveShadow = true;
    }
  });
  scene.add(art.map);
  placeFoliage(scene, art.foliage);
  scene.add(meadowGrass());
}

/** Tiled CC0 ground sets blended by two baked weight maps.
 * splat_a: lane mud, ploughed soil, burnt ground. splat_b: leaf litter, stubble, wet ruts. */
function terrainMaterial(art: MapArt) {
  const material = new THREE.MeshStandardMaterial({
    roughness: 1,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    const uniforms: Record<string, { value: unknown }> = {
      splatA: { value: art.splat[0] },
      splatB: { value: art.splat[1] },
      mapSize: { value: MAP_SIZE },
    };
    for (const id of GROUND) uniforms[`g_${id}`] = { value: art.ground[id] };
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec2 vGroundXZ;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvGroundXZ = (modelMatrix * vec4(transformed, 1.0)).xz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec2 vGroundXZ;
uniform sampler2D splatA, splatB;
uniform float mapSize;
${GROUND.map((id) => `uniform sampler2D g_${id};`).join("\n")}`,
      )
      .replace(
        "#include <map_fragment>",
        `vec2 gxz = vGroundXZ;
vec2 splatUv = vec2(gxz.x / mapSize + 0.5, 0.5 - gxz.y / mapSize);
vec3 wa = texture2D(splatA, splatUv).rgb;
vec3 wb = texture2D(splatB, splatUv).rgb;
vec3 grass = texture2D(g_leafy_grass, gxz / 3.0).rgb * vec3(0.62, 0.95, 0.42);
float drift = smoothstep(0.3, 0.7, texture2D(g_leafy_grass, gxz / 137.0).g * 2.2);
grass = mix(grass, grass * vec3(1.15, 1.0, 0.8), drift * 0.5);
vec3 ground = mix(grass, texture2D(g_leafy_grass, gxz / 2.2).rgb * vec3(1.25, 1.05, 0.45), wb.g * 0.85);
ground = mix(ground, texture2D(g_farm_soil, gxz / 4.0).rgb, wa.g);
ground = mix(ground, texture2D(g_brown_mud_leaves_01, gxz / 2.5).rgb, wb.r);
ground = mix(ground, texture2D(g_muddy_tracks, gxz / 3.5).rgb * vec3(0.95, 0.9, 0.88), wa.r);
ground = mix(ground, texture2D(g_burned_ground_01, gxz / 3.0).rgb, wa.b);
ground = mix(ground, ground * 0.55, wb.b * 0.6);
float groundWet = wb.b;
diffuseColor.rgb *= ground;`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        "float roughnessFactor = mix(roughness, 0.3, groundWet);",
      );
  };
  return material;
}

/** Trees, hedges, rocks and props. Placements are bucketed into square cells, one
 * InstancedMesh per prototype primitive per cell, so off-screen cells are culled and
 * only cells near the battlefield pay for the sun's shadow pass. */
function placeFoliage(scene: THREE.Scene, foliage: THREE.Group) {
  const root = foliage.getObjectByName("foliage");
  if (!root || typeof root.userData.instances !== "string")
    throw new Error("foliage glTF is missing its instance table");
  const rows = JSON.parse(root.userData.instances) as Record<string, number[]>;
  foliage.updateMatrixWorld(true);
  const parts = new Map<string, THREE.Mesh[]>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    let node: THREE.Object3D | null = object;
    while (node && node.parent !== root) node = node.parent;
    const proto = node?.name.split("__")[0];
    if (!proto) return;
    if (!parts.has(proto)) parts.set(proto, []);
    parts.get(proto)!.push(object);
  });
  for (const mesh of [...parts.values()].flat()) {
    const material = mesh.material as THREE.MeshStandardMaterial;
    if (material.name === "leaves" || material.alphaTest > 0) {
      material.alphaTest = 0.5;
      material.transparent = false;
      material.side = THREE.DoubleSide;
    }
  }
  const place = new THREE.Matrix4(),
    rotate = new THREE.Matrix4(),
    step = new THREE.Matrix4(),
    scale = new THREE.Matrix4();
  for (const [proto, data] of Object.entries(rows)) {
    const cells = new Map<string, number[]>();
    for (let i = 0; i < data.length; i += STRIDE) {
      const key = `${Math.floor(data[i] / CELL)},${Math.floor(data[i + 2] / CELL)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key)!.push(i);
    }
    const lowPlant = /^(nettle|weed|fern)/.test(proto);
    for (const [key, starts] of cells) {
      const [cx, cz] = key.split(",").map((v) => (Number(v) + 0.5) * CELL);
      const shadow = !lowPlant && Math.hypot(cx, cz) < SHADOW_REACH;
      for (const mesh of parts.get(proto) ?? []) {
        const instanced = new THREE.InstancedMesh(
          mesh.geometry,
          mesh.material,
          starts.length,
        );
        starts.forEach((start, n) => {
          const [x, y, z, yaw, s, tiltX, tiltY] = data.slice(
            start,
            start + STRIDE,
          );
          // Blender XYZ euler (tiltX, tiltY, yaw) expressed in the Y-up game frame.
          rotate.makeRotationY(yaw);
          rotate.multiply(step.makeRotationZ(-tiltY));
          rotate.multiply(step.makeRotationX(tiltX));
          place.makeTranslation(x, y, z).multiply(rotate);
          place.multiply(scale.makeScale(s, s, s)).multiply(mesh.matrixWorld);
          instanced.setMatrixAt(n, place);
        });
        instanced.castShadow = shadow;
        instanced.receiveShadow = true;
        instanced.computeBoundingSphere();
        instanced.name = proto;
        scene.add(instanced);
      }
    }
  }
}

/** Low meadow tufts on open grass. Never blockers; kept off cover, lane and plough. */
function meadowGrass() {
  const blades = new THREE.BufferGeometry();
  blades.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -0.02, 0, 0, 0.05, 0.34, 0.01, 0.02, 0, 0, 0, 0, -0.02, -0.04, 0.28,
        0.05, 0, 0, 0.02, -0.02, 0, 0.01, -0.07, 0.22, -0.03, 0.02, 0, -0.01,
      ],
      3,
    ),
  );
  blades.computeVertexNormals();
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  const count = 20000;
  const tufts = new THREE.InstancedMesh(blades, material, count);
  const hash = (n: number) => {
    const v = Math.sin(n * 127.1) * 43758.5453;
    return v - Math.floor(v);
  };
  const laneDistance = (x: number, z: number) => {
    let best = Infinity;
    for (let i = 0; i + 1 < LANE.length; i++) {
      const [ax, az] = LANE[i],
        [bx, bz] = LANE[i + 1];
      const dx = bx - ax,
        dz = bz - az;
      const t = Math.max(
        0,
        Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)),
      );
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    return best;
  };
  const transform = new THREE.Object3D();
  const colour = new THREE.Color();
  let placed = 0;
  for (let i = 0; placed < count && i < count * 3; i++) {
    const x = (hash(i + 11) - 0.5) * 92,
      z = (hash(i + 977) - 0.5) * 92;
    const onCover = BATTLEFIELD.cover.some(
      (c) =>
        Math.abs(x - c.x) < c.width / 2 + 0.25 &&
        Math.abs(z - c.z) < c.depth / 2 + 0.25,
    );
    const ploughed = x > -39.5 && x < -14.5 && z > -42 && z < -6;
    if (onCover || ploughed || laneDistance(x, z) < 3.4) continue;
    const stubble = x > 16 && x < 40 && z > -13 && z < 29;
    transform.position.set(x, 0.01, z);
    transform.scale.set(
      0.8 + hash(i) * 0.7,
      (stubble ? 0.4 : 0.5) + hash(i + 14) * 0.45,
      0.8 + hash(i + 81) * 0.5,
    );
    transform.rotation.set(0, i * 2.399, 0);
    transform.updateMatrix();
    tufts.setMatrixAt(placed, transform.matrix);
    if (stubble) colour.setHSL(0.12 + hash(i + 3) * 0.02, 0.38, 0.42);
    else
      colour.setHSL(0.2 + hash(i + 3) * 0.05, 0.32, 0.27 + hash(i + 5) * 0.08);
    tufts.setColorAt(placed, colour);
    placed++;
  }
  tufts.count = placed;
  tufts.receiveShadow = true;
  tufts.computeBoundingSphere();
  return tufts;
}
