import * as THREE from "three";

const vertexShader = /* glsl */ `
  varying vec3 surface;
  varying vec3 eye;
  void main() {
    surface = position;
    eye = inverse(mat3(modelMatrix)) * (cameraPosition - modelMatrix[3].xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Integrate a small luminous volume along the viewing ray. The same flame
// has a foreshortened crown from the sight and a long silhouette in profile.
const fragmentShader = /* glsl */ `
  uniform float phase;
  uniform float seed;
  varying vec3 surface;
  varying vec3 eye;

  float hash(vec3 p) {
    p = fract(p * 0.3183 + vec3(0.21, 0.43, 0.17));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise3(vec3 p) {
    vec3 cell = floor(p), f = fract(p);
    f *= f * (3.0 - 2.0 * f);
    vec4 low = vec4(hash(cell), hash(cell + vec3(1,0,0)),
                    hash(cell + vec3(0,1,0)), hash(cell + vec3(1,1,0)));
    cell.z += 1.0;
    vec4 high = vec4(hash(cell), hash(cell + vec3(1,0,0)),
                     hash(cell + vec3(0,1,0)), hash(cell + vec3(1,1,0)));
    vec4 n = mix(low, high, f.z);
    return mix(mix(n.x, n.y, f.x), mix(n.z, n.w, f.x), f.y);
  }

  void main() {
    vec3 ray = normalize(surface - eye);
    // surface is the back face. Find the front face along the reverse ray.
    vec3 bounds = vec3(0.77, 0.77, 0.94);
    vec3 centered = surface + vec3(0, 0, 0.90);
    vec3 distances = (bounds + sign(ray) * centered) / max(abs(ray), vec3(0.00001));
    float stepLength = min(distances.x, min(distances.y, distances.z)) / 20.0;
    float body = 0.0, core = 0.0;
    for (int i = 0; i < 20; i++) {
      vec3 p = surface - ray * (float(i) + 0.5) * stepLength;
      float axial = -p.z / (1.30 + 0.40 * sin(phase * 3.14));
      if (axial <= 0.0 || axial >= 1.0) continue;
      vec3 coord = vec3(p.xy * 5.2, axial * 3.2 - phase * 1.8) + seed;
      float eddy = noise3(coord) + 0.42 * noise3(coord * 2.7);
      float radius = 0.075 + 0.35 * sin(3.14159 * pow(axial, 0.82));
      vec2 bend = vec2(sin(axial * 8.0 + seed), cos(axial * 6.0 - seed)) * axial * 0.10;
      vec2 crossSection = p.xy - bend;
      float angle = atan(crossSection.y, crossSection.x + 0.00001);
      float tongues = 0.81 + 0.22 * sin(3.0 * angle + 8.0 * axial + seed)
                           + 0.13 * cos(5.0 * angle - 6.0 * axial + phase);
      float radial = length(crossSection) / (radius * tongues);
      float skin = 1.0 - smoothstep(0.46, 1.03, radial + 1.20 * (eddy - 0.71));
      float ends = smoothstep(0.0, 0.07, axial) * (1.0 - smoothstep(0.68, 1.0, axial));
      float wisps = smoothstep(0.18, 0.92, eddy + 0.26 * (1.0 - radial));
      body += skin * ends * wisps * stepLength;
      core += max(0.0, 1.0 - radial * 1.65) * ends * (1.0 - axial) * stepLength;
    }
    float glow = 1.0 - exp(-5.2 * body);
    float heat = 1.0 - exp(-12.0 * core);
    vec3 color = mix(vec3(1.0, 0.18, 0.024), vec3(1.0, 0.61, 0.16), glow);
    color = mix(color, vec3(1.0, 0.97, 0.80), heat);
    gl_FragColor = vec4(color, glow * (1.0 - smoothstep(0.13, 1.0, phase)));
    #include <colorspace_fragment>
  }
`;

export function cannonFlame() {
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { phase: { value: 0 }, seed: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    toneMapped: false,
  });
  const geometry = new THREE.BoxGeometry(1.54, 1.54, 1.88);
  geometry.translate(0, 0, -0.9);
  return new THREE.Mesh(geometry, material);
}
