import * as THREE from "three";
import { STILL_HEAD } from "./tank-camera-motion";
import { applyHeadOffset, headStamp } from "./tank-head-camera";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { type TankState } from "./tank-core";
import {
  VehicleModel,
  buildBrowning,
  preloadVehicles,
  noteRenderer,
} from "./tank-vehicle-model";
import { buildHill192, HILL_192_LIGHT } from "./hill192-environment";
import { buildNormandy } from "./tank-environment";
import { ArtPreparation, finishPreparation } from "./tank-art-preparation";
import { disposeArt } from "./tank-art-materials";
import { SmokeScene } from "./tank-smoke-scene";
import { MuzzleFlash } from "./tank-muzzle-flash";
import {
  PlayerCannonBlast,
  CANNON_BLAST_SECONDS,
  cannonShotAge,
} from "./tank-cannon-blast";
import { BattleEffects } from "./tank-battle-effects";
import { FIRING_FEEDBACK } from "./tank-settings";
import { battleProjection, battleView } from "./tank-battle-view";
import { buildDriverArmour } from "./tank-driver-armour";
import { TankDriverControls } from "./tank-driver-controls";
import { TankGunnerControls } from "./tank-gunner-controls";
import { TankLoaderMachineGun } from "./tank-loader-machine-gun";
import { scenePixelRatio, type SceneQuality } from "./tank-scene-quality";

/** Metres from the eye within which an enemy tank keeps full detail. */
const LOD_RANGE = 28;

/** Role-specific exterior presentation; authority alone moves the shared hull. */
export class TankScene {
  private renderer!: THREE.WebGLRenderer;
  private disposed = false;
  private sky?: THREE.DataTexture;
  private lastVisual = "";
  private lastShadow = "";
  private lastDraw = -Infinity;
  private scene = new THREE.Scene();
  private smoke = new SmokeScene(this.scene);
  private cannonBlast!: PlayerCannonBlast;
  private effects!: BattleEffects;
  private mgFlash!: MuzzleFlash;
  private mgMuzzle = new THREE.Group();
  /** The loader's M2 on its cradle; it bucks back with every round. */
  private mgMount?: THREE.Object3D;
  private loaderMachineGun?: TankLoaderMachineGun;
  private loaderMachineGunReady?: Promise<boolean>;
  private mgRest = new THREE.Vector3();
  private mgKick = { shots: -1, at: -100 };
  private mgEject = new THREE.Group();
  private enemyFlashes = new Map<number, MuzzleFlash>();
  private camera = new THREE.PerspectiveCamera(65, 1, 0.1, 180);
  private mount = new THREE.Group();
  private sightDirection = new THREE.Vector3();
  private sight?: HTMLElement;
  private assets = new ArtPreparation();
  private environment = new AbortController();
  private fieldPrepared = false;
  private hill192 = false;
  private hill192Art?: ReturnType<typeof buildHill192>;
  private sun!: THREE.DirectionalLight;
  private driverArmour?: Promise<boolean>;
  private driverControls?: TankDriverControls;
  private driverControlsReady?: Promise<boolean>;
  private gunnerControls?: TankGunnerControls;
  private gunnerControlsReady?: Promise<boolean>;
  private player!: VehicleModel;
  private width = 0;
  private height = 0;
  private tank!: THREE.Group;
  private turret!: THREE.Group;
  private elevation!: THREE.Group;
  private observer?: ResizeObserver;
  private targetMeshes = new Map<number, THREE.Group>();
  private enemyModels = new Map<number, VehicleModel>();
  private enemyProjectiles = new Map<number, THREE.Mesh>();
  private projectileMeshes = new Map<number, THREE.Mesh>();
  private mgTracers = new Map<number, THREE.Line>();
  private lensSize = new THREE.Vector2();
  constructor(
    private canvas: HTMLCanvasElement,
    private view: "gunner" | "machine-gun" | "driver" = "gunner",
    private quality: SceneQuality = "medium",
  ) {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      this.build();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  private build() {
    this.cannonBlast = new PlayerCannonBlast(this.scene, this.assets.manager);
    this.effects = new BattleEffects(this.scene, this.quality);
    this.mgFlash = new MuzzleFlash(this.scene, 0.22);
    const software = noteRenderer(this.renderer);
    this.player = new VehicleModel("sherman", this.assets.manager);
    this.tank = this.player.root;
    this.turret = this.player.turret;
    this.elevation = this.player.elevation;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.scene.background = new THREE.Color(0xb9c7c7);
    this.scene.fog = new THREE.Fog(0xb9c7c7, 65, 190);
    this.scene.add(new THREE.HemisphereLight(0xd9e3e9, 0x64654c, 1.25));
    const sun = (this.sun = new THREE.DirectionalLight(0xffefd6, 2.3));
    sun.position.set(-25, 40, 15);
    sun.castShadow = true;
    // Baked tank detail needs a finer shadow map on the target discrete GPU;
    // a software rasteriser keeps the old coarse map (and procedural tanks).
    const shadow = software ? 512 : 2048;
    sun.shadow.mapSize.set(shadow, shadow);
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
    preloadVehicles(this.assets.manager);
    this.scene.add(this.tank);
    this.scene.add(this.mount);
    if (this.view === "driver") {
      this.driverArmour = buildDriverArmour(
        this.mount,
        this.assets.manager,
        () => this.disposed,
      ).catch(() => false);
      this.driverControlsReady = TankDriverControls.load(
        this.assets.manager,
        () => this.disposed,
      )
        .then((controls) => {
          if (!controls) return false;
          if (this.disposed) {
            disposeArt(controls.root);
            return false;
          }
          this.driverControls = controls;
          this.mount.add(controls.root);
          this.lastVisual = "";
          return true;
        })
        .catch(() => false);
    }
    if (this.view === "gunner") {
      this.gunnerControlsReady = TankGunnerControls.load(
        this.assets.manager,
        () => this.disposed,
      )
        .then((controls) => {
          if (!controls) return false;
          if (this.disposed) {
            disposeArt(controls.root);
            return false;
          }
          this.gunnerControls = controls;
          this.mount.add(controls.root);
          this.lastVisual = "";
          return true;
        })
        .catch(() => false);
    }
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
      const gun = buildBrowning(
        this.mount,
        steel,
        paint,
        0,
        -0.24,
        -0.7,
        this.assets.manager,
        true,
      );
      const mount = gun.root;
      this.mgMuzzle.position.z = -1.68;
      mount.add(this.mgMuzzle);
      this.mgMount = mount;
      this.mgEject.position.set(0, -0.11, -0.2);
      mount.add(this.mgEject);
      this.mgRest.copy(mount.position);
      mount.traverse((object) => {
        if (object instanceof THREE.Mesh) object.castShadow = false;
      });
      this.loaderMachineGunReady = TankLoaderMachineGun.load(
        gun,
        this.assets.manager,
        () => this.disposed,
      )
        .then((operator) => {
          if (!operator) return false;
          if (this.disposed) {
            disposeArt(operator.root);
            return false;
          }
          this.loaderMachineGun = operator;
          this.mount.add(operator.root);
          this.lastVisual = "";
          return true;
        })
        .catch(() => false);
    }
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.canvas);
    this.resize();
  }
  setQuality(quality: SceneQuality) {
    if (this.quality === quality) return;
    this.quality = quality;
    this.resize(true);
  }
  private resize(force = false) {
    // Hidden/detached retained canvases keep their real buffer. Never reallocate at 1px.
    const w = this.canvas.clientWidth,
      h = this.canvas.clientHeight;
    const width = w || this.width || 1024,
      height = h || this.height || 576;
    if (!force && width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.renderer.setDrawingBufferSize(
      width,
      height,
      scenePixelRatio(width, height, this.quality),
    );
    this.camera.aspect = width / height;
    this.camera.fov = THREE.MathUtils.radToDeg(
      battleProjection(this.view, this.camera.aspect).verticalFov,
    );
    this.camera.updateProjectionMatrix();
    this.lastVisual = "";
  }
  private prepareField(state: TankState) {
    if (this.fieldPrepared) return;
    this.fieldPrepared = true;
    this.hill192 = state.occupation?.levelId === "hill-192";
    if (this.hill192) {
      this.hill192Art = buildHill192(
        this.scene,
        this.environment.signal,
        this.assets.manager,
      );
      this.scene.fog = new THREE.Fog(0xb9c2bf, 162, 715);
      this.scene.backgroundRotation.y = HILL_192_LIGHT.skyYaw;
      this.scene.environmentRotation.y = HILL_192_LIGHT.skyYaw;
      this.sun.intensity = 1.24;
      this.sun.color.setHex(0xffedce);
      this.sun.shadow.normalBias = 0.025;
      this.sun.shadow.radius = 2;
      this.camera.far = 740;
      this.camera.updateProjectionMatrix();
      this.scene.add(this.sun.target);
    } else {
      buildNormandy(this.scene, this.environment.signal, this.assets.manager);
    }
  }
  async prepare(state: TankState) {
    this.prepareField(state);
    await this.assets.wait();
    const driverArmourReady = await this.driverArmour;
    const driverControlsReady = await this.driverControlsReady;
    const gunnerControlsReady = await this.gunnerControlsReady;
    const loaderMachineGunReady = await this.loaderMachineGunReady;
    if (this.disposed) throw new Error("視野準備已取消。");
    if (driverArmourReady === false)
      throw new Error("無法載入駕駛觀察窗，請重試準備。");
    if (driverControlsReady === false)
      throw new Error("無法載入駕駛動作，請重試準備。");
    if (gunnerControlsReady === false)
      throw new Error("無法載入砲手動作，請重試準備。");
    if (loaderMachineGunReady === false)
      throw new Error("無法載入車頂機槍動作，請重試準備。");
    this.render(state); // Instantiate authority-provided vehicle art, without advancing any rules.
    await this.assets.wait();
    if (this.disposed) throw new Error("視野準備已取消。");
    await this.renderer.compileAsync(this.scene, this.camera);
    if (this.disposed) throw new Error("視野準備已取消。");
    this.lastVisual = "";
    this.render(state);
    await finishPreparation(this.renderer, () => this.disposed);
  }
  leaveMachineGun() {
    this.loaderMachineGun?.leave();
  }
  render(state: TankState, offset = STILL_HEAD, held = 0) {
    this.prepareField(state);
    const t = state.tank;
    const height = t.y ?? 0;
    // Render state is a local GPU concern. Simulation/network clocks keep running at full cadence.
    const pose = [
      t.x,
      height,
      t.z,
      t.yaw,
      t.pitch,
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
    const shotAge = cannonShotAge(state);
    const animated =
      state.weapon.smoke.some((c) => state.time < c.until) ||
      state.weapon.impacts.length > 0 ||
      shotAge < CANNON_BLAST_SECONDS ||
      state.time < state.weapon.mg.flashUntil ||
      state.weapon.targets.some((e) => state.time < e.flashUntil) ||
      state.weapon.targets.some((e) => e.hp <= 0) ||
      this.effects.busy ||
      state.time - this.mgKick.at < 0.15;
    const aimState =
      this.view === "machine-gun" ? state.weapon.mg : state.turret;
    const visual = [
      pose,
      headStamp(offset),
      this.driverControls?.advance(state.time, held),
      this.gunnerControls && state.turret.yawRate,
      this.gunnerControls && state.turret.pitchRate,
      this.loaderMachineGun?.stamp(state.weapon, state.time),
      aimState.yaw,
      aimState.pitch,
      state.weapon.targets.map((e) => e.phase).join(),
      state.weapon.projectiles.map((p) => [p.id, p.x, p.y, p.z].join()).join(),
      state.battle.projectiles.map((p) => [p.id, p.x, p.y, p.z].join()).join(),
      state.weapon.mg.tracers.map((p) => p.id).join(),
      (state.weapon.bow?.tracers ?? []).map((p) => p.id).join(),
      state.weapon.shotsFired,
      state.battle.lastHitAt,
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
    this.tank.visible = this.view === "gunner";
    this.player.animate(t.x, t.z, t.yaw);
    const fired =
      shotAge < CANNON_BLAST_SECONDS ? state.weapon.lastShotPose : undefined;
    // Sample the model's own pivots at fire time, then draw it at the current pose.
    this.posePlayer(
      fired?.x ?? t.x,
      fired?.z ?? t.z,
      fired ? (fired.y ?? 0) : height,
      fired?.hullYaw ?? t.yaw,
      fired?.turretYaw ??
        (fired ? fired.yaw - fired.hullYaw : state.turret.yaw),
      fired?.turretPitch ?? fired?.pitch ?? state.turret.pitch,
      fired ? fired.hullPitch : t.pitch,
    );
    this.cannonBlast.present(
      this.player.muzzle,
      state.weapon.shotsFired,
      shotAge,
    );
    if (fired)
      this.posePlayer(
        t.x,
        t.z,
        height,
        t.yaw,
        state.turret.yaw,
        state.turret.pitch,
        t.pitch,
      );
    const view = battleView(
      t,
      this.view === "machine-gun" ? state.weapon.mg : state.turret,
      this.view,
    );
    this.camera.position.set(view.x, view.y, view.z);
    this.camera.lookAt(
      view.x + Math.sin(view.yaw) * Math.cos(view.pitch) * 40,
      view.y + Math.sin(view.pitch) * 40,
      view.z - Math.cos(view.yaw) * Math.cos(view.pitch) * 40,
    );
    if (this.hill192) {
      const [east, up, south] = HILL_192_LIGHT.sun;
      this.sun.position.set(
        t.x + east * 68,
        height + up * 68,
        t.z + south * 68,
      );
      this.sun.target.position.set(t.x, height, t.z);
      this.hill192Art?.update(t.x, t.z);
    }
    this.mount.position.copy(this.camera.position);
    this.mount.quaternion.copy(this.camera.quaternion);
    this.camera.getWorldDirection(this.sightDirection);
    applyHeadOffset(this.camera, offset, this.view === "driver");
    this.driverControls?.pose(offset);
    this.gunnerControls?.pose(state.turret, offset);
    if (this.view !== "driver") {
      this.sight ??=
        this.canvas.parentElement?.querySelector<HTMLElement>(".sight") ??
        undefined;
      if (this.sight) {
        // Project a direction, independent of range or obscured geometry.
        this.sightDirection.add(this.camera.position);
        this.camera.updateMatrixWorld();
        this.sightDirection.project(this.camera);
        this.sight.style.left = `${50 + this.sightDirection.x * 50}%`;
        this.sight.style.top = `${50 - this.sightDirection.y * 50}%`;
      }
    }
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
      // Decimated meshes past close range keep many baked tanks affordable.
      model.setDetail(
        Math.hypot(
          target.x - this.camera.position.x,
          target.z - this.camera.position.z,
        ) < LOD_RANGE,
      );
      mesh.position.set(target.x, target.y ?? 0, target.z);
      mesh.rotation.y = -target.yaw;
      model.turret.rotation.y = -(target.turretYaw - target.yaw);
      model.setCondition(target.hp > 0, target.phase === "warning");
      // A disabled vehicle stays a recognisable wreck rather than flattening into a toy.
      model.elevation.rotation.x = target.hp > 0 ? 0 : -0.12;
      this.effects.popTurret(target.id, model.turret);
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
    if (this.mgMount) {
      const mg = state.weapon.mg;
      if (this.mgKick.shots >= 0 && mg.shots > this.mgKick.shots)
        this.mgKick.at = state.time;
      this.mgKick.shots = mg.shots;
      // A sharp rearward buck that settles before the next round.
      const since = state.time - this.mgKick.at;
      const kick = since >= 0 && since < 0.14 ? Math.exp(-since / 0.035) : 0;
      this.mgMount.position.set(
        this.mgRest.x + Math.sin(this.mgKick.at * 97) * 0.004 * kick,
        this.mgRest.y + 0.008 * kick,
        this.mgRest.z + 0.035 * kick,
      );
      this.mgMount.rotation.x = 0.02 * kick;
      this.loaderMachineGun?.present(state.weapon, state.time);
    }
    if (this.view === "machine-gun")
      this.mgFlash.present(
        this.mgMuzzle,
        state.weapon.mg.flashUntil,
        state.time,
        FIRING_FEEDBACK.machineGun,
      );
    this.smoke.render(state.weapon.smoke, state.time);
    this.renderEffects(state);
    this.effects.update(state, {
      enemyMuzzle: (id) => this.enemyModels.get(id)?.muzzle,
      mg: this.mgMount
        ? { muzzle: this.mgMuzzle, eject: this.mgEject }
        : undefined,
    });
    this.effects.recoilBarrel(this.elevation);
    this.effects.rockHull(this.tank, state.turret.yaw, t.pitch);
    this.effects.setLens(
      this.camera,
      this.renderer.getDrawingBufferSize(this.lensSize).y,
    );
    this.renderer.render(this.scene, this.camera);
  }
  private posePlayer(
    x: number,
    z: number,
    height: number,
    hullYaw: number,
    turretYaw: number,
    pitch: number,
    hullPitch?: number,
  ) {
    this.tank.position.set(x, height, z);
    if (hullPitch === undefined) this.tank.rotation.y = -hullYaw;
    else this.tank.rotation.set(hullPitch, -hullYaw, 0, "YXZ");
    this.turret.rotation.y = -turretYaw;
    this.elevation.rotation.x = pitch;
  }
  private renderEffects(state: TankState) {
    for (const [id, line] of this.mgTracers) {
      if (
        !state.weapon.mg.tracers.some((t) => t.id === id) &&
        !(state.weapon.bow?.tracers ?? []).some((t) => t.id + 1e6 === id)
      ) {
        this.scene.remove(line);
        line.geometry.dispose();
        (line.material as THREE.Material).dispose();
        this.mgTracers.delete(id);
      }
    }
    // Bow-gun tracers share the drawing path; their ids live above 1e6.
    const tracers = [
      ...state.weapon.mg.tracers,
      ...(state.weapon.bow?.tracers ?? []).map((t) => ({
        ...t,
        id: t.id + 1e6,
      })),
    ];
    for (const t of tracers) {
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
    // Impacts are drawn by BattleEffects (fireball, dirt, sparks, smoke).
  }
  private removeEffect(mesh: THREE.Mesh) {
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.assets.cancel();
    this.environment.abort();
    this.sky?.dispose();
    this.cannonBlast?.dispose();
    this.effects?.dispose();
    this.mgFlash?.dispose();
    for (const flash of this.enemyFlashes.values()) flash.dispose();
    this.enemyFlashes.clear();
    this.observer?.disconnect();
    if (this.player) {
      this.scene.remove(this.player.root);
      this.player.dispose();
    }
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
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
  }
}
