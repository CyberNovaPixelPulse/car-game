import * as THREE from "three";
import { BATTLEFIELD } from "./tank-core";
import {
  armour,
  batchFixedParts,
  box,
  part,
  surfaceMaps,
} from "./tank-art-materials";

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
  stone.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `
      #ifdef USE_MAP
        vec3 sampledStone = texture2D(map, vMapUv).rgb;
        float limestone = dot(sampledStone,vec3(0.2126,0.7152,0.0722));
        diffuseColor.rgb *= vec3(0.63,0.64,0.61) + limestone * 0.65;
      #endif`,
    );
  };
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
      // A masonry agricultural store: relief is shallow; all solid walls keep
      // the authoritative rectangular volume. Pitched farms live outside the map.
      part(
        scene,
        box(c.width - 0.12, 0.07, c.depth - 0.12),
        slate,
        c.x,
        c.height - 0.035,
        c.z,
      );
      for (const face of [-1, 1]) {
        const faceZ = c.z + face * (c.depth / 2 + 0.018);
        const doorShape = new THREE.Shape();
        doorShape.moveTo(-1.05, 0);
        doorShape.lineTo(1.05, 0);
        doorShape.lineTo(1.05, 2.35);
        doorShape.absarc(0, 2.35, 1.05, 0, Math.PI, false);
        doorShape.closePath();
        const timber = part(
          scene,
          new THREE.ShapeGeometry(doorShape),
          door,
          c.x,
          0.03,
          faceZ,
        );
        if (face < 0) timber.rotation.y = Math.PI;
        for (const side of [-1, 1]) {
          part(
            scene,
            armour(0.2, 2.48, 0.09),
            cap,
            c.x + side * 1.16,
            1.24,
            faceZ,
          );
          for (let hinge = 0; hinge < 2; hinge++)
            part(
              scene,
              box(0.67, 0.055, 0.05),
              slate,
              c.x + side * 0.51,
              0.65 + hinge * 1.05,
              faceZ + face * 0.04,
            );
        }
        const arch = part(
          scene,
          new THREE.TorusGeometry(1.15, 0.115, 6, 20, Math.PI),
          cap,
          c.x,
          2.38,
          faceZ,
        );
        for (let board = 0; board < 10; board++)
          part(
            scene,
            box(0.025, 2.3, 0.025),
            cap,
            c.x - 0.94 + board * 0.208,
            1.18,
            faceZ + face * 0.018,
          );
        for (const x of [-2.85, 2.85])
          for (const y of [2.08, 4.75]) {
            part(scene, armour(1.23, 1.55, 0.07), cap, c.x + x, y, faceZ);
            part(
              scene,
              box(1.0, 1.31, 0.085),
              slate,
              c.x + x,
              y,
              faceZ + face * 0.025,
            );
            for (const dx of [-0.3, 0.3])
              part(
                scene,
                box(0.045, 1.34, 0.1),
                door,
                c.x + x + dx,
                y,
                faceZ + face * 0.045,
              );
            part(
              scene,
              box(1.02, 0.05, 0.1),
              door,
              c.x + x,
              y,
              faceZ + face * 0.045,
            );
            part(
              scene,
              box(1.4, 0.12, 0.11),
              cap,
              c.x + x,
              y - 0.77,
              faceZ + face * 0.025,
            );
            // Weathered shutters flank the upper windows and add architectural depth.
            if (y > 4)
              for (const side of [-1, 1]) {
                part(
                  scene,
                  armour(0.38, 1.28, 0.055),
                  door,
                  c.x + x + side * 0.83,
                  y,
                  faceZ,
                );
                for (let slat = 0; slat < 7; slat++)
                  part(
                    scene,
                    box(0.35, 0.025, 0.025),
                    cap,
                    c.x + x + side * 0.83,
                    y - 0.53 + slat * 0.17,
                    faceZ + face * 0.028,
                  );
              }
          }
        for (const y of [0.22, 3.38, 6.74])
          part(scene, armour(c.width - 0.04, 0.16, 0.09), cap, c.x, y, faceZ);
        for (const side of [-1, 1])
          for (let course = 0; course < 14; course++) {
            part(
              scene,
              box(course % 2 ? 0.32 : 0.53, 0.23, 0.04),
              cap,
              c.x + side * (c.width / 2 - 0.3),
              0.3 + course * 0.46,
              faceZ,
            );
          }
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
  const fieldPlots = [
    [-27, -24, 25, 36],
    [28, 8, 24, 42],
    [-26, 24, 26, 20],
    [26, -52, 34, 24],
  ];
  const hash = (n: number) => {
    const v = Math.sin(n * 127.1) * 43758.5453;
    return v - Math.floor(v);
  };
  for (let i = 0; i < 6500; i++) {
    const plot = fieldPlots[i % 4],
      row = Math.floor((hash(i + 431) * plot[2]) / 0.56);
    const x = plot[0] - plot[2] / 2 + row * 0.56 + hash(i + 71) * 0.14;
    const z = plot[1] + (hash(i + 1437) - 0.5) * plot[3];
    const clear = BATTLEFIELD.cover.some(
      (c) =>
        Math.abs(x - c.x) < c.width / 2 + 0.3 &&
        Math.abs(z - c.z) < c.depth / 2 + 0.3,
    );
    transform.position.set(x, 0.01, z);
    transform.scale.set(
      0.8 + hash(i) * 0.6,
      clear ? 0 : 0.75 + hash(i + 14) * 0.6,
      0.8 + hash(i + 81) * 0.4,
    );
    transform.rotation.set(0, i * 2.399, 0);
    transform.updateMatrix();
    tufts.setMatrixAt(i, transform.matrix);
    tufts.setColorAt(
      i,
      new THREE.Color().setHSL(
        0.14 + (i % 4) * 0.012,
        0.22,
        0.43 + (i % 5) * 0.025,
      ),
    );
  }
  const furrow = new THREE.MeshLambertMaterial({ color: 0x6e684f });
  for (const [x, z, w, d] of fieldPlots)
    for (let row = 0; row < Math.floor(w / 0.56); row++) {
      const strip = part(
        scene,
        new THREE.PlaneGeometry(0.13, d),
        furrow,
        x - w / 2 + row * 0.56,
        0.016,
        z,
      );
      strip.rotation.x = -Math.PI / 2;
      strip.castShadow = false;
      strip.receiveShadow = false;
    }
  tufts.receiveShadow = false;
  tufts.computeBoundingSphere();
  scene.add(tufts);
  // Farm groupings beyond the playable boundary, never new battlefield cover.
  for (const [x, z, w, d, h, roofHeight] of [
    [-28, -66, 9, 8, 5.4, 2.4],
    [35, -70, 13, 9, 4.2, 3.0],
    [-60, 13, 8, 10, 5.2, 2.0],
  ]) {
    part(scene, box(w, h, d), stone, x, h / 2, z);
    const gable = new THREE.Shape();
    gable.moveTo(-w / 2, 0);
    gable.lineTo(w / 2, 0);
    gable.lineTo(0, roofHeight);
    gable.closePath();
    for (const side of [-1, 1]) {
      const end = part(
        scene,
        new THREE.ShapeGeometry(gable),
        stone,
        x,
        h,
        z + (side * d) / 2,
      );
      if (side < 0) end.rotation.y = Math.PI;
      const slope = Math.atan2(roofHeight, w / 2),
        length = Math.hypot(w / 2, roofHeight);
      const roof = part(
        scene,
        box(length + 0.22, 0.13, d + 0.45),
        slate,
        x + (side * w) / 4,
        h + roofHeight / 2,
        z,
      );
      roof.rotation.z = -side * slope;
      // Slate courses articulate the large roof without a new texture provider.
      for (let course = 0; course < 6; course++) {
        const t = (course + 0.5) / 6;
        const line = part(
          scene,
          box(0.032, 0.018, d + 0.42),
          cap,
          x + side * (w / 2) * (1 - t),
          h + roofHeight * t + 0.09,
          z,
        );
        line.rotation.z = -side * slope;
      }
    }
    part(
      scene,
      armour(0.7, 1.45, 0.78),
      stone,
      x - w * 0.24,
      h + roofHeight * 0.85,
      z + d * 0.18,
    );
    part(
      scene,
      box(0.84, 0.15, 0.91),
      cap,
      x - w * 0.24,
      h + roofHeight * 0.85 + 0.76,
      z + d * 0.18,
    );
    for (const side of [-1, 1]) {
      const front = z + side * (d / 2 + 0.03);
      for (const floor of [1.2, h - 1.2])
        for (const offset of [-w * 0.3, 0, w * 0.3]) {
          const isDoor = floor < 2 && offset === 0;
          part(
            scene,
            armour(isDoor ? 1.5 : 1.12, isDoor ? 2.35 : 1.35, 0.09),
            cap,
            x + offset,
            isDoor ? 1.18 : floor,
            front,
          );
          part(
            scene,
            box(isDoor ? 1.3 : 0.91, isDoor ? 2.19 : 1.14, 0.11),
            door,
            x + offset,
            isDoor ? 1.12 : floor,
            front + side * 0.02,
          );
          if (!isDoor) {
            part(
              scene,
              box(0.055, 1.15, 0.13),
              cap,
              x + offset,
              floor,
              front + side * 0.03,
            );
            part(
              scene,
              box(0.92, 0.055, 0.13),
              cap,
              x + offset,
              floor,
              front + side * 0.03,
            );
          }
        }
    }
  }
  // Low rolling ground closes the horizon beyond the map, with no collision change.
  const horizon = new THREE.PlaneGeometry(220, 90, 36, 14);
  horizon.rotateX(-Math.PI / 2);
  const hp = horizon.getAttribute("position");
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i),
      z = hp.getZ(i) - 105;
    hp.setXYZ(
      i,
      x,
      Math.max(
        0,
        2.8 + Math.sin(x * 0.055) * 2.2 + Math.sin(z * 0.08 + x * 0.025) * 1.4,
      ),
      z,
    );
  }
  horizon.computeVertexNormals();
  const ridge = part(
    scene,
    horizon,
    new THREE.MeshLambertMaterial({ color: 0x6c7559 }),
    0,
    -0.04,
    0,
  );
  ridge.castShadow = false;
  ridge.receiveShadow = false;
  batchFixedParts(scene);
}
