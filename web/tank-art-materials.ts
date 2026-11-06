import * as THREE from "three";

/** Local CC0 maps, never a runtime dependency on the asset provider. */
export function surfaceMaps(
  id: string,
  repeat: number,
  folder = "terrain",
  includeColor = true,
) {
  const loader = new THREE.TextureLoader();
  const load = (suffix: string, color = false) => {
    const texture = loader.load(
      `/art/${folder}/${id}_${suffix}_1k.${suffix === "nor_gl" ? "png" : "jpg"}`,
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

/** A welded hull with actual inclined front/back plates and narrowing upper deck. */
export function hullGeometry(
  width: number,
  depth: number,
  bottom: number,
  top: number,
  taper: number,
  nose: number,
) {
  const b = width / 2,
    d = depth / 2;
  const points = [
    [-b, bottom, -d],
    [b, bottom, -d],
    [b, bottom, d],
    [-b, bottom, d],
    [-b * taper, top, -d + nose],
    [b * taper, top, -d + nose],
    [b * taper, top, d - 0.18],
    [-b * taper, top, d - 0.18],
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points.flat(), 3),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute(
      [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1],
      2,
    ),
  );
  geometry.setIndex([
    0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0, 4,
    7, 6, 4, 6, 5, 0, 1, 2, 0, 2, 3,
  ]);
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  flat.computeVertexNormals();
  return flat;
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
