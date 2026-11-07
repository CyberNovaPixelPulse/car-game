import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { type TankState } from "./tank-core";
import { VehicleModel, buildBrowning } from "./tank-vehicle-model";
import { buildNormandy } from "./tank-environment";
import { ArtPreparation, finishPreparation } from "./tank-art-preparation";
import { disposeArt } from "./tank-art-materials";
import { SmokeScene } from "./tank-smoke-scene";
import { MuzzleFlash } from "./tank-muzzle-flash";
import { FIRING_FEEDBACK } from "./tank-settings";

/** The gunner's real 3D view; no renderer is created for the blind driver. */
export class TankScene {
  private renderer: THREE.WebGLRenderer;
  private disposed = false;
  private sky?: THREE.DataTexture;
  private lastVisual = "";
  private lastShadow = "";
  private lastDraw = -Infinity;
  private scene = new THREE.Scene();
  private smoke = new SmokeScene(this.scene);
  private cannonFlash = new MuzzleFlash(this.scene, 0.6);
  private mgFlash = new MuzzleFlash(this.scene, 0.22);
  private mgMuzzle = new THREE.Group();
  private enemyFlashes = new Map<number, MuzzleFlash>();
  private camera = new THREE.PerspectiveCamera(65, 1, 0.1, 180);
  private assets = new ArtPreparation();
  private player = new VehicleModel("sherman", this.assets.manager);
  private width = 0;
  private height = 0;
  private tank = this.player.root;
  private turret = this.player.turret;
  private elevation = this.player.elevation;
  private observer: ResizeObserver;
  private targetMeshes = new Map<number, THREE.Group>();
  private enemyModels = new Map<number, VehicleModel>();
  private enemyProjectiles = new Map<number, THREE.Mesh>();
  private projectileMeshes = new Map<number, THREE.Mesh>();
  private mgTracers = new Map<number, THREE.Line>();
  private impactMeshes = new Map<number, THREE.Mesh>();
  constructor(
    private canvas: HTMLCanvasElement,
    private view: "gunner" | "machine-gun" = "gunner",
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.scene.background = new THREE.Color(0xb9c7c7);
    this.scene.fog = new THREE.Fog(0xb9c7c7, 65, 190);
    this.scene.add(new THREE.HemisphereLight(0xd9e3e9, 0x64654c, 1.25));
    const sun = new THREE.DirectionalLight(0xffefd6, 2.3);
    sun.position.set(-25, 40, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(512, 512);
    Object.assign(sun.shadow.camera, {
      left: -48,
      right: 48,
      top: 48,
      bottom: -48,
      far: 110,
    });
    this.scene.add(sun);
    new HDRLoader(this.assets.manager).load(
      "/art/sky/kloofendal_48d_partly_cloudy_puresky_1k.hdr",
      (texture) => {
        if (this.disposed) {
          texture.dispose();
          return;
        }
        texture.mapping = THREE.EquirectangularReflectionMapping;
        this.sky = texture;
        this.scene.background = texture;
        this.scene.environment = texture;
        this.scene.environmentIntensity = 0.35;
        this.scene.backgroundIntensity = 0.8;
      },
    );
    buildNormandy(this.scene, this.assets.manager);
    this.scene.add(this.tank);
    if (this.view === "machine-gun") {
      const steel = new THREE.MeshStandardMaterial({
        color: 0x434a43,
        roughness: 0.65,
        metalness: 0.72,
      });
      const paint = new THREE.MeshStandardMaterial({
        color: 0x303a2c,
        roughness: 0.9,
      });
      const mount = buildBrowning(
        this.camera,
        steel,
        paint,
        0.25,
        -0.28,
        -0.35,
        this.assets.manager,
      );
      this.mgMuzzle.position.z = -1.68;
      mount.add(this.mgMuzzle);
      mount.traverse((object) => {
        if (object instanceof THREE.Mesh) object.castShadow = false;
      });
      this.scene.add(this.camera);
    }
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
  }
  private resize() {
    // Hidden/detached retained canvases keep their real buffer. Never reallocate at 1px.
    const w = this.canvas.clientWidth,
      h = this.canvas.clientHeight;
    const width = w || this.width || 1024,
      height = h || this.height || 576;
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, 1.5, 1024 / width, 576 / height),
    );
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.lastVisual = "";
  }
  async prepare(state: TankState) {
    await this.assets.wait();
    if (this.disposed) throw new Error("視野準備已取消。");
    this.render(state); // Instantiate authority-provided vehicle art, without advancing any rules.
    await this.assets.wait();
    if (this.disposed) throw new Error("視野準備已取消。");
    await this.renderer.compileAsync(this.scene, this.camera);
    if (this.disposed) throw new Error("視野準備已取消。");
    this.lastVisual = "";
    this.render(state);
    await finishPreparation(this.renderer, () => this.disposed);
  }
  render(state: TankState) {
    const t = state.tank;
    // Render state is a local GPU concern. Simulation/network clocks keep running at full cadence.
    const pose = [
      t.x,
      t.z,
      t.yaw,
      state.turret.yaw,
      state.turret.pitch,
      ...state.weapon.targets.flatMap((e) => [
        e.id,
        e.x,
        e.z,
        e.yaw,
        e.turretYaw,
        e.hp > 0,
      ]),
    ].join(":");
    const animated =
      state.weapon.smoke.some((c) => state.time < c.until) ||
      state.weapon.impacts.length > 0 ||
      state.time < state.weapon.flashUntil ||
      state.time < state.weapon.mg.flashUntil ||
      state.weapon.targets.some((e) => state.time < e.flashUntil);
    const aimState =
      this.view === "machine-gun" ? state.weapon.mg : state.turret;
    const visual = [
      pose,
      aimState.yaw,
      aimState.pitch,
      state.weapon.targets.map((e) => e.phase).join(),
      state.weapon.projectiles.map((p) => [p.id, p.x, p.y, p.z].join()).join(),
      state.battle.projectiles.map((p) => [p.id, p.x, p.y, p.z].join()).join(),
      state.weapon.mg.tracers.map((p) => p.id).join(),
      animated ? state.time : 0,
    ].join("|");
    const now = performance.now();
    // A periodic quiet refresh admits asynchronous texture completions without a global loader hook.
    if (visual === this.lastVisual && now - this.lastDraw < 250) return;
    if (pose !== this.lastShadow) {
      this.renderer.shadowMap.needsUpdate = true;
      this.lastShadow = pose;
    }
    this.lastVisual = visual;
    this.lastDraw = now;
    this.tank.visible = this.view !== "machine-gun";
    this.player.animate(t.x, t.z, t.yaw);
    this.tank.position.set(t.x, 0, t.z);
    this.tank.rotation.y = -t.yaw;
    this.turret.rotation.y = -state.turret.yaw;
    this.elevation.rotation.x = state.turret.pitch;
    const aim = this.view === "machine-gun" ? state.weapon.mg : state.turret;
    const eye = this.view === "machine-gun" ? 3.1 : 2.85;
    const heading = t.yaw + aim.yaw;
    // Gunner remains beyond the roof at the mantlet; MG observes from its hatch.
    const offset = this.view === "machine-gun" ? 0 : 1.9;
    const eyeX = t.x + Math.sin(heading) * offset;
    const eyeZ = t.z - Math.cos(heading) * offset;
    this.camera.position.set(eyeX, eye, eyeZ);
    this.camera.lookAt(
      eyeX + Math.sin(heading) * Math.cos(aim.pitch) * 40,
      eye + Math.sin(aim.pitch) * 40,
      eyeZ - Math.cos(heading) * Math.cos(aim.pitch) * 40,
    );
    // Wave IDs belong to authority. Remove retired groups instead of leaving phantom enemies.
    for (const [id, mesh] of this.targetMeshes) {
      if (!state.weapon.targets.some((target) => target.id === id)) {
        this.scene.remove(mesh);
        this.enemyModels.get(id)?.dispose();
        this.enemyFlashes.get(id)?.dispose();
        this.enemyFlashes.delete(id);
        this.targetMeshes.delete(id);
        this.enemyModels.delete(id);
      }
    }
    for (const target of state.weapon.targets) {
      let model = this.enemyModels.get(target.id);
      if (!model) {
        model = new VehicleModel(target.kind, this.assets.manager);
        this.enemyModels.set(target.id, model);
        this.enemyFlashes.set(target.id, new MuzzleFlash(this.scene, 0.85));
        this.targetMeshes.set(target.id, model.root);
        this.scene.add(model.root);
      }
      const mesh = model.root;
      model.animate(target.x, target.z, target.yaw);
      mesh.position.set(target.x, 0, target.z);
      mesh.rotation.y = -target.yaw;
      model.turret.rotation.y = -(target.turretYaw - target.yaw);
      model.setCondition(target.hp > 0, target.phase === "warning");
      // A disabled vehicle stays a recognisable wreck rather than flattening into a toy.
      model.elevation.rotation.x = target.hp > 0 ? 0 : -0.12;
      this.enemyFlashes
        .get(target.id)!
        .present(
          model.muzzle,
          target.flashUntil,
          state.time,
          FIRING_FEEDBACK.cannon,
        );
    }
    for (const [id, mesh] of this.enemyProjectiles)
      if (!state.battle.projectiles.some((p) => p.id === id)) {
        this.removeEffect(mesh);
        this.enemyProjectiles.delete(id);
      }
    for (const p of state.battle.projectiles) {
      let mesh = this.enemyProjectiles.get(p.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xff9e48 }),
        );
        this.scene.add(mesh);
        this.enemyProjectiles.set(p.id, mesh);
      }
      mesh.position.set(p.x, p.y, p.z);
    }
    this.cannonFlash.present(
      this.player.muzzle,
      state.weapon.flashUntil,
      state.time,
      FIRING_FEEDBACK.cannon,
    );
    if (this.view === "machine-gun")
      this.mgFlash.present(
        this.mgMuzzle,
        state.weapon.mg.flashUntil,
        state.time,
        FIRING_FEEDBACK.machineGun,
      );
    this.smoke.render(state.weapon.smoke, state.time);
    this.renderEffects(state);
    this.renderer.render(this.scene, this.camera);
  }
  private renderEffects(state: TankState) {
    for (const [id, line] of this.mgTracers) {
      if (!state.weapon.mg.tracers.some((t) => t.id === id)) {
        this.scene.remove(line);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
        this.mgTracers.delete(id);
      }
    }
    for (const t of state.weapon.mg.tracers) {
      if (this.mgTracers.has(t.id)) continue;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(t.x, t.y - 0.05, t.z),
          new THREE.Vector3(t.endX, t.endY, t.endZ),
        ]),
        new THREE.LineBasicMaterial({ color: 0xffd491 }),
      );
      this.scene.add(line);
      this.mgTracers.set(t.id, line);
    }
    for (const [id, mesh] of this.projectileMeshes) {
      if (!state.weapon.projectiles.some((p) => p.id === id)) {
        this.removeEffect(mesh);
        this.projectileMeshes.delete(id);
      }
    }
    for (const p of state.weapon.projectiles) {
      let mesh = this.projectileMeshes.get(p.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xffda87 }),
        );
        this.scene.add(mesh);
        this.projectileMeshes.set(p.id, mesh);
      }
      mesh.position.set(p.x, p.y, p.z);
    }
    for (const [id, mesh] of this.impactMeshes) {
      if (!state.weapon.impacts.some((p) => p.id === id)) {
        this.removeEffect(mesh);
        this.impactMeshes.delete(id);
      }
    }
    for (const hit of state.weapon.impacts) {
      let mesh = this.impactMeshes.get(hit.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.5, 10, 8),
          new THREE.MeshBasicMaterial({
            color: 0xd8aa66,
            transparent: true,
            opacity: 0.7,
          }),
        );
        this.scene.add(mesh);
        this.impactMeshes.set(hit.id, mesh);
      }
      mesh.position.set(hit.x, hit.y, hit.z);
      const remaining = Math.max(0, (hit.until - state.time) / 0.6);
      mesh.scale.setScalar(
        (hit.shell === "he" ? 2 : 0.5) * (1 + (1 - remaining) * 2),
      );
      (mesh.material as THREE.MeshBasicMaterial).opacity = remaining * 0.7;
    }
  }
  private removeEffect(mesh: THREE.Mesh) {
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
  dispose() {
    this.disposed = true;
    this.sky?.dispose();
    this.cannonFlash.dispose();
    this.mgFlash.dispose();
    for (const flash of this.enemyFlashes.values()) flash.dispose();
    this.enemyFlashes.clear();
    this.observer.disconnect();
    this.scene.remove(this.player.root);
    this.player.dispose();
    for (const model of this.enemyModels.values()) {
      this.scene.remove(model.root);
      model.dispose();
    }
    this.enemyModels.clear();
    this.targetMeshes.clear();
    disposeArt(this.scene);
    for (const line of this.mgTracers.values()) {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    this.renderer.dispose();
  }
}
