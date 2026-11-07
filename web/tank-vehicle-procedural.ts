import * as THREE from "three";
import {
  armour,
  strut,
  batchFixedParts,
  box,
  disposeArt,
  hullGeometry,
  part,
  surfaceMaps,
} from "./tank-art-materials";

export type Kind = "sherman" | "panzer" | "tiger";
/** The four pivots the scene drives; a model fills them in, never replaces them. */
export interface VehicleRig {
  root: THREE.Group;
  turret: THREE.Group;
  elevation: THREE.Group;
  muzzle: THREE.Group;
}
interface RunningGear {
  links: THREE.InstancedMesh;
  side: number;
  wheels: THREE.Object3D[];
  wheelInstances?: THREE.InstancedMesh[];
  phase: number;
}

/** Primitive-built fallback used when a baked glTF tank cannot load.
 * Geometry only: -Z is forward, existing scene yaw/pitch pivots remain the authority adapter. */
export class ProceduralVehicle {
  readonly root: THREE.Group;
  readonly turret: THREE.Group;
  readonly elevation: THREE.Group;
  readonly muzzle: THREE.Group;
  private gear: RunningGear[] = [];
  private paint: THREE.MeshStandardMaterial;
  private lastPose?: { x: number; z: number; yaw: number };
  private condition = "";
  private length: number;
  private trackX: number;
  private matrix = new THREE.Object3D();
  constructor(
    readonly kind: Kind,
    manager?: THREE.LoadingManager,
    rig: VehicleRig = {
      root: new THREE.Group(),
      turret: new THREE.Group(),
      elevation: new THREE.Group(),
      muzzle: new THREE.Group(),
    },
  ) {
    this.root = rig.root;
    this.turret = rig.turret;
    this.elevation = rig.elevation;
    this.muzzle = rig.muzzle;
    const sherman = kind === "sherman",
      tiger = kind === "tiger";
    this.length = sherman ? 6.1 : tiger ? 6 : 5.5;
    const width = sherman ? 2.68 : tiger ? 3.7 : 3.2;
    this.trackX = width / 2 - (tiger ? 0.36 : 0.26);
    this.paint = new THREE.MeshStandardMaterial({
      color: sherman ? 0x788467 : tiger ? 0xa79a75 : 0xad9e78,
      roughness: 0.86,
      metalness: 0.12,
      ...surfaceMaps("green_metal_rust", 1.4, "metal", true, manager),
      normalScale: new THREE.Vector2(0.22, 0.22),
    });
    this.paint.onBeforeCompile = (shader) => {
      shader.vertexShader =
        "varying vec3 platePosition;\n" +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nplatePosition = position;",
        );
      shader.fragmentShader =
        "varying vec3 platePosition;\n" +
        shader.fragmentShader.replace(
          "#include <map_fragment>",
          `
        #ifdef USE_MAP
          vec3 surfaceSample = texture2D(map, vMapUv).rgb;
          float grain = dot(surfaceSample, vec3(0.2126, 0.7152, 0.0722));
          // Photograph carries small-scale paint variation, never blackens the whole tank.
          diffuseColor.rgb *= 0.78 + 0.40 * smoothstep(0.025, 0.32, grain);
        #endif`,
        );
      if (!sherman)
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <color_fragment>",
          `#include <color_fragment>
        float band = sin(platePosition.x * 2.4 + platePosition.z * 1.5 + sin(platePosition.y * 3.5));
        float camouflage = smoothstep(0.1, 0.8, band);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.61,0.70,0.52), camouflage * 0.55);`,
        );
    };
    const paint = this.paint;
    const steel = new THREE.MeshStandardMaterial({
      color: 0x55574d,
      roughness: 0.63,
      metalness: 0.72,
    });
    const rubber = new THREE.MeshStandardMaterial({
      color: 0x252a25,
      roughness: 0.96,
    });
    const mud = new THREE.MeshStandardMaterial({
      color: 0x5d5742,
      roughness: 1,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x151a18,
      roughness: 0.94,
    });
    const worn = new THREE.MeshStandardMaterial({
      color: 0x8b8b70,
      roughness: 0.64,
      metalness: 0.48,
    });
    const lower = part(
      this.root,
      hullGeometry(width - 0.65, this.length - 0.2, 0.55, 1.28, 0.98, 0.15),
      paint,
    );
    lower.position.y = 0;
    part(
      this.root,
      hullGeometry(
        width - 0.45,
        this.length - 0.12,
        1.05,
        sherman ? 1.98 : 1.72,
        sherman ? 0.85 : 0.96,
        sherman ? 1.04 : 0.28,
      ),
      paint,
    );
    // A continuous tread loop with individual steel shoes, not a solid black box.
    for (const side of [-1, 1]) {
      const links = new THREE.InstancedMesh(
        box(tiger ? 0.68 : 0.5, 0.12, 0.19),
        steel,
        78,
      );
      links.castShadow = false;
      links.receiveShadow = true;
      links.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.root.add(links);
      const wheels: THREE.Object3D[] = [];
      const count = sherman ? 6 : tiger ? 8 : 8;
      for (let i = 0; i < count; i++) {
        const wheel = new THREE.Group();
        wheel.position.set(
          side * this.trackX,
          0.66,
          sherman
            ? [-1.87, -1.19, -0.34, 0.34, 1.19, 1.87][i]
            : tiger
              ? -2.04 + i * 0.58
              : -1.72 + i * 0.49,
        );
        this.root.add(wheel);
        wheels.push(wheel);
        const radius = tiger ? 0.49 : sherman ? 0.37 : 0.285;
        const cylinder = part(
          wheel,
          new THREE.CylinderGeometry(radius, radius, 0.35, 16),
          rubber,
        );
        cylinder.rotation.z = Math.PI / 2;
        const hub = part(
          wheel,
          new THREE.CylinderGeometry(radius * 0.77, radius * 0.77, 0.38, 12),
          paint,
        );
        hub.rotation.z = Math.PI / 2;
        const cap = part(
          wheel,
          new THREE.CylinderGeometry(radius * 0.29, radius * 0.29, 0.41, 12),
          steel,
        );
        cap.rotation.z = Math.PI / 2;
        for (let spoke = 0; spoke < (tiger ? 8 : 6); spoke++) {
          const angle = (spoke * Math.PI * 2) / (tiger ? 8 : 6);
          const hole = part(
            wheel,
            new THREE.CylinderGeometry(radius * 0.11, radius * 0.11, 0.012, 8),
            rubber,
            side * 0.198,
            Math.cos(angle) * radius * 0.51,
            Math.sin(angle) * radius * 0.51,
          );
          hole.rotation.z = Math.PI / 2;
          const bolt = part(
            wheel,
            new THREE.CylinderGeometry(0.018, 0.018, 0.018, 6),
            steel,
            side * 0.214,
            Math.cos(angle) * radius * 0.21,
            Math.sin(angle) * radius * 0.21,
          );
          bolt.rotation.z = Math.PI / 2;
        }
        if (tiger) wheel.position.x += side * (i % 2 ? 0.1 : -0.08);
        if (sherman && i % 2 === 0) {
          const centre =
            (wheel.position.z +
              [-1.87, -1.19, -0.34, 0.34, 1.19, 1.87][i + 1]) /
            2;
          const outer = side * (this.trackX + 0.1);
          part(
            this.root,
            armour(0.17, 0.31, 0.46, 0.035),
            paint,
            outer,
            1.04,
            centre,
          );
          for (const end of [-0.34, 0.34]) {
            strut(
              this.root,
              new THREE.Vector3(outer, 1.07, centre),
              new THREE.Vector3(outer, 0.67, centre + end),
              0.055,
              steel,
            );
            const pivot = part(
              this.root,
              new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10),
              worn,
              outer + side * 0.06,
              0.67,
              centre + end,
            );
            pivot.rotation.z = Math.PI / 2;
          }
          for (let coil = 0; coil < 5; coil++) {
            const spring = part(
              this.root,
              new THREE.TorusGeometry(0.087, 0.019, 5, 10),
              steel,
              outer + side * 0.02,
              0.99 + coil * 0.047,
              centre,
            );
            spring.rotation.x = Math.PI / 2;
          }
          const roller = part(
            this.root,
            new THREE.CylinderGeometry(0.12, 0.12, 0.28, 10),
            rubber,
            side * this.trackX,
            1.16,
            centre + 0.18,
          );
          roller.rotation.z = Math.PI / 2;
        }
      }
      for (const z of [-this.length / 2 + 0.62, this.length / 2 - 0.62]) {
        const drive = part(
          this.root,
          new THREE.CylinderGeometry(0.43, 0.43, 0.32, 18),
          steel,
          side * (this.trackX - 0.16),
          0.8,
          z,
        );
        drive.rotation.z = Math.PI / 2;
        const hub = part(
          this.root,
          new THREE.CylinderGeometry(0.19, 0.19, 0.35, 12),
          paint,
          side * (this.trackX - 0.16),
          0.8,
          z,
        );
        hub.rotation.z = Math.PI / 2;
      }
      for (let i = 0; i < 3; i++) {
        const r = part(
          this.root,
          new THREE.CylinderGeometry(0.14, 0.14, 0.35, 10),
          rubber,
          side * this.trackX,
          1.13,
          -1.55 + i * 1.55,
        );
        r.rotation.z = Math.PI / 2;
      }
      part(
        this.root,
        box(tiger ? 0.85 : 0.62, 0.09, this.length),
        paint,
        side * this.trackX,
        1.31,
        0,
      );
      for (let deposit = 0; deposit < 12; deposit++) {
        const clod = part(
          this.root,
          new THREE.IcosahedronGeometry(0.08 + (deposit % 3) * 0.025, 0),
          mud,
          side * (this.trackX - 0.2),
          0.98 + (deposit % 2) * 0.06,
          -2.1 + deposit * 0.38,
        );
        clod.scale.set(0.7, 0.45, 1.4);
      }
      this.gear.push({ links, side, wheels, phase: 0 });
      if (kind === "panzer") {
        for (let panel = 0; panel < 5; panel++) {
          part(
            this.root,
            box(0.055, 0.79, 0.93),
            paint,
            side * (width / 2 - 0.02),
            1.19,
            -2.05 + panel * 1.025,
          );
          part(
            this.root,
            box(0.1, 0.055, 0.93),
            worn,
            side * (width / 2 - 0.02),
            1.6,
            -2.05 + panel * 1.025,
          );
          part(
            this.root,
            box(0.4, 0.055, 0.045),
            steel,
            side * (width / 2 - 0.2),
            1.52,
            -2.0 + panel * 1.025,
          );
        }
      }
    }
    this.root.add(this.turret);
    if (sherman) {
      const profile = [
        [0.85, 0],
        [1.02, 0.08],
        [1.08, 0.38],
        [1.02, 0.56],
        [0.84, 0.68],
        [0.44, 0.73],
        [0, 0.74],
      ];
      const cast = part(
        this.turret,
        new THREE.LatheGeometry(
          profile.map(([r, y]) => new THREE.Vector2(r, y)),
          28,
        ),
        paint,
        0,
        1.94,
        -0.2,
      );
      cast.scale.z = 1.1;
      part(
        this.turret,
        new THREE.CylinderGeometry(1.04, 1.07, 0.13, 28),
        steel,
        0,
        1.98,
        -0.2,
      );
      part(this.turret, armour(1.02, 0.57, 0.34, 0.11), paint, 0, 2.35, -1.3);
      for (const side of [-1, 1]) {
        const cheek = part(
          this.turret,
          new THREE.CylinderGeometry(0.21, 0.21, 0.08, 16),
          steel,
          side * 0.49,
          2.35,
          -1.32,
        );
        cheek.rotation.z = Math.PI / 2;
      }
    } else {
      const shape = new THREE.Shape();
      const outline = tiger
        ? [
            [-1.02, -1.25],
            [1.02, -1.25],
            [1.25, -0.62],
            [1.22, 0.7],
            [0.65, 1.25],
            [-0.65, 1.25],
            [-1.22, 0.7],
            [-1.25, -0.62],
          ]
        : [
            [-0.77, -1.1],
            [0.77, -1.1],
            [1.02, -0.45],
            [0.83, 0.94],
            [-0.83, 0.94],
            [-1.02, -0.45],
          ];
      outline.forEach(([x, z], i) =>
        i ? shape.lineTo(x, -z) : shape.moveTo(x, -z),
      );
      shape.closePath();
      const shell = new THREE.ExtrudeGeometry(shape, {
        depth: tiger ? 0.86 : 0.75,
        bevelEnabled: true,
        bevelThickness: 0.08,
        bevelSize: 0.07,
        bevelSegments: 1,
        steps: 1,
      });
      const turretBody = part(this.turret, shell, paint, 0, 1.8, 0);
      turretBody.rotation.x = -Math.PI / 2;
      part(
        this.turret,
        armour(tiger ? 1.42 : 1.02, 0.58, 0.42, tiger ? 0.1 : 0.045),
        paint,
        0,
        tiger ? 2.27 : 2.16,
        -1.22,
      );
      if (!tiger)
        for (const side of [-1, 1]) {
          const skirt = part(
            this.turret,
            box(0.045, 0.66, 1.82),
            paint,
            side * 1.13,
            2.23,
            0.17,
          );
          skirt.rotation.y = side * 0.12;
        }
      part(
        this.turret,
        armour(tiger ? 1.6 : 1.24, 0.4, 0.43),
        paint,
        0,
        2.06,
        1.2,
      );
    }
    const gunY = sherman ? 2.38 : tiger ? 2.32 : 2.24;
    this.elevation.position.set(0, gunY, sherman ? -0.3 : 0);
    this.turret.add(this.elevation);
    const barrelLength = sherman ? 2.75 : tiger ? 4.25 : 3.6;
    const barrelRadius = tiger ? 0.085 : 0.066;
    const barrel = part(
      this.elevation,
      new THREE.CylinderGeometry(
        barrelRadius,
        barrelRadius * 1.18,
        barrelLength,
        16,
        1,
        true,
      ),
      steel,
      0,
      0,
      -1.14 - barrelLength / 2,
    );
    barrel.rotation.x = Math.PI / 2;
    const sleeve = part(
      this.elevation,
      new THREE.CylinderGeometry(
        tiger ? 0.18 : 0.15,
        tiger ? 0.19 : 0.17,
        0.62,
        16,
      ),
      paint,
      0,
      0,
      -1.27,
    );
    sleeve.rotation.x = Math.PI / 2;
    const tip = -1.14 - barrelLength;
    this.muzzle.position.z = tip;
    this.elevation.add(this.muzzle);
    const bore = part(
      this.elevation,
      new THREE.CircleGeometry(barrelRadius * 0.78, 16),
      dark,
      0,
      0,
      tip + 0.04,
    );
    bore.rotation.y = Math.PI;
    const rim = part(
      this.elevation,
      new THREE.TorusGeometry(barrelRadius * 0.93, 0.016, 6, 16),
      worn,
      0,
      0,
      tip,
    );
    if (!sherman) {
      part(this.elevation, box(0.25, 0.19, 0.42), steel, 0, 0, tip + 0.1);
      for (const side of [-1, 1])
        for (let i = 0; i < 2; i++)
          part(
            this.elevation,
            box(0.008, 0.092, 0.09),
            dark,
            side * 0.128,
            0,
            tip - 0.01 + i * 0.19,
          );
      rim.position.z -= 0.12;
      bore.position.z -= 0.12;
    }
    // Hatches, vision blocks and cupola have human scale and period silhouettes.
    const cupolaX = sherman ? 0.5 : tiger ? -0.61 : 0.32;
    const roofY = sherman ? 2.66 : tiger ? 2.78 : 2.66;
    part(
      this.turret,
      new THREE.CylinderGeometry(0.33, 0.36, 0.19, 16),
      paint,
      cupolaX,
      roofY,
      -0.02,
    );
    const capCentreY = roofY + 0.115;
    const capThickness = 0.045;
    const capTopY = capCentreY + capThickness / 2;
    part(
      this.turret,
      new THREE.CylinderGeometry(0.32, 0.32, capThickness, 16),
      worn,
      cupolaX,
      capCentreY,
      -0.02,
    );
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const slit = part(
        this.turret,
        box(0.15, 0.045, 0.027),
        dark,
        cupolaX + Math.sin(angle) * 0.337,
        roofY,
        -0.02 + Math.cos(angle) * 0.337,
      );
      slit.rotation.y = angle;
    }
    part(
      this.turret,
      new THREE.CylinderGeometry(0.26, 0.26, 0.055, 16),
      paint,
      -cupolaX,
      roofY - 0.1,
      -0.22,
    );
    part(
      this.turret,
      box(0.23, 0.055, 0.06),
      steel,
      -cupolaX,
      roofY - 0.04,
      -0.22,
    );
    const aerial = part(
      this.turret,
      new THREE.CylinderGeometry(0.009, 0.014, 1.65, 5),
      steel,
      -0.75,
      roofY + 0.7,
      0.6,
    );
    aerial.rotation.z = -0.05;
    for (const side of [-1, 1]) {
      part(
        this.root,
        armour(0.5, sherman ? 0.15 : 0.075, 0.48),
        paint,
        side * 0.6,
        sherman ? 2.015 : 1.8,
        sherman ? -1.65 : -1.68,
      );
      part(
        this.root,
        box(0.23, 0.1, 0.16),
        steel,
        side * 0.6,
        sherman ? 2.12 : 1.88,
        -1.78,
      );
      part(
        this.root,
        box(0.15, 0.045, 0.06),
        dark,
        side * 0.6,
        sherman ? 2.15 : 1.91,
        -1.87,
      );
      // Seat the lamp against the actual sloped front plate, not ahead of it.
      const lampY = 1.55;
      const frontPlateZ =
        -(this.length - 0.12) / 2 +
        (sherman ? 1.04 : 0.28) *
          ((lampY - 1.05) / ((sherman ? 1.98 : 1.72) - 1.05));
      const lampX = side * (sherman ? 0.92 : 0.97);
      if (sherman)
        part(
          this.root,
          armour(0.15, 0.12, 0.12, 0.015),
          steel,
          lampX,
          lampY - 0.06,
          frontPlateZ - 0.02,
        );
      const lamp = part(
        this.root,
        new THREE.CylinderGeometry(0.095, 0.095, 0.14, 10),
        paint,
        lampX,
        lampY,
        frontPlateZ - 0.06,
      );
      lamp.rotation.x = Math.PI / 2;
      const lens = part(
        this.root,
        new THREE.CircleGeometry(0.07, 10),
        worn,
        lampX,
        lampY,
        frontPlateZ - 0.14,
      );
      lens.rotation.y = Math.PI;
      // Weld seams and local chipped edges follow plate joints rather than random noise.
      part(
        this.root,
        box(0.025, 0.025, this.length - 1.4),
        worn,
        side * (width / 2 - 0.46),
        sherman ? 1.97 : 1.72,
        0.4,
      );
      for (let i = 0; i < 3; i++)
        part(
          this.root,
          box(0.44, 0.035, 0.055),
          steel,
          side * 0.69,
          1.76,
          1.4 + i * 0.14,
        );
      const tow = part(
        this.root,
        new THREE.TorusGeometry(0.11, 0.032, 6, 12),
        steel,
        side * 0.72,
        0.91,
        this.length / 2,
      );
      tow.rotation.x = 0.18;
      const cable = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side * 0.93, 1.85, 0.4),
        new THREE.Vector3(side * 1.04, 1.78, 1.2),
        new THREE.Vector3(side * 0.87, 1.61, 2.35),
      ]);
      part(
        this.root,
        new THREE.TubeGeometry(cable, 10, 0.028, 5, false),
        steel,
      );
    }
    if (sherman) {
      part(this.root, armour(1.9, 0.4, 0.3, 0.12), paint, 0, 0.91, -2.87);
      for (const side of [-1, 1])
        for (let bolt = 0; bolt < 5; bolt++) {
          const head = part(
            this.root,
            new THREE.CylinderGeometry(0.026, 0.026, 0.025, 6),
            worn,
            side * 0.88,
            0.77 + bolt * 0.068,
            -3.026,
          );
          head.rotation.x = Math.PI / 2;
        }
    }
    // Bare contact edges, welds and turret roof handles remain distinct materials.
    for (const side of [-1, 1]) {
      const y = sherman ? 1.98 : 1.72;
      strut(
        this.root,
        new THREE.Vector3(side * (width / 2 - 0.48), y, 0.4),
        new THREE.Vector3(side * (width / 2 - 0.48), y, this.length / 2 - 0.5),
        0.014,
        worn,
      );
      const hatchY = sherman ? 2.12 : 1.89;
      for (const z of [-1.62, -1.45])
        strut(
          this.root,
          new THREE.Vector3(side * 0.6 - 0.07, hatchY, z),
          new THREE.Vector3(side * 0.6 + 0.07, hatchY, z),
          0.018,
          steel,
        );
    }
    for (let bolt = 0; bolt < 12; bolt++) {
      const angle = (bolt * Math.PI) / 6;
      const head = part(
        this.turret,
        new THREE.CylinderGeometry(0.022, 0.022, 0.024, 6),
        worn,
        cupolaX + Math.sin(angle) * 0.26,
        capTopY + 0.024 / 2 - 0.001,
        -0.02 + Math.cos(angle) * 0.26,
      );
    }
    // Deck grille, stowage and exhaust distinguish the rear from the glacis.
    part(this.root, box(1.15, 0.045, 0.9), dark, 0, 1.76, 1.9);
    for (let i = 0; i < 10; i++)
      part(this.root, box(1.1, 0.055, 0.025), paint, 0, 1.8, 1.5 + i * 0.08);
    const exhaust = part(
      this.root,
      new THREE.CylinderGeometry(0.16, 0.16, 0.75, 10),
      steel,
      0.68,
      1.02,
      this.length / 2 + 0.05,
    );
    exhaust.rotation.z = Math.PI / 2;
    part(this.root, box(0.6, 0.38, 0.34), paint, -0.63, 1.04, this.length / 2);
    if (sherman) {
      const pintle = part(
        this.turret,
        new THREE.CylinderGeometry(0.045, 0.07, 0.45, 10),
        steel,
        0.48,
        3.01,
        0.12,
      );
      pintle.rotation.z = 0.02;
      buildBrowning(this.turret, steel, paint, 0.48, 3.22, 0.12, manager);
    }
    for (const gear of this.gear) {
      for (const wheel of gear.wheels) batchFixedParts(wheel);
      // Each axle uses identical local geometry. Preserve each axle transform,
      // but submit its rubber, painted hub and rotating spokes in three batches.
      gear.wheelInstances = gear.wheels[0].children
        .filter((object): object is THREE.Mesh => object instanceof THREE.Mesh)
        .map((source) => {
          const mesh = new THREE.InstancedMesh(
            source.geometry.clone(),
            source.material,
            gear.wheels.length,
          );
          mesh.castShadow = false;
          mesh.receiveShadow = true;
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          this.root.add(mesh);
          return mesh;
        });
      const retired = new Set<THREE.BufferGeometry>();
      for (const wheel of gear.wheels)
        for (const child of [...wheel.children]) {
          if (child instanceof THREE.Mesh) {
            retired.add(child.geometry);
            wheel.remove(child);
          }
        }
      for (const geometry of retired) geometry.dispose();
    }
    batchFixedParts(this.elevation);
    batchFixedParts(this.turret);
    batchFixedParts(this.root);
    this.animate(0, 0, 0);
  }
  /** Track travel comes only from actual authoritative displacement/turn, never wall time. */
  animate(x: number, z: number, yaw: number) {
    if (
      this.lastPose?.x === x &&
      this.lastPose?.z === z &&
      this.lastPose?.yaw === yaw
    )
      return;
    if (this.lastPose) {
      const dx = x - this.lastPose.x,
        dz = z - this.lastPose.z;
      const travel = dx * Math.sin(yaw) - dz * Math.cos(yaw);
      const turn = Math.atan2(
        Math.sin(yaw - this.lastPose.yaw),
        Math.cos(yaw - this.lastPose.yaw),
      );
      for (const g of this.gear)
        g.phase += travel - g.side * turn * this.trackX;
    }
    this.lastPose = { x, z, yaw };
    const straight = this.length - 1.24,
      radius = 0.5,
      perimeter = 2 * straight + Math.PI * radius * 2;
    for (const g of this.gear) {
      for (let i = 0; i < 78; i++) {
        let s =
          ((((i / 78) * perimeter + g.phase) % perimeter) + perimeter) %
          perimeter;
        let y: number, zp: number, angle: number;
        if (s < straight) {
          zp = -straight / 2 + s;
          y = 0.21;
          angle = 0;
        } else if ((s -= straight) < Math.PI * radius) {
          const a = -Math.PI / 2 + s / radius;
          zp = straight / 2 + Math.cos(a) * radius;
          y = 0.71 + Math.sin(a) * radius;
          angle = -s / radius;
        } else if ((s -= Math.PI * radius) < straight) {
          zp = straight / 2 - s;
          y = 1.21;
          angle = Math.PI;
        } else {
          s -= straight;
          const a = Math.PI / 2 + s / radius;
          zp = -straight / 2 + Math.cos(a) * radius;
          y = 0.71 + Math.sin(a) * radius;
          angle = -Math.PI - s / radius;
        }
        this.matrix.position.set(g.side * this.trackX, y, zp);
        this.matrix.rotation.set(angle, 0, 0);
        this.matrix.updateMatrix();
        g.links.setMatrixAt(i, this.matrix.matrix);
      }
      g.links.instanceMatrix.needsUpdate = true;
      if (!g.links.boundingSphere) {
        g.links.computeBoundingSphere();
        g.links.boundingSphere!.radius += 0.2;
      }
      for (let i = 0; i < g.wheels.length; i++) {
        const wheel = g.wheels[i];
        wheel.rotation.x = -g.phase / 0.4;
        wheel.updateMatrix();
        for (const mesh of g.wheelInstances ?? [])
          mesh.setMatrixAt(i, wheel.matrix);
      }
      for (const mesh of g.wheelInstances ?? []) {
        mesh.instanceMatrix.needsUpdate = true;
        if (!mesh.boundingSphere) {
          mesh.computeBoundingSphere();
          mesh.boundingSphere!.radius += 0.1;
        }
      }
    }
  }
  dispose() {
    disposeArt(this.root);
  }
  setCondition(alive: boolean, warning: boolean) {
    const condition = `${alive}:${warning}`;
    if (this.condition === condition) return;
    this.condition = condition;
    this.paint.emissive.setHex(alive ? (warning ? 0x39200b : 0) : 0x080603);
    this.paint.color.setHex(
      alive
        ? this.kind === "sherman"
          ? 0x788467
          : this.kind === "tiger"
            ? 0xa79a75
            : 0xad9e78
        : 0x3c3a31,
    );
  }
}

/** M2-style Browning .50: receiver, barrel support, pintle/trunnion and spade grips.
 * The shared root stays on -Z; first-person pose belongs to the independent MG camera. */
export function buildBrowning(
  parent: THREE.Object3D,
  steel: THREE.Material,
  paint: THREE.Material,
  x: number,
  y: number,
  z: number,
  manager?: THREE.LoadingManager,
) {
  const gun = new THREE.Group();
  gun.position.set(x, y, z);
  parent.add(gun);
  const dark = new THREE.MeshStandardMaterial({
    color: 0x141b19,
    roughness: 0.95,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: 0x9e8550,
    metalness: 0.72,
    roughness: 0.58,
  });
  const worn = new THREE.MeshStandardMaterial({
    color: 0x777e74,
    metalness: 0.72,
    roughness: 0.56,
  });
  const receiverSteel = new THREE.MeshStandardMaterial({
    color: 0x526057,
    metalness: 0.78,
    roughness: 0.54,
    ...surfaceMaps("green_metal_rust", 2.4, "metal", false, manager),
    normalScale: new THREE.Vector2(0.1, 0.1),
  });
  // Rounded receiver edges, separate top-cover lip and rubbed feed contacts.
  // Wear follows these working surfaces rather than a whole-screen grime layer.
  part(gun, armour(0.17, 0.185, 0.52, 0.009), receiverSteel, 0, 0, -0.2);
  part(gun, armour(0.18, 0.018, 0.42, 0.004), receiverSteel, 0, 0.103, -0.22);
  part(gun, armour(0.135, 0.03, 0.13, 0.006), worn, 0, 0.125, -0.08);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const rivet = part(
        gun,
        new THREE.CylinderGeometry(0.009, 0.009, 0.008, 6),
        worn,
        side * 0.089,
        0.045,
        -0.02 - i * 0.075,
      );
      rivet.rotation.z = Math.PI / 2;
    }
    part(gun, box(0.025, 0.032, 0.18), worn, side * 0.095, -0.01, -0.24);
  }
  part(gun, box(0.055, 0.035, 0.03), steel, 0.13, 0.01, -0.14);
  part(gun, box(0.03, 0.07, 0.035), worn, 0.17, 0.03, -0.14);
  part(gun, box(0.13, 0.065, 0.18), dark, -0.14, 0.02, -0.15);
  part(gun, armour(0.22, 0.28, 0.26, 0.018), paint, -0.29, -0.1, -0.15);
  part(gun, box(0.235, 0.018, 0.28), worn, -0.29, 0.046, -0.15);
  for (let i = 0; i < 5; i++) {
    const round = part(
      gun,
      new THREE.CylinderGeometry(0.012, 0.012, 0.105, 8),
      brass,
      -0.12 - i * 0.027,
      0.074,
      -0.15,
    );
    round.rotation.x = Math.PI / 2;
    const bullet = part(
      gun,
      new THREE.ConeGeometry(0.012, 0.028, 8),
      worn,
      -0.12 - i * 0.027,
      0.074,
      -0.216,
    );
    bullet.rotation.x = -Math.PI / 2;
  }
  for (const side of [-1, 1]) {
    part(gun, box(0.006, 0.006, 0.43), worn, side * 0.083, 0.092, -0.21);
    part(
      gun,
      armour(0.011, 0.09, 0.19, 0.003),
      receiverSteel,
      side * 0.091,
      -0.04,
      -0.31,
    );
    const pin = part(
      gun,
      new THREE.CylinderGeometry(0.017, 0.017, 0.015, 10),
      worn,
      side * 0.098,
      -0.02,
      -0.32,
    );
    pin.rotation.z = Math.PI / 2;
  }
  // Open support jacket: narrow rings joined by ribs, actual air gaps rather than painted holes.
  for (let i = 0; i < 6; i++)
    part(
      gun,
      new THREE.TorusGeometry(0.047, 0.007, 6, 12),
      steel,
      0,
      0,
      -0.5 - i * 0.075,
    );
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    part(
      gun,
      box(0.011, 0.011, 0.42),
      steel,
      Math.cos(angle) * 0.047,
      Math.sin(angle) * 0.047,
      -0.69,
    );
  }
  const barrel = part(
    gun,
    new THREE.CylinderGeometry(0.023, 0.028, 0.76, 12, 1, true),
    steel,
    0,
    0,
    -1.3,
  );
  barrel.rotation.x = Math.PI / 2;
  part(gun, new THREE.TorusGeometry(0.023, 0.006, 6, 12), worn, 0, 0, -1.68);
  const bore = part(
    gun,
    new THREE.CircleGeometry(0.018, 12),
    dark,
    0,
    0,
    -1.674,
  );
  bore.rotation.y = Math.PI;
  // Rear folding leaf sight and front blade sit below the screen's aiming center.
  part(gun, box(0.026, 0.14, 0.022), steel, 0, 0.15, -0.25);
  part(gun, box(0.085, 0.018, 0.025), worn, 0, 0.21, -0.25);
  part(gun, box(0.014, 0.1, 0.02), steel, 0, 0.075, -1.53);
  // The two grips, butterfly trigger and U-cradle identify the working end.
  for (const side of [-1, 1]) {
    part(gun, box(0.035, 0.17, 0.045), dark, side * 0.12, -0.06, 0.13);
    part(gun, box(0.15, 0.027, 0.035), steel, side * 0.075, 0.025, 0.12);
    part(gun, box(0.025, 0.2, 0.18), paint, side * 0.13, -0.15, -0.24);
    const pivot = part(
      gun,
      new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10),
      worn,
      side * 0.15,
      -0.11,
      -0.24,
    );
    pivot.rotation.z = Math.PI / 2;
  }
  part(gun, box(0.065, 0.06, 0.022), worn, 0, 0, 0.14);
  part(gun, armour(0.28, 0.04, 0.2, 0.008), paint, 0, -0.26, -0.24);
  part(
    gun,
    new THREE.CylinderGeometry(0.037, 0.055, 0.38, 12),
    steel,
    0,
    -0.46,
    -0.24,
  );
  const clamp = part(
    gun,
    new THREE.TorusGeometry(0.065, 0.014, 6, 12),
    paint,
    0,
    -0.5,
    -0.24,
  );
  clamp.rotation.x = Math.PI / 2;
  batchFixedParts(gun);
  return gun;
}
