import * as THREE from "three";
import { MuzzleFlash } from "./tank-muzzle-flash";
import type { TankState } from "./tank-core";
import { lastCannonFiredAt } from "./tank-weapons";

const FLASH_SECONDS = 0.1;
export const CANNON_BLAST_SECONDS = 0.5;

/** Every station samples the same accepted shot on the battle clock. */
export function cannonShotAge(state: TankState) {
  if (state.battle.won || state.battle.failed) return Infinity;
  return Math.max(0, state.time - lastCannonFiredAt(state.weapon));
}

export function cabinFlashIntensity(age: number) {
  return 7 * Math.max(0, 1 - age / 0.16) ** 2;
}

function smokePuff() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  for (const [x, y, r] of [
    [22, 34, 21],
    [36, 25, 19],
    [43, 37, 19],
  ]) {
    const haze = ctx.createRadialGradient(x, y, 0, x, y, r);
    haze.addColorStop(0, "rgba(226,221,208,0.85)");
    haze.addColorStop(0.45, "rgba(210,204,191,0.57)");
    haze.addColorStop(1, "rgba(205,204,199,0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, 64, 64);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map, depthWrite: false }));
}

/** A single reusable burst. Its origin stays in the world as the tank moves. */
export class PlayerCannonBlast {
  private readonly origin = new THREE.Group();
  private readonly flash: MuzzleFlash;
  private readonly smoke = smokePuff();
  private readonly sparks = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(1),
    new THREE.MeshBasicMaterial({
      color: 0xffc775,
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

  constructor(scene: THREE.Scene) {
    this.flash = new MuzzleFlash(scene, 0.82);
    this.sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sparks.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
    this.origin.add(this.sparks, this.smoke);
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
    this.flash.present(this.origin, FLASH_SECONDS, age, FLASH_SECONDS);
    if (!this.origin.visible) return;

    const sparkAge = age - 0.025;
    this.sparks.visible = sparkAge >= 0 && sparkAge < 0.31;
    if (this.sparks.visible) {
      const travel = sparkAge * (1 - 1.15 * sparkAge);
      const fade = 1 - (sparkAge / 0.31) ** 2;
      this.sparks.material.opacity = fade;
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
        const width = (0.022 + (i % 3) * 0.006) * fade;
        this.particle.scale.set(width, (0.15 + (i % 5) * 0.04) * fade, width);
        this.particle.updateMatrix();
        this.sparks.setMatrixAt(i, this.particle.matrix);
      }
      this.sparks.instanceMatrix.needsUpdate = true;
    }

    const smokePhase = Math.max(
      0,
      (age - 0.08) / (CANNON_BLAST_SECONDS - 0.08),
    );
    this.smoke.visible = smokePhase > 0;
    if (this.smoke.visible) {
      this.smoke.position.set(0, 0.38 * smokePhase, -0.18 - smokePhase * 0.9);
      this.smoke.scale.setScalar(0.6 + smokePhase);
      this.smoke.material.opacity =
        0.3 * Math.min(1, smokePhase * 6) * (1 - smokePhase);
    }
  }

  dispose() {
    this.flash.dispose();
    this.origin.removeFromParent();
    this.smoke.material.map?.dispose();
    this.smoke.material.dispose();
    this.sparks.dispose();
    this.sparks.material.dispose();
    this.sparks.geometry.dispose();
  }
}
