import * as THREE from "three";
import type { TankState } from "./tank-core";
import type { SceneQuality } from "./tank-scene-quality";

/**
 * Presentation-only battle effects in the spirit of arcade tank games:
 * muzzle blasts, glowing tracers, HE fireballs with dirt fountains, AP spark
 * showers, burning wrecks, barrel recoil, hull rock and camera shake.
 * Everything is triggered by snapshot edges and aged by the snapshot clock, so
 * a paused battle freezes its effects and nothing feeds back into the rules.
 */

/** Particle budget and spawn multiplier per local quality setting. */
const BUDGET: Record<SceneQuality, { capacity: number; density: number }> = {
  low: { capacity: 1400, density: 0.55 },
  medium: { capacity: 3200, density: 1 },
  high: { capacity: 5000, density: 1.4 },
};

const RECOIL = {
  /** Barrel travel back into the turret, metres. */
  barrel: 0.42,
  /** Peak hull pitch from the shot, radians. */
  hull: 0.03,
  /** Suspension rebound frequency, Hz. */
  rebound: 1.7,
} as const;

interface Spawn {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  size: [number, number];
  /** Start and end colour; alpha is the fourth channel. */
  from: [number, number, number, number];
  to: [number, number, number, number];
  /** Velocity damping per second. */
  drag?: number;
  /** Downward acceleration; negative rises. */
  gravity?: number;
  spin?: number;
}

const random = (min: number, max: number) => min + Math.random() * (max - min);

function texture(draw: (c: CanvasRenderingContext2D, size: number) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  draw(canvas.getContext("2d")!, 64);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

/** CPU-simulated, GPU-drawn point particles with per-particle size, tint and spin. */
class Particles {
  readonly points: THREE.Points;
  private count = 0;
  private pos: Float32Array;
  private vel: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private size: Float32Array;
  private from: Float32Array;
  private to: Float32Array;
  private drag: Float32Array;
  private gravity: Float32Array;
  private spin: Float32Array;
  private outPos: THREE.BufferAttribute;
  private outSize: THREE.BufferAttribute;
  private outTint: THREE.BufferAttribute;
  private outAngle: THREE.BufferAttribute;
  private material: THREE.ShaderMaterial;

  constructor(
    private capacity: number,
    map: THREE.Texture,
    additive: boolean,
  ) {
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.size = new Float32Array(capacity * 2);
    this.from = new Float32Array(capacity * 4);
    this.to = new Float32Array(capacity * 4);
    this.drag = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.spin = new Float32Array(capacity * 2);
    const geometry = new THREE.BufferGeometry();
    const attribute = (items: number) =>
      new THREE.BufferAttribute(
        new Float32Array(capacity * items),
        items,
      ).setUsage(THREE.DynamicDrawUsage);
    this.outPos = attribute(3);
    this.outSize = attribute(1);
    this.outTint = attribute(4);
    this.outAngle = attribute(1);
    geometry.setAttribute("position", this.outPos);
    geometry.setAttribute("size", this.outSize);
    geometry.setAttribute("tint", this.outTint);
    geometry.setAttribute("angle", this.outAngle);
    geometry.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: !additive,
      // Additive glow close to the lens is damped so the gunner's own shot
      // reads as a flash, not a white screen.
      uniforms: {
        map: { value: map },
        scale: { value: 500 },
        nearGlow: { value: additive ? 0.35 : 1 },
      },
      vertexShader: `attribute float size;
        attribute vec4 tint;
        attribute float angle;
        uniform float scale;
        uniform float nearGlow;
        varying vec4 vTint;
        varying float vAngle;
        void main() {
          vec4 view = modelViewMatrix * vec4(position, 1.0);
          float depth = max(0.05, -view.z);
          // Fade puffs that sit on the lens instead of filling the screen.
          vTint = vec4(tint.rgb, tint.a * smoothstep(0.6, 2.4, depth) * mix(nearGlow, 1.0, smoothstep(2.0, 8.0, depth)));
          vAngle = angle;
          gl_Position = projectionMatrix * view;
          gl_PointSize = size * scale / depth;
        }`,
      fragmentShader: `uniform sampler2D map;
        varying vec4 vTint;
        varying float vAngle;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float c = cos(vAngle), s = sin(vAngle);
          p = mat2(c, -s, s, c) * p + 0.5;
          vec4 texel = texture2D(map, p);
          float alpha = texel.a * vTint.a;
          if (alpha < 0.004) discard;
          gl_FragColor = vec4(vTint.rgb * texel.rgb, alpha);
        }`,
    });
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
  }

  get alive() {
    return this.count;
  }

  spawn(s: Spawn) {
    // When full, recycle the oldest-looking slot rather than dropping the blast.
    const i =
      this.count < this.capacity
        ? this.count++
        : Math.floor(Math.random() * this.capacity);
    this.pos.set([s.position.x, s.position.y, s.position.z], i * 3);
    this.vel.set([s.velocity.x, s.velocity.y, s.velocity.z], i * 3);
    this.age[i] = 0;
    this.life[i] = s.life;
    this.size.set(s.size, i * 2);
    this.from.set(s.from, i * 4);
    this.to.set(s.to, i * 4);
    this.drag[i] = s.drag ?? 0;
    this.gravity[i] = s.gravity ?? 0;
    this.spin.set(
      [Math.random() * Math.PI * 2, s.spin ?? random(-1, 1)],
      i * 2,
    );
  }

  clear() {
    this.count = 0;
    this.points.geometry.setDrawRange(0, 0);
  }

  lens(scale: number) {
    this.material.uniforms.scale.value = scale;
  }

  step(dt: number) {
    let i = 0;
    while (i < this.count) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.move(this.count - 1, i);
        this.count--;
        continue;
      }
      const damping = Math.exp(-this.drag[i] * dt);
      for (let k = 0; k < 3; k++) {
        this.vel[i * 3 + k] *= damping;
        this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
      }
      this.vel[i * 3 + 1] -= this.gravity[i] * dt;
      // Debris bounces off the ground once instead of sinking through it.
      if (this.pos[i * 3 + 1] < 0.05 && this.vel[i * 3 + 1] < 0) {
        this.pos[i * 3 + 1] = 0.05;
        this.vel[i * 3 + 1] *= -0.25;
        this.vel[i * 3] *= 0.5;
        this.vel[i * 3 + 2] *= 0.5;
      }
      this.spin[i * 2] += this.spin[i * 2 + 1] * dt;
      const t = this.age[i] / this.life[i];
      // Quick fade-in, eased fade-out.
      const envelope = Math.min(1, t / 0.06) * (1 - t * t);
      this.outPos.setXYZ(
        i,
        this.pos[i * 3],
        this.pos[i * 3 + 1],
        this.pos[i * 3 + 2],
      );
      this.outSize.setX(
        i,
        this.size[i * 2] +
          (this.size[i * 2 + 1] - this.size[i * 2]) * Math.sqrt(t),
      );
      const mix = (k: number) =>
        this.from[i * 4 + k] + (this.to[i * 4 + k] - this.from[i * 4 + k]) * t;
      this.outTint.setXYZW(i, mix(0), mix(1), mix(2), mix(3) * envelope);
      this.outAngle.setX(i, this.spin[i * 2]);
      i++;
    }
    for (const attribute of [
      this.outPos,
      this.outSize,
      this.outTint,
      this.outAngle,
    ]) {
      attribute.needsUpdate = true;
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, Math.max(1, this.count) * attribute.itemSize);
    }
    this.points.geometry.setDrawRange(0, this.count);
  }

  private move(from: number, to: number) {
    if (from === to) return;
    const copy = (array: Float32Array, n: number) =>
      array.copyWithin(to * n, from * n, from * n + n);
    copy(this.pos, 3);
    copy(this.vel, 3);
    copy(this.age, 1);
    copy(this.life, 1);
    copy(this.size, 2);
    copy(this.from, 4);
    copy(this.to, 4);
    copy(this.drag, 1);
    copy(this.gravity, 1);
    copy(this.spin, 2);
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

export interface EffectAnchors {
  playerMuzzle: THREE.Object3D;
  enemyMuzzle(id: number): THREE.Object3D | undefined;
  view: "gunner" | "machine-gun" | "driver";
}

export class BattleEffects {
  private glow: Particles;
  private smoke: Particles;
  private maps: THREE.Texture[];
  private lights: THREE.PointLight[] = [];
  private flashes: {
    light: THREE.PointLight;
    until: number;
    peak: number;
    length: number;
  }[] = [];
  private density: number;
  private time = 0;
  private primed = false;
  private shots = 0;
  private firedAt = -100;
  private hitAt = -100;
  private shake = { until: -100, strength: 0, length: 1 };
  private enemyFlash = new Map<number, number>();
  private enemyHp = new Map<number, number>();
  private impacts = new Set<number>();
  private trails = new Map<number, THREE.Vector3>();
  private delayed: { at: number; run: () => void }[] = [];
  private wreckClock = 0;
  private recoilOffset = new THREE.Vector3();
  private rings!: Particles;
  /** Burning fragments that streak fire behind them, like fireworks. */
  private embers: {
    p: THREE.Vector3;
    v: THREE.Vector3;
    age: number;
    life: number;
    hot: boolean;
  }[] = [];
  private decals: {
    mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    born: number;
    life: number;
    radius: number;
    kind: "shock" | "scorch";
  }[] = [];
  private decalPool: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshBasicMaterial
  >[] = [];
  private deathAt = new Map<number, number>();
  private turretOffset = new Map<number, THREE.Vector3>();
  private listener = new THREE.Vector3();
  private scratch = new THREE.Vector3();
  private forward = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    quality: SceneQuality,
  ) {
    const budget = BUDGET[quality];
    this.density = budget.density;
    const glowMap = texture((c, n) => {
      const g = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.25, "rgba(255,255,255,0.75)");
      g.addColorStop(0.6, "rgba(255,255,255,0.18)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, n, n);
    });
    // A lumpy cloud made of overlapping soft blobs reads as smoke, not a disc.
    const puffMap = texture((c, n) => {
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * n * 0.22;
        const x = n / 2 + Math.cos(a) * r;
        const y = n / 2 + Math.sin(a) * r;
        const radius = n * (0.12 + Math.random() * 0.16);
        const g = c.createRadialGradient(x, y, 0, x, y, radius);
        const shade = 200 + Math.floor(Math.random() * 55);
        g.addColorStop(0, `rgba(${shade},${shade},${shade},0.32)`);
        g.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
        c.fillStyle = g;
        c.fillRect(0, 0, n, n);
      }
    });
    // A bright ring for the expanding shockwave.
    const ringMap = texture((c, n) => {
      const g = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.62, "rgba(255,255,255,0)");
      g.addColorStop(0.82, "rgba(255,255,255,1)");
      g.addColorStop(0.9, "rgba(255,255,255,0.5)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, n, n);
    });
    const scorchMap = texture((c, n) => {
      const g = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      g.addColorStop(0, "rgba(10,8,6,0.95)");
      g.addColorStop(0.55, "rgba(25,18,12,0.75)");
      g.addColorStop(1, "rgba(40,30,20,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, n, n);
    });
    this.maps = [glowMap, puffMap, ringMap, scorchMap];
    this.rings = new Particles(96, ringMap, true);
    scene.add(this.rings.points);
    // Ground decals: expanding shock rings and lingering scorch marks.
    for (let i = 0; i < 14; i++) {
      const shock = i < 5;
      const mesh = new THREE.Mesh(
        shock
          ? new THREE.RingGeometry(0.82, 1, 56)
          : new THREE.CircleGeometry(1, 32),
        new THREE.MeshBasicMaterial({
          map: shock ? null : scorchMap,
          color: shock ? 0xffb35a : 0xffffff,
          transparent: true,
          depthWrite: false,
          blending: shock ? THREE.AdditiveBlending : THREE.NormalBlending,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          toneMapped: !shock,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.userData.shock = shock;
      scene.add(mesh);
      this.decalPool.push(mesh);
    }
    this.glow = new Particles(
      Math.floor(budget.capacity * 0.45),
      glowMap,
      true,
    );
    this.smoke = new Particles(
      Math.floor(budget.capacity * 0.55),
      puffMap,
      false,
    );
    scene.add(this.smoke.points, this.glow.points);
    // Fixed light count: adding lights mid-battle would recompile every material.
    for (let i = 0; i < 2; i++) {
      const light = new THREE.PointLight(0xffb060, 0, 30, 1.6);
      light.castShadow = false;
      scene.add(light);
      this.lights.push(light);
    }
  }

  /** True while anything is still moving, so the scene keeps drawing frames. */
  get busy() {
    return (
      this.glow.alive + this.smoke.alive + this.rings.alive > 0 ||
      this.embers.length > 0 ||
      this.decals.length > 0 ||
      this.time - this.firedAt < 1.4 ||
      this.time < this.shake.until ||
      this.delayed.length > 0
    );
  }

  update(state: TankState, anchors: EffectAnchors) {
    const now = state.time;
    if (now < this.time - 0.5) this.reset();
    const dt = Math.min(0.1, Math.max(0, now - this.time));
    this.time = now;
    const w = state.weapon;
    this.listener.set(state.tank.x, 1.5, state.tank.z);
    if (!this.primed) {
      this.primed = true;
      this.shots = w.shotsFired;
      this.hitAt = state.battle.lastHitAt;
      for (const t of w.targets) {
        this.enemyFlash.set(t.id, t.flashUntil);
        this.enemyHp.set(t.id, t.hp);
      }
      for (const i of w.impacts) this.impacts.add(i.id);
    }

    if (w.shotsFired > this.shots) {
      this.firedAt = now;
      this.muzzleBlast(anchors.playerMuzzle, 1);
      this.kick(
        anchors.view === "driver" ? 0.35 : anchors.view === "gunner" ? 1 : 0.7,
        0.45,
      );
    }
    this.shots = w.shotsFired;

    for (const t of w.targets) {
      const flash = this.enemyFlash.get(t.id);
      if (flash !== undefined && t.flashUntil > flash && t.flashUntil > now) {
        const muzzle = anchors.enemyMuzzle(t.id);
        if (muzzle) this.muzzleBlast(muzzle, t.kind === "tiger" ? 1.35 : 1.15);
      }
      const hp = this.enemyHp.get(t.id);
      if (hp !== undefined && hp > 0 && t.hp <= 0) {
        this.deathAt.set(t.id, now);
        this.destroyed(t.x, t.z);
      }
      this.enemyFlash.set(t.id, t.flashUntil);
      this.enemyHp.set(t.id, t.hp);
    }

    for (const hit of w.impacts) {
      if (this.impacts.has(hit.id)) continue;
      this.impacts.add(hit.id);
      const at = new THREE.Vector3(hit.x, Math.max(0.1, hit.y), hit.z);
      if (hit.shell === "he") {
        this.explosion(at, 1.5);
        this.kickFrom(at, 1.2);
      } else if (hit.shell === "ap") {
        this.sparks(at, 1.4);
        this.rings.spawn({
          position: at.clone(),
          velocity: new THREE.Vector3(),
          life: 0.3,
          size: [1, 9],
          from: [1, 0.95, 0.8, 0.9],
          to: [1, 0.6, 0.2, 0],
        });
        this.kickFrom(at, 0.5);
      } else this.smokePop(at);
    }
    if (this.impacts.size > 64)
      this.impacts = new Set(w.impacts.map((i) => i.id));

    if (state.battle.lastHitAt !== this.hitAt) {
      const t = state.tank;
      const side = random(-1, 1);
      this.sparks(
        new THREE.Vector3(
          t.x + Math.cos(t.yaw) * side * 1.6,
          random(1, 2),
          t.z + Math.sin(t.yaw) * side * 1.6,
        ),
        1.3,
      );
      this.kick(1.4, 0.6);
    }
    this.hitAt = state.battle.lastHitAt;

    // Shell tracers: a glowing head that leaves a short, fading trail.
    const live = new Set<number>();
    const trail = (
      id: number,
      x: number,
      y: number,
      z: number,
      hot: boolean,
    ) => {
      live.add(id);
      const head = new THREE.Vector3(x, y, z);
      const last = this.trails.get(id);
      this.trails.set(id, head);
      if (!last) return;
      const steps = Math.min(8, Math.ceil(head.distanceTo(last) / 0.35));
      for (let s = 0; s < steps; s++) {
        this.glow.spawn({
          position: last.clone().lerp(head, (s + 1) / steps),
          velocity: new THREE.Vector3(),
          life: 0.16,
          size: [0.55, 0.15],
          from: hot ? [1, 0.82, 0.45, 0.9] : [1, 0.45, 0.2, 0.9],
          to: [1, 0.3, 0.08, 0],
        });
      }
    };
    for (const p of w.projectiles) trail(p.id, p.x, p.y, p.z, true);
    for (const p of state.battle.projectiles)
      trail(-p.id, p.x, p.y, p.z, false);
    for (const id of this.trails.keys())
      if (!live.has(id)) this.trails.delete(id);

    // Knocked-out tanks keep burning, as in the games the crew knows.
    if (dt > 0) {
      this.wreckClock += dt;
      while (this.wreckClock > 0.08) {
        this.wreckClock -= 0.08;
        for (const t of w.targets) if (t.hp <= 0) this.burn(t.x, t.z);
      }
    }

    if (dt > 0) {
      this.embers = this.embers.filter((e) => {
        e.age += dt;
        e.v.y -= 14 * dt;
        e.v.multiplyScalar(Math.exp(-0.6 * dt));
        const from = e.p.clone();
        e.p.addScaledVector(e.v, dt);
        const fade = 1 - e.age / e.life;
        for (let k = 1; k <= 2; k++)
          this.glow.spawn({
            position: from.clone().lerp(e.p, k / 2),
            velocity: new THREE.Vector3(),
            life: 0.32,
            size: [0.75 * fade + 0.2, 0.08],
            from: e.hot ? [1, 0.9, 0.55, 1] : [1, 0.6, 0.2, 1],
            to: [1, 0.2, 0.03, 0],
          });
        return e.age < e.life && e.p.y > 0.05;
      });
    }
    this.decals = this.decals.filter((d) => {
      const t = (now - d.born) / d.life;
      if (t >= 1) {
        d.mesh.visible = false;
        return false;
      }
      if (d.kind === "shock") {
        d.mesh.scale.setScalar(d.radius * Math.sqrt(t) + 0.1);
        d.mesh.material.opacity = (1 - t) * 0.9;
      } else d.mesh.material.opacity = Math.min(1, (1 - t) * 4) * 0.85;
      return true;
    });
    this.delayed = this.delayed.filter((d) => {
      if (now < d.at) return true;
      d.run();
      return false;
    });
    for (const f of this.flashes) {
      const k = Math.max(0, (f.until - now) / f.length);
      f.light.intensity = f.peak * k * k;
    }
    this.flashes = this.flashes.filter((f) => now < f.until);
    this.glow.step(dt);
    this.smoke.step(dt);
    this.rings.step(dt);
  }

  /** Point sprite scale depends on the drawing buffer height and lens. */
  setLens(camera: THREE.PerspectiveCamera, bufferHeight: number) {
    const scale =
      bufferHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    this.glow.lens(scale);
    this.smoke.lens(scale);
    this.rings.lens(scale);
  }

  /** Barrel slides back into the mantlet, then runs out. Call after aim is posed. */
  recoilBarrel(elevation: THREE.Object3D) {
    elevation.position.sub(this.recoilOffset);
    const t = this.time - this.firedAt;
    const travel =
      t < 0 || t > 1.2
        ? 0
        : t < 0.035
          ? RECOIL.barrel * (t / 0.035)
          : RECOIL.barrel * Math.exp(-(t - 0.035) / 0.18);
    this.recoilOffset.set(0, 0, travel).applyQuaternion(elevation.quaternion);
    elevation.position.add(this.recoilOffset);
  }

  /** Hull pitches up and squats on its rear suspension, then rocks back. */
  rockHull(root: THREE.Object3D, turretYaw: number) {
    root.rotation.order = "YXZ";
    const t = this.time - this.firedAt;
    const rock =
      t < 0 || t > 1.4
        ? 0
        : RECOIL.hull *
          (1 - Math.exp(-t / 0.025)) *
          Math.exp(-t / 0.32) *
          Math.cos(2 * Math.PI * RECOIL.rebound * t);
    root.rotation.x = rock * Math.cos(turretYaw);
    root.rotation.z = rock * Math.sin(turretYaw);
  }

  /** Shake and kick the view; returns nothing, mutates the camera in place. */
  shakeCamera(camera: THREE.PerspectiveCamera) {
    const left = this.shake.until - this.time;
    if (left <= 0) return;
    const k = (left / this.shake.length) ** 2 * this.shake.strength;
    camera.position.x += random(-1, 1) * 0.06 * k;
    camera.position.y += random(-1, 1) * 0.05 * k;
    camera.position.z += random(-1, 1) * 0.06 * k;
    // The sight jumps up with the shot and settles back.
    camera.rotateX(0.02 * k + random(-1, 1) * 0.004 * k);
    camera.rotateY(random(-1, 1) * 0.004 * k);
  }

  /**
   * Arcade-style "turret pop": a destroyed tank throws its turret into the
   * air, spinning, and it crashes back down askew. Call after posing aim.
   */
  popTurret(id: number, turret: THREE.Object3D) {
    const applied = this.turretOffset.get(id);
    if (applied) turret.position.sub(applied);
    const died = this.deathAt.get(id);
    if (died === undefined) {
      this.turretOffset.delete(id);
      return;
    }
    const t = Math.max(0, this.time - died);
    const flight = 0.95;
    const offset = new THREE.Vector3();
    if (t < flight) {
      offset.y = 10 * t - 0.5 * 21 * t * t;
      offset.x = 0.7 * (t / flight);
      turret.rotation.x = -0.9 * (t / flight);
      turret.rotation.z = 5.5 * t;
    } else {
      offset.set(0.7, -0.08, 0.25);
      turret.rotation.x = -0.22;
      turret.rotation.z = 0.38;
    }
    offset.y = Math.max(-0.08, offset.y);
    turret.position.add(offset);
    this.turretOffset.set(id, offset);
  }

  /** Shake strength falls off with the blast's distance from our tank. */
  private kickFrom(at: THREE.Vector3, strength: number) {
    const near = 1 - Math.min(1, at.distanceTo(this.listener) / 50);
    if (near > 0.08) this.kick(strength * (0.25 + 0.75 * near), 0.55);
  }

  private decal(
    at: THREE.Vector3,
    kind: "shock" | "scorch",
    radius: number,
    life: number,
  ) {
    const pool = this.decalPool.filter(
      (m) => m.userData.shock === (kind === "shock"),
    );
    const mesh =
      pool.find((m) => !m.visible) ??
      this.decals
        .filter((d) => d.kind === kind)
        .sort((a, b) => a.born - b.born)[0]?.mesh;
    if (!mesh) return;
    this.decals = this.decals.filter((d) => d.mesh !== mesh);
    mesh.position.set(at.x, 0.06, at.z);
    mesh.rotation.z = Math.random() * Math.PI * 2;
    mesh.scale.setScalar(kind === "scorch" ? radius : 0.1);
    mesh.material.opacity = kind === "scorch" ? 0.85 : 0.9;
    mesh.visible = true;
    this.decals.push({ mesh, born: this.time, life, radius, kind });
  }

  private kick(strength: number, length: number) {
    if (this.time < this.shake.until && this.shake.strength > strength) return;
    this.shake = { until: this.time + length, strength, length };
  }

  private flash(
    at: THREE.Vector3,
    peak: number,
    length: number,
    color: number,
  ) {
    const light =
      this.lights.find((l) => !this.flashes.some((f) => f.light === l)) ??
      this.lights[0];
    this.flashes = this.flashes.filter((f) => f.light !== light);
    light.position.copy(at);
    light.color.setHex(color);
    light.intensity = peak;
    this.flashes.push({ light, until: this.time + length, peak, length });
  }

  private n(count: number) {
    return Math.max(1, Math.round(count * this.density));
  }

  private muzzleBlast(muzzle: THREE.Object3D, scale: number) {
    muzzle.updateWorldMatrix(true, false);
    const at = muzzle.getWorldPosition(new THREE.Vector3());
    // Model forward is -Z.
    const dir = muzzle.getWorldDirection(this.forward).negate().clone();
    const side = new THREE.Vector3()
      .crossVectors(dir, new THREE.Vector3(0, 1, 0))
      .normalize();
    const along = (speed: number, spread: number) =>
      dir
        .clone()
        .multiplyScalar(speed)
        .add(
          new THREE.Vector3(
            random(-1, 1),
            random(-0.6, 1),
            random(-1, 1),
          ).multiplyScalar(spread),
        );
    // White-hot core and a broad orange bloom.
    this.glow.spawn({
      position: at.clone(),
      velocity: dir.clone().multiplyScalar(4),
      life: 0.09,
      size: [2.4 * scale, 3.8 * scale],
      from: [1, 0.98, 0.85, 1],
      to: [1, 0.75, 0.35, 0],
    });
    this.glow.spawn({
      position: at.clone().addScaledVector(dir, 0.8),
      velocity: dir.clone().multiplyScalar(6),
      life: 0.16,
      size: [3 * scale, 5 * scale],
      from: [1, 0.62, 0.2, 0.9],
      to: [0.9, 0.25, 0.05, 0],
    });
    // Flame tongue thrown forward along the bore.
    for (let i = 0; i < this.n(14); i++)
      this.glow.spawn({
        position: at.clone(),
        velocity: along(random(18, 46), 2.5),
        life: random(0.07, 0.16),
        size: [random(0.9, 1.6) * scale, random(2, 3.2) * scale],
        from: [1, random(0.65, 0.9), 0.3, 1],
        to: [0.9, 0.2, 0.04, 0],
        drag: 6,
      });
    // Side petals of the blast, the signature star shape.
    for (const s of [-1, 1])
      for (let i = 0; i < this.n(4); i++)
        this.glow.spawn({
          position: at.clone(),
          velocity: side
            .clone()
            .multiplyScalar(s * random(10, 18))
            .addScaledVector(dir, random(2, 6)),
          life: random(0.06, 0.11),
          size: [1 * scale, 2.2 * scale],
          from: [1, 0.8, 0.4, 0.9],
          to: [1, 0.3, 0.05, 0],
          drag: 8,
        });
    // Burning propellant sparks.
    for (let i = 0; i < this.n(12); i++)
      this.glow.spawn({
        position: at.clone(),
        velocity: along(random(14, 30), 6),
        life: random(0.25, 0.55),
        size: [0.18, 0.08],
        from: [1, 0.85, 0.5, 1],
        to: [1, 0.35, 0.1, 0],
        drag: 1.5,
        gravity: 9.8,
      });
    // Gun smoke that billows forward, slows and drifts up.
    for (let i = 0; i < this.n(16); i++) {
      const grey = random(0.62, 0.78);
      this.smoke.spawn({
        position: at.clone().addScaledVector(dir, random(0, 1.5)),
        velocity: along(random(4, 16), 2.2),
        life: random(1.6, 3),
        size: [random(1, 1.6) * scale, random(4, 6.5) * scale],
        from: [grey, grey * 0.97, grey * 0.92, 0.55],
        to: [grey + 0.1, grey + 0.1, grey + 0.08, 0],
        drag: 2.6,
        gravity: -0.5,
        spin: random(-0.6, 0.6),
      });
    }
    // The blast wave lifts a ring of dust off the ground under the muzzle.
    const ground = new THREE.Vector3(at.x, 0.3, at.z);
    for (let i = 0; i < this.n(18); i++) {
      const a = (i / this.n(18)) * Math.PI * 2;
      const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      this.smoke.spawn({
        position: ground.clone().addScaledVector(out, random(0.5, 1.5)),
        velocity: out
          .multiplyScalar(random(4, 9))
          .add(new THREE.Vector3(0, random(0.3, 1.5), 0)),
        life: random(1.1, 1.9),
        size: [random(1, 1.6), random(3, 4.5)],
        from: [0.62, 0.53, 0.4, 0.42],
        to: [0.7, 0.62, 0.5, 0],
        drag: 2.4,
        gravity: -0.2,
      });
    }
    this.flash(at, 28 * scale, 0.14, 0xffb35c);
  }

  /** Deliberately over the top: readable, punchy and satisfying first. */
  private explosion(at: THREE.Vector3, scale: number) {
    const s = scale;
    const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const up = () => v3(random(-1, 1), random(0.3, 1.2), random(-1, 1));
    const still = () => new THREE.Vector3();
    // Blinding core and two shockwave rings racing outward.
    this.glow.spawn({
      position: at.clone(),
      velocity: still(),
      life: 0.14,
      size: [8 * s, 15 * s],
      from: [1, 1, 0.95, 1],
      to: [1, 0.8, 0.4, 0],
    });
    this.rings.spawn({
      position: at.clone().setY(at.y + 0.6),
      velocity: still(),
      life: 0.38,
      size: [2 * s, 30 * s],
      from: [1, 0.96, 0.85, 1],
      to: [1, 0.55, 0.2, 0],
    });
    this.rings.spawn({
      position: at.clone().setY(at.y + 1),
      velocity: still(),
      life: 0.75,
      size: [1.5 * s, 20 * s],
      from: [1, 0.62, 0.25, 0.75],
      to: [0.8, 0.25, 0.08, 0],
    });
    this.decal(at, "shock", 13 * s, 0.55);
    this.decal(at, "scorch", 2.4 * s, 14);
    // Rolling fireball.
    for (let i = 0; i < this.n(30); i++)
      this.glow.spawn({
        position: at.clone().add(up().multiplyScalar(0.6 * s)),
        velocity: up().multiplyScalar(random(3, 9) * s),
        life: random(0.45, 0.9),
        size: [random(2, 3.2) * s, random(5, 8) * s],
        from: [1, random(0.65, 0.9), 0.3, 1],
        to: [0.75, 0.1, 0.02, 0],
        drag: 3,
        gravity: -3,
        spin: random(-2, 2),
      });
    // Mushroom column: fire punches straight up and blooms into a cap.
    for (let i = 0; i < this.n(12); i++) {
      const vel = v3(
        random(-1.2, 1.2),
        random(10, 16),
        random(-1.2, 1.2),
      ).multiplyScalar(Math.sqrt(s));
      this.glow.spawn({
        position: at.clone(),
        velocity: vel.clone(),
        life: random(0.7, 1.1),
        size: [random(1.6, 2.4) * s, random(4.5, 6.5) * s],
        from: [1, 0.78, 0.32, 1],
        to: [0.55, 0.08, 0.02, 0],
        drag: 2.2,
        gravity: -1,
      });
      const dark = random(0.1, 0.2);
      this.smoke.spawn({
        position: at.clone(),
        velocity: vel,
        life: random(2.6, 4.2),
        size: [random(2, 3) * s, random(9, 13) * s],
        from: [dark, dark * 0.95, dark * 0.9, 0.75],
        to: [0.42, 0.4, 0.38, 0],
        drag: 2,
        gravity: -0.6,
        spin: random(-0.5, 0.5),
      });
    }
    // Burning fragments arcing out with fire trails.
    for (let i = 0; i < this.n(14); i++)
      this.embers.push({
        p: at.clone().setY(at.y + 0.3),
        v: up()
          .normalize()
          .multiplyScalar(random(11, 24) * Math.sqrt(s)),
        age: 0,
        life: random(0.8, 1.6),
        hot: Math.random() < 0.5,
      });
    // Dirt fountain and clods.
    for (let i = 0; i < this.n(36); i++) {
      const brown = random(0.2, 0.36);
      this.smoke.spawn({
        position: at.clone(),
        velocity: v3(
          random(-4, 4),
          random(8, 17),
          random(-4, 4),
        ).multiplyScalar(s),
        life: random(1, 1.8),
        size: [random(0.6, 1) * s, random(2, 3.4) * s],
        from: [brown, brown * 0.82, brown * 0.62, 0.95],
        to: [brown + 0.15, brown + 0.1, brown + 0.05, 0],
        drag: 0.6,
        gravity: 11,
        spin: random(-2, 2),
      });
    }
    for (let i = 0; i < this.n(30); i++)
      this.smoke.spawn({
        position: at.clone(),
        velocity: v3(
          random(-7, 7),
          random(7, 18),
          random(-7, 7),
        ).multiplyScalar(s),
        life: random(1, 1.9),
        size: [random(0.14, 0.35), random(0.14, 0.35)],
        from: [0.15, 0.12, 0.09, 1],
        to: [0.15, 0.12, 0.09, 1],
        gravity: 12,
        spin: random(-6, 6),
      });
    // Ground dust ring.
    for (let i = 0; i < this.n(22); i++) {
      const a = (i / this.n(22)) * Math.PI * 2;
      const out = v3(Math.cos(a), 0, Math.sin(a));
      this.smoke.spawn({
        position: v3(at.x, 0.3, at.z).addScaledVector(out, s),
        velocity: out.multiplyScalar(random(8, 14) * s),
        life: random(1.3, 2.2),
        size: [1.4 * s, 5 * s],
        from: [0.58, 0.5, 0.38, 0.55],
        to: [0.68, 0.62, 0.52, 0],
        drag: 2.4,
        gravity: -0.3,
      });
    }
    // Spark spray.
    for (let i = 0; i < this.n(40); i++)
      this.glow.spawn({
        position: at.clone(),
        velocity: up().normalize().multiplyScalar(random(12, 30)),
        life: random(0.4, 1),
        size: [0.24, 0.08],
        from: [1, 0.9, 0.55, 1],
        to: [1, 0.3, 0.05, 0],
        drag: 0.8,
        gravity: 9.8,
      });
    this.flash(at.clone().setY(at.y + 2), 160 * s, 0.45, 0xff9a40);
  }

  /** Armour-piercing strike: a fan of white-hot sparks and a sharp flash. */
  private sparks(at: THREE.Vector3, scale = 1) {
    this.glow.spawn({
      position: at.clone(),
      velocity: new THREE.Vector3(),
      life: 0.08,
      size: [3 * scale, 4.5 * scale],
      from: [1, 1, 0.92, 1],
      to: [1, 0.75, 0.4, 0],
    });
    for (let i = 0; i < this.n(36); i++)
      this.glow.spawn({
        position: at.clone(),
        velocity: new THREE.Vector3(
          random(-1, 1),
          random(-0.2, 1),
          random(-1, 1),
        )
          .normalize()
          .multiplyScalar(random(8, 24) * scale),
        life: random(0.25, 0.7),
        size: [0.16, 0.06],
        from: [1, random(0.85, 1), 0.6, 1],
        to: [1, 0.4, 0.08, 0],
        drag: 1.2,
        gravity: 9.8,
      });
    for (let i = 0; i < this.n(8); i++)
      this.smoke.spawn({
        position: at.clone(),
        velocity: new THREE.Vector3(
          random(-2, 2),
          random(0.5, 2.5),
          random(-2, 2),
        ),
        life: random(1, 1.8),
        size: [0.8, 3],
        from: [0.45, 0.42, 0.38, 0.5],
        to: [0.6, 0.58, 0.55, 0],
        drag: 1.8,
        gravity: -0.6,
      });
    this.flash(at, 30 * scale, 0.1, 0xfff0c0);
  }

  private smokePop(at: THREE.Vector3) {
    this.glow.spawn({
      position: at.clone(),
      velocity: new THREE.Vector3(),
      life: 0.08,
      size: [2, 3],
      from: [1, 0.9, 0.7, 0.9],
      to: [1, 0.6, 0.3, 0],
    });
    for (let i = 0; i < this.n(14); i++)
      this.smoke.spawn({
        position: at.clone(),
        velocity: new THREE.Vector3(random(-4, 4), random(1, 5), random(-4, 4)),
        life: random(1.5, 2.6),
        size: [1, 4.5],
        from: [0.9, 0.9, 0.88, 0.7],
        to: [0.95, 0.95, 0.93, 0],
        drag: 2,
        gravity: -0.4,
      });
  }

  /** Main blast, then the ammunition cooking off for a while after. */
  private destroyed(x: number, z: number) {
    const at = new THREE.Vector3(x, 1.6, z);
    this.explosion(at, 2.2);
    this.kickFrom(at, 1.6);
    for (let k = 0; k < 4; k++)
      this.delayed.push({
        at: this.time + 0.35 + k * random(0.25, 0.5),
        run: () =>
          this.explosion(
            at
              .clone()
              .add(
                new THREE.Vector3(random(-1, 1), random(0, 1), random(-1, 1)),
              ),
            random(0.6, 1),
          ),
      });
  }

  private burn(x: number, z: number) {
    const at = new THREE.Vector3(
      x + random(-0.6, 0.6),
      random(1.9, 2.4),
      z + random(-0.6, 0.6),
    );
    if (Math.random() < 0.9 * this.density)
      this.glow.spawn({
        position: at.clone(),
        velocity: new THREE.Vector3(
          random(-0.4, 0.4),
          random(1.5, 3),
          random(-0.4, 0.4),
        ),
        life: random(0.35, 0.7),
        size: [random(0.8, 1.3), 0.3],
        from: [1, random(0.55, 0.75), 0.2, 0.85],
        to: [0.8, 0.15, 0.02, 0],
        gravity: -1,
      });
    if (Math.random() < 0.55 * this.density) {
      const dark = random(0.08, 0.18);
      this.smoke.spawn({
        position: at.clone().setY(at.y + 0.6),
        velocity: new THREE.Vector3(
          random(-0.3, 0.3) + 0.4,
          random(1.5, 2.6),
          random(-0.3, 0.3),
        ),
        life: random(3.5, 5.5),
        size: [random(1.2, 1.8), random(6, 9)],
        from: [dark, dark, dark, 0.55],
        to: [0.4, 0.4, 0.4, 0],
        drag: 0.4,
        gravity: -0.3,
        spin: random(-0.4, 0.4),
      });
    }
  }

  private reset() {
    this.glow.clear();
    this.smoke.clear();
    this.rings.clear();
    this.embers = [];
    for (const d of this.decals) d.mesh.visible = false;
    this.decals = [];
    this.deathAt.clear();
    this.turretOffset.clear();
    this.primed = false;
    this.firedAt = -100;
    this.shake.until = -100;
    this.delayed = [];
    this.flashes = [];
    for (const light of this.lights) light.intensity = 0;
    this.impacts.clear();
    this.trails.clear();
    this.enemyFlash.clear();
    this.enemyHp.clear();
  }

  dispose() {
    this.scene.remove(
      this.glow.points,
      this.smoke.points,
      this.rings.points,
      ...this.lights,
      ...this.decalPool,
    );
    this.glow.dispose();
    this.smoke.dispose();
    this.rings.dispose();
    for (const mesh of this.decalPool) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    for (const map of this.maps) map.dispose();
  }
}
