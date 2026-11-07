import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ProceduralVehicle, type Kind } from "./tank-vehicle-procedural";

export { buildBrowning } from "./tank-vehicle-procedural";

/** One baked tank from public/art/vehicles (built by `npm run art:tanks`).
 * Node contract: see tools/blender/build_tank.py. */
interface TankArt {
  tank: THREE.Object3D;
  trackX: number;
  /** Link-centre loop as game (z, y) pairs, counter-clockwise from the ground run. */
  path: Float32Array;
  /** Running distance at each path point; the loop closes back to point 0. */
  distance: Float32Array;
  length: number;
  links: number;
}

const KINDS: Kind[] = ["sherman", "panzer", "tiger"];
const loader = new GLTFLoader();
const ready = new Map<Kind, TankArt | null>();
const loading = new Map<Kind, Promise<TankArt | null>>();
const AXLE = new THREE.Vector3(1, 0, 0);

let software = false;
/** Record whether WebGL runs on a CPU rasteriser (SwiftShader, llvmpipe). Uploading
 * three 2K baked atlases there stalls the page long enough to drop the crew's peer
 * links, so that tier keeps the light procedural tanks and the coarse shadow map.
 * Reads the scene's own renderer: a throwaway probe context stalls the crew too. */
export function noteRenderer(renderer: THREE.WebGLRenderer) {
  const gl = renderer.getContext();
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const name = String(
    gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
  );
  software = /swiftshader|llvmpipe|software/i.test(name);
  return software;
}
export function softwareRendering() {
  return software;
}

function artUrl(kind: Kind) {
  return `/art/vehicles/${kind}.glb`;
}

function readArt(gltf: { scene: THREE.Group }): TankArt {
  const tank = gltf.scene.getObjectByName("tank");
  const extras = tank?.userData;
  if (!tank || !Array.isArray(extras?.track_path))
    throw new Error("tank glTF is missing its root extras");
  const path = new Float32Array(extras.track_path as number[]);
  const count = path.length / 2;
  const distance = new Float32Array(count + 1);
  for (let i = 1; i <= count; i++) {
    const a = (i - 1) * 2,
      b = (i % count) * 2;
    distance[i] =
      distance[i - 1] +
      Math.hypot(path[b] - path[a], path[b + 1] - path[a + 1]);
  }
  return {
    tank,
    trackX: Number(extras.track_x),
    path,
    distance,
    length: distance[count],
    links: Number(extras.track_links),
  };
}

/** Load once per kind and share across scenes. A failure resolves to null so the
 * procedural fallback takes over instead of failing the lobby barrier. */
function loadArt(kind: Kind, manager?: THREE.LoadingManager) {
  let request = loading.get(kind);
  if (!request) {
    request = loader
      .loadAsync(artUrl(kind))
      .then(readArt)
      .catch((error: unknown) => {
        console.warn(`坦克模型 ${kind} 載入失敗，改用簡易模型。`, error);
        return null;
      })
      .then((art) => {
        ready.set(kind, art);
        return art;
      });
    loading.set(kind, request);
  }
  if (manager && !ready.has(kind)) {
    // Hold this renderer's preparation barrier open until the shared load settles.
    manager.itemStart(artUrl(kind));
    void request.then(() => manager.itemEnd(artUrl(kind)));
  }
  return request;
}

/** Start every tank download under this renderer's barrier, so later waves never pop in. */
export function preloadVehicles(manager?: THREE.LoadingManager) {
  if (softwareRendering()) return;
  for (const kind of KINDS) void loadArt(kind, manager);
}

interface Track {
  meshes: THREE.InstancedMesh[];
  side: number;
  phase: number;
}
interface Wheel {
  node: THREE.Object3D;
  rest: THREE.Quaternion;
  radius: number;
  side: number;
}

/** Scene-facing tank: stable pivots that a baked glTF (or the procedural fallback) fills.
 * -Z is forward; the scene drives turret yaw, elevation pitch and reads muzzle. */
export class VehicleModel {
  readonly root = new THREE.Group();
  readonly turret = new THREE.Group();
  readonly elevation = new THREE.Group();
  readonly muzzle = new THREE.Group();
  private art?: TankArt;
  private fallback?: ProceduralVehicle;
  private paint?: THREE.MeshStandardMaterial;
  private paintColor = new THREE.Color();
  private tracks: Track[] = [];
  private wheels: Wheel[] = [];
  private detail: { near: THREE.Object3D[]; far: THREE.Object3D[] } = {
    near: [],
    far: [],
  };
  private near = true;
  private pose?: { x: number; z: number; yaw: number };
  private condition?: { alive: boolean; warning: boolean; key: string };
  private disposed = false;
  private matrix = new THREE.Object3D();
  private spin = new THREE.Quaternion();
  constructor(
    readonly kind: Kind,
    private manager?: THREE.LoadingManager,
  ) {
    this.root.add(this.turret);
    this.turret.add(this.elevation);
    this.elevation.add(this.muzzle);
    if (softwareRendering()) this.adopt(null);
    else if (ready.has(kind)) this.adopt(ready.get(kind)!);
    else
      void loadArt(kind, manager).then((art) => {
        if (!this.disposed) this.adopt(art);
      });
  }

  private adopt(art: TankArt | null) {
    if (!art) {
      this.fallback = new ProceduralVehicle(this.kind, this.manager, {
        root: this.root,
        turret: this.turret,
        elevation: this.elevation,
        muzzle: this.muzzle,
      });
    } else this.build(art);
    const pose = this.pose,
      condition = this.condition;
    this.pose = undefined;
    this.condition = undefined;
    this.animate(pose?.x ?? 0, pose?.z ?? 0, pose?.yaw ?? 0);
    if (condition) this.setCondition(condition.alive, condition.warning);
  }

  private build(art: TankArt) {
    this.art = art;
    // Geometry and textures stay shared; the material is per tank because setCondition tints it.
    const tank = art.tank.clone(true);
    let shared: THREE.MeshStandardMaterial | undefined;
    tank.traverse((object) => {
      if (object instanceof THREE.Mesh && !shared)
        shared = object.material as THREE.MeshStandardMaterial;
    });
    const paint = shared!.clone();
    this.paint = paint;
    this.paintColor.copy(paint.color);
    const adoptPivot = (
      from: THREE.Object3D | undefined,
      to: THREE.Object3D,
      keep?: THREE.Object3D,
    ) => {
      if (!from) return;
      to.position.copy(from.position);
      to.quaternion.copy(from.quaternion);
      for (const child of [...from.children]) if (child !== keep) to.add(child);
    };
    const turretNode = tank.getObjectByName("turret");
    const elevationNode = tank.getObjectByName("elevation");
    const muzzleNode = tank.getObjectByName("muzzle");
    adoptPivot(turretNode, this.turret, elevationNode);
    adoptPivot(elevationNode, this.elevation, muzzleNode);
    if (muzzleNode) this.muzzle.position.copy(muzzleNode.position);
    const links: THREE.Mesh[] = [];
    for (const child of [...tank.children]) {
      if (child === turretNode) continue;
      if (
        /^track_link(_lod1)?$/.test(child.name) &&
        child instanceof THREE.Mesh
      ) {
        links[child.name.endsWith("_lod1") ? 1 : 0] = child;
        continue;
      }
      const wheel = /^wheel_([LR])_\d+(_lod1)?$/.exec(child.name);
      if (wheel)
        this.wheels.push({
          node: child,
          rest: child.quaternion.clone(),
          radius: Number(child.userData.spin_r) || 0.3,
          side: wheel[1] === "L" ? -1 : 1,
        });
      this.root.add(child);
    }
    for (const holder of [this.root, this.turret, this.elevation])
      holder.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.material = paint;
        object.castShadow = true;
        object.receiveShadow = true;
        this.detail[object.name.endsWith("_lod1") ? "far" : "near"].push(
          object,
        );
      });
    for (const side of [-1, 1]) {
      const meshes = links.map((link, level) => {
        const mesh = new THREE.InstancedMesh(link.geometry, paint, art.links);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // Links travel inside a fixed envelope round the running gear.
        mesh.boundingSphere = new THREE.Sphere(
          new THREE.Vector3(side * art.trackX, 0.6, 0),
          art.length / 4 + 0.6,
        );
        this.root.add(mesh);
        this.detail[level ? "far" : "near"].push(mesh);
        return mesh;
      });
      this.tracks.push({ meshes, side, phase: 0 });
    }
    const near = this.near;
    this.near = !near;
    this.setDetail(near);
  }

  /** Full detail up close; the decimated _lod1 meshes beyond. Called by the scene per frame. */
  setDetail(near: boolean) {
    if (this.fallback || near === this.near) return;
    this.near = near;
    for (const object of this.detail.near) object.visible = near;
    for (const object of this.detail.far) object.visible = !near;
  }

  /** Track travel comes only from actual authoritative displacement/turn, never wall time. */
  animate(x: number, z: number, yaw: number) {
    if (this.fallback) return this.fallback.animate(x, z, yaw);
    const art = this.art;
    const last = this.pose;
    if (last && last.x === x && last.z === z && last.yaw === yaw) return;
    this.pose = { x, z, yaw };
    if (!art) return;
    if (last) {
      const dx = x - last.x,
        dz = z - last.z;
      const travel = dx * Math.sin(yaw) - dz * Math.cos(yaw);
      const turn = Math.atan2(
        Math.sin(yaw - last.yaw),
        Math.cos(yaw - last.yaw),
      );
      for (const track of this.tracks)
        track.phase += travel - track.side * turn * art.trackX;
    }
    const pitch = art.length / art.links;
    const count = art.path.length / 2;
    for (const track of this.tracks) {
      let index = 0;
      for (let i = 0; i < art.links; i++) {
        const s =
          (((i * pitch + track.phase) % art.length) + art.length) % art.length;
        // Links are sorted along the loop, so the search only ever walks forward or wraps.
        if (art.distance[index] > s) index = 0;
        while (index < count - 1 && art.distance[index + 1] <= s) index++;
        const a = index * 2,
          b = ((index + 1) % count) * 2;
        const span = art.distance[index + 1] - art.distance[index] || 1;
        const t = (s - art.distance[index]) / span;
        const dz = art.path[b] - art.path[a],
          dy = art.path[b + 1] - art.path[a + 1];
        this.matrix.position.set(
          track.side * art.trackX,
          art.path[a + 1] + dy * t,
          art.path[a] + dz * t,
        );
        this.matrix.rotation.set(Math.atan2(-dy, dz), 0, 0);
        this.matrix.updateMatrix();
        for (const mesh of track.meshes)
          mesh.setMatrixAt(i, this.matrix.matrix);
      }
      for (const mesh of track.meshes) mesh.instanceMatrix.needsUpdate = true;
    }
    for (const wheel of this.wheels) {
      const phase = this.tracks.find((t) => t.side === wheel.side)?.phase ?? 0;
      wheel.node.quaternion
        .copy(this.spin.setFromAxisAngle(AXLE, -phase / wheel.radius))
        .multiply(wheel.rest);
    }
  }

  setCondition(alive: boolean, warning: boolean) {
    if (this.fallback) return this.fallback.setCondition(alive, warning);
    const key = `${alive}:${warning}`;
    if (this.condition?.key === key) return;
    this.condition = { alive, warning, key };
    if (!this.paint) return;
    this.paint.emissive.setHex(alive ? (warning ? 0x39200b : 0) : 0x080603);
    // A burnt-out wreck keeps its baked detail, only darkened.
    if (alive) this.paint.color.copy(this.paintColor);
    else this.paint.color.copy(this.paintColor).multiplyScalar(0.32);
  }

  dispose() {
    this.disposed = true;
    if (this.fallback) return this.fallback.dispose();
    // Shared geometry and textures belong to the cache; only per-tank resources go.
    this.paint?.dispose();
    for (const track of this.tracks)
      for (const mesh of track.meshes) mesh.dispose();
  }
}
