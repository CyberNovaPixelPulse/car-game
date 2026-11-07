import * as THREE from "three";
import { ArtPreparation, finishPreparation } from "./tank-art-preparation";
import type { TankState } from "./tank-core";
import { scenePixelRatio, type SceneQuality } from "./tank-scene-quality";

/** Enclosed loader workspace. Deliberately owns no battlefield geometry or rules. */
export class TankInteriorScene {
  private renderer: THREE.WebGLRenderer;
  private assets = new ArtPreparation();
  private disposed = false;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(58, 1, 0.05, 16);
  private observer: ResizeObserver;
  private recoil = new THREE.Group();
  private block = new THREE.Group();
  private round = new THREE.Group();
  private case = new THREE.Group();
  private textures: THREE.Texture[] = [];
  private dirty = true;
  private visualStamp = "";
  private width = 0;
  private height = 0;
  private reducedMotion = matchMedia("(prefers-reduced-motion: reduce)")
    .matches;
  constructor(
    private canvas: HTMLCanvasElement,
    private quality: SceneQuality = "medium",
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.scene.background = new THREE.Color(0x171e1c);
    this.scene.add(new THREE.HemisphereLight(0xe4e5cf, 0x252c25, 1.3));
    const lamp = new THREE.SpotLight(0xffe4ad, 36, 9, Math.PI / 3, 0.55, 2);
    lamp.target.position.set(0, 1.2, -0.6);
    this.scene.add(lamp.target);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(1024, 1024);
    lamp.shadow.bias = -0.001;
    lamp.position.set(1.2, 2.5, 1.4);
    this.scene.add(lamp);
    const fill = new THREE.PointLight(0xc6d5d0, 14, 7, 2);
    fill.position.set(-1.4, 1.9, 0.8);
    this.scene.add(fill);
    const mat = (color: number, metalness = 0.15, roughness = 0.65) =>
      new THREE.MeshStandardMaterial({ color, metalness, roughness });
    const paint = mat(0x697367),
      darkPaint = mat(0x39473c),
      steel = mat(0x81877f, 0.7, 0.32),
      dark = mat(0x151b19, 0.3),
      brass = mat(0xb8a06a, 0.72, 0.3),
      rubber = mat(0x242925, 0, 0.92);
    const textureLoader = new THREE.TextureLoader(this.assets.manager);
    const diffuse = textureLoader.load(
      "/assets/interior/green_metal_rust_diff_1k.jpg",
      () => this.invalidate(),
    );
    diffuse.colorSpace = THREE.SRGBColorSpace;
    const normal = textureLoader.load(
      "/assets/interior/green_metal_rust_nor_gl_1k.png",
      () => this.invalidate(),
    );
    const roughness = textureLoader.load(
      "/assets/interior/green_metal_rust_rough_1k.jpg",
      () => this.invalidate(),
    );
    for (const texture of [diffuse, normal, roughness]) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(2, 2);
      this.textures.push(texture);
    }
    for (const material of [paint, darkPaint]) {
      material.map = diffuse;
      material.roughness = 1;
      material.normalMap = normal;
      material.normalScale.set(0.22, 0.22);
      material.roughnessMap = roughness;
    }
    steel.normalMap = normal;
    steel.normalScale.set(0.07, 0.07);
    steel.roughnessMap = roughness;
    const mesh = (
      geo: THREE.BufferGeometry,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
      parent: THREE.Object3D = this.scene,
    ) => {
      const m = new THREE.Mesh(geo, material);
      m.castShadow = true;
      m.receiveShadow = true;
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    const box = (
      w: number,
      h: number,
      d: number,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
      parent?: THREE.Object3D,
    ) => mesh(this.beveledBox(w, h, d), material, x, y, z, parent);
    const cylinder = (
      r: number,
      h: number,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
      parent?: THREE.Object3D,
    ) =>
      mesh(new THREE.CylinderGeometry(r, r, h, 24), material, x, y, z, parent);
    // Curved turret wall, closed front bulkhead and steel floor: no window into the world.
    const wall = mesh(
      new THREE.CylinderGeometry(2.65, 2.8, 3.1, 32, 1, true),
      paint,
      0,
      1.4,
      -0.3,
    );
    (wall.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    cylinder(2.8, 0.15, darkPaint, 0, -0.08, -0.3);
    cylinder(2.65, 0.12, darkPaint, 0, 2.96, -0.3);
    box(4.7, 2.9, 0.15, paint, 0, 1.4, -2.4);
    for (let i = 0; i < 15; i++) {
      const angle = (i * Math.PI * 2) / 15;
      const x = Math.sin(angle) * 2.57,
        z = -0.3 + Math.cos(angle) * 2.57;
      const seam = box(0.045, 2.75, 0.035, darkPaint, x, 1.45, z);
      seam.rotation.y = angle;
      for (const y of [0.3, 1.5, 2.7]) {
        const bolt = cylinder(0.026, 0.035, steel, x * 0.992, y, z * 0.992);
        bolt.rotation.x = Math.PI / 2;
        bolt.rotation.z = angle;
      }
    }
    for (let i = 0; i < 14; i++)
      box(4.3, 0.009, 0.024, steel, 0, 0.015, -2 + i * 0.32);
    // Recoil cradle and polished guides surround the 75mm gun's rear mechanism.
    this.scene.add(this.recoil);
    for (const x of [-0.55, 0.55]) {
      const guide = cylinder(0.07, 2.1, steel, x, 1.36, -1.15, this.recoil);
      guide.rotation.x = Math.PI / 2;
      box(0.25, 0.47, 0.36, darkPaint, x, 1.29, -0.58, this.recoil);
      box(0.2, 0.15, 1.8, darkPaint, x, 1.1, -1.2);
    }
    const gun = cylinder(0.33, 1.3, steel, 0, 1.48, -1.55, this.recoil);
    gun.rotation.x = Math.PI / 2;
    // An open mouth with substantial machined frame rather than a solid box.
    for (const x of [-0.34, 0.34])
      box(0.18, 0.8, 0.57, steel, x, 1.45, -0.62, this.recoil);
    for (const y of [1.08, 1.82])
      box(0.84, 0.14, 0.57, steel, 0, y, -0.62, this.recoil);
    cylinder(0.21, 0.02, dark, 0, 1.47, -0.92, this.recoil).rotation.x =
      Math.PI / 2;
    this.recoil.add(this.block);
    this.block.position.set(0, 0, -0.55);
    box(0.49, 0.52, 0.24, steel, 0, 1.42, 0, this.block);
    box(0.24, 0.12, 0.08, darkPaint, 0, 1.42, 0.16, this.block);
    const lever = cylinder(0.026, 0.58, steel, 0.51, 1.55, -0.46, this.recoil);
    lever.rotation.z = -0.5;
    cylinder(0.055, 0.15, rubber, 0.65, 1.79, -0.46, this.recoil);
    for (const x of [-0.34, 0.34])
      for (const y of [1.13, 1.77])
        cylinder(0.036, 0.035, dark, x, y, -0.31, this.recoil).rotation.x =
          Math.PI / 2;
    // Elevation handwheel, its hub and spokes; fixed to the cradle.
    const wheel = mesh(
      new THREE.TorusGeometry(0.25, 0.026, 8, 32),
      darkPaint,
      -0.9,
      1.27,
      -0.4,
    );
    wheel.rotation.y = 0.5;
    for (let i = 0; i < 3; i++) {
      const spoke = box(0.48, 0.018, 0.018, steel, -0.9, 1.27, -0.4);
      spoke.rotation.z = (i * Math.PI) / 3;
    }
    cylinder(0.06, 0.18, steel, -0.9, 1.27, -0.4).rotation.x = Math.PI / 2;
    const makeShell = (
      parent: THREE.Group,
      spent = false,
      shellColor = 0x606746,
    ) => {
      const body = cylinder(0.095, 0.58, brass, 0, 0, 0, parent);
      body.rotation.x = Math.PI / 2;
      const rim = cylinder(0.108, 0.025, brass, 0, 0, 0.3, parent);
      rim.rotation.x = Math.PI / 2;
      if (!spent) {
        const tip = mesh(
          new THREE.LatheGeometry(
            [
              new THREE.Vector2(0.095, 0),
              new THREE.Vector2(0.09, 0.13),
              new THREE.Vector2(0.055, 0.23),
              new THREE.Vector2(0, 0.3),
            ],
            24,
          ),
          mat(shellColor, 0.4, 0.48),
          0,
          0,
          -0.29,
          parent,
        );
        tip.rotation.x = -Math.PI / 2;
        const band = cylinder(0.098, 0.04, steel, 0, 0, -0.22, parent);
        band.rotation.x = Math.PI / 2;
      }
    };
    makeShell(this.round);
    makeShell(this.case, true);
    this.scene.add(this.round, this.case);
    // Ready rack and strapped, nose-up ammunition against the right wall.
    box(0.82, 0.17, 1.65, darkPaint, 1.72, 0.5, -0.35);
    for (let row = 0; row < 2; row++)
      for (let i = 0; i < 4; i++) {
        const round = new THREE.Group();
        makeShell(round, false, row ? 0x4a5050 : 0x606746);
        round.position.set(1.48 + row * 0.32, 0.88, -0.95 + i * 0.4);
        round.rotation.x = Math.PI / 2;
        this.scene.add(round);
        mesh(
          new THREE.TorusGeometry(0.12, 0.018, 8, 20),
          darkPaint,
          round.position.x,
          0.62,
          round.position.z,
        ).rotation.x = Math.PI / 2;
      }
    for (const z of [-1.15, 0.55]) box(0.85, 0.035, 0.06, steel, 1.72, 1.13, z);
    // Conduits and junction boxes follow the wall, avoiding the ejection path.
    const pipe = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-2.1, 0.3, 0.1),
      new THREE.Vector3(-2.1, 2.3, 0.1),
      new THREE.Vector3(-1.7, 2.55, -0.5),
      new THREE.Vector3(0.8, 2.55, -1.7),
    ]);
    mesh(new THREE.TubeGeometry(pipe, 24, 0.025, 8, false), dark, 0, 0, 0);
    box(0.32, 0.38, 0.17, darkPaint, -2.03, 1.75, 0.05);
    for (const y of [0.5, 1.2, 2.1]) box(0.12, 0.03, 0.07, steel, -2.1, y, 0.1);
    mesh(
      new THREE.CylinderGeometry(0.14, 0.2, 0.09, 16),
      steel,
      1.2,
      2.66,
      1.4,
    );
    mesh(
      new THREE.SphereGeometry(0.065, 12, 8),
      new THREE.MeshStandardMaterial({
        color: 0xffefc7,
        emissive: 0xffd490,
        emissiveIntensity: 2,
      }),
      1.2,
      2.6,
      1.4,
    );
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }
  private beveledBox(w: number, h: number, d: number) {
    const edge = Math.min(w, h, d, 0.18) * 0.1;
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 + edge, -h / 2 + edge);
    shape.lineTo(w / 2 - edge, -h / 2 + edge);
    shape.lineTo(w / 2 - edge, h / 2 - edge);
    shape.lineTo(-w / 2 + edge, h / 2 - edge);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: d - edge * 2,
      bevelEnabled: true,
      bevelSize: edge,
      bevelThickness: edge,
      bevelSegments: 2,
      steps: 1,
    });
    geometry.translate(0, 0, -d / 2 + edge);
    return geometry;
  }
  invalidate() {
    this.dirty = true;
  }
  setQuality(quality: SceneQuality) {
    if (this.quality === quality) return;
    this.quality = quality;
    this.resize(true);
  }
  private resize(force = false) {
    // Retain the drawing buffer while this mode is hidden. Shrinking it to
    // 1px would allocate it again on every Tab and stall ordinary input.
    const w = this.canvas.clientWidth || this.width || 1024,
      h = this.canvas.clientHeight || this.height || 576;
    this.invalidate();
    if (!force && w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.renderer.setDrawingBufferSize(
      w,
      h,
      scenePixelRatio(w, h, this.quality),
    );
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  async prepare(state: TankState) {
    await this.assets.wait();
    if (this.disposed) throw new Error("視野準備已取消。");
    this.render(state);
    await this.renderer.compileAsync(this.scene, this.camera);
    if (this.disposed) throw new Error("視野準備已取消。");
    this.invalidate();
    this.render(state);
    await finishPreparation(this.renderer, () => this.disposed);
  }
  render(state: TankState) {
    const w = state.weapon;
    // An enclosed, motionless workplace does not need to redraw the world at
    // every host/UI tick. All authority clocks still advance outside this view.
    const tail =
      w.shotsFired > 0 &&
      state.time >= w.ejectAt &&
      state.time < w.ejectAt + 0.25;
    const motion = w.chamber === "ejecting" || tail;
    const stunned = state.time < w.stunnedUntil;
    const stamp = [
      w.chamber,
      Math.floor(w.loadProgress * 90),
      w.crouching,
      stunned,
      motion ? Math.floor(state.time * 30) : "still",
    ].join(":");
    if (!this.dirty && stamp === this.visualStamp) return;
    this.dirty = false;
    this.visualStamp = stamp;
    const eject =
      w.chamber === "ejecting"
        ? THREE.MathUtils.clamp(1 - (w.ejectAt - state.time) / 0.8, 0, 1)
        : 1;
    const recovery = state.time - w.ejectAt;
    this.recoil.position.z = w.chamber === "ejecting" ? 0.22 * (1 - eject) : 0;
    this.block.position.y = w.chamber === "loaded" ? 0 : -0.5;
    this.round.visible = w.chamber === "loading";
    this.round.position.set(0, 1.47, 1.15 - w.loadProgress * 1.65);
    this.case.visible =
      w.chamber === "ejecting" ||
      (w.shotsFired > 0 && recovery >= 0 && recovery < 0.25);
    const flight =
      w.chamber === "ejecting" ? eject : 1 + Math.max(0, recovery) * 3;
    this.case.position.set(
      flight * 0.72,
      1.47 - flight * flight * 0.4,
      -0.45 + flight * 2.0,
    );
    this.case.rotation.z = flight * 0.7;
    const tilt = stunned && !this.reducedMotion ? 0.025 : 0;
    this.camera.position.set(1.35, w.crouching ? 0.74 : 1.9, 1.55);
    this.camera.lookAt(-0.05, w.crouching ? 1.12 : 1.35, -0.7);
    this.camera.rotation.z = tilt;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.disposed = true;
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
    for (const texture of this.textures) texture.dispose();
    this.renderer.dispose();
  }
}
