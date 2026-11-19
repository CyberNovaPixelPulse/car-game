import * as THREE from "three";
import { cannonFlame } from "./tank-cannon-flame";
import type { TankState } from "./tank-core";
import { lastCannonFiredAt } from "./tank-weapons";

const FLAME_SEEDS = [1.3, 4.7, 8.2] as const;
const FLASH_SECONDS = 0.115;
export const CANNON_BLAST_SECONDS = 0.82;

/** Every station samples the same accepted shot on the battle clock. */
export function cannonShotAge(state: TankState) {
  if (state.battle.won || state.battle.failed) return Infinity;
  return Math.max(0, state.time - lastCannonFiredAt(state.weapon));
}

export function cabinFlashIntensity(age: number) {
  return 7 * Math.max(0, 1 - age / 0.16) ** 2;
}

/** A single reusable burst. Its origin stays in the world as the tank moves. */
export class PlayerCannonBlast {
  private readonly origin = new THREE.Group();
  private readonly flame = cannonFlame();
  private readonly reflectedLight = new THREE.PointLight(0xffc18a, 0, 4.5);
  private readonly smokeMap: THREE.Texture;
  private readonly puffs: THREE.Sprite[] = [];
  private readonly sparks = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(1),
    new THREE.MeshBasicMaterial({
      color: 0xe39a52,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
    16,
  );
  private readonly particle = new THREE.Object3D();
  private readonly direction = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private shot = -1;

  constructor(scene: THREE.Scene, manager: THREE.LoadingManager) {
    this.smokeMap = new THREE.TextureLoader(manager).load(
      "/art/effects/cannon-plume.png",
    );
    this.smokeMap.colorSpace = THREE.SRGBColorSpace;
    this.smokeMap.generateMipmaps = false;
    this.smokeMap.minFilter = THREE.LinearFilter;
    this.smokeMap.repeat.set(0.25, 0.25);
    for (let i = 0; i < 3; i++) {
      const puff = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.smokeMap,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      this.puffs.push(puff);
      this.origin.add(puff);
    }
    // Keep the light in the scene at zero intensity between shots. Toggling
    // the light count would trigger material recompilation during the flash.
    scene.add(this.reflectedLight);
    this.sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sparks.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
    this.origin.add(this.sparks, this.flame);
    this.origin.visible = false;
    scene.add(this.origin);
  }

  present(muzzle: THREE.Object3D, shot: number, age: number) {
    this.origin.visible = age < CANNON_BLAST_SECONDS;
    if (this.origin.visible && shot !== this.shot) {
      muzzle.getWorldPosition(this.origin.position);
      muzzle.getWorldQuaternion(this.origin.quaternion);
      this.shot = shot;
    }
    const phase = Math.min(1, age / FLASH_SECONDS);
    this.reflectedLight.intensity = 24 * (1 - phase) ** 2;
    this.flame.visible = phase < 1;
    if (this.flame.visible) {
      this.flame.material.uniforms.phase.value = phase;
      this.flame.material.uniforms.seed.value =
        FLAME_SEEDS[shot % FLAME_SEEDS.length];
      this.flame.rotation.z = (shot % 3) * 2.1;
      this.reflectedLight.position.set(0.12, 0.23, -0.13);
      this.origin.localToWorld(this.reflectedLight.position);
    }
    if (!this.origin.visible) return;

    const sparkAge = age - 0.025;
    this.sparks.visible = sparkAge >= 0 && sparkAge < 0.31;
    if (this.sparks.visible) {
      const travel = sparkAge * (1 - 1.15 * sparkAge);
      const fade = 1 - (sparkAge / 0.31) ** 2;
      this.sparks.material.opacity = 0.68 * fade;
      for (let i = 0; i < this.sparks.count; i++) {
        const angle = i * 2.4 + shot * 1.7;
        const spread = 2.8 + ((i * 5) % 9) * 0.55;
        this.direction.set(
          Math.cos(angle) * spread,
          Math.sin(angle) * spread,
          -(5 + ((i * 3) % 7)),
        );
        this.particle.position.copy(this.direction).multiplyScalar(travel);
        this.particle.position.y -= 2.6 * sparkAge ** 2;
        this.particle.quaternion.setFromUnitVectors(
          this.up,
          this.direction.normalize(),
        );
        const width = (0.009 + (i % 3) * 0.003) * fade;
        this.particle.scale.set(width, (0.067 + (i % 5) * 0.019) * fade, width);
        this.particle.updateMatrix();
        this.sparks.setMatrixAt(i, this.particle.matrix);
      }
      this.sparks.instanceMatrix.needsUpdate = true;
    }

    const smokeAge = Math.max(0, age - 0.025);
    const t = smokeAge / (CANNON_BLAST_SECONDS - 0.025);
    const spread = 1 - (1 - t) ** 3;
    const frame = Math.min(15, Math.floor(t * 16));
    this.smokeMap.offset.set((frame % 4) / 4, Math.floor(frame / 4) / 4);
    for (const [i, puff] of this.puffs.entries()) {
      const side = i - 1;
      const center = side === 0;
      const drift = spread * (side < 0 ? 0.95 : 1.05);
      puff.position.set(
        side * (0.035 + drift * 0.54),
        0.09 + t * (0.32 + 0.15 * side),
        -0.22 - drift * (center ? 1.02 : 0.63),
      );
      const size = 0.65 + spread * (center ? 0.72 : 0.77);
      puff.scale.set(size, size * (center ? 0.73 : 0.82), 1);
      puff.material.rotation =
        side * (0.34 + 0.2 * t) + ((shot % 3) - 1) * 0.11;
      puff.material.opacity =
        Math.min(1, smokeAge / 0.042) *
        (center
          ? 0.76 * Math.max(0, 1 - t / 0.53)
          : (0.9 + 0.05 * side) * (1 - t ** 1.8));
      // The incandescent core briefly colours the nearest smoke before daylight takes over.
      puff.material.color.setRGB(
        1 + (1 - phase) * 1.4,
        1 + (1 - phase) * 0.27,
        1 - (1 - phase) * 0.48,
      );
    }
  }

  dispose() {
    this.origin.removeFromParent();
    this.reflectedLight.removeFromParent();
    this.reflectedLight.dispose();
    this.flame.geometry.dispose();
    this.flame.material.dispose();
    for (const puff of this.puffs) puff.material.dispose();
    this.smokeMap.dispose();
    this.sparks.dispose();
    this.sparks.material.dispose();
    this.sparks.geometry.dispose();
  }
}
