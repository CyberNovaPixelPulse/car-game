import * as THREE from "three";
import { BATTLEFIELD, type TankState } from "./tank-core";

/** The gunner's real 3D view; no renderer is created for the blind driver. */
export class TankScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(65, 1, 0.1, 180);
  private tank = new THREE.Group();
  private observer: ResizeObserver;
  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene.background = new THREE.Color(0xb9c3bc);
    this.scene.fog = new THREE.Fog(0xb9c3bc, 40, 125);
    this.scene.add(new THREE.HemisphereLight(0xd8e0e3, 0x4b5035, 2.7));
    const sun = new THREE.DirectionalLight(0xffecd1, 3.2);
    sun.position.set(-25, 40, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {
      left: -48,
      right: 48,
      top: 48,
      bottom: -48,
      far: 110,
    });
    this.scene.add(sun);
    const material = (color: number, metalness = 0) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness });
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      material(0x6d7653),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const mesh = (
      geometry: THREE.BufferGeometry,
      mat: THREE.Material,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = this.scene,
    ) => {
      const m = new THREE.Mesh(geometry, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const earth = material(0x82765f),
      stone = material(0x797970),
      roof = material(0x5f6059);
    mesh(new THREE.BoxGeometry(9, 0.025, 90), earth, 0, 0.02, 0);
    for (const c of BATTLEFIELD.cover) {
      mesh(
        new THREE.BoxGeometry(c.width, c.height, c.depth),
        stone,
        c.x,
        c.height / 2,
        c.z,
      );
      if (c.height > 4) {
        const top = mesh(
          new THREE.ConeGeometry(7, 3, 4),
          roof,
          c.x,
          c.height + 1.5,
          c.z,
        );
        top.rotation.y = Math.PI / 4;
      } else {
        for (let y = 0.5; y < c.height; y += 0.6)
          mesh(
            new THREE.BoxGeometry(c.width + 0.04, 0.03, c.depth + 0.04),
            material(0x62665b),
            c.x,
            y,
            c.z,
          );
      }
    }
    const trunk = material(0x5d4c3c),
      leaves = material(0x42563d);
    for (let i = 0; i < 20; i++) {
      const x = (i % 2 ? 1 : -1) * (23 + (i % 5) * 3),
        z = -40 + i * 4.5;
      mesh(new THREE.CylinderGeometry(0.3, 0.45, 4, 7), trunk, x, 2, z);
      mesh(new THREE.SphereGeometry(3, 10, 8), leaves, x, 5.7, z);
    }
    const paint = material(0x515c42, 0.3),
      steel = material(0x3d4240, 0.65);
    mesh(new THREE.BoxGeometry(3.3, 1.1, 5.8), paint, 0, 1.15, 0, this.tank);
    mesh(
      new THREE.CylinderGeometry(1.4, 1.7, 1.05, 16),
      paint,
      0,
      2.15,
      -0.3,
      this.tank,
    );
    for (const side of [-1, 1]) {
      mesh(
        new THREE.BoxGeometry(0.58, 1.1, 6.1),
        steel,
        side * 1.7,
        0.7,
        0,
        this.tank,
      );
      for (let i = 0; i < 6; i++) {
        const wheel = mesh(
          new THREE.CylinderGeometry(0.48, 0.48, 0.65, 12),
          paint,
          side * 1.72,
          0.65,
          -2.2 + i * 0.88,
          this.tank,
        );
        wheel.rotation.z = Math.PI / 2;
      }
    }
    const barrel = mesh(
      new THREE.CylinderGeometry(0.105, 0.13, 4, 16),
      steel,
      0,
      2.48,
      -3,
      this.tank,
    );
    barrel.rotation.x = Math.PI / 2;
    this.scene.add(this.tank);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }
  private resize() {
    const width = Math.max(1, this.canvas.clientWidth),
      height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
  render(state: TankState) {
    const t = state.tank;
    this.tank.position.set(t.x, 0, t.z);
    this.tank.rotation.y = -t.yaw;
    this.camera.position.set(t.x, 2.85, t.z + 0.2);
    this.camera.lookAt(
      t.x + Math.sin(t.yaw) * 40,
      2.4,
      t.z - Math.cos(t.yaw) * 40,
    );
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.observer.disconnect();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        for (const m of Array.isArray(obj.material)
          ? obj.material
          : [obj.material])
          m.dispose();
      }
    });
    this.renderer.dispose();
  }
}
