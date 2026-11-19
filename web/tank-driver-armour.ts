import * as THREE from "three";
import { DRIVER_VIEW } from "./tank-driver-view";
import { weather } from "./tank-weathering";

/**
 * The driver's direct-vision block, styled after period footage: a dark
 * interior, a narrow horizontal slit of thick, dirty glass with bright
 * chromed end caps, and the blurred ghosts of the prism's other faces above
 * and below. The clear opening keeps DRIVER_VIEW's angles exactly, because
 * scouting uses the same restriction.
 */
export function buildDriverArmour(camera: THREE.PerspectiveCamera) {
  const far = DRIVER_VIEW.openingDistance;
  const near = far - DRIVER_VIEW.armourDepth;
  const x = far * Math.tan(DRIVER_VIEW.horizontalFov / 2);
  const y = far * Math.tan(DRIVER_VIEW.verticalFov / 2);
  const nearX = x + 0.05;
  const nearY = y + 0.05;
  const material = new THREE.MeshStandardMaterial({
    color: 0x0d0f13,
    roughness: 0.92,
    metalness: 0.35,
    emissive: 0x05070a,
    emissiveIntensity: 1,
  });
  const armour = new THREE.Group();
  const corners = (width: number, height: number, z: number) => [
    [-width, -height, -z],
    [width, -height, -z],
    [width, height, -z],
    [-width, height, -z],
  ];
  const rings = [
    ...corners(nearX, nearY, near),
    ...corners(x, y, far),
    ...corners(4, 3, near),
    ...corners(4, 3, far),
  ];
  const vertices: number[] = [];
  function quad(a: number, b: number, c: number, d: number) {
    for (const index of [a, b, c, a, c, d]) vertices.push(...rings[index]);
  }
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    quad(i, next, next + 4, i + 4); // the visible thickness of the opening
    quad(i + 8, next + 8, next, i); // the near interior plate
    quad(i + 4, next + 4, next + 12, i + 12);
    quad(i + 12, next + 12, next + 8, i + 8);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.computeVertexNormals();
  // Both surfaces remain opaque even at the eye's extreme viewport aspect ratios.
  material.side = THREE.DoubleSide;
  const frame = new THREE.Mesh(geometry, material);
  frame.receiveShadow = true;
  armour.add(frame);

  // Thick armoured glass: grime, chips and a chrome rim with rounded ends.
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(x * 2, y * 2),
    new THREE.MeshBasicMaterial({
      map: glassTexture(x / y),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  glass.position.z = -(far - 0.004);
  glass.renderOrder = 10;
  armour.add(glass);

  // Ghost reflections of the prism's other faces, softly lit from outside.
  const ghostMap = ghostTexture();
  for (const side of [-1, 1]) {
    const ghost = new THREE.Mesh(
      new THREE.PlaneGeometry(x * 2.05, y * 0.85),
      new THREE.MeshBasicMaterial({
        map: ghostMap,
        transparent: true,
        depthWrite: false,
        opacity: 0.55,
        toneMapped: false,
      }),
    );
    ghost.position.set(0, side * (nearY + y * 0.85), -(near - 0.004));
    ghost.renderOrder = 11;
    armour.add(ghost);
  }

  armour.add(buildFenders());

  const workLight = new THREE.PointLight(0x9fb2c8, 0.25, 2, 2);
  workLight.position.set(-0.18, 0.3, -0.1);
  armour.add(workLight);
  camera.add(armour);
}

/**
 * Front track guards with their headlight brush guards, seen low in the
 * slit. Their outer edges are exactly the tank's outer edges (the eye sits
 * left of the centreline, like the real driver's seat), and they reach far
 * enough ahead that both edges show in full: the gap between them is the
 * width the tank needs.
 */
function buildFenders() {
  const { halfWidth, nose } = DRIVER_VIEW.hull;
  const eye = DRIVER_VIEW.eye.height;
  // Hull edges measured from the eye, not the centreline.
  const left = -halfWidth - DRIVER_VIEW.eye.right;
  const right = halfWidth - DRIVER_VIEW.eye.right;
  const reach = 1.45; // how far the guards stand out past the glacis
  const group = new THREE.Group();
  const paint = weather(
    new THREE.MeshStandardMaterial({
      color: 0x4b5437,
      roughness: 0.82,
      metalness: 0.25,
    }),
    0.37,
  );
  const edge = new THREE.MeshStandardMaterial({
    color: 0x9a9d8c,
    roughness: 0.4,
    metalness: 0.85,
  });
  const lens = new THREE.MeshStandardMaterial({
    color: 0xd8d2b8,
    roughness: 0.2,
    metalness: 0.1,
    emissive: 0x2a2618,
  });
  const bevel = 0.015;
  const top = 1.45 - eye;
  const drop = 0.2;
  const tip = nose + reach;
  // Side profile (distance ahead, height relative to the eye), extruded across the guard.
  const profile = new THREE.Shape();
  profile.moveTo(nose - 0.2, -eye + 0.6);
  profile.lineTo(nose - 0.2, top);
  profile.lineTo(tip - 0.15, top - drop);
  profile.lineTo(tip, top - drop - 0.17);
  profile.lineTo(tip - 0.08, -eye + 0.6);
  profile.closePath();
  const slope = Math.atan2(drop, reach + 0.05);
  for (const [from, to, outer] of [
    [left, left + 0.42, left],
    [right - 0.42, right, right],
  ]) {
    const width = to - from;
    // The bevel grows the solid outward; keep its outer face on the hull edge.
    const geometry = new THREE.ExtrudeGeometry(profile, {
      depth: width - bevel * 2,
      bevelEnabled: true,
      bevelSize: bevel,
      bevelThickness: bevel,
      bevelSegments: 2,
    });
    geometry.rotateY(Math.PI / 2);
    const guard = new THREE.Mesh(geometry, paint);
    guard.position.x = from + bevel;
    guard.castShadow = guard.receiveShadow = true;
    group.add(guard);
    // Bright worn lip on the outer top edge: the line that marks the tank's width.
    const lipLength = reach + 0.05;
    const lip = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.03, lipLength),
      edge,
    );
    lip.position.set(
      outer - Math.sign(outer - (from + width / 2)) * 0.02,
      top - drop / 2 + 0.012,
      -(nose - 0.2 + lipLength / 2 + 0.1),
    );
    lip.rotation.x = slope;
    group.add(lip);
    // Headlight in its brush guard near the tip.
    const x = from + width / 2;
    const lampAt = tip - 0.55;
    const lampTop = top - drop * ((lampAt - nose + 0.2) / (reach + 0.05));
    const lamp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.1, 0.12, 16),
      paint,
    );
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(x, lampTop + 0.08, -lampAt);
    group.add(lamp);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.075, 16), lens);
    glass.position.set(x, lampTop + 0.08, -(lampAt + 0.065));
    group.add(glass);
    const hoop = new THREE.Mesh(
      new THREE.TorusGeometry(0.15, 0.014, 6, 14, Math.PI),
      edge,
    );
    hoop.position.set(x, lampTop, -(lampAt + 0.09));
    group.add(hoop);
  }
  return group;
}

function glassTexture(aspect: number) {
  const w = 1024;
  const h = Math.max(64, Math.round(w / aspect));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext("2d")!;
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // Cold grey haze over the whole pane.
  c.fillStyle = "rgba(196, 206, 214, 0.06)";
  c.fillRect(0, 0, w, h);
  // Edges darken into the frame.
  const fade = (x0: number, y0: number, x1: number, y1: number) => {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "rgba(6, 8, 12, 0.85)");
    g.addColorStop(1, "rgba(6, 8, 12, 0)");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  };
  fade(0, 0, 0, h * 0.14);
  fade(0, h, 0, h * 0.86);
  fade(0, 0, w * 0.035, 0);
  fade(w, 0, w * 0.965, 0);
  // Grime: dark specks and a few clusters, heavier near the edges.
  for (let i = 0; i < 520; i++) {
    const px = rand() * w;
    const edge = rand() < 0.5 ? rand() * 0.2 : rand();
    const py = (rand() < 0.5 ? edge : 1 - edge) * h;
    const r = 0.6 + rand() * rand() * 3.2;
    c.fillStyle = `rgba(18, 18, 20, ${0.35 + rand() * 0.5})`;
    c.beginPath();
    c.arc(px, py, r, 0, Math.PI * 2);
    c.fill();
  }
  // Smudges and water marks.
  for (let i = 0; i < 18; i++) {
    const px = rand() * w,
      py = rand() * h,
      r = 20 + rand() * 70;
    const g = c.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, `rgba(230, 236, 240, ${0.05 + rand() * 0.07})`);
    g.addColorStop(1, "rgba(230, 236, 240, 0)");
    c.fillStyle = g;
    c.fillRect(px - r, py - r, r * 2, r * 2);
  }
  // Fine scratches.
  c.strokeStyle = "rgba(255, 255, 255, 0.09)";
  c.lineWidth = 1;
  for (let i = 0; i < 14; i++) {
    const px = rand() * w,
      py = rand() * h;
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(px + (rand() - 0.5) * 120, py + (rand() - 0.5) * 30);
    c.stroke();
  }
  // Chrome rim: thin bright top and bottom lines, rounded end caps.
  const rim = (yy: number) => {
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "rgba(255,255,255,0.7)");
    g.addColorStop(0.08, "rgba(220,228,236,0.25)");
    g.addColorStop(0.92, "rgba(220,228,236,0.25)");
    g.addColorStop(1, "rgba(255,255,255,0.7)");
    c.fillStyle = g;
    c.fillRect(0, yy, w, 2);
  };
  rim(1);
  rim(h - 3);
  for (const side of [0, 1]) {
    const cx = side ? w - 6 : 6;
    const g = c.createLinearGradient(cx - 6, 0, cx + 6, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,255,255,0.9)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(cx, h / 2, 5, h * 0.42, 0, 0, Math.PI * 2);
    c.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function ghostTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 64;
  const c = canvas.getContext("2d")!;
  const g = c.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, "rgba(150, 170, 190, 0)");
  g.addColorStop(0.35, "rgba(170, 188, 205, 0.55)");
  g.addColorStop(0.6, "rgba(200, 212, 224, 0.75)");
  g.addColorStop(1, "rgba(150, 170, 190, 0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 512, 64);
  // Fade the ends so the bands read as out-of-focus reflections.
  const ends = c.createLinearGradient(0, 0, 512, 0);
  ends.addColorStop(0, "rgba(0,0,0,1)");
  ends.addColorStop(0.12, "rgba(0,0,0,0)");
  ends.addColorStop(0.88, "rgba(0,0,0,0)");
  ends.addColorStop(1, "rgba(0,0,0,1)");
  c.globalCompositeOperation = "destination-out";
  c.fillStyle = ends;
  c.fillRect(0, 0, 512, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
