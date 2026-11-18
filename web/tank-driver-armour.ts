import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { disposeArt, surfaceMaps } from "./tank-art-materials";
import { DRIVER_VIEW } from "./tank-driver-view";

/** The model origin is its far throat. The artist dimensions scale to the
 * same aperture and depth used by the driver's camera and scouting. */
export async function buildDriverArmour(
  mount: THREE.Object3D,
  manager: THREE.LoadingManager,
  cancelled: () => boolean,
) {
  const asset = await new GLTFLoader(manager).loadAsync(
    "/assets/closeups/driver-window.glb",
  );
  const frame = asset.scene.getObjectByName("DriverWindow");
  const opening = frame?.userData.opening;
  if (
    cancelled() ||
    !frame ||
    !Array.isArray(opening) ||
    opening.length !== 3 ||
    !opening.every((size) => Number.isFinite(size) && size > 0)
  ) {
    disposeArt(asset.scene);
    return false;
  }

  const far = DRIVER_VIEW.openingDistance;
  frame.position.z = -far;
  frame.scale.set(
    (far * Math.tan(DRIVER_VIEW.horizontalFov / 2)) / opening[0],
    (far * Math.tan(DRIVER_VIEW.verticalFov / 2)) / opening[1],
    DRIVER_VIEW.armourDepth / opening[2],
  );
  const maps = surfaceMaps("green_metal_rust", 1.8, "metal", false, manager);
  frame.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.receiveShadow = true;
    const material = object.material;
    if (!(material instanceof THREE.MeshStandardMaterial)) return;
    material.side = THREE.DoubleSide;
    material.emissive.copy(material.color);
    material.emissiveIntensity = 0.22;
    material.roughnessMap = maps.roughnessMap;
    material.normalMap = maps.normalMap;
    material.normalScale.set(0.18, 0.18);
  });

  const workLight = new THREE.PointLight(0xc6cfab, 0.55, 2, 2);
  workLight.position.set(-0.18, 0.24, -0.1);
  mount.add(asset.scene, workLight);
  return true;
}
