import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Local CC0 maps, never a runtime dependency on the asset provider. */
export function surfaceMaps(
  id: string,
  repeat: number,
  folder = "terrain",
  includeColor = true,
  manager?: THREE.LoadingManager,
) {
  const loader = new THREE.TextureLoader(manager);
  const load = (suffix: string, color = false) => {
    const texture = loader.load(
      `${folder === "metal" ? "/assets/interior" : `/art/${folder}`}/${id}_${suffix}_1k.${suffix === "nor_gl" ? "png" : "jpg"}`,
    );
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
    texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = 4;
    return texture;
  };
  return {
    map: includeColor ? load("diff", true) : null,
    normalMap: load("nor_gl"),
    roughnessMap: load("rough"),
  };
}

export function part(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
export const box = (w: number, h: number, d: number) =>
  new THREE.BoxGeometry(w, h, d);
export const armour = (w: number, h: number, d: number, radius = 0.035) =>
  new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 4, h / 4, d / 4));

/** A solid mechanical strut, batched later with its fixed parent/material. */
export function strut(
  parent: THREE.Object3D,
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  material: THREE.Material,
) {
  const delta = b.clone().sub(a);
  const rod = part(
    parent,
    new THREE.CylinderGeometry(radius, radius, delta.length(), 8),
    material,
  );
  rod.position.copy(a).add(b).multiplyScalar(0.5);
  rod.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  );
  return rod;
}

/** A welded hull with actual inclined front/back plates and narrowing upper deck. */
export function hullGeometry(
  width: number,
  depth: number,
  bottom: number,
  top: number,
  taper: number,
  nose: number,
) {
  // Chamfered welded plate silhouette, then separate projected UVs on every
  // surface. Reusing eight corner UVs collapses front/side armour to one texel row.
  const geometry = new RoundedBoxGeometry(width, top - bottom, depth, 2, 0.035);
  const positions = geometry.getAttribute("position");
  for (let i = 0; i < positions.count; i++) {
    const t = (positions.getY(i) + (top - bottom) / 2) / (top - bottom);
    const z = positions.getZ(i);
    positions.setXYZ(
      i,
      positions.getX(i) * (1 - (1 - taper) * t),
      positions.getY(i) + (top + bottom) / 2,
      z * (1 - ((nose + 0.18) * t) / depth) + ((nose - 0.18) * t) / 2,
    );
  }
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute("normal"),
    uv = geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i),
      z = positions.getZ(i);
    const nx = Math.abs(normals.getX(i)),
      ny = Math.abs(normals.getY(i));
    uv.setXY(i, (nx > 0.6 ? z : x) / 1.5, (ny > 0.6 ? z : y) / 1.5);
  }
  return geometry;
}

/** Dispose one exclusive resource owner. Sharing within that owner is released once.
 * Vehicle models never borrow geometry/materials/textures from other models. */
export function disposeArt(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      materials.add(material);
      const m = material as THREE.MeshStandardMaterial;
      for (const texture of [m.map, m.normalMap, m.roughnessMap])
        if (texture) textures.add(texture);
    }
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

/** Bake only meshes fixed to this exact parent. Animated child groups and instances stay intact. */
export function batchFixedParts(parent: THREE.Object3D) {
  const batches = new Map<
    string,
    {
      material: THREE.Material;
      shadow: boolean;
      geometry: THREE.BufferGeometry[];
      meshes: THREE.Mesh[];
    }
  >();
  for (const object of [...parent.children]) {
    if (
      !(object instanceof THREE.Mesh) ||
      object instanceof THREE.InstancedMesh ||
      Array.isArray(object.material)
    )
      continue;
    object.geometry.computeBoundingBox();
    const size = object.geometry.boundingBox!.getSize(new THREE.Vector3());
    // Hulls, turrets and masonry cast the sun shadow. Wheel hubs and fasteners
    // remain visible and lit without multiplying the silhouette shadow pass.
    const shadow =
      object.castShadow &&
      Math.max(size.x, size.y, size.z) > 0.6 &&
      size.x * size.y * size.z > 1.0;
    const key = object.material.uuid + ":" + shadow;
    let batch = batches.get(key);
    if (!batch) {
      batch = { material: object.material, shadow, geometry: [], meshes: [] };
      batches.set(key, batch);
    }
    object.updateMatrix();
    const geometry = object.geometry.index
      ? object.geometry.toNonIndexed()
      : object.geometry.clone();
    geometry.applyMatrix4(object.matrix);
    batch.geometry.push(geometry);
    batch.meshes.push(object);
  }
  for (const batch of batches.values()) {
    const geometry = mergeGeometries(batch.geometry, false);
    if (!geometry) {
      for (const g of batch.geometry) g.dispose();
      continue;
    }
    for (const object of batch.meshes) parent.remove(object);
    for (const old of new Set(batch.meshes.map((m) => m.geometry)))
      old.dispose();
    for (const intermediate of batch.geometry) intermediate.dispose();
    const mesh = new THREE.Mesh(geometry, batch.material);
    mesh.castShadow = batch.shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }
}
