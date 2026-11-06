import * as THREE from "three";
import { BATTLEFIELD } from "./tank-core";
import { batchFixedParts, box, part, surfaceMaps } from "./tank-art-materials";

/** A compressed Caen countryside, not a reconstruction of a named engagement. */
export function buildNormandy(
  scene: THREE.Scene,
  manager?: THREE.LoadingManager,
) {
  const soilMaps = surfaceMaps("farm_soil", 38, "terrain", true, manager);
  const earth = new THREE.MeshStandardMaterial({
    color: 0x9b947b,
    ...soilMaps,
    roughness: 1,
    normalScale: new THREE.Vector2(0.45, 0.45),
  });
  const grass = new THREE.MeshStandardMaterial({
    color: 0x7d8259,
    ...surfaceMaps("farm_soil", 52, "terrain", true, manager),
    roughness: 1,
    normalScale: new THREE.Vector2(0.22, 0.22),
  });

  const ground = part(
    scene,
    new THREE.PlaneGeometry(240, 240),
    grass,
    0,
    -0.025,
    0,
  );
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  const road = part(
    scene,
    new THREE.PlaneGeometry(8.6, 104),
    earth,
    0,
    0.008,
    -1,
  );
  road.rotation.x = -Math.PI / 2;
  road.castShadow = false;
  // Two faint wheel ruts. These are ground surfaces, never hidden collision.
  for (const x of [-1.18, 1.18]) {
    const rut = part(
      scene,
      new THREE.PlaneGeometry(0.65, 102),
      new THREE.MeshStandardMaterial({
        color: 0x817b63,
        ...surfaceMaps("farm_soil", 32, "terrain", true, manager),
        roughness: 1,
      }),
      x,
      0.015,
      -1,
    );
    rut.rotation.x = -Math.PI / 2;
    rut.castShadow = false;
  }
  const fieldMat = new THREE.MeshStandardMaterial({
    color: 0x8d805c,
    ...surfaceMaps("farm_soil", 13, "terrain", true, manager),
    roughness: 1,
    normalScale: new THREE.Vector2(0.5, 0.5),
  });
  for (const [x, z, w, d] of [
    [-27, -24, 25, 36],
    [28, 8, 24, 42],
    [-26, 24, 26, 20],
    [26, -52, 34, 24],
  ]) {
    const field = part(
      scene,
      new THREE.PlaneGeometry(w, d),
      fieldMat,
      x,
      0.012,
      z,
    );
    field.rotation.x = -Math.PI / 2;
    field.castShadow = false;
  }
  const stoneMaps = surfaceMaps(
    "old_stone_wall_02",
    1,
    "terrain",
    true,
    manager,
  );
  const stone = new THREE.MeshStandardMaterial({
    ...stoneMaps,
    color: 0xd2cbb4,
    roughness: 1,
    normalScale: new THREE.Vector2(0.75, 0.75),
  });
  const cap = new THREE.MeshStandardMaterial({
    color: 0xa49e89,
    roughness: 0.95,
  });
  const door = new THREE.MeshStandardMaterial({
    color: 0x454c43,
    roughness: 0.96,
  });
  const slate = new THREE.MeshStandardMaterial({
    color: 0x555b58,
    roughness: 0.95,
  });
  for (const c of BATTLEFIELD.cover) {
    // The solid masonry fills exactly the authoritative box. Faces get metre-scale UVs.
    const geo = box(c.width, c.height, c.depth);
    const positions = geo.getAttribute("position"),
      normals = geo.getAttribute("normal"),
      uv = geo.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(normals.getX(i)),
        ny = Math.abs(normals.getY(i));
      uv.setXY(
        i,
        (nx > 0.5 ? positions.getZ(i) : positions.getX(i)) / 2,
        (ny > 0.5 ? positions.getZ(i) : positions.getY(i)) / 2,
      );
    }
    part(scene, geo, stone, c.x, c.height / 2, c.z);
    if (c.height > 4) {
      // A low slate roof is enclosed by the stone parapet: no uncollidable roof overhang.
      part(
        scene,
        box(c.width - 0.12, 0.07, c.depth - 0.12),
        slate,
        c.x,
        c.height - 0.035,
        c.z,
      );
      for (const face of [-1, 1]) {
        const faceZ = c.z + face * (c.depth / 2 + 0.012);
        const barnDoor = part(
          scene,
          box(2.1, 2.9, 0.02),
          door,
          c.x,
          1.45,
          faceZ,
        );
        barnDoor.receiveShadow = false;
        for (let i = 0; i < 8; i++)
          part(
            scene,
            box(0.025, 2.86, 0.025),
            cap,
            c.x - 0.93 + i * 0.265,
            1.45,
            faceZ + face * 0.015,
          );
        for (const x of [-2.7, 2.7]) {
          part(scene, box(1.05, 1.45, 0.025), cap, c.x + x, 4.7, faceZ);
          part(
            scene,
            box(0.83, 1.22, 0.03),
            door,
            c.x + x,
            4.7,
            faceZ + face * 0.016,
          );
          part(
            scene,
            box(0.055, 1.25, 0.04),
            cap,
            c.x + x,
            4.7,
            faceZ + face * 0.035,
          );
          part(
            scene,
            box(0.87, 0.055, 0.04),
            cap,
            c.x + x,
            4.7,
            faceZ + face * 0.035,
          );
        }
        part(scene, box(c.width, 0.13, 0.08), cap, c.x, c.height - 0.1, faceZ);
      }
    } else {
      const length = Math.max(c.width, c.depth),
        wide = c.width > c.depth;
      const n = Math.ceil(length / 0.68);
      for (let i = 0; i < n; i++) {
        const q = ((i + 0.5) * length) / n - length / 2;
        part(
          scene,
          box(
            wide ? length / n : c.width - 0.02,
            0.14,
            wide ? c.depth - 0.02 : length / n,
          ),
          cap,
          c.x + (wide ? q : 0),
          c.height - 0.07,
          c.z + (wide ? 0 : q),
        );
      }
    }
  }
  // Tall scenery lives beyond the playable boundary; none pretends to be usable cover.
  const trunk = new THREE.MeshStandardMaterial({
    color: 0x625948,
    roughness: 1,
  });
  const foliage = new THREE.MeshLambertMaterial({
    color: 0x526344,
    side: THREE.DoubleSide,
  });
  // Each card carries a twig of pointed leaves; alpha is authored in the shader,
  // so distant canopies have foliage gaps instead of shaded green balls.
  foliage.onBeforeCompile = (shader) => {
    shader.vertexShader =
      "varying vec2 leafUv;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nleafUv = uv;",
      );
    shader.fragmentShader =
      "varying vec2 leafUv;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
      vec2 leaf = fract(leafUv * vec2(3.0, 3.0)) * 2.0 - 1.0;
      float edge = pow(abs(leaf.x), 1.4) + pow(abs(leaf.y), 0.85);
      if (edge > 0.90) discard;
      diffuseColor.rgb *= 0.78 + 0.22 * (1.0 - abs(leaf.x));`,
      );
  };
  const leafGeo = new THREE.PlaneGeometry(0.85, 1.0);
  const leaves = new THREE.InstancedMesh(leafGeo, foliage, 3200);
  const transform = new THREE.Object3D();
  let leaf = 0;
  for (let i = 0; i < 20; i++) {
    const x = (i % 2 ? 1 : -1) * (48 + (i % 3) * 7),
      z = -72 + Math.floor(i / 2) * 16;
    const height = 5.2 + (i % 4) * 0.7;
    part(
      scene,
      new THREE.CylinderGeometry(0.12, 0.4, height, 7),
      trunk,
      x,
      height / 2,
      z,
    );
    for (let b = 0; b < 3; b++) {
      const branch = part(
        scene,
        new THREE.CylinderGeometry(0.055, 0.15, 3.1, 6),
        trunk,
        x + Math.sin(b * 2.3) * 0.7,
        height - 1.8,
        z + Math.cos(b * 2.3) * 0.7,
      );
      branch.rotation.z = 0.65 * Math.sin(b * 2.3);
      branch.rotation.x = 0.6 * Math.cos(b * 2.3);
    }
    for (let b = 0; b < 160; b++) {
      const angle = b * 2.399;
      const r = 3.5 * Math.sqrt((b % 53) / 53);
      transform.position.set(
        x + Math.sin(angle) * r,
        height - 0.4 + Math.sin(b * 1.731) * 1.7 + (1 - r / 4) * 1.2,
        z + Math.cos(angle) * r,
      );
      transform.scale.setScalar(0.75 + (b % 7) * 0.09);
      transform.rotation.set(b * 0.73, b * 1.39, b * 0.23);
      transform.updateMatrix();
      leaves.setMatrixAt(leaf, transform.matrix);
      leaves.setColorAt(
        leaf++,
        new THREE.Color().setHSL(
          0.22 + (b % 4) * 0.008,
          0.18,
          0.43 + (b % 5) * 0.035,
        ),
      );
    }
  }
  leaves.castShadow = false;
  leaves.receiveShadow = false;
  leaves.computeBoundingSphere();
  scene.add(leaves);
  // Stubble and grass tufts are low enough to neither hide tanks nor imply solid hedges.
  const blades = new THREE.BufferGeometry();
  blades.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -0.018, 0, 0, 0.06, 0.3, 0, 0.018, 0, 0, 0, 0, -0.018, 0, 0.24, 0.045,
        0, 0, 0.018,
      ],
      3,
    ),
  );
  blades.computeVertexNormals();
  const grassMat = new THREE.MeshLambertMaterial({
    color: 0x65714a,
    side: THREE.DoubleSide,
  });
  const tufts = new THREE.InstancedMesh(blades, grassMat, 6500);
  for (let i = 0; i < 6500; i++) {
    const hash = (n: number) => {
      const v = Math.sin(n * 127.1) * 43758.5453;
      return v - Math.floor(v);
    };
    const x = hash(i + 1) * 94 - 47,
      z = hash(i + 1437) * 116 - 58;
    // Keep the fighting lane and masonry footprint clear, with no gameplay randomness consumed.
    const clear =
      Math.abs(x) < 5 ||
      BATTLEFIELD.cover.some(
        (c) =>
          Math.abs(x - c.x) < c.width / 2 + 0.3 &&
          Math.abs(z - c.z) < c.depth / 2 + 0.3,
      );
    transform.position.set(x, 0.01, z);
    transform.scale.setScalar(clear ? 0 : 0.55 + (i % 5) * 0.2);
    transform.rotation.set(0, i * 2.399, 0);
    transform.updateMatrix();
    tufts.setMatrixAt(i, transform.matrix);
  }
  tufts.receiveShadow = false;
  tufts.computeBoundingSphere();
  scene.add(tufts);
  // Distant pitched farm roofs make the village legible without adding false in-bounds cover.
  for (const [x, z, w, d, h] of [
    [-37, -64, 9, 7, 6],
    [34, -70, 12, 9, 7],
    [-60, 12, 8, 8, 5],
  ]) {
    part(scene, box(w, h, d), stone, x, h / 2, z);
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(0, 2.8);
    shape.closePath();
    const roofGeo = new THREE.ExtrudeGeometry(shape, {
      depth: d,
      bevelEnabled: false,
    });
    part(scene, roofGeo, slate, x, h, z - d / 2);
    for (let i = 0; i < 3; i++)
      part(
        scene,
        box(1, 1.4, 0.04),
        door,
        x - w / 3 + (i * w) / 3,
        h * 0.6,
        z - d / 2 - 0.025,
      );
  }
  batchFixedParts(scene);
}
