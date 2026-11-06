import * as THREE from "three";
import { SmokeScene } from "./tank-smoke-scene";
import { BATTLEFIELD, type TankState } from "./tank-core";

/** The gunner's real 3D view; no renderer is created for the blind driver. */
export class TankScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private smoke = new SmokeScene(this.scene);
  private camera = new THREE.PerspectiveCamera(65, 1, 0.1, 180);
  private tank = new THREE.Group();
  private turret = new THREE.Group();
  private elevation = new THREE.Group();
  private observer: ResizeObserver;
  private targetMeshes = new Map<number, THREE.Group>();
  private enemyTurrets = new Map<number, THREE.Group>();
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
      this.turret,
    );
    this.tank.add(this.turret);
    this.turret.add(this.elevation);
    this.elevation.position.set(0, 2.48, -0.3);
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
      0,
      -2.7,
      this.elevation,
    );
    barrel.rotation.x = Math.PI / 2;
    this.scene.add(this.tank);
    if (this.view === "machine-gun") {
      // Receiver, perforated barrel jacket and rear sight remain below the sight line.
      const mount = new THREE.Group();
      mesh(
        new THREE.BoxGeometry(0.18, 0.19, 0.48),
        steel,
        0.26,
        -0.32,
        -0.65,
        mount,
      );
      const jacket = mesh(
        new THREE.CylinderGeometry(0.045, 0.055, 0.65, 12),
        steel,
        0.26,
        -0.29,
        -1.18,
        mount,
      );
      jacket.rotation.x = Math.PI / 2;
      for (let i = 0; i < 7; i++)
        mesh(
          new THREE.BoxGeometry(0.052, 0.014, 0.018),
          material(0x161b1b),
          0.26,
          -0.244,
          -0.92 - i * 0.075,
          mount,
        );
      mesh(
        new THREE.BoxGeometry(0.026, 0.09, 0.026),
        steel,
        0.26,
        -0.19,
        -0.48,
        mount,
      );
      this.camera.add(mount);
      this.scene.add(this.camera);
    }
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
    this.tank.visible = this.view !== "machine-gun";
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
    for (const [id, mesh] of this.targetMeshes) {
      if (!state.weapon.targets.some((target) => target.id === id)) {
        this.scene.remove(mesh);
        mesh.traverse((part) => {
          if (part instanceof THREE.Mesh) {
            part.geometry.dispose();
            for (const material of Array.isArray(part.material) ? part.material : [part.material]) material.dispose();
          }
        });
        this.targetMeshes.delete(id);
        this.enemyTurrets.delete(id);
      }
    }
    for (const target of state.weapon.targets) {
      let mesh = this.targetMeshes.get(target.id);
      if (!mesh) {
        mesh = new THREE.Group();
        const paint = new THREE.MeshStandardMaterial({
          color: target.kind === "tiger" ? 0x807761 : 0x6d7158,
          roughness: 0.85,
          metalness: 0.25,
        });
        const steel = new THREE.MeshStandardMaterial({
          color: 0x353a36,
          roughness: 0.9,
        });
        const part = (
          w: number,
          h: number,
          d: number,
          x: number,
          y: number,
          z: number,
          parent: THREE.Group,
          material = paint,
        ) => {
          const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
          body.position.set(x, y, z);
          body.castShadow = true;
          body.receiveShadow = true;
          parent.add(body);
          return body;
        };
        part(target.width - 0.5, 1.2, target.depth, 0, 1.1, 0, mesh);
        for (const side of [-1, 1]) {
          part(
            0.5,
            1.1,
            target.depth,
            side * (target.width / 2 - 0.25),
            0.65,
            0,
            mesh,
            steel,
          );
          for (let n = 0; n < 6; n++) {
            const wheel = new THREE.Mesh(
              new THREE.CylinderGeometry(0.43, 0.43, 0.55, 10),
              paint,
            );
            wheel.rotation.z = Math.PI / 2;
            wheel.position.set(
              side * (target.width / 2 - 0.2),
              0.7,
              -target.depth / 2 + 0.6 + (n * (target.depth - 1.2)) / 5,
            );
            mesh.add(wheel);
          }
          if (target.kind === "panzer")
            part(
              0.08,
              0.9,
              target.depth * 0.88,
              (side * target.width) / 2,
              1.35,
              0,
              mesh,
            );
        }
        const turret = new THREE.Group();
        mesh.add(turret);
        part(
          target.width * 0.66,
          1,
          target.kind === "tiger" ? 2.5 : 2.1,
          0,
          2.2,
          0,
          turret,
        );
        part(
          0.18,
          0.18,
          target.kind === "tiger" ? 4.2 : 3.4,
          0,
          2.45,
          -2.6,
          turret,
          steel,
        );
        this.enemyTurrets.set(target.id, turret);
        this.scene.add(mesh);
        this.targetMeshes.set(target.id, mesh);
      }
      mesh.position.set(target.x, 0, target.z);
      mesh.rotation.y = -target.yaw;
      this.enemyTurrets.get(target.id)!.rotation.y = -(
        target.turretYaw - target.yaw
      );
      mesh.scale.y = target.hp > 0 ? 1 : 0.25;
      mesh.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          const material = object.material as THREE.MeshStandardMaterial;
          material.emissive.setHex(
            target.hp <= 0
              ? 0x100c08
              : target.phase === "warning"
                ? 0x793512
                : 0,
          );
        }
      });
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
    for (const line of this.mgTracers.values()) {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    this.renderer.dispose();
  }
}
