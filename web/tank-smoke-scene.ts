import * as THREE from "three";
import type { SmokeCloud } from "./tank-smoke";

/** Ray-march each local world volume, including when the observer enters it.
 * The same authority center/radius/deadline drives visibility and presentation. */
export class SmokeScene {
  private clouds = new Map<
    number,
    THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>
  >();
  constructor(private scene: THREE.Scene) {}
  render(clouds: readonly SmokeCloud[], now: number) {
    for (const [id, mesh] of this.clouds)
      if (!clouds.some((c) => c.id === id && now < c.until)) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        this.clouds.delete(id);
      }
    for (const c of clouds) {
      if (now >= c.until) continue;
      let mesh = this.clouds.get(c.id);
      if (!mesh) {
        const material = new THREE.ShaderMaterial({
          side: THREE.DoubleSide,
          transparent: true,
          depthWrite: false,
          uniforms: {
            center: { value: new THREE.Vector3() },
            radius: { value: c.radius },
            phase: { value: now },
          },
          vertexShader: `varying vec3 worldPoint;
            void main() {
              vec4 world = modelMatrix * vec4(position, 1.0);
              worldPoint = world.xyz;
              gl_Position = projectionMatrix * viewMatrix * world;
            }`,
          fragmentShader: `varying vec3 worldPoint;
            uniform vec3 center;
            uniform float radius;
            uniform float phase;
            float billow(vec3 p) {
              return 0.5 + 0.5 * sin(p.x * 3.1 + sin(p.y * 2.7)) * sin(p.z * 3.7 + p.y * 2.3);
            }
            void main() {
              vec3 ray = normalize(worldPoint - cameraPosition);
              vec3 origin = cameraPosition - center;
              float b = dot(origin, ray);
              float h = b * b - dot(origin, origin) + radius * radius;
              if (h <= 0.0) discard;
              h = sqrt(h);
              float start = max(0.0, -b - h), finish = -b + h;
              float stride = (finish - start) / 4.0;
              float transmission = 1.0;
              vec3 light = vec3(0.0);
              for (int i = 0; i < 4; i++) {
                vec3 q = (origin + ray * (start + (float(i) + 0.5) * stride)) / radius;
                float cloud = billow(q * 2.0 + vec3(0.0, -phase * 0.12, 0.0));
                float fine = 0.5 + 0.5 * sin(q.x * 23.0 + q.y * 17.0) * sin(q.z * 19.0 + phase * 0.025);
                float edge = 1.0 - smoothstep(0.62 + cloud * 0.16, 1.0, length(q));
                float density = edge * (0.6 + cloud * 0.7 + fine * 0.2);
                float absorbed = 1.0 - exp(-density * stride * 2.8);
                float shade = 0.55 + (q.y + 1.0) * 0.11 + cloud * 0.08;
                light += transmission * absorbed * vec3(shade * 1.015, shade, shade * 0.96);
                transmission *= 1.0 - absorbed;
              }
              float alpha = 1.0 - transmission;
              if (alpha < 0.015) discard;
              gl_FragColor = vec4(light / max(alpha, 0.001), alpha);
              #include <tonemapping_fragment>
              #include <colorspace_fragment>
            }`,
        });
        mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), material);
        this.scene.add(mesh);
        this.clouds.set(c.id, mesh);
      }
      mesh.position.set(c.x, c.y, c.z);
      mesh.scale.setScalar(c.radius);
      mesh.material.uniforms.center.value.set(c.x, c.y, c.z);
      mesh.material.uniforms.radius.value = c.radius;
      mesh.material.uniforms.phase.value = now;
    }
  }
}
