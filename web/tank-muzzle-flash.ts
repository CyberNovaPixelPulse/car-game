import * as THREE from "three";

/** A short luminous bloom at a real model muzzle, timed only by authority state. */
export class MuzzleFlash {
  private texture: THREE.CanvasTexture;
  private sprite: THREE.Sprite;
  constructor(
    private scene: THREE.Scene,
    private size: number,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d")!;
    const glow = context.createRadialGradient(32, 32, 1, 32, 32, 30);
    glow.addColorStop(0, "rgba(255,255,230,1)");
    glow.addColorStop(0.18, "rgba(255,236,145,1)");
    glow.addColorStop(0.45, "rgba(255,151,43,0.85)");
    glow.addColorStop(1, "rgba(255,104,20,0)");
    context.fillStyle = glow;
    context.beginPath();
    for (let i = 0; i < 16; i++) {
      const angle = (i * Math.PI) / 8;
      const radius = i % 2 ? 12 : 31;
      const x = 32 + Math.cos(angle) * radius;
      const y = 32 + Math.sin(angle) * radius;
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fill();
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.texture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    this.sprite.visible = false;
    scene.add(this.sprite);
  }
  present(
    muzzle: THREE.Object3D,
    until: number,
    now: number,
    duration: number,
  ) {
    this.sprite.visible = now < until;
    if (!this.sprite.visible) return;
    muzzle.updateWorldMatrix(true, false);
    muzzle.getWorldPosition(this.sprite.position);
    const remaining = Math.min(1, Math.max(0, (until - now) / duration));
    this.sprite.scale.setScalar(this.size * (0.7 + remaining * 0.3));
    this.sprite.material.opacity = remaining;
  }
  dispose() {
    this.scene.remove(this.sprite);
    this.sprite.material.dispose();
    this.texture.dispose();
  }
}
