import * as THREE from "three";
import { DRIVER_VIEW } from "./tank-driver-view";

/** Solid, bevelled plates close the view around a narrow forward aperture.
 * The far inner edges are the angular restriction, measured from the eye.
 */
export function buildDriverArmour(camera: THREE.PerspectiveCamera) {
  const far = DRIVER_VIEW.openingDistance;
  const near = far - DRIVER_VIEW.armourDepth;
  const x = far * Math.tan(DRIVER_VIEW.horizontalFov / 2);
  const y = far * Math.tan(DRIVER_VIEW.verticalFov / 2);
  const nearX = x + 0.14;
  const nearY = y + 0.12;
  const material = new THREE.MeshStandardMaterial({
    color: 0x3b4537,
    roughness: 0.88,
    metalness: 0.3,
    emissive: 0x1b2117,
    emissiveIntensity: 0.32,
  });
  const armour = new THREE.Group();
  const corners = (width: number, height: number, z: number) => [
    [-width, -height, -z],
    [width, -height, -z],
    [width, height, -z],
    [-width, height, -z],
  ];
  const rings = [
    ...corners(nearX, nearY, near),
    ...corners(x, y, far),
    ...corners(4, 3, near),
    ...corners(4, 3, far),
  ];
  const vertices: number[] = [];
  function quad(a: number, b: number, c: number, d: number) {
    for (const index of [a, b, c, a, c, d]) vertices.push(...rings[index]);
  }
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    quad(i, next, next + 4, i + 4); // the visible thickness of the opening
    quad(i + 8, next + 8, next, i); // the near interior plate
    quad(i + 4, next + 4, next + 12, i + 12);
    quad(i + 12, next + 12, next + 8, i + 8);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.computeVertexNormals();
  // Both surfaces remain opaque even at the eye's extreme viewport aspect ratios.
  material.side = THREE.DoubleSide;
  const frame = new THREE.Mesh(geometry, material);
  frame.receiveShadow = true;
  armour.add(frame);
  const workLight = new THREE.PointLight(0xc6cfab, 0.45, 2, 2);
  workLight.position.set(-0.18, 0.3, -0.1);
  armour.add(workLight);
  camera.add(armour);
}
